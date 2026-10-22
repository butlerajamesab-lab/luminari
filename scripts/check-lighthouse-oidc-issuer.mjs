/**
 * Read-only OIDC issuer preflight. No credentials and no OAuth mutations.
 * A passing result proves discovery metadata and public signing keys only;
 * it does not prove OAuth clients, hosted switches, or real SSO are configured.
 */
import { pathToFileURL } from "node:url";

export const LIGHTHOUSE_ISSUER = "https://wepxlinwbjrkqdzkqpar.supabase.co/auth/v1";

function require_https_url(value, origin, expected_path_prefix) {
  if (typeof value !== "string") throw new Error("oidc_field_missing");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== origin ||
      !url.pathname.startsWith(expected_path_prefix) ||
      url.username || url.password || url.hash) {
    throw new Error("oidc_endpoint_boundary_mismatch");
  }
  return url.href;
}

async function read_public_json(fetch_impl, url) {
  const response = await fetch_impl(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("oidc_metadata_http_" + response.status);
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("oidc_payload_invalid");
  }
  return data;
}

export async function check_oidc_issuer(options = {}) {
  const issuer = options.issuer ?? LIGHTHOUSE_ISSUER;
  const fetch_impl = options.fetch_impl ?? fetch;
  const issuer_url = new URL(issuer);
  if (issuer_url.protocol !== "https:" ||
      issuer_url.pathname !== "/auth/v1" ||
      issuer_url.username || issuer_url.password || issuer_url.search || issuer_url.hash) {
    throw new Error("oidc_issuer_boundary_mismatch");
  }

  const origin = issuer_url.origin;
  const metadata = await read_public_json(
    fetch_impl,
    origin + "/auth/v1/.well-known/openid-configuration",
  );
  if (metadata.issuer !== issuer) throw new Error("oidc_issuer_mismatch");

  require_https_url(metadata.authorization_endpoint, origin, "/auth/v1/");
  require_https_url(metadata.token_endpoint, origin, "/auth/v1/");
  const jwks_uri = require_https_url(metadata.jwks_uri, origin, "/auth/v1/");
  const jwks = await read_public_json(fetch_impl, jwks_uri);
  if (!Array.isArray(jwks.keys) ||
      !jwks.keys.some(key => key && ["RSA", "EC", "OKP"].includes(key.kty) &&
        typeof key.kid === "string" && key.kid.length > 0)) {
    throw new Error("oidc_asymmetric_jwks_unavailable");
  }

  return {
    issuer,
    issuer_metadata_valid: true,
    asymmetric_signing_keys_available: true,
    oauth_server_enabled: "not_verified",
    lighthouse_oauth_client_registered: "not_verified",
    esquire_custom_provider_registered: "not_verified",
    end_to_end_sso: "not_verified",
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  check_oidc_issuer()
    .then(receipt => {
      process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    })
    .catch(error => {
      process.stderr.write(JSON.stringify({
        issuer: LIGHTHOUSE_ISSUER,
        status: "not_ready",
        reason: error instanceof Error ? error.message : "oidc_check_failed",
      }) + "\n");
      process.exitCode = 1;
    });
}
