import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");
const manifestPath = resolve(root, "supabase/rosetta-migration-ledger.json");
const configPath = resolve(root, "supabase/config.toml");
const functionsDir = resolve(root, "supabase/functions");

const fail = (message) => {
  console.error(`ROSETTA_MIGRATION_LEDGER_FAILURE: ${message}`);
  process.exitCode = 1;
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.project !== "ROSETTA") fail("manifest project must be ROSETTA");
if (manifest.project_ref !== "kjzytnzkkdpdxtqtjlew") {
  fail("manifest is not bound to the ROSETTA production project");
}
if (manifest.preview_ref !== "fqmgxoicohsvntceslxu") {
  fail("manifest is not bound to the expected ROSETTA preview project");
}

const config = readFileSync(configPath, "utf8");
if (!/^project_id = "rosetta-repo"$/m.test(config)) {
  fail("supabase/config.toml is not marked as the Rosetta deployment branch");
}
if (/^project_id = "luminari-repo"$/m.test(config)) {
  fail("Lighthouse/Luminari project binding leaked into the Rosetta branch");
}

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const expectedFiles = manifest.migrations.map((migration) => migration.file);

if (files.length !== manifest.migration_count) {
  fail(`expected ${manifest.migration_count} migrations, found ${files.length}`);
}
if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
  const missing = expectedFiles.filter((file) => !files.includes(file));
  const extra = files.filter((file) => !expectedFiles.includes(file));
  fail(`migration filenames diverged; missing=${missing.join(",")} extra=${extra.join(",")}`);
}

const versions = new Set();
for (const expected of manifest.migrations) {
  if (!/^\d{14}_[A-Za-z0-9_]+\.sql$/.test(expected.file)) {
    fail(`invalid migration filename: ${expected.file}`);
    continue;
  }
  if (versions.has(expected.version)) {
    fail(`duplicate migration version: ${expected.version}`);
  }
  versions.add(expected.version);

  const sql = readFileSync(resolve(migrationsDir, expected.file), "utf8")
    .replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== expected.sha256) {
    fail(`SQL hash mismatch: ${expected.file}`);
  }
  if (Buffer.byteLength(sql) !== expected.bytes) {
    fail(`SQL byte count mismatch: ${expected.file}`);
  }
}

const functionSlugs = readdirSync(functionsDir).sort();
const expectedFunctions = [
  "rosetta-migration-41019-export-temp",
  "rosetta-v259-v2510-migration-export-temp",
];
if (JSON.stringify(functionSlugs) !== JSON.stringify(expectedFunctions)) {
  fail(`unexpected Edge Function set: ${functionSlugs.join(",")}`);
}

if (!process.exitCode) {
  console.log(
    `ROSETTA_MIGRATION_LEDGER_OK: ${files.length} migrations; ` +
      `${functionSlugs.length} retired diagnostic functions`,
  );
}
