#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const index = readFileSync('server/_core/index.ts', 'utf8');
const diagnostic = readFileSync('server/_core/health-diagnostics.ts', 'utf8');
const systemRouter = readFileSync('server/_core/systemRouter.ts', 'utf8');
const context = readFileSync('server/_core/context.ts', 'utf8');
const compatibilityAuthHook = readFileSync('client/src/_core/hooks/useAuth.ts', 'utf8');
const userCache = readFileSync('server/_core/user-cache.ts', 'utf8');
const expressAdmin = readFileSync('server/_core/express-admin-middleware.ts', 'utf8');
const trpcServiceAdmin = readFileSync('server/_core/trpc-service-admin-middleware.ts', 'utf8');
const routers = readFileSync('server/routers.ts', 'utf8');
const publicAdminMaintenance = readFileSync('server/routers/public-admin-maintenance.ts', 'utf8');
const debugDb = readFileSync('server/routers/debug-db.ts', 'utf8');
const sunam = readFileSync('server/routers/sunam.ts', 'utf8');

const required_liveness = ['ok', 'runtime', 'service', 'supabase_project', 'timestamp'];
const forbidden_liveness = ['supabaseProject', 'publicTables', 'databaseUrl', 'dbDiagnostic', 'database_version', 'public_tables', 'database', 'db_diagnostic'];
const required_diagnostic = ['database', 'database_url', 'database_version', 'public_tables', 'db_diagnostic', 'supabase_project', 'timestamp'];

function fail(message) { console.error(message); process.exit(1); }
if (!index.includes('app.get("/api/health"')) fail('/api/health route is missing');
if (!index.includes('livenessPayload()')) fail('/api/health must use livenessPayload');
for (const field of required_liveness) if (!diagnostic.includes(field)) fail(`liveness field missing: ${field}`);
for (const field of forbidden_liveness) {
  const liveness_section = diagnostic.slice(diagnostic.indexOf('export function livenessPayload'), diagnostic.indexOf('function sanitizeError'));
  if (liveness_section.includes(field)) fail(`/api/health liveness contains forbidden diagnostic/camel field: ${field}`);
}
if (diagnostic.includes('supabaseProject')) fail('stub camelCase supabaseProject must fail contract check');
for (const field of required_diagnostic) if (!diagnostic.includes(field)) fail(`diagnostic field missing: ${field}`);

// Deep diagnostics are required by the existing Mission Control UI, but they
// must remain behind the canonical administrator boundary. Public liveness
// stays separate at /api/health.
if (!index.includes('app.get("/api/db-diagnostic", requireExpressAdmin')) fail('/api/db-diagnostic must be restored behind requireExpressAdmin');
if (!index.includes('buildAdminDatabaseDiagnostic()')) fail('/api/db-diagnostic must use the bounded administrator diagnostic builder');
if (index.includes('app.get("/api/db-diagnostic", async')) fail('/api/db-diagnostic must not be mounted without an administrator gate');
if (!index.includes('app.use("/api/system", requireExpressAdmin, systemVisibilityRouter)')) fail('/api/system visibility routes must require an administrator');
if (index.includes('app.use("/api/system", systemVisibilityRouter)')) fail('/api/system must not be mounted without an administrator gate');
if (index.includes('diagnostic_not_public')) fail('legacy 404-only diagnostic stub must not replace the authenticated Mission Control contract');
if (index.includes('sendDatabaseDiagnostic')) fail('Express entrypoint must not expose the legacy deep diagnostic sender');
if (!systemRouter.includes('health: adminProcedure.query(() => getDatabaseDiagnostic())')) fail('deep tRPC diagnostic must require adminProcedure');
if (systemRouter.includes('health: publicProcedure.query(() => getDatabaseDiagnostic())')) fail('deep tRPC diagnostic must not use publicProcedure');

if (!context.includes('function sanitizeAuthLogDetails')) fail('authentication log sanitizer is missing');
if (!context.includes('console.warn("[CONTEXT] auth_context_event", sanitizeAuthLogDetails')) fail('authentication events must pass through the log sanitizer');
if (!context.includes('"[CONTEXT] Slow context auth lookup",\n    sanitizeAuthLogDetails')) fail('slow authentication diagnostics must pass through the log sanitizer');
if (context.includes('console.warn("[CONTEXT] auth_context_event", { event, ...details })')) fail('raw authentication details must not be logged');
if (userCache.includes('cache_key: normalized')) fail('authentication cache keys must not be logged');
if (!userCache.includes('lookup_key_kind')) fail('authentication cache diagnostics must retain only key classification');

