begin;

insert into public.substrate_source_artifact (
    source_file, source_sha256, source_kind, source_bytes,
    source_rows_expected, source_files_expected, deployment_status, notes
) values (
    'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx',
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33',
    'verified_docx_resource_directory',
    174034,
    56,
    1,
    'staged',
    'Authoritative Disability Services directory verified 2026-07-13. Tier 3 and Tier 4 cover 50 states, DC, and five territories. Each jurisdiction row preserves the three canonical agency identifiers for P&A, DD Council, and VR routing; full contacts and legal detail remain anchored to the source DOCX for agency-level reconciliation.'
)
on conflict (source_sha256) do update set
    source_file=excluded.source_file,
    source_kind=excluded.source_kind,
    source_bytes=excluded.source_bytes,
    source_rows_expected=excluded.source_rows_expected,
    source_files_expected=excluded.source_files_expected,
    deployment_status=excluded.deployment_status,
    notes=excluded.notes,
    updated_at=now();

with jurisdiction_manifest(state_code,jurisdiction,jurisdiction_key,jurisdiction_level,agency_ids) as (
values
('AK','Alaska','alaska','state',array['DIS-AK-PA','DIS-AK-DDC','DIS-AK-VR']::text[]),
('AL','Alabama','alabama','state',array['DIS-AL-PA','DIS-AL-DDC','DIS-AL-VR']::text[]),
('AR','Arkansas','arkansas','state',array['DIS-AR-PA','DIS-AR-DDC','DIS-AR-VR']::text[]),
('AZ','Arizona','arizona','state',array['DIS-AZ-PA','DIS-AZ-DDC','DIS-AZ-VR']::text[]),
('CA','California','california','state',array['DIS-CA-PA','DIS-CA-DDC','DIS-CA-VR']::text[]),
('CO','Colorado','colorado','state',array['DIS-CO-PA','DIS-CO-DDC','DIS-CO-VR']::text[]),
('CT','Connecticut','connecticut','state',array['DIS-CT-PA','DIS-CT-DDC','DIS-CT-VR']::text[]),
('DC','District of Columbia','district_of_columbia','district',array['DIS-DC-PA','DIS-DC-DDC','DIS-DC-VR']::text[]),
('DE','Delaware','delaware','state',array['DIS-DE-PA','DIS-DE-DDC','DIS-DE-VR']::text[]),
('FL','Florida','florida','state',array['DIS-FL-PA','DIS-FL-DDC','DIS-FL-VR']::text[]),
('GA','Georgia','georgia','state',array['DIS-GA-PA','DIS-GA-DDC','DIS-GA-VR']::text[]),
('HI','Hawaii','hawaii','state',array['DIS-HI-PA','DIS-HI-DDC','DIS-HI-VR']::text[]),
('IA','Iowa','iowa','state',array['DIS-IA-PA','DIS-IA-DDC','DIS-IA-VR']::text[]),
('ID','Idaho','idaho','state',array['DIS-ID-PA','DIS-ID-DDC','DIS-ID-VR']::text[]),
('IL','Illinois','illinois','state',array['DIS-IL-PA','DIS-IL-DDC','DIS-IL-VR']::text[]),
('IN','Indiana','indiana','state',array['DIS-IN-PA','DIS-IN-DDC','DIS-IN-VR']::text[]),
('KS','Kansas','kansas','state',array['DIS-KS-PA','DIS-KS-DDC','DIS-KS-VR']::text[]),
('KY','Kentucky','kentucky','state',array['DIS-KY-PA','DIS-KY-DDC','DIS-KY-VR']::text[]),
('LA','Louisiana','louisiana','state',array['DIS-LA-PA','DIS-LA-DDC','DIS-LA-VR']::text[]),
('MA','Massachusetts','massachusetts','state',array['DIS-MA-PA','DIS-MA-DDC','DIS-MA-VR']::text[]),
('MD','Maryland','maryland','state',array['DIS-MD-PA','DIS-MD-DDC','DIS-MD-VR']::text[]),
('ME','Maine','maine','state',array['DIS-ME-PA','DIS-ME-DDC','DIS-ME-VR']::text[]),
('MI','Michigan','michigan','state',array['DIS-MI-PA','DIS-MI-DDC','DIS-MI-VR']::text[]),
('MN','Minnesota','minnesota','state',array['DIS-MN-PA','DIS-MN-DDC','DIS-MN-VR']::text[]),
('MO','Missouri','missouri','state',array['DIS-MO-PA','DIS-MO-DDC','DIS-MO-VR']::text[]),
('MS','Mississippi','mississippi','state',array['DIS-MS-PA','DIS-MS-DDC','DIS-MS-VR']::text[]),
('MT','Montana','montana','state',array['DIS-MT-PA','DIS-MT-DDC','DIS-MT-VR']::text[]),
('NC','North Carolina','north_carolina','state',array['DIS-NC-PA','DIS-NC-DDC','DIS-NC-VR']::text[]),
('ND','North Dakota','north_dakota','state',array['DIS-ND-PA','DIS-ND-DDC','DIS-ND-VR']::text[]),
('NE','Nebraska','nebraska','state',array['DIS-NE-PA','DIS-NE-DDC','DIS-NE-VR']::text[]),
('NH','New Hampshire','new_hampshire','state',array['DIS-NH-PA','DIS-NH-DDC','DIS-NH-VR']::text[]),
('NJ','New Jersey','new_jersey','state',array['DRNJ Home','NJCDD Home','NJ DVRS']::text[]),
('NM','New Mexico','new_mexico','state',array['DIS-NM-PA','DIS-NM-DDC','DIS-NM-VR']::text[]),
('NV','Nevada','nevada','state',array['DIS-NV-PA','DIS-NV-DDC','DIS-NV-VR']::text[]),
('NY','New York','new_york','state',array['DIS-NY-PA','DIS-NY-DDC','DIS-NY-VR']::text[]),
('OH','Ohio','ohio','state',array['DIS-OH-PA','DIS-OH-DDC','DIS-OH-VR']::text[]),
('OK','Oklahoma','oklahoma','state',array['DIS-OK-PA','DIS-OK-DDC','DIS-OK-VR']::text[]),
('OR','Oregon','oregon','state',array['DIS-OR-PA','DIS-OR-DDC','DIS-OR-VR']::text[]),
('PA','Pennsylvania','pennsylvania','state',array['DIS-PA-PA','DIS-PA-DDC','DIS-PA-VR']::text[]),
('RI','Rhode Island','rhode_island','state',array['DIS-RI-PA','DIS-RI-DDC','DIS-RI-VR']::text[]),
('SC','South Carolina','south_carolina','state',array['DIS-SC-PA','DIS-SC-DDC','DIS-SC-VR']::text[]),
('SD','South Dakota','south_dakota','state',array['DIS-SD-PA','DIS-SD-DDC','DIS-SD-VR']::text[]),
('TN','Tennessee','tennessee','state',array['DIS-TN-PA','DIS-TN-DDC','DIS-TN-VR']::text[]),
('TX','Texas','texas','state',array['DIS-TX-PA','DIS-TX-DDC','DIS-TX-VR']::text[]),
('UT','Utah','utah','state',array['DIS-UT-PA','DIS-UT-DDC','DIS-UT-VR']::text[]),
('VA','Virginia','virginia','state',array['DIS-VA-PA','DIS-VA-DDC','DIS-VA-VR']::text[]),
('VT','Vermont','vermont','state',array['DIS-VT-PA','DIS-VT-DDC','DIS-VT-VR']::text[]),
('WA','Washington','washington','state',array['DIS-WA-PA','DIS-WA-DDC','DIS-WA-VR']::text[]),
('WI','Wisconsin','wisconsin','state',array['DIS-WI-PA','DIS-WI-DDC','DIS-WI-VR']::text[]),
('WV','West Virginia','west_virginia','state',array['DIS-WV-PA','DIS-WV-DDC','DIS-WV-VR']::text[]),
('WY','Wyoming','wyoming','state',array['DIS-WY-PA','DIS-WY-DDC','DIS-WY-VR']::text[]),
('VI','U.S. Virgin Islands','us_virgin_islands','territory',array['DIS-VI-PA','DIS-VI-DDC','DIS-VI-VR']::text[]),
('GU','Guam','guam','territory',array['DIS-GU-PA','DIS-GU-DDC','DIS-GU-VR']::text[]),
('MP','Commonwealth of the Northern Mariana Islands (CNMI)','northern_mariana_islands','territory',array['DIS-CO-PA','DIS-CO-DDC','DIS-CO-VR']::text[]),
('AS','American Samoa','american_samoa','territory',array['DIS-AS-PA','DIS-AS-DDC','DIS-AS-VR']::text[]),
('PR','Puerto Rico','puerto_rico','territory',array['DIS-PR-PA','DIS-PR-DDC','DIS-PR-VR']::text[])
), staged as (
insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_hash_kind, source_kind, source_key,
    table_idx, row_idx, source_row_key, row_shape, promotion_status, payload
)
select
    'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx',
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33',
    'sha256',
    'domain_resource_directory',
    'disability-services-jurisdiction',
    1,
    row_number() over(order by state_code)::integer,
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33:jurisdiction:' || lower(state_code),
    'state_directory_entry',
    'candidate',
    jsonb_build_object(
        'resource_category','disability_services',
        'subcategory','STATE_TERRITORY_INFRASTRUCTURE',
        'jurisdiction_level',jurisdiction_level,
        'state_code',state_code,
        'jurisdiction',jurisdiction,
        'jurisdiction_key',jurisdiction_key,
        'agency_count',cardinality(agency_ids),
        'agency_ids',to_jsonb(agency_ids),
        'verification_status','VERIFIED',
        'last_verified','2026-07-13',
        'source_doc','luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx',
        'source_anchor','TIER 3/4 — ' || state_code || ' — ' || jurisdiction
    )
