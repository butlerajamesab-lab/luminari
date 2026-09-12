import { readFileSync as read_file, mkdtempSync as make_temp, writeFileSync as write_file, rmSync as remove } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach as after_each, expect, it, vi } from "vitest";
import { read_atomic_runner_configuration, type atomic_runner_configuration } from "./services/fresh-atomic-runner-contract";
import { supervise_atomic_runner } from "./services/fresh-atomic-runner-supervisor";

const database_boundary = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => database_boundary }));
import { ATOMIC_CORPUS_ENGINE_VERSION, resume_fresh_atomic_corpus_pass_from_database } from "./services/fresh-corpus-atomic-v1";

const expected_run_id = "00000000-0000-4000-8000-000000000002";
const older_run_id = "00000000-0000-4000-8000-000000000001";
const configuration: atomic_runner_configuration = { expected_run_id,
  allowed_artifact_keys: ["Batch/selected.json"], batch_size: 1, max_batches: 1, max_duration_ms: 5000 };
const source_bytes = Buffer.from('[{"id":"source-only","name":"private text never printed"}]');

after_each(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function isolated_substrate(artifact_keys = configuration.allowed_artifact_keys) {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec("CREATE EXTENSION pgcrypto; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz);");
  const initial = read_file("supabase/migrations/20260811204240_fresh_corpus_reconciliation_v1.sql", "utf8");
  await database.exec(initial.slice(0, initial.indexOf("create table if not exists public.luminari_corpus_rebuild_run_v1")));
  for (const file of ["20260815073049_fresh_corpus_continuous_manifest_v2.sql",
    "20260911201534_batch_existing_substrate_registration.sql", "20260812044452_fresh_corpus_atomic_record_substrate.sql"]) {
    await database.exec(read_file(`supabase/migrations/${file}`, "utf8"));
  }
  await database.exec("CREATE TABLE canonical_sentinel(id text primary key,body text); INSERT INTO canonical_sentinel VALUES('original','unchanged');");
  for (const artifact_key of [...artifact_keys, "Batch/older.json"]) {
    await database.query("INSERT INTO storage.objects VALUES('Batch',$1,$2::jsonb,now(),now())",
      [artifact_key.slice(6), JSON.stringify({ size: source_bytes.length, eTag: "v1", mimetype: "application/json" })]);
  }
  await database.exec("SELECT public.sync_luminari_corpus_source_manifest_v2()");
  for (const [run_id, keys] of [[older_run_id, ["Batch/older.json"]], [expected_run_id, artifact_keys]] as const) {
    await database.query("INSERT INTO luminari_corpus_atomic_run_v1(run_id,engine_version,scope,status,started_at) VALUES($1,$2,$3::jsonb,'queued',$4::timestamptz)",
      [run_id, ATOMIC_CORPUS_ENGINE_VERSION, JSON.stringify({ bucket_ids: ["Batch"], artifact_keys: keys }),
        run_id === older_run_id ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z"]);
  }
  const query = async (sql: string, parameters?: unknown[]) => {
    const result = await database.query(sql, parameters);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  database_boundary.query.mockImplementation(query);
  database_boundary.connect.mockImplementation(async () => ({ query, release() {} }));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-server-key");
  return database;
}

it("requires an explicit worker grant and validates exact scope and numeric budgets", () => {
  const environment = { NODE_ENV: "production", LIGHTHOUSE_RUNTIME_ROLE: "worker", FRESH_ATOMIC_CORPUS_RESUME_ENABLED: "true",
    FRESH_ATOMIC_EXPECTED_RUN_ID: expected_run_id, FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS: '["Batch/selected.json"]' };
  expect(read_atomic_runner_configuration(environment)).toMatchObject({ expected_run_id, batch_size: 1, max_batches: 1 });
  for (const override of [{ LIGHTHOUSE_RUNTIME_ROLE: "web" }, { FRESH_ATOMIC_CORPUS_RESUME_ENABLED: "TRUE" },
    { FRESH_ATOMIC_EXPECTED_RUN_ID: "" }, { FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS: '["Batch/../secret"]' },
    { FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS: '["Batch/a","Batch/a"]' }, { FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS: 'null' },
    { FRESH_ATOMIC_MAX_SECONDS: "0" }, { FRESH_ATOMIC_BATCH_SIZE: "1.5" }, { FRESH_ATOMIC_MAX_BATCHES: "101" }]) {
    expect(() => read_atomic_runner_configuration({ ...environment, ...override })).toThrow();
  }
});

it("rejects an unavailable run and mismatched scope before database writes or source processing", async () => {
  const database = await isolated_substrate();
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  try {
    const before = await database.query("SELECT run_id,status,scope FROM luminari_corpus_atomic_run_v1 ORDER BY run_id");
    await expect(resume_fresh_atomic_corpus_pass_from_database({ ...configuration, expected_run_id: "00000000-0000-4000-8000-000000000099" })).rejects.toThrow("atomic_expected_run_unavailable");
    await expect(resume_fresh_atomic_corpus_pass_from_database({ ...configuration, allowed_artifact_keys: ["Batch/older.json"] })).rejects.toThrow("atomic_expected_scope_mismatch");
    expect((await database.query("SELECT run_id,status,scope FROM luminari_corpus_atomic_run_v1 ORDER BY run_id")).rows).toEqual(before.rows);
    expect((await database.query("SELECT count(*)::int AS count FROM luminari_corpus_atomic_artifact_v1")).rows[0].count).toBe(0);
    expect(request).not.toHaveBeenCalled();
  } finally { await database.close(); }
}, 30_000);

it("processes only the pinned run despite older queued work, yields at the batch budget, and resumes to a receipt", async () => {
  const keys = ["Batch/selected.json", "Batch/second.json"];
  const database = await isolated_substrate(keys);
  const request = vi.fn(async () => new Response(source_bytes));
  vi.stubGlobal("fetch", request);
  try {
    const bound_configuration = { ...configuration, allowed_artifact_keys: keys };
    expect(await resume_fresh_atomic_corpus_pass_from_database(bound_configuration)).toEqual({ status: "yielded", run_id: expected_run_id, processed: 1 });
    expect(request).toHaveBeenCalledTimes(1);
    expect((await database.query("SELECT status FROM luminari_corpus_atomic_run_v1 WHERE run_id=$1", [older_run_id])).rows[0].status).toBe("queued");
    expect(await resume_fresh_atomic_corpus_pass_from_database({ ...bound_configuration, max_batches: 3 })).toEqual({ status: "completed", run_id: expected_run_id, processed: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(call => !String(call[0]).includes("older.json"))).toBe(true);
    const receipt = (await database.query("SELECT artifact_count,receipt_hash,result_json FROM luminari_corpus_atomic_run_v1 WHERE run_id=$1", [expected_run_id])).rows[0];
    expect(receipt.artifact_count).toBe(2);
    expect(receipt.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.result_json).toMatchObject({ publication_state: "governed_non_public" });
    expect((await database.query("SELECT * FROM canonical_sentinel")).rows).toEqual([{ id: "original", body: "unchanged" }]);
    expect((await database.query("SELECT DISTINCT run_id FROM luminari_corpus_atomic_record_origin_v1")).rows).toEqual([{ run_id: expected_run_id }]);
  } finally { await database.close(); }
}, 30_000);

it("honors cancellation before any claim and aborts an in-flight private download without publishing records", async () => {
  const database = await isolated_substrate();
  const cancellation = new AbortController();
  try {
    cancellation.abort();
    expect(await resume_fresh_atomic_corpus_pass_from_database({ ...configuration, cancellation_signal: cancellation.signal })).toMatchObject({ status: "stopped", processed: 0 });
    expect((await database.query("SELECT status FROM luminari_corpus_atomic_run_v1 WHERE run_id=$1", [expected_run_id])).rows[0].status).toBe("queued");
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("private download content must not reach stdout")), { once: true });
    })));
    expect(await resume_fresh_atomic_corpus_pass_from_database({ ...configuration, max_duration_ms: 100 })).toMatchObject({ status: "time_budget_exhausted" });
    expect((await database.query("SELECT count(*)::int AS count FROM luminari_corpus_atomic_record_v1")).rows[0].count).toBe(0);
  } finally { await database.close(); }
}, 30_000);

