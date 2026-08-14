CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS sais_import;

CREATE TABLE IF NOT EXISTS sais_import.import_run (
  run_id uuid PRIMARY KEY,
  import_version text NOT NULL,
  source_schema text NOT NULL,
  source_registry_sha256 text NOT NULL UNIQUE CHECK (source_registry_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  document_count integer NOT NULL CHECK (document_count >= 0),
  resource_count integer NOT NULL CHECK (resource_count >= 0),
  routing_item_count integer NOT NULL CHECK (routing_item_count >= 0),
  deadline_field_count integer NOT NULL CHECK (deadline_field_count >= 0),
  overlap_group_count integer NOT NULL CHECK (overlap_group_count >= 0),
  status text NOT NULL CHECK (status IN ('prepared','staged','verified','promotion_ready','promoted','failed')),
  source_preservation jsonb NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  staged_at timestamptz,
  verified_at timestamptz,
  promoted_at timestamptz
);

CREATE TABLE IF NOT EXISTS sais_import.source_document (
  document_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES sais_import.import_run(run_id) ON DELETE RESTRICT,
  document_number integer NOT NULL CHECK (document_number BETWEEN 1 AND 26),
  source_file text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  document_domain text NOT NULL,
  category_tags text[] NOT NULL,
  category_rule_version text NOT NULL,
  resource_count integer NOT NULL,
  routing_item_count integer NOT NULL,
  deadline_field_count integer NOT NULL,
  UNIQUE (run_id, document_number),
  UNIQUE (run_id, source_file)
);

CREATE TABLE IF NOT EXISTS sais_import.resource_candidate (
  candidate_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES sais_import.import_run(run_id) ON DELETE RESTRICT,
  resource_id text NOT NULL,
  candidate_fingerprint text NOT NULL CHECK (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  source_record_hash text NOT NULL CHECK (source_record_hash ~ '^[0-9a-f]{64}$'),
  document_id uuid NOT NULL REFERENCES sais_import.source_document(document_id) ON DELETE RESTRICT,
  document_number integer NOT NULL,
  document_domain text NOT NULL,
  category_tags text[] NOT NULL,
  category_rule_version text NOT NULL,
  source_file text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  title text NOT NULL,
  service_type text NOT NULL,
  organization_type text NOT NULL,
  jurisdiction_raw text NOT NULL,
  jurisdiction_scope text NOT NULL,
  jurisdiction_code text,
  official_url text,
  official_url_normalized text,
  official_urls jsonb NOT NULL,
  official_contact text NOT NULL,
  phone_numbers text[] NOT NULL,
  emails text[] NOT NULL,
  description text NOT NULL,
  statutory_authority text,
  statutory_source_urls jsonb NOT NULL,
  verification_status text NOT NULL,
  last_verified date,
  notes text NOT NULL,
  urgency_flags text[] NOT NULL,
  deadline_count integer NOT NULL CHECK (deadline_count >= 0),
  source_blocks jsonb NOT NULL,
  raw_record jsonb NOT NULL,
  match_status text NOT NULL DEFAULT 'uncompared' CHECK (match_status IN ('uncompared','exact','candidate_overlap','unique','conflict','held')),
  promotion_status text NOT NULL DEFAULT 'staged' CHECK (promotion_status IN ('staged','eligible','promoted','held')),
  canonical_target_table text,
  canonical_target_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, resource_id),
  UNIQUE (run_id, candidate_fingerprint)
);

CREATE TABLE IF NOT EXISTS sais_import.routing_item (
  routing_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES sais_import.import_run(run_id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES sais_import.source_document(document_id) ON DELETE RESTRICT,
  document_number integer NOT NULL,
  document_domain text NOT NULL,
  category_tags text[] NOT NULL,
  source_file text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_block_index integer NOT NULL,
  sequence integer NOT NULL,
  routing_text text NOT NULL,
  urgency_flags text[] NOT NULL,
  routing_hash text NOT NULL UNIQUE CHECK (routing_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, document_number, sequence)
);

CREATE TABLE IF NOT EXISTS sais_import.deadline_field (
  deadline_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES sais_import.import_run(run_id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES sais_import.resource_candidate(candidate_id) ON DELETE RESTRICT,
  resource_id text NOT NULL,
  document_number integer NOT NULL,
  source_file text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  deadline_kind text NOT NULL CHECK (deadline_kind IN ('appeal_deadline','continued_benefits_deadline','hearing_request_deadline','reconsideration_deadline','judicial_review_deadline','sol_deadline_read_this','sol_deadline')),
  source_label text NOT NULL,
  deadline_text text NOT NULL,
  urgency_flags text[] NOT NULL,
  deadline_hash text NOT NULL UNIQUE CHECK (deadline_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, resource_id, source_label)
);

CREATE TABLE IF NOT EXISTS sais_import.overlap_candidate (
  overlap_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES sais_import.import_run(run_id) ON DELETE RESTRICT,
  overlap_type text NOT NULL CHECK (overlap_type IN ('same_normalized_url','same_service_type')),
  normalized_value text NOT NULL,
  resource_ids text[] NOT NULL CHECK (cardinality(resource_ids) >= 2),
  policy text NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('candidate_not_merge','confirmed_duplicate','distinct_records','held')),
  overlap_hash text NOT NULL UNIQUE CHECK (overlap_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, overlap_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS sais_resource_candidate_url_idx ON sais_import.resource_candidate(official_url_normalized);
CREATE INDEX IF NOT EXISTS sais_resource_candidate_category_idx ON sais_import.resource_candidate USING gin(category_tags);
CREATE INDEX IF NOT EXISTS sais_resource_candidate_jurisdiction_idx ON sais_import.resource_candidate(jurisdiction_code, jurisdiction_scope);
CREATE INDEX IF NOT EXISTS sais_resource_candidate_promotion_idx ON sais_import.resource_candidate(promotion_status, match_status);
CREATE INDEX IF NOT EXISTS sais_routing_item_urgency_idx ON sais_import.routing_item USING gin(urgency_flags);
CREATE INDEX IF NOT EXISTS sais_deadline_field_kind_idx ON sais_import.deadline_field(deadline_kind, document_number);

CREATE OR REPLACE FUNCTION sais_import.resource_fingerprint_v1(
  p_resource_id text, p_title text, p_service_type text, p_organization_type text,
  p_jurisdiction_raw text, p_official_url text, p_official_contact text,
  p_statutory_authority text, p_verification_status text, p_source_sha256 text
) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO pg_catalog, extensions AS $function$
  SELECT encode(digest(concat_ws(chr(31), p_resource_id, p_title, p_service_type,
    p_organization_type, p_jurisdiction_raw, COALESCE(p_official_url,''),
    p_official_contact, COALESCE(p_statutory_authority,''),
    COALESCE(p_verification_status,''), p_source_sha256), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION sais_import.routing_hash_v1(
  p_document_number integer, p_sequence integer, p_source_block_index integer,
  p_routing_text text, p_source_sha256 text
) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO pg_catalog, extensions AS $function$
  SELECT encode(digest(concat_ws(chr(31), p_document_number::text, p_sequence::text,
    p_source_block_index::text, p_routing_text, p_source_sha256), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION sais_import.deadline_hash_v1(
  p_resource_id text, p_source_label text, p_deadline_text text, p_source_sha256 text
) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO pg_catalog, extensions AS $function$
  SELECT encode(digest(concat_ws(chr(31), p_resource_id, p_source_label,
    p_deadline_text, p_source_sha256), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION sais_import.guard_resource_candidate_immutable_v1()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO pg_catalog, sais_import AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SAIS source candidates cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['match_status','promotion_status','canonical_target_table','canonical_target_id','updated_at']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['match_status','promotion_status','canonical_target_table','canonical_target_id','updated_at']::text[]) THEN
    RAISE EXCEPTION 'SAIS source-bound candidate fields are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DO $block$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sais_resource_candidate_immutable_v1'
      AND tgrelid = 'sais_import.resource_candidate'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER sais_resource_candidate_immutable_v1
      BEFORE UPDATE OR DELETE ON sais_import.resource_candidate
      FOR EACH ROW EXECUTE FUNCTION sais_import.guard_resource_candidate_immutable_v1();
  END IF;
END $block$;

CREATE OR REPLACE VIEW public.v_sais_unified_resources_v1 AS
SELECT
  c.candidate_id AS resource_uuid,
  c.resource_id,
  c.title AS organization_name,
  c.jurisdiction_code,
  c.jurisdiction_scope,
  c.category_tags,
  'sais_systemic_abuse_intelligence'::text AS source_lanes,
  c.resource_id AS org_code,
  c.service_type,
  c.organization_type,
  c.official_url AS website,
  c.official_contact,
  c.phone_numbers,
  c.emails,
  c.description,
  c.statutory_authority AS statute_reference,
  c.verification_status,
  c.last_verified,
  c.notes AS verification_note,
  c.source_file AS source_document_id,
  c.source_sha256,
  c.candidate_fingerprint,
  c.deadline_count,
  c.urgency_flags,
  c.match_status,
  c.promotion_status
FROM sais_import.resource_candidate c;

CREATE OR REPLACE VIEW sais_import.v_import_summary AS
SELECT
  r.run_id, r.import_version, r.source_registry_sha256, r.manifest_sha256, r.status,
  r.document_count AS expected_documents,
  (SELECT count(*) FROM sais_import.source_document d WHERE d.run_id = r.run_id) AS actual_documents,
  r.resource_count AS expected_resources,
  (SELECT count(*) FROM sais_import.resource_candidate c WHERE c.run_id = r.run_id) AS actual_resources,
  r.routing_item_count AS expected_routing_items,
  (SELECT count(*) FROM sais_import.routing_item i WHERE i.run_id = r.run_id) AS actual_routing_items,
  r.deadline_field_count AS expected_deadline_fields,
  (SELECT count(*) FROM sais_import.deadline_field f WHERE f.run_id = r.run_id) AS actual_deadline_fields,
  r.overlap_group_count AS expected_overlap_groups,
  (SELECT count(*) FROM sais_import.overlap_candidate o WHERE o.run_id = r.run_id) AS actual_overlap_groups,
  r.created_at, r.staged_at, r.verified_at, r.promoted_at
FROM sais_import.import_run r;

CREATE OR REPLACE FUNCTION public.fetch_sais_import_summary_v1()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO pg_catalog, public, sais_import AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM sais_import.v_import_summary s;
$function$;

CREATE OR REPLACE FUNCTION public.inspect_sais_resource_target_contract_v1()
RETURNS TABLE (
  table_schema text, table_name text, column_name text, ordinal_position integer,
  data_type text, udt_name text, is_nullable text, column_default text
) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO pg_catalog, information_schema AS $function$
  SELECT c.table_schema::text, c.table_name::text, c.column_name::text,
    c.ordinal_position, c.data_type::text, c.udt_name::text,
    c.is_nullable::text, c.column_default::text
  FROM information_schema.columns c
  WHERE c.table_schema IN ('public','resource','registry')
    AND c.table_name IN ('resource','resources','unified_resources','registry_programs')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position;
$function$;

ALTER TABLE sais_import.import_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE sais_import.source_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE sais_import.resource_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sais_import.routing_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE sais_import.deadline_field ENABLE ROW LEVEL SECURITY;
ALTER TABLE sais_import.overlap_candidate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA sais_import FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA sais_import FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_sais_unified_resources_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fetch_sais_import_summary_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspect_sais_resource_target_contract_v1() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA sais_import TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA sais_import TO service_role;
GRANT SELECT ON public.v_sais_unified_resources_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_sais_import_summary_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.inspect_sais_resource_target_contract_v1() TO service_role;
