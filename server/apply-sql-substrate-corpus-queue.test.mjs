import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  assert_full_substrate_sql_safe,
  build_storage_object_url,
  download_sql_text,
  extract_full_substrate_targets,
  FULL_SUBSTRATE_EXPECTED_TOTAL,
  FULL_SUBSTRATE_TARGET_COUNTS,
  FULL_SUBSTRATE_VERIFIED_TUPLE_ROWS,
  run_sql_substrate_handoff,
  sha256_text,
  validate_full_substrate_targets,
} from "../scripts/apply-sql-substrate-corpus-queue.mjs";

function make_pool(counts = {}, options = {}) {
  const queries = [];
  return {
    queries,
    async query(text, values = []) {
      queries.push({ text, values });
      if (text.startsWith("select to_regclass")) {
        const table = String(values[0]).replace("public.", "");
        return { rows: [{ regclass: options.missing?.includes(table) ? null : values[0] }] };
      }
      const count_match = text.match(/select count\(\*\)::int as count from public\.([a-zA-Z0-9_]+)/);
      if (count_match) return { rows: [{ count: counts[count_match[1]] ?? 0 }] };
      return { rows: [{}] };
    },
  };
}

const all_expected_counts = { ...FULL_SUBSTRATE_TARGET_COUNTS };
const sample_sql = Object.keys(FULL_SUBSTRATE_TARGET_COUNTS).map((table) => `insert into public.${table} values ();`).join("\n");
const sample_sha256 = sha256_text(sample_sql);

describe("SQL substrate storage download", () => {
  it("constructs Storage URLs with spaces in bucket names and nested object-path encoding", () => {
    expect(build_storage_object_url("https://example.supabase.co/", "Everything backbone related", "folder one/v3_13 full/substrate#.sql"))
      .toBe("https://example.supabase.co/storage/v1/object/authenticated/Everything%20backbone%20related/folder%20one/v3_13%20full/substrate%23.sql");
  });

  it("uses native fetch authorization headers", async () => {
    const fetch_impl = vi.fn(async () => ({ ok: true, text: async () => "begin; commit;" }));
    await download_sql_text({ storage_bucket: "Everything backbone related", storage_path: "nested/file.sql" }, { supabase_url: "https://project.supabase.co", service_role_key: "secret", fetch_impl });
    expect(fetch_impl).toHaveBeenCalledWith(expect.stringContaining("/storage/v1/object/authenticated/Everything%20backbone%20related/nested/file.sql"), expect.objectContaining({
      headers: { Authorization: "Bearer secret", apikey: "secret" },
    }));
  });

  it("reports bounded previews for non-2xx Storage responses", async () => {
    const fetch_impl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "x".repeat(800) }));
    await expect(download_sql_text({ storage_bucket: "b", storage_path: "p" }, { supabase_url: "https://project.supabase.co", service_role_key: "secret", fetch_impl }))
      .rejects.toMatchObject({ code: "storage_download_failed", status: 403 });
  });

  it("rejects empty SQL responses", async () => {
    await expect(download_sql_text({ storage_bucket: "b", storage_path: "p" }, { supabase_url: "https://project.supabase.co", service_role_key: "secret", fetch_impl: async () => ({ ok: true, text: async () => "  \n" }) }))
      .rejects.toMatchObject({ code: "empty_sql_substrate" });
  });

  it("does not import the Supabase JS client or initialize WebSocket support", () => {
    const source = fs.readFileSync(new URL("../scripts/apply-sql-substrate-corpus-queue.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(source).not.toMatch(/\bcreateClient\b/);
  });
});

describe("full substrate fail-closed preflight", () => {
  it("accepts only the expected hash and all 19 staging targets", () => {
    expect(assert_full_substrate_sql_safe(sample_sql, { expected_sha256: sample_sha256 })).toMatchObject({ sha256: sample_sha256 });
  });

  it("rejects a hash mismatch before execution", () => {
    expect(() => assert_full_substrate_sql_safe(sample_sql, { expected_sha256: "0".repeat(64) }))
      .toThrow(expect.objectContaining({ code: "full_substrate_sha256_mismatch" }));
  });

  it("rejects destructive SQL before execution", () => {
    const destructive = `${sample_sql}\ntruncate table public.registry_programs;`;
    expect(() => assert_full_substrate_sql_safe(destructive, { expected_sha256: sha256_text(destructive) }))
      .toThrow(expect.objectContaining({ code: "forbidden_full_substrate_sql" }));
  });

  it("rejects canonical production writes before execution", () => {
    const canonical = `${sample_sql}\ninsert into public.registry_programs values ();`;
    expect(() => assert_full_substrate_sql_safe(canonical, { expected_sha256: sha256_text(canonical) }))
      .toThrow(expect.objectContaining({ code: "full_substrate_write_target_rejected", canonical_targets: ["registry_programs"] }));
  });

  it("rejects incomplete target coverage before execution", () => {
    const incomplete = sample_sql.replace("insert into public.legal_aid_wa_v3_13 values ();", "");
    expect(() => assert_full_substrate_sql_safe(incomplete, { expected_sha256: sha256_text(incomplete) }))
      .toThrow(expect.objectContaining({ code: "full_substrate_write_target_rejected", missing_targets: ["legal_aid_wa_v3_13"] }));
  });
});

