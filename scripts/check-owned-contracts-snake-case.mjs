#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scan_roots = ['server/routes', 'server/_core', 'server/routers', 'shared', 'supabase/migrations'];
const ignored_path_re = /(^|\/)(node_modules|dist|coverage|\.git)(\/|$)|\.map$/;
const source_ext_re = /\.(ts|tsx|js|jsx|mjs|cjs|sql)$/;
const camel_name_re = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const boundary_file_re = /^(server\/(routes|routers|_core)|shared|supabase\/migrations)\//;

const required_forbidden = [
  'foreignKeys','sourceTables','definitionLength','hasJoins','hasUnion','rawDefinitions','tableCounts',
  'hydrationChain','knownIssues','camelCaseColumns','rlsSecurity','disabledTables','canonicalPattern',
  'contactTables','blobColumns','totalDriftIssues','suffixContamination','polymorphicContact',
  'serializedFields','emptyTables','frontendRoutes','backendMounts','rowCount','tableName','openId',
  'loginMethod','createdAt','updatedAt','lastSignedIn','supabaseProject','publicTables','databaseUrl',
  'databaseVersion','dbDiagnostic','userFound'
];

const allowlist = [
  { file: 'server/routers/governance-router.ts', pattern: /tableName: z\.enum\(/, reason: 'legacy UI input schema, not response payload' },
  { file: 'server/routers/governance-router.ts', pattern: /tableName: input\.tableName/, reason: 'legacy internal hook input passthrough' },
  { file: 'server/routers/session76-router.ts', pattern: /\.input\(z\.object\(\{ tableName: z\.string\(\) \}\)\)/, reason: 'legacy UI input schema, not response payload' },
  { file: 'server/_core/user-resolver.ts', pattern: /const USER_SELECT = `select id, open_id as "openId"/, reason: 'legacy drizzle User mapper boundary; internal DB compatibility only' },
  { file: 'supabase/migrations/20260528_runtime_hotfix_sync.sql', pattern: /compat\.detected_signals_base.*"createdAt"/, reason: 'explicit compat schema view for legacy consumers' },
];
const findings = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll(path.sep, '/');
    if (ignored_path_re.test(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (source_ext_re.test(rel)) out.push(rel);
  }
  return out;
}
function is_allowed(file, line) { return allowlist.some((entry) => entry.file === file && entry.pattern.test(line)); }
function add(file, line, reason, text) { if (!is_allowed(file, text)) findings.push({ file, line, reason, text: text.trim() }); }
function mask_comments(line) { return line.replace(/\/\/.*$/, ''); }
function in_boundary_context(line) { return /\b(res\.json|res\.send|reply\.send|ctx\.json|return|JSON\.stringify)\b|\.input\(z\.object/.test(line); }

function scan_required_tokens(file, lines) {
  for (const [i, raw_line] of lines.entries()) {
    const line = mask_comments(raw_line);
    for (const token of required_forbidden) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const key_re = new RegExp(`(?:^|[,{\\s])(?:["'\`])?${escaped}(?:["'\`])?\\s*:`, 'g');
      const alias_re = new RegExp(`\\bas\\s+(?:["'\`])?${escaped}(?:["'\`])?\\b`, 'i');
      if (key_re.test(line) && in_boundary_context(line)) add(file, i + 1, `owned contract exposes forbidden camelCase key "${token}"`, raw_line);
      if (alias_re.test(line)) add(file, i + 1, `SQL alias exposes forbidden camelCase key "${token}"`, raw_line);
    }
  }
}

function scan_sql_aliases(file, lines) {
  for (const [i, raw_line] of lines.entries()) {
    const line = mask_comments(raw_line);
    if (!/(select|SELECT|sql`|\.query\(|\.execute\()/i.test(line)) continue;
    const alias_re = /\bas\s+(?:["'`])?([A-Za-z_][A-Za-z0-9_]*)(?:["'`])?/gi;
    for (const match of line.matchAll(alias_re)) {
      if (camel_name_re.test(match[1])) add(file, i + 1, `SQL alias exposes camelCase owned key "${match[1]}"`, raw_line);
    }
  }
}

function scan_system_visibility_response_keys(file, lines) {
  if (file !== 'server/routes/system-visibility-router.ts') return;
  let active = false;
  let depth = 0;
  for (const [i, raw_line] of lines.entries()) {
    const line = mask_comments(raw_line);
    if (!active && /\bres\.json\s*\(\s*\{/.test(line)) { active = true; depth = 0; }
    if (!active) continue;
    const key_re = /(?:^|[,{\s])(?:["'`])?([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?:["'`])?\s*:/g;
    for (const match of line.matchAll(key_re)) add(file, i + 1, `owned system visibility response exposes camelCase key "${match[1]}"`, raw_line);
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (active && depth <= 0 && /[});]/.test(line)) active = false;
  }
}

const files = scan_roots.flatMap((scan_root) => walk(path.join(root, scan_root))).filter((file) => boundary_file_re.test(file));
for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = content.split(/\r?\n/);
  scan_required_tokens(file, lines);
  scan_sql_aliases(file, lines);
  scan_system_visibility_response_keys(file, lines);
}
if (findings.length) {
  console.error(`Owned contract snake_case guard: found ${findings.length} camelCase owned contract exposure(s).`);
  for (const finding of findings.slice(0, 250)) console.error(`- ${finding.file}:${finding.line}: ${finding.reason}: ${finding.text}`);
  if (findings.length > 250) console.error(`... ${findings.length - 250} more`);
  process.exit(1);
}
console.log('Owned contract snake_case guard: no camelCase owned contract exposures found.');
