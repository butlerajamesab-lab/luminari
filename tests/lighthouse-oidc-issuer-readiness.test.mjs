import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { LIGHTHOUSE_ISSUER, check_oidc_issuer } from "../scripts/check-lighthouse-oidc-issuer.mjs";

const origin = new URL(LIGHTHOUSE_ISSUER).origin;
const metadata = {
  issuer: LIGHTHOUSE_ISSUER,
  id_token_signing_alg_values_supported: ["ES256"],
  authorization_endpoint: origin + "/auth/v1/oauth/authorize",
  token_endpoint: origin + "/auth/v1/oauth/token",
  jwks_uri: origin + "/auth/v1/.well-known/jwks.json",
};

const { publicKey: fixture_public_key } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const valid_signing_key = { ...fixture_public_key.export({ format: "jwk" }), kid: "current-key", alg: "ES256", use: "sig" };

function fake_fetch(meta = metadata, keys = [valid_signing_key]) {
  return async url => ({
    ok: true,
    status: 200,
    json: async () => url.endsWith("openid-configuration") ? meta : { keys },
  });
}

describe("read-only Lighthouse OIDC issuer readiness", () => {
  it("verifies metadata and asymmetric keys without claiming full SSO", async () => {
    const receipt = await check_oidc_issuer({ fetch_impl: fake_fetch() });
    assert.equal(receipt.issuer_metadata_valid, true);
    assert.equal(receipt.asymmetric_signing_keys_available, true);
    assert.equal(receipt.end_to_end_sso, "not_verified");
    assert.equal(receipt.lighthouse_oauth_client_registered, "not_verified");
  });

  it("rejects untrusted endpoint origins", async () => {
    await assert.rejects(
      check_oidc_issuer({
        fetch_impl: fake_fetch({ ...metadata, token_endpoint: "https://different.example/oauth/token" }),
      }),
      /oidc_endpoint_boundary_mismatch/,
    );
  });

  it("rejects a mismatched issuer", async () => {
    await assert.rejects(
      check_oidc_issuer({ fetch_impl: fake_fetch({ ...metadata, issuer: "https://other.example/auth/v1" }) }),
      /oidc_issuer_mismatch/,
    );
  });

  it("rejects absent or symmetric signing keys", async () => {
    await assert.rejects(
      check_oidc_issuer({ fetch_impl: fake_fetch(metadata, [{ kty: "oct", kid: "secret" }]) }),
      /oidc_asymmetric_jwks_unavailable/,
    );
  });

  it("rejects a key ID without importable signing material", async () => {
    await assert.rejects(
      check_oidc_issuer({ fetch_impl: fake_fetch(metadata, [{ kty: "EC", kid: "current-key" }]) }),
      /oidc_asymmetric_jwks_unavailable/,
    );
  });

  it("rejects encryption-purpose and non-verification keys", async () => {
    for (const key of [
      { ...valid_signing_key, use: "enc" },
      { ...valid_signing_key, key_ops: ["encrypt"] },
      { ...valid_signing_key, alg: "ES384" },
    ]) {
      await assert.rejects(
        check_oidc_issuer({ fetch_impl: fake_fetch(metadata, [key]) }),
        /oidc_asymmetric_jwks_unavailable/,
      );
    }
  });

  it("requires an issuer-advertised compatible algorithm", async () => {
    await assert.rejects(
      check_oidc_issuer({ fetch_impl: fake_fetch({ ...metadata, id_token_signing_alg_values_supported: ["RS256"] }) }),
      /oidc_asymmetric_jwks_unavailable/,
    );
    await assert.rejects(
      check_oidc_issuer({ fetch_impl: fake_fetch({ ...metadata, id_token_signing_alg_values_supported: [] }) }),
      /oidc_asymmetric_jwks_unavailable/,
    );
  });

  it("rejects issuer URLs with insecure schemes", async () => {
    await assert.rejects(
      check_oidc_issuer({ issuer: "http://localhost/auth/v1", fetch_impl: fake_fetch() }),
      /oidc_issuer_boundary_mismatch/,
    );
  });
});
