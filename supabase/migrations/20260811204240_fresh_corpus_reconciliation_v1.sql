-- Fresh-start reconciliation substrate for the two authoritative Lighthouse
-- Storage corpora. This migration is additive: original Storage objects and
-- all historical ingestion tables remain untouched.

create table if not exists public.luminari_corpus_source_artifact_v1 (
  artifact_key text primary key,
  bucket_id text not null,
  object_name text not null,
  transport_etag text,
  byte_size bigint not null default 0 check (byte_size >= 0),
  mimetype text,
  artifact_role text not null,
  jurisdiction_hint text,
  semantic_family text not null,
  generation_label text,
  exact_duplicate_of text references public.luminari_corpus_source_artifact_v1(artifact_key),
  content_sha256 text,
  extracted_text_sha256 text,
  extraction_status text not null default 'pending',
  storage_created_at timestamptz,
  storage_updated_at timestamptz,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  check (extracted_text_sha256 is null or extracted_text_sha256 ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_corpus_source_artifact_v1 is
  'Fresh-start source ledger for Luminari registry/backbone Storage objects. Storage objects remain immutable source evidence; this table is a read-model manifest only.';

create table if not exists public.luminari_corpus_rebuild_run_v1 (
  run_id uuid primary key default gen_random_uuid(),
  engine_version text not null,
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'started',
  artifact_count integer not null default 0,
  candidate_count integer not null default 0,
  identity_count integer not null default 0,
  unresolved_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  receipt_hash text,
  result_json jsonb not null default '{}'::jsonb,
  check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.luminari_corpus_candidate_v1 (
  candidate_key text primary key,
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  artifact_key text not null references public.luminari_corpus_source_artifact_v1(artifact_key),
  candidate_type text not null,
  source_locator text not null,
  jurisdiction text,
  state_code text,
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
  raw_excerpt text,
  parser_version text not null,
  candidate_hash text not null,
  source_content_sha256 text,
  jurisdiction_resolution_state text not null default 'unresolved',
  candidate_state text not null default 'unresolved',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (candidate_hash ~ '^[0-9a-f]{64}$'),
  check (source_content_sha256 is null or source_content_sha256 ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_corpus_candidate_v1 is
  'Typed fresh-rebuild candidates. A candidate is not a canonical resource, workflow, finding, signal, or publication.';

create table if not exists public.luminari_corpus_identity_v1 (
  identity_key text primary key,
  identity_type text not null,
  jurisdiction text,
  state_code text,
  canonical_name text not null,
  normalized_name_key text not null,
  strong_identifier_key text,
  resolution_state text not null default 'resolved',
  candidate_count integer not null default 0,
  canonical_payload jsonb not null default '{}'::jsonb,
  first_run_id uuid references public.luminari_corpus_rebuild_run_v1(run_id),
  latest_run_id uuid references public.luminari_corpus_rebuild_run_v1(run_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.luminari_corpus_identity_v1 is
  'Deterministic dedupe identities for fresh corpus rebuild. Conflicting strong identifiers stay unresolved rather than being silently merged.';

create table if not exists public.luminari_corpus_identity_evidence_v1 (
  identity_key text not null references public.luminari_corpus_identity_v1(identity_key),
  candidate_key text not null references public.luminari_corpus_candidate_v1(candidate_key),
  match_basis text not null,
  match_strength text not null,
  linked_at timestamptz not null default now(),
  primary key (identity_key,candidate_key)
);

create index if not exists luminari_corpus_source_artifact_role_idx
  on public.luminari_corpus_source_artifact_v1(artifact_role,jurisdiction_hint);
create index if not exists luminari_corpus_candidate_type_idx
  on public.luminari_corpus_candidate_v1(candidate_type,state_code,candidate_state);
create index if not exists luminari_corpus_candidate_artifact_idx
  on public.luminari_corpus_candidate_v1(artifact_key);
create index if not exists luminari_corpus_identity_lookup_idx
  on public.luminari_corpus_identity_v1(identity_type,state_code,normalized_name_key);

revoke all on public.luminari_corpus_source_artifact_v1 from anon,authenticated;
revoke all on public.luminari_corpus_rebuild_run_v1 from anon,authenticated;
revoke all on public.luminari_corpus_candidate_v1 from anon,authenticated;
revoke all on public.luminari_corpus_identity_v1 from anon,authenticated;
revoke all on public.luminari_corpus_identity_evidence_v1 from anon,authenticated;

insert into public.luminari_corpus_source_artifact_v1 (
  artifact_key,bucket_id,object_name,transport_etag,byte_size,mimetype,artifact_role,
  jurisdiction_hint,semantic_family,generation_label,storage_created_at,storage_updated_at,metadata
)
select
  o.bucket_id || '/' || o.name,
  o.bucket_id,
  o.name,
  o.metadata->>'eTag',
  coalesce((o.metadata->>'size')::bigint,0),
  o.metadata->>'mimetype',
  case
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%ENRICHED-PASS%' then 'state_enrichment_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%RESOURCE-DIRECTORY%' then 'state_resource_directory_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ~* 'registry[-_ (]' then 'state_registry_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%DEEP-DIVE%' then 'domain_deep_dive_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%ADDENDUM%' then 'addendum_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%CLAIM-CATALOG%' then 'claim_catalog_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%GAP-PLAYBOOK%' then 'gap_playbook_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%BENEFITS-CASCADE%' then 'benefits_cascade_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%SOL-COLLISION%' then 'sol_collision_source'
    when o.bucket_id='State Enriched Registry bucket' and o.name ilike '%FEDERAL-%' then 'federal_reference_source'
    when o.bucket_id='Everything backbone related' and coalesce(o.metadata->>'mimetype','')='application/json' then 'structured_backbone_source'
    when o.bucket_id='Everything backbone related' and coalesce(o.metadata->>'mimetype','') in ('text/csv','binary/octet-stream') and o.name ~* '(jsonl|csv|legislator)' then 'structured_backbone_source'
    when o.bucket_id='Everything backbone related' and o.name ilike '%.xlsx' then 'structured_workbook_source'
    when o.bucket_id='Everything backbone related' and o.name ilike '%.sql' then 'derivative_sql_artifact'
    when o.bucket_id='Everything backbone related' and o.name ilike '%.zip' then 'derivative_bundle_artifact'
    else 'unclassified_source'
  end,
  case
    when lower(o.name) like '%alabama%' then 'AL' when lower(o.name) like '%alaska%' then 'AK'
    when lower(o.name) like '%arizona%' then 'AZ' when lower(o.name) like '%arkansas%' then 'AR'
    when lower(o.name) like '%california%' then 'CA' when lower(o.name) like '%colorado%' then 'CO'
    when lower(o.name) like '%connecticut%' then 'CT' when lower(o.name) like '%delaware%' then 'DE'
    when lower(o.name) like '%florida%' then 'FL' when lower(o.name) like '%georgia%' then 'GA'
    when lower(o.name) like '%hawaii%' then 'HI' when lower(o.name) like '%idaho%' then 'ID'
    when lower(o.name) like '%illinois%' then 'IL' when lower(o.name) like '%indiana%' then 'IN'
    when lower(o.name) like '%iowa%' then 'IA' when lower(o.name) like '%kansas%' then 'KS'
    when lower(o.name) like '%kentucky%' then 'KY' when lower(o.name) like '%louisiana%' then 'LA'
    when lower(o.name) like '%maine%' then 'ME' when lower(o.name) like '%maryland%' then 'MD'
    when lower(o.name) like '%massachusetts%' then 'MA' when lower(o.name) like '%michigan%' then 'MI'
    when lower(o.name) like '%minnesota%' then 'MN' when lower(o.name) like '%mississippi%' then 'MS'
    when lower(o.name) like '%missouri%' then 'MO' when lower(o.name) like '%montana%' then 'MT'
    when lower(o.name) like '%nebraska%' then 'NE' when lower(o.name) like '%nevada%' then 'NV'
    when lower(o.name) like '%new-hampshire%' then 'NH' when lower(o.name) like '%new-jersey%' then 'NJ'
    when lower(o.name) like '%new-mexico%' or lower(o.name) like '%newmexico%' then 'NM'
    when lower(o.name) like '%new-york%' then 'NY' when lower(o.name) like '%north-carolina%' or lower(o.name) like '%northcarolina%' then 'NC'
    when lower(o.name) like '%north-dakota%' or lower(o.name) like '%northdakota%' then 'ND'
    when lower(o.name) like '%ohio%' then 'OH' when lower(o.name) like '%oklahoma%' then 'OK'
    when lower(o.name) like '%oregon%' then 'OR' when lower(o.name) like '%pennsylvania%' then 'PA'
    when lower(o.name) like '%rhode-island%' then 'RI' when lower(o.name) like '%south-carolina%' or lower(o.name) like '%southcarolina%' then 'SC'
    when lower(o.name) like '%south-dakota%' or lower(o.name) like '%southdakota%' then 'SD'
    when lower(o.name) like '%tennessee%' then 'TN' when lower(o.name) like '%texas%' then 'TX'
    when lower(o.name) like '%utah%' then 'UT' when lower(o.name) like '%vermont%' then 'VT'
    when lower(o.name) like '%virginia%' and lower(o.name) not like '%west-virginia%' and lower(o.name) not like '%westvirginia%' then 'VA'
    when lower(o.name) like '%washington-dc%' then 'DC' when lower(o.name) like '%washington%' then 'WA'
    when lower(o.name) like '%west-virginia%' or lower(o.name) like '%westvirginia%' then 'WV'
    when lower(o.name) like '%wisconsin%' then 'WI' when lower(o.name) like '%wyoming%' then 'WY'
    when lower(o.name) like '%puerto-rico%' then 'PR' when lower(o.name) like '%guam%' then 'GU'
    when lower(o.name) like '%american-samoa%' then 'AS' when lower(o.name) like '%northern-mariana%' or lower(o.name) like '%cnmi%' then 'MP'
    when lower(o.name) like '%virgin-islands%' then 'VI' else null end,
  lower(regexp_replace(regexp_replace(o.name,'\.(docx|xlsx|json|jsonl|csv|sql|zip|md)$','','i'),'[-_ ]?(enriched[-_ ]?pass[0-9]*|resource[-_ ]?directory|2026|\([0-9]+\)|[0-9]+)$','','i')),
  case
    when o.name ~* 'ENRICHED-PASS([0-9]+)' then substring(o.name from '(?i)ENRICHED-PASS([0-9]+)')
    when o.name ~* 'RESOURCE-DIRECTORY' then 'resource_directory'
    when o.name ~* 'DEEP-DIVE' then 'deep_dive'
    when o.name ~* 'ADDENDUM' then 'addendum'
    else null end,
  o.created_at,o.updated_at,
  jsonb_build_object('storage_metadata',o.metadata,'manifest_version','fresh_corpus_reconciliation_v1')
from storage.objects o
where o.bucket_id in ('State Enriched Registry bucket','Everything backbone related')
on conflict (artifact_key) do update set
  transport_etag=excluded.transport_etag,byte_size=excluded.byte_size,mimetype=excluded.mimetype,
  artifact_role=excluded.artifact_role,jurisdiction_hint=excluded.jurisdiction_hint,semantic_family=excluded.semantic_family,
  generation_label=excluded.generation_label,storage_created_at=excluded.storage_created_at,storage_updated_at=excluded.storage_updated_at,
  observed_at=now(),metadata=excluded.metadata;

with ranked as (
  select artifact_key,
         first_value(artifact_key) over (partition by transport_etag,byte_size order by artifact_key) as canonical_artifact,
         row_number() over (partition by transport_etag,byte_size order by artifact_key) as rn
  from public.luminari_corpus_source_artifact_v1
  where transport_etag is not null
)
update public.luminari_corpus_source_artifact_v1 a
set exact_duplicate_of = case when r.rn>1 then r.canonical_artifact else null end
from ranked r where r.artifact_key=a.artifact_key;
