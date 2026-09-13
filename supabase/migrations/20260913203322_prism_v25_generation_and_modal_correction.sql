-- New Prism generation; every correction is derived from an actual complete 2.5 receipt set.
-- Historical 2.4 functions/receipts remain available. No queue or projection is
-- created by installation; the caller must select and execute a separate replay.
begin;
CREATE OR REPLACE FUNCTION private.prism_v25_complete_receipt_set_v1(p_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce((
    select run.prism_engine_version = '2.5.0'
       and run.prism_rule_set_id = 'prism-rosetta-structural-binding'
       and run.prism_rule_set_version = '2.5.0'
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
               and receipt.rule_set_hash = '26e4ef9f6c0d389154d9a2259c99b6e7eb83a51c096e738a9470fb20ff04ec8b'
               and receipt.input_hash = binding.input_hash
               and receipt.output_hash = binding.output_hash
               and receipt.deterministic_replay_key = binding.deterministic_replay_key
               and request.rule_set_id = receipt.rule_set_id
               and request.rule_set_version = receipt.rule_set_version
               and request.input_hash = receipt.input_hash
               and request.bridge_state = 'completed'
               and binding.verification_status = receipt.verification_status
               and request.source_content_hash = (
                 select assembly.rosetta_source_content_hash
                   from public.civic_genome_assembly_run assembly
                  where assembly.assembly_run_id = run.assembly_run_id)
               and request.evidence_document_id = 'rosetta-source-document:' || run.source_document_id::text) = run.expected_trait_count
      from public.civic_genome_prism_verification_run run
     where run.verification_run_id = p_run_id
  ), false);
$function$;

