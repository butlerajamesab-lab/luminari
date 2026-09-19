begin;

alter table public.docket_bill_source_document
  add column if not exists source_identity_namespace text not null default 'provider',
  add column if not exists source_artifact_id text;

alter table public.docket_bill_source_document
  alter column provider_document_id drop not null;

alter table public.docket_bill_source_document
  drop constraint if exists docket_bill_source_document_provider_unique;

drop index if exists public.docket_bill_source_document_provider_unique;

create unique index if not exists docket_bill_source_document_provider_unique
  on public.docket_bill_source_document(source_bill_id, document_family, provider_document_id)
  where source_identity_namespace='provider' and provider_document_id is not null;

create unique index if not exists docket_bill_source_document_official_artifact_unique
  on public.docket_bill_source_document(
    source_bill_id,
    document_family,
    source_identity_namespace,
    source_artifact_id
  )
  where source_identity_namespace='official_terminal' and source_artifact_id is not null;

alter table public.docket_bill_source_document
  drop constraint if exists docket_bill_source_document_identity_namespace_check;

alter table public.docket_bill_source_document
  add constraint docket_bill_source_document_identity_namespace_check
  check (
    (
      source_identity_namespace='provider'
      and provider_document_id is not null
      and source_artifact_id is null
    )
    or
    (
      source_identity_namespace='official_terminal'
      and provider_document_id is null
      and source_artifact_id is not null
      and char_length(source_artifact_id) between 1 and 160
    )
  );