it("enforces hard wall time outside a blocked parser process and suppresses child output", async () => {
  const directory = make_temp(join(tmpdir(), "atomic-runner-"));
  try {
    const child_file = join(directory, "blocked.mjs");
    write_file(child_file, 'console.log("private source should be suppressed"); while (true) {}');
    const result = await supervise_atomic_runner({ ...configuration, max_duration_ms: 200 }, child_file);
    expect(result).toMatchObject({ status: "time_budget_exhausted", processed: null, run_id: expected_run_id });
    expect(result.elapsed_ms).toBeLessThan(2500);
    expect(JSON.stringify(result)).not.toContain("private source");
  } finally { remove(directory, { recursive: true, force: true }); }
}, 5000);

it("emits only allowed receipt fields even when a child returns sensitive error and source details", async () => {
  const directory = make_temp(join(tmpdir(), "atomic-receipt-"));
  try {
    const child_file = join(directory, "receipt.mjs");
    write_file(child_file, 'console.error("secret_key"); process.send({status:"failed",processed:0,error_code:"postgres://secret_key",raw_excerpt:"private",artifact_key:"Batch/private.docx"}); process.disconnect();');
    const result = await supervise_atomic_runner(configuration, child_file);
    expect(result).toMatchObject({ status: "failed", error_code: "atomic_runner_failed", processed: 0 });
    expect(JSON.stringify(result)).not.toMatch(/secret_key|private|raw_excerpt|artifact_key/);
    expect(result.scope_sha256).toMatch(/^[0-9a-f]{64}$/);
  } finally { remove(directory, { recursive: true, force: true }); }
});
