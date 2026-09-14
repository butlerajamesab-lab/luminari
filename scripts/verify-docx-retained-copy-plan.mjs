#!/usr/bin/env node
// Runs only against an isolated, in-memory PostgreSQL database.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const [source_path, storage_path, plan_path, receipt_path] = process.argv.slice(2);
if (!receipt_path) throw new Error("usage: node verify-docx-retained-copy-plan.mjs SOURCES STORAGE PLAN RECEIPT");
const sources = JSON.parse(await fs.readFile(source_path, "utf8"));
const objects = JSON.parse(await fs.readFile(storage_path, "utf8"));
const plan = JSON.parse(await fs.readFile(plan_path, "utf8")).held;
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec("create extension pgcrypto; create role anon; create role authenticated; create role service_role; create schema storage; create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz,version text);");
  for (const file of ["20260811204240_fresh_corpus_reconciliation_v1.sql", "20260815073049_fresh_corpus_continuous_manifest_v2.sql", "20260914033026_corpus_retained_copy_resolution.sql"]) {
    await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await db.query("insert into luminari_corpus_source_artifact_v1 select * from jsonb_populate_recordset(null::luminari_corpus_source_artifact_v1,$1)", [JSON.stringify(sources)]);
  for (const object of objects) {
    const source = sources.find(row => row.bucket_id === object.bucket_id && row.object_name === object.name);
    await db.query("insert into storage.objects values($1,$2,$3,$4,$5,$6,$7)", [object.id, object.bucket_id, object.name, object.metadata, source.storage_created_at, object.updated_at, object.version]);
  }
  await db.exec("create table audit_provenance_reference(artifact_key text references luminari_corpus_source_artifact_v1(artifact_key), primary key(artifact_key))");
  await db.exec("insert into audit_provenance_reference select artifact_key from luminari_corpus_source_artifact_v1");
  const historical_columns = "artifact_key,bucket_id,object_name,transport_etag,byte_size,content_sha256,storage_created_at,storage_updated_at";
  const before = (await db.query(`select ${historical_columns} from luminari_corpus_source_artifact_v1 order by artifact_key`)).rows;
  const receipts = [];
  for (const pair of plan) {
    assert(pair.byte_equality_verified);
    assert.equal(pair.sha256, pair.remove.sha256);
    assert.equal(pair.sha256, pair.keep.sha256);
    assert.equal(pair.remove.bytes, pair.keep.bytes);
    const removed = await db.query("delete from storage.objects where id=$1 and version=$2 and bucket_id=$3 and name=$4 returning id", [pair.remove.id, pair.remove.version, pair.remove.bucket_id, pair.remove.name]);
    assert.equal(removed.rows.length, 1);
  }
  await db.query("select sync_luminari_corpus_source_manifest_v2()");
  await db.query("select sync_luminari_corpus_source_manifest_v2()");
  for (const pair of plan) {
    const key = `${pair.remove.bucket_id}/${pair.remove.name}`;
    const resolved = (await db.query("select * from resolve_luminari_corpus_storage_artifact_v1($1)", [key])).rows[0];
    assert(resolved);
    assert.equal(resolved.storage_resolution, "retained_exact_copy");
    assert.equal(resolved.source_artifact_key, key);
    assert.equal(resolved.bucket_id, pair.keep.bucket_id);
    assert.equal(resolved.object_name, pair.keep.name);
    assert.equal(resolved.content_sha256, pair.sha256);
    assert.equal(Number(resolved.byte_size), pair.keep.bytes);
    receipts.push(resolved);
  }
  const after = (await db.query(`select ${historical_columns} from luminari_corpus_source_artifact_v1 order by artifact_key`)).rows;
  assert.deepEqual(after, before);
  assert.equal((await db.query("select count(*)::int n from audit_provenance_reference")).rows[0].n, sources.length);
  assert.equal((await db.query("select count(*)::int n from storage.objects")).rows[0].n, objects.length-plan.length);
  const receipt = { generated_at: new Date().toISOString(), environment: "isolated PGlite; no production mutations", source_records: sources.length, planned_removals: plan.length, resolutions_verified: receipts.length, source_identity_and_version_fields_unchanged: true, all_provenance_references_preserved: true, retained_objects: objects.length-plan.length, receipts };
  await fs.writeFile(receipt_path, JSON.stringify(receipt, null, 2)+"\n");
  console.log(JSON.stringify({ ...receipt, receipts: undefined }));
} finally { await db.close(); }
