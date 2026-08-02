import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

type StorageMode = "supabase" | "forge";
type StorageResult = { key: string; url: string };
type ForgeStorageConfig = { base_url: string; api_key: string };
type SupabaseStorageConfig = {
  project_url: string;
  service_role_key: string;
  bucket: string;
};

const DEFAULT_DOCUMENT_BUCKET = "case-documents";
const SUPABASE_KEY_SCHEME = "supabase://";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const CASE_DOCUMENT_PATH_PATTERN = /^cases\/\d+\/documents\//;

let supabase_storage_client: SupabaseClient | null = null;
let supabase_storage_client_key = "";

function normalize_key(rel_key: string): string {
  return rel_key.replace(/^\/+/, "");
}

function ensure_trailing_slash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolve_case_document_storage_mode(): StorageMode {
  const requested_mode = process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND
    ?.trim()
    .toLowerCase();

  if (requested_mode === "supabase" || requested_mode === "forge") {
    return requested_mode;
  }

  if (ENV.lighthouseSupabaseUrl && ENV.lighthouseSupabaseServiceRoleKey) {
    return "supabase";
  }

  return "forge";
}

function is_case_document_path(rel_key: string): boolean {
  return CASE_DOCUMENT_PATH_PATTERN.test(normalize_key(rel_key));
}

function get_supabase_storage_config(): SupabaseStorageConfig {
  const project_url = ENV.lighthouseSupabaseUrl;
  const service_role_key = ENV.lighthouseSupabaseServiceRoleKey;
  const bucket =
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BUCKET?.trim() ||
    DEFAULT_DOCUMENT_BUCKET;

  if (!project_url || !service_role_key) {
    throw new Error(
      "Lighthouse document storage is configured for Supabase, but LIGHTHOUSE_SUPABASE_URL or LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY is missing",
    );
  }

  return {
    project_url: project_url.replace(/\/+$/, ""),
    service_role_key,
    bucket,
  };
}

function get_supabase_storage_client(
  config: SupabaseStorageConfig,
): SupabaseClient {
  const client_key = `${config.project_url}|${config.service_role_key}`;
  if (supabase_storage_client && supabase_storage_client_key === client_key) {
    return supabase_storage_client;
  }

  supabase_storage_client = createClient(
    config.project_url,
    config.service_role_key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info": "luminari-case-document-storage/1.0.0",
        },
      },
    },
  );
  supabase_storage_client_key = client_key;
  return supabase_storage_client;
}

function to_supabase_key(bucket: string, object_path: string): string {
  return `${SUPABASE_KEY_SCHEME}${bucket}/${normalize_key(object_path)}`;
}

function parse_supabase_key(storage_key: string): {
  bucket: string;
  object_path: string;
} {
  if (!storage_key.startsWith(SUPABASE_KEY_SCHEME)) {
    throw new Error("Not a Supabase storage key");
  }

  const remainder = storage_key.slice(SUPABASE_KEY_SCHEME.length);
  const separator_index = remainder.indexOf("/");
  if (separator_index <= 0 || separator_index === remainder.length - 1) {
    throw new Error("Malformed Supabase storage key");
  }

  return {
    bucket: remainder.slice(0, separator_index),
    object_path: remainder.slice(separator_index + 1),
  };
}

function to_upload_body(
  data: Buffer | Uint8Array | string,
): Buffer | Uint8Array {
  return typeof data === "string" ? Buffer.from(data, "utf8") : data;
}

async function supabase_storage_put(
  rel_key: string,
  data: Buffer | Uint8Array | string,
  content_type: string,
): Promise<StorageResult> {
  const config = get_supabase_storage_config();
  const client = get_supabase_storage_client(config);
  const object_path = normalize_key(rel_key);
  const { error } = await client.storage
    .from(config.bucket)
    .upload(object_path, to_upload_body(data), {
      contentType: content_type,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase document upload failed: ${error.message}`);
  }

  return {
    key: to_supabase_key(config.bucket, object_path),
    // Private objects are never exposed directly. The upload route replaces
    // this with an authenticated same-origin document URL after persistence.
    url: "",
  };
}

async function supabase_storage_get(
  storage_key: string,
): Promise<StorageResult> {
  const config = get_supabase_storage_config();
  const client = get_supabase_storage_client(config);
  const parsed_key = parse_supabase_key(storage_key);

  if (parsed_key.bucket !== config.bucket) {
    throw new Error(
      `Supabase document key references unexpected bucket: ${parsed_key.bucket}`,
    );
  }

  const { data, error } = await client.storage
    .from(parsed_key.bucket)
    .createSignedUrl(parsed_key.object_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Supabase document download URL failed: ${error?.message || "missing signed URL"}`,
    );
  }

  return { key: storage_key, url: data.signedUrl };
}

