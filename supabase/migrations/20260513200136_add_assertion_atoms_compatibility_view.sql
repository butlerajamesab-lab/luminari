CREATE OR REPLACE VIEW public.assertion_atoms AS
SELECT
  id,
  case_id,
  snapshot_id,
  pipeline_run_id,
  claim_text AS assertion_text,
  claim_type AS assertion_type,
  created_at
FROM public.claims;

COMMENT ON VIEW public.assertion_atoms IS
'Compatibility semantic overlay view. Non-destructive alias over claims table for gradual CDA domain-agnostic convergence.';
