-- ============================================================================
-- Migration 15 -- guarded promotion REQUEST only.  This package contains no
-- production-registry write and cannot publish the candidate.
-- ============================================================================

create table if not exists rosetta_replay.promotion_request (
    promotion_request_id uuid primary key default gen_random_uuid(),
    manifest_id uuid not null,
    manifest_hash text not null,
    engine_version text not null,
    rule_set_version text not null,
    configuration_contract_hash text not null,
    closure_hash text not null,
    quarantine_set_id text not null,
    gate_result jsonb not null,
    authorization_id uuid not null references rosetta_replay.human_authorization,
    requested_at timestamptz not null default clock_timestamp(),
    requested_by text not null default current_user,
    unique(manifest_id,engine_version,rule_set_version,
           configuration_contract_hash,closure_hash,quarantine_set_id)
);
drop trigger if exists promotion_request_immutable on rosetta_replay.promotion_request;
create trigger promotion_request_immutable before update or delete
on rosetta_replay.promotion_request for each row
execute function rosetta_replay.reject_gate_evidence_mutation();

create or replace function rosetta_replay.request_promotion(
    p_engine_version text,
    p_rule_set_version text,
    p_manifest_hash text,
    p_configuration_contract_hash text,
    p_closure_hash text,
    p_closure_prefix text,
    p_manifest_id uuid,
    p_quarantine_set_id text,
    p_authorization_id uuid)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare v_gate jsonb;v_id uuid;v_stored_hash text;
begin
  if not exists(
    select 1 from rosetta_replay.human_authorization h
    where h.authorization_id=p_authorization_id and h.scope='promotion'
      and h.manifest_id=p_manifest_id and h.engine_version=p_engine_version
      and h.rule_set_version=p_rule_set_version
      and h.configuration_contract_hash=p_configuration_contract_hash
      and h.closure_hash=p_closure_hash
      and h.quarantine_set_id=p_quarantine_set_id) then
    raise exception 'authorization is not bound to this full promotion identity'
      using errcode='P1P01';
  end if;
  select manifest_sha256 into v_stored_hash
  from rosetta_replay.sealed_corpus_manifest where manifest_id=p_manifest_id;
  if v_stored_hash is null then raise exception 'sealed manifest not found' using errcode='P0002'; end if;
  if v_stored_hash is distinct from p_manifest_hash then
    raise exception 'manifest hash mismatch: declared %, sealed %',p_manifest_hash,v_stored_hash
      using errcode='P1P02';
  end if;
  v_gate:=rosetta_replay.promotion_gate_check(p_manifest_id,p_closure_prefix,
    p_engine_version,p_rule_set_version,p_configuration_contract_hash,
    p_closure_hash,p_quarantine_set_id);
  insert into rosetta_replay.promotion_request
    (manifest_id,manifest_hash,engine_version,rule_set_version,
     configuration_contract_hash,closure_hash,quarantine_set_id,
     gate_result,authorization_id)
  values(p_manifest_id,p_manifest_hash,p_engine_version,p_rule_set_version,
     p_configuration_contract_hash,p_closure_hash,p_quarantine_set_id,
     v_gate,p_authorization_id)
  returning promotion_request_id into v_id;
  return v_id;
end;
$fn$;
