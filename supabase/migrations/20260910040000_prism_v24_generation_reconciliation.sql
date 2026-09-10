-- Forward repair for the observed production projector drift and Prism 2.4 replay.
-- Rosetta source/engine ownership remains external; only Lighthouse queues and
-- derived Prism receipts/pattern projections are referenced here.
begin;

create or replace function private.prism_v24_complete_receipt_set_v1(p_run_id uuid)
returns boolean language sql stable
set search_path = pg_catalog, public
as $function$
  select coalesce((
    select run.prism_engine_version = '2.4.0'
       and run.prism_rule_set_id = 'prism-rosetta-structural-binding'
       and run.prism_rule_set_version = '2.4.0'
       and run.completed_at is not null
       and exists (select 1 from public.civic_genome_assembly_run assembly
                    where assembly.assembly_run_id = run.assembly_run_id
                      and assembly.genome_bill_id = run.genome_bill_id
                      and assembly.source_document_id = run.source_document_id
                      and assembly.extraction_run_id = run.extraction_run_id
                      and assembly.run_status = 'completed'
                      and assembly.verification_state = 'complete'
                      and assembly.trait_count = run.expected_trait_count)
       and run.expected_trait_count > 0
       and run.receipt_count = run.expected_trait_count
       and (select count(*) from public.civic_genome_prism_verification_binding binding
             where binding.assembly_run_id = run.assembly_run_id
               and binding.prism_rule_set_id = run.prism_rule_set_id
               and binding.prism_rule_set_version = run.prism_rule_set_version) = run.expected_trait_count
       and (select count(*)
              from public.civic_genome_prism_verification_binding binding
              join public.civic_genome_trait trait on trait.trait_id = binding.trait_id
              join public.lighthouse_prism_verification_receipts receipt
                on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
              join public.lighthouse_prism_verification_requests request
                on request.request_id = binding.request_id
             where binding.assembly_run_id = run.assembly_run_id
               and binding.genome_bill_id = run.genome_bill_id
               and binding.source_document_id = run.source_document_id
               and binding.extraction_run_id = run.extraction_run_id
               and trait.genome_bill_id = run.genome_bill_id
               and trait.source_document_id = run.source_document_id
               and trait.extraction_run_id = run.extraction_run_id
               and trait.source_object_id = binding.source_object_id
               and trait.verification_state = 'confirmed'
               and binding.prism_rule_set_id = run.prism_rule_set_id
               and binding.prism_rule_set_version = run.prism_rule_set_version
               and binding.prism_engine_version = run.prism_engine_version
               and receipt.request_id = binding.request_id
               and receipt.prism_engine_version = binding.prism_engine_version
               and receipt.rule_set_id = binding.prism_rule_set_id
               and receipt.rule_set_version = binding.prism_rule_set_version
               and receipt.rule_set_hash = binding.prism_rule_set_hash
               and receipt.rule_set_hash = '78cf62b9cd452d8de62397c775fa71a2507777ebf81b1ea53915782d573768a6'
               and receipt.input_hash = binding.input_hash
               and receipt.output_hash = binding.output_hash
               and receipt.deterministic_replay_key = binding.deterministic_replay_key
               and request.rule_set_id = receipt.rule_set_id
               and request.rule_set_version = receipt.rule_set_version
               and request.input_hash = receipt.input_hash
               and request.bridge_state = 'completed') = run.expected_trait_count
      from public.civic_genome_prism_verification_run run
     where run.verification_run_id = p_run_id
  ), false);
$function$;

