-- Read-only Lighthouse identity readiness. Do not use database writes to
-- configure OAuth: use hosted Supabase Authentication > OAuth Server.
SELECT
  (SELECT count(*)::integer FROM auth.users) AS lighthouse_identity_count,
  (SELECT count(*)::integer FROM auth.users WHERE email_confirmed_at IS NOT NULL) AS confirmed_identity_count,
  (SELECT count(*)::integer FROM auth.oauth_clients) AS registered_oauth_client_count,
  CASE WHEN (SELECT count(*) FROM auth.oauth_clients) > 0
    THEN 'registration_present_requires_client_and_callback_verification'
    ELSE 'blocked_no_oauth_clients_registered'
  END AS lighthouse_oauth_readiness;
