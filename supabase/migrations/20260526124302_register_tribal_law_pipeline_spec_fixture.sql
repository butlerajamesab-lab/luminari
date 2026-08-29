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
  'pipeline_spec_fixture',
  'Pipeline Specification Fixture',
  'Domain pipeline specification documents defining intake categories, situation contexts, entity extraction needs, UI placement, and implementation requirements.',
  array['pipeline_metadata','domain_rationale','sub_pipeline_definitions','intake_contexts','cultural_safety_requirements','entity_type_requirements','welcome_page_integration','implementation_steps','reference_sources','provenance_spans'],
  array['v_ui_intake_routing_v1','v_ui_legal_library_v1','v_ui_registry_quality_v1'],
  'Register as pipeline governance/source specification. Do not activate routing until enum, frontend labels, backend prompt contexts, and tests are implemented.'
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
  'tribal_law_indigenous_rights_pipeline_spec_fixture',
  null,
  'Tribal Law / Indigenous Rights — Domain Brief & Pipeline Specification',
  'pipeline_spec_fixture',
  'pipeline_spec_fixture',
  array['pipeline_metadata','domain_rationale','sub_pipeline_definitions','intake_contexts','cultural_safety_requirements','entity_type_requirements','welcome_page_integration','implementation_steps','reference_sources','provenance_spans'],
  'planned',
  'Manus AI pipeline specification dated 2026-02-26. Defines Tribal Law / Indigenous Rights top-level category and seven sub-pipelines: ICWA, MMIW, treaty rights, land/trust, tribal enrollment, tribal housing, and sovereignty/jurisdiction.'
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
select
  'tribal_law_indigenous_rights_pipeline_spec_fixture',
  'pipeline_spec_fixture',
  x.object_class,
  case x.object_class
    when 'sub_pipeline_definitions' then 7
    when 'intake_contexts' then 7
    when 'reference_sources' then 4
    else 1
  end,
  'pipeline_spec_direct_input',
  'Expected counts from Tribal Law / Indigenous Rights pipeline specification.'
from unnest(array['pipeline_metadata','domain_rationale','sub_pipeline_definitions','intake_contexts','cultural_safety_requirements','entity_type_requirements','welcome_page_integration','implementation_steps','reference_sources','provenance_spans']) as x(object_class)
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

commit;
