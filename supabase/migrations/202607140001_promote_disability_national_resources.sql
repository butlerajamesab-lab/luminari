begin;

with staged as (
  select stage_row_id,source_file,source_hash_raw,source_row_key,payload
  from public.domain_deep_dive_v3_13_stage
  where source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
    and row_shape='normalized_resource'
), inserted as (
  insert into public.luminari_resource_entities (
    canonical_id,source_table,source_pk,source_hash,resource_name,resource_type,
    resource_category,layer,jurisdiction,jurisdiction_scope,description,apply_notes,
    service_categories,domains,metadata,verification_status,promotion_status,provenance_status
  )
  select
    s.payload->>'resource_id','domain_deep_dive_v3_13_stage',s.stage_row_id::text,s.source_hash_raw,
    s.payload->>'organization_name',s.payload->>'organization_type',s.payload->>'resource_category',
    s.payload->>'subcategory',s.payload->>'jurisdiction',s.payload->>'jurisdiction_level',
    s.payload->>'notes',s.payload->>'notes',array_remove(array[s.payload->>'service_type'],null),
    jsonb_build_array(s.payload->>'resource_category'),
    s.payload || jsonb_build_object('source_file',s.source_file,'source_row_key',s.source_row_key,
      'source_hash_raw',s.source_hash_raw,'verbatim_source_text',s.payload->>'notes'),
    lower(coalesce(s.payload->>'verification_status','verified')),'promoted','verified'
  from staged s
  on conflict (canonical_id) do update set
    resource_name=excluded.resource_name,resource_type=excluded.resource_type,
    resource_category=excluded.resource_category,layer=excluded.layer,
    jurisdiction=excluded.jurisdiction,jurisdiction_scope=excluded.jurisdiction_scope,
    description=excluded.description,apply_notes=excluded.apply_notes,
    service_categories=excluded.service_categories,domains=excluded.domains,
    metadata=public.luminari_resource_entities.metadata || excluded.metadata,
    verification_status=excluded.verification_status,promotion_status='promoted',
    provenance_status='verified',source_table=excluded.source_table,
    source_pk=excluded.source_pk,source_hash=excluded.source_hash,updated_at=now()
  returning resource_entity_id,canonical_id
)
insert into public.luminari_resource_contact_points (
  resource_entity_id,canonical_id,contact_type,contact_value,label,is_primary,
  contact_quality,source_table,source_pk,source_hash,metadata
)
select e.resource_entity_id,e.canonical_id,'website',s.payload->>'official_url','Official website',true,
       'verified','domain_deep_dive_v3_13_stage',s.stage_row_id::text,s.source_hash_raw,
       jsonb_build_object('source_file',s.source_file,'source_row_key',s.source_row_key)
from staged s join public.luminari_resource_entities e on e.canonical_id=s.payload->>'resource_id'
where nullif(trim(s.payload->>'official_url'),'') is not null
  and not exists (
    select 1 from public.luminari_resource_contact_points cp
    where cp.resource_entity_id=e.resource_entity_id
      and cp.contact_type='website'
      and cp.contact_value=s.payload->>'official_url'
  );

with staged as (
  select stage_row_id,source_file,source_hash_raw,source_row_key,payload
  from public.domain_deep_dive_v3_13_stage
  where source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
    and row_shape='normalized_resource'
)
insert into public.luminari_resource_contact_points (
  resource_entity_id,canonical_id,contact_type,contact_value,label,is_primary,
  contact_quality,source_table,source_pk,source_hash,metadata
)
select e.resource_entity_id,e.canonical_id,'general',s.payload->>'official_contact','Official contact',false,
       'verified','domain_deep_dive_v3_13_stage',s.stage_row_id::text,s.source_hash_raw,
       jsonb_build_object('source_file',s.source_file,'source_row_key',s.source_row_key)
from staged s join public.luminari_resource_entities e on e.canonical_id=s.payload->>'resource_id'
where nullif(trim(s.payload->>'official_contact'),'') is not null
  and not exists (
    select 1 from public.luminari_resource_contact_points cp
    where cp.resource_entity_id=e.resource_entity_id
      and cp.contact_type='general'
      and cp.contact_value=s.payload->>'official_contact'
  );

update public.substrate_candidate_disposition d
set disposition='insert',target_table='luminari_resource_entities',
    target_identity=jsonb_build_object('canonical_id',s.payload->>'resource_id','resource_name',s.payload->>'organization_name'),
    canonical_source_sha256=s.source_hash_raw,
    reason='Promoted directly from verified Disability Services staging payload with official URL, contact, statutory authority, narrative text, and source-row provenance.',
    decided_at=now(),updated_at=now()
from public.domain_deep_dive_v3_13_stage s
where d.source_file=s.source_file and d.source_row_key=s.source_row_key
  and d.candidate_kind='normalized_resource'
  and s.source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx';

update public.domain_deep_dive_v3_13_stage
set promotion_status='promoted',updated_at=now()
where source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
  and row_shape='normalized_resource';

commit;
