-- Extend the append-only reviewed-source supplement lane with the exact
-- service-only object types required by the manually reviewed No-Remedy Gap
-- Playbook.  This migration composes after the Benefits Cascade extension and
-- re-preserves every prior allowed type.
--
-- No object created here is a Resource Directory route, public action, Legal
-- Library statute, Enforcement Hub row, Knowledge Backbone entry, or public
-- overlay.  The existing table remains service-role-only, RLS-protected, and
-- separately gated.

alter table public.luminari_reviewed_source_supplement_revision_v1
  drop constraint if exists luminari_reviewed_source_supplement_type_check;

alter table public.luminari_reviewed_source_supplement_revision_v1
  add constraint luminari_reviewed_source_supplement_type_check
  check (supplement_type in (
    'authority',
    'jurisdiction_entry_point',
    'handoff',
    'integrity_flag',
    'source_alias_resolution',
    'primary_resource',
    'program',
    'deadline',
    'case_action_link',
    'cross_lens_binding',
    'held_binding',
    'agency',
    'agency_status',
    'observed_route',
    'claim_route',
    'optional_action',
    'employer_threshold',
    'regional_index',
    'strategy',
    'operating_context',
    'source_alias',
    'overlap_relationship',
    'source_fragment_lineage',
    'projection_hold',
    'filing_independence_rule',
    'collision_scenario',
    'scenario_route_binding',
    'collision_rule',
    'common_pitfall',
    'tolling_rule',
    'preclusion_assertion',
    'preclusion_field',
    'source_conflict',
    'review_blocker',
    'access_inventory',
    'cascade',
    'cascade_stage',
    'compound_pattern',
    'system_routing_summary',
    'source_transcription_snapshot',
    'source_assertion',
    'gap_population_context',
    'state_profile',
    'resource_mention',
    'protected_class_coverage',
    'comparison_feature',
    'workflow_step',
    'narrative_analysis'
  ));

-- The cumulative registration RPC invokes validator v4. Replace it in place
-- so prior adapters continue working and the new GAP types share the same
-- guarded, exact-key registration path.
create or replace function public.assert_luminari_reviewed_source_supplement_type_v4(
  p_type text
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if nullif(btrim(p_type), '') is null
     or nullif(btrim(p_type), '') not in (
    'authority',
    'jurisdiction_entry_point',
    'handoff',
    'integrity_flag',
    'source_alias_resolution',
    'primary_resource',
    'program',
    'deadline',
    'case_action_link',
    'cross_lens_binding',
    'held_binding',
    'agency',
    'agency_status',
    'observed_route',
    'claim_route',
    'optional_action',
    'employer_threshold',
    'regional_index',
    'strategy',
    'operating_context',
    'source_alias',
    'overlap_relationship',
    'source_fragment_lineage',
    'projection_hold',
    'filing_independence_rule',
    'collision_scenario',
    'scenario_route_binding',
    'collision_rule',
    'common_pitfall',
    'tolling_rule',
    'preclusion_assertion',
    'preclusion_field',
    'source_conflict',
    'review_blocker',
    'access_inventory',
    'cascade',
    'cascade_stage',
    'compound_pattern',
    'system_routing_summary',
    'source_transcription_snapshot',
    'source_assertion',
    'gap_population_context',
    'state_profile',
    'resource_mention',
    'protected_class_coverage',
    'comparison_feature',
    'workflow_step',
    'narrative_analysis'
  ) then
    raise exception 'unsupported reviewed supplement type %', p_type;
  end if;
end;
$function$;

revoke all on function public.assert_luminari_reviewed_source_supplement_type_v4(text)
  from public, anon, authenticated, service_role;
grant execute on function public.assert_luminari_reviewed_source_supplement_type_v4(text)
  to service_role;

comment on function public.assert_luminari_reviewed_source_supplement_type_v4(text) is
  'Validates cumulative reviewed supplement types through the GAP Playbook. Raw assertions, contexts, profiles, resource mentions, coverage/comparison rows, workflows, and narrative analysis remain service-only and separately gated.';

comment on table public.luminari_reviewed_source_supplement_revision_v1 is
  'Append-only, service-only reviewed source revisions through the GAP Playbook. No record is a public route, action, statute, enforcement record, or Knowledge Backbone entry without a separate future contract and gate.';
