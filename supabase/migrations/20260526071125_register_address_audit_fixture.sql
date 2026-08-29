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
  'address_audit_supplement',
  'Civic Map Address Audit Supplement',
  'Supplemental address-completion document providing geocodable organization records with organization, street address, city, state, ZIP, phone, and website across state registries.',
  array['audit_metadata','state_address_coverage','address_records','contact_points','geocodable_locations','resource_crosswalks','provenance_spans'],
  array['v_ui_civic_map_v2','v_ui_registry_quality_v1','v_luminari_resource_source_profile'],
  'Extract into resource locations, contact points, and crosswalks back to resource entities. This supplement enriches existing registry resources; it is not the source of legal/workflow truth.'
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
  'address_audit_10_state_fixture',
  null,
  'luminari-address-audit.docx',
  'address_audit_supplement',
  'address_enrichment_fixture',
  array['audit_metadata','state_address_coverage','address_records','contact_points','geocodable_locations','resource_crosswalks','provenance_spans'],
  'planned',
  'Civic Map Address Audit: 10 states; 190 organizations audited; full address, phone, and website coverage supplied for AZ, CA, FL, IL, MO, NY, OR, PA, TX, WA. Used to enrich CivicMap resource locations and contact surface.'
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
where fp.fixture_key = 'address_audit_10_state_fixture'
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

update public.luminari_fixture_expected_counts
set minimum_expected_count = case object_class
  when 'audit_metadata' then 1
  when 'state_address_coverage' then 10
  when 'address_records' then 190
  when 'contact_points' then 380
  when 'geocodable_locations' then 190
  when 'resource_crosswalks' then 190
  when 'provenance_spans' then 190
  else minimum_expected_count
end,
expectation_source = 'document_pages_1_2_summary_table',
notes = 'Expectations tightened from address audit summary: AZ 18, CA 20, FL 18, IL 20, MO 17, NY 20, OR 19, PA 18, TX 20, WA 20 = 190 address records; each includes phone and website.'
where fixture_key = 'address_audit_10_state_fixture';

commit;