function get_forge_storage_config(): ForgeStorageConfig {
  // Preserve the existing Forge configuration for every non-case-document
  // caller. Only the case document namespace is routed to Supabase.
  const base_url = ENV.forgeApiUrl;
  const api_key = ENV.forgeApiKey;

  if (!base_url || !api_key) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { base_url: base_url.replace(/\/+$/, ""), api_key };
}

function build_forge_upload_url(base_url: string, rel_key: string): URL {
  const url = new URL("v1/storage/upload", ensure_trailing_slash(base_url));
  url.searchParams.set("path", normalize_key(rel_key));
  return url;
}

async function build_forge_download_url(
  base_url: string,
  rel_key: string,
  api_key: string,
): Promise<string> {
  const download_api_url = new URL(
    "v1/storage/downloadUrl",
    ensure_trailing_slash(base_url),
  );
  download_api_url.searchParams.set("path", normalize_key(rel_key));
  const response = await fetch(download_api_url, {
    method: "GET",
    headers: build_forge_auth_headers(api_key),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Forge storage download URL failed (${response.status} ${response.statusText}): ${message}`,
    );
  }

  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error("Forge storage download URL response did not include a URL");
  }
  return payload.url;
}

function to_forge_form_data(
  data: Buffer | Uint8Array | string,
  content_type: string,
  file_name: string,
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: content_type })
      : new Blob([data as BlobPart], { type: content_type });
  const form = new FormData();
  form.append("file", blob, file_name || "file");
  return form;
}

function build_forge_auth_headers(api_key: string): HeadersInit {
  return { Authorization: `Bearer ${api_key}` };
}

async function forge_storage_put(
  rel_key: string,
  data: Buffer | Uint8Array | string,
  content_type: string,
): Promise<StorageResult> {
  const { base_url, api_key } = get_forge_storage_config();
  const key = normalize_key(rel_key);
  const upload_url = build_forge_upload_url(base_url, key);
  const form_data = to_forge_form_data(
    data,
    content_type,
    key.split("/").pop() ?? key,
  );
  const response = await fetch(upload_url, {
    method: "POST",
    headers: build_forge_auth_headers(api_key),
    body: form_data,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Forge storage upload failed (${response.status} ${response.statusText}): ${message}`,
    );
  }

  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error("Forge storage upload response did not include a URL");
  }
  return { key, url: payload.url };
}

async function forge_storage_get(rel_key: string): Promise<StorageResult> {
  const { base_url, api_key } = get_forge_storage_config();
  const key = normalize_key(rel_key);
  return {
    key,
    url: await build_forge_download_url(base_url, key, api_key),
  };
}

export function get_document_storage_mode(): StorageMode {
  return resolve_case_document_storage_mode();
}

export function is_supabase_storage_key(storage_key: string): boolean {
  return storage_key.startsWith(SUPABASE_KEY_SCHEME);
}

export function uses_supabase_document_storage(rel_key: string): boolean {
  return (
    is_case_document_path(rel_key) &&
    resolve_case_document_storage_mode() === "supabase"
  );
}

// Compatibility aliases preserve the existing TypeScript call surface while
// the owned backend implementation remains snake_case.
export const getDocumentStorageMode = get_document_storage_mode;
export const isSupabaseStorageKey = is_supabase_storage_key;

export async function storagePut(
  rel_key: string,
  data: Buffer | Uint8Array | string,
  content_type = "application/octet-stream",
): Promise<StorageResult> {
  if (uses_supabase_document_storage(rel_key)) {
    return supabase_storage_put(rel_key, data, content_type);
  }
  return forge_storage_put(rel_key, data, content_type);
}

export async function storageGet(rel_key: string): Promise<StorageResult> {
  if (is_supabase_storage_key(rel_key)) {
    return supabase_storage_get(rel_key);
  }
  return forge_storage_get(rel_key);
}
