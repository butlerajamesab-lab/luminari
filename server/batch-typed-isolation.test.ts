import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, expect, it, vi } from "vitest";

const database_boundary = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => database_boundary }));
import { queueFreshCorpusRebuild, reconcileFreshCorpusAutomatically, runFreshCorpusRebuildBatch,
  syncFreshCorpusSourceManifest } from "./services/fresh-corpus-reconciliation-v1";

afterEach(() => { vi.unstubAllGlobals(); });

async function isolated_typed_substrate() {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec("CREATE EXTENSION pgcrypto; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz);");
  for (const file of ["20260811204240_fresh_corpus_reconciliation_v1.sql",
    "20260811204938_fresh_corpus_rebuild_artifact_receipts_v1.sql",
    "20260815073049_fresh_corpus_continuous_manifest_v2.sql",
    "20260911201534_batch_existing_substrate_registration.sql"]) {
    await database.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  database_boundary.query.mockImplementation(async (sql, parameters) => {
    const result = await database.query(sql, parameters);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  });
  return database;
}

it("finishes the typed pass when only excluded private Batch sources remain", async () => {
  const database = await isolated_typed_substrate();
  try {
    await database.exec(`INSERT INTO storage.objects VALUES('Batch','private.docx','{"size":3,"eTag":"v1"}',now(),now());`);
    const run = await queueFreshCorpusRebuild();
    expect(await runFreshCorpusRebuildBatch(run.run_id)).toEqual({ processed: 0, remaining: 0, finalized: true });
    expect((await database.query("SELECT status FROM luminari_corpus_rebuild_run_v1 WHERE run_id=$1", [run.run_id])).rows[0].status).toBe("completed");
  } finally { await database.close(); }
}, 30_000);

it("keeps typed extraction and replay accounting independent of private copies and Batch changes", async () => {
  const database = await isolated_typed_substrate();
  const bytes = Buffer.from('[{"name":"Preserved resource","state":"WA","phone":"555-555-1212"}]');
  try {
    for (const bucket of ["Batch", "Everything backbone related"]) {
      await database.query("INSERT INTO storage.objects VALUES($1,'source.json',$2::jsonb,now(),now())",
        [bucket, JSON.stringify({ size: bytes.length, eTag: "v1", mimetype: "application/json" })]);
    }
    await syncFreshCorpusSourceManifest();
    await database.query("UPDATE luminari_corpus_source_artifact_v1 SET content_sha256=$1",
      [createHash("sha256").update(bytes).digest("hex")]);
    const manifest_sync = await syncFreshCorpusSourceManifest();
    expect((await database.query("SELECT exact_duplicate_of FROM luminari_corpus_source_artifact_v1 WHERE bucket_id <> 'Batch'")).rows[0].exact_duplicate_of).toBe("Batch/source.json");
    const request = vi.fn<typeof fetch>(async () => new Response(bytes, { headers: { etag: '"v1"' } }));
    vi.stubGlobal("fetch", request);
    const run = await queueFreshCorpusRebuild({}, { manifest_sync });
    expect(await runFreshCorpusRebuildBatch(run.run_id)).toEqual({ processed: 1, remaining: 0, finalized: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toContain("/public/Everything%20backbone%20related/");
    const receipts = await database.query("SELECT artifact_key,status,candidate_count FROM luminari_corpus_rebuild_artifact_v1 WHERE run_id=$1", [run.run_id]);
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0]).toMatchObject({ artifact_key: "Everything backbone related/source.json", status: "completed" });
    expect(Number(receipts.rows[0].candidate_count)).toBeGreaterThan(0);

    await database.exec("UPDATE storage.objects SET metadata=jsonb_set(metadata,'{eTag}','\"private-v2\"') WHERE bucket_id='Batch'");
    const private_change = await reconcileFreshCorpusAutomatically({ batchSize: 1, maxBatches: 2 });
    expect(private_change.manifest_sync.typed_source_fingerprint).toBe(manifest_sync.typed_source_fingerprint);
    expect(private_change).toMatchObject({ replay_required: false, queued: null });
    expect(request).toHaveBeenCalledTimes(1);

    await database.exec("UPDATE storage.objects SET metadata=jsonb_set(metadata,'{eTag}','\"typed-v2\"') WHERE bucket_id='Everything backbone related'");
    request.mockResolvedValueOnce(new Response(bytes, { headers: { etag: '"typed-v2"' } }));
    const typed_change = await reconcileFreshCorpusAutomatically({ batchSize: 1, maxBatches: 2 });
    expect(typed_change.replay_required).toBe(true);
    expect(typed_change.queued?.run_id).not.toBe(run.run_id);
    expect(request).toHaveBeenCalledTimes(2);
  } finally { await database.close(); }
}, 30_000);
