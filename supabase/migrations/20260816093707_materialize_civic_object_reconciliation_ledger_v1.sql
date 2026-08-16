-- Recovered from live production 2026-08-16.
-- Materializes the expensive read-time civic-object reconciliation into an indexed derived ledger.
-- Raw source candidates remain canonical provenance and are not rewritten.

CREATE TABLE IF NOT EXISTS public.luminari_civic_object_reconciliation_v1 (
  object_ref text PRIMARY KEY,
  source_object_type text NOT NULL,
  object_class text NOT NULL,
  target_surface text NOT NULL,
  run_id uuid NOT NULL,
  artifact_key text NOT NULL,
  artifact_role text,
  source_locator text NOT NULL,
  source_content_sha256 text,
  source_candidate_hash text NOT NULL,
  parser_version text NOT NULL,
  jurisdiction text,
  state_code text,
  jurisdiction_resolution_state text NOT NULL,
  section_name text,
  name text,
  organization_name text,
  category text,
  layer text,
  phone text,
  email text,
  website_url text,
  address text,
  eligibility_summary text,
  apply_notes text,
  description text,
  filing_portal text,
  filing_portal_url text,
  statutory_authority text,
  deadline text,
  hours text,
  languages text,
  organization_type text,
  candidate_state text NOT NULL,
  source_created_at timestamptz NOT NULL,
  field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_access_point boolean NOT NULL DEFAULT false,
  projection_state text NOT NULL,
  projection_version text NOT NULL DEFAULT 'civic_object_reconciliation_v1',
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS luminari_civic_object_reconciliation_v1_artifact_idx
  ON public.luminari_civic_object_reconciliation_v1 (artifact_key);
CREATE INDEX IF NOT EXISTS luminari_civic_object_reconciliation_v1_class_idx
  ON public.luminari_civic_object_reconciliation_v1 (object_class, projection_state);
CREATE INDEX IF NOT EXISTS luminari_civic_object_reconciliation_v1_jurisdiction_idx
  ON public.luminari_civic_object_reconciliation_v1 (state_code, jurisdiction);
CREATE INDEX IF NOT EXISTS luminari_civic_object_reconciliation_v1_state_idx
  ON public.luminari_civic_object_reconciliation_v1 (candidate_state, jurisdiction_resolution_state);
CREATE INDEX IF NOT EXISTS luminari_civic_object_reconciliation_v1_surface_idx
  ON public.luminari_civic_object_reconciliation_v1 (target_surface, object_class);

ALTER TABLE public.luminari_civic_object_reconciliation_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.luminari_civic_object_reconciliation_v1 FROM anon, authenticated;
GRANT ALL ON public.luminari_civic_object_reconciliation_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_luminari_civic_object_v1(p_candidate_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_written boolean := false;
begin
  insert into public.luminari_civic_object_reconciliation_v1 (
    object_ref, source_object_type, object_class, target_surface,
    run_id, artifact_key, artifact_role, source_locator,
    source_content_sha256, source_candidate_hash, parser_version,
    jurisdiction, state_code, jurisdiction_resolution_state, section_name,
    name, organization_name, category, layer,
    phone, email, website_url, address,
    eligibility_summary, apply_notes, description,
    filing_portal, filing_portal_url, statutory_authority, deadline,
    hours, languages, organization_type,
    candidate_state, source_created_at, field_provenance,
    has_access_point, projection_state, projection_version, reconciled_at
  )
  select
    r.object_ref, r.source_object_type, r.object_class, r.target_surface,
    r.run_id, r.artifact_key, r.artifact_role, r.source_locator,
    r.source_content_sha256, r.candidate_hash, r.parser_version,
    r.jurisdiction, r.state_code, r.jurisdiction_resolution_state, r.section_name,
    r.name, r.organization_name, r.category, r.layer,
    r.phone, r.email, r.website_url, r.address,
    r.eligibility_summary, r.apply_notes, r.description,
    r.filing_portal, r.filing_portal_url, r.statutory_authority, r.deadline,
    r.hours, r.languages, r.organization_type,
    r.candidate_state, r.created_at, r.field_provenance,
    r.has_access_point, r.projection_state,
    'civic_object_reconciliation_v1', now()
  from public.v_civic_object_reconciled_v2 r
  where r.object_ref = p_candidate_key
  on conflict (object_ref) do update set
    source_object_type = excluded.source_object_type,
    object_class = excluded.object_class,
    target_surface = excluded.target_surface,
    run_id = excluded.run_id,
    artifact_key = excluded.artifact_key,
    artifact_role = excluded.artifact_role,
    source_locator = excluded.source_locator,
    source_content_sha256 = excluded.source_content_sha256,
    source_candidate_hash = excluded.source_candidate_hash,
    parser_version = excluded.parser_version,
    jurisdiction = excluded.jurisdiction,
    state_code = excluded.state_code,
    jurisdiction_resolution_state = excluded.jurisdiction_resolution_state,
    section_name = excluded.section_name,
    name = excluded.name,
    organization_name = excluded.organization_name,
    category = excluded.category,
    layer = excluded.layer,
    phone = excluded.phone,
    email = excluded.email,
    website_url = excluded.website_url,
    address = excluded.address,
    eligibility_summary = excluded.eligibility_summary,
    apply_notes = excluded.apply_notes,
    description = excluded.description,
    filing_portal = excluded.filing_portal,
    filing_portal_url = excluded.filing_portal_url,
    statutory_authority = excluded.statutory_authority,
    deadline = excluded.deadline,
    hours = excluded.hours,
    languages = excluded.languages,
    organization_type = excluded.organization_type,
    candidate_state = excluded.candidate_state,
    source_created_at = excluded.source_created_at,
    field_provenance = excluded.field_provenance,
    has_access_point = excluded.has_access_point,
    projection_state = excluded.projection_state,
    projection_version = excluded.projection_version,
    reconciled_at = excluded.reconciled_at;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_luminari_civic_objects_batch_v1(p_limit integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text;
  v_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'p_limit must be between 1 and 10000';
  end if;

  for v_key in
    select c.candidate_key
    from public.luminari_corpus_candidate_v1 c
    left join public.luminari_civic_object_reconciliation_v1 r
      on r.object_ref = c.candidate_key
    where r.object_ref is null
       or r.source_candidate_hash is distinct from c.candidate_hash
       or r.projection_version <> 'civic_object_reconciliation_v1'
    order by c.created_at, c.candidate_key
    limit p_limit
  loop
    perform public.reconcile_luminari_civic_object_v1(v_key);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_luminari_civic_object_reconciliation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  perform public.reconcile_luminari_civic_object_v1(new.candidate_key);
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_sync_luminari_civic_object_reconciliation_v1
  ON public.luminari_corpus_candidate_v1;
CREATE TRIGGER trg_sync_luminari_civic_object_reconciliation_v1
AFTER INSERT OR UPDATE ON public.luminari_corpus_candidate_v1
FOR EACH ROW EXECUTE FUNCTION public.sync_luminari_civic_object_reconciliation_v1();

CREATE OR REPLACE VIEW public.v_luminari_civic_object_reconciliation_status_v1
WITH (security_invoker = true) AS
SELECT
  count(*) AS reconciled_rows,
  count(*) FILTER (WHERE projection_version = 'civic_object_reconciliation_v1') AS current_projection_rows,
  count(*) FILTER (WHERE object_class = 'resource') AS resource_rows,
  count(*) FILTER (WHERE projection_state = 'usable_resource_candidate') AS usable_resource_candidates,
  count(*) FILTER (WHERE projection_state = 'resource_needs_identity_recovery') AS resource_needs_identity_recovery,
  count(*) FILTER (WHERE projection_state = 'resource_missing_access_point') AS resource_missing_access_point,
  count(*) FILTER (WHERE object_class = 'unresolved_source_record') AS unresolved_source_records,
  max(reconciled_at) AS latest_reconciled_at
FROM public.luminari_civic_object_reconciliation_v1;

REVOKE ALL ON FUNCTION public.reconcile_luminari_civic_object_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_luminari_civic_objects_batch_v1(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_luminari_civic_object_reconciliation_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_luminari_civic_object_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_luminari_civic_objects_batch_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_luminari_civic_object_reconciliation_v1() TO service_role;
REVOKE ALL ON public.v_luminari_civic_object_reconciliation_status_v1 FROM anon, authenticated;
GRANT SELECT ON public.v_luminari_civic_object_reconciliation_status_v1 TO service_role;

-- Historical backfill is intentionally performed operationally in bounded batches via
-- reconcile_luminari_civic_objects_batch_v1(), not as one unbounded migration transaction.
