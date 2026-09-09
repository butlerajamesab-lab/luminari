-- Doctrine alignment: velocity now reads the canonical current-event view
-- (v_civic_genome_lifecycle_event_current_v3), which applies supersession and
-- tombstoning, instead of the raw v2 append-only ledger. Formula unchanged.

CREATE OR REPLACE VIEW public.docket_bill_velocity AS
SELECT
  state_code,
  source_bill_id,
  (ARRAY_AGG(genome_bill_id))[1] AS genome_bill_id,
  COUNT(*) FILTER (WHERE observed_at > now() - interval '14 days') AS events_14d,
  COUNT(*) FILTER (WHERE event_type = 'amended' AND observed_at > now() - interval '7 days') AS amended_7d,
  ROUND(COALESCE(SUM(
    (GREATEST(importance, 0) + 1)
    * EXP(-EXTRACT(EPOCH FROM (now() - observed_at)) / 86400.0 / 7.0)
  ) FILTER (WHERE observed_at > now() - interval '14 days'), 0)::numeric, 4)
  + 2.0 * COUNT(*) FILTER (WHERE event_type = 'amended' AND observed_at > now() - interval '7 days')
  AS velocity_score,
  MAX(observed_at) AS last_event_at
FROM public.v_civic_genome_lifecycle_event_current_v3
GROUP BY state_code, source_bill_id;

COMMENT ON VIEW public.docket_bill_velocity IS
  'Deterministic 14-day decay-weighted legislative activity per bill (constants v1: decay=7d, amendment bonus=2.0). Reads canonical current lifecycle events (supersession applied). Default docket sort key; no verdict data involved.';