for (const marker of [
  'LIGHTHOUSE_INSPECTION_MODE',
  'inspection_user',
  'temporary_lighthouse_inspection_mode',
  'createInspectionUser',
  'auth_status: "inspection_mode"',
]) {
  if (context.includes(marker)) fail(`retired synthetic inspection identity remains in the server auth context: ${marker}`);
}
if (!compatibilityAuthHook.includes('export { useAuth } from "@/core/hooks/useAuth"')) fail('legacy auth imports must resolve to canonical Supabase authentication');
if (compatibilityAuthHook.includes('previewUser') || compatibilityAuthHook.includes('isInspectionMode')) fail('legacy auth compatibility must not manufacture a preview identity');

if (!index.includes('import { requireExpressAdmin } from "./express-admin-middleware"')) fail('Express administrator middleware must be imported');
if (!expressAdmin.includes('resolve_user_for_procedure')) fail('Express administrator gate must resolve the canonical runtime user');
if (!expressAdmin.includes('user.role !== "admin"')) fail('Express administrator gate must enforce the admin role');
if (!expressAdmin.includes('status(401)') || !expressAdmin.includes('status(403)') || !expressAdmin.includes('status(503)')) fail('Express administrator gate must fail closed for missing, forbidden, and unavailable auth states');
if (expressAdmin.includes('supabase_user_id') || expressAdmin.includes('supabase_email')) fail('Express administrator gate must not log or return account identifiers');

if (!index.includes('import { requireAdminForServiceTrpcOperations } from "./trpc-service-admin-middleware"')) fail('service tRPC administrator middleware must be imported');
const trpcMount = index.indexOf('app.use(\n    "/api/trpc"');
const trpcGate = index.indexOf('requireAdminForServiceTrpcOperations', trpcMount);
const trpcAdapter = index.indexOf('createExpressMiddleware({ router: appRouter, createContext })', trpcMount);
if (trpcMount < 0 || trpcGate < 0 || trpcAdapter < 0 || !(trpcMount < trpcGate && trpcGate < trpcAdapter)) fail('/api/trpc service administrator gate must run before the tRPC adapter');
if (!trpcServiceAdmin.includes('return requireExpressAdmin(req, res, next)')) fail('service tRPC boundary must reuse the canonical Express administrator gate');
if (!trpcServiceAdmin.includes('decodeProcedurePath(rawPath)') || !trpcServiceAdmin.includes('.split(",")')) fail('service tRPC boundary must decode and inspect every batched procedure path');

const requiredServiceNamespaces = [
  'activation',
  'debugDb',
  'fullRegistryIngest',
  'integrationTest',
  'phase2CleanPacket',
  'phase2PacketLoader',
  'registryCanonicalIngest',
  'resourceVerification',
  'scaledRegistryIngest',
  'setup',
  'spineVerification',
  'sunam',
  'sunamGatedIngest',
];
for (const namespace of requiredServiceNamespaces) {
  if (!trpcServiceAdmin.includes(`"${namespace}"`)) fail(`service tRPC administrator namespace missing: ${namespace}`);
}

const legacyServiceOperations = [
  [routers, 'spineVerification: router({', 'spine verification'],
  [routers, 'phase2PacketLoader: router({', 'phase 2 packet load'],
  [routers, 'sunamGatedIngest: router({', 'Sunam-gated ingestion'],
  [routers, 'fullRegistryIngest: router({', 'full registry ingestion'],
  [routers, 'scaledRegistryIngest: router({', 'scaled registry ingestion'],
  [routers, 'integrationTest: router({', 'integration test execution'],
  [publicAdminMaintenance, 'backfillConfidenceScores: publicProcedure', 'database maintenance backfill'],
  [debugDb, 'connectionStatus: publicProcedure', 'database connection diagnostics'],
  [sunam, 'enrichForm: publicProcedure', 'Sunam signal enrichment'],
];
for (const [source, marker, label] of legacyServiceOperations) {
  if (!source.includes(marker)) fail(`expected legacy service operation disappeared without contract review: ${label}`);
}

console.log('health diagnostic and authentication runtime security contracts passed');
