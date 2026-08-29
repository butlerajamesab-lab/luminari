begin;

insert into public.luminari_document_family_contracts (
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes
)
values (
  'structured_tribal_jurisdiction_pack',
  'Structured Tribal Jurisdiction Pack',
  'Machine-readable JSON pack for tribal, state, county, city, borough, Alaska Native regional corporation, recognition, language, service, and jurisdiction graph ingestion.',
  array['pack_metadata','state_jurisdictions','county_or_borough_jurisdictions','city_jurisdictions','tribal_jurisdiction_nodes','alaska_native_regional_corporations','recognition_status_records','language_records','service_capability_flags','jurisdiction_graph_edges','provenance_spans'],
  array['v_ui_civic_map_v2','v_ui_intake_routing_v1','v_ui_legal_library_v1','v_ui_registry_quality_v1'],
  'Extract directly from JSON into jurisdiction graph, tribal nation nodes, language/recognition/service records, and graph edges. Do not flatten into generic resource cards.'
)
on conflict (family_key) do update set
  family_name = excluded.family_name,
  scope_description = excluded.scope_description,
  required_object_classes = excluded.required_object_classes,
  expected_runtime_consumers = excluded.expected_runtime_consumers,
  canonical_destination_notes = excluded.canonical_destination_notes,
  is_active = true,
  updated_at = now();

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
values (
  'pnw_structured_tribal_pack_fixture',
  null,
  'pnw-registry-pack-1.json',
  'structured_tribal_jurisdiction_pack',
  'structured_json_fixture',
  array['pack_metadata','state_jurisdictions','county_or_borough_jurisdictions','city_jurisdictions','tribal_jurisdiction_nodes','alaska_native_regional_corporations','recognition_status_records','language_records','service_capability_flags','jurisdiction_graph_edges','provenance_spans'],
  'planned',
  'Pacific Northwest structured JSON pack pnw-001: OR, ID, AK; 115 tribal jurisdictions total; Oregon 11, Idaho 6, Alaska 98; includes language, recognition, treaty, traditional territory, services, and Alaska Native regional corporations.'
)
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
where fp.fixture_key = 'pnw_structured_tribal_pack_fixture'
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'pack_metadata' then 1
  when 'state_jurisdictions' then 3
  when 'county_or_borough_jurisdictions' then 10
  when 'city_jurisdictions' then 2
  when 'tribal_jurisdiction_nodes' then 115
  when 'alaska_native_regional_corporations' then 13
  when 'recognition_status_records' then 115
  when 'language_records' then 115
  when 'service_capability_flags' then 115
  when 'jurisdiction_graph_edges' then 130
  when 'provenance_spans' then 115
  else minimum_expected_count
end,
expectation_source = 'json_pack_metrics_direct_inspection',
notes = 'Expectations tightened from pnw-registry-pack-1.json: 3 states, 4 OR counties + 2 ID counties + 4 AK boroughs, 2 cities, 115 tribal jurisdictions, 13 Alaska Native regional corporations, recognition/language/service records per tribal jurisdiction.'
where fixture_key = 'pnw_structured_tribal_pack_fixture';

commit;