from jurisdiction_manifest
on conflict (source_row_key) do update set
    payload=excluded.payload,
    row_shape=excluded.row_shape,
    promotion_status=excluded.promotion_status,
    source_hash_raw=excluded.source_hash_raw,
    source_hash_kind=excluded.source_hash_kind,
    updated_at=now()
returning *
)
insert into public.substrate_candidate_disposition (
    artifact_id, source_file, source_sha256, source_table_idx, source_row_idx,
    source_row_key, candidate_kind, target_table, target_identity, disposition, reason
)
select
    a.artifact_id,
    s.source_file,
    s.source_hash_raw,
    s.table_idx,
    s.row_idx,
    s.source_row_key,
    'state_directory_entry',
    'luminari_resource_entities',
    jsonb_build_object(
        'state_code',s.payload->>'state_code',
        'jurisdiction_key',s.payload->>'jurisdiction_key',
        'agency_ids',s.payload->'agency_ids'
    ),
    'unresolved',
    case
      when s.payload->>'state_code'='MP' then 'Held for source-ID correction: CNMI agency IDs are encoded with DIS-CO-* and collide with Colorado identifiers.'
      when s.payload->>'state_code'='NJ' then 'Held for source-ID normalization: New Jersey source labels are human-readable placeholders rather than DIS-NJ-* identifiers.'
      else 'Verified jurisdiction manifest staged; requires agency-by-agency canonical entity/contact/location reconciliation.'
    end
