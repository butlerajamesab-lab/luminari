begin;

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_metadata' then 1
  when 'layer0_policy_flags' then 8
  when 'resource_cards' then 24
  when 'contact_points' then 20
  when 'jurisdiction_overlays' then 2
  when 'tribal_context' then 4
  when 'workflow_bindings' then 4
  when 'oversight_bodies' then 16
  when 'eligibility_rules' then 24
  when 'apply_notes' then 24
  when 'deadline_rules' then 4
  when 'legal_authorities' then 4
  when 'provenance_spans' then 24
  else minimum_expected_count
end,
expectation_source = 'document_metric_page_24_and_visible_structure',
notes = 'Michigan fixture expectations tightened from the registry completion metrics and visible three-layer structure: 8 flags, 24 program cards, 4 workflows, 16 oversight bodies, Detroit/Wayne + UP overlays, 4 profiled tribal resources, 20 key navigation contacts.'
where fixture_key = 'mi_state_registry_fixture';

commit;
