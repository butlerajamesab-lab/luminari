-- DML recovery gate for the existing source import, not a schema migration.
-- Source completion does not independently verify legal claims or publish data.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
lock table sais_import.import_run, sais_import.source_document,
  sais_import.resource_candidate, sais_import.routing_item,
  sais_import.deadline_field, sais_import.overlap_candidate
  in share row exclusive mode;

do $verify$
declare
  import_id uuid := '77407ee8-b9da-554e-8194-617378e7a7ef';
  summary sais_import.v_import_summary%rowtype;
begin
  select * into strict summary from sais_import.v_import_summary where run_id=import_id;
  if summary.status not in ('prepared','staged','verified','promotion_ready','promoted') then
    raise exception 'SAIS source recovery cannot stage run in state %', summary.status;
  end if;
  if summary.actual_documents <> 26 or summary.actual_resources <> 192
     or summary.actual_routing_items <> 260 or summary.actual_deadline_fields <> 656
     or summary.actual_overlap_groups <> 19 then
    raise exception 'SAIS source recovery counts do not match the locked seed';
  end if;

  if exists (
    select 1 from sais_import.resource_candidate c where run_id=import_id
    and candidate_fingerprint is distinct from sais_import.resource_fingerprint_v1(
      resource_id,title,service_type,organization_type,jurisdiction_raw,official_url,
      official_contact,statutory_authority,verification_status,source_sha256)
  ) or exists (
    select 1 from sais_import.routing_item where run_id=import_id
    and routing_hash is distinct from sais_import.routing_hash_v1(
      document_number,sequence,source_block_index,routing_text,source_sha256)
  ) or exists (
    select 1 from sais_import.deadline_field where run_id=import_id
    and deadline_hash is distinct from sais_import.deadline_hash_v1(
      resource_id,source_label,deadline_text,source_sha256)
  ) then
    raise exception 'SAIS source recovery fingerprint replay failed';
  end if;

  if exists (
    select 1 from sais_import.resource_candidate c
    left join sais_import.source_document d on d.document_id=c.document_id and d.run_id=c.run_id
    where c.run_id=import_id and (d.document_id is null or d.source_sha256<>c.source_sha256)
  ) or exists (
    select 1 from sais_import.routing_item r
    left join sais_import.source_document d on d.document_id=r.document_id and d.run_id=r.run_id
    where r.run_id=import_id and (d.document_id is null or d.source_sha256<>r.source_sha256)
  ) or exists (
    select 1 from sais_import.deadline_field f
    left join sais_import.resource_candidate c on c.candidate_id=f.candidate_id and c.run_id=f.run_id
    where f.run_id=import_id and (c.candidate_id is null or c.source_sha256<>f.source_sha256)
  ) then
    raise exception 'SAIS source recovery source binding failed';
  end if;

  update sais_import.import_run
     set status='staged', staged_at=coalesce(staged_at,now())
   where run_id=import_id and status='prepared';
  if not exists (
    select 1 from sais_import.import_run where run_id=import_id
    and status in ('staged','verified','promotion_ready','promoted')
    and staged_at is not null
  ) then
    raise exception 'SAIS staging transition/readback failed';
  end if;
end
$verify$;
commit;

select * from sais_import.v_import_summary
where run_id='77407ee8-b9da-554e-8194-617378e7a7ef';
