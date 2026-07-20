#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_ROOTS = ["client/src/pages", "client/src/components", "client/public"];
const SERVER_ROOTS = ["server", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html"]);

const KNOWN_EXCEPTIONS = new Set([
  "client/src/pages/CivicMap.tsx",
  "client/public/civicmap.html",
]);

const LEGACY_RELATIONS = new Set([
  "normalized_civic_resource",
  "agency_directory",
  "forms_directory",
  "civic_map_signals",
  "registry_entity_staging_programs",
]);

const CANONICAL_RELATIONS = new Set([
  "luminari_resource_entities",
  "luminari_resource_contact_points",
  "luminari_resource_locations",
  "registry_programs",
  "legal_statutes",
  "legal_case_law",
  "doctrine_registry",
  "doctrine_graph_edges",
  "civic_genome_family",
  "civic_genome_bill",
  "civic_genome_event",
  "bill_lineage_edge",
  "family_momentum_snapshot",
]);

function walk(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
    }
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function unique(values) {
  return [...new Set(values)].sort();
}

function extractClientDependencies(text) {
  const trpc = [...text.matchAll(/trpc\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)/g)].map((match) => match[1]);
  const api = [...text.matchAll(/(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*[`'"]([^`'"]*\/api\/[^`'"]+)/g)].map((match) => match[1]);
  const iframe = [...text.matchAll(/(?:src=|src\s*:)\s*[`'"]([^`'"]+\.html(?:\?[^`'"]*)?)/g)].map((match) => match[1]);
  return { trpc: unique(trpc), api: unique(api), iframe: unique(iframe) };
}

function extractServerRelations(text) {
  const relations = [];
  const sqlRegex = /\b(?:from|join|update|insert\s+into|delete\s+from)\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let match;
  while ((match = sqlRegex.exec(text))) relations.push(match[1]);
  return unique(relations);
}

function classifyRelation(name) {
  if (LEGACY_RELATIONS.has(name)) return "legacy_or_deprecated";
  if (CANONICAL_RELATIONS.has(name)) return "canonical_or_authoritative";
  return "unclassified";
}

const client = CLIENT_ROOTS.flatMap(walk).map((file) => {
  const fileName = relative(file);
  const text = fs.readFileSync(file, "utf8");
  const dependencies = extractClientDependencies(text);
  return {
    file: fileName,
    known_exception: KNOWN_EXCEPTIONS.has(fileName),
    ...dependencies,
  };
}).filter((item) => item.trpc.length || item.api.length || item.iframe.length);

const server = SERVER_ROOTS.flatMap(walk).map((file) => {
  const relations = extractServerRelations(fs.readFileSync(file, "utf8"));
  return {
    file: relative(file),
    relations: relations.map((name) => ({ name, classification: classifyRelation(name) })),
  };
}).filter((item) => item.relations.length);

const legacyReferences = server.flatMap((item) =>
  item.relations
    .filter((relation) => relation.classification === "legacy_or_deprecated")
    .map((relation) => ({ file: item.file, relation: relation.name })),
);

const unclassifiedReferences = server.flatMap((item) =>
  item.relations
    .filter((relation) => relation.classification === "unclassified")
    .map((relation) => ({ file: item.file, relation: relation.name })),
);

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only_static_audit",
  known_exceptions: [...KNOWN_EXCEPTIONS],
  counts: {
    client_surfaces_with_dependencies: client.length,
    server_files_with_relations: server.length,
    legacy_relation_references: legacyReferences.length,
    unclassified_relation_references: unclassifiedReferences.length,
  },
  client,
  server,
  legacy_references: legacyReferences,
  unclassified_references: unclassifiedReferences,
};

console.log(JSON.stringify(report, null, 2));
