-- Verify the Atlas-to-Lighthouse projection, evidence, and routing gates.
do $$
declare
  v_unprojected bigint;
begin
  if to_regprocedure('public.project_atlas_integrity_candidate_v1(uuid)') is null
     or to_regprocedure('public.project_atlas_integrity_candidates_v1(integer)') is null
     or to_regprocedure('public.integrity_candidate_review_v2(uuid)') is null
     or to_regprocedure('public.integrity_projection_readiness_v1()') is null
     or to_regprocedure('public.transition_integrity_candidate_v1(jsonb)') is null
     or to_regprocedure('public.create_integrity_escalation_packet_v1(jsonb)') is null then
    raise exception 'Atlas integrity review projection RPC contract is incomplete';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'project_atlas_integrity_candidate_v1'
      and tgrelid = 'public.live_data_signals'::regclass
      and not tgisinternal
  ) then
    raise exception 'Atlas integrity review projection trigger is missing';
  end if;

  if has_function_privilege('anon', 'public.project_atlas_integrity_candidate_v1(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.project_atlas_integrity_candidate_v1(uuid)', 'execute')
     or has_function_privilege('anon', 'public.integrity_candidate_review_v2(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.integrity_candidate_review_v2(uuid)', 'execute')
     or has_function_privilege('anon', 'public.record_integrity_corroboration_v1(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.record_integrity_corroboration_v1(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.create_integrity_escalation_packet_v1(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.create_integrity_escalation_packet_v1(jsonb)', 'execute') then
    raise exception 'Browser role can execute a service-only integrity review RPC';
  end if;

  if not has_function_privilege('service_role', 'public.project_atlas_integrity_candidate_v1(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.integrity_candidate_review_v2(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.record_integrity_corroboration_v1(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.create_integrity_escalation_packet_v1(jsonb)', 'execute') then
    raise exception 'Service role is missing an integrity review RPC grant';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
        'integrity_pattern_candidate',
        'integrity_evidence_link',
        'integrity_corroboration_assessment',
        'integrity_candidate_transition',
        'integrity_routing_snapshot',
        'integrity_escalation_packet'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'Private integrity review table is missing row-level security';
  end if;

  if position(
       'count(distinct e.source_relation)' in lower(
         pg_get_functiondef('public.record_integrity_corroboration_v1(jsonb)'::regprocedure)
       )
     ) = 0 then
    raise exception 'Corroboration RPC does not derive independent source counts from evidence';
  end if;

  if position(
       'max(latest.assessment_order)' in lower(
         pg_get_functiondef('public.create_integrity_escalation_packet_v1(jsonb)'::regprocedure)
       )
     ) = 0
     or position(
       'transmission_authorized' in lower(
         pg_get_functiondef('public.create_integrity_escalation_packet_v1(jsonb)'::regprocedure)
       )
     ) = 0 then
    raise exception 'Escalation packet RPC is missing latest-assessment or draft-only gates';
  end if;

  select count(*)
  into v_unprojected
  from public.live_data_signals s
  where s.is_current
    and s.governance_status = 'observation_candidate'
    and s.detection_rule_id like 'atlas.domain3.integrity.%'
    and not exists (
      select 1
      from private.integrity_pattern_candidate c
      where c.signal_id = s.live_data_signal_id
    );

  if v_unprojected <> 0 then
    raise exception 'Current Atlas integrity candidates remain unprojected: %', v_unprojected;
  end if;

  if exists (
    select 1
    from private.integrity_pattern_candidate c
    join public.live_data_signals s on s.live_data_signal_id = c.signal_id
    where s.detection_rule_id like 'atlas.domain3.integrity.%'
      and not exists (
        select 1
        from private.integrity_evidence_link e
        where e.candidate_id = c.candidate_id
      )
  ) then
    raise exception 'Projected Atlas integrity candidate is missing evidence receipts';
  end if;
end;
$$;
