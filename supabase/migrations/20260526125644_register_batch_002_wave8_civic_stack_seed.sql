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
  'civic_stack_seed_fixture',
  'Civic Stack Seed Fixture',
  'Structured JSONL seed batches spanning legal aid, advocacy, benefits, public resources, oversight, workflows, escalation, statutes, legislators, committees, and specialty civic-support systems.',
  array['batch_metadata','legal_aid_records','advocacy_records','benefit_records','public_resource_records','accountability_records','legislator_records','committee_records','statute_records','routing_records','oversight_records','workflow_records','escalation_records','bankruptcy_records','whistleblower_records','violence_prevention_records','civil_rights_records','voting_rights_records','media_rights_records','anti_trafficking_records','procurement_records','manifest_records','provenance_spans'],
  array['v_ui_benefits_navigator_programs','v_ui_legal_library_v1','v_unified_civic_infrastructure','v_ui_civic_map_v2','v_ui_intake_routing_v1'],
  'Register as cross-domain civic-stack seed material. Route each record class to its proper canonical table only after dedupe, schema mapping, and provenance checks.'
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
  'batch_002_wave8_civic_stack_seed_fixture',
  null,
  'batch_002 — WAVE 8 Legal Aid + Advocacy + Benefits Integration Layer',
  'civic_stack_seed_fixture',
  'cross_domain_seed_fixture',
  array['batch_metadata','legal_aid_records','advocacy_records','benefit_records','public_resource_records','accountability_records','legislator_records','committee_records','statute_records','routing_records','oversight_records','workflow_records','escalation_records','bankruptcy_records','whistleblower_records','violence_prevention_records','civil_rights_records','voting_rights_records','media_rights_records','anti_trafficking_records','procurement_records','manifest_records','provenance_spans'],
  'planned',
  'User-provided Wave 8 seed batch. Adds legal aid, advocacy, benefits, public resources, accountability, workflows, escalation, statutes, committees, legislators, bankruptcy, whistleblower, voting, media rights, anti-trafficking, procurement, and civil-rights support systems. Do not flatten into one table.'
)
on conflict (fixture_key) do update set
  document_name = excluded.document_name,
  family_key = excluded.family_key,
  fixture_role = excluded.fixture_role,
  expected_object_classes = excluded.expected_object_classes,
  status = excluded.status,
  notes = excluded.notes;

commit;
