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
  'ingest_adapter_code_fixture',
  'Ingest Adapter Code Fixture',
  'Runtime connector/adaptor source code used to fetch, normalize, deduplicate, and write external records into Luminari raw and canonical tables.',
  array['adapter_metadata','api_client_factory','fetch_functions','normalizer_functions','raw_record_write_path','canonical_upsert_path','ingest_job_lifecycle','base_adapter_wrapper','target_table_contract','conflict_key_contract','secret_requirements','error_handling_paths','provenance_spans'],
  array['v_ui_registry_quality_v1','luminari_extraction_completeness_reports','luminari_extraction_validation_failures'],
  'Extract as runtime ingestion contract metadata. Validate declared source system, target table, raw table, conflict key, required secrets, normalizer shape, and job lifecycle before running production ingest.'
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
  'courtlistener_adapter_code_fixture',
  null,
  'courtListenerAdapter.ts + courtListenerBaseAdapter.ts',
  'ingest_adapter_code_fixture',
  'runtime_ingest_adapter_fixture',
  array['adapter_metadata','api_client_factory','fetch_functions','normalizer_functions','raw_record_write_path','canonical_upsert_path','ingest_job_lifecycle','base_adapter_wrapper','target_table_contract','conflict_key_contract','secret_requirements','error_handling_paths','provenance_spans'],
  'planned',
  'CourtListener adapter fixture: fetches opinions/clusters from CourtListener REST API v3, normalizes opinions into case_law, writes raw_records for deduplication, and wraps as BaseAdapter targeting case_law.'
)
on conflict (fixture_key) do update set
  document_name = excluded.document_name,
  family_key = excluded.family_key,
  fixture_role = excluded.fixture_role,
  expected_object_classes = excluded.expected_object_classes,
  status = excluded.status,
  notes = excluded.notes;

insert into public.luminari_fixture_expected_counts (fixture_key, family_key, object_class, minimum_expected_count, expectation_source, notes)
select fp.fixture_key, fp.family_key, expected.object_class, 1, 'adapter_source_code_inspection', 'Auto-seeded from CourtListener adapter source contract.'
from public.luminari_registry_fixture_plan fp
cross join lateral unnest(fp.expected_object_classes) as expected(object_class)
where fp.fixture_key = 'courtlistener_adapter_code_fixture'
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

commit;
