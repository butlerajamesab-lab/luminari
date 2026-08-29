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
  'archive_bundle_fixture',
  'Archive Bundle Fixture',
  'ZIP/archive-level source bundle containing multiple Luminari artifacts that must be manifested, classified, deduplicated, and routed by file family before import.',
  array['archive_metadata','file_manifest','file_family_classification','source_lineage_records','duplicate_groups','import_policy_records','provenance_spans'],
  array['v_ui_registry_quality_v1'],
  'Register archive bundles as containers only. Do not canonical-import files until each child artifact is classified and deduplicated.'
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
values
(
  'luminari_all_registries_clean_docx_archive_fixture',
  null,
  'luminari-all-registries.zip',
  'archive_bundle_fixture',
  'archive_bundle_fixture',
  array['archive_metadata','file_manifest','file_family_classification','source_lineage_records','duplicate_groups','import_policy_records','provenance_spans'],
  'planned',
  'Clean all-DOCX baseline registry archive. User-confirmed same primary Luminari output lineage. Treat as high-priority baseline registry pack pending per-file manifest and validation.'
),
(
  'luminari_all_registries_mixed_project_archive_fixture',
  null,
  'luminari-all-registries (1).zip',
  'archive_bundle_fixture',
  'archive_bundle_fixture',
  array['archive_metadata','file_manifest','file_family_classification','source_lineage_records','duplicate_groups','import_policy_records','provenance_spans'],
  'planned',
  'Legitimate Luminari project archive assembled intentionally by user. Mixed structure but valid source material. Classify per file by artifact family before any canonical import.'
)
on conflict (fixture_key) do update set
  document_name = excluded.document_name,
  family_key = excluded.family_key,
  fixture_role = excluded.fixture_role,
  expected_object_classes = excluded.expected_object_classes,
  status = excluded.status,
  notes = excluded.notes;

insert into public.luminari_fixture_expected_counts (
  fixture_key,
  family_key,
  object_class,
  minimum_expected_count,
  expectation_source,
  notes
)
select fp.fixture_key, fp.family_key, x.object_class, 1, 'archive_fixture_contract', 'Archive bundle expected object class seeded from archive contract.'
from public.luminari_registry_fixture_plan fp
cross join lateral unnest(fp.expected_object_classes) as x(object_class)
where fp.fixture_key in (
  'luminari_all_registries_clean_docx_archive_fixture',
  'luminari_all_registries_mixed_project_archive_fixture'
)
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

commit;