create or replace function private.prism_v25_modal_prior_covered_v1(p_run_id uuid, p_prior_id uuid)
returns boolean language sql stable
set search_path = pg_catalog, public, private
as $function$
  with prior as (
    select pattern.*, run.assembly_run_id, run.prism_rule_set_id, run.prism_rule_set_version
      from public.legal_patterns pattern
      join public.civic_genome_prism_verification_run run on run.verification_run_id = p_run_id
     where pattern.pattern_id = p_prior_id
       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
       and pattern.rule_id in ('prism-rosetta-structural-binding:workflow_modal_present',
                               'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object('assembly_run_id',run.assembly_run_id))
  ), prior_refs as (
    select prior.*, old_ref->>'trait_id' as old_trait_id,
           old_ref->'contradiction'->>'step_order' as old_step,
           old_ref->'contradiction'->>'check' as old_check,
           nullif(old_ref->'contradiction'->>'evaluated_span','') as old_span
      from prior cross join lateral jsonb_array_elements(prior.contradiction_refs) old_ref
    union all
    select prior.*, old_ref->>'trait_id', old_ref->>'step_order',
           old_ref->'check_evaluation'->>'check',
           nullif(old_ref->'check_evaluation'->>'evaluated_span','')
      from prior
      cross join lateral jsonb_array_elements(prior.authority_refs) authority
      cross join lateral jsonb_array_elements(coalesce(authority->'reassessment_evidence','[]'::jsonb)) old_ref
  )
  select private.prism_v25_complete_receipt_set_v1(p_run_id)
     and exists (select 1 from prior_refs)
     and not exists (
       select 1 from prior_refs prior
       left join public.civic_genome_prism_verification_binding binding
         on binding.assembly_run_id = prior.assembly_run_id
        and binding.prism_rule_set_id = prior.prism_rule_set_id
        and binding.prism_rule_set_version = prior.prism_rule_set_version
        and binding.trait_id::text = prior.old_trait_id
       left join public.lighthouse_prism_verification_receipts receipt
         on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
       where receipt.prism_verification_receipt_id is null
          or nullif(prior.old_trait_id,'') is null
          or nullif(prior.old_step,'') is null
          or prior.old_step = 'not_observed'
          or prior.old_check is distinct from split_part(prior.rule_id,':',2)
          or not exists (
            select 1 from (
              select finding from jsonb_array_elements(receipt.contradictions) finding
               where finding->>'check' = prior.old_check
              union all
              select finding from jsonb_array_elements(receipt.supported_findings) finding
               where finding->>'check' = prior.old_check
                 and finding->>'finding' = 'deterministic_check_passed'
                 and finding->>'matched_modal' in ('shall','shall not','must','must not','may','may not')
              union all
              select finding from jsonb_array_elements(receipt.unresolved_conditions) finding
               where finding->>'condition' in ('modal_only_in_quoted_text','modal_in_definitional_context',
                 'workflow_modal_span_not_available','may_name_or_modal_ambiguous')
              union all
              select finding from jsonb_array_elements(receipt.missing_evidence) finding
               where prior.old_check = 'workflow_modal_polarity_matches'
                 and finding->>'requirement' = 'workflow_declared_modal'
            ) proof
            where proof.finding->>'step_order' = prior.old_step
              and nullif(proof.finding->>'evaluated_span','') is not null
              and (prior.old_span is null or proof.finding->>'evaluated_span' = prior.old_span)
          )
     );
$function$;

create or replace function private.prism_v25_calendar_correction_evidence_v1(p_run_id uuid, p_prior_id uuid)
returns jsonb language plpgsql stable
set search_path = pg_catalog, public, private
as $function$
declare
  v_prior public.legal_patterns%rowtype;
  v_run public.civic_genome_prism_verification_run%rowtype;
  v_old_receipt public.lighthouse_prism_verification_receipts%rowtype;
  v_new_receipt public.lighthouse_prism_verification_receipts%rowtype;
  v_expected_payload_hash text;
  v_expected_parent_hash text;
  v_old_ref jsonb;
  v_new_proof jsonb;
begin
  -- These are the two observed immutable 2.4 successors. No runtime text
  -- heuristic can add other pattern IDs to this correction cohort.
  if p_prior_id = '91955a17-ecef-483b-b2b6-0fffee738cf6'::uuid then
    v_expected_payload_hash := '889fa2ab1c6ec038786d7666bde774e102a833e747b906cbc7adb9c8fbd97679';
    v_expected_parent_hash := '1f99a64d4731f5e966eba100dba53b3a03afc4b240ee2742922a24c1d69a4f45';
  elsif p_prior_id = 'e6f0c3b6-8f1c-41fe-9c82-60afd046f122'::uuid then
    v_expected_payload_hash := 'f99c935f4526a343ea4b5149517faada49fe90eb9afd9a95936f6a2349e926ae';
    v_expected_parent_hash := 'dbbb6366d360825e97fc5f16a355efeac8af07be3ae621478db32901d570286e';
  else
    raise exception 'prism_v25_calendar_correction_target_unknown';
  end if;

  select * into strict v_prior from public.legal_patterns where pattern_id = p_prior_id;
  if encode(sha256(convert_to((to_jsonb(v_prior)-'is_current')::text,'UTF8')),'hex')
       is distinct from v_expected_payload_hash
     or not (v_prior.is_current or exists (
       select 1 from public.legal_patterns successor
        where successor.is_current
          and successor.supersedes_id = p_prior_id
          and successor.rule_version = '2.5.0'
          and successor.source_record_key = 'verification_run:' || p_run_id::text || ':check:workflow_modal_present'
     ))
     or not exists (
       select 1 from public.legal_patterns parent
        where parent.pattern_id = v_prior.supersedes_id
          and encode(sha256(convert_to(to_jsonb(parent)::text,'UTF8')),'hex') = v_expected_parent_hash
     ) then
    raise exception 'prism_v25_calendar_correction_prior_identity_mismatch';
  end if;
  select * into strict v_run from public.civic_genome_prism_verification_run
   where verification_run_id = p_run_id;
  if not private.prism_v25_complete_receipt_set_v1(p_run_id)
     or not private.prism_v25_modal_prior_covered_v1(p_run_id,p_prior_id)
     or v_prior.authority_refs->0->>'assembly_run_id' is distinct from v_run.assembly_run_id::text
     or v_prior.authority_refs->0->>'source_document_id' is distinct from v_run.source_document_id::text
     or v_prior.authority_refs->0->>'extraction_run_id' is distinct from v_run.extraction_run_id then
    raise exception 'prism_v25_calendar_correction_complete_same_source_proof_required';
  end if;
  v_old_ref := v_prior.authority_refs->0->'reassessment_evidence'->0;
  select receipt.* into strict v_old_receipt
    from public.lighthouse_prism_verification_receipts receipt
    join public.civic_genome_prism_verification_binding binding
      on binding.prism_verification_receipt_id = receipt.prism_verification_receipt_id
     and binding.request_id = receipt.request_id
     and binding.assembly_run_id = v_run.assembly_run_id
     and binding.trait_id::text = v_old_ref->>'trait_id'
     and binding.prism_rule_set_version = '2.4.0'
     and binding.output_hash = receipt.output_hash
     and binding.input_hash = receipt.input_hash
     and binding.deterministic_replay_key = receipt.deterministic_replay_key
   where receipt.prism_verification_receipt_id::text = v_old_ref->>'prism_verification_receipt_id'
     and receipt.request_id = v_old_ref->>'request_id'
     and receipt.output_hash = v_old_ref->>'receipt_output_hash'
     and receipt.deterministic_replay_key = v_old_ref->>'deterministic_replay_key'
     and receipt.rule_set_id = 'prism-rosetta-structural-binding'
     and receipt.rule_set_version = '2.4.0'
     and receipt.prism_engine_version = '2.4.0'
     and receipt.rule_set_hash = '78cf62b9cd452d8de62397c775fa71a2507777ebf81b1ea53915782d573768a6'
     and receipt.supported_findings @> jsonb_build_array(v_old_ref->'check_evaluation');
  if not private.prism_v24_complete_receipt_set_v1(
       (v_prior.authority_refs->0->>'verification_run_id')::uuid) then
    raise exception 'prism_v25_calendar_correction_historical_receipt_identity_mismatch';
  end if;
  select receipt.* into strict v_new_receipt
    from public.civic_genome_prism_verification_binding binding
    join public.lighthouse_prism_verification_receipts receipt
      on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
   where binding.assembly_run_id = v_run.assembly_run_id
     and binding.trait_id::text = v_old_ref->>'trait_id'
     and binding.prism_rule_set_id = v_run.prism_rule_set_id
     and binding.prism_rule_set_version = '2.5.0';

  select finding into v_new_proof
    from jsonb_array_elements(v_new_receipt.contradictions) finding
   where finding->>'check' = 'workflow_modal_present'
     and finding->>'step_order' = v_old_ref->>'step_order'
     and finding->>'observed' = 'not_observed'
     and finding->>'evaluated_span' = v_old_ref->'check_evaluation'->>'evaluated_span'
     and finding->>'source_offset_start' = v_old_ref->'check_evaluation'->>'source_offset_start'
     and finding->>'source_offset_end' = v_old_ref->'check_evaluation'->>'source_offset_end'
   order by finding::text limit 1;
  if not found then
    raise exception 'prism_v25_calendar_correction_exact_negative_modal_proof_required';
  end if;
  return jsonb_build_object(
    'correction_code','calendar_may_is_not_an_operative_modal',
    'prior_pattern_id',v_prior.pattern_id,
    'prior_pattern_hash',v_prior.pattern_hash,
    'prior_immutable_payload_sha256',v_expected_payload_hash,
    'prior_authority_refs',v_prior.authority_refs,
    'correction_evidence',jsonb_build_array(jsonb_build_object(
      'trait_id',v_old_ref->>'trait_id','step_order',v_old_ref->>'step_order',
      'prior_receipt_id',v_old_receipt.prism_verification_receipt_id,
      'prior_output_hash',v_old_receipt.output_hash,
      'prism_verification_receipt_id',v_new_receipt.prism_verification_receipt_id,
      'request_id',v_new_receipt.request_id,
      'receipt_output_hash',v_new_receipt.output_hash,
      'deterministic_replay_key',v_new_receipt.deterministic_replay_key,
      'check_evaluation',v_new_proof)));
end
$function$;

CREATE OR REPLACE FUNCTION private.project_prism_v25_modal_successors_v1(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
  if not private.prism_v25_complete_receipt_set_v1(p_run_id) then
    raise exception 'prism_v25_complete_receipt_set_required';
  end if;
  -- The caller owns the assembly advisory lock and newest-generation fence.
  for v_prior in
    select * from public.legal_patterns pattern
     where pattern.is_current
       and pattern.source_relation = 'public.civic_genome_prism_verification_run'
       and pattern.rule_id in (
         'prism-rosetta-structural-binding:workflow_modal_present',
         'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
       and pattern.rule_version <> '2.5.0'
       and pattern.verification_state = 'contradicted'
       and pattern.authority_refs @> jsonb_build_array(jsonb_build_object(
         'assembly_run_id', v_run.assembly_run_id))
     order by pattern.pattern_id
  loop
    if not private.prism_v25_modal_prior_covered_v1(p_run_id,v_prior.pattern_id) then
      continue;
    end if;
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
           'workflow_modal_span_not_available',
           'may_name_or_modal_ambiguous')
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
        when 'supported_one_source' then 'Prism 2.5 explicitly passed every previously contradicted trait/step for this check against the same source. The earlier contradiction is retained as superseded history.'
        when 'unresolved' then 'Prism 2.5 explicitly left at least one previously contradicted trait/step unresolved. This is an unresolved check, not a verified contradiction.'
        else 'Prism 2.5 explicitly reported missing declared modality for at least one previously contradicted trait/step. This check remains incomplete.'
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
      'engine_version', '2.5.0',
      'rule_id', v_prior.rule_id,
      'rule_version', '2.5.0',
      'first_observed_at', v_run.completed_at,
      'supersedes_id', v_prior.pattern_id
    ));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION private.project_prism_legal_patterns_v1(p_verification_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_record jsonb;
  v_pattern_id uuid;
  v_supersedes_id uuid;
  v_assembly_run_id uuid;
  v_latest_verification_run_id uuid;
  v_projected integer := 0;
  v_generation text;
  v_correction jsonb;
  v_existing_pattern public.legal_patterns%rowtype;
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
  if v_generation = '2.5.0'
     and not private.prism_v25_complete_receipt_set_v1(p_verification_run_id) then
    raise exception 'prism_v25_complete_receipt_set_required';
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
      select * into strict v_existing_pattern from public.legal_patterns where pattern_id = v_supersedes_id;
      if v_generation = '2.5.0'
         and v_existing_pattern.source_record_key = v_record->>'source_record_key'
         and v_existing_pattern.supersedes_id in (
           '91955a17-ecef-483b-b2b6-0fffee738cf6'::uuid,
           'e6f0c3b6-8f1c-41fe-9c82-60afd046f122'::uuid) then
        -- Reconstruct the same correction evidence on an idempotent replay.
        v_supersedes_id := v_existing_pattern.supersedes_id;
      end if;
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
      if v_generation = '2.5.0'
         and v_record->>'rule_id' in ('prism-rosetta-structural-binding:workflow_modal_present',
                                     'prism-rosetta-structural-binding:workflow_modal_polarity_matches')
         and not private.prism_v25_modal_prior_covered_v1(p_verification_run_id,v_supersedes_id) then
        raise warning 'prism_v25_modal_projection_held_uncovered_prior:%:%',p_verification_run_id,v_supersedes_id;
        v_supersedes_id := null;
        continue;
      end if;
      if v_generation = '2.5.0' and v_supersedes_id in (
           '91955a17-ecef-483b-b2b6-0fffee738cf6'::uuid,
           'e6f0c3b6-8f1c-41fe-9c82-60afd046f122'::uuid) then
        v_correction := private.prism_v25_calendar_correction_evidence_v1(
          p_verification_run_id,v_supersedes_id);
        v_record := jsonb_set(v_record,'{authority_refs,0}',
          (v_record->'authority_refs'->0) || v_correction);
      end if;
      v_record := v_record || jsonb_build_object('supersedes_id', v_supersedes_id);
      if v_generation = '2.5.0'
         and v_existing_pattern.source_record_key = v_record->>'source_record_key' then
        if (to_jsonb(v_existing_pattern) - array['pattern_id','input_hash','pattern_hash','created_at','is_current','supersedes_id'])
             is distinct from (v_record - 'supersedes_id') then
          raise exception 'prism_v25_existing_projection_identity_mismatch';
        end if;
        v_supersedes_id := null;
        continue;
      end if;
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
  if v_generation = '2.5.0' then
    v_projected := v_projected + private.project_prism_v25_modal_successors_v1(p_verification_run_id);
  end if;
  return v_projected;
end
$function$;

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
      new.assembly_run_id,new.genome_bill_id,'prism-rosetta-structural-binding','2.5.0',
      'eligible',new.trait_count,0,coalesce(new.completed_at,new.created_at,now()),now()
    ) on conflict (assembly_run_id,prism_rule_set_id,prism_rule_set_version) do nothing;
  end if;
  return new;
