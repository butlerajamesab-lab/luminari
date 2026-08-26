begin;
set local lock_timeout = '5s';

-- This migration deliberately does not replace either 2.5.11 parser function.
-- Terminal receipts are projected into the operator ledger after the manifest is
-- finalized, leaving the parser closure and every extraction identity unchanged.

create or replace function public.rosetta_unbound_docket_source_documents_v1(
  p_limit integer default 100
)
returns table (
  source_document_id integer,
  document_identifier text,
  registered_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select document.id,
         document.document_identifier,
         document.created_at
    from public.source_document document
   where document.document_identifier like 'docket:%'
     and cardinality(string_to_array(document.document_identifier, ':')) = 5
     and split_part(document.document_identifier, ':', 2) ~ '^[0-9]+$'
     and split_part(document.document_identifier, ':', 3) in ('text', 'amendment')
     and split_part(document.document_identifier, ':', 4)
           = split_part(document.document_identifier, ':', 2)
     and split_part(document.document_identifier, ':', 5) ~ '^[0-9]+$'
     and not exists (
       select 1
         from public.source_document_content content
        where content.source_document_id = document.id
     )
   order by document.created_at asc nulls first,
            document.id asc
   limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

revoke all on function public.rosetta_unbound_docket_source_documents_v1(integer)
  from public, anon, authenticated;
grant execute on function public.rosetta_unbound_docket_source_documents_v1(integer)
  to service_role;

create or replace function public.rosetta_register_terminal_rejection_repair_v1(
  p_extraction_run_id integer,
  p_manifest_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_run public.extraction_run%rowtype;
  v_manifest public.extraction_manifest%rowtype;
  v_existing_repair_id uuid;
  v_repair_id uuid;
  v_failed_invariants jsonb;
begin
  select run.*
    into v_run
    from public.extraction_run run
   where run.id = p_extraction_run_id;

  if not found then
    raise exception 'rosetta_terminal_rejection_run_not_found:%', p_extraction_run_id;
  end if;

  select manifest.*
    into v_manifest
    from public.extraction_manifest manifest
   where manifest.id = p_manifest_id
     and manifest.extraction_run_id = p_extraction_run_id;

  if not found then
    raise exception 'rosetta_terminal_rejection_manifest_not_found:%:%',
      p_extraction_run_id,
      p_manifest_id;
  end if;

  if v_run.engine_version is distinct from 'rosetta-v3-deterministic-sql-2.5.11'
     or v_run.rule_set_version is distinct from 'rosetta-five-layer-structural-correctness-2.5.11'
     or v_run.run_status is distinct from 'failed'
     or v_run.admissibility_state is distinct from 'rejected'
     or v_manifest.status is distinct from 'failed'
     or v_manifest.admissibility_state is distinct from 'rejected'
     or coalesce(v_run.failure_code, '') not in (
       'rosetta_v2511_post_base_failure',
       'rosetta_v2511_final_validation_failed'
     ) then
    return null;
  end if;

  -- A specific structural repair already makes the terminal run operator-visible.
  -- The generic row exists only to close terminal branches that otherwise vanish.
  select repair.repair_id
    into v_existing_repair_id
    from public.rosetta_structural_repair_queue repair
   where repair.extraction_run_id = p_extraction_run_id
   order by repair.created_at, repair.repair_id
   limit 1;

  if found then
    return v_existing_repair_id;
  end if;

  select coalesce(jsonb_object_agg(receipt.key, receipt.value), '{}'::jsonb)
    into v_failed_invariants
    from jsonb_each(coalesce(v_manifest.validation_results, '{}'::jsonb)) receipt
   where receipt.key = v_run.failure_code
      or receipt.value = 'false'::jsonb
      or (
        jsonb_typeof(receipt.value) = 'object'
        and receipt.value ->> 'status' = 'fail'
      );

  insert into public.rosetta_structural_repair_queue (
    extraction_run_id,
    source_document_id,
    object_type,
    object_id,
    defect_type,
    defect_detail,
    repair_state
  ) values (
    v_run.id,
    v_run.source_document_id,
    'extraction_run',
    v_run.id::text,
    'terminal_extraction_rejection',
    jsonb_build_object(
      'contract', 'rosetta-terminal-rejection-repair-v1',
      'classification', 'operator_repair_required',
      'terminal_branch', case v_run.failure_code
        when 'rosetta_v2511_post_base_failure' then 'post_base'
        else 'final_validation'
      end,
      'failure_code', v_run.failure_code,
      'extraction_run', jsonb_build_object(
        'id', v_run.id,
        'source_document_id', v_run.source_document_id,
        'source_content_id', v_run.source_content_id,
        'run_status', v_run.run_status,
        'admissibility_state', v_run.admissibility_state,
        'created_at', v_run.created_at,
        'completed_at', v_run.completed_at
      ),
      'parser_identity', jsonb_build_object(
        'engine_version', v_run.engine_version,
        'rule_set_version', v_run.rule_set_version,
        'rule_manifest_hash', v_run.rule_manifest_hash,
        'configuration_hash', v_run.configuration_hash
      ),
      'content_identity', jsonb_build_object(
        'source_identity_hash', v_run.source_identity_hash,
        'source_content_hash', v_run.source_content_hash,
        'output_content_hash', v_run.output_content_hash
      ),
      'manifest', jsonb_build_object(
        'id', v_manifest.id,
        'status', v_manifest.status,
        'admissibility_state', v_manifest.admissibility_state,
        'source_content_id', v_manifest.source_content_id,
        'source_identity_hash', v_manifest.source_identity_hash,
        'rule_manifest_hash', v_manifest.rule_manifest_hash,
        'configuration_hash', v_manifest.configuration_hash,
        'output_hash', v_manifest.output_hash,
        'executed_at', v_manifest.executed_at
      ),
      'failed_invariants', v_failed_invariants,
      'validation_receipts', v_manifest.validation_results
    ),
    'open'
  )
  on conflict (object_type, object_id, defect_type)
  do update
        set defect_detail = excluded.defect_detail
  returning repair_id into v_repair_id;

  return v_repair_id;
end;
$function$;

revoke all on function public.rosetta_register_terminal_rejection_repair_v1(integer, text)
  from public, anon, authenticated, service_role;

create or replace function public.rosetta_manifest_terminal_rejection_repair_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'failed'
     and new.admissibility_state = 'rejected' then
    perform public.rosetta_register_terminal_rejection_repair_v1(
      new.extraction_run_id,
      new.id
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.rosetta_manifest_terminal_rejection_repair_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists extraction_manifest_terminal_rejection_repair_v1
  on public.extraction_manifest;
create trigger extraction_manifest_terminal_rejection_repair_v1
after insert or update of status, admissibility_state, validation_results
on public.extraction_manifest
for each row
execute function public.rosetta_manifest_terminal_rejection_repair_v1();

-- Historical receipts are drained through this bounded function after the DDL
-- commits. Keeping the backfill out of the schema transaction prevents a large
-- evidence copy from holding DDL locks or exceeding a managed gateway timeout.
create or replace function public.rosetta_backfill_terminal_rejection_repairs_v1(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_inserted integer;
begin
  with candidate as materialized (
    select run.id
      from public.extraction_run run
      join public.extraction_manifest manifest
        on manifest.extraction_run_id = run.id
     where run.engine_version = 'rosetta-v3-deterministic-sql-2.5.11'
       and run.rule_set_version = 'rosetta-five-layer-structural-correctness-2.5.11'
       and run.run_status = 'failed'
       and run.admissibility_state = 'rejected'
       and manifest.status = 'failed'
       and manifest.admissibility_state = 'rejected'
       and run.failure_code in (
         'rosetta_v2511_post_base_failure',
         'rosetta_v2511_final_validation_failed'
       )
       and not exists (
         select 1
           from public.rosetta_structural_repair_queue repair
          where repair.extraction_run_id = run.id
       )
     order by run.id
     limit greatest(1, least(coalesce(p_limit, 100), 250))
  )
  insert into public.rosetta_structural_repair_queue (
    extraction_run_id,
    source_document_id,
    object_type,
    object_id,
    defect_type,
    defect_detail,
    repair_state
  )
  select run.id,
         run.source_document_id,
         'extraction_run',
         run.id::text,
         'terminal_extraction_rejection',
         jsonb_build_object(
         'contract', 'rosetta-terminal-rejection-repair-v1',
         'classification', 'operator_repair_required',
         'terminal_branch', case run.failure_code
           when 'rosetta_v2511_post_base_failure' then 'post_base'
           else 'final_validation'
         end,
         'failure_code', run.failure_code,
         'extraction_run', jsonb_build_object(
           'id', run.id,
           'source_document_id', run.source_document_id,
           'source_content_id', run.source_content_id,
           'run_status', run.run_status,
           'admissibility_state', run.admissibility_state,
           'created_at', run.created_at,
           'completed_at', run.completed_at
         ),
         'parser_identity', jsonb_build_object(
           'engine_version', run.engine_version,
           'rule_set_version', run.rule_set_version,
           'rule_manifest_hash', run.rule_manifest_hash,
           'configuration_hash', run.configuration_hash
         ),
         'content_identity', jsonb_build_object(
           'source_identity_hash', run.source_identity_hash,
           'source_content_hash', run.source_content_hash,
           'output_content_hash', run.output_content_hash
         ),
         'manifest', jsonb_build_object(
           'id', manifest.id,
           'status', manifest.status,
           'admissibility_state', manifest.admissibility_state,
           'source_content_id', manifest.source_content_id,
           'source_identity_hash', manifest.source_identity_hash,
           'rule_manifest_hash', manifest.rule_manifest_hash,
           'configuration_hash', manifest.configuration_hash,
           'output_hash', manifest.output_hash,
           'executed_at', manifest.executed_at
         ),
         'failed_invariants', failed.invariants,
           'validation_receipts', manifest.validation_results
         ),
         'open'
    from candidate
    join public.extraction_run run
      on run.id = candidate.id
    join public.extraction_manifest manifest
      on manifest.extraction_run_id = run.id
    cross join lateral (
      select coalesce(jsonb_object_agg(receipt.key, receipt.value), '{}'::jsonb)
               as invariants
        from jsonb_each(coalesce(manifest.validation_results, '{}'::jsonb)) receipt
       where receipt.key = run.failure_code
          or receipt.value = 'false'::jsonb
          or (
            jsonb_typeof(receipt.value) = 'object'
            and receipt.value ->> 'status' = 'fail'
          )
    ) failed
  on conflict (object_type, object_id, defect_type) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function public.rosetta_backfill_terminal_rejection_repairs_v1(integer)
  from public, anon, authenticated, service_role;

commit;
