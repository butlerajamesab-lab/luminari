-- Executable projection regressions using the INSTALLED function definitions.
-- All records are synthetic, all work is isolated, and the transaction rolls back.
begin;
create schema prism_v24_fixture;

create table prism_v24_fixture.civic_genome_bill (
  genome_bill_id uuid primary key, state_code text, source_bill_number text,
  source_bill_title text, source_bill_url text);
create table prism_v24_fixture.civic_genome_assembly_run (
  assembly_run_id uuid primary key, genome_bill_id uuid, run_status text,
  verification_state text, trait_count integer, completed_at timestamptz, created_at timestamptz default now());
create table prism_v24_fixture.civic_genome_bill_version (
  bill_version_id uuid primary key, genome_bill_id uuid, assembly_run_id uuid,
  source_bill_id text,source_document_key text,document_family text,version_type text,
  stage_rank integer,chamber text);
create table prism_v24_fixture.docket_bill_source_document (
  source_document_key text primary key, source_url text, provider_hash text);
create table prism_v24_fixture.civic_genome_prism_verification_run (
  verification_run_id uuid primary key,genome_bill_id uuid,assembly_run_id uuid,
  source_document_id bigint,extraction_run_id text,prism_engine_version text,
  prism_rule_set_id text,prism_rule_set_version text,expected_trait_count integer,
  receipt_count integer,completed_at timestamptz);
create table prism_v24_fixture.civic_genome_prism_verification_binding (
  binding_id uuid primary key,genome_bill_id uuid,assembly_run_id uuid,trait_id uuid,
  source_document_id bigint,extraction_run_id text,source_object_id text,request_id text,
  prism_verification_receipt_id uuid,prism_engine_version text,prism_rule_set_id text,
  prism_rule_set_version text,prism_rule_set_hash text,input_hash text,output_hash text,
  deterministic_replay_key text);
create table prism_v24_fixture.lighthouse_prism_verification_requests (
  request_id text primary key,rule_set_id text,rule_set_version text,input_hash text,bridge_state text);
create table prism_v24_fixture.lighthouse_prism_verification_receipts (
  prism_verification_receipt_id uuid primary key,request_id text,prism_engine_version text,
  rule_set_id text,rule_set_version text,rule_set_hash text,input_hash text,output_hash text,
  deterministic_replay_key text,prism_completion_timestamp timestamptz,
  contradictions jsonb default '[]',supported_findings jsonb default '[]',
  missing_evidence jsonb default '[]',unresolved_conditions jsonb default '[]');
create table prism_v24_fixture.legal_patterns (
  pattern_id uuid primary key default gen_random_uuid(),source_relation text,source_record_key text,
  pattern_type text,title text,description text,jurisdiction_scope jsonb default '{}',
  authority_refs jsonb default '[]',contradiction_refs jsonb default '[]',enforcement_refs jsonb default '[]',
  verification_state text,engine_id text,engine_version text,rule_id text,rule_version text,
  input_hash text,pattern_hash text unique,first_observed_at timestamptz,
  created_at timestamptz default now(),supersedes_id uuid references prism_v24_fixture.legal_patterns(pattern_id),
  is_current boolean default true);
create table prism_v24_fixture.civic_genome_prism_verification_queue (
  queue_id uuid primary key default gen_random_uuid(),assembly_run_id uuid,genome_bill_id uuid,
  prism_rule_set_id text,prism_rule_set_version text,queue_state text,expected_trait_count integer,
  receipt_count integer,eligible_at timestamptz,next_attempt_at timestamptz,
  unique(assembly_run_id,prism_rule_set_id,prism_rule_set_version));

create function prism_v24_fixture.signal_architecture_hash_v1(value jsonb)
returns text language sql immutable as $function$
  select public.signal_architecture_hash_v1(value);
$function$;
do $fixture$
declare v_function text; v_definition text;
begin
  foreach v_function in array array[
    'public.register_legal_pattern_v1(jsonb)',
    'public.guard_signal_architecture_immutable_v1()',
    'private.prism_v24_complete_receipt_set_v1(uuid)',
    'private.project_prism_v24_modal_successors_v1(uuid)',
    'private.project_prism_legal_patterns_v1(uuid)',
    'public.enqueue_civic_genome_prism_v24_batch_v1(integer)',
    'public.enqueue_civic_genome_prism_verification()'
  ] loop
    v_definition := pg_get_functiondef(v_function::regprocedure);
    v_definition := replace(replace(v_definition, 'public.', 'prism_v24_fixture.'), 'private.', 'prism_v24_fixture.');
    -- Preserve the source-relation identity string while redirecting table access.
    v_definition := replace(v_definition,
      '''prism_v24_fixture.civic_genome_prism_verification_run''',
      '''public.civic_genome_prism_verification_run''');
    execute v_definition;
  end loop;
