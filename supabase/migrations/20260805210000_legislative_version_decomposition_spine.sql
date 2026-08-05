begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.docket_bill_source_document (
  source_document_key text primary key,
  source_bill_id integer not null,
  provider_document_id bigint not null,
  document_family text not null
    check (document_family in ('text', 'amendment')),
  provider_document_type text not null,
  normalized_version_type text not null
    check (normalized_version_type in (
      'introduced',
      'committee_substitute',
      'engrossed',
      'enrolled',
      'chaptered',
      'house_amendment',
      'senate_amendment',
      'other_text',
      'other_amendment'
    )),
  provider_sequence integer not null check (provider_sequence > 0),
  stage_rank integer not null check (stage_rank >= 0),
  chamber text check (chamber is null or chamber in ('H', 'S')),
  source_url text not null,
  provider_url text,
  provider_hash text,
  provider_size bigint,
  provider_date date,
  adopted boolean,
  description text,
  source_stem text,
  predecessor_source_document_key text,
  base_source_document_key text,
  latest_metadata jsonb not null default '{}'::jsonb,
  latest_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docket_bill_source_document_provider_unique
    unique (source_bill_id, document_family, provider_document_id),
  constraint docket_bill_source_document_predecessor_fkey
    foreign key (predecessor_source_document_key)
    references public.docket_bill_source_document(source_document_key),
  constraint docket_bill_source_document_base_fkey
    foreign key (base_source_document_key)
    references public.docket_bill_source_document(source_document_key)
);

create index if not exists idx_docket_bill_source_document_bill
  on public.docket_bill_source_document(
    source_bill_id,
    document_family,
    provider_sequence
  );
create index if not exists idx_docket_bill_source_document_stage
  on public.docket_bill_source_document(
    source_bill_id,
    stage_rank,
    provider_sequence
  );

create table if not exists public.docket_bill_source_document_observation (
  observation_id uuid primary key default gen_random_uuid(),
  source_document_key text not null
    references public.docket_bill_source_document(source_document_key)
    on delete cascade,
  metadata_hash text not null
    check (metadata_hash ~ '^[0-9a-f]{64}$'),
  metadata_json jsonb not null,
  docket_fetched_at timestamptz not null,
  observed_at timestamptz not null default now(),
  constraint docket_bill_source_document_observation_unique
    unique (source_document_key, metadata_hash)
);

create index if not exists idx_docket_source_observation_document
  on public.docket_bill_source_document_observation(
    source_document_key,
    observed_at desc
  );

create table if not exists public.civic_genome_bill_version (
  bill_version_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null
    references public.civic_genome_bill(genome_bill_id)
    on delete cascade,
  source_document_key text not null
    references public.docket_bill_source_document(source_document_key),
  source_bill_id integer not null,
  document_family text not null
    check (document_family in ('text', 'amendment')),
  version_type text not null,
  provider_sequence integer not null check (provider_sequence > 0),
  stage_rank integer not null check (stage_rank >= 0),
  chamber text check (chamber is null or chamber in ('H', 'S')),
  predecessor_bill_version_id uuid
    references public.civic_genome_bill_version(bill_version_id),
  base_bill_version_id uuid
    references public.civic_genome_bill_version(bill_version_id),
  version_fingerprint text not null
    check (version_fingerprint ~ '^[0-9a-f]{64}$'),
  rosetta_source_document_id bigint,
  rosetta_extraction_run_id text,
  assembly_run_id uuid
    references public.civic_genome_assembly_run(assembly_run_id),
  prism_verification_run_id uuid
    references public.civic_genome_prism_verification_run(verification_run_id),
  processing_state text not null default 'registered'
    check (processing_state in (
      'registered',
      'source_ingested',
      'extracted',
      'assembled',
      'verification_partial',
      'verified',
      'failed'
    )),
  failure_code text,
  receipt_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_bill_version_source_unique
    unique (genome_bill_id, source_document_key),
  constraint civic_genome_bill_version_fingerprint_unique
    unique (version_fingerprint)
);

