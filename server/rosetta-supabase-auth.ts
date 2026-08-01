type legacy_key_claims = {
  role?: unknown;
};

function decode_legacy_key_role(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as legacy_key_claims;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Build server-only Supabase Data API headers for Rosetta.
 *
 * New `sb_secret_...` keys are opaque API keys, not JWTs. They must be sent on
 * `apikey` only. Legacy service-role keys are JWTs and continue to be sent on
 * both `apikey` and `Authorization`.
 */
export function create_rosetta_supabase_headers(
  key: string,
  initial_headers?: HeadersInit,
): Headers {
  const normalized_key = key.trim();
  if (!normalized_key) throw new Error("missing_rosetta_supabase_service_role_key");

  if (normalized_key.startsWith("sb_publishable_")) {
    throw new Error("invalid_rosetta_server_key_publishable");
  }

  const headers = new Headers(initial_headers);
  headers.set("apikey", normalized_key);

  if (normalized_key.startsWith("sb_secret_")) {
    headers.delete("authorization");
    return headers;
  }

  const role = decode_legacy_key_role(normalized_key);
  if (role !== "service_role") {
    throw new Error(`invalid_rosetta_server_key_role:${role ?? "unknown"}`);
  }

  headers.set("authorization", `Bearer ${normalized_key}`);
  return headers;
}