end
$function$;

create or replace function public.enqueue_civic_genome_prism_v25_batch_v1(p_limit integer default 100)
returns integer language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'prism_v25_batch_limit_out_of_range';
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
            and queue.prism_rule_set_version = '2.5.0')
     order by assembly.completed_at,assembly.assembly_run_id
     limit p_limit
  )
  insert into public.civic_genome_prism_verification_queue (
    assembly_run_id,genome_bill_id,prism_rule_set_id,prism_rule_set_version,
    queue_state,expected_trait_count,receipt_count,eligible_at,next_attempt_at)
  select assembly_run_id,genome_bill_id,'prism-rosetta-structural-binding','2.5.0',
         'eligible',trait_count,0,coalesce(completed_at,created_at,now()),now()
    from candidate
  on conflict (assembly_run_id,prism_rule_set_id,prism_rule_set_version) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_civic_genome_bill_version_prism_v22()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_assembly public.civic_genome_assembly_run%rowtype;
begin
  if new.assembly_run_id is null then
    return new;
  end if;

  select assembly.*
  into v_assembly
  from public.civic_genome_assembly_run assembly
  where assembly.assembly_run_id = new.assembly_run_id;

  if not found then
    raise exception 'civic_genome_bill_version references missing assembly_run_id %',
      new.assembly_run_id;
  end if;

  if v_assembly.run_status = 'completed'
     and v_assembly.verification_state = 'complete'
     and v_assembly.trait_count > 0 then
    insert into public.civic_genome_prism_verification_queue (
      assembly_run_id,
      genome_bill_id,
      prism_rule_set_id,
      prism_rule_set_version,
      queue_state,
      expected_trait_count,
      receipt_count,
      eligible_at,
      next_attempt_at
    ) values (
      v_assembly.assembly_run_id,
      v_assembly.genome_bill_id,
      'prism-rosetta-structural-binding',
      '2.5.0',
      'eligible',
      v_assembly.trait_count,
      0,
      coalesce(v_assembly.completed_at, v_assembly.created_at, now()),
      now()
    )
    on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
      do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.enqueue_civic_genome_prism_v25_scope_v1(p_assembly_run_ids uuid[])
