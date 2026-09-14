import { createHash } from "node:crypto";

/** Resolve registered source bytes without changing the queue's provenance path. */
export async function read_registered_queue_storage(row, pool, environment = process.env, request = fetch) {
  if (!row.storage_bucket || !row.storage_path) return null;
  const result = await pool.query(`select a.artifact_key as original_artifact_key,r.*
    from public.luminari_corpus_source_artifact_v1 a
    left join lateral public.resolve_luminari_corpus_storage_artifact_v1(a.artifact_key) r on true
    where a.artifact_key=$1`, [`${row.storage_bucket}/${row.storage_path}`]);
  if (!result.rows.length) return null;
  const target = result.rows[0];
  if (!target.retained_artifact_key) throw new Error("registered_source_storage_unavailable");
  if (target.bucket_id !== row.storage_bucket) throw new Error("registered_source_bucket_changed");
  if (target.storage_resolution === "retained_exact_copy" && !/^[a-f0-9]{64}$/.test(target.content_sha256 ?? "")) {
    throw new Error("retained_source_requires_verified_sha256");
  }
  const base = new URL(environment.SUPABASE_URL || environment.LIGHTHOUSE_SUPABASE_URL || environment.VITE_SUPABASE_URL || environment.NEXT_PUBLIC_SUPABASE_URL);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("invalid_storage_base_url");
  }
  const segments = target.object_name.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === "..")) throw new Error("invalid_storage_object_path");
  const private_bucket = target.bucket_id === "Batch";
  const key = environment.SUPABASE_SERVICE_ROLE_KEY || environment.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_SERVICE_KEY;
  if (private_bucket && !key) throw new Error("private_storage_server_credential_unavailable");
  const headers = { Accept: "application/octet-stream" };
  if (private_bucket) { headers.Authorization = `Bearer ${key}`; headers.apikey = key; }
  const url = `${base.origin}/storage/v1/object/${private_bucket ? "authenticated" : "public"}/${encodeURIComponent(target.bucket_id)}/${segments.map(encodeURIComponent).join("/")}`;
  const response = await request(url, { headers, redirect: "error", signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`registered_storage_http_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== Number(target.byte_size)) throw new Error("registered_storage_byte_size_changed");
  const etag = response.headers.get("etag");
  const normalize_etag = value => value.replace(/^W\//, "").replaceAll('"', "");
  if (target.transport_etag && (!etag || normalize_etag(target.transport_etag) !== normalize_etag(etag))) {
    throw new Error("registered_storage_version_changed");
  }
  if (target.content_sha256 && createHash("sha256").update(buffer).digest("hex") !== target.content_sha256) {
    throw new Error("registered_storage_sha256_changed");
  }
  return { buffer, raw_text: null, source: "registered_corpus_storage", attempts: [{
    source: "registered_corpus_storage", status: "selected", source_artifact_key: target.source_artifact_key,
    retained_artifact_key: target.retained_artifact_key, storage_resolution: target.storage_resolution,
    content_sha256: target.content_sha256,
  }] };
}
