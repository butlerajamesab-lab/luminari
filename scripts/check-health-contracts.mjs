#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const index = readFileSync('server/_core/index.ts', 'utf8');
const diagnostic = readFileSync('server/_core/health-diagnostics.ts', 'utf8');
const systemRouter = readFileSync('server/_core/systemRouter.ts', 'utf8');
const context = readFileSync('server/_core/context.ts', 'utf8');
const userCache = readFileSync('server/_core/user-cache.ts', 'utf8');

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
if (!index.includes('app.get(["/api/db-diagnostic", "/api/system/health"]')) fail('legacy deep diagnostic routes must be explicitly closed');
if (!index.includes('diagnostic_not_public')) fail('closed diagnostic routes must return a bounded public-safe error');
if (index.includes('sendDatabaseDiagnostic')) fail('Express entrypoint must not expose the deep diagnostic sender');
if (!systemRouter.includes('health: adminProcedure.query(() => getDatabaseDiagnostic())')) fail('deep tRPC diagnostic must require adminProcedure');
if (systemRouter.includes('health: publicProcedure.query(() => getDatabaseDiagnostic())')) fail('deep tRPC diagnostic must not use publicProcedure');

if (!context.includes('function sanitizeAuthLogDetails')) fail('authentication log sanitizer is missing');
if (!context.includes('console.warn("[CONTEXT] auth_context_event", sanitizeAuthLogDetails')) fail('authentication events must pass through the log sanitizer');
if (!context.includes('"[CONTEXT] Slow context auth lookup",\n    sanitizeAuthLogDetails')) fail('slow authentication diagnostics must pass through the log sanitizer');
if (context.includes('console.warn("[CONTEXT] auth_context_event", { event, ...details })')) fail('raw authentication details must not be logged');
if (userCache.includes('cache_key: normalized')) fail('authentication cache keys must not be logged');
if (!userCache.includes('lookup_key_kind')) fail('authentication cache diagnostics must retain only key classification');

if (context.includes('x-lighthouse-inspection-mode')) fail('request headers must never activate an inspection administrator identity');
if (context.includes('VITE_LIGHTHOUSE_INSPECTION_MODE')) fail('client-exposed environment variables must never activate inspection identity');
if (context.includes('isLighthouseInspectionMode(opts.req)')) fail('request state must not participate in inspection identity activation');
if (!context.includes('process.env.NODE_ENV !== "production"')) fail('inspection identity must fail closed in production');
if (!context.includes('process.env.LIGHTHOUSE_INSPECTION_MODE === "true"')) fail('non-production inspection identity requires an explicit server-only flag');

console.log('health diagnostic and authentication runtime security contracts passed');
