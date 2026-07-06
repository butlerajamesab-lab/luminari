CREATE TABLE IF NOT EXISTS public.intake_staging (
  id                    bigserial PRIMARY KEY,
  source_file           text NOT NULL,
  source_type           text NOT NULL,
  source_record_id      text,
  name                  text,
  acronym               text,
  record_type           text,
  phone                 text,
  email                 text,
  website               text,
  complaint_url         text,
  address               text,
  state                 text,
  jurisdiction          text,
  domains               text[],
  org_type              text,
  description           text,
  service_type          text,
  eligibility           text,
  statutory_authority   text,
  notes                 text,
  raw_payload           jsonb,
  content_hash          text,
  ingested_by           text DEFAULT 'script',
  intake_status         text NOT NULL DEFAULT 'staged',
  promoted_record_id    text,
  promoted_at           timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.intake_staging ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.intake_staging ADD COLUMN IF NOT EXISTS ingested_by text DEFAULT 'script';

CREATE TABLE IF NOT EXISTS public.intake_promotion_log (
  id                 bigserial PRIMARY KEY,
  intake_staging_id  bigint REFERENCES public.intake_staging(id),
  registry_record_id text NOT NULL,
  source_file        text,
  source_type        text,
  record_name        text,
  state              text,
  content_hash       text,
  hash_verified      boolean DEFAULT false,
  promoted_by        text DEFAULT 'script',
  promotion_run_id   text,
  dry_run            boolean DEFAULT false,
  was_upsert         boolean DEFAULT false,
  success            boolean NOT NULL DEFAULT true,
  error_message      text,
  created_at         timestamptz DEFAULT now()
);

CREATE OR REPLACE VIEW public.registry_record_provenance AS
SELECT
  rp.id                  AS registry_record_id,
  rp.name,
  rp.state,
  rp.source_file,
  s.content_hash         AS ingested_hash,
  l.content_hash         AS promoted_hash,
  l.hash_verified,
  l.promoted_by,
  l.promotion_run_id,
  l.dry_run,
  l.was_upsert,
  l.created_at           AS promoted_at,
  s.created_at           AS ingested_at,
  s.source_type,
  s.raw_payload
FROM public.registry_programs rp
LEFT JOIN public.intake_staging s ON s.id = rp.intake_staging_id
LEFT JOIN public.intake_promotion_log l ON l.registry_record_id = rp.id AND l.success = true
ORDER BY l.created_at DESC;
