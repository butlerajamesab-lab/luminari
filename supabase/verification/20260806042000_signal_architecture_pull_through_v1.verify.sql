do $$
declare
  v_bridge_count bigint;
  v_candidate_count bigint;
  v_incorrect_known_count bigint;
  v_snapshot_one jsonb;
  v_snapshot_two jsonb;
begin
  if to_regclass('public.signal_domain3_source_classification_v1') is null then
    raise exception 'Domain 3 source-classification registry is missing';
  end if;
  if to_regclass('public.v_atlas_domain3_signal_candidates_v1') is null then
    raise exception 'Atlas Domain 3 candidate view is missing';
  end if;
  if to_regclass('public.v_signal_pull_through_inventory_v1') is null then
    raise exception 'Signal pull-through inventory view is missing';
  end if;
  if to_regprocedure('public.get_signal_pull_through_snapshot_v1()') is null then
    raise exception 'Signal pull-through snapshot function is missing';
  end if;

  select count(*) into v_bridge_count
  from public.v_atlas_lighthouse_bridge_v1_verified;
  select count(*) into v_candidate_count
  from public.v_atlas_domain3_signal_candidates_v1;

  if v_bridge_count <> v_candidate_count then
    raise exception 'Every verified Atlas bridge row must be classified: bridge %, candidates %',
      v_bridge_count, v_candidate_count;
  end if;

  select count(*) into v_incorrect_known_count
  from public.v_atlas_domain3_signal_candidates_v1
  where signal_type in (
      'classification_activity',
      'jurisdiction_legislative_activity',
      'new_statute_or_bill'
    )
    and (
      source_class <> 'observation_only'
      or eligible_for_canonical_registration
    );

  if v_incorrect_known_count <> 0 then
    raise exception 'Raw legislative observations were marked as Domain 3 candidates: %',
      v_incorrect_known_count;
  end if;

  if exists (
    select 1
    from public.v_atlas_domain3_signal_candidates_v1
    where signal_type = 'stream_health_alert'
      and (
        source_class <> 'operational_only'
        or eligible_for_canonical_registration
      )
  ) then
    raise exception 'Stream-health telemetry was marked as a civic Domain 3 signal';
  end if;

  if exists (
    select 1
    from public.v_atlas_domain3_signal_candidates_v1 candidate
    where candidate.source_class = 'unsupported_rule'
      and candidate.eligible_for_canonical_registration
  ) then
    raise exception 'An unsupported Atlas rule was made eligible';
  end if;

  v_snapshot_one := public.get_signal_pull_through_snapshot_v1();
  v_snapshot_two := public.get_signal_pull_through_snapshot_v1();

  if coalesce(v_snapshot_one->>'snapshot_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Signal pull-through snapshot hash is missing or malformed';
  end if;
  if v_snapshot_one->>'snapshot_hash' is distinct from v_snapshot_two->>'snapshot_hash' then
    raise exception 'Signal pull-through semantic snapshot is not deterministic';
  end if;
  if v_snapshot_one->>'contract_id' <> 'luminari.signal_pull_through.v1'
     or v_snapshot_one->>'contract_version' <> '1.0.0' then
    raise exception 'Signal pull-through contract identity mismatch';
  end if;

  if has_function_privilege('public', 'public.get_signal_pull_through_snapshot_v1()', 'execute')
     or has_function_privilege('anon', 'public.get_signal_pull_through_snapshot_v1()', 'execute')
     or has_function_privilege('authenticated', 'public.get_signal_pull_through_snapshot_v1()', 'execute')
     or not has_function_privilege('service_role', 'public.get_signal_pull_through_snapshot_v1()', 'execute') then
    raise exception 'Signal pull-through snapshot function ACL mismatch';
  end if;
end;
$$;

select
  source_class,
  count(*)::bigint as record_count,
  count(*) filter (where eligible_for_canonical_registration)::bigint
    as eligible_record_count
from public.v_atlas_domain3_signal_candidates_v1
group by source_class
order by source_class;

select public.get_signal_pull_through_snapshot_v1() as snapshot;