create or replace function private.prism_v24_modal_prior_covered_v1(p_run_id uuid,p_prior_id uuid)
returns boolean language sql stable
set search_path = pg_catalog, public, private
as $function$
  select coalesce((
    select jsonb_array_length(prior.contradiction_refs) > 0 and not exists (
      select 1 from jsonb_array_elements(prior.contradiction_refs) old_ref
      left join public.civic_genome_prism_verification_binding binding
        on binding.assembly_run_id = run.assembly_run_id
       and binding.prism_rule_set_id = run.prism_rule_set_id
       and binding.prism_rule_set_version = run.prism_rule_set_version
       and binding.trait_id::text = old_ref->>'trait_id'
      left join public.lighthouse_prism_verification_receipts receipt
        on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
      where receipt.prism_verification_receipt_id is null
         or nullif(old_ref->'contradiction'->>'step_order','') is null
         or old_ref->'contradiction'->>'step_order' = 'not_observed'
         or old_ref->'contradiction'->>'check' is distinct from split_part(prior.rule_id,':',2)
         or not exists (
           select 1 from (
             select finding from jsonb_array_elements(receipt.contradictions) finding
              where finding->>'check' = split_part(prior.rule_id,':',2)
             union all
             select finding from jsonb_array_elements(receipt.supported_findings) finding
              where finding->>'check' = split_part(prior.rule_id,':',2)
                and finding->>'finding' = 'deterministic_check_passed'
                and nullif(finding->>'evaluated_span','') is not null
                and finding->>'matched_modal' in ('shall','shall not','must','must not','may','may not')
             union all
             select finding from jsonb_array_elements(receipt.unresolved_conditions) finding
              where finding->>'condition' in ('modal_only_in_quoted_text','modal_in_definitional_context','workflow_modal_span_not_available')
             union all
             select finding from jsonb_array_elements(receipt.missing_evidence) finding
              where split_part(prior.rule_id,':',2) = 'workflow_modal_polarity_matches'
                and finding->>'requirement' = 'workflow_declared_modal'
                and nullif(finding->>'evaluated_span','') is not null
           ) proof where proof.finding->>'step_order' = old_ref->'contradiction'->>'step_order'
         )
    )
      from public.civic_genome_prism_verification_run run
      join public.legal_patterns prior on prior.pattern_id = p_prior_id
     where run.verification_run_id = p_run_id
       and prior.source_relation = 'public.civic_genome_prism_verification_run'
       and prior.rule_id in ('prism-rosetta-structural-binding:workflow_modal_present',
                            'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
       and prior.authority_refs @> jsonb_build_array(jsonb_build_object('assembly_run_id',run.assembly_run_id))
  ),false);
$function$;

create or replace function private.project_prism_v24_modal_successors_v1(p_run_id uuid)
returns integer language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_run public.civic_genome_prism_verification_run%rowtype;
  v_prior public.legal_patterns%rowtype;
  v_ref jsonb;
  v_receipt public.lighthouse_prism_verification_receipts%rowtype;
  v_proof jsonb;
  v_proofs jsonb;
  v_state text;
  v_step text;
  v_check text;
  v_complete boolean;
  v_count integer := 0;
begin
  select * into strict v_run from public.civic_genome_prism_verification_run
   where verification_run_id = p_run_id;
  if not private.prism_v24_complete_receipt_set_v1(p_run_id) then
    raise exception 'prism_v24_complete_receipt_set_required';
  end if;
  -- The caller owns the assembly advisory lock and newest-generation fence.
  for v_prior in
    select * from public.legal_patterns pattern
     where pattern.is_current
       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
       and pattern.rule_id in (
         'prism-rosetta-structural-binding:workflow_modal_present',
         'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
       and pattern.rule_version <> '2.4.0'
       and pattern.verification_state = 'contradicted'
       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object(
         'assembly_run_id', v_run.assembly_run_id))
     order by pattern.pattern_id
  loop
    v_check := split_part(v_prior.rule_id, ':', 2);
    v_state := 'supported_one_source';
    v_complete := jsonb_array_length(v_prior.contradiction_refs) > 0;
    v_proofs := '[]'::jsonb;
    for v_ref in select value from jsonb_array_elements(v_prior.contradiction_refs)
    loop
      v_step := v_ref->'contradiction'->>'step_order';
      -- No implicit resolution from a missing check, missing step or blanket
      -- source-level condition. Every old trait/step needs explicit new proof.
      if nullif(v_step, '') is null or v_step = 'not_observed'
         or v_ref->'contradiction'->>'check' is distinct from v_check then
        v_complete := false;
        exit;
      end if;
      select receipt.* into v_receipt
        from public.civic_genome_prism_verification_binding binding
        join public.lighthouse_prism_verification_receipts receipt
          on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
       where binding.assembly_run_id = v_run.assembly_run_id
         and binding.prism_rule_set_id = v_run.prism_rule_set_id
         and binding.prism_rule_set_version = v_run.prism_rule_set_version
         and binding.trait_id::text = v_ref->>'trait_id';
      if not found or exists (
        select 1 from jsonb_array_elements(v_receipt.contradictions) finding
         where finding->>'check' = v_check and finding->>'step_order' = v_step
      ) then
        v_complete := false;
        exit;
      end if;

      select finding into v_proof
        from jsonb_array_elements(v_receipt.unresolved_conditions) finding
       where finding->>'step_order' = v_step
         and finding->>'condition' in (
           'modal_only_in_quoted_text',
           'modal_in_definitional_context',
           'workflow_modal_span_not_available')
       order by finding::text limit 1;
      if found then
        v_state := 'unresolved';
      else
        select finding into v_proof
          from jsonb_array_elements(v_receipt.missing_evidence) finding
         where v_check = 'workflow_modal_polarity_matches'
           and finding->>'step_order' = v_step
           and finding->>'requirement' = 'workflow_declared_modal'
           and nullif(finding->>'evaluated_span', '') is not null
         order by finding::text limit 1;
        if found then
          if v_state <> 'unresolved' then v_state := 'incomplete'; end if;
        else
          select finding into v_proof
            from jsonb_array_elements(v_receipt.supported_findings) finding
           where finding->>'step_order' = v_step
             and finding->>'check' = v_check
             and finding->>'finding' = 'deterministic_check_passed'
             and nullif(finding->>'evaluated_span', '') is not null
             and finding->>'matched_modal' in ('shall','shall not','must','must not','may','may not')
           order by finding::text limit 1;
          if not found then
            v_complete := false;
            exit;
          end if;
        end if;
      end if;
      v_proofs := v_proofs || jsonb_build_array(jsonb_build_object(
        'prior_pattern_id', v_prior.pattern_id,
        'trait_id', v_ref->>'trait_id',
        'step_order', v_step,
        'prism_verification_receipt_id', v_receipt.prism_verification_receipt_id,
        'request_id', v_receipt.request_id,
        'receipt_output_hash', v_receipt.output_hash,
        'deterministic_replay_key', v_receipt.deterministic_replay_key,
        'check_evaluation', v_proof));
    end loop;
    if not v_complete then continue; end if;

    perform public.register_legal_pattern_v1(jsonb_build_object(
      'source_relation', 'public.civic_genome_prism_verification_run',
      'source_record_key', 'verification_run:' || p_run_id::text || ':check:' || v_check || ':reassessment',
      'pattern_type', 'other',
      'title', 'Prism modal check reassessed: ' || replace(v_check, '_', ' '),
      'description', case v_state
        when 'supported_one_source' then 'Prism 2.4 explicitly passed every previously contradicted trait/step for this check against the same source. The earlier contradiction is retained as superseded history.'
        when 'unresolved' then 'Prism 2.4 explicitly left at least one previously contradicted trait/step unresolved. This is an unresolved check, not a verified contradiction.'
        else 'Prism 2.4 explicitly reported missing declared modality for at least one previously contradicted trait/step. This check remains incomplete.'
      end,
      'jurisdiction_scope', v_prior.jurisdiction_scope,
      'authority_refs', jsonb_build_array(jsonb_build_object(
        'verification_run_id', p_run_id,
        'assembly_run_id', v_run.assembly_run_id,
        'source_document_id', v_run.source_document_id,
        'extraction_run_id', v_run.extraction_run_id,
        'prior_pattern_id', v_prior.pattern_id,
        'prior_authority_refs', v_prior.authority_refs,
        'reassessment_evidence', v_proofs)),
      'contradiction_refs', '[]'::jsonb,
      'enforcement_refs', '[]'::jsonb,
      'verification_state', v_state,
      'engine_id', 'prism',
      'engine_version', '2.4.0',
      'rule_id', v_prior.rule_id,
      'rule_version', '2.4.0',
      'first_observed_at', v_run.completed_at,
      'supersedes_id', v_prior.pattern_id
    ));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$function$;

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
  v_supersedes_id uuid;
  v_assembly_run_id uuid;
  v_latest_verification_run_id uuid;
  v_projected integer := 0;
  v_generation text;
begin
  if p_verification_run_id is null then
    raise exception 'verification_run_id is required';
  end if;

  select verification.assembly_run_id
    into v_assembly_run_id
    from public.civic_genome_prism_verification_run verification
   where verification.verification_run_id = p_verification_run_id;

  if v_assembly_run_id is null then
    raise exception 'verification run does not exist: %', p_verification_run_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_assembly_run_id::text, 240));

  select verification.verification_run_id
    into v_latest_verification_run_id
    from public.civic_genome_prism_verification_run verification
   where verification.assembly_run_id = v_assembly_run_id
     and verification.prism_rule_set_id = 'prism-rosetta-structural-binding'
     and verification.prism_rule_set_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'
     and verification.completed_at is not null
     and verification.receipt_count = verification.expected_trait_count
   order by string_to_array(verification.prism_rule_set_version, '.')::integer[] desc,
            verification.completed_at desc, verification.verification_run_id desc
   limit 1;

  if p_verification_run_id is distinct from v_latest_verification_run_id then
    return 0;
  end if;

  select prism_rule_set_version into v_generation
    from public.civic_genome_prism_verification_run
   where verification_run_id = p_verification_run_id;
  if v_generation = '2.4.0'
     and not private.prism_v24_complete_receipt_set_v1(p_verification_run_id) then
    raise exception 'prism_v24_complete_receipt_set_required';
  end if;
  if exists (
    select 1 from public.legal_patterns pattern
     where pattern.is_current
       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object('assembly_run_id', v_assembly_run_id))
     group by pattern.rule_id having count(*) > 1
  ) then
    raise exception 'prism_legal_pattern_current_identity_ambiguous';
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
        'assembly_run_id', assembly_run_id,
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
    select pattern.pattern_id
      into v_supersedes_id
      from public.legal_patterns pattern
     where pattern.is_current
       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
       and pattern.rule_id = v_record->>'rule_id'
       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object(
         'assembly_run_id', v_assembly_run_id
       ))
     order by pattern.created_at desc, pattern.pattern_id desc
     limit 1;

    if v_supersedes_id is not null then
      if v_generation = '2.4.0'
         and v_record->>'rule_id' in ('prism-rosetta-structural-binding:workflow_modal_present',
                                     'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
         and not private.prism_v24_modal_prior_covered_v1(p_verification_run_id,v_supersedes_id) then
        -- New contradictions remain in immutable 2.4 receipts. Hold the aggregate
        -- projection until every earlier trait/step has explicit 2.4 coverage.
        raise warning 'prism_v24_modal_projection_held_uncovered_prior:%:%',p_verification_run_id,v_supersedes_id;
        v_supersedes_id := null;
        continue;
      end if;
      v_record := v_record || jsonb_build_object('supersedes_id', v_supersedes_id);
    end if;

    select public.register_legal_pattern_v1(v_record)
      into v_pattern_id;
    if v_pattern_id is null then
      raise exception 'legal pattern registrar returned null';
    end if;
    v_projected := v_projected + 1;
    v_supersedes_id := null;
  end loop;

  if v_generation = '2.4.0' then
    v_projected := v_projected + private.project_prism_v24_modal_successors_v1(p_verification_run_id);
  end if;
  return v_projected;
end
$function$;

comment on function private.project_prism_legal_patterns_v1(uuid) is
  'Monotonic completed-generation projector. Rechecks exact 2.4 receipt identity and appends explicit modal reassessments; absence never resolves a prior contradiction.';


revoke all on function private.prism_v24_complete_receipt_set_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.prism_v24_modal_prior_covered_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.project_prism_v24_modal_successors_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.project_prism_legal_patterns_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.project_prism_legal_patterns_v1(uuid) to service_role;

create or replace function public.enqueue_civic_genome_prism_verification()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.run_status = 'completed' and new.verification_state = 'complete' and new.trait_count > 0 then
    insert into public.civic_genome_prism_verification_queue (
      assembly_run_id,genome_bill_id,prism_rule_set_id,prism_rule_set_version,
      queue_state,expected_trait_count,receipt_count,eligible_at,next_attempt_at
    ) values (
      new.assembly_run_id,new.genome_bill_id,'prism-rosetta-structural-binding','2.4.0',
      'eligible',new.trait_count,0,coalesce(new.completed_at,new.created_at,now()),now()
    ) on conflict (assembly_run_id,prism_rule_set_id,prism_rule_set_version) do nothing;
  end if;
  return new;
end
$function$;

create or replace function public.enqueue_civic_genome_prism_v24_batch_v1(p_limit integer default 100)
returns integer language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'prism_v24_batch_limit_out_of_range';
  end if;
  with candidate as (
    select assembly.*
      from public.civic_genome_assembly_run assembly
     where assembly.run_status = 'completed'
       and assembly.verification_state = 'complete'
       and assembly.trait_count > 0
       and (
         exists (select 1 from public.civic_genome_bill_version version
                  where version.assembly_run_id = assembly.assembly_run_id)
         or exists (select 1 from public.legal_patterns pattern
                     where pattern.is_current
                       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
                       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object(
                         'assembly_run_id',assembly.assembly_run_id)))
       )
       and not exists (
         select 1 from public.civic_genome_prism_verification_queue queue
          where queue.assembly_run_id = assembly.assembly_run_id
            and queue.prism_rule_set_id = 'prism-rosetta-structural-binding'
            and queue.prism_rule_set_version = '2.4.0')
     order by assembly.completed_at,assembly.assembly_run_id
     limit p_limit
  )
  insert into public.civic_genome_prism_verification_queue (
    assembly_run_id,genome_bill_id,prism_rule_set_id,prism_rule_set_version,
    queue_state,expected_trait_count,receipt_count,eligible_at,next_attempt_at)
  select assembly_run_id,genome_bill_id,'prism-rosetta-structural-binding','2.4.0',
         'eligible',trait_count,0,coalesce(completed_at,created_at,now()),now()
    from candidate
  on conflict (assembly_run_id,prism_rule_set_id,prism_rule_set_version) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;
revoke all on function public.enqueue_civic_genome_prism_verification() from public,anon,authenticated;
revoke all on function public.enqueue_civic_genome_prism_v24_batch_v1(integer) from public,anon,authenticated;
grant execute on function public.enqueue_civic_genome_prism_v24_batch_v1(integer) to service_role;
comment on function public.enqueue_civic_genome_prism_v24_batch_v1(integer) is
  'Bounded idempotent 2.4 replay backfill; existing queues, requests, bindings and receipts are retained.';
commit;
