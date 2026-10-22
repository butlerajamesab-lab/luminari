-- PROPOSAL ONLY — this is NOT in supabase/migrations and must not be applied
-- until independently approved alongside the existing SQL publication quarantine.
-- Existing target schema has NOT NULL validation_test_name and its old observer
-- requires a fabricated field. This V12-specific path deliberately does not.
begin;

alter table public.civic_genome_rosetta_generation_target
  alter column validation_test_name drop not null,
  add column if not exists read_contract_sha256 text,
  add column if not exists installed_ruleset_sha256 text,
  add column if not exists target_identity_valid boolean,
  add column if not exists target_engine_identity_valid boolean,
  add column if not exists target_read_identity_valid boolean;

alter table public.civic_genome_rosetta_generation_target
  add constraint civic_genome_v12_target_read_contract_hash_check
  check (read_contract_sha256 is null or read_contract_sha256 ~ '^[a-f0-9]{64}$');

alter table public.civic_genome_rosetta_generation_target
  add constraint civic_genome_v12_target_installed_hash_check
  check (installed_ruleset_sha256 is null or installed_ruleset_sha256 ~ '^[a-f0-9]{64}$');

-- New V12 observer proposal. The legacy observer is unchanged.
-- Does not enable workers, promote Rosetta data, or bypass SQL quarantine triggers.
create function public.civic_genome_observe_rosetta_generation_target_v12(
  p_contract text,
  p_engine_version text,
  p_rule_set_version text,
  p_rule_manifest_hash text,
  p_read_contract_sha256 text,
  p_selected_at timestamptz,
  p_identity_valid boolean,
  p_engine_identity_valid boolean,
  p_read_identity_valid boolean,
  p_installed_ruleset_sha256 text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $body$
declare
  v_current public.civic_genome_rosetta_generation_target%rowtype;
begin
  if p_contract is distinct from 'rosetta-rule-live-detail-v1'
    or nullif(btrim(p_rule_set_version), '') is null
    or p_engine_version is distinct from p_rule_set_version
    or p_rule_manifest_hash !~ '^[a-f0-9]{64}$'
    or p_installed_ruleset_sha256 is distinct from p_rule_manifest_hash
    or p_read_contract_sha256 !~ '^[a-f0-9]{64}$'
    or p_selected_at is null
    or p_identity_valid is distinct from true
    or p_engine_identity_valid is distinct from true
    or p_read_identity_valid is distinct from true
  then
    raise exception using errcode = '22023',
      message = 'civic_genome_rosetta_v12_target_identity_invalid';
  end if;

  select * into v_current
  from public.civic_genome_rosetta_generation_target
  where target_name = 'current' for update;

  if found and v_current.promoted_at > p_selected_at then
    return jsonb_build_object(
      'contract', 'civic-genome-rosetta-target-observation-v12',
      'accepted', false, 'stale_observation_ignored', true,
      'observed_selected_at', p_selected_at
    );
  end if;

  if found and v_current.promoted_at = p_selected_at
    and (
      v_current.contract is distinct from p_contract
      or v_current.engine_version is distinct from p_engine_version
      or v_current.rule_set_version is distinct from p_rule_set_version
      or v_current.rule_manifest_hash is distinct from p_rule_manifest_hash
      or v_current.read_contract_sha256 is distinct from p_read_contract_sha256
      or v_current.installed_ruleset_sha256 is distinct from p_installed_ruleset_sha256
      or v_current.target_identity_valid is distinct from true
      or v_current.target_engine_identity_valid is distinct from true
      or v_current.target_read_identity_valid is distinct from true
      or v_current.validation_test_name is not null
    )
  then
    raise exception using errcode = '22000',
      message = 'civic_genome_rosetta_v12_target_same_selection_conflict';
  end if;

  insert into public.civic_genome_rosetta_generation_target (
    target_name, contract, engine_version, rule_set_version, rule_manifest_hash,
    validation_test_name, promoted_at, read_contract_sha256,
    installed_ruleset_sha256, target_identity_valid, target_engine_identity_valid,
    target_read_identity_valid, observed_at, updated_at
  ) values (
    'current', p_contract, p_engine_version, p_rule_set_version, p_rule_manifest_hash,
    null, p_selected_at, p_read_contract_sha256,
    p_installed_ruleset_sha256, true, true, true, now(), now()
  )
  on conflict (target_name) do update set
    contract = excluded.contract,
    engine_version = excluded.engine_version,
    rule_set_version = excluded.rule_set_version,
    rule_manifest_hash = excluded.rule_manifest_hash,
    validation_test_name = null,
    promoted_at = excluded.promoted_at,
    read_contract_sha256 = excluded.read_contract_sha256,
    installed_ruleset_sha256 = excluded.installed_ruleset_sha256,
    target_identity_valid = true,
    target_engine_identity_valid = true,
    target_read_identity_valid = true,
    observed_at = now(), updated_at = now();

  return jsonb_build_object(
    'contract', 'civic-genome-rosetta-target-observation-v12',
    'accepted', true, 'rule_set_version', p_rule_set_version,
    'engine_version', p_rule_set_version, 'rule_manifest_hash', p_rule_manifest_hash,
    'read_contract_sha256', p_read_contract_sha256,
    'installed_ruleset_sha256', p_installed_ruleset_sha256,
    'selected_at', p_selected_at
  );
end;
$body$;

revoke all on function public.civic_genome_observe_rosetta_generation_target_v12(
  text,text,text,text,text,timestamptz,boolean,boolean,boolean,text
) from public, anon, authenticated;
grant execute on function public.civic_genome_observe_rosetta_generation_target_v12(
  text,text,text,text,text,timestamptz,boolean,boolean,boolean,text
) to service_role;

-- IMPORTANT: the independent DB write-quarantine trigger is NOT removed here.
-- Queue target fences and downstream structural adapter must be reconciled in a
-- distinct, approved release. This proposal is not a production-ready migration.
commit;
