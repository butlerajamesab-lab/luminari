begin;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  drop constraint civic_genome_rosetta_generation_upgrade_queue_queue_state_check;
alter table public.civic_genome_rosetta_generation_upgrade_queue
  add constraint civic_genome_rosetta_generation_upgrade_queue_queue_state_check
  check (queue_state in ('eligible','running','retry','completed','dead_letter','superseded'));

create or replace function public.civic_genome_observe_rosetta_generation_target_v1(
  p_contract text,
  p_engine_version text,
  p_rule_set_version text,
  p_rule_manifest_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_superseded integer:=0;
begin
  if nullif(btrim(p_contract),'') is null
     or nullif(btrim(p_engine_version),'') is null
     or nullif(btrim(p_rule_set_version),'') is null
     or p_rule_manifest_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='civic_genome_rosetta_generation_target_invalid';
  end if;

  insert into public.civic_genome_rosetta_generation_target(
    target_name,contract,engine_version,rule_set_version,rule_manifest_hash,observed_at,updated_at
  ) values (
    'current',p_contract,p_engine_version,p_rule_set_version,p_rule_manifest_hash,now(),now()
  )
  on conflict(target_name) do update set
    contract=excluded.contract,
    engine_version=excluded.engine_version,
    rule_set_version=excluded.rule_set_version,
    rule_manifest_hash=excluded.rule_manifest_hash,
    observed_at=excluded.observed_at,
    updated_at=now();

  update public.civic_genome_rosetta_generation_upgrade_queue queue
     set queue_state='superseded',
         locked_at=null,
         locked_by=null,
         last_error_code='rosetta_generation_target_superseded',
         last_error_detail='A newer Rosetta current-generation receipt replaced this queued target before completion.',
         updated_at=now()
   where queue.queue_state in ('eligible','retry','running')
     and (
       queue.target_engine_version is distinct from p_engine_version
       or queue.target_rule_set_version is distinct from p_rule_set_version
       or queue.target_rule_manifest_hash is distinct from p_rule_manifest_hash
     );
  get diagnostics v_superseded=row_count;

  return jsonb_build_object(
    'contract','civic-genome-rosetta-target-observation-v1',
    'engine_version',p_engine_version,
    'rule_set_version',p_rule_set_version,
    'rule_manifest_hash',p_rule_manifest_hash,
    'superseded_job_count',v_superseded,
    'observed_at',now()
  );
end;
$$;

revoke all on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text)
  to service_role;

create or replace function public.civic_genome_guard_rosetta_generation_upgrade_version_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_target public.civic_genome_rosetta_generation_target%rowtype;
  v_upgrade_at text;
begin
  v_upgrade_at:=new.receipt_json->>'rosetta_generation_upgrade_at';
  if v_upgrade_at is null
     or v_upgrade_at is not distinct from old.receipt_json->>'rosetta_generation_upgrade_at' then
    return new;
  end if;

  select * into v_target
  from public.civic_genome_rosetta_generation_target
  where target_name='current';
  if not found then
    raise exception using errcode='55000',message='civic_genome_rosetta_generation_target_unavailable';
  end if;

  if coalesce(new.receipt_json->>'rosetta_engine_version','')<>v_target.engine_version
     or coalesce(new.receipt_json->>'rosetta_rule_set_version','')<>v_target.rule_set_version
     or coalesce(new.receipt_json->>'rosetta_rule_manifest_hash','')<>v_target.rule_manifest_hash then
    raise exception using
      errcode='22000',
      message='civic_genome_rosetta_generation_upgrade_target_mismatch',
      detail=jsonb_build_object(
        'target_engine_version',v_target.engine_version,
        'target_rule_set_version',v_target.rule_set_version,
        'target_rule_manifest_hash',v_target.rule_manifest_hash,
        'observed_engine_version',new.receipt_json->>'rosetta_engine_version',
        'observed_rule_set_version',new.receipt_json->>'rosetta_rule_set_version',
        'observed_rule_manifest_hash',new.receipt_json->>'rosetta_rule_manifest_hash'
      )::text;
  end if;
  return new;
end;
$$;

drop trigger if exists civic_genome_guard_rosetta_generation_upgrade_version_v1
  on public.civic_genome_bill_version;
create trigger civic_genome_guard_rosetta_generation_upgrade_version_v1
before update of receipt_json on public.civic_genome_bill_version
for each row execute function public.civic_genome_guard_rosetta_generation_upgrade_version_v1();

comment on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text) is
  'Atomically records the exact Rosetta current generation and supersedes incomplete queue work for every older engine/rule/manifest target.';
comment on function public.civic_genome_guard_rosetta_generation_upgrade_version_v1() is
  'Fail-closed guard: a generation-upgrade receipt may advance a Civic Genome version only if its exact engine/rule/manifest matches the currently observed Rosetta generation.';

commit;
