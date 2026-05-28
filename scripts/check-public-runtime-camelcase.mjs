import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') && f >= '20260528')
  .map(f => path.join(migrationsDir, f));

const allowlist = new Set(['createdAt']);
const offenders = [];
const quotedCamel = /"([A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)"/g;
const bareCamel = /\b([a-z][a-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g;

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inPublicView = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (lower.includes('create or replace view public.')) inPublicView = true;
    else if (lower.includes('create or replace view compat.') || lower.includes('create or replace view ') || lower.includes('create view ')) inPublicView = false;
    if (!inPublicView) continue;
    for (const m of line.matchAll(quotedCamel)) {
      const t = m[1]; if (!allowlist.has(t)) offenders.push(`${path.relative(process.cwd(), file)}:${i+1}: quoted ${t}`);
    }
    for (const m of line.matchAll(bareCamel)) {
      const t = m[1]; if (!allowlist.has(t)) offenders.push(`${path.relative(process.cwd(), file)}:${i+1}: bare ${t}`);
    }
  }
}

if (offenders.length) { console.error('Disallowed NEW camelCase identifiers in public view definitions:'); offenders.forEach(o=>console.error(`- ${o}`)); process.exit(1);}
console.log('OK: no disallowed NEW camelCase identifiers in public view definitions.');
