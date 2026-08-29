-- Extend the append-only reviewed-source supplement lane with the exact
-- service-only object types needed to preserve the Benefits Cascade source.
--
-- This composes with 20260817191500_sol_collision_reviewed_supplement_types_v1.
-- It creates no public view, public grant, action activation, Resource
-- Directory projection, Legal Library row, deadline automation, or delete
-- path. Every record still passes through the existing service-only,
-- separately-gated registration contract.

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
    'source_transcription_snapshot'
  ));

-- The registration RPC installed by the SOL type migration invokes v4.
-- Replace that validator in place so the migration remains additive and the
-- single guarded registration path continues to enforce the full cumulative
-- type set.
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
    'source_transcription_snapshot'
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
  'Validates the cumulative reviewed supplement types through Benefits Cascade. Cascade logic and the source transcription remain service-only and separately gated.';

comment on table public.luminari_reviewed_source_supplement_revision_v1 is
  'Append-only service-only reviewed source revisions, including exact cascade structure and a full source transcription snapshot. Every record requires a separate publication gate.';
