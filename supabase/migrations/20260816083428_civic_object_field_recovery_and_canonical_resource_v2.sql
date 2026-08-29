-- Additive reconciliation layer: recover source-authored fields that survived in candidate payloads,
-- correct historical workbook routing mistakes, and expose a current canonical resource view.
-- No source/candidate/snapshot rows are mutated.

create or replace function public.luminari_first_nonempty_v2(variadic p_values text[])
returns text
language sql
immutable
parallel safe
as $$
  select nullif(btrim(v), '')
  from unnest(p_values) with ordinality as t(v, ord)
  where nullif(btrim(v), '') is not null
  order by ord
  limit 1
$$;

create or replace function public.luminari_extract_urlish_v2(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  with src as (
    select nullif(btrim(p_value), '') as v
  ), m as (
    select
      case
        when v is null then null
        when v ~* 'https?://[^[:space:]|,;]+' then (regexp_match(v, '(?i)(https?://[^[:space:]|,;]+)'))[1]
        when v ~* '(?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co)(?:/[^[:space:]|,;]*)?' then
          'https://' || (regexp_match(v, '(?i)((?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co)(?:/[^[:space:]|,;]*)?)'))[1]
        else null
      end as u
    from src
  )
  select regexp_replace(u, '[).]+$', '') from m
$$;

create or replace function public.luminari_extract_email_v2(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_value is null then null
    else (regexp_match(p_value, '(?i)([a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,})'))[1]
  end
$$;

create or replace view public.v_civic_object_reconciled_v2 as
with base as (
  select
    c.*,
    a.artifact_role,
    lower(coalesce(c.section_name, '')) as section_key,
    coalesce(c.payload->'row', '{}'::jsonb) as rowj,
    coalesce(c.payload->'fields', '{}'::jsonb) as fieldsj
  from public.luminari_corpus_candidate_v1 c
  join public.luminari_corpus_source_artifact_v1 a using (artifact_key)
), recovered as (
  select
    b.*,
    public.luminari_first_nonempty_v2(
      b.phone,
      b.fieldsj->>'phone',
      b.rowj->>'primary_phone', b.rowj->>'phone', b.rowj->>'phone_contact',
      b.rowj->>'contact_phone', b.rowj->>'phone_text', b.rowj->>'key_phone', b.rowj->>'phone_primary',
      case when coalesce(b.rowj->>'contact','') ~ '[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]' then b.rowj->>'contact' end,
      case when coalesce(b.rowj->>'agency_contact','') ~ '[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]' then b.rowj->>'agency_contact' end
    ) as recovered_phone,
    public.luminari_first_nonempty_v2(
      b.email,
      b.fieldsj->>'email',
      b.rowj->>'primary_email', b.rowj->>'email', b.rowj->>'contact_email',
      public.luminari_extract_email_v2(b.raw_excerpt)
    ) as recovered_email,
    public.luminari_extract_urlish_v2(public.luminari_first_nonempty_v2(
      b.website_url,
      b.fieldsj->>'website_url',
      b.rowj->>'website_url', b.rowj->>'website', b.rowj->>'official_url',
      b.rowj->>'application_url', b.rowj->>'intake_url', b.rowj->>'complaint_url',
      b.rowj->>'contact_url', b.rowj->>'canonical_url', b.rowj->>'source_url', b.rowj->>'official_source_url',
      b.rowj->>'address_website', b.rowj->>'website_text', b.raw_excerpt
    )) as recovered_website_url,
    public.luminari_first_nonempty_v2(
      b.address,
      b.fieldsj->>'address',
      b.rowj->>'street_address', b.rowj->>'address', b.rowj->>'address_text',
      b.rowj->>'mailing_address', b.rowj->>'physical_address', b.rowj->>'full_address', b.rowj->>'office_address',
      case
        when coalesce(b.rowj->>'address_website','') ~* '\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd|drive|dr\.?|lane|ln\.?|suite|ste\.?|room|rm\.?|highway|hwy|po box|p\.o\. box)\b'
        then nullif(btrim(regexp_replace(b.rowj->>'address_website', '\s*[·|]\s*(?:https?://)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:org|gov|com|net|edu|us|mil|io|co).*$','','i')), '')
      end
    ) as recovered_address,
    public.luminari_first_nonempty_v2(
      b.eligibility_summary,
      b.fieldsj->>'eligibility_summary',
      b.rowj->>'eligibility_summary', b.rowj->>'eligibility', b.rowj->>'eligibility_requirements',
      b.rowj->>'eligibility_rules', b.rowj->>'eligibility_raw'
    ) as recovered_eligibility,
    public.luminari_first_nonempty_v2(
      b.apply_notes,
      b.fieldsj->>'apply_notes',
      b.rowj->>'apply_notes', b.rowj->>'apply___notes', b.rowj->>'apply_notes_raw', b.rowj->>'where_to_apply'
    ) as recovered_apply_notes,
    public.luminari_first_nonempty_v2(
      b.description,
      b.fieldsj->>'description', b.rowj->>'description'
    ) as recovered_description,
    public.luminari_first_nonempty_v2(
      b.category,
      b.fieldsj->>'category', b.rowj->>'service_type', b.rowj->>'service_category', b.rowj->>'category'
    ) as recovered_category,
    public.luminari_first_nonempty_v2(
      b.fieldsj->>'statutory_authority', b.rowj->>'statutory_authority', b.rowj->>'statutory_authority_text',
      b.rowj->>'statute_citation', b.rowj->>'statute_reference', b.rowj->>'statute_of_limitations'
    ) as recovered_statutory_authority,
    public.luminari_first_nonempty_v2(
      b.fieldsj->>'filing_portal', b.rowj->>'filing_portal_url', b.rowj->>'complaint_url',
      b.rowj->>'intake_url', b.rowj->>'application_url', b.rowj->>'filing_portal', b.rowj->>'filing_portal_text'
    ) as recovered_filing_portal,
    public.luminari_first_nonempty_v2(
      b.rowj->>'deadline', b.rowj->>'filing_deadline', b.rowj->>'statute_of_limitations',
      b.rowj->>'sol_deadline', b.rowj->>'critical_deadlines', b.rowj->>'key_deadlines'
    ) as recovered_deadline,
    public.luminari_first_nonempty_v2(b.rowj->>'hours', b.rowj->>'hours_of_operation') as recovered_hours,
    public.luminari_first_nonempty_v2(b.rowj->>'languages', b.rowj->>'language') as recovered_languages,
    public.luminari_first_nonempty_v2(
      b.rowj->>'organization_type', b.fieldsj->>'organization_type', b.rowj->>'agency_type'
    ) as authored_organization_type,
    public.luminari_first_nonempty_v2(
      b.rowj->>'resource_name', b.rowj->>'program', b.rowj->>'name',
      b.rowj->>'organization_name', b.rowj->>'organization', b.rowj->>'agency_name', b.name
    ) as proposed_name,
    public.luminari_first_nonempty_v2(
      b.rowj->>'organization_name', b.rowj->>'organization', b.rowj->>'agency_name',
      b.rowj->>'agency_org', b.rowj->>'administering_agency', b.organization_name
    ) as proposed_organization
  from base b
), classified as (
  select
    r.*,
    case
      -- Source-authored workbook semantics outrank historical parser guesses.
      when r.section_key in ('program_master','benefits_program_master','national_benefits_program','wa_registry_program','pass3_program_card','master_template_program') then 'program'
      when r.section_key in ('resource_master','bucket_resource','resource','deep_dive_resource','mh_resource','wa_resource_directory','federal_resource_directory','national_hotline','clean_partial_program','substrate_az_program') then 'resource'
      when r.section_key in ('resource_phone','resource_address','resource_email','bucket_resource_phone','bucket_resource_address','bucket_resource_email','address_audit_org','pass3_key_contact','substrate_state_contact') then 'contact_record'
      when r.section_key='entity_master' then 'organization'
      when r.section_key in ('verified_enforcement_agency','state_agency_crosswalk','coalition_agency') then 'agency'
      when r.section_key in ('pass3_entity_escalation','federal_enforcement_pathway') then 'enforcement_pathway'
      when r.section_key in ('statute_master','verified_statute','legal_statutes_csv_import','statute_key_text','case_law_master','verified_case_law','case_statute_link') then 'legal_authority'
      when r.section_key in ('workflow_deadline_master','verified_workflow_deadline','pass3_workflow_step','pass3_workflow_summary','master_template_workflow','strategy_path_step') then 'workflow'
      when r.section_key in ('sol_scenario_deadline','sol_master') then 'deadline'
      when r.section_key in ('signal_master','pass3_policy_alert') then 'policy_alert'
      when r.section_key in ('weak_joint_master','pattern_registry') then 'policy_pattern'
      when r.section_key='case_instance_master' then 'case_instance'
      when r.section_key in ('case_evidence','case_friction_source') then 'case_evidence'
      when r.section_key='case_finding' then 'case_finding'
      when r.section_key='case_resolution_pathway' then 'case_resolution_pathway'
      when r.section_key in ('jurisdiction_fact_master','state_registry_variant_note','state_registry_variant_row','federal_note','national_benefits_research_note','bucket_jurisdiction_narrative','pnw_jurisdiction','substrate_state_card') then 'jurisdiction_fact'
      when r.section_key='substrate_county_override' then 'jurisdiction_override'
      when r.section_key in ('tribal_note','tribal_national_framework','unrecognized_tribes_row','unrecognized_tribes_note','unrecognized_tribes_framework_v','tribal_data_row','alaska_tribal_tables','tribal_national_matrix') then 'tribal_governance_record'
      when r.section_key in ('legislator_contact','federal_legislator_provenance','federal_legislator_committee') then 'legislator'
      when r.section_key='advocacy_target' then 'advocacy_target'
      when r.section_key='advocacy_policy_domain' then 'policy_domain'
      when r.section_key='coalition_network' then 'relationship_record'
      when r.section_key='federal_agency_2025_status' then 'agency_status'
      when r.section_key='strategy_path' then 'strategy_path'
      when r.section_key='pressure_indicator' then 'pressure_indicator'
      when r.section_key='platform_spec_master' then 'platform_specification'
      when r.section_key in ('_schema_manifest','_schema_tables','_master_index','_route_binding','_next_moves','_promotion_map','_platform_synthesis','readme','source_document','corpus_import_queue') then 'workbook_context'
      when r.section_key='unresolved_citation' then 'unresolved_legal_reference'
      when r.candidate_type='workbook_record' then 'unresolved_source_record'
      else r.candidate_type
    end as reconciled_object_class
  from recovered r
), named as (
  select
    cl.*,
    case
      when cl.reconciled_object_class='resource' and public.luminari_resource_name_invalid_v1(cl.proposed_name) then null
      else nullif(btrim(cl.proposed_name),'')
    end as recovered_name,
    case
      when cl.proposed_organization is null then null
      when cl.proposed_organization ~ '^[0-9]+$' then null
      when cl.proposed_organization ~ '^[0-9() +.\-]+$' and length(regexp_replace(cl.proposed_organization,'\D','','g'))>=7 then null
      else nullif(btrim(cl.proposed_organization),'')
    end as recovered_organization_name
  from classified cl
)
select
  n.candidate_key as object_ref,
  n.candidate_type as source_object_type,
  n.reconciled_object_class as object_class,
  case
    when n.reconciled_object_class in ('resource','program') then 'resource_directory'
    when n.reconciled_object_class in ('legal_authority','unresolved_legal_reference') then 'legal_library'
    when n.reconciled_object_class in ('workflow','deadline','enforcement_pathway','oversight_body','agency','agency_status') then 'workflow_and_accountability'
    when n.reconciled_object_class in ('case_instance','case_evidence','case_finding','case_resolution_pathway') then 'case_workspace'
    when n.reconciled_object_class in ('policy_alert','policy_pattern','pressure_indicator') then 'signal_context'
    when n.reconciled_object_class in ('platform_specification','workbook_context') then 'operator_context'
    else 'typed_corpus'
  end as target_surface,
  n.run_id,n.artifact_key,n.artifact_role,n.source_locator,n.source_content_sha256,n.candidate_hash,n.parser_version,
  n.jurisdiction,n.state_code,n.jurisdiction_resolution_state,n.section_name,
  n.recovered_name as name,
  n.recovered_organization_name as organization_name,
  n.recovered_category as category,
  n.layer,
  n.recovered_phone as phone,
  n.recovered_email as email,
  n.recovered_website_url as website_url,
  n.recovered_address as address,
  n.recovered_eligibility as eligibility_summary,
  n.recovered_apply_notes as apply_notes,
  n.recovered_description as description,
  n.recovered_filing_portal as filing_portal,
  public.luminari_extract_urlish_v2(n.recovered_filing_portal) as filing_portal_url,
  n.recovered_statutory_authority as statutory_authority,
  n.recovered_deadline as deadline,
  n.recovered_hours as hours,
  n.recovered_languages as languages,
  n.authored_organization_type as organization_type,
  n.candidate_state,n.created_at,n.payload,n.raw_excerpt,
  jsonb_strip_nulls(jsonb_build_object(
    'phone', case when nullif(btrim(n.phone),'') is not null then 'candidate.phone'
                  when nullif(btrim(n.fieldsj->>'phone'),'') is not null then 'payload.fields.phone'
                  when nullif(btrim(n.rowj->>'primary_phone'),'') is not null then 'payload.row.primary_phone'
                  when nullif(btrim(n.rowj->>'phone'),'') is not null then 'payload.row.phone'
                  when nullif(btrim(n.rowj->>'phone_contact'),'') is not null then 'payload.row.phone_contact'
                  when nullif(btrim(n.rowj->>'contact_phone'),'') is not null then 'payload.row.contact_phone'
                  when nullif(btrim(n.rowj->>'phone_text'),'') is not null then 'payload.row.phone_text'
                  else null end,
    'email', case when nullif(btrim(n.email),'') is not null then 'candidate.email'
                  when nullif(btrim(n.fieldsj->>'email'),'') is not null then 'payload.fields.email'
                  when nullif(btrim(n.rowj->>'primary_email'),'') is not null then 'payload.row.primary_email'
                  when nullif(btrim(n.rowj->>'email'),'') is not null then 'payload.row.email'
                  when nullif(btrim(n.rowj->>'contact_email'),'') is not null then 'payload.row.contact_email'
                  when public.luminari_extract_email_v2(n.raw_excerpt) is not null then 'candidate.raw_excerpt'
                  else null end,
    'website_url', case when public.luminari_extract_urlish_v2(n.website_url) is not null then 'candidate.website_url'
                        when public.luminari_extract_urlish_v2(n.fieldsj->>'website_url') is not null then 'payload.fields.website_url'
                        when public.luminari_extract_urlish_v2(n.rowj->>'website_url') is not null then 'payload.row.website_url'
                        when public.luminari_extract_urlish_v2(n.rowj->>'website') is not null then 'payload.row.website'
                        when public.luminari_extract_urlish_v2(n.rowj->>'address_website') is not null then 'payload.row.address_website'
                        when public.luminari_extract_urlish_v2(n.raw_excerpt) is not null then 'candidate.raw_excerpt'
                        else null end,
    'address', case when nullif(btrim(n.address),'') is not null then 'candidate.address'
                    when nullif(btrim(n.fieldsj->>'address'),'') is not null then 'payload.fields.address'
                    when nullif(btrim(n.rowj->>'street_address'),'') is not null then 'payload.row.street_address'
                    when nullif(btrim(n.rowj->>'address'),'') is not null then 'payload.row.address'
                    when nullif(btrim(n.rowj->>'address_text'),'') is not null then 'payload.row.address_text'
                    when nullif(btrim(n.rowj->>'address_website'),'') is not null then 'payload.row.address_website'
                    else null end
  )) as field_provenance,
  coalesce(nullif(btrim(n.recovered_phone),''),nullif(btrim(n.recovered_email),''),nullif(btrim(n.recovered_website_url),''),nullif(btrim(n.recovered_address),''),public.luminari_extract_urlish_v2(n.recovered_filing_portal)) is not null as has_access_point,
  case
    when n.reconciled_object_class='resource' and n.recovered_name is null then 'resource_needs_identity_recovery'
    when n.reconciled_object_class='resource' and coalesce(nullif(btrim(n.recovered_phone),''),nullif(btrim(n.recovered_email),''),nullif(btrim(n.recovered_website_url),''),nullif(btrim(n.recovered_address),''),public.luminari_extract_urlish_v2(n.recovered_filing_portal)) is null then 'resource_missing_access_point'
    when n.reconciled_object_class='resource' then 'usable_resource_candidate'
    else 'typed_non_resource'
  end as projection_state
from named n;

comment on view public.v_civic_object_reconciled_v2 is
  'Provenance-preserving reconciliation view. Recovers fields from payload/raw excerpts and lets source-authored workbook semantics outrank historical parser guesses without mutating source candidates.';

create or replace view public.v_civic_resource_canonical_v2 as
with current_snapshot as (
  select snapshot_id,snapshot_version
  from public.luminari_resource_snapshot_v1
  where is_current=true
  order by activated_at desc nulls last,created_at desc
  limit 1
), ids as (
  select i.*,s.snapshot_version
  from public.luminari_resource_snapshot_identity_v1 i
  join current_snapshot s using(snapshot_id)
), candidate_fields as (
  select
    i.resource_entity_id,
    (array_agg(r.phone order by (r.phone is not null) desc,(r.website_url is not null) desc,(r.address is not null) desc,r.created_at desc,r.object_ref) filter(where r.phone is not null))[1] as candidate_phone,
    (array_agg(r.email order by (r.email is not null) desc,(r.website_url is not null) desc,r.created_at desc,r.object_ref) filter(where r.email is not null))[1] as candidate_email,
    (array_agg(r.website_url order by (r.website_url is not null) desc,(r.phone is not null) desc,r.created_at desc,r.object_ref) filter(where r.website_url is not null))[1] as candidate_website,
    (array_agg(r.address order by (r.address is not null) desc,(r.phone is not null) desc,r.created_at desc,r.object_ref) filter(where r.address is not null))[1] as candidate_address,
    (array_agg(r.filing_portal order by (r.filing_portal is not null) desc,r.created_at desc,r.object_ref) filter(where r.filing_portal is not null))[1] as candidate_filing_portal,
    (array_agg(r.eligibility_summary order by length(coalesce(r.eligibility_summary,'')) desc,r.created_at desc,r.object_ref) filter(where r.eligibility_summary is not null))[1] as candidate_eligibility,
    (array_agg(r.apply_notes order by length(coalesce(r.apply_notes,'')) desc,r.created_at desc,r.object_ref) filter(where r.apply_notes is not null))[1] as candidate_apply_notes,
    (array_agg(r.description order by length(coalesce(r.description,'')) desc,r.created_at desc,r.object_ref) filter(where r.description is not null))[1] as candidate_description,
    jsonb_agg(distinct r.field_provenance) filter(where r.field_provenance<>'{}'::jsonb) as recovered_field_provenance
  from ids i
  cross join lateral jsonb_array_elements_text(i.candidate_keys) k(candidate_key)
  join public.v_civic_object_reconciled_v2 r on r.object_ref=k.candidate_key
  group by i.resource_entity_id
)
select
  i.resource_entity_id,
  i.identity_key,
  i.resolution_state,
  i.canonical_name as name,
  i.state_code,i.jurisdiction,i.category,i.organization_name,
  coalesce(nullif(btrim(i.phone),''),cf.candidate_phone) as phone,
  coalesce(nullif(btrim(i.email),''),cf.candidate_email) as email,
  coalesce(nullif(btrim(i.website_url),''),cf.candidate_website) as website_url,
  coalesce(nullif(btrim(i.address),''),cf.candidate_address) as address,
  cf.candidate_filing_portal as filing_portal,
  coalesce(nullif(btrim(i.eligibility_summary),''),cf.candidate_eligibility) as eligibility_summary,
  coalesce(nullif(btrim(i.apply_notes),''),cf.candidate_apply_notes) as apply_notes,
  coalesce(nullif(btrim(i.description),''),cf.candidate_description) as description,
  i.verification_state,i.candidate_count,i.candidate_keys,i.source_artifacts,i.quality_lanes,i.provenance,
  i.snapshot_id,i.snapshot_version,
  coalesce(cf.recovered_field_provenance,'[]'::jsonb) as recovered_field_provenance,
  jsonb_strip_nulls(jsonb_build_object(
    'phone',case when nullif(btrim(i.phone),'') is not null then 'snapshot' when cf.candidate_phone is not null then 'source_candidate_recovery' end,
    'email',case when nullif(btrim(i.email),'') is not null then 'snapshot' when cf.candidate_email is not null then 'source_candidate_recovery' end,
    'website_url',case when nullif(btrim(i.website_url),'') is not null then 'snapshot' when cf.candidate_website is not null then 'source_candidate_recovery' end,
    'address',case when nullif(btrim(i.address),'') is not null then 'snapshot' when cf.candidate_address is not null then 'source_candidate_recovery' end
  )) as canonical_field_sources,
  coalesce(nullif(btrim(i.phone),''),cf.candidate_phone,nullif(btrim(i.email),''),cf.candidate_email,nullif(btrim(i.website_url),''),cf.candidate_website,nullif(btrim(i.address),''),cf.candidate_address,public.luminari_extract_urlish_v2(cf.candidate_filing_portal)) is not null as has_access_point
from ids i
left join candidate_fields cf using(resource_entity_id);

comment on view public.v_civic_resource_canonical_v2 is
  'Current activated fresh-resource identities with missing usable fields recovered from provenance-bound member candidates; active snapshot values always win.';

create or replace view public.v_civic_resource_unabsorbed_v2 as
with current_members as (
  select distinct k.candidate_key
  from public.luminari_resource_snapshot_v1 s
  join public.luminari_resource_snapshot_identity_v1 i using(snapshot_id)
  cross join lateral jsonb_array_elements_text(i.candidate_keys) k(candidate_key)
  where s.is_current=true
)
select r.*
from public.v_civic_object_reconciled_v2 r
left join current_members m on m.candidate_key=r.object_ref
where r.object_class='resource' and m.candidate_key is null;

comment on view public.v_civic_resource_unabsorbed_v2 is
  'Resource-class source candidates not represented by the currently active resource snapshot. Preserves malformed and missing-access rows for deterministic remediation instead of silently dropping them.';

create or replace view public.v_civic_data_usefulness_v2 as
select 'canonical_resources'::text as metric,count(*)::bigint as value from public.v_civic_resource_canonical_v2
union all select 'canonical_resources_with_access',count(*)::bigint from public.v_civic_resource_canonical_v2 where has_access_point
union all select 'canonical_resources_with_phone',count(*)::bigint from public.v_civic_resource_canonical_v2 where phone is not null and btrim(phone)<>''
union all select 'canonical_resources_with_email',count(*)::bigint from public.v_civic_resource_canonical_v2 where email is not null and btrim(email)<>''
union all select 'canonical_resources_with_website',count(*)::bigint from public.v_civic_resource_canonical_v2 where website_url is not null and btrim(website_url)<>''
union all select 'canonical_resources_with_address',count(*)::bigint from public.v_civic_resource_canonical_v2 where address is not null and btrim(address)<>''
union all select 'unabsorbed_resource_candidates',count(*)::bigint from public.v_civic_resource_unabsorbed_v2
union all select 'unabsorbed_usable_resource_candidates',count(*)::bigint from public.v_civic_resource_unabsorbed_v2 where projection_state='usable_resource_candidate'
union all select 'unabsorbed_resource_identity_recovery',count(*)::bigint from public.v_civic_resource_unabsorbed_v2 where projection_state='resource_needs_identity_recovery'
union all select 'unabsorbed_resource_missing_access',count(*)::bigint from public.v_civic_resource_unabsorbed_v2 where projection_state='resource_missing_access_point'
union all select 'all_reconciled_civic_objects',count(*)::bigint from public.v_civic_object_reconciled_v2;

revoke all on public.v_civic_object_reconciled_v2 from anon,authenticated;
revoke all on public.v_civic_resource_canonical_v2 from anon,authenticated;
revoke all on public.v_civic_resource_unabsorbed_v2 from anon,authenticated;
revoke all on public.v_civic_data_usefulness_v2 from anon,authenticated;
grant select on public.v_civic_object_reconciled_v2 to service_role;
grant select on public.v_civic_resource_canonical_v2 to service_role;
grant select on public.v_civic_resource_unabsorbed_v2 to service_role;
grant select on public.v_civic_data_usefulness_v2 to service_role;
