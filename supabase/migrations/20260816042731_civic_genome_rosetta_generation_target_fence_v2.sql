begin;

alter table public.civic_genome_rosetta_generation_target
  add column if not exists validation_test_name text,
  add column if not exists promoted_at timestamptz;

update public.civic_genome_rosetta_generation_target
set validation_test_name = case
      when engine_version='rosetta-v3-deterministic-sql-2.5.3' then 'independent_structure_v253'
      else coalesce(validation_test_name,'unknown')
    end,
    promoted_at = case
      when engine_version='rosetta-v3-deterministic-sql-2.5.3' then timestamptz '2026-08-16 00:43:18.605659+00'
      else coalesce(promoted_at,observed_at)
    end
where validation_test_name is null or promoted_at is null;

alter table public.civic_genome_rosetta_generation_target
  alter column validation_test_name set not null,
  alter column promoted_at set not null;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  add column if not exists target_validation_test_name text,
  add column if not exists target_promoted_at timestamptz;

update public.civic_genome_rosetta_generation_upgrade_queue queue
set target_validation_test_name = target.validation_test_name,
    target_promoted_at = target.promoted_at
from public.civic_genome_rosetta_generation_target target
where target.target_name='current'
  and queue.target_engine_version=target.engine_version
  and queue.target_rule_set_version=target.rule_set_version
  and queue.target_rule_manifest_hash=target.rule_manifest_hash
  and (queue.target_validation_test_name is null or queue.target_promoted_at is null);

alter table public.civic_genome_rosetta_generation_upgrade_queue
  alter column target_validation_test_name set not null,
  alter column target_promoted_at set not null;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  drop constraint if exists civic_genome_rosetta_generation_upgrade_queue_generation_unique;
alter table public.civic_genome_rosetta_generation_upgrade_queue
  add constraint civic_genome_rosetta_generation_upgrade_queue_generation_unique
  unique (
    source_document_id,
    target_engine_version,
    target_rule_set_version,
    target_rule_manifest_hash,
    target_validation_test_name,
    target_promoted_at
  );

drop function if exists public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text);
create function public.civic_genome_observe_rosetta_generation_target_v1(
  p_contract text,
  p_engine_version text,
  p_rule_set_version text,
  p_rule_manifest_hash text,
  p_validation_test_name text,
  p_promoted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_current public.civic_genome_rosetta_generation_target%rowtype;
  v_superseded integer:=0;
  v_same boolean:=false;
begin
  if nullif(btrim(p_contract),'') is null
     or nullif(btrim(p_engine_version),'') is null
     or nullif(btrim(p_rule_set_version),'') is null
     or p_rule_manifest_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_validation_test_name),'') is null
     or p_promoted_at is null then
    raise exception using errcode='22023',message='civic_genome_rosetta_generation_target_invalid';
  end if;

  select * into v_current
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
  for update;

  if found then
    if p_promoted_at < v_current.promoted_at then
      return jsonb_build_object(
        'contract','civic-genome-rosetta-target-observation-v2',
        'accepted',false,
        'stale_observation_ignored',true,
        'stored_promoted_at',v_current.promoted_at,
        'observed_promoted_at',p_promoted_at,
        'engine_version',v_current.engine_version,
        'rule_set_version',v_current.rule_set_version,
        'rule_manifest_hash',v_current.rule_manifest_hash,
        'validation_test_name',v_current.validation_test_name,
        'superseded_job_count',0
      );
    end if;

    v_same := p_promoted_at=v_current.promoted_at
      and p_contract=v_current.contract
      and p_engine_version=v_current.engine_version
      and p_rule_set_version=v_current.rule_set_version
      and p_rule_manifest_hash=v_current.rule_manifest_hash
      and p_validation_test_name=v_current.validation_test_name;

    if p_promoted_at=v_current.promoted_at and not v_same then
      raise exception using
        errcode='22000',
        message='civic_genome_rosetta_generation_target_same_promotion_conflict',
        detail=jsonb_build_object(
          'stored_engine_version',v_current.engine_version,
          'stored_rule_set_version',v_current.rule_set_version,
          'stored_rule_manifest_hash',v_current.rule_manifest_hash,
          'stored_validation_test_name',v_current.validation_test_name,
          'promoted_at',v_current.promoted_at,
          'observed_engine_version',p_engine_version,
          'observed_rule_set_version',p_rule_set_version,
          'observed_rule_manifest_hash',p_rule_manifest_hash,
          'observed_validation_test_name',p_validation_test_name
        )::text;
    end if;
  end if;

  insert into public.civic_genome_rosetta_generation_target(
    target_name,contract,engine_version,rule_set_version,rule_manifest_hash,
    validation_test_name,promoted_at,observed_at,updated_at
  ) values (
    'current',p_contract,p_engine_version,p_rule_set_version,p_rule_manifest_hash,
    p_validation_test_name,p_promoted_at,now(),now()
  )
  on conflict(target_name) do update set
    contract=excluded.contract,
    engine_version=excluded.engine_version,
    rule_set_version=excluded.rule_set_version,
    rule_manifest_hash=excluded.rule_manifest_hash,
    validation_test_name=excluded.validation_test_name,
    promoted_at=excluded.promoted_at,
    observed_at=excluded.observed_at,
    updated_at=now();

  update public.civic_genome_rosetta_generation_upgrade_queue queue
     set queue_state='superseded',
         locked_at=null,
         locked_by=null,
         last_error_code='rosetta_generation_target_superseded',
         last_error_detail='A newer monotonic Rosetta current-generation receipt replaced this queued target before completion.',
         updated_at=now()
   where queue.queue_state in ('eligible','retry','running')
     and (
       queue.target_engine_version is distinct from p_engine_version
       or queue.target_rule_set_version is distinct from p_rule_set_version
       or queue.target_rule_manifest_hash is distinct from p_rule_manifest_hash
       or queue.target_validation_test_name is distinct from p_validation_test_name
       or queue.target_promoted_at is distinct from p_promoted_at
     );
  get diagnostics v_superseded=row_count;

  return jsonb_build_object(
    'contract','civic-genome-rosetta-target-observation-v2',
    'accepted',true,
    'stale_observation_ignored',false,
    'engine_version',p_engine_version,
    'rule_set_version',p_rule_set_version,
    'rule_manifest_hash',p_rule_manifest_hash,
    'validation_test_name',p_validation_test_name,
    'promoted_at',p_promoted_at,
    'superseded_job_count',v_superseded,
    'observed_at',now()
  );
