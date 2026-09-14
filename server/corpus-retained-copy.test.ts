import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getPool: () => { throw new Error("use isolated database"); } }));
import { download_resolved_corpus_artifact } from "./services/corpus-source-resolution";

let db: PGlite;
const bucket = "State Enriched Registry bucket";
const bytes = Buffer.from("original exact bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const original_key = `${bucket}/a.docx`;
const keep_key = `${bucket}/b.docx`;
const resolve = (key = original_key) => db.query("select * from resolve_luminari_corpus_storage_artifact_v1($1)", [key]);
const sync = () => db.query("select sync_luminari_corpus_source_manifest_v2()");

beforeEach(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create extension pgcrypto; create role anon; create role authenticated; create role service_role; create schema storage; create table storage.objects(bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz);");
  for (const file of ["20260811204240_fresh_corpus_reconciliation_v1.sql", "20260815073049_fresh_corpus_continuous_manifest_v2.sql", "20260914033026_corpus_retained_copy_resolution.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  for (const name of ["a.docx", "b.docx"]) {
    await db.query("insert into storage.objects values($1,$2,$3,now(),now())", [bucket, name,
      { size: bytes.length, eTag: name, mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }]);
  }
  await sync();
  await db.query("update luminari_corpus_source_artifact_v1 set content_sha256=$1", [digest]);
}, 30_000);
afterEach(async () => { await db.close(); });

it("preserves the original source and foreign references through physical deduplication and repeated sync", async () => {
  const before = (await db.query("select artifact_key,bucket_id,object_name,byte_size,transport_etag,storage_created_at,storage_updated_at,content_sha256 from luminari_corpus_source_artifact_v1 order by artifact_key")).rows;
  await db.exec("create table test_origin(id int primary key, artifact_key text references luminari_corpus_source_artifact_v1(artifact_key))");
  await db.query("insert into test_origin values(1,$1)", [original_key]);
  expect((await resolve()).rows[0]).toMatchObject({ retained_artifact_key: original_key, storage_resolution: "original" });
  // This is an isolated test database; production removals use the Storage API.
  await db.query("delete from storage.objects where name='a.docx'");
  await sync(); await sync();
  expect((await resolve()).rows[0]).toMatchObject({ source_artifact_key: original_key, retained_artifact_key: keep_key, storage_resolution: "retained_exact_copy", content_sha256: digest });
  expect((await db.query("select artifact_key,bucket_id,object_name,byte_size,transport_etag,storage_created_at,storage_updated_at,content_sha256 from luminari_corpus_source_artifact_v1 order by artifact_key")).rows).toEqual(before);
  expect((await db.query("select * from test_origin")).rows).toEqual([{ id: 1, artifact_key: original_key }]);
  expect((await db.query("select storage_state,exact_duplicate_of from luminari_corpus_source_artifact_v1 where artifact_key=$1", [original_key])).rows[0]).toEqual({ storage_state: "active", exact_duplicate_of: keep_key });
  const request = vi.fn().mockResolvedValue(new Response(bytes, { headers: { etag: '"b.docx"' } }));
  const artifact = { artifact_key: original_key, bucket_id: bucket, object_name: "a.docx", byte_size: bytes.length, transport_etag: "a.docx", content_sha256: digest };
  expect(await download_resolved_corpus_artifact(artifact, request, { SUPABASE_URL: "https://test.supabase.co" }, undefined, db as any)).toEqual(bytes);
  expect(String(request.mock.calls[0][0])).toContain("/b.docx");
  expect(artifact.object_name).toBe("a.docx");
  request.mockResolvedValueOnce(new Response(Buffer.alloc(bytes.length), { headers: { etag: '"b.docx"' } }));
  await expect(download_resolved_corpus_artifact(artifact, request, { SUPABASE_URL: "https://test.supabase.co" }, undefined, db as any)).rejects.toThrow("storage_content_sha256_changed");
});

it.each(["hash", "size", "etag", "timestamp", "bucket"])("refuses a retained candidate with changed %s", async (field) => {
  await db.exec("delete from storage.objects where name='a.docx'");
  if (field === "hash") await db.query("update luminari_corpus_source_artifact_v1 set content_sha256=$1 where object_name='b.docx'", ["f".repeat(64)]);
  if (field === "size") await db.exec("update luminari_corpus_source_artifact_v1 set byte_size=999 where object_name='b.docx'");
  if (field === "etag") await db.exec("update storage.objects set metadata=jsonb_set(metadata,'{eTag}','\"new\"')");
  if (field === "timestamp") await db.exec("update storage.objects set updated_at=updated_at+interval '1 second'");
  if (field === "bucket") {
    await db.exec("update storage.objects set bucket_id='Batch'; update luminari_corpus_source_artifact_v1 set bucket_id='Batch' where object_name='b.docx'");
  }
  expect((await resolve()).rows).toHaveLength(0);
  await sync();
  expect((await db.query("select storage_state from luminari_corpus_source_artifact_v1 where artifact_key=$1", [original_key])).rows[0].storage_state).toBe("missing");
});

it("does not replace an existing changed generation with old identical bytes", async () => {
  await db.exec("update storage.objects set metadata=jsonb_set(metadata,'{eTag}','\"new-generation\"') where name='a.docx'");
  expect((await resolve()).rows).toHaveLength(0);
  await sync();
  expect((await resolve()).rows[0]).toMatchObject({ retained_artifact_key: original_key, content_sha256: null, transport_etag: "new-generation" });
});

it("does not expose internal resolution to public or signed-in users", async () => {
  const rows = (await db.query("select has_function_privilege('anon','resolve_luminari_corpus_storage_artifact_v1(text)','execute') as anon, has_function_privilege('authenticated','resolve_luminari_corpus_storage_artifact_v1(text)','execute') as authenticated")).rows;
  expect(rows[0]).toEqual({ anon: false, authenticated: false });
});
