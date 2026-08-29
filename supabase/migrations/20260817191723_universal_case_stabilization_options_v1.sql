-- Stabilization is an optional universal intake layer, not a gate and not a
-- replacement for any case track.  The view projects current reviewed,
-- source-backed stabilization routes onto every current and future case.

create or replace view public.v_lighthouse_case_stabilization_option_v1
with (security_invoker = true) as
with case_context as (
  select
    c.id as legacy_case_id,
    b.case_uuid,
    current_session.intake_session_id,
    current_session.case_jurisdiction
  from public.cases c
  left join public.case_identity_bridge b
    on b.legacy_case_id = c.id
  left join lateral (
    select
      l.intake_session_id,
      nullif(upper(coalesce(
        s.metadata #>> '{last_governed_execution,jurisdiction}',
        s.metadata #>> '{declared_context,jurisdiction}',
        s.metadata #>> '{declared_jurisdiction}',
        s.metadata #>> '{jurisdiction}',
        ''
      )), '') as case_jurisdiction
    from public.case_intake_links l
    join public.intake_sessions s
      on s.intake_session_id = l.intake_session_id
    where l.case_uuid = b.case_uuid
    order by
      l.is_primary desc,
      (s.metadata #>> '{last_governed_execution,jurisdiction}' is not null) desc,
      l.created_at desc,
      l.case_intake_link_id desc
    limit 1
  ) current_session on true
)
select
  c.legacy_case_id,
  c.case_uuid,
  c.intake_session_id,
  c.case_jurisdiction,
  a.action_key,
  a.situation_key,
  a.action_kind,
  a.action_label,
  a.when_to_use,
  a.jurisdiction_level,
  a.jurisdiction as action_jurisdiction,
  a.state_code as action_state_code,
  a.binding_count,
  a.bindings,
  a.active_run_id,
  false as is_required,
  false as is_gating,
  true as user_controls_timing,
  'available_unselected'::text as selection_state,
  'Show beside the case from intake onward. The person may choose any, all, or none without delaying other case work.'::text
    as presentation_policy
from case_context c
join public.v_lighthouse_situation_action_current_v1 a
  on a.issue_lens = 'immediate_stabilization'
 and a.action_class = 'route'
 and a.binding_count > 0
 and a.has_access_point
 and (
   upper(coalesce(nullif(a.state_code, ''), 'US')) = 'US'
   or (
     c.case_jurisdiction is not null
     and upper(a.state_code) = c.case_jurisdiction
   )
 );

revoke all on public.v_lighthouse_case_stabilization_option_v1
  from public, anon, authenticated;
grant select on public.v_lighthouse_case_stabilization_option_v1
  to service_role;

create or replace view public.v_lighthouse_case_stabilization_summary_v1
with (security_invoker = true) as
select
  count(distinct legacy_case_id)::integer as case_count,
  count(*)::integer as available_case_option_count,
  count(distinct action_key)::integer as distinct_stabilization_option_count,
  bool_and(not is_required and not is_gating and user_controls_timing)
    as non_gating_contract_holds
from public.v_lighthouse_case_stabilization_option_v1;

revoke all on public.v_lighthouse_case_stabilization_summary_v1
  from public, anon, authenticated;
grant select on public.v_lighthouse_case_stabilization_summary_v1
  to service_role;

comment on view public.v_lighthouse_case_stabilization_option_v1 is
  'Universal, jurisdiction-aware, non-gating stabilization options for every case. Rows appear only when a reviewed source-backed access route exists.';

comment on view public.v_lighthouse_case_stabilization_summary_v1 is
  'Operational proof that current case stabilization options remain optional and user-paced.';
