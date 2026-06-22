#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGETS = ["supabase/migrations", "supabase/verification"];
const SQL_IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const CAMEL_CASE_PATTERN = /^[a-z]+[A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/;
const ALLOWED_WORDS = new Set([
  "ON",
  "ERROR",
  "STOP",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "TRUE",
  "FALSE",
  "CREATE",
  "ALTER",
  "DROP",
  "TABLE",
  "VIEW",
  "INDEX",
  "POLICY",
  "FUNCTION",
  "TRIGGER",
  "SCHEMA",
  "PUBLIC",
  "TEXT",
  "UUID",
  "JSONB",
  "INTEGER",
  "BIGINT",
  "BOOLEAN",
  "TIMESTAMPTZ",
  "TIMESTAMP",
]);

function walk(dir) {
  const entries = [];
  let children;
  try {
    children = readdirSync(dir);
  } catch (error) {
    return entries;
  }

  for (const child of children) {
    const path = join(dir, child);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries.push(...walk(path));
    } else if (path.endsWith(".sql")) {
      entries.push(path);
    }
  }
  return entries;
}

function stripComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const violations = [];
for (const target of TARGETS) {
  for (const file of walk(join(ROOT, target))) {
    const content = stripComments(readFileSync(file, "utf8"));
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const matches = line.match(SQL_IDENTIFIER_PATTERN) ?? [];
      for (const match of matches) {
        if (ALLOWED_WORDS.has(match.toUpperCase())) continue;
        if (CAMEL_CASE_PATTERN.test(match)) {
          violations.push(`${relative(ROOT, file)}:${index + 1}: ${match}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Public runtime schema camelCase identifiers found:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("No public runtime camelCase schema identifiers found.");