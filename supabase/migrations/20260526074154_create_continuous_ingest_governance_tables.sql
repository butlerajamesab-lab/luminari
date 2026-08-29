
-- luminari_continuous_ingest_sources: tracks external API source contracts
CREATE TABLE IF NOT EXISTS public.luminari_continuous_ingest_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_system text NOT NULL,
  api_base_url text NOT NULL,
  api_endpoint_pattern text,
  authentication_method text,
  required_secret_keys text[],
  declared_raw_table text NOT NULL,
  declared_target_tables text[] NOT NULL,
  conflict_key_spec text NOT NULL,
  pagination_strategy text,
  page_size integer,
  rate_limit_spec text,
  raw_record_dedup_strategy text,
  canonical_upsert_behavior text,
  ingest_job_lifecycle_pattern text,
  default_parameters jsonb,
  error_handling_behavior text,
  operational_status text DEFAULT 'blocked_contract_check_pending',
  last_verified_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- luminari_ingest_contract_checks: records schema contract validation results
CREATE TABLE IF NOT EXISTS public.luminari_ingest_contract_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.luminari_continuous_ingest_sources(source_key) ON DELETE CASCADE,
  table_name text NOT NULL,
  table_role text, -- 'raw' or 'canonical'
  exists boolean NOT NULL,
  check_status text NOT NULL, -- 'pass' or 'fail'
  blocker boolean DEFAULT false,
  schema_snapshot jsonb,
  mismatch_detail text,
  checked_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_continuous_ingest_source_key ON public.luminari_continuous_ingest_sources(source_key);
CREATE INDEX IF NOT EXISTS idx_ingest_contract_source ON public.luminari_ingest_contract_checks(source_key);
