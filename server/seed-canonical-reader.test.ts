import { mkdtempSync as make_temp_directory, readFileSync as read_file, rmSync as remove_directory } from "node:fs";
import { tmpdir as temporary_root } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync as spawn_sync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";

const database_boundary = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => database_boundary }));
import { searchRuntimeCaseLaw as search_runtime_case_law } from "./legal-library-runtime-db";

it("reads the bound source record through the existing legal reader inside a rollback transaction", async () => {
  const directory = make_temp_directory(join(temporary_root(), "seed-canonical-reader-"));
  const database = new PGlite();
  try {
    const generated = spawn_sync("python3", ["-c", `
from pathlib import Path
import json,sys
sys.path.insert(0, sys.argv[1])
from seed_pipeline_test import reconciliation_fixture
from advocacy_lane_import import prepare_reconciliation,SCHEMA_PATH
root=Path(sys.argv[2]); manifest=reconciliation_fixture(root)
sql,receipt=prepare_reconciliation(root,manifest,json.loads(SCHEMA_PATH.read_text()))
(root/'preview.sql').write_text(sql)
(root/'receipt.json').write_text(json.dumps(receipt))
`, resolve("scripts"), directory], { encoding: "utf8" });
    expect(generated.status, generated.stderr).toBe(0);
    const snapshot = JSON.parse(read_file(resolve("config/advocacy-import-schema-v1.json"), "utf8"));
    const contract = snapshot.tables["public.legal_case_law"];
    const columns = Object.entries(contract.columns).map(([name, value]) => {
      const column = value as { type: string; required: boolean };
      return `${name} ${column.type}${column.required ? " NOT NULL" : ""}`;
    });
    await database.exec(`CREATE TABLE public.legal_case_law (${columns.join(",")}, PRIMARY KEY(id), UNIQUE(citation));
      CREATE TABLE public.v_lighthouse_legal_authority_catalog_v2 (
        object_ref text, source_locator text, artifact_key text, source_candidate_hash text,
        field_provenance jsonb, reconciled_at timestamptz, state_code text, jurisdiction text,
        object_class text, legal_catalog_ready boolean);
      CREATE TABLE public.luminari_corpus_candidate_v1 (candidate_hash text, artifact_key text, payload jsonb, created_at timestamptz);
      INSERT INTO public.legal_case_law(id,citation,jurisdiction,source_url)
        VALUES ('00000000-0000-0000-0000-000000000001','123 US 456','WA','https://example.org/preserved');`);
    const sql = read_file(join(directory, "preview.sql"), "utf8");
    expect(sql.endsWith("ROLLBACK;\n")).toBe(true);
    // Keep the preview transaction open only long enough to call the real reader.
    await database.exec(sql.slice(0, -"ROLLBACK;\n".length));
    database_boundary.query.mockImplementation((query: string, parameters: unknown[]) => database.query(query, parameters));
    const records = await search_runtime_case_law({ query: "123 US 456", jurisdiction: "WA" });
    const receipt = JSON.parse(read_file(join(directory, "receipt.json"), "utf8"));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: receipt.records[0].canonical_identity.id,
      citation: "123 US 456", case_name: "O'Brien v. State", summary: "Holding", domains: ["housing"],
      key_quotes: ["Quote"], source_url: "https://example.org/preserved" });
    expect(receipt.records[0].source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.records[0].source_record_id).toBe("citation:123 US 456");
    await database.exec("ROLLBACK;");
    expect((await database.query("select case_name from legal_case_law")).rows[0]).toEqual({ case_name: null });
    await database.exec("UPDATE legal_case_law SET summary='Concurrent curated update';");
    await expect(database.exec(sql)).rejects.toThrow("expected values changed");
    await database.exec("ROLLBACK;");
    expect((await database.query("select summary from legal_case_law")).rows[0]).toEqual({ summary: "Concurrent curated update" });
  } finally {
    await database.close();
    remove_directory(directory, { recursive: true, force: true });
  }
}, 30_000);
