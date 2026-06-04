import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runtimeRoots = ['server', 'client/src', 'shared'];
const contractTerms = [
  'openId','loginMethod','lastSignedIn',
  'streamId','streamName','streamType','sourceUrl','updateFrequency','signalWeight','confidenceMultiplier',
  'pipelineType','needKeywords','resourceType','needTypes','urgencyLevel','stateCode','jurisdictionType',
  'eligibilityNotes','applyNotes','sourceTable','sourceId','verificationStatus','matchReasons','scoreBreakdown',
];
const termRe = new RegExp(`\\b(${contractTerms.join('|')})\\b`);
const ignoredPath = /(^|\/)(docs|reports|dist|node_modules|coverage|drizzle)(\/|$)|(^|\/)(scripts)(\/|$)|\.md$|\.map$|\.original$|\.bad-join$/;
const allowed = [
  // Drizzle model fields and legacy case-domain internals are not public DB/API/wire aliases in this migration.
  /server\/db\.ts:/,
  /server\/routers\/session76-router\.ts:(733|775):/,
  /server\/routers\.ts:(47[0-9]|48[0-9]|5[0-9][0-9]|6[0-9][0-9]|30[0-9][0-9]|31[0-9][0-9]|33[0-9][0-9]|34[0-9][0-9]|35[0-9][0-9]|36[0-9][0-9]|43[0-9][0-9]):/,
];

const files = [
  'server/db.ts',
  'server/support-matcher.ts',
  'server/engines/admin-sovereign-control.ts',
  'server/engines/data-stream-manager.ts',
  'server/routers/session76-router.ts',
  'client/src/components/SupportRecommendations.tsx',
  'client/src/pages/SovereignControl.tsx',
  'client/src/pages/MissionControl.tsx',
  'client/src/components/sovereign/AtlasCommandPanel.tsx',
].filter((file) => fs.existsSync(path.join(root, file)));

const offenders = [];
for (const file of files) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!termRe.test(line)) return;
    const loc = `${file}:${idx + 1}:`;
    if (allowed.some((re) => re.test(loc))) return;
    // Permit human-readable labels only when the identifier does not appear as code.
    const codeish = /[\w$]\.|\b(as|const|let|var|type|interface|return|SELECT|WHERE|GROUP BY|ORDER BY|INSERT|UPDATE|z\.)\b|["'`]\w*[A-Z]\w*["'`]\s*:|\b\w*[A-Z]\w*\s*[?:=]/;
    if (!codeish.test(line)) return;
    offenders.push(`${loc} ${line.trim()}`);
  });
}

if (offenders.length) {
  console.error('Disallowed runtime camelCase DB/API/wire contract identifiers found:');
  offenders.slice(0, 200).forEach((o) => console.error(`- ${o}`));
  if (offenders.length > 200) console.error(`... ${offenders.length - 200} more`);
  process.exit(1);
}
console.log('OK: no disallowed runtime camelCase DB/API/wire contract identifiers found.');
