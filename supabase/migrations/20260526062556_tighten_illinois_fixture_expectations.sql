begin;

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_metadata' then 1
  when 'layer0_policy_flags' then 8
  when 'resource_cards' then 22
  when 'contact_points' then 22
  when 'jurisdiction_overlays' then 2
  when 'tribal_context' then 1
  when 'workflow_bindings' then 4
  when 'oversight_bodies' then 18
  when 'eligibility_rules' then 22
  when 'apply_notes' then 22
  when 'deadline_rules' then 4
  when 'legal_authorities' then 4
  when 'provenance_spans' then 22
  else minimum_expected_count
end,
expectation_source = 'document_metric_page_23_and_visible_structure',
notes = 'Illinois fixture expectations tightened from registry completion metrics and visible three-layer structure: 8 flags, 22 program cards, 4 workflows, 18 oversight bodies, Chicago + Cook County overlays, urban AI/AN context, 22 key navigation contacts.'
where fixture_key = 'il_state_registry_fixture';

commit;