create or replace function public.register_docket_official_terminal_source_v1(
  p_source_bill_id integer,
  p_source_url text,
  p_source_artifact_id text,
  p_provider_document_type text default 'Official terminal act',
  p_provider_date date default null,
  p_description text default null,
  p_observed_at timestamptz default now(),
  p_enqueue boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  v_genome_bill_id uuid;
  v_source_document_key text;
  v_provider_sequence integer;
  v_predecessor_source_document_key text;
  v_predecessor_bill_version_id uuid;
  v_metadata jsonb;
  v_metadata_hash text;
  v_version_fingerprint text;
  v_bill_version_id uuid;
  v_artifact_slug text;
begin
  if p_source_bill_id is null or p_source_bill_id <= 0 then
    raise exception using errcode='22023',message='official_terminal_source_bill_id_invalid';
  end if;
  if p_source_url is null
     or p_source_url !~ '^https://'
     or char_length(p_source_url) > 2048 then
    raise exception using errcode='22023',message='official_terminal_source_url_invalid';
  end if;
  if p_source_artifact_id is null
     or char_length(btrim(p_source_artifact_id)) not between 1 and 160 then
    raise exception using errcode='22023',message='official_terminal_source_artifact_id_invalid';
  end if;

  select bill.genome_bill_id
    into v_genome_bill_id
  from public.civic_genome_bill bill
  where bill.structural_dna_json->>'source_bill_id'=p_source_bill_id::text
  order by bill.updated_at desc,bill.genome_bill_id
  limit 1;

  if v_genome_bill_id is null then
    raise exception using errcode='P0002',message='official_terminal_source_genome_bill_missing';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('official-terminal-source:'||p_source_bill_id::text,0));

  v_artifact_slug:=lower(regexp_replace(btrim(p_source_artifact_id),'[^a-zA-Z0-9._-]+','-','g'));
  v_artifact_slug:=trim(both '-' from v_artifact_slug);
  if v_artifact_slug='' then
    raise exception using errcode='22023',message='official_terminal_source_artifact_slug_invalid';
  end if;
  v_source_document_key:=format('official_text:%s:%s',p_source_bill_id,v_artifact_slug);

  -- Idempotent replay keeps the original ordering identity. A newly observed
  -- official terminal artifact receives the next text sequence exactly once.
  select provider_sequence,predecessor_source_document_key
    into v_provider_sequence,v_predecessor_source_document_key
  from public.docket_bill_source_document
  where source_document_key=v_source_document_key
  for update;

  if v_provider_sequence is null then
    select coalesce(max(provider_sequence),0)+1
      into v_provider_sequence
    from public.docket_bill_source_document
    where source_bill_id=p_source_bill_id
      and document_family='text';

    select source_document_key
      into v_predecessor_source_document_key
    from public.docket_bill_source_document
    where source_bill_id=p_source_bill_id
      and document_family='text'
      and source_document_key<>v_source_document_key
    order by provider_sequence desc,stage_rank desc,created_at desc
    limit 1;
  end if;

  v_metadata:=jsonb_build_object(
    'source_bill_id',p_source_bill_id,
    'source_document_key',v_source_document_key,
    'source_identity_namespace','official_terminal',
    'source_artifact_id',btrim(p_source_artifact_id),
    'document_family','text',
    'provider_document_id',null,
    'provider_sequence',v_provider_sequence,
    'provider_document_type',coalesce(nullif(btrim(p_provider_document_type),''),'Official terminal act'),
    'normalized_version_type','chaptered',
    'stage_rank',500,
    'source_url',p_source_url,
    'provider_url',null,
    'provider_hash',null,
    'provider_size',null,
    'provider_date',p_provider_date,
    'source_authority','official_legislature',
    'verified_terminal_source',true,
    'supplements_provider_text_chain',true,
    'description',p_description
  );
  v_metadata_hash:=encode(digest(convert_to(v_metadata::text,'UTF8'),'sha256'),'hex');

  insert into public.docket_bill_source_document(
    source_document_key,
    source_bill_id,
    provider_document_id,
    source_identity_namespace,
    source_artifact_id,
    document_family,
    provider_document_type,
    normalized_version_type,
    provider_sequence,
    stage_rank,
    chamber,
    source_url,
    provider_url,
    provider_hash,
    provider_size,
    provider_date,
    adopted,
    description,
    source_stem,
    predecessor_source_document_key,
    base_source_document_key,
    latest_metadata,
    latest_observed_at
  ) values (
    v_source_document_key,
    p_source_bill_id,
    null,
    'official_terminal',
    btrim(p_source_artifact_id),
    'text',
    coalesce(nullif(btrim(p_provider_document_type),''),'Official terminal act'),
    'chaptered',
    v_provider_sequence,
    500,
    null,
    p_source_url,
    null,
    null,
    null,
    p_provider_date,
    true,
    p_description,
    public.docket_legislative_source_stem(p_source_url),
    v_predecessor_source_document_key,
    null,
    v_metadata,
    coalesce(p_observed_at,now())
  )
  on conflict(source_document_key) do update set
    provider_document_type=excluded.provider_document_type,
    normalized_version_type=excluded.normalized_version_type,
    stage_rank=excluded.stage_rank,
    source_url=excluded.source_url,
    provider_date=excluded.provider_date,
    adopted=true,
    description=excluded.description,
    predecessor_source_document_key=coalesce(
      public.docket_bill_source_document.predecessor_source_document_key,
      excluded.predecessor_source_document_key
    ),
    latest_metadata=excluded.latest_metadata,
    latest_observed_at=excluded.latest_observed_at,
    updated_at=now();

  insert into public.docket_bill_source_document_observation(
    source_document_key,metadata_hash,metadata_json,docket_fetched_at
  ) values (
    v_source_document_key,v_metadata_hash,v_metadata,coalesce(p_observed_at,now())
  )
  on conflict(source_document_key,metadata_hash) do nothing;

  select bill_version_id
    into v_predecessor_bill_version_id
  from public.civic_genome_bill_version
  where genome_bill_id=v_genome_bill_id
    and source_document_key=v_predecessor_source_document_key
  limit 1;

  v_version_fingerprint:=encode(digest(convert_to(jsonb_build_object(
    'genome_bill_id',v_genome_bill_id,
    'source_document_key',v_source_document_key,
    'source_bill_id',p_source_bill_id,
    'source_identity_namespace','official_terminal',
    'source_artifact_id',btrim(p_source_artifact_id),
    'document_family','text',
    'normalized_version_type','chaptered',
    'provider_sequence',v_provider_sequence,
    'source_url',p_source_url
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.civic_genome_bill_version(
    genome_bill_id,
    source_document_key,
    source_bill_id,
    document_family,
    version_type,
    provider_sequence,
    stage_rank,
    chamber,
    predecessor_bill_version_id,
    version_fingerprint,
    receipt_json
  ) values (
    v_genome_bill_id,
    v_source_document_key,
    p_source_bill_id,
    'text',
    'chaptered',
    v_provider_sequence,
    500,
    null,
    v_predecessor_bill_version_id,
    v_version_fingerprint,
    jsonb_build_object(
      'docket_source_document_key',v_source_document_key,
      'source_identity_namespace','official_terminal',
      'source_artifact_id',btrim(p_source_artifact_id),
      'provider_document_id',null,
      'provider_document_type',coalesce(nullif(btrim(p_provider_document_type),''),'Official terminal act'),
      'source_url',p_source_url,
      'registered_at',now()
    )
  )
  on conflict(genome_bill_id,source_document_key) do update set
    document_family='text',
    version_type='chaptered',
    provider_sequence=excluded.provider_sequence,
    stage_rank=500,
    predecessor_bill_version_id=coalesce(
      public.civic_genome_bill_version.predecessor_bill_version_id,
      excluded.predecessor_bill_version_id
    ),
    version_fingerprint=excluded.version_fingerprint,
    receipt_json=public.civic_genome_bill_version.receipt_json||excluded.receipt_json,
    updated_at=now()
  returning bill_version_id into v_bill_version_id;

  if p_enqueue then
    insert into public.civic_genome_legislative_version_queue(
      bill_version_id,queue_state,priority,next_attempt_at
    ) values (
      v_bill_version_id,'eligible',(500*1000)+v_provider_sequence,now()
    )
    on conflict(bill_version_id) do update set
      queue_state=case
        when public.civic_genome_legislative_version_queue.queue_state='completed'
          then 'completed'
        else 'eligible'
      end,
      priority=excluded.priority,
      next_attempt_at=now(),
      updated_at=now();
  end if;

  return jsonb_build_object(
    'contract','docket-official-terminal-source-v1',
    'source_bill_id',p_source_bill_id,
    'genome_bill_id',v_genome_bill_id,
    'source_document_key',v_source_document_key,
    'source_identity_namespace','official_terminal',
    'source_artifact_id',btrim(p_source_artifact_id),
    'bill_version_id',v_bill_version_id,
    'provider_sequence',v_provider_sequence,
    'version_type','chaptered',
    'source_url',p_source_url,
    'enqueued',p_enqueue
  );
end;
$$;

revoke all on function public.register_docket_official_terminal_source_v1(
  integer,text,text,text,date,text,timestamptz,boolean
) from public,anon,authenticated;

grant execute on function public.register_docket_official_terminal_source_v1(
  integer,text,text,text,date,text,timestamptz,boolean
) to service_role;

commit;