returns setof public.civic_genome_prism_verification_queue
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_assembly_run_ids is null or cardinality(p_assembly_run_ids) not between 1 and 25
     or array_position(p_assembly_run_ids,null) is not null
     or (select count(distinct selected) from unnest(p_assembly_run_ids) selected) <> cardinality(p_assembly_run_ids) then
    raise exception 'prism_v25_scope_requires_1_to_25_distinct_assembly_ids';
  end if;
  if (select count(*) from public.civic_genome_assembly_run assembly
       where assembly.assembly_run_id = any(p_assembly_run_ids)
         and assembly.run_status = 'completed'
         and assembly.verification_state = 'complete'
         and assembly.trait_count > 0) <> cardinality(p_assembly_run_ids) then
    raise exception 'prism_v25_scope_assembly_not_complete';
  end if;
  insert into public.civic_genome_prism_verification_queue (
    assembly_run_id,genome_bill_id,prism_rule_set_id,prism_rule_set_version,
    queue_state,expected_trait_count,receipt_count,eligible_at,next_attempt_at)
  select assembly.assembly_run_id,assembly.genome_bill_id,'prism-rosetta-structural-binding','2.5.0',
         'eligible',assembly.trait_count,0,coalesce(assembly.completed_at,assembly.created_at,now()),now()
    from public.civic_genome_assembly_run assembly
   where assembly.assembly_run_id = any(p_assembly_run_ids)
  on conflict (assembly_run_id,prism_rule_set_id,prism_rule_set_version) do nothing;
  return query
    select queue.*
      from public.civic_genome_prism_verification_queue queue
     where queue.assembly_run_id = any(p_assembly_run_ids)
       and queue.prism_rule_set_id = 'prism-rosetta-structural-binding'
       and queue.prism_rule_set_version = '2.5.0'
     order by queue.assembly_run_id;
