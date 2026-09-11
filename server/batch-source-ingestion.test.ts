import { readFileSync as read_file, writeFileSync as write_file } from "node:fs";
import { resolve } from "node:path";
import { createHash as create_hash } from "node:crypto";
import JSZip from "jszip";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach as after_each, describe, expect, it, vi } from "vitest";
import { parse_batch_source } from "../scripts/lib/batch-source-adapter.mjs";
import { download_corpus_storage_artifact } from "./services/corpus-storage-download";

const database_boundary = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => database_boundary }));
import { queue_fresh_atomic_corpus_pass, resume_fresh_atomic_corpus_pass_from_database } from "./services/fresh-corpus-atomic-v1";
import { read_batch_source_lineage, reconcile_existing_sais_identity } from "./services/batch-source-lineage";
import { batch_source_router } from "./routers/batch-source-router";

const sha256 = (bytes: Buffer | string) => create_hash("sha256").update(bytes).digest("hex");
const xml_escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const paragraph = (text: string) => `<w:p><w:r><w:t>${xml_escape(text)}</w:t></w:r></w:p>`;
const table = (rows: string[][]) => `<w:tbl>${rows.map(cells => `<w:tr>${cells.map(cell => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;

async function document_fixture(body: string, image = false) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  if (image) zip.file("word/media/image1.png", Buffer.from("preserved image bytes"));
  return zip.generateAsync({ type: "nodebuffer" });
}

after_each(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Batch source preservation", () => {
  it("restricts private source readback and queueing to administrators", async () => {
    const anonymous = batch_source_router.createCaller({ user: null, auth: { auth_status: "unauthenticated" } } as any);
    await expect(anonymous.get_batch_source_lineage({ artifact_key: "Batch/private.docx" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const member = batch_source_router.createCaller({ user: { id: 1, role: "user" } } as any);
    await expect(member.queue_batch_source_observations({ artifact_keys: ["Batch/private.docx"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("authenticates private storage, checks exact bytes and versions, and never retries publicly", async () => {
    const source = { bucket_id: "Batch", object_name: "SAIS one.docx", byte_size: 3, transport_etag: '"v1"' };
    const request = vi.fn().mockResolvedValue(new Response("abc", { headers: { etag: '"v1"' } }));
    const environment = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test_server_key" };
    expect(await download_corpus_storage_artifact(source, request, environment)).toEqual(Buffer.from("abc"));
    expect(request).toHaveBeenCalledWith("https://test.supabase.co/storage/v1/object/authenticated/Batch/SAIS%20one.docx",
      expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer test_server_key" }) }));
    await expect(download_corpus_storage_artifact(source, request, {})).rejects.toThrow("credential_unavailable");
    request.mockResolvedValueOnce(new Response("abc", { headers: { etag: '"v2"' } }));
    await expect(download_corpus_storage_artifact(source, request, environment)).rejects.toThrow("version_changed");
    request.mockResolvedValueOnce(new Response("abcd"));
    await expect(download_corpus_storage_artifact(source, request, environment)).rejects.toThrow("byte_size_changed");
    request.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(download_corpus_storage_artifact(source, request, environment)).rejects.toThrow("http_403");
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("joins split resource metadata and preserves short paragraphs, raw fragments and unverified images", async () => {
    const bytes = await document_fixture(paragraph("Hi")
      + table([["resource_id", "family_series", "document_number"], ["SAIS-X-1", "systemic_abuse_intelligence", "1"]])
      + table([["resource_id", "organization_name", "official_contact"], ["SAIS-X-1", "O'Brien", "123"]])
      + paragraph('{"broken":[{"id":') + paragraph('{"complete":[{"id":"r1","note":"line\nbreak"}]}'), true);
    const parsed = await parse_batch_source(bytes, "split.docx", async () => new Map([["word/media/image1.png", { text: "clipped text", engine: "test_ocr" }]]));
    expect(parsed.resources).toEqual([{ resource_id: "SAIS-X-1", family_series: "systemic_abuse_intelligence",
      document_number: "1", organization_name: "O'Brien", official_contact: "123" }]);
    expect(parsed.native_records).toMatchObject([{ family: "complete", record: { id: "r1", note: "line\nbreak" } }]);
    expect(parsed.observations.some(row => row.values.text === "Hi")).toBe(true);
    expect(parsed.holds).toContainEqual({ code: "incomplete_native_block", block_index: 0 });
    expect(parsed.observations.find(row => row.source_kind === "docx_embedded_image")).toMatchObject({
      review_state: "unverified_ocr", values: { completeness: "unverified", publication_state: "governed_non_public", ocr_text: "clipped text" } });
    expect(parsed.source_sha256).toBe(sha256(bytes));
  });

  it("records malformed XML and conflicting metadata as holds, retaining the original content", async () => {
    const malformed = await parse_batch_source(await document_fixture("<0/>"), "broken.docx");
    expect(malformed.holds[0].code).toBe("malformed_document_xml");
    expect(malformed.observations[0].values.raw_xml).toContain("<0/>");
    const conflict = await parse_batch_source(await document_fixture(
      table([["resource_id", "name"], ["r1", "First"]]) + table([["resource_id", "name"], ["r1", "Second"]])), "conflict.docx");
    expect(conflict.holds[0].code).toBe("resource_field_conflict");
    expect(conflict.observations.filter(row => row.source_kind === "docx_table_row")).toHaveLength(4);
  });

  it("accounts for every ZIP member, bad NDJSON lines, SQL and executable source without executing them", async () => {
    const zip = new JSZip();
    zip.file("rows.ndjson", '{"id":"one"}\nbroken\n{"id":"two"}\n');
    zip.file("seed.sql", "DELETE FROM legal_case_law; INSERT OR REPLACE INTO t VALUES(1);");
    zip.file("run.mjs", "throw new Error('must never execute');");
    const parsed = await parse_batch_source(await zip.generateAsync({ type: "nodebuffer" }), "sources.zip");
    expect(parsed.parts).toHaveLength(3);
    expect(parsed.observations.filter(row => row.source_kind === "json_source_record").map(row => row.values.id)).toEqual(["one", "two"]);
    expect(parsed.holds.map(hold => hold.code)).toEqual(["invalid_json_line", "sql_requires_structured_adapter"]);
    expect(parsed.observations.find(row => row.source_kind === "sql_preserved_source")?.values.raw_sql).toContain("DELETE FROM");
    expect(parsed.observations.find(row => row.source_kind === "document_source_text")?.values.execution_allowed).toBe(false);
  });

  it("distinguishes query failure from a successful empty reader and refuses invented pipeline IDs", async () => {
    const empty = await read_batch_source_lineage({ artifact_key: "Batch/empty.docx" }, { query: async () => ({ rows: [] }) } as any);
    const failed = await read_batch_source_lineage({ artifact_key: "Batch/empty.docx" }, { query: async () => { throw new Error("database unavailable"); } } as any);
    expect(empty).toMatchObject({ availability: "empty", record_count: 0 });
    expect(failed).toMatchObject({ availability: "error", record_count: null, records: null });
    expect(reconcile_existing_sais_identity({ resource_id: "SAIS-EC-001-01", document_number: "EC-001" }, null).state).toBe("held_pipeline_contract_required");
  });

  it("holds a stale archive manifest while preserving its member records", async () => {
    const zip = new JSZip();
    zip.file("batch/records.json", '[{"id":"retained"}]');
    zip.file("batch/manifest.json", JSON.stringify({ included_files: [{ relative_path: "records.json", sha256: "0".repeat(64) }] }));
    const parsed = await parse_batch_source(await zip.generateAsync({ type: "nodebuffer" }), "stale.zip");
    expect(parsed.holds).toContainEqual(expect.objectContaining({ code: "archive_manifest_mismatch", member_path: "records.json" }));
    expect(parsed.observations.find(row => row.values.id === "retained")).toMatchObject({ review_state: "held_archive_integrity" });
  });
});

async function isolated_substrate() {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec("CREATE EXTENSION pgcrypto; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz);");
  const initial = read_file(resolve("supabase/migrations/20260811204240_fresh_corpus_reconciliation_v1.sql"), "utf8");
  await database.exec(initial.slice(0, initial.indexOf("create table if not exists public.luminari_corpus_rebuild_run_v1")));
  await database.exec(read_file(resolve("supabase/migrations/20260815073049_fresh_corpus_continuous_manifest_v2.sql"), "utf8"));
  await database.exec(read_file(resolve("supabase/migrations/20260911201534_batch_existing_substrate_registration.sql"), "utf8"));
  await database.exec(read_file(resolve("supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql"), "utf8"));
  const snapshot = JSON.parse(read_file(resolve("config/advocacy-import-schema-v1.json"), "utf8"));
  const contract = snapshot.tables["public.sais_resources"];
  const columns = Object.entries(contract.columns).map(([name, raw]) => {
    const column = raw as { type: string; required: boolean };
    return `${name} ${column.type}${column.required ? " NOT NULL" : ""}`;
  });
  await database.exec(`CREATE TABLE public.sais_resources (${columns.join(",")}, PRIMARY KEY(resource_id));`);
  const query = async (sql: string, parameters?: unknown[]) => {
    const result = await database.query(sql, parameters);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  database_boundary.query.mockImplementation(query);
  database_boundary.connect.mockImplementation(async () => ({ query, release() {} }));
  return database;
}

async function run_original_or_fixture(bytes: Buffer, name: string, canonical_rows: Record<string, unknown>[]) {
  const database = await isolated_substrate();
  const artifact_key = `Batch/${name}`;
  try {
    for (const canonical of canonical_rows) {
      const row = { verification_status: "UNVERIFIED", revision: "v1.0", created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T00:00:00Z", ...canonical };
      const keys = Object.keys(row);
      await database.query(`INSERT INTO public.sais_resources(${keys.join(",")}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
    }
    for (const object_name of [name, "unselected.docx"]) {
      await database.query("INSERT INTO storage.objects VALUES('Batch',$1,$2::jsonb,now(),now())", [object_name, JSON.stringify({ size: bytes.length, eTag: "same_transport_etag", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]);
    }
    await database.query("select public.sync_luminari_corpus_source_manifest_v2()");
    expect((await database.query("select exact_duplicate_of from luminari_corpus_source_artifact_v1")).rows.every(row => row.exact_duplicate_of === null)).toBe(true);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test_server_key");
    const fetch_mock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetch_mock);
    const run = await queue_fresh_atomic_corpus_pass({ bucket_ids: ["Batch"], artifact_keys: [artifact_key] });
    await expect(queue_fresh_atomic_corpus_pass({ bucket_ids: ["Batch"] })).rejects.toThrow("scope_conflict");
    await resume_fresh_atomic_corpus_pass_from_database({ batch_size: 1, max_batches: 3 });
    const receipt = (await database.query("select * from luminari_corpus_atomic_artifact_v1 where run_id=$1", [run.run_id])).rows[0];
    expect(receipt, String(receipt?.error_message)).toMatchObject({ status: "completed", content_sha256: sha256(bytes) });
    expect(fetch_mock).toHaveBeenCalledTimes(1);
    const completed = (await database.query("select status,receipt_hash,atomic_record_count from luminari_corpus_atomic_run_v1 where run_id=$1", [run.run_id])).rows[0];
    expect(completed.status).toBe("completed");
    expect(completed.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(completed.atomic_record_count).toBeGreaterThan(0);
    const readbacks = [];
    for (const canonical of canonical_rows) {
      const admin_reader = batch_source_router.createCaller({ user: { id: 1, role: "admin" } } as any);
      const readback = await admin_reader.get_batch_source_lineage({ artifact_key, resource_id: String(canonical.resource_id) });
      expect(readback.availability).toBe("available");
      expect(readback.records).toHaveLength(1);
      const record = readback.records![0];
      expect(record.content_sha256).toBe(sha256(bytes));
      expect(record.canonical_reconciliation).toMatchObject({ state: "existing_identity_reconciled", canonical_identity: { resource_id: canonical.resource_id }, writes_performed: false });
      readbacks.push({ source_sha256: record.content_sha256, source_record_sha256: record.values_json.source_record_sha256,
        atomic_record_key: record.atomic_record_key, canonical_identity: record.canonical_reconciliation!.canonical_identity,
        runtime_reader: readback.runtime_reader, runtime_surface: "batch_sources.get_batch_source_lineage", availability: readback.availability });
    }
    const count_before = (await database.query("select count(*)::int as n from luminari_corpus_atomic_record_v1")).rows[0].n;
    await database.query("update luminari_corpus_source_artifact_v1 set content_sha256=$1,exact_duplicate_of=$2 where artifact_key='Batch/unselected.docx'", [sha256(bytes), artifact_key]);
    const repeated = await queue_fresh_atomic_corpus_pass({ bucket_ids: ["Batch"], artifact_keys: [artifact_key, "Batch/unselected.docx"] });
    const bounded = await resume_fresh_atomic_corpus_pass_from_database({ batch_size: 1, max_batches: 1 });
    expect(bounded).toMatchObject({ status: "yielded", processed: 1 });
    expect(fetch_mock).toHaveBeenCalledTimes(2);
    expect((await database.query("select status from luminari_corpus_atomic_run_v1 where run_id=$1", [repeated.run_id])).rows[0].status).toBe("running");
    await resume_fresh_atomic_corpus_pass_from_database({ batch_size: 1, max_batches: 3 });
    expect((await database.query("select count(*)::int as n from luminari_corpus_atomic_record_v1")).rows[0].n).toBe(count_before);
    const origin_counts = (await database.query("select run_id,count(*)::int as n from luminari_corpus_atomic_record_origin_v1 group by run_id")).rows;
    expect(origin_counts).toHaveLength(2);
    expect(origin_counts.find(row => row.run_id === repeated.run_id)?.n).toBe(Number(origin_counts.find(row => row.run_id === run.run_id)?.n) * 2);
    expect((await database.query("select count(*)::int as n from sais_resources")).rows[0].n).toBe(canonical_rows.length);
    return { scope: "isolated_postgresql_existing_schema", source_sha256: sha256(bytes), source_name: name, record_count: count_before,
      original_source_used: Boolean(process.env.LUMINARI_BATCH_REPLAY_ROOT), readbacks, production_writes: 0 };
  } finally { await database.close(); }
}

it("persists scoped Batch source records into the existing tables and reads their canonical identities", async () => {
  const source = { resource_id: "SAIS-TEST-001", family_series: "systemic_abuse_intelligence", document_number: "1",
    resource_category: "test", organization_name: "Example source", official_contact: "123" };
  const bytes = await document_fixture(table([Object.keys(source), Object.values(source)]));
  await run_original_or_fixture(bytes, "fixture.docx", [{ resource_id: source.resource_id, family_key: source.family_series,
    document_number: 1, resource_category: "test", organization_name: "Example source", official_contact: "123" }]);
}, 30_000);

it.skipIf(!process.env.LUMINARI_BATCH_REPLAY_ROOT)("replays the original DOC6 bytes against the observed existing SAIS identities", async () => {
  const root = process.env.LUMINARI_BATCH_REPLAY_ROOT!;
  const name = "luminari-SAIS-DOC6-ANTITRUST-MONOPOLY-2026-3.docx";
  const result = await run_original_or_fixture(read_file(resolve(root, "private-files", name)), name,
    JSON.parse(read_file(resolve(root, "sais_doc6_existing_baseline.json"), "utf8")));
  expect(result.source_sha256).toBe("3ad4eeb1e0f3a9dbbf79b34c9079c1c9f312d4e0bd1c34563d6dda7cde390325");
  expect(result.readbacks).toHaveLength(4);
  if (process.env.LUMINARI_BATCH_REPLAY_RECEIPT) write_file(process.env.LUMINARI_BATCH_REPLAY_RECEIPT, JSON.stringify(result, null, 2) + "\n");
}, 30_000);
