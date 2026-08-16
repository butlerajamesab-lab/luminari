begin;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  add constraint civic_genome_rosetta_generation_upgrade_queue_legacy_generation_unique
  unique (source_document_id,target_engine_version,target_rule_set_version,target_rule_manifest_hash);

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

  if new.target_validation_test_name is null then
    new.target_validation_test_name:=v_target.validation_test_name;
  end if;
  if new.target_promoted_at is null then
    new.target_promoted_at:=v_target.promoted_at;
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

create or replace function public.civic_genome_guard_rosetta_upgrade_queue_claim_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare v_target public.civic_genome_rosetta_generation_target%rowtype;
begin
  if new.queue_state is distinct from 'running' or old.queue_state='running' then
    return new;
  end if;

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
    raise exception using errcode='22000',message='civic_genome_rosetta_upgrade_queue_claim_target_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists civic_genome_guard_rosetta_upgrade_queue_claim_v1
  on public.civic_genome_rosetta_generation_upgrade_queue;
create trigger civic_genome_guard_rosetta_upgrade_queue_claim_v1
before update of queue_state on public.civic_genome_rosetta_generation_upgrade_queue
for each row execute function public.civic_genome_guard_rosetta_upgrade_queue_claim_v1();

create or replace function public.civic_genome_guard_rosetta_assembly_target_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare v_target public.civic_genome_rosetta_generation_target%rowtype;
begin
  if nullif(btrim(coalesce(new.rosetta_engine_version,'')),'') is null then
    return new;
  end if;

  select * into v_target
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
  for share;
  if not found then
    raise exception using errcode='55000',message='civic_genome_rosetta_generation_target_unavailable';
  end if;

  if new.rosetta_engine_version is distinct from v_target.engine_version
     or new.rosetta_rule_set_version is distinct from v_target.rule_set_version
     or new.rosetta_rule_manifest_hash is distinct from v_target.rule_manifest_hash then
    raise exception using
      errcode='22000',
      message='civic_genome_rosetta_assembly_target_mismatch',
      detail=jsonb_build_object(
        'target_engine_version',v_target.engine_version,
        'target_rule_set_version',v_target.rule_set_version,
        'target_rule_manifest_hash',v_target.rule_manifest_hash,
        'target_validation_test_name',v_target.validation_test_name,
        'target_promoted_at',v_target.promoted_at,
        'observed_engine_version',new.rosetta_engine_version,
        'observed_rule_set_version',new.rosetta_rule_set_version,
        'observed_rule_manifest_hash',new.rosetta_rule_manifest_hash
      )::text;
  end if;
  return new;
end;
$$;

drop trigger if exists civic_genome_guard_rosetta_assembly_target_v1
  on public.civic_genome_assembly_run;
create trigger civic_genome_guard_rosetta_assembly_target_v1
before insert or update of rosetta_engine_version,rosetta_rule_set_version,rosetta_rule_manifest_hash
on public.civic_genome_assembly_run
for each row execute function public.civic_genome_guard_rosetta_assembly_target_v1();

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
  where target_name='current'
  for share;
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
        'target_validation_test_name',v_target.validation_test_name,
        'target_promoted_at',v_target.promoted_at,
        'observed_engine_version',new.receipt_json->>'rosetta_engine_version',
        'observed_rule_set_version',new.receipt_json->>'rosetta_rule_set_version',
        'observed_rule_manifest_hash',new.receipt_json->>'rosetta_rule_manifest_hash'
      )::text;
  end if;
  return new;
end;
$$;

comment on function public.civic_genome_guard_rosetta_upgrade_queue_claim_v1() is
  'Rejects transition of stale Rosetta generation work to running if its exact target no longer matches the current downstream generation target.';
comment on function public.civic_genome_guard_rosetta_assembly_target_v1() is
  'Assembly transaction fence. Rosetta-backed assembly runs must match the current engine/rule/manifest target; the target row is held FOR SHARE until the assembly transaction ends so concurrent target observation cannot invalidate the transaction mid-write.';
comment on function public.civic_genome_guard_rosetta_generation_upgrade_version_v1() is
  'Post-assembly activation fence. Generation-upgrade version receipts must match the current Rosetta target and hold its row FOR SHARE through the activating update.';

commit;
