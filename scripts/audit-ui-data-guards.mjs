#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const files = execFileSync('rg', ['--files', 'client/src', '-g', '*.{ts,tsx}'], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.endsWith('client/src/lib/data-guard.ts'));

const risky = [
  { name: 'queryDataArrayMethod', re: /\b\w+(?:Q|Query|Mut|Mutation|s)?\.data(?:\?\.)?\.(?:length|map|reduce|filter|some|find|slice)\b/g },
  { name: 'queryDataFallbackArrayMethod', re: /\((?:\w+(?:Q|Query|Mut|Mutation|s)?\.data)\s*(?:\|\||\?\?)\s*\[\]\)\.(?:length|map|reduce|filter|some|find|slice)\b/g },
  { name: 'objectKeysEntriesQueryData', re: /Object\.(?:keys|entries)\([^\n)]*\b\w+(?:Q|Query|Mut|Mutation|s)?\.data/g },
  { name: 'nestedQueryDataArrayMethod', re: /\b\w+(?:Q|Query|Mut|Mutation|s)?\.data(?:\?\.)?\.[A-Za-z0-9_$?.]+\.(?:length|map|reduce|filter|some|find|slice)\b/g },
  { name: 'firstElementQueryData', re: /\b\w+(?:Q|Query|Mut|Mutation|s)?\.data(?:\?\.)?(?:\.[A-Za-z0-9_$]+)?\[0\]/g },
];

const findings = [];
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split(/\r?\n/);
  for (const { name, re } of risky) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ file, line, name, snippet: lines[line - 1].trim().slice(0, 180) });
    }
  }
}

console.log(`UI data guard audit scanned ${files.length} client files.`);
if (findings.length === 0) {
  console.log('No obvious unsafe direct query-data array/object access patterns found.');
} else {
  console.log(`${findings.length} obvious unsafe direct query-data access pattern(s) found:`);
  for (const f of findings) console.log(`${f.file}:${f.line} [${f.name}] ${f.snippet}`);
  console.log('\nNormalize API-derived values with safeArray/safeObject/safeText/safeNumber near the view boundary before rendering.');
}