end
$fixture$;
create trigger pattern_immutable before update or delete on prism_v24_fixture.legal_patterns
for each row execute function prism_v24_fixture.guard_signal_architecture_immutable_v1();

create function prism_v24_fixture.seed_modal_case(p_mode text)
returns table(assembly_id uuid,run_id uuid,old_run_id uuid,prior_id uuid)
language plpgsql as $fixture$
declare
  v_bill uuid := gen_random_uuid();
  v_assembly uuid := gen_random_uuid();
  v_run uuid := gen_random_uuid();
  v_old_run uuid := gen_random_uuid();
  v_trait uuid := gen_random_uuid();
  v_receipt uuid := gen_random_uuid();
  v_prior uuid := gen_random_uuid();
  v_check text := 'workflow_modal_present';
  v_proof jsonb;
  v_supported jsonb := '[]';
  v_unresolved jsonb := '[]';
  v_contradictions jsonb := '[]';
begin
  if p_mode='incomplete' then v_check := 'workflow_modal_polarity_matches'; end if;
  v_proof := jsonb_build_object('finding','deterministic_check_passed','check',v_check,
    'step_order','1','evaluated_span','The agency must act.','matched_modal','must');
  if p_mode in ('supported','bad_hash','partial','wrong_step','incomplete_assembly','wrong_request') then
    if p_mode='wrong_step' then v_proof := v_proof || jsonb_build_object('step_order','2'); end if;
    v_supported := jsonb_build_array(v_proof);
  elsif p_mode='unresolved' then
    v_unresolved := '[{"condition":"modal_only_in_quoted_text","step_order":"1","evaluated_span":"The text says must."}]';
  elsif p_mode='blanket_unresolved' then
    v_unresolved := '[{"condition":"modal_only_in_quoted_text","evaluated_span":"The text says must."}]';
  elsif p_mode='contradicted' then
    v_contradictions := jsonb_build_array(jsonb_build_object('check',v_check,'step_order','1','observed','not_observed'));
  end if;
  insert into prism_v24_fixture.civic_genome_bill values(v_bill,'ZZ','FIXTURE','Synthetic fixture',null);
  insert into prism_v24_fixture.civic_genome_assembly_run values(v_assembly,v_bill,
    case when p_mode='incomplete_assembly' then 'running' else 'completed' end,'complete',1,now(),now());
  insert into prism_v24_fixture.civic_genome_bill_version values(gen_random_uuid(),v_bill,v_assembly,'fixture',null,'bill','introduced',1,null);
  insert into prism_v24_fixture.civic_genome_prism_verification_run values
    (v_old_run,v_bill,v_assembly,1,'fixture','2.3.0','prism-rosetta-structural-binding','2.3.0',1,1,now()+interval '1 day'),
    (v_run,v_bill,v_assembly,1,'fixture','2.4.0','prism-rosetta-structural-binding','2.4.0',case when p_mode='partial' then 2 else 1 end,case when p_mode='partial' then 2 else 1 end,now());
  insert into prism_v24_fixture.lighthouse_prism_verification_requests values
    (v_receipt::text,'prism-rosetta-structural-binding','2.4.0',repeat('a',64),'completed');
  insert into prism_v24_fixture.lighthouse_prism_verification_receipts values
    (v_receipt,case when p_mode='wrong_request' then 'mismatched-request' else v_receipt::text end,'2.4.0','prism-rosetta-structural-binding','2.4.0',
     case when p_mode='bad_hash' then repeat('b',64) else '78cf62b9cd452d8de62397c775fa71a2507777ebf81b1ea53915782d573768a6' end,
     repeat('a',64),repeat('b',64),repeat('c',64),now(),v_contradictions,v_supported,
     case when p_mode='incomplete' then '[{"requirement":"workflow_declared_modal","step_order":"1","evaluated_span":"The agency must act.","matched_modal":"must"}]'::jsonb else '[]'::jsonb end,
     v_unresolved);
  insert into prism_v24_fixture.civic_genome_prism_verification_binding values
    (gen_random_uuid(),v_bill,v_assembly,v_trait,1,'fixture','fixture',v_receipt::text,v_receipt,
     '2.4.0','prism-rosetta-structural-binding','2.4.0','78cf62b9cd452d8de62397c775fa71a2507777ebf81b1ea53915782d573768a6',
     repeat('a',64),repeat('b',64),repeat('c',64));
  insert into prism_v24_fixture.legal_patterns (
    pattern_id,source_relation,source_record_key,pattern_type,title,description,
    authority_refs,contradiction_refs,verification_state,engine_id,engine_version,rule_id,rule_version,
    input_hash,pattern_hash
  ) values (
    v_prior,'public.civic_genome_prism_verification_run',v_old_run::text,'workflow_gap','Earlier contradiction','Synthetic earlier finding',
    jsonb_build_array(jsonb_build_object('assembly_run_id',v_assembly)),
    jsonb_build_array(jsonb_build_object('trait_id',v_trait,'contradiction',jsonb_build_object('check',v_check,'step_order','1'))),
    'contradicted','prism','2.3.0','prism-rosetta-structural-binding:'||v_check,'2.3.0',repeat('d',64),v_prior::text
  );
  return query select v_assembly,v_run,v_old_run,v_prior;
