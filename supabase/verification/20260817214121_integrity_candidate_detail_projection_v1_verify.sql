do $$
begin
  if to_regprocedure('public.integrity_candidate_detail_v1(uuid)') is null then
    raise exception 'integrity_candidate_detail_v1(uuid) is missing';
  end if;
  if has_function_privilege('anon', 'public.integrity_candidate_detail_v1(uuid)', 'execute') then
    raise exception 'anon must not execute integrity_candidate_detail_v1';
  end if;
  if has_function_privilege('authenticated', 'public.integrity_candidate_detail_v1(uuid)', 'execute') then
    raise exception 'authenticated must not execute integrity_candidate_detail_v1';
  end if;
  if not has_function_privilege('service_role', 'public.integrity_candidate_detail_v1(uuid)', 'execute') then
    raise exception 'service_role must execute integrity_candidate_detail_v1';
  end if;
end $$;

select
  to_regclass('private.integrity_pattern_candidate') is not null as candidate_relation_present,
  to_regclass('private.integrity_evidence_link') is not null as evidence_relation_present,
  to_regclass('private.integrity_corroboration_assessment') is not null as assessment_relation_present,
  to_regclass('private.integrity_candidate_transition') is not null as transition_relation_present,
  to_regclass('private.integrity_routing_snapshot') is not null as routing_relation_present,
  to_regclass('private.integrity_escalation_packet') is not null as packet_relation_present;
