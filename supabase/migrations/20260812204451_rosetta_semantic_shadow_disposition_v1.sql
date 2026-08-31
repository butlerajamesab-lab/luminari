create table if not exists public.rosetta_semantic_shadow_disposition_event (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id integer not null,
  parser_version text not null,
  event_seq bigint not null check (event_seq > 0),
  disposition text not null check (disposition in ('SUPERSEDED','QUARANTINED','REVOKED','REINSTATED')),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  reason_text text,
  actor_identity text not null check (length(btrim(actor_identity)) > 0),
  effective_at timestamptz not null,
  previous_event_hash text check (previous_event_hash is null or previous_event_hash ~ '^[a-f0-9]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  signature_algorithm text,
  signature text,
  created_at timestamptz not null default now(),
  unique (extraction_run_id, parser_version, event_seq),
  foreign key (extraction_run_id, parser_version)
    references public.rosetta_semantic_shadow_run(extraction_run_id, parser_version),
  check ((signature_algorithm is null and signature is null) or (signature_algorithm is not null and signature is not null))
)

create index if not exists rosetta_semantic_shadow_disposition_latest_idx
  on public.rosetta_semantic_shadow_disposition_event(extraction_run_id, parser_version, event_seq desc)

alter table public.rosetta_semantic_shadow_disposition_event enable row level security

revoke all on public.rosetta_semantic_shadow_disposition_event from public, anon, authenticated

grant select on public.rosetta_semantic_shadow_disposition_event to service_role

create or replace function public.append_rosetta_semantic_shadow_disposition(
  p_extraction_run_id integer,
  p_parser_version text,
  p_disposition text,
  p_reason_code text,
  p_reason_text text,
  p_actor_identity text,
  p_effective_at timestamptz default now(),
  p_signature_algorithm text default null,
  p_signature text default null
)
returns public.rosetta_semantic_shadow_disposition_event
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.rosetta_semantic_shadow_disposition_event%rowtype;
  v_event public.rosetta_semantic_shadow_disposition_event%rowtype;
  v_seq bigint;
  v_hash text;
  v_effective_at timestamptz := coalesce(p_effective_at, now());
begin
  if p_disposition not in ('SUPERSEDED','QUARANTINED','REVOKED','REINSTATED') then
    raise exception 'semantic_shadow_disposition_invalid';
  end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'semantic_shadow_disposition_reason_required';
  end if;
  if nullif(btrim(p_actor_identity), '') is null then
    raise exception 'semantic_shadow_disposition_actor_required';
  end if;
  if (p_signature_algorithm is null) <> (p_signature is null) then
    raise exception 'semantic_shadow_disposition_signature_pair_required';
  end if;

  perform 1
  from public.rosetta_semantic_shadow_run r
  where r.extraction_run_id = p_extraction_run_id
    and r.parser_version = p_parser_version
    and r.state = 'complete';
  if not found then
    raise exception 'semantic_shadow_completion_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_extraction_run_id::text || E'\x1f' || p_parser_version, 0));

  select * into v_previous
  from public.rosetta_semantic_shadow_disposition_event e
  where e.extraction_run_id = p_extraction_run_id
    and e.parser_version = p_parser_version
  order by e.event_seq desc
  limit 1;

  v_seq := coalesce(v_previous.event_seq, 0) + 1;
  v_hash := encode(digest(
    concat_ws(E'\x1f',
      p_extraction_run_id::text,
      p_parser_version,
      v_seq::text,
      p_disposition,
      p_reason_code,
      coalesce(p_reason_text, ''),
      p_actor_identity,
      to_char(v_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      coalesce(v_previous.event_hash, '')
    ),
    'sha256'
  ), 'hex');

  insert into public.rosetta_semantic_shadow_disposition_event (
    extraction_run_id, parser_version, event_seq, disposition,
    reason_code, reason_text, actor_identity, effective_at,
    previous_event_hash, event_hash, signature_algorithm, signature
  ) values (
    p_extraction_run_id, p_parser_version, v_seq, p_disposition,
    p_reason_code, p_reason_text, p_actor_identity, v_effective_at,
    v_previous.event_hash, v_hash, p_signature_algorithm, p_signature
  ) returning * into v_event;

  return v_event;
end;
$$

revoke all on function public.append_rosetta_semantic_shadow_disposition(integer,text,text,text,text,text,timestamptz,text,text) from public, anon, authenticated

grant execute on function public.append_rosetta_semantic_shadow_disposition(integer,text,text,text,text,text,timestamptz,text,text) to service_role

create or replace view public.rosetta_semantic_shadow_consumable
with (security_invoker = true)
as
select
  r.*,
  coalesce(d.disposition, 'ACTIVE') as effective_disposition,
  d.event_hash as effective_disposition_event_hash,
  d.effective_at as effective_disposition_at
from public.rosetta_semantic_shadow_run r
left join lateral (
  select e.disposition, e.event_hash, e.effective_at
  from public.rosetta_semantic_shadow_disposition_event e
  where e.extraction_run_id = r.extraction_run_id
    and e.parser_version = r.parser_version
    and e.effective_at <= now()
  order by e.event_seq desc
  limit 1
) d on true
where r.state = 'complete'
  and (d.disposition is null or d.disposition = 'REINSTATED')

revoke all on public.rosetta_semantic_shadow_consumable from public, anon, authenticated

grant select on public.rosetta_semantic_shadow_consumable to service_role

comment on table public.rosetta_semantic_shadow_disposition_event is
  'Immutable hash-chained disposition ledger for completed noncanonical Rosetta semantic shadow runs. Completion rows are never mutated; quarantine, revocation, supersession, and reinstatement are appended here.'

comment on view public.rosetta_semantic_shadow_consumable is
  'Service-role consumption boundary: completed semantic shadow runs with no effective blocking disposition, or with a later REINSTATED disposition.'