create index if not exists idx_civic_genome_bill_version_bill
  on public.civic_genome_bill_version(
    genome_bill_id,
    stage_rank,
    provider_sequence
  );
create index if not exists idx_civic_genome_bill_version_assembly
  on public.civic_genome_bill_version(assembly_run_id)
  where assembly_run_id is not null;

create table if not exists public.civic_genome_legislative_version_queue (
  queue_id uuid primary key default gen_random_uuid(),
  bill_version_id uuid not null unique
    references public.civic_genome_bill_version(bill_version_id)
    on delete cascade,
  queue_state text not null default 'eligible'
    check (queue_state in (
      'eligible',
      'submitted',
      'completed',
      'degraded',
      'permanent_failure'
    )),
  priority integer not null default 1000000,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_failure_class text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_legislative_version_queue_claim
  on public.civic_genome_legislative_version_queue(
    queue_state,
    next_attempt_at,
    priority,
    created_at
  );

create or replace function public.docket_legislative_version_type(
  p_document_family text,
  p_provider_type text,
  p_chamber text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(coalesce(p_document_family, '')) = 'amendment'
      and upper(coalesce(p_chamber, '')) = 'H' then 'house_amendment'
    when lower(coalesce(p_document_family, '')) = 'amendment'
      and upper(coalesce(p_chamber, '')) = 'S' then 'senate_amendment'
    when lower(coalesce(p_document_family, '')) = 'amendment'
      then 'other_amendment'
    when lower(coalesce(p_provider_type, '')) like '%chapter%'
      or lower(coalesce(p_provider_type, '')) like '%session law%'
      then 'chaptered'
    when lower(coalesce(p_provider_type, '')) like '%enrolled%'
      or lower(coalesce(p_provider_type, '')) like '%passed legislature%'
      or lower(coalesce(p_provider_type, '')) like '%passed by legislature%'
      then 'enrolled'
    when lower(coalesce(p_provider_type, '')) like '%engross%'
      then 'engrossed'
    when lower(coalesce(p_provider_type, '')) like '%comm sub%'
      or lower(coalesce(p_provider_type, '')) like '%committee substitute%'
      or lower(coalesce(p_provider_type, '')) = 'substitute'
      then 'committee_substitute'
    when lower(coalesce(p_provider_type, '')) like '%introduc%'
      or lower(coalesce(p_provider_type, '')) like '%prefil%'
      then 'introduced'
    else 'other_text'
  end;
$$;

create or replace function public.docket_legislative_stage_rank(
  p_version_type text
)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(coalesce(p_version_type, ''))
    when 'introduced' then 100
    when 'committee_substitute' then 200
    when 'house_amendment' then 250
    when 'engrossed' then 300
    when 'senate_amendment' then 350
    when 'enrolled' then 400
    when 'chaptered' then 500
    when 'other_text' then 600
    else 700
  end;
$$;

create or replace function public.docket_legislative_source_stem(
  p_source_url text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  with decoded as (
    select replace(replace(coalesce(p_source_url, ''), '%20', ' '), '+', ' ') as value
  ), filename as (
    select regexp_replace(value, '^.*/', '') as value from decoded
  ), first_token as (
    select split_part(value, ' ', 1) as value from filename
  )
  select nullif(regexp_replace(value, '[.][Pp][Dd][Ff]$', ''), '')
  from first_token;
$$;

create or replace function public.guard_civic_genome_bill_version_lineage()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_related_genome_bill_id uuid;
begin
  if new.predecessor_bill_version_id = new.bill_version_id
     or new.base_bill_version_id = new.bill_version_id then
    raise exception using
      errcode = '22000',
      message = 'civic_genome_bill_version_self_reference';
  end if;

  if new.predecessor_bill_version_id is not null then
    select genome_bill_id
      into v_related_genome_bill_id
    from public.civic_genome_bill_version
    where bill_version_id = new.predecessor_bill_version_id;
    if v_related_genome_bill_id is distinct from new.genome_bill_id then
      raise exception using
        errcode = '22000',
        message = 'civic_genome_bill_version_predecessor_crosses_bill_identity';
    end if;
  end if;

  if new.base_bill_version_id is not null then
    select genome_bill_id
      into v_related_genome_bill_id
    from public.civic_genome_bill_version
    where bill_version_id = new.base_bill_version_id;
    if v_related_genome_bill_id is distinct from new.genome_bill_id then
      raise exception using
        errcode = '22000',
        message = 'civic_genome_bill_version_base_crosses_bill_identity';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists civic_genome_bill_version_lineage_guard
  on public.civic_genome_bill_version;
create trigger civic_genome_bill_version_lineage_guard
before insert or update of predecessor_bill_version_id, base_bill_version_id, genome_bill_id
on public.civic_genome_bill_version
for each row execute function public.guard_civic_genome_bill_version_lineage();

create or replace function public.register_docket_legislative_version_spine(
  p_source_bill_id integer,
  p_enqueue boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_bill jsonb;
  v_fetched_at timestamptz;
  v_genome_bill_id uuid;
  v_document jsonb;
  v_sequence bigint;
  v_provider_document_id bigint;
  v_document_family text;
  v_provider_type text;
  v_chamber text;
  v_version_type text;
  v_stage_rank integer;
  v_source_url text;
  v_provider_url text;
  v_provider_hash text;
  v_provider_size bigint;
  v_provider_date date;
  v_adopted boolean;
  v_description text;
  v_source_stem text;
  v_source_document_key text;
  v_metadata jsonb;
  v_metadata_hash text;
  v_registered integer := 0;
  v_enqueued integer := 0;
begin
  select cache.bill, cache.fetched_at
    into v_bill, v_fetched_at
  from public.docket_bill_detail_cache cache
  where cache.bill_id = p_source_bill_id
  order by cache.fetched_at desc
  limit 1;

  if v_bill is null then
    raise exception using
      errcode = 'P0002',
      message = 'docket_bill_detail_cache_not_found';
  end if;

  select bill.genome_bill_id
    into v_genome_bill_id
  from public.civic_genome_bill bill
  where bill.structural_dna_json ->> 'source_bill_id' = p_source_bill_id::text
  order by bill.updated_at desc, bill.genome_bill_id
  limit 1;

  if v_genome_bill_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'civic_genome_bill_not_found_for_docket_version_spine';
  end if;

  for v_document, v_sequence in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(v_bill -> 'texts', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    v_document_family := 'text';
    v_provider_document_id := nullif(v_document ->> 'doc_id', '')::bigint;
    v_provider_type := coalesce(nullif(v_document ->> 'type', ''), 'Official text');
    v_chamber := null;
    v_version_type := public.docket_legislative_version_type(
      v_document_family,
      v_provider_type,
      v_chamber
    );
    v_stage_rank := public.docket_legislative_stage_rank(v_version_type);
    v_source_url := coalesce(
      nullif(v_document ->> 'state_link', ''),
      nullif(v_document ->> 'url', '')
    );
    v_provider_url := nullif(v_document ->> 'url', '');
    v_provider_hash := nullif(v_document ->> 'text_hash', '');
    v_provider_size := nullif(v_document ->> 'text_size', '')::bigint;
    v_provider_date := case
      when coalesce(v_document ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and v_document ->> 'date' <> '0000-00-00'
        then (v_document ->> 'date')::date
      else null
    end;
    v_adopted := null;
    v_description := null;
    v_source_stem := public.docket_legislative_source_stem(v_source_url);

    if v_provider_document_id is null or v_source_url is null then
      continue;
    end if;

    v_source_document_key := format(
      'text:%s:%s',
      p_source_bill_id,
      v_provider_document_id
    );
    v_metadata := jsonb_build_object(
      'source_bill_id', p_source_bill_id,
      'source_document_key', v_source_document_key,
      'document_family', v_document_family,
      'provider_document_id', v_provider_document_id,
      'provider_sequence', v_sequence,
      'provider_document_type', v_provider_type,
      'normalized_version_type', v_version_type,
      'stage_rank', v_stage_rank,
      'source_url', v_source_url,
      'provider_url', v_provider_url,
      'provider_hash', v_provider_hash,
      'provider_size', v_provider_size,
      'provider_date', v_provider_date,
      'source_stem', v_source_stem,
      'provider_payload', v_document
    );
    v_metadata_hash := encode(
      public.digest(convert_to(v_metadata::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.docket_bill_source_document (
      source_document_key,
      source_bill_id,
      provider_document_id,
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
      latest_metadata,
      latest_observed_at
    ) values (
      v_source_document_key,
      p_source_bill_id,
      v_provider_document_id,
      v_document_family,
      v_provider_type,
      v_version_type,
      v_sequence::integer,
      v_stage_rank,
      v_chamber,
      v_source_url,
      v_provider_url,
      v_provider_hash,
      v_provider_size,
      v_provider_date,
      v_adopted,
      v_description,
      v_source_stem,
      v_metadata,
      v_fetched_at
    )
    on conflict (source_document_key) do update
    set provider_document_type = excluded.provider_document_type,
        normalized_version_type = excluded.normalized_version_type,
        provider_sequence = excluded.provider_sequence,
        stage_rank = excluded.stage_rank,
        chamber = excluded.chamber,
        source_url = excluded.source_url,
        provider_url = excluded.provider_url,
        provider_hash = excluded.provider_hash,
        provider_size = excluded.provider_size,
        provider_date = excluded.provider_date,
        adopted = excluded.adopted,
        description = excluded.description,
        source_stem = excluded.source_stem,
        latest_metadata = excluded.latest_metadata,
        latest_observed_at = excluded.latest_observed_at,
        updated_at = now();

    insert into public.docket_bill_source_document_observation (
      source_document_key,
      metadata_hash,
      metadata_json,
      docket_fetched_at
    ) values (
      v_source_document_key,
      v_metadata_hash,
      v_metadata,
      v_fetched_at
    )
    on conflict (source_document_key, metadata_hash) do nothing;

    v_registered := v_registered + 1;
  end loop;

  for v_document, v_sequence in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(v_bill -> 'amendments', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  loop
    v_document_family := 'amendment';
    v_provider_document_id := nullif(v_document ->> 'amendment_id', '')::bigint;
    v_provider_type := coalesce(
      nullif(v_document ->> 'title', ''),
      'Amendment'
    );
    v_chamber := nullif(upper(v_document ->> 'chamber'), '');
    v_version_type := public.docket_legislative_version_type(
      v_document_family,
      v_provider_type,
      v_chamber
    );
    v_stage_rank := public.docket_legislative_stage_rank(v_version_type);
    v_source_url := coalesce(
      nullif(v_document ->> 'state_link', ''),
      nullif(v_document ->> 'url', '')
    );
    v_provider_url := nullif(v_document ->> 'url', '');
    v_provider_hash := nullif(v_document ->> 'amendment_hash', '');
    v_provider_size := nullif(v_document ->> 'amendment_size', '')::bigint;
    v_provider_date := case
      when coalesce(v_document ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and v_document ->> 'date' <> '0000-00-00'
        then (v_document ->> 'date')::date
      else null
    end;
    v_adopted := case
      when v_document ? 'adopted' then (v_document ->> 'adopted')::integer = 1
      else null
    end;
    v_description := nullif(v_document ->> 'description', '');
    v_source_stem := public.docket_legislative_source_stem(v_source_url);

    if v_provider_document_id is null or v_source_url is null then
      continue;
    end if;

    v_source_document_key := format(
      'amendment:%s:%s',
      p_source_bill_id,
      v_provider_document_id
    );
    v_metadata := jsonb_build_object(
      'source_bill_id', p_source_bill_id,
      'source_document_key', v_source_document_key,
      'document_family', v_document_family,
      'provider_document_id', v_provider_document_id,
      'provider_sequence', v_sequence,
      'provider_document_type', v_provider_type,
      'normalized_version_type', v_version_type,
      'stage_rank', v_stage_rank,
      'chamber', v_chamber,
      'source_url', v_source_url,
      'provider_url', v_provider_url,
      'provider_hash', v_provider_hash,
      'provider_size', v_provider_size,
      'provider_date', v_provider_date,
      'adopted', v_adopted,
      'description', v_description,
      'source_stem', v_source_stem,
      'provider_payload', v_document
    );
    v_metadata_hash := encode(
      public.digest(convert_to(v_metadata::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.docket_bill_source_document (
      source_document_key,
      source_bill_id,
      provider_document_id,
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
      latest_metadata,
      latest_observed_at
    ) values (
      v_source_document_key,
      p_source_bill_id,
      v_provider_document_id,
      v_document_family,
      v_provider_type,
      v_version_type,
      v_sequence::integer,
      v_stage_rank,
      v_chamber,
      v_source_url,
      v_provider_url,
      v_provider_hash,
      v_provider_size,
      v_provider_date,
      v_adopted,
      v_description,
      v_source_stem,
      v_metadata,
      v_fetched_at
    )
    on conflict (source_document_key) do update
    set provider_document_type = excluded.provider_document_type,
        normalized_version_type = excluded.normalized_version_type,
        provider_sequence = excluded.provider_sequence,
        stage_rank = excluded.stage_rank,
        chamber = excluded.chamber,
        source_url = excluded.source_url,
        provider_url = excluded.provider_url,
        provider_hash = excluded.provider_hash,
        provider_size = excluded.provider_size,
        provider_date = excluded.provider_date,
        adopted = excluded.adopted,
        description = excluded.description,
        source_stem = excluded.source_stem,
        latest_metadata = excluded.latest_metadata,
        latest_observed_at = excluded.latest_observed_at,
        updated_at = now();

    insert into public.docket_bill_source_document_observation (
      source_document_key,
      metadata_hash,
      metadata_json,
      docket_fetched_at
    ) values (
      v_source_document_key,
      v_metadata_hash,
      v_metadata,
      v_fetched_at
    )
    on conflict (source_document_key, metadata_hash) do nothing;

    v_registered := v_registered + 1;
  end loop;

  update public.docket_bill_source_document document
     set predecessor_source_document_key = (
       select predecessor.source_document_key
       from public.docket_bill_source_document predecessor
       where predecessor.source_bill_id = document.source_bill_id
         and predecessor.document_family = 'text'
         and predecessor.provider_sequence < document.provider_sequence
       order by predecessor.provider_sequence desc,
                predecessor.provider_document_id desc
       limit 1
     ),
         updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'text';

  update public.docket_bill_source_document document
     set base_source_document_key = (
       select base.source_document_key
       from public.docket_bill_source_document base
       where base.source_bill_id = document.source_bill_id
         and base.document_family = 'text'
         and base.source_stem = document.source_stem
       order by base.provider_sequence desc,
                base.provider_document_id desc
       limit 1
     ),
         updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'amendment';

  insert into public.civic_genome_bill_version (
    genome_bill_id,
    source_document_key,
    source_bill_id,
    document_family,
    version_type,
    provider_sequence,
    stage_rank,
    chamber,
    version_fingerprint,
    receipt_json
  )
  select
    v_genome_bill_id,
    document.source_document_key,
    document.source_bill_id,
    document.document_family,
    document.normalized_version_type,
    document.provider_sequence,
    document.stage_rank,
    document.chamber,
    encode(
      public.digest(
        convert_to(
          jsonb_build_object(
            'genome_bill_id', v_genome_bill_id,
            'source_document_key', document.source_document_key,
            'source_bill_id', document.source_bill_id,
            'provider_document_id', document.provider_document_id,
            'document_family', document.document_family,
            'normalized_version_type', document.normalized_version_type,
            'provider_sequence', document.provider_sequence,
            'source_url', document.source_url,
            'provider_hash', document.provider_hash
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'docket_source_document_key', document.source_document_key,
      'provider_document_id', document.provider_document_id,
      'provider_document_type', document.provider_document_type,
      'source_url', document.source_url,
      'provider_hash', document.provider_hash,
      'registered_at', now()
    )
  from public.docket_bill_source_document document
  where document.source_bill_id = p_source_bill_id
  on conflict (genome_bill_id, source_document_key) do update
  set document_family = excluded.document_family,
      version_type = excluded.version_type,
      provider_sequence = excluded.provider_sequence,
      stage_rank = excluded.stage_rank,
      chamber = excluded.chamber,
      version_fingerprint = excluded.version_fingerprint,
      receipt_json = public.civic_genome_bill_version.receipt_json
        || excluded.receipt_json,
      updated_at = now();

  update public.civic_genome_bill_version version
     set predecessor_bill_version_id = predecessor.bill_version_id,
         base_bill_version_id = base.bill_version_id,
         updated_at = now()
  from public.docket_bill_source_document document
  left join public.civic_genome_bill_version predecessor
    on predecessor.genome_bill_id = version.genome_bill_id
   and predecessor.source_document_key = document.predecessor_source_document_key
  left join public.civic_genome_bill_version base
    on base.genome_bill_id = version.genome_bill_id
   and base.source_document_key = document.base_source_document_key
  where version.genome_bill_id = v_genome_bill_id
    and version.source_document_key = document.source_document_key
    and document.source_bill_id = p_source_bill_id;

  if p_enqueue then
    insert into public.civic_genome_legislative_version_queue (
      bill_version_id,
      queue_state,
      priority,
      next_attempt_at
    )
    select
      version.bill_version_id,
      'eligible',
      (
        case
          when version.document_family = 'amendment'
            then coalesce(base.stage_rank + 50, version.stage_rank)
          else version.stage_rank
        end * 1000
      ) + version.provider_sequence,
      now()
    from public.civic_genome_bill_version version
    left join public.civic_genome_bill_version base
      on base.bill_version_id = version.base_bill_version_id
    where version.genome_bill_id = v_genome_bill_id
      and version.processing_state not in ('verified')
    on conflict (bill_version_id) do update
    set queue_state = case
          when public.civic_genome_legislative_version_queue.queue_state = 'completed'
            then 'completed'
          else 'eligible'
        end,
        priority = excluded.priority,
        next_attempt_at = now(),
        updated_at = now();

    get diagnostics v_enqueued = row_count;
  end if;

  return jsonb_build_object(
    'source_bill_id', p_source_bill_id,
    'genome_bill_id', v_genome_bill_id,
    'registered_document_count', v_registered,
    'text_version_count', (
      select count(*)
      from public.docket_bill_source_document
      where source_bill_id = p_source_bill_id
        and document_family = 'text'
    ),
    'amendment_count', (
      select count(*)
      from public.docket_bill_source_document
      where source_bill_id = p_source_bill_id
        and document_family = 'amendment'
    ),
    'matched_amendment_base_count', (
      select count(*)
      from public.docket_bill_source_document
      where source_bill_id = p_source_bill_id
        and document_family = 'amendment'
        and base_source_document_key is not null
    ),
    'queued_or_refreshed_count', v_enqueued,
    'docket_fetched_at', v_fetched_at
  );
end;
$$;

create or replace function public.record_civic_genome_version_prism_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.civic_genome_bill_version
     set prism_verification_run_id = new.verification_run_id,
         processing_state = case
           when new.receipt_count = new.expected_trait_count
             then 'verified'
           else 'verification_partial'
         end,
         receipt_json = receipt_json || jsonb_build_object(
           'prism_verification_run_id', new.verification_run_id,
           'prism_engine_version', new.prism_engine_version,
           'prism_rule_set_version', new.prism_rule_set_version,
           'prism_expected_trait_count', new.expected_trait_count,
           'prism_receipt_count', new.receipt_count,
           'prism_status_counts', new.status_counts,
           'prism_output_hash', new.output_hash,
           'prism_receipt_manifest_hash', new.receipt_manifest_hash,
           'prism_completed_at', new.completed_at
         ),
         updated_at = now()
   where assembly_run_id = new.assembly_run_id;
  return new;
end;
$$;

drop trigger if exists civic_genome_version_prism_completion
  on public.civic_genome_prism_verification_run;
create trigger civic_genome_version_prism_completion
after insert or update of receipt_count, expected_trait_count, completed_at
on public.civic_genome_prism_verification_run
for each row execute function public.record_civic_genome_version_prism_completion();

alter table public.docket_bill_source_document enable row level security;
alter table public.docket_bill_source_document_observation enable row level security;
alter table public.civic_genome_bill_version enable row level security;
alter table public.civic_genome_legislative_version_queue enable row level security;

revoke all on table public.docket_bill_source_document
  from public, anon, authenticated;
revoke all on table public.docket_bill_source_document_observation
  from public, anon, authenticated;
revoke all on table public.civic_genome_bill_version
  from public, anon, authenticated;
revoke all on table public.civic_genome_legislative_version_queue
  from public, anon, authenticated;

grant select, insert, update on table public.docket_bill_source_document
  to service_role;
grant select, insert on table public.docket_bill_source_document_observation
  to service_role;
grant select, insert, update on table public.civic_genome_bill_version
  to service_role;
grant select, insert, update on table public.civic_genome_legislative_version_queue
  to service_role;

revoke all on function public.docket_legislative_version_type(text, text, text)
  from public, anon, authenticated;
revoke all on function public.docket_legislative_stage_rank(text)
  from public, anon, authenticated;
revoke all on function public.docket_legislative_source_stem(text)
  from public, anon, authenticated;
revoke all on function public.guard_civic_genome_bill_version_lineage()
  from public, anon, authenticated;
revoke all on function public.register_docket_legislative_version_spine(integer, boolean)
  from public, anon, authenticated;
revoke all on function public.record_civic_genome_version_prism_completion()
  from public, anon, authenticated;

grant execute on function public.register_docket_legislative_version_spine(integer, boolean)
  to service_role;

comment on table public.docket_bill_source_document is
  'Docket-owned stable identity registry for every official bill text and amendment supplied by the cached legislative provider. Latest metadata is a compatibility mirror; immutable observations are preserved separately.';
comment on table public.docket_bill_source_document_observation is
  'Immutable observed metadata receipts for Docket bill texts and amendments. Provider changes create new observations instead of rewriting prior evidence.';
comment on table public.civic_genome_bill_version is
  'Civic Genome version-bound operating record linking one Docket source document to its Rosetta extraction, Genome assembly, and Prism verification without converting document versions into separate bill identities.';
comment on table public.civic_genome_legislative_version_queue is
  'Durable exact-source queue for deterministic legislative-version decomposition. Each job names one registered Docket document and never selects a latest or preferred version.';
comment on function public.register_docket_legislative_version_spine(integer, boolean) is
  'Registers provider-declared bill texts and amendments, preserves observations, binds exact source documents to one Civic Genome bill identity, and optionally queues each version for Rosetta and Prism circulation.';

commit;