end;
$$;

revoke all on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz)
  to service_role;

create or replace function public.civic_genome_guard_rosetta_upgrade_queue_target_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare v_target public.civic_genome_rosetta_generation_target%rowtype;
begin
  select * into v_target
  from public.civic_genome_rosetta_generation_target
  where target_name='current';
  if not found then
    raise exception using errcode='55000',message='civic_genome_rosetta_generation_target_unavailable';
  end if;

  if new.target_engine_version is distinct from v_target.engine_version
     or new.target_rule_set_version is distinct from v_target.rule_set_version
     or new.target_rule_manifest_hash is distinct from v_target.rule_manifest_hash
     or new.target_validation_test_name is distinct from v_target.validation_test_name
     or new.target_promoted_at is distinct from v_target.promoted_at then
    raise exception using errcode='22000',message='civic_genome_rosetta_upgrade_queue_target_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists civic_genome_guard_rosetta_upgrade_queue_target_v1
  on public.civic_genome_rosetta_generation_upgrade_queue;
create trigger civic_genome_guard_rosetta_upgrade_queue_target_v1
before insert or update of target_engine_version,target_rule_set_version,target_rule_manifest_hash,target_validation_test_name,target_promoted_at
on public.civic_genome_rosetta_generation_upgrade_queue
for each row execute function public.civic_genome_guard_rosetta_upgrade_queue_target_v1();

create or replace function public.civic_genome_assert_rosetta_generation_target_v1(
  p_engine_version text,
  p_rule_set_version text,
  p_rule_manifest_hash text,
  p_validation_test_name text,
  p_promoted_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_target public.civic_genome_rosetta_generation_target%rowtype;
begin
  select * into v_target
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
  for share;
  if not found then
    raise exception using errcode='55000',message='civic_genome_rosetta_generation_target_unavailable';
  end if;
  if p_engine_version is distinct from v_target.engine_version
     or p_rule_set_version is distinct from v_target.rule_set_version
     or p_rule_manifest_hash is distinct from v_target.rule_manifest_hash
     or p_validation_test_name is distinct from v_target.validation_test_name
     or p_promoted_at is distinct from v_target.promoted_at then
    raise exception using errcode='22000',message='civic_genome_rosetta_generation_target_mismatch';
  end if;
end;
$$;

revoke all on function public.civic_genome_assert_rosetta_generation_target_v1(text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.civic_genome_assert_rosetta_generation_target_v1(text,text,text,text,timestamptz)
  to service_role;

comment on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz) is
  'Monotonic Rosetta generation target observer. A lower promoted_at receipt is ignored, equal promoted_at with different identity is rejected, and accepted target changes supersede incomplete older work.';
comment on function public.civic_genome_guard_rosetta_upgrade_queue_target_v1() is
  'Prevents stale discovery/enqueue from creating or retargeting queue work that does not exactly match the currently stored Rosetta engine/rule/manifest/validation/promoted-at generation.';
comment on function public.civic_genome_assert_rosetta_generation_target_v1(text,text,text,text,timestamptz) is
  'Transaction fence for generation-upgrade assembly. Locks the current target row FOR SHARE and fails unless the exact Rosetta generation identity still matches before any assembly writes.';

commit;
