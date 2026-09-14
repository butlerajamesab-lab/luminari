import { getPool as get_pool } from "../db";
import { download_corpus_storage_artifact, type storage_source } from "./corpus-storage-download";

type source_identity = storage_source & { artifact_key: string };

/** Keep the caller's artifact identity; resolve only the bytes used for this read. */
export async function download_resolved_corpus_artifact(
  artifact: source_identity,
  request: typeof fetch = fetch,
  environment: NodeJS.ProcessEnv = process.env,
  cancellation_signal?: AbortSignal,
  database: Pick<ReturnType<typeof get_pool>, "query"> = get_pool(),
): Promise<Buffer> {
  cancellation_signal?.throwIfAborted();
  if (artifact.artifact_key !== `${artifact.bucket_id}/${artifact.object_name}`) {
    throw new Error("source_storage_identity_mismatch");
  }
  const result = await database.query(
    "select * from public.resolve_luminari_corpus_storage_artifact_v1($1)",
    [artifact.artifact_key],
  );
  const resolved = result.rows[0];
  if (!resolved) throw new Error("source_storage_resolution_unavailable");
  if (resolved.source_artifact_key !== artifact.artifact_key
    || resolved.bucket_id !== artifact.bucket_id
    || Number(resolved.byte_size) !== Number(artifact.byte_size)
    || (artifact.content_sha256 && resolved.content_sha256 !== artifact.content_sha256)) {
    throw new Error("source_storage_resolution_changed");
  }
  if (resolved.storage_resolution === "retained_exact_copy"
    && !/^[a-f0-9]{64}$/.test(resolved.content_sha256 ?? "")) {
    throw new Error("retained_source_requires_verified_sha256");
  }
  if (resolved.storage_resolution === "original"
    && artifact.transport_etag != null && resolved.transport_etag !== artifact.transport_etag) {
    throw new Error("source_manifest_version_changed");
  }
  cancellation_signal?.throwIfAborted();
  return download_corpus_storage_artifact(resolved, request, environment, cancellation_signal);
}
