-- ============================================================================
-- Migration 16 -- cutover decision receipt only.  A cutover authorization must
-- bind the exact already-gated promotion request.  No production write exists.
-- ============================================================================

create table if not exists rosetta_replay.cutover_decision (
    decision_id uuid primary key default gen_random_uuid(),
    promotion_request_id uuid not null references rosetta_replay.promotion_request,
    authorization_id uuid not null references rosetta_replay.human_authorization,
    decision text not null check(decision='authorized_recorded'),
    notes text not null check(length(btrim(notes))>=10),
    created_at timestamptz not null default clock_timestamp(),
    unique(promotion_request_id)
);
drop trigger if exists cutover_decision_immutable on rosetta_replay.cutover_decision;
create trigger cutover_decision_immutable before update or delete
on rosetta_replay.cutover_decision for each row
execute function rosetta_replay.reject_gate_evidence_mutation();

create or replace function rosetta_replay.assert_cutover_authorized(
    p_authorization_id uuid,p_promotion_request_id uuid)
returns void language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
begin
  if not exists(
    select 1 from rosetta_replay.promotion_request p
    join rosetta_replay.human_authorization h
      on h.authorization_id=p_authorization_id and h.scope='cutover'
     and h.manifest_id=p.manifest_id and h.engine_version=p.engine_version
     and h.rule_set_version=p.rule_set_version
     and h.configuration_contract_hash=p.configuration_contract_hash
     and h.closure_hash=p.closure_hash
     and h.quarantine_set_id=p.quarantine_set_id
    where p.promotion_request_id=p_promotion_request_id) then
    raise exception 'cutover_not_authorized: authorization is not bound to the gated promotion request'
      using errcode='P1C01';
  end if;
end;
$fn$;

create or replace function rosetta_replay.record_cutover_decision(
    p_authorization_id uuid,p_promotion_request_id uuid,p_notes text)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare v_id uuid;
begin
  perform rosetta_replay.assert_cutover_authorized(p_authorization_id,p_promotion_request_id);
  insert into rosetta_replay.cutover_decision
    (promotion_request_id,authorization_id,decision,notes)
  values(p_promotion_request_id,p_authorization_id,'authorized_recorded',btrim(p_notes))
  returning decision_id into v_id;
  return v_id;
end;
$fn$;
