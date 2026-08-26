do $verify$
declare
  v_hidden integer;
  v_identity_mismatches integer;
  v_selector_count integer;
  v_selector_invalid integer;
  v_parser_base_md5 text;
  v_parser_candidate_md5 text;
begin
  if to_regprocedure(
    'public.rosetta_unbound_docket_source_documents_v1(integer)'
  ) is null
     or to_regprocedure(
       'public.rosetta_classify_terminal_rejections_v1(integer)'
     ) is null then
    raise exception 'VERIFY_FAIL terminal repair functions missing';
  end if;

  select count(*)
    into v_hidden
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
     );

  if v_hidden <> 0 then
    raise exception 'VERIFY_FAIL hidden terminal repairs remain: %', v_hidden;
  end if;

  select count(*)
    into v_identity_mismatches
    from public.rosetta_structural_repair_queue repair
    join public.extraction_run run
      on run.id = repair.extraction_run_id
    join public.extraction_manifest manifest
      on manifest.extraction_run_id = run.id
   where repair.defect_type = 'terminal_extraction_rejection'
     and (
       repair.object_type <> 'extraction_run'
       or repair.object_id <> run.id::text
       or repair.source_document_id <> run.source_document_id
       or repair.defect_detail ->> 'contract'
            <> 'rosetta-terminal-rejection-repair-v1'
       or repair.defect_detail #>> '{extraction_run,id}' <> run.id::text
       or repair.defect_detail #>> '{extraction_run,source_document_id}'
            <> run.source_document_id::text
       or repair.defect_detail #>> '{parser_identity,engine_version}'
            <> run.engine_version
       or repair.defect_detail #>> '{parser_identity,rule_set_version}'
            <> run.rule_set_version
       or repair.defect_detail #>> '{parser_identity,rule_manifest_hash}'
            is distinct from run.rule_manifest_hash
       or repair.defect_detail #>> '{parser_identity,configuration_hash}'
            is distinct from run.configuration_hash
       or repair.defect_detail #>> '{content_identity,source_identity_hash}'
            is distinct from run.source_identity_hash
       or repair.defect_detail #>> '{content_identity,source_content_hash}'
            is distinct from run.source_content_hash
       or repair.defect_detail #>> '{content_identity,output_content_hash}'
            is distinct from run.output_content_hash
       or repair.defect_detail #>> '{manifest,id}' <> manifest.id
       or repair.defect_detail -> 'validation_receipts'
            is distinct from manifest.validation_results
       or repair.defect_detail -> 'failed_invariants' is null
     );

  if v_identity_mismatches <> 0 then
    raise exception 'VERIFY_FAIL terminal repair identity mismatches: %',
      v_identity_mismatches;
  end if;

  select count(*),
         count(*) filter (
           where split_part(document_identifier, ':', 1) <> 'docket'
              or split_part(document_identifier, ':', 2) !~ '^[0-9]+$'
              or split_part(document_identifier, ':', 3) not in ('text', 'amendment')
              or split_part(document_identifier, ':', 4)
                   <> split_part(document_identifier, ':', 2)
              or split_part(document_identifier, ':', 5) !~ '^[0-9]+$'
         )
    into v_selector_count, v_selector_invalid
    from public.rosetta_unbound_docket_source_documents_v1(100);

  if v_selector_count > 100 or v_selector_invalid <> 0 then
    raise exception 'VERIFY_FAIL oldest selector count/identity invalid: %/%',
      v_selector_count,
      v_selector_invalid;
  end if;

  if has_function_privilege(
       'anon',
       'public.rosetta_unbound_docket_source_documents_v1(integer)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.rosetta_unbound_docket_source_documents_v1(integer)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.rosetta_unbound_docket_source_documents_v1(integer)',
       'execute'
  ) then
    raise exception 'VERIFY_FAIL oldest selector grant posture invalid';
  end if;

  if has_function_privilege(
       'anon',
       'public.rosetta_classify_terminal_rejections_v1(integer)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.rosetta_classify_terminal_rejections_v1(integer)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.rosetta_classify_terminal_rejections_v1(integer)',
       'execute'
     ) then
    raise exception 'VERIFY_FAIL terminal classifier grant posture invalid';
  end if;

  select md5(pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v2511_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  )) into v_parser_base_md5;
  select md5(pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  )) into v_parser_candidate_md5;

  if v_parser_base_md5 <> '26c098083b384af6e349e9195831a4da'
     or v_parser_candidate_md5 <> '4e69d5df22284c96300a91ecc2e5c257' then
    raise exception 'VERIFY_FAIL 2.5.11 parser definitions changed: %/%',
      v_parser_base_md5,
      v_parser_candidate_md5;
  end if;
end;
$verify$;

select 'PASS terminal rejection repair and oldest Docket backlog contract' as result;