end
$function$;

alter function private.prism_v25_complete_receipt_set_v1(uuid) owner to postgres;
revoke all on function private.prism_v25_complete_receipt_set_v1(uuid) from public,anon,authenticated,service_role;
alter function private.prism_v25_modal_prior_covered_v1(uuid,uuid) owner to postgres;
revoke all on function private.prism_v25_modal_prior_covered_v1(uuid,uuid) from public,anon,authenticated,service_role;
alter function private.prism_v25_calendar_correction_evidence_v1(uuid,uuid) owner to postgres;
revoke all on function private.prism_v25_calendar_correction_evidence_v1(uuid,uuid) from public,anon,authenticated,service_role;
alter function private.project_prism_v25_modal_successors_v1(uuid) owner to postgres;
revoke all on function private.project_prism_v25_modal_successors_v1(uuid) from public,anon,authenticated,service_role;
alter function private.project_prism_legal_patterns_v1(uuid) owner to postgres;
revoke all on function private.project_prism_legal_patterns_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.project_prism_legal_patterns_v1(uuid) to service_role;
alter function public.enqueue_civic_genome_prism_verification() owner to postgres;
revoke all on function public.enqueue_civic_genome_prism_verification() from public,anon,authenticated,service_role;
alter function public.enqueue_civic_genome_bill_version_prism_v22() owner to postgres;
revoke all on function public.enqueue_civic_genome_bill_version_prism_v22() from public,anon,authenticated,service_role;
alter function public.enqueue_civic_genome_prism_v25_batch_v1(integer) owner to postgres;
revoke all on function public.enqueue_civic_genome_prism_v25_batch_v1(integer) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_civic_genome_prism_v25_batch_v1(integer) to service_role;
alter function public.enqueue_civic_genome_prism_v25_scope_v1(uuid[]) owner to postgres;
revoke all on function public.enqueue_civic_genome_prism_v25_scope_v1(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_civic_genome_prism_v25_scope_v1(uuid[]) to service_role;
comment on function private.project_prism_legal_patterns_v1(uuid) is
  'Monotonic completed-generation projector. Requires canonical 2.4/2.5 receipt sets and explicit prior modal coverage; exact observed calendar-May corrections append source-backed successors only.';
comment on function public.enqueue_civic_genome_prism_v25_scope_v1(uuid[]) is
  'Explicit 1..25 assembly replay scope; inserts only new 2.5 queue identities and preserves every historical generation and queue state.';
commit;
