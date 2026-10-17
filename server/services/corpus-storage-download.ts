import { createHash as create_hash } from "node:crypto";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export type storage_source = {
  bucket_id: string;
  object_name: string;
  byte_size: number;
  transport_etag?: string | null;
  content_sha256?: string | null;
};

function request_signal(cancellation_signal?: AbortSignal): AbortSignal {
  const download_timeout = AbortSignal.timeout(90_000);
  return cancellation_signal
    ? AbortSignal.any([download_timeout, cancellation_signal])
    : download_timeout;
}

function storage_url(base_url: URL, access: "public" | "authenticated", artifact: storage_source, segments: string[]): string {
  return `${base_url.origin}/storage/v1/object/${access}/${encodeURIComponent(artifact.bucket_id)}/${segments.map(encodeURIComponent).join("/")}`;
}

async function verified_bytes(artifact: storage_source, response: Response): Promise<Buffer> {
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

/**
 * Resolve the current Storage policy at read time instead of encoding historical
 * bucket visibility in application code. Public objects are read through the
 * public endpoint. If that endpoint denies the object and a server credential is
 * available, retry once through the authenticated endpoint. Source byte-size,
 * transport version and content-hash checks are identical on both paths.
 */
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
  const segments = artifact.object_name.split("/");
  if (!artifact.bucket_id || segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("invalid_storage_object_path");
  }

  const public_response = await request(storage_url(base_url, "public", artifact, segments), {
    headers: { Accept: "application/octet-stream" },
    redirect: "error",
    signal: request_signal(cancellation_signal),
  });
  if (public_response.ok) return verified_bytes(artifact, public_response);

  const service_key = environment.SUPABASE_SERVICE_ROLE_KEY || environment.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY
    || environment.SUPABASE_SERVICE_KEY;
  if (!service_key) throw new Error(`storage_download_http_${public_response.status}`);

  const authenticated_response = await request(storage_url(base_url, "authenticated", artifact, segments), {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${service_key}`,
      apikey: service_key,
    },
    redirect: "error",
    signal: request_signal(cancellation_signal),
  });
  if (!authenticated_response.ok) throw new Error(`storage_download_http_${authenticated_response.status}`);
  return verified_bytes(artifact, authenticated_response);
}
