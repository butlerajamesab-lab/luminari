#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');

const scanRoots = ['server', 'shared'];
const ignoredPathRe = /(^|\/)(node_modules|dist|coverage|docs|reports|\.git)(\/|$)|\.map$|\.md$|\.original$|\.bad-join$/;
const sourceExtRe = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const camelNameRe = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;

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

function add(file, line, reason, text) {
  findings.push({ file, line, reason, text: text.trim() });
}

function scanSql(file, lines) {
  const sqlAliasRe = /\bas\s+(?:["'`])?([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?:["'`])?/gi;
  lines.forEach((line, i) => {
    if (!/(sql`|SELECT|select|\.query\(|\.execute\()/i.test(line)) return;
    for (const match of line.matchAll(sqlAliasRe)) {
      if (camelNameRe.test(match[1])) add(file, i + 1, `SQL alias exposes camelCase \"${match[1]}\"`, line);
    }
  });
}

function scanSupabaseSelects(file, content) {
  const selectRe = /\.select\(\s*([`'"])([\s\S]*?)\1\s*\)/g;
  for (const match of content.matchAll(selectRe)) {
    const selected = match[2];
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    for (const token of selected.split(/[\s,]+/)) {
      const alias = token.match(/:?([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];
      if (alias && camelNameRe.test(alias)) {
        add(file, line, `Supabase select exposes camelCase column/key "${alias}"`, match[0].replace(/\s+/g, ' '));
      }
    }
  }
}

function scanBoundaryObjectKeys(file, lines) {
  if (!file.startsWith('server/routers/') && !file.endsWith('server/routers.ts')) return;
  let inReturnObject = false;
  let depth = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const startsBoundaryReturn = /\breturn\s+\{/.test(trimmed) || /\b(json|send)\s*\(\s*\{/.test(trimmed);
    if (startsBoundaryReturn) inReturnObject = true;

    if (inReturnObject) {
      const keyRe = /(?:^|[,\s{])(?:["'`])?([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?:["'`])?\s*:/g;
      for (const match of line.matchAll(keyRe)) {
        add(file, i + 1, `returned/API object exposes camelCase key "${match[1]}"`, line);
      }
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (depth <= 0 && /[};)]/.test(trimmed)) {
        inReturnObject = false;
        depth = 0;
      }
    }

    if (/\b(JSON\.stringify|fetch|axios\.|body:)\b/.test(line)) {
      const keyRe = /(?:^|[,\s{])(?:["'`])?([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?:["'`])?\s*:/g;
      for (const match of line.matchAll(keyRe)) {
        add(file, i + 1, `JSON/request payload exposes camelCase key "${match[1]}"`, line);
      }
    }
  });
}

const files = scanRoots.flatMap((scanRoot) => walk(path.join(root, scanRoot)));
for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = content.split(/\r?\n/);
  scanSql(file, lines);
  scanSupabaseSelects(file, content);
  scanBoundaryObjectKeys(file, lines);
}

if (findings.length === 0) {
  console.log('Runtime camelCase audit: no likely public DB/API camelCase exposures found.');
} else {
  console.log(`Runtime camelCase audit: found ${findings.length} likely public DB/API camelCase exposure(s).`);
  for (const finding of findings.slice(0, 250)) {
    console.log(`- ${finding.file}:${finding.line}: ${finding.reason}: ${finding.text}`);
  }
  if (findings.length > 250) console.log(`... ${findings.length - 250} more`);
}

if (strict && findings.length > 0) process.exit(1);
