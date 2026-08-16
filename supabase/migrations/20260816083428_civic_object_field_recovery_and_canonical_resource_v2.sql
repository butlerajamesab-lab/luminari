-- Recovered from live production 2026-08-16.
-- Restores source-authored field recovery and object typing over preserved corpus candidates.

CREATE OR REPLACE FUNCTION public.luminari_first_nonempty_v2(VARIADIC p_values text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  select nullif(btrim(v), '')
  from unnest(p_values) with ordinality as t(v, ord)
  where nullif(btrim(v), '') is not null
  order by ord
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.luminari_extract_email_v2(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when p_value is null then null
    else (regexp_match(p_value, '(?i)([a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,})'))[1]
  end
$function$;

CREATE OR REPLACE FUNCTION public.luminari_extract_urlish_v2(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  with src as (
    select nullif(btrim(p_value), '') as v
  ), m as (
    select case
      when v is null then null
      when v ~* 'https?://[^[:space:]|,;]+' then
        (regexp_match(v, '(?i)(https?://[^[:space:]|,;]+)'))[1]
      when v ~* '(?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co)(?:/[^[:space:]|,;]*)?' then
        'https://' || (regexp_match(v, '(?i)((?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co)(?:/[^[:space:]|,;]*)?)'))[1]
      else null
    end as u
    from src
  )
  select regexp_replace(u, '[).]+$', '') from m
$function$;

CREATE OR REPLACE VIEW public.v_civic_object_reconciled_v2 AS
WITH base AS (
  SELECT
    c.*,
    a.artifact_role,
    lower(coalesce(c.section_name,'')) AS section_key,
    coalesce(c.payload->'row','{}'::jsonb) AS rowj,
    coalesce(c.payload->'fields','{}'::jsonb) AS fieldsj
  FROM public.luminari_corpus_candidate_v1 c
  JOIN public.luminari_corpus_source_artifact_v1 a USING (artifact_key)
), recovered AS (
  SELECT
    b.*,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.phone,b.fieldsj->>'phone',b.rowj->>'primary_phone',b.rowj->>'phone',b.rowj->>'phone_contact',
      b.rowj->>'contact_phone',b.rowj->>'phone_text',b.rowj->>'key_phone',b.rowj->>'phone_primary',
      case when coalesce(b.rowj->>'contact','') ~ '[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]' then b.rowj->>'contact' end,
      case when coalesce(b.rowj->>'agency_contact','') ~ '[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]' then b.rowj->>'agency_contact' end
    ]) AS recovered_phone,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.email,b.fieldsj->>'email',b.rowj->>'primary_email',b.rowj->>'email',b.rowj->>'contact_email',
      public.luminari_extract_email_v2(b.raw_excerpt)
    ]) AS recovered_email,
    public.luminari_extract_urlish_v2(public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.website_url,b.fieldsj->>'website_url',b.rowj->>'website_url',b.rowj->>'website',b.rowj->>'official_url',
      b.rowj->>'application_url',b.rowj->>'intake_url',b.rowj->>'complaint_url',b.rowj->>'contact_url',
      b.rowj->>'canonical_url',b.rowj->>'source_url',b.rowj->>'official_source_url',b.rowj->>'address_website',
      b.rowj->>'website_text',b.raw_excerpt
    ])) AS recovered_website_url,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.address,b.fieldsj->>'address',b.rowj->>'street_address',b.rowj->>'address',b.rowj->>'address_text',
      b.rowj->>'mailing_address',b.rowj->>'physical_address',b.rowj->>'full_address',b.rowj->>'office_address',
      case when coalesce(b.rowj->>'address_website','') ~* '\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd|drive|dr\.?|lane|ln\.?|suite|ste\.?|room|rm\.?|highway|hwy|po box|p\.o\. box)\b'
           then nullif(btrim(regexp_replace(b.rowj->>'address_website','\s*[·|]\s*(?:https?://)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co).*$','','i')),'') end
    ]) AS recovered_address,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.eligibility_summary,b.fieldsj->>'eligibility_summary',b.rowj->>'eligibility_summary',b.rowj->>'eligibility',
      b.rowj->>'eligibility_requirements',b.rowj->>'eligibility_rules',b.rowj->>'eligibility_raw'
    ]) AS recovered_eligibility,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.apply_notes,b.fieldsj->>'apply_notes',b.rowj->>'apply_notes',b.rowj->>'apply___notes',b.rowj->>'apply_notes_raw',b.rowj->>'where_to_apply'
    ]) AS recovered_apply_notes,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[b.description,b.fieldsj->>'description',b.rowj->>'description']) AS recovered_description,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[b.category,b.fieldsj->>'category',b.rowj->>'service_type',b.rowj->>'service_category',b.rowj->>'category']) AS recovered_category,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.fieldsj->>'statutory_authority',b.rowj->>'statutory_authority',b.rowj->>'statutory_authority_text',
      b.rowj->>'statute_citation',b.rowj->>'statute_reference',b.rowj->>'statute_of_limitations'
    ]) AS recovered_statutory_authority,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.fieldsj->>'filing_portal',b.rowj->>'filing_portal_url',b.rowj->>'complaint_url',b.rowj->>'intake_url',
      b.rowj->>'application_url',b.rowj->>'filing_portal',b.rowj->>'filing_portal_text'
    ]) AS recovered_filing_portal,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.rowj->>'deadline',b.rowj->>'filing_deadline',b.rowj->>'statute_of_limitations',b.rowj->>'sol_deadline',
      b.rowj->>'critical_deadlines',b.rowj->>'key_deadlines'
    ]) AS recovered_deadline,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[b.rowj->>'hours',b.rowj->>'hours_of_operation']) AS recovered_hours,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[b.rowj->>'languages',b.rowj->>'language']) AS recovered_languages,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[b.rowj->>'organization_type',b.fieldsj->>'organization_type',b.rowj->>'agency_type']) AS authored_organization_type,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.rowj->>'resource_name',b.rowj->>'program',b.rowj->>'name',b.rowj->>'organization_name',
      b.rowj->>'organization',b.rowj->>'agency_name',b.name
    ]) AS proposed_name,
    public.luminari_first_nonempty_v2(VARIADIC ARRAY[
      b.rowj->>'organization_name',b.rowj->>'organization',b.rowj->>'agency_name',b.rowj->>'agency_org',
      b.rowj->>'administering_agency',b.organization_name
    ]) AS proposed_organization
  FROM base b
), classified AS (
  SELECT r.*,
    CASE
      WHEN r.section_key = ANY(ARRAY['program_master','benefits_program_master','national_benefits_program','wa_registry_program','pass3_program_card','master_template_program']) THEN 'program'
      WHEN r.section_key = ANY(ARRAY['resource_master','bucket_resource','resource','deep_dive_resource','mh_resource','wa_resource_directory','federal_resource_directory','national_hotline','clean_partial_program','substrate_az_program']) THEN 'resource'
      WHEN r.section_key = ANY(ARRAY['resource_phone','resource_address','resource_email','bucket_resource_phone','bucket_resource_address','bucket_resource_email','address_audit_org','pass3_key_contact','substrate_state_contact']) THEN 'contact_record'
      WHEN r.section_key='entity_master' THEN 'organization'
      WHEN r.section_key = ANY(ARRAY['verified_enforcement_agency','state_agency_crosswalk','coalition_agency']) THEN 'agency'
      WHEN r.section_key = ANY(ARRAY['pass3_entity_escalation','federal_enforcement_pathway']) THEN 'enforcement_pathway'
      WHEN r.section_key = ANY(ARRAY['statute_master','verified_statute','legal_statutes_csv_import','statute_key_text','case_law_master','verified_case_law','case_statute_link']) THEN 'legal_authority'
      WHEN r.section_key = ANY(ARRAY['workflow_deadline_master','verified_workflow_deadline','pass3_workflow_step','pass3_workflow_summary','master_template_workflow','strategy_path_step']) THEN 'workflow'
      WHEN r.section_key = ANY(ARRAY['sol_scenario_deadline','sol_master']) THEN 'deadline'
      WHEN r.section_key = ANY(ARRAY['signal_master','pass3_policy_alert']) THEN 'policy_alert'
      WHEN r.section_key = ANY(ARRAY['weak_joint_master','pattern_registry']) THEN 'policy_pattern'
      WHEN r.section_key='case_instance_master' THEN 'case_instance'
      WHEN r.section_key = ANY(ARRAY['case_evidence','case_friction_source']) THEN 'case_evidence'
      WHEN r.section_key='case_finding' THEN 'case_finding'
      WHEN r.section_key='case_resolution_pathway' THEN 'case_resolution_pathway'
      WHEN r.section_key = ANY(ARRAY['jurisdiction_fact_master','state_registry_variant_note','state_registry_variant_row','federal_note','national_benefits_research_note','bucket_jurisdiction_narrative','pnw_jurisdiction','substrate_state_card']) THEN 'jurisdiction_fact'
      WHEN r.section_key='substrate_county_override' THEN 'jurisdiction_override'
      WHEN r.section_key = ANY(ARRAY['tribal_note','tribal_national_framework','unrecognized_tribes_row','unrecognized_tribes_note','unrecognized_tribes_framework_v','tribal_data_row','alaska_tribal_tables','tribal_national_matrix']) THEN 'tribal_governance_record'
      WHEN r.section_key = ANY(ARRAY['legislator_contact','federal_legislator_provenance','federal_legislator_committee']) THEN 'legislator'
      WHEN r.section_key='advocacy_target' THEN 'advocacy_target'
      WHEN r.section_key='advocacy_policy_domain' THEN 'policy_domain'
      WHEN r.section_key='coalition_network' THEN 'relationship_record'
      WHEN r.section_key='federal_agency_2025_status' THEN 'agency_status'
      WHEN r.section_key='strategy_path' THEN 'strategy_path'
      WHEN r.section_key='pressure_indicator' THEN 'pressure_indicator'
      WHEN r.section_key='platform_spec_master' THEN 'platform_specification'
      WHEN r.section_key = ANY(ARRAY['_schema_manifest','_schema_tables','_master_index','_route_binding','_next_moves','_promotion_map','_platform_synthesis','readme','source_document','corpus_import_queue']) THEN 'workbook_context'
      WHEN r.section_key='unresolved_citation' THEN 'unresolved_legal_reference'
      WHEN r.candidate_type='workbook_record' THEN 'unresolved_source_record'
      ELSE r.candidate_type
    END AS reconciled_object_class
  FROM recovered r
), named AS (
  SELECT cl.*,
    CASE WHEN cl.reconciled_object_class='resource' AND public.luminari_resource_name_invalid_v1(cl.proposed_name)
         THEN NULL ELSE nullif(btrim(cl.proposed_name),'') END AS recovered_name,
    CASE
      WHEN cl.proposed_organization IS NULL THEN NULL
      WHEN cl.proposed_organization ~ '^[0-9]+$' THEN NULL
      WHEN cl.proposed_organization ~ '^[0-9() +.\-]+$' AND length(regexp_replace(cl.proposed_organization,'\D','','g')) >= 7 THEN NULL
      ELSE nullif(btrim(cl.proposed_organization),'')
    END AS recovered_organization_name
  FROM classified cl
)
SELECT
  candidate_key AS object_ref,
  candidate_type AS source_object_type,
  reconciled_object_class AS object_class,
  CASE
    WHEN reconciled_object_class = ANY(ARRAY['resource','program']) THEN 'resource_directory'
    WHEN reconciled_object_class = ANY(ARRAY['legal_authority','unresolved_legal_reference']) THEN 'legal_library'
    WHEN reconciled_object_class = ANY(ARRAY['workflow','deadline','enforcement_pathway','oversight_body','agency','agency_status']) THEN 'workflow_and_accountability'
    WHEN reconciled_object_class = ANY(ARRAY['case_instance','case_evidence','case_finding','case_resolution_pathway']) THEN 'case_workspace'
    WHEN reconciled_object_class = ANY(ARRAY['policy_alert','policy_pattern','pressure_indicator']) THEN 'signal_context'
    WHEN reconciled_object_class = ANY(ARRAY['platform_specification','workbook_context']) THEN 'operator_context'
    ELSE 'typed_corpus'
  END AS target_surface,
  run_id,artifact_key,artifact_role,source_locator,source_content_sha256,candidate_hash,parser_version,
  jurisdiction,state_code,jurisdiction_resolution_state,section_name,
  recovered_name AS name,recovered_organization_name AS organization_name,recovered_category AS category,layer,
  recovered_phone AS phone,recovered_email AS email,recovered_website_url AS website_url,recovered_address AS address,
  recovered_eligibility AS eligibility_summary,recovered_apply_notes AS apply_notes,recovered_description AS description,
  recovered_filing_portal AS filing_portal,public.luminari_extract_urlish_v2(recovered_filing_portal) AS filing_portal_url,
  recovered_statutory_authority AS statutory_authority,recovered_deadline AS deadline,recovered_hours AS hours,
  recovered_languages AS languages,authored_organization_type AS organization_type,candidate_state,created_at,payload,raw_excerpt,
  jsonb_strip_nulls(jsonb_build_object(
    'phone',case when nullif(btrim(phone),'') is not null then 'candidate.phone'
                 when nullif(btrim(fieldsj->>'phone'),'') is not null then 'payload.fields.phone'
                 when nullif(btrim(rowj->>'primary_phone'),'') is not null then 'payload.row.primary_phone'
                 when nullif(btrim(rowj->>'phone'),'') is not null then 'payload.row.phone'
                 when nullif(btrim(rowj->>'phone_contact'),'') is not null then 'payload.row.phone_contact'
                 when nullif(btrim(rowj->>'contact_phone'),'') is not null then 'payload.row.contact_phone'
                 when nullif(btrim(rowj->>'phone_text'),'') is not null then 'payload.row.phone_text' end,
    'email',case when nullif(btrim(email),'') is not null then 'candidate.email'
                 when nullif(btrim(fieldsj->>'email'),'') is not null then 'payload.fields.email'
                 when nullif(btrim(rowj->>'primary_email'),'') is not null then 'payload.row.primary_email'
                 when nullif(btrim(rowj->>'email'),'') is not null then 'payload.row.email'
                 when nullif(btrim(rowj->>'contact_email'),'') is not null then 'payload.row.contact_email'
                 when public.luminari_extract_email_v2(raw_excerpt) is not null then 'candidate.raw_excerpt' end,
    'website_url',case when public.luminari_extract_urlish_v2(website_url) is not null then 'candidate.website_url'
                 when public.luminari_extract_urlish_v2(fieldsj->>'website_url') is not null then 'payload.fields.website_url'
                 when public.luminari_extract_urlish_v2(rowj->>'website_url') is not null then 'payload.row.website_url'
                 when public.luminari_extract_urlish_v2(rowj->>'website') is not null then 'payload.row.website'
                 when public.luminari_extract_urlish_v2(rowj->>'address_website') is not null then 'payload.row.address_website'
                 when public.luminari_extract_urlish_v2(raw_excerpt) is not null then 'candidate.raw_excerpt' end,
    'address',case when nullif(btrim(address),'') is not null then 'candidate.address'
                 when nullif(btrim(fieldsj->>'address'),'') is not null then 'payload.fields.address'
                 when nullif(btrim(rowj->>'street_address'),'') is not null then 'payload.row.street_address'
                 when nullif(btrim(rowj->>'address'),'') is not null then 'payload.row.address'
                 when nullif(btrim(rowj->>'address_text'),'') is not null then 'payload.row.address_text'
                 when nullif(btrim(rowj->>'address_website'),'') is not null then 'payload.row.address_website' end
  )) AS field_provenance,
  coalesce(nullif(btrim(recovered_phone),''),nullif(btrim(recovered_email),''),nullif(btrim(recovered_website_url),''),
           nullif(btrim(recovered_address),''),public.luminari_extract_urlish_v2(recovered_filing_portal)) is not null AS has_access_point,
  CASE
    WHEN reconciled_object_class='resource' AND recovered_name IS NULL THEN 'resource_needs_identity_recovery'
    WHEN reconciled_object_class='resource' AND coalesce(nullif(btrim(recovered_phone),''),nullif(btrim(recovered_email),''),
         nullif(btrim(recovered_website_url),''),nullif(btrim(recovered_address),''),public.luminari_extract_urlish_v2(recovered_filing_portal)) IS NULL
      THEN 'resource_missing_access_point'
    WHEN reconciled_object_class='resource' THEN 'usable_resource_candidate'
    ELSE 'typed_non_resource'
  END AS projection_state
FROM named;

REVOKE ALL ON FUNCTION public.luminari_first_nonempty_v2(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.luminari_extract_email_v2(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.luminari_extract_urlish_v2(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luminari_first_nonempty_v2(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.luminari_extract_email_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.luminari_extract_urlish_v2(text) TO service_role;
