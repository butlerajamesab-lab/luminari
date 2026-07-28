import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const exportFacade = read("./export-spine-engine.ts");
const restoreFacade = read("./restore-spine-engine.ts");
const sovereignExportFacade = read("./sovereign-export-spine-engine.ts");
const exporter = read("./sovereign-export-spine-engine-v2.ts");
const restorer = read("./sovereign-restore-spine-engine.ts");
const bundleContract = read("./spine-bundle-contract.ts");
const consistentExport = read("./spine-consistent-data-export.ts");
const snapshot = read("./spine-export-snapshot.ts");
const restorePreflight = read("./spine-restore-preflight.ts");
const postgres = read("./spine-postgres.ts");
const runs = read("./spine-run-store.ts");
const migration = read(
  "../../supabase/migrations/20260727163000_sovereign_spine_run_substrate.sql",
);

describe("Sovereign Spine source contract", () => {
  it("preserves the public engine imports while routing export through the snapshot engine", () => {
    expect(exportFacade.trim()).toBe(
      'export * from "./sovereign-export-spine-engine";',
    );
    expect(sovereignExportFacade.trim()).toBe(
      'export * from "./sovereign-export-spine-engine-v2";',
    );
    expect(restoreFacade.trim()).toBe(
      'export * from "./sovereign-restore-spine-engine";',
    );
  });

  it("exports one signed PostgreSQL state and refuses incomplete full bundles", () => {
    expect(exporter).toContain("create_spine_manifest");
    expect(exporter).toContain('databaseType: "postgresql"');
    expect(exporter).toContain("with_spine_export_snapshot");
    expect(exporter).toContain("exportSchemaFromSnapshot(client)");
    expect(exporter).toContain("exportConfigFromSnapshot(client)");
    expect(exporter).toContain("exportTableDataFromSnapshot(client");
    expect(exporter).toContain("truncatedTables.length > 0");
    expect(exporter).toContain("rowLimitPerTable: 100_000");
    expect(snapshot).toContain(
      "begin transaction isolation level repeatable read read only",
    );
    expect(bundleContract).toContain("sign_spine_manifest");
    expect(bundleContract).toContain("metadataValid");
    expect(bundleContract).toContain("(signatureValid || legacyOverride)");
    expect(exporter).not.toContain('databaseType: "mysql"');
    expect(exporter).not.toContain("insertId");
    expect(exporter).not.toContain("result[0]");
    expect(exporter).not.toContain("FROM `");
  });

  it("redacts nested, authority, query, JWT, and bare-key credentials", () => {
    expect(exporter).toContain('url.username = ""');
    expect(exporter).toContain('url.password = ""');
    expect(exporter).toContain('"key"');
    expect(exporter).toContain('url.searchParams.set(key, "ENV_PLACEHOLDER")');
    expect(exporter).toContain("sanitize_spine_export_value");
  });

  it("derives each table's rows and truncation through one statement in the bundle snapshot", () => {
    expect(exporter).toContain("export_spine_table_data_consistent");
    expect(consistentExport).toContain("bounded_limit + 1");
    expect(consistentExport).toContain("result.rows.length > bounded_limit");
    expect(consistentExport).toContain("client.query<Record<string, unknown>>(text)");
    expect(consistentExport).not.toContain("count(*)");
  });

  it("preflights complete schema, registry, target identity, and data contents before mutation", () => {
    expect(restorer).toContain("preflight_spine_restore_contents(");
    expect(restorer.indexOf("preflight_spine_restore_contents(")).toBeLessThan(
      restorer.indexOf('set_restore_spine_run_status(runId, "restoring")'),
    );
    expect(restorePreflight).toContain("validateSchemaSection(bundle)");
    expect(restorePreflight).toContain("loadTargetColumns(");
    expect(restorePreflight).toContain("resolveRegistryIdentity(");
    expect(restorePreflight).toContain("outside the Spine allowlist");
    expect(restorePreflight).toContain("was truncated in the bundle");
    expect(restorePreflight).toContain("contains unknown column");
  });

  it("requires authenticated bundles and reports partial restore truthfully", () => {
    expect(restorer).toContain("verify_spine_bundle");
    expect(restorer).toContain("preview.validation.executable");
    expect(restorer).toContain('"completed_with_errors"');
    expect(restorer).not.toContain("ON DUPLICATE KEY");
    expect(restorer).not.toContain("insertId");
    expect(restorer).not.toContain("result[0]");
    expect(restorer).not.toContain("`INSERT INTO `");
    expect(restorer).not.toContain(
      'status = errors.length > 0 ? "completed" : "completed"',
    );
  });

  it("requires canonical pattern IDs whenever the target supports them", () => {
    expect(restorer).toContain('identityColumns: ["pattern_id", "pattern_name"]');
    expect(restorer).toContain('available.has("pattern_id")');
    expect(restorer).toContain("mutable name fallback is not permitted");
    expect(restorer).toContain("Bundle contains duplicate");
    expect(restorer).toContain(
      "Ambiguous ${tableName}.${identityColumn} target matched",
    );
  });

  it("uses parameterized PostgreSQL data writes and an explicit civic allowlist", () => {
    expect(postgres).toContain("on conflict do nothing");
    expect(postgres).toContain("SPINE_CONFIG_TABLE_SET.has(tableName)");
    expect(postgres).toContain("table_not_empty");
    expect(postgres).toContain("create type public");
    expect(postgres).not.toContain("FROM `");
    expect(postgres).not.toContain("INSERT INTO `");
  });

  it("uses PostgreSQL RETURNING ledgers and preserves text or decoded JSON receipts", () => {
    expect(runs).toContain("returning id");
    expect(runs).toContain("public.restore_spine_runs");
    expect(runs).toContain('if (typeof value !== "string") return value as T;');
    expect(runs).not.toContain("insertId");
    expect(migration).toContain(
      "pg_get_serial_sequence('public.export_spine_runs', 'id')",
    );
    expect(migration).toContain(
      "create table if not exists public.restore_spine_runs",
    );
    expect(migration).toContain(
      "alter column status_rsr type text using status_rsr::text",
    );
    expect(migration).toContain("add column if not exists restored_rows_rsr integer");
    expect(migration).toContain(
      "pg_get_serial_sequence('public.restore_spine_runs', 'id')",
    );
    expect(migration).toContain(
      "perform setval(sequence_name::regclass, maximum_id, true)",
    );
  });
});
