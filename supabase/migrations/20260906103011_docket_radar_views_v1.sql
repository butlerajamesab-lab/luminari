-- Docket Radar + Countdown Spec, Sections 1-3
-- Read-model views. No writes to canonical tables; arithmetic over provider
-- fields and extracted traits only.

-- Current schedule: latest non-retracted observation per (bill_id, event_hash)
CREATE OR REPLACE VIEW public.docket_calendar_current AS
SELECT DISTINCT ON (bill_id, event_hash)
  bill_id, event_hash, event_date, event_time, event_type_raw, event_type_id,
  event_class, location, description, source_detail_fetched_at, observed_at
FROM public.docket_calendar_event_observation
WHERE retracted_at IS NULL
ORDER BY bill_id, event_hash, source_detail_fetched_at DESC;

COMMENT ON VIEW public.docket_calendar_current IS
  'Current per-event schedule projection. Latest non-retracted observation wins; history preserved in docket_calendar_event_observation.';

-- Countdown chip: nearest upcoming floor event per bill
CREATE OR REPLACE VIEW public.docket_bill_next_floor_event AS
SELECT
  bill_id,
  MIN(event_date) AS next_event_date,
  (ARRAY_AGG(event_class ORDER BY event_date, event_time NULLS LAST))[1] AS next_event_class,
  (ARRAY_AGG(description ORDER BY event_date, event_time NULLS LAST))[1] AS next_event_description,
  (ARRAY_AGG(location ORDER BY event_date, event_time NULLS LAST))[1] AS next_event_location,
  COUNT(*) AS upcoming_floor_events
FROM public.docket_calendar_current
WHERE event_class IN ('floor_reading','floor_action')
  AND event_date >= CURRENT_DATE
GROUP BY bill_id;

COMMENT ON VIEW public.docket_bill_next_floor_event IS
  'Nearest future floor_reading/floor_action per bill. Absence of a row means no scheduled floor event is observed; never guessed.';

-- Radar velocity: 14-day decay-weighted event activity + amendment bonus.
-- Governed constants v1: decay scale 7 days; amendment bonus weight 2.0; base weight importance+1.
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
FROM public.civic_genome_lifecycle_event_v2
GROUP BY state_code, source_bill_id;

COMMENT ON VIEW public.docket_bill_velocity IS
  'Deterministic 14-day decay-weighted legislative activity per bill (constants v1: decay=7d, amendment bonus=2.0). Default docket sort key; no verdict data involved.';

-- Drift delta: trait-class counts, latest version vs introduced base, along
-- civic_genome_bill_version predecessor chain (NOT bill_lineage_edge; empty).
CREATE OR REPLACE VIEW public.docket_bill_drift_delta AS
WITH version_traits AS (
  SELECT DISTINCT
    bv.genome_bill_id, bv.bill_version_id, bv.stage_rank, bv.provider_sequence,
    bv.base_bill_version_id, t.trait_class, t.trait_id
  FROM public.civic_genome_bill_version bv
  JOIN public.civic_genome_prism_verification_binding b
    ON b.assembly_run_id = bv.assembly_run_id
  JOIN public.civic_genome_trait t
    ON t.trait_id = b.trait_id
),
class_counts AS (
  SELECT genome_bill_id, bill_version_id, stage_rank, provider_sequence,
         base_bill_version_id, trait_class, COUNT(*) AS n
  FROM version_traits
  GROUP BY 1, 2, 3, 4, 5, 6
),
latest AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, bill_version_id
  FROM public.civic_genome_bill_version
  ORDER BY genome_bill_id, stage_rank DESC NULLS LAST, provider_sequence DESC NULLS LAST
),
base AS (
  SELECT DISTINCT genome_bill_id, base_bill_version_id
  FROM public.civic_genome_bill_version
  WHERE base_bill_version_id IS NOT NULL
)
SELECT
  l.genome_bill_id,
  cl.trait_class,
  COALESCE(cb.n, 0) AS base_count,
  cl.n AS latest_count,
  cl.n - COALESCE(cb.n, 0) AS delta
FROM latest l
JOIN class_counts cl ON cl.bill_version_id = l.bill_version_id
LEFT JOIN base b ON b.genome_bill_id = l.genome_bill_id
LEFT JOIN class_counts cb
  ON cb.bill_version_id = b.base_bill_version_id
 AND cb.trait_class = cl.trait_class;

COMMENT ON VIEW public.docket_bill_drift_delta IS
  'Per-bill trait-class structural delta: latest version vs introduced base. Counts of extracted traits only; displays numbers, never conclusions.';
