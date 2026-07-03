#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const index = readFileSync('server/_core/index.ts', 'utf8');
const diagnostic = readFileSync('server/_core/health-diagnostics.ts', 'utf8');

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
if (!index.includes('app.get("/api/db-diagnostic"') || !index.includes('sendDatabaseDiagnostic(res)')) fail('/api/db-diagnostic must use shared diagnostic sender');
if (!index.includes('app.get("/api/system/health"') || !index.includes('sendDatabaseDiagnostic(res)')) fail('/api/system/health must use shared diagnostic sender');
console.log('health diagnostic contracts passed');
