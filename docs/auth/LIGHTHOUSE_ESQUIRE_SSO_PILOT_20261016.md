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
