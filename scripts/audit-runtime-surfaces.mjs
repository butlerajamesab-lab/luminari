#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceExtRe = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ignoredPathRe = /(^|\/)(node_modules|dist|coverage|\.git)(\/|$)|\.map$/;

const scanRoots = ['client/src', 'server'];
const findings = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll(path.sep, '/');
    if (ignoredPathRe.test(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (sourceExtRe.test(rel)) out.push(rel);
  }
  return out;
}

function add(file, line, category, text) {
  findings.push({ file, line, category, text: text.trim() });
}

function scanFile(file) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/refetchInterval\s*:/.test(line)) add(file, index + 1, 'client_polling_trpc', line);
    if (/setInterval\s*\(/.test(line)) add(file, index + 1, 'client_polling_timer', line);
    if (/fetch\s*\(\s*[`'"]\/api\//.test(line)) add(file, index + 1, 'client_direct_rest', line);
    if (/app\.use\s*\(\s*[`'"]\/api\//.test(line)) add(file, index + 1, 'server_runtime_mount', line);
    if (/app\.(get|post|put|patch|delete|all)\s*\(\s*[`'"]\/api\//.test(line)) add(file, index + 1, 'server_runtime_route', line);
    if (/getPool\s*\(\)|pool\.query\s*\(|pool\.connect\s*\(|query_with_diagnostics\s*\(/.test(line)) add(file, index + 1, 'server_db_touch', line);
  });
}

for (const scanRoot of scanRoots) {
  for (const file of walk(path.join(root, scanRoot))) scanFile(file);
}

const byCategory = new Map();
for (const finding of findings) byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);

console.log('Runtime surface audit');
for (const [category, count] of [...byCategory.entries()].sort()) console.log(`- ${category}: ${count}`);
console.log('');
for (const finding of findings) {
  console.log(`${finding.category}\t${finding.file}:${finding.line}\t${finding.text}`);
}