from staged s
join public.substrate_source_artifact a on a.source_sha256=s.source_hash_raw
on conflict (source_sha256, source_row_key) do update set
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

create or replace view public.v_substrate_promotion_readiness as
with bundle as (
    select a.bundle_sha256,a.tuple_row_count,a.distinct_row_source_count,
           a.manifest_source_count,a.manifest_generated_row_count,
           a.source_count_delta,a.row_count_delta,a.audit_status,s.deployment_status
    from public.generated_sql_bundle_audit a
    left join public.substrate_source_artifact s on s.source_sha256=a.bundle_sha256
), disability as (
    select
        count(*) filter (where d.candidate_kind='normalized_statute')::bigint as statute_candidates,
        count(*) filter (where d.candidate_kind='normalized_resource')::bigint as resource_candidates,
        count(*) filter (where d.candidate_kind='state_directory_entry')::bigint as jurisdiction_candidates,
        count(*) filter (where d.disposition='unresolved')::bigint as unresolved_candidates,
        count(*) filter (where d.disposition='insert')::bigint as insert_candidates,
        count(*) filter (where d.disposition='enrich')::bigint as enrich_candidates,
        count(*) filter (where d.disposition='duplicate')::bigint as duplicate_candidates,
        count(*) filter (where d.disposition='hold')::bigint as held_candidates,
        count(*) filter (where d.disposition='provenance_only')::bigint as provenance_only_candidates
    from public.substrate_candidate_disposition d
    where d.source_file in (
        'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx',
        'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx'
    )
), stage as (
    select count(*)::bigint as staged_rows,
           count(*) filter (where row_shape='statute_summary')::bigint as staged_statutes,
           count(*) filter (where row_shape='normalized_resource')::bigint as staged_resources,
           count(*) filter (where row_shape='state_directory_entry')::bigint as staged_state_directory_entries
    from public.domain_deep_dive_v3_13_stage
    where source_file in (
        'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx',
        'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx'
    )
)
select b.bundle_sha256,b.audit_status,b.deployment_status,b.distinct_row_source_count,
       b.manifest_source_count,b.tuple_row_count,b.manifest_generated_row_count,
       b.source_count_delta,b.row_count_delta,s.staged_rows,s.staged_statutes,
       s.staged_resources,s.staged_state_directory_entries,d.statute_candidates,
       d.resource_candidates,d.jurisdiction_candidates,d.unresolved_candidates,
       d.insert_candidates,d.enrich_candidates,d.duplicate_candidates,
       d.held_candidates,d.provenance_only_candidates,
       (b.audit_status='verified' and b.deployment_status='staged'
        and b.source_count_delta=0 and b.row_count_delta=0
        and s.staged_state_directory_entries=56 and d.jurisdiction_candidates=56
        and d.unresolved_candidates=0) as ready_for_canonical_promotion,
       case
         when b.audit_status<>'verified' then 'bundle_manifest_not_verified'
         when b.deployment_status<>'staged' then 'bundle_not_staged'
         when b.source_count_delta<>0 or b.row_count_delta<>0 then 'bundle_manifest_count_mismatch'
         when s.staged_state_directory_entries<>56 then 'disability_state_territory_entries_incomplete'
         when d.jurisdiction_candidates<>56 then 'disability_jurisdiction_dispositions_incomplete'
         when d.unresolved_candidates>0 then 'candidate_dispositions_unresolved'
         else 'ready'
       end as blocking_reason
from bundle b cross join disability d cross join stage s;

commit;
