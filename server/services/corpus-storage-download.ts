import { createHash as create_hash } from "node:crypto";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export type storage_source = {
  bucket_id: string;
  object_name: string;
  byte_size: number;
  transport_etag?: string | null;
  content_sha256?: string | null;
};

/** Download private Batch with the existing server credential. Never downgrade to public. */
export async function download_corpus_storage_artifact(
  artifact: storage_source,
  request: typeof fetch = fetch,
  environment: NodeJS.ProcessEnv = process.env,
  cancellation_signal?: AbortSignal,
): Promise<Buffer> {
  const base_url = new URL(environment.SUPABASE_URL || environment.LIGHTHOUSE_SUPABASE_URL
    || environment.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT}.supabase.co`);
  if (base_url.username || base_url.password || base_url.pathname !== "/" || base_url.search || base_url.hash
    || (base_url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base_url.hostname))) {
    throw new Error("invalid_storage_base_url");
  }
  const private_bucket = artifact.bucket_id === "Batch";
  const service_key = environment.SUPABASE_SERVICE_ROLE_KEY || environment.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY
    || environment.SUPABASE_SERVICE_KEY;
  if (private_bucket && !service_key) throw new Error("private_storage_server_credential_unavailable");
  const segments = artifact.object_name.split("/");
  if (!artifact.bucket_id || segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("invalid_storage_object_path");
  }
  const url = `${base_url.origin}/storage/v1/object/${private_bucket ? "authenticated/" : "public/"}`
    + `${encodeURIComponent(artifact.bucket_id)}/${segments.map(encodeURIComponent).join("/")}`;
  const headers: Record<string, string> = { Accept: "application/octet-stream" };
  if (private_bucket) {
    headers.Authorization = `Bearer ${service_key}`;
    headers.apikey = service_key!;
  }
  const download_timeout = AbortSignal.timeout(90_000);
  const response = await request(url, { headers, redirect: "error", signal: cancellation_signal
    ? AbortSignal.any([download_timeout, cancellation_signal]) : download_timeout });
  if (!response.ok) throw new Error(`storage_download_http_${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength !== Number(artifact.byte_size)) throw new Error("storage_byte_size_changed");
  const observed_etag = response.headers.get("etag");
  if (artifact.transport_etag && !observed_etag) throw new Error("storage_object_version_unavailable");
  if (artifact.transport_etag && observed_etag
    && artifact.transport_etag.replace(/^W\//, "").replaceAll('"', "") !== observed_etag.replace(/^W\//, "").replaceAll('"', "")) {
    throw new Error("storage_object_version_changed");
  }
  if (artifact.content_sha256 && create_hash("sha256").update(buffer).digest("hex") !== artifact.content_sha256) {
    throw new Error("storage_content_sha256_changed");
  }
  return buffer;
}