end
$fixture$;

do $verify$
declare
  v_mode text; v_case record; v_pattern record; v_before jsonb; v_count integer; v_failed boolean;
begin
  foreach v_mode in array array['supported','unresolved','incomplete','contradicted','absent','wrong_step','blanket_unresolved','bad_hash','partial','incomplete_assembly','wrong_request'] loop
    select * into v_case from prism_v24_fixture.seed_modal_case(v_mode);
    select to_jsonb(pattern)-'is_current' into v_before from prism_v24_fixture.legal_patterns pattern where pattern_id=v_case.prior_id;
    if v_mode in ('bad_hash','partial','incomplete_assembly','wrong_request') then
      v_failed := false;
      begin
        perform prism_v24_fixture.project_prism_legal_patterns_v1(v_case.run_id);
      exception when others then
        if sqlerrm='prism_v24_complete_receipt_set_required' then v_failed := true; else raise; end if;
      end;
      if not v_failed then raise exception 'Expected receipt-set refusal for %',v_mode; end if;
    else
      perform prism_v24_fixture.project_prism_legal_patterns_v1(v_case.run_id);
    end if;
    if v_mode in ('absent','wrong_step','blanket_unresolved','bad_hash','partial','incomplete_assembly','wrong_request') then
      if not (select is_current from prism_v24_fixture.legal_patterns where pattern_id=v_case.prior_id) then
        raise exception 'Unevaluated old finding was cleared for %',v_mode;
      end if;
    else
      if (select is_current from prism_v24_fixture.legal_patterns where pattern_id=v_case.prior_id) then
        raise exception 'Explicit successor did not supersede prior for %',v_mode;
      end if;
      select * into strict v_pattern from prism_v24_fixture.legal_patterns where supersedes_id=v_case.prior_id;
      if v_pattern.verification_state <> (case v_mode when 'supported' then 'supported_one_source' else v_mode end)
         or not v_pattern.is_current then raise exception 'Wrong successor state for %',v_mode; end if;
      if v_mode <> 'contradicted' and (jsonb_array_length(v_pattern.contradiction_refs)<>0 or v_pattern.pattern_type<>'other') then
        raise exception 'Reassessment retained a false contradiction label for %',v_mode;
      end if;
      select count(*) into v_count from prism_v24_fixture.legal_patterns;
      perform prism_v24_fixture.project_prism_legal_patterns_v1(v_case.run_id);
      if (select count(*) from prism_v24_fixture.legal_patterns) <> v_count then raise exception 'Replay appended duplicates for %',v_mode; end if;
      if not (select is_current and supersedes_id=v_case.prior_id from prism_v24_fixture.legal_patterns where pattern_id=v_pattern.pattern_id) then
        raise exception 'Replay superseded its own current identity for %',v_mode;
      end if;
    end if;
    if (select to_jsonb(pattern)-'is_current' from prism_v24_fixture.legal_patterns pattern where pattern_id=v_case.prior_id) is distinct from v_before then
      raise exception 'Prior content was rewritten for %',v_mode;
    end if;
    -- A 2.3 run with a LATER completion timestamp cannot regain currentness.
    if prism_v24_fixture.project_prism_legal_patterns_v1(v_case.old_run_id) <> 0 then
      raise exception 'Late old generation passed currentness fence';
    end if;
  end loop;
  if prism_v24_fixture.enqueue_civic_genome_prism_v24_batch_v1(2)<>2 then raise exception 'Bounded queue batch failed'; end if;
  if (select count(*) from prism_v24_fixture.civic_genome_prism_verification_queue)<>2 then raise exception 'Queue exceeded bound'; end if;
  perform prism_v24_fixture.enqueue_civic_genome_prism_v24_batch_v1(500);
  if prism_v24_fixture.enqueue_civic_genome_prism_v24_batch_v1(500)<>0 then raise exception 'Queue replay was not idempotent'; end if;
  v_failed := false;
  begin perform prism_v24_fixture.enqueue_civic_genome_prism_v24_batch_v1(501);
  exception when others then if sqlerrm='prism_v24_batch_limit_out_of_range' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'Unbounded queue request accepted'; end if;
  raise notice 'Prism 2.4 projection: explicit states, missing/wrong-step proof, receipt mismatch, partial receipts, immutable history, monotonic generation and bounded/idempotent queue passed';
end
$verify$;
rollback;
