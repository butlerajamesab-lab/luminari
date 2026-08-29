begin;

insert into public.luminari_registry_fixture_plan (
  fixture_key,
  state_code,
  document_name,
  family_key,
  fixture_role,
  expected_object_classes,
  status,
  notes
)
values
('midwest_region_backbone_fixture',null,'luminari-midwest-region-2.docx','regional_knowledge_backbone','regional_backbone_fixture',array['regional_federal_offices','state_agency_nodes','state_statute_nodes','tribal_nation_nodes','claim_variation_nodes','jurisdiction_overlays','graph_edges','provenance_spans'],'planned','Midwest regional backbone: 12 states, 36 state/local agencies, 41 state statutes, 50+ tribal nations; includes Midwest civil-rights comparison table and tribal summary.'),
('south_region_backbone_fixture',null,'luminari-south-region-1.docx','regional_knowledge_backbone','regional_backbone_fixture',array['regional_federal_offices','state_agency_nodes','state_statute_nodes','tribal_nation_nodes','claim_variation_nodes','jurisdiction_overlays','graph_edges','provenance_spans'],'planned','South regional backbone: 14 states, 45 state/local agencies, 54 state statutes, 60+ tribal nations; contains critical civil-rights gap-state alerts.'),
('west_region_backbone_fixture',null,'luminari-west-region-1.docx','regional_knowledge_backbone','regional_backbone_fixture',array['regional_federal_offices','state_agency_nodes','state_statute_nodes','tribal_nation_nodes','claim_variation_nodes','jurisdiction_overlays','graph_edges','provenance_spans'],'planned','West regional backbone: 11 listed states, 39 state/local agencies, 52 state statutes, plus WA Phase 1 federal master reference; includes regional federal offices and state-by-state graph data.'),
('northeast_region_backbone_fixture',null,'luminari-northeast-region.docx','regional_knowledge_backbone','regional_backbone_fixture',array['regional_federal_offices','state_agency_nodes','state_statute_nodes','tribal_nation_nodes','claim_variation_nodes','jurisdiction_overlays','graph_edges','provenance_spans'],'planned','Northeast regional backbone: 12 jurisdictions, 36 state/local agencies, 44 statutes, 20+ tribal nations; contains strong-state-agency and short-SOL routing distinctions.'),
('policy_impact_layer_fixture',null,'luminari-policy-impact-layer-6 (2).docx','policy_impact_layer','policy_logic_fixture',array['policy_events','policy_signal_rules','signal_templates','lag_profiles','comparison_pairs','language_guardrails','causal_firewall_rules','provenance_spans'],'planned','Policy Impact Interpretation Layer: 6 tables, 24 policy events, 8 signal rules, 7 parameterized templates, 5 lag profiles, 7 comparison pairs; includes causal firewall and chilling-effect constraints.')
on conflict (fixture_key) do update set
  document_name = excluded.document_name,
  family_key = excluded.family_key,
  fixture_role = excluded.fixture_role,
  expected_object_classes = excluded.expected_object_classes,
  status = excluded.status,
  notes = excluded.notes;

insert into public.luminari_fixture_expected_counts (fixture_key, family_key, object_class, minimum_expected_count, expectation_source, notes)
select fp.fixture_key, fp.family_key, expected.object_class, 1, 'fixture_plan', 'Auto-seeded from fixture expected object classes.'
from public.luminari_registry_fixture_plan fp
cross join lateral unnest(fp.expected_object_classes) as expected(object_class)
where fp.fixture_key in ('midwest_region_backbone_fixture','south_region_backbone_fixture','west_region_backbone_fixture','northeast_region_backbone_fixture','policy_impact_layer_fixture')
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

-- Tighten regional backbone fixture expectations from document metrics.
update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_agency_nodes' then 36
  when 'state_statute_nodes' then 41
  when 'tribal_nation_nodes' then 50
  when 'jurisdiction_overlays' then 12
  when 'claim_variation_nodes' then 12
  when 'regional_federal_offices' then 10
  when 'graph_edges' then 41
  when 'provenance_spans' then 41
  else minimum_expected_count
end,
expectation_source='document_page_1_and_visible_regional_structure',
notes='Midwest expectations tightened from page-one metrics: 12 states, 36 agencies, 41 statutes, 50+ tribal nations, regional federal offices and comparative-reference structure.'
where fixture_key='midwest_region_backbone_fixture';

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_agency_nodes' then 45
  when 'state_statute_nodes' then 54
  when 'tribal_nation_nodes' then 60
  when 'jurisdiction_overlays' then 14
  when 'claim_variation_nodes' then 14
  when 'regional_federal_offices' then 10
  when 'graph_edges' then 54
  when 'provenance_spans' then 54
  else minimum_expected_count
end,
expectation_source='document_page_1_and_visible_regional_structure',
notes='South expectations tightened from page-one metrics: 14 states, 45 agencies, 54 statutes, 60+ tribal nations, civil-rights gap alerts and regional federal offices.'
where fixture_key='south_region_backbone_fixture';

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_agency_nodes' then 39
  when 'state_statute_nodes' then 52
  when 'tribal_nation_nodes' then 20
  when 'jurisdiction_overlays' then 11
  when 'claim_variation_nodes' then 11
  when 'regional_federal_offices' then 8
  when 'graph_edges' then 52
  when 'provenance_spans' then 52
  else minimum_expected_count
end,
expectation_source='document_page_1_and_visible_regional_structure',
notes='West expectations tightened from page-one metrics: 11 listed states, 39 agencies, 52 statutes, federal regional offices; tribal minimum set conservatively pending full table extraction.'
where fixture_key='west_region_backbone_fixture';

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'state_agency_nodes' then 36
  when 'state_statute_nodes' then 44
  when 'tribal_nation_nodes' then 20
  when 'jurisdiction_overlays' then 12
  when 'claim_variation_nodes' then 12
  when 'regional_federal_offices' then 6
  when 'graph_edges' then 44
  when 'provenance_spans' then 44
  else minimum_expected_count
end,
expectation_source='document_page_1_and_visible_regional_structure',
notes='Northeast expectations tightened from page-one metrics: 12 jurisdictions, 36 agencies, 44 statutes, 20+ tribal nations, strong-state-agency routing distinctions.'
where fixture_key='northeast_region_backbone_fixture';

-- Tighten policy impact fixture expectations from document metrics.
update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'policy_events' then 24
  when 'policy_signal_rules' then 8
  when 'signal_templates' then 7
  when 'lag_profiles' then 5
  when 'comparison_pairs' then 7
  when 'language_guardrails' then 1
  when 'causal_firewall_rules' then 1
  when 'provenance_spans' then 24
  else minimum_expected_count
end,
expectation_source='document_page_1_and_design_principles',
notes='Policy Impact expectations tightened from page-one metrics and design principles: 24 events, 8 signal rules, 7 templates, 5 lag profiles, 7 comparison pairs, causal firewall/language guardrails.'
where fixture_key='policy_impact_layer_fixture';

commit;
