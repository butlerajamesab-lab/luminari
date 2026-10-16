# Luminari identity provider — Lighthouse → Esquire pilot

Status: PREPARED; disabled by default. Not a live SSO declaration.

## Verified code boundaries

- Lighthouse browser identity: client/src/lib/supabase.ts and client/src/pages/Login.tsx, project wepxlinwbjrkqdzkqpar.
- /oauth/consent is a public route backed by Supabase OAuth authorization details.
- Consent checks the verified user; redirects come only from Supabase's authorization API, never from raw query parameters.
- Existing login, invitation, welcome, and privileged admin routes are unchanged by this pilot.
- Rosetta, Atlas, and other machine-to-machine credentials are not user SSO tokens.

## Required hosted setup before changing flags

1. In Lighthouse Supabase Authentication > OAuth Server, confirm enablement and authorize path /oauth/consent. Use asymmetric signing keys for OIDC and verify the production Site URL and redirect allowlists.
2. Register an Esquire OAuth client in Lighthouse with the exact callback URI displayed by Esquire's Custom OIDC provider setup. Never store client secrets in source control.
3. In Esquire Supabase Authentication, register a Custom OIDC provider named custom:luminari with Lighthouse issuer discovery and that client credential. This retains Esquire-issued sessions and Esquire database owner-scoped RLS.
4. Keep VITE_LIGHTHOUSE_OAUTH_CONSENT_ENABLED=false and VITE_ESQUIRE_LIGHTHOUSE_SSO_ENABLED=false until both dashboards, callback matching, and key rotation are verified.
5. Inspect Supabase verified-email identity auto-linking BEFORE enabling for existing accounts. Matching email must not be blindly interpreted as permission to merge ownership; evaluate manual link and existing-account migration deliberately.
6. On a test non-admin account verify: Lighthouse sign-in; OAuth consent; Esquire session; no foreign-case access; denial; retry; session expiry; legacy Esquire password sign-in; no privilege escalation.
7. Enable flags only after verified rollout approval. A switch back to false must restore original sign-in.

## Not yet verified

The available Supabase connector does not provide hosted OAuth Server enablement, OAuth client registration, signing-key changes, or Esquire custom provider settings. No database migration or service-role key sharing substitutes for those settings. End-to-end cross-domain SSO has not been tested.

Official references:
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/auth-identity-linking

## 2026-10-16 production readiness receipt (read-only, retrieved)

- Lighthouse Supabase project: wepxlinwbjrkqdzkqpar.
- Verified auth.users: 1; verified email users: 1.
- **OAuth clients registered: 0**. This blocks Esquire client authorization regardless of frontend readiness.
- Canonical query: verification/lighthouse_sso_identity_readiness.sql. Executed directly against hosted Lighthouse: `blocked_no_oauth_clients_registered`.
- Independent issuer verifier: `node scripts/check-lighthouse-oidc-issuer.mjs` (GET-only, no credentials). The result can prove issuer metadata and asymmetric public signing keys, **not** hosted client setup or working SSO.
- GitHub Actions > Lighthouse OIDC issuer readiness > Run workflow > verify_live can rerun the read-only public issuer check.
- Do not set VITE_LIGHTHOUSE_OAUTH_CONSENT_ENABLED=true yet.

### Operator-required Lighthouse setup

1. In the Lighthouse Supabase project open Authentication > OAuth Server.
2. Verify current signing algorithm and supported OIDC discovery; use asymmetric signing keys for OIDC, with a documented rotation plan.
3. Enable OAuth 2.1, set Authorization Path to `/oauth/consent`, and confirm Lighthouse's Site URL is the chosen production hostname.
4. In OAuth Apps register the Esquire client, using the **exact callback URI shown by Esquire's Custom OIDC provider UI**. Use a confidential client and secure the secret using hosted secrets.
5. Re-run the SQL receipt. Only then check metadata availability and Esquire provider configuration; do not enable user traffic yet.
