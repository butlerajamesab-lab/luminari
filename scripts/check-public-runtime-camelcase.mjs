import fs from 'node:fs';
import path from 'node:path';

const TARGET_FILES = [
  path.join(process.cwd(), 'supabase', 'migrations', '20260528_runtime_hotfix_sync.sql'),
];
const allowlist = new Set(['"createdAt"']);
const camelRegex = /"[A-Za-z0-9_]*[a-z]+[A-Z][A-Za-z0-9_]*"/g;
const offenders = [];

for (const file of TARGET_FILES) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inPublicView = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower.includes('create or replace view public.')) inPublicView = true;
    else if (lower.includes('create or replace view compat.') || lower.includes('create schema')) inPublicView = false;

    if (!inPublicView) continue;
    for (const m of line.match(camelRegex) || []) {
      if (!allowlist.has(m)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${m}`);
    }
  }
}

if (offenders.length) {
  console.error('Disallowed new camelCase identifiers in public view definitions:');
  offenders.forEach(o => console.error(`- ${o}`));
  process.exit(1);
}

console.log('OK: no disallowed NEW camelCase identifiers in synced runtime migration.');
