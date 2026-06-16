import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const scan_roots = ['server', 'client/src', 'shared'];
const ignored_path_re = /(^|\/)(node_modules|dist|coverage|docs|reports|\.git)(\/|$)|\.map$|\.md$|\.original$|\.bad-join$/;
const source_ext_re = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const allowed_identifier_re = new Set([
  // Framework and language names that are not runtime wire keys.
  'React', 'Error', 'Date', 'JSON', 'Promise', 'URL', 'Map', 'Set', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLDivElement',
  'File', 'FormData', 'Blob', 'AbortController', 'Request', 'Response',
  // Common library/type symbols. These are allowed as imported symbols, not as object contract keys.
  'TRPCError', 'SupabaseClient', 'QueryClient', 'QueryClientProvider', 'ReactNode', 'ReactElement',
]);

const allowed_member_re = [
  // Browser/React/DOM/library APIs that must remain camelCase/PascalCase.
  /\.preventDefault\b/,
  /\.stopPropagation\b/,
  /\.currentTarget\b/,
  /\.target\b/,
  /\.className\b/,
  /\.children\b/,
  /\.toISOString\b/,
  /\.toLowerCase\b/,
  /\.toUpperCase\b/,
  /\.startsWith\b/,
  /\.endsWith\b/,
  /\.includes\b/,
  /\.map\b/,
  /\.filter\b/,
  /\.reduce\b/,
  /\.forEach\b/,
  /\.find\b/,
  /\.some\b/,
  /\.every\b/,
  /\.split\b/,
  /\.join\b/,
  /\.trim\b/,
  /\.replace\b/,
  /\.push\b/,
  /\.slice\b/,
  /\.sort\b/,
  /\.length\b/,
  /\.statusText\b/,
  /\.ok\b/,
];

const contract_context_re = /\b(input|output|return|select|insert|update|values|where|from|json|body|params|query|mutation|procedure|publicProcedure|protectedProcedure|adminProcedure|fetch|axios|supabase|rpc|execute|sql|z\.object|interface|type)\b/i;
const camel_identifier_re = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;
const quoted_camel_key_re = /['"`]([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)['"`]\s*:/g;
const bare_camel_key_re = /\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b\s*:/g;
const camel_assignment_re = /\b(const|let|var)\s+([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g;

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

function strip_comments(line) {
  return line.replace(/\/\/.*$/, '');
}

function allowed_line(line, name) {
  if (allowed_identifier_re.has(name)) return true;
  if (allowed_member_re.some((re) => re.test(line))) return true;
  if (/^\s*import\s+/.test(line)) return true;
  if (/^\s*export\s+default\s+/.test(line)) return true;
  // PascalCase component/type declarations are not runtime contract keys. Lower camelCase remains disallowed below.
  return false;
}

const files = scan_roots.flatMap((scan_root) => walk(path.join(root, scan_root)));
const offenders = [];

for (const file of files) {
  const abs = path.join(root, file);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);

  lines.forEach((raw_line, index) => {
    const line = strip_comments(raw_line);
    if (!line.trim()) return;

    const add = (name, reason) => {
      if (allowed_line(line, name)) return;
      offenders.push(`${file}:${index + 1}: ${reason}: ${raw_line.trim()}`);
    };

    for (const match of line.matchAll(quoted_camel_key_re)) add(match[1], 'quoted camelCase key');
    for (const match of line.matchAll(bare_camel_key_re)) add(match[1], 'bare camelCase key');
    for (const match of line.matchAll(camel_assignment_re)) add(match[2], 'camelCase local binding');

    if (contract_context_re.test(line)) {
      for (const match of line.matchAll(camel_identifier_re)) add(match[0], 'camelCase in contract context');
    }
  });
}

if (offenders.length) {
  console.error('Disallowed camelCase runtime identifiers found. Use snake_case for repository runtime contracts.');
  offenders.slice(0, 250).forEach((offender) => console.error(`- ${offender}`));
  if (offenders.length > 250) console.error(`... ${offenders.length - 250} more`);
  process.exit(1);
}

console.log('OK: no disallowed camelCase runtime identifiers found.');
