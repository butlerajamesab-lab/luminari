-- Deterministic Prism -> Signal Architecture Domain 2 pull-through.
--
-- Domain 2 remains legal-pattern owned. This projection reads only persisted,
-- source-bound Prism contradiction receipts and registers grouped legal patterns
-- through the existing public.register_legal_pattern_v1 contract.
--
-- It never reads or writes Atlas live_data_signals, never creates a convergence,
-- and never infers motive, wrongdoing, beneficiary identity, or external influence.

create schema if not exists private;

create or replace function private.project_prism_legal_patterns_v1(
  p_verification_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_record jsonb;
  v_pattern_id uuid;
  v_projected integer := 0;
begin
  if p_verification_run_id is null then
    raise exception 'verification_run_id is required';
  end if;

  for v_record in
    with context as (
      select
        verification.verification_run_id,
        verification.genome_bill_id,
        verification.assembly_run_id,
        verification.source_document_id,
        verification.extraction_run_id,
        verification.prism_engine_version,
        verification.prism_rule_set_id,
        verification.prism_rule_set_version,
        verification.completed_at,
        version.bill_version_id,
        version.source_bill_id,
        version.source_document_key,
        version.document_family,
        version.version_type,
        version.stage_rank,
        version.chamber,
        bill.state_code,
        bill.source_bill_number,
        bill.source_bill_title,
        bill.source_bill_url,
        source.source_url,
        source.provider_hash
      from public.civic_genome_prism_verification_run verification
      join public.civic_genome_bill_version version
        on version.assembly_run_id = verification.assembly_run_id
       and version.genome_bill_id = verification.genome_bill_id
      join public.civic_genome_bill bill
        on bill.genome_bill_id = verification.genome_bill_id
      left join public.docket_bill_source_document source
        on source.source_document_key = version.source_document_key
      where verification.verification_run_id = p_verification_run_id
      limit 1
    ), contradiction_row as (
      select
        ctx.*,
        binding.trait_id,
        binding.source_object_id,
        binding.request_id,
        binding.output_hash as binding_output_hash,
        binding.deterministic_replay_key,
        receipt.output_hash as receipt_output_hash,
        receipt.prism_completion_timestamp,
        contradiction,
        contradiction->>'check' as check_name,
        case
          when contradiction->>'check' = 'override_exception_marker_present'
            then 'override_conflict'
          when contradiction->>'check' in (
            'definition_text_occurs_in_source',
            'defined_term_bound_to_definition'
          ) then 'definition_conflict'
          when contradiction->>'check' in (
            'workflow_modal_polarity_matches',
            'workflow_modal_present',
            'conditional_prohibition_has_workflow_peer',
            'explicit_actor_matches',
            'explicit_actor_preserved',
            'amendment_instruction_non_override_projection_prohibited',
            'amendment_operation_target_locator_prefix'
          ) then 'workflow_gap'
          when contradiction->>'check' = 'accountability_text_occurs_in_source'
            then 'accountability_gap'
          when contradiction->>'check' in (
            'amendment_disposition_matches_source',
            'amendment_disposition_matches_trait'
          ) then 'statutory_contradiction'
          else null
        end as pattern_type
      from context ctx
      join public.civic_genome_prism_verification_binding binding
        on binding.assembly_run_id = ctx.assembly_run_id
       and binding.prism_rule_set_id = ctx.prism_rule_set_id
       and binding.prism_rule_set_version = ctx.prism_rule_set_version
      join public.lighthouse_prism_verification_receipts receipt
        on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
      cross join lateral jsonb_array_elements(
        coalesce(receipt.contradictions, '[]'::jsonb)
      ) contradiction
      where contradiction->>'check' in (
        'override_exception_marker_present',
        'amendment_disposition_matches_source',
        'amendment_disposition_matches_trait',
        'workflow_modal_polarity_matches',
        'workflow_modal_present',
        'conditional_prohibition_has_workflow_peer',
        'accountability_text_occurs_in_source',
        'definition_text_occurs_in_source',
        'defined_term_bound_to_definition',
        'explicit_actor_matches',
        'explicit_actor_preserved',
        'amendment_instruction_non_override_projection_prohibited',
        'amendment_operation_target_locator_prefix'
      )
    ), grouped as (
      select
        verification_run_id,
        genome_bill_id,
        assembly_run_id,
        source_document_id,
        extraction_run_id,
        prism_engine_version,
        prism_rule_set_id,
        prism_rule_set_version,
        completed_at,
        bill_version_id,
        source_bill_id,
        source_document_key,
        document_family,
        version_type,
        stage_rank,
        chamber,
        state_code,
        source_bill_number,
        source_bill_title,
        source_bill_url,
        source_url,
        provider_hash,
        check_name,
        pattern_type,
        count(*)::integer as contradiction_count,
        min(prism_completion_timestamp) as first_observed_at,
        jsonb_agg(
          jsonb_build_object(
            'request_id', request_id,
            'trait_id', trait_id,
            'source_object_id', source_object_id,
            'binding_output_hash', binding_output_hash,
            'receipt_output_hash', receipt_output_hash,
            'deterministic_replay_key', deterministic_replay_key,
            'contradiction', contradiction
          )
          order by request_id, contradiction::text
        ) as contradiction_refs
      from contradiction_row
      where pattern_type is not null
      group by
        verification_run_id, genome_bill_id, assembly_run_id,
        source_document_id, extraction_run_id,
        prism_engine_version, prism_rule_set_id, prism_rule_set_version,
        completed_at, bill_version_id, source_bill_id, source_document_key,
        document_family, version_type, stage_rank, chamber, state_code,
        source_bill_number, source_bill_title, source_bill_url, source_url,
        provider_hash, check_name, pattern_type
    )
    select jsonb_build_object(
      'source_relation', 'public.civic_genome_prism_verification_run',
      'source_record_key',
        'verification_run:' || verification_run_id::text || ':check:' || check_name,
      'pattern_type', pattern_type,
      'title', concat_ws(' ',
        nullif(state_code, ''),
        nullif(source_bill_number, ''),
        '· verified', replace(check_name, '_', ' ')
      ),
      'description',
        'Prism recorded ' || contradiction_count::text ||
        ' deterministic source/rule contradiction(s) for check ' || check_name ||
        ' on the provenance-bound ' || coalesce(version_type, document_family, 'legal') ||
        ' source version. This Domain 2 legal pattern preserves the verified mismatch; ' ||
        'it does not infer motive, wrongdoing, beneficiary identity, or external influence.',
      'jurisdiction_scope', jsonb_build_object(
        'state_code', state_code,
        'source_bill_id', source_bill_id,
        'bill_number', source_bill_number,
        'genome_bill_id', genome_bill_id,
        'bill_version_id', bill_version_id,
        'document_family', document_family,
        'version_type', version_type,
        'stage_rank', stage_rank,
        'chamber', chamber
      ),
      'authority_refs', jsonb_build_array(jsonb_build_object(
        'verification_run_id', verification_run_id,
        'assembly_run_id', assembly_run_id,
        'source_document_id', source_document_id,
        'extraction_run_id', extraction_run_id,
        'source_document_key', source_document_key,
        'source_url', source_url,
        'provider_hash', provider_hash,
        'bill_url', source_bill_url
      )),
      'contradiction_refs', contradiction_refs,
      'enforcement_refs', '[]'::jsonb,
      'verification_state', 'contradicted',
      'engine_id', 'prism',
      'engine_version', prism_engine_version,
      'rule_id', prism_rule_set_id || ':' || check_name,
      'rule_version', prism_rule_set_version,
      'first_observed_at', coalesce(first_observed_at, completed_at)
    )
    from grouped
    order by check_name
  loop
    select public.register_legal_pattern_v1(v_record)
      into v_pattern_id;
    if v_pattern_id is null then
      raise exception 'legal pattern registrar returned null';
    end if;
    v_projected := v_projected + 1;
  end loop;

  return v_projected;
end
$function$;

revoke all on function private.project_prism_legal_patterns_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.project_prism_legal_patterns_v1(uuid)
  to service_role;

create or replace function private.project_prism_legal_patterns_after_run_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  begin
    perform private.project_prism_legal_patterns_v1(new.verification_run_id);
  exception when others then
    raise warning 'prism_domain2_legal_pattern_projection_failed:%:%',
      new.verification_run_id, sqlerrm;
  end;
  return new;
end
$function$;

revoke all on function private.project_prism_legal_patterns_after_run_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists prism_domain2_legal_pattern_pullthrough_v1
  on public.civic_genome_prism_verification_run;
create trigger prism_domain2_legal_pattern_pullthrough_v1
after insert on public.civic_genome_prism_verification_run
for each row execute function private.project_prism_legal_patterns_after_run_v1();

comment on function private.project_prism_legal_patterns_v1(uuid) is
  'Projects an explicit allowlist of persisted Prism contradictions into canonical Signal Architecture Domain 2 legal_patterns. Never reads Atlas/live_data_signals or infers influence.';