describe("full v3.13 target validation", () => {
  it("extracts and validates all full substrate targets", async () => {
    expect(extract_full_substrate_targets(sample_sql)).toHaveLength(19);
    const result = await validate_full_substrate_targets(make_pool(all_expected_counts), sample_sql);
    expect(result.expected_total).toBe(36876);
    expect(result.observed_total).toBe(FULL_SUBSTRATE_EXPECTED_TOTAL);
    expect(result.target_validation.every((entry) => entry.valid)).toBe(true);
  });

  it("fails clearly for missing tables", async () => {
    await expect(validate_full_substrate_targets(make_pool(all_expected_counts, { missing: ["legal_aid_wa_v3_13"] }), sample_sql))
      .rejects.toMatchObject({ code: "full_substrate_target_validation_failed", failures: expect.arrayContaining([expect.objectContaining({ table_name: "legal_aid_wa_v3_13", reason: "missing_table" })]) });
  });
});

describe("handoff-specific validation and accounting", () => {
  it("full handoff records verified tuple rows separately from reconciliation target total", async () => {
    const pool = make_pool(all_expected_counts);
    const result = await run_sql_substrate_handoff(
      pool,
      { id: 271, leased_by: "worker", target_hint: "full_substrate_sql_handoff", storage_bucket: "Everything backbone related", storage_path: "v3_13_full_substrate_ingest.sql", record_count_estimate: 36876 },
      sample_sql,
      Date.now(),
      { expected_sha256: sample_sha256 },
    );
    const success_query = pool.queries.find((query) => String(query.text).includes("mark_sql_substrate_handoff_success"));
    expect(success_query.values[3]).toBe(FULL_SUBSTRATE_VERIFIED_TUPLE_ROWS);
    expect(result).toMatchObject({
      handoff_kind: "full_substrate_sql_handoff",
      verified_tuple_rows: 35954,
      reconciliation_target_total: 36876,
      canonical_policy: "staging_only_no_canonical_writes_no_delete",
    });
  });

  it("does not execute SQL when full-substrate preflight fails", async () => {
    const pool = make_pool(all_expected_counts);
    await expect(run_sql_substrate_handoff(pool, { target_hint: "full_substrate_sql_handoff" }, sample_sql, Date.now(), { expected_sha256: "0".repeat(64) }))
      .rejects.toMatchObject({ code: "full_substrate_sha256_mismatch" });
    expect(pool.queries).toHaveLength(0);
  });

  it("cream handoff preserves separate legacy validation", async () => {
    const pool = make_pool({ corpus_import_queue: 7, corpus_graph_candidate_edges: 2 });
    await run_sql_substrate_handoff(pool, { id: 31, leased_by: "worker", target_hint: "cream_substrate_sql_handoff", storage_bucket: "b", storage_path: "p" }, "begin; commit;", Date.now());
    expect(pool.queries.some((query) => String(query.text).includes("source_name like 'cream:%'"))).toBe(true);
    const success_query = pool.queries.find((query) => String(query.text).includes("mark_sql_substrate_handoff_success"));
    expect(success_query.values[3]).toBe(7);
  });
});

describe("queue status compatibility source receipt", () => {
  it("preserves the row 271-equivalent pending SQL handoff contract", () => {
    const migration = fs.readFileSync(new URL("../supabase/migration_sources/legacy_unversioned/202607170001_sql_handoff_pending_compatibility.sql", import.meta.url), "utf8");
    expect(migration).toContain("q.import_status in ('pending_bucket_content_scan', 'pending')");
    expect(migration).toContain("q.import_status = 'pending' then 'pending_bucket_content_scan'");
    expect(migration).toContain("target_hint in ('cream_substrate_sql_handoff', 'full_substrate_sql_handoff')");
  });
});
