begin;

-- Production had several of these relations before migration tracking became
-- complete. A clean replay must harden every relation that exists without
-- aborting on a historical object that is not yet represented in the ledger.
do $hardening$
declare
  relation_name text;
  policy_record record;
begin
  foreach relation_name in array array[
    'cases',
    'documents',
    'evidence_items',
    'claims',
    'findings',
    'snapshots',
    'pipeline_runs',
    'export_runs',
    'export_artifacts',
    'detected_signals',
    'intake_records',
    'source_records',
    'raw_api_record',
    'normalized_records',
    'ingested_records',
    'atlas_lighthouse_signal_bridge_v1',
    'atlas_lighthouse_resource_bridge_v1',
    'atlas_lighthouse_judicial_signal_bridge_v1',
    'atlas_lighthouse_legal_bridge_v1',
    'machine_outputs',
    'machine_verification_requirements',
    'metadata_machines',
    'legal_statutes',
    'legal_case_law',
    'api_source_registry',
    'normalized_civic_resource'
  ]
  loop
    if to_regclass(format('%I.%I', 'public', relation_name)) is not null then
      execute format(
        'alter table %I.%I enable row level security',
        'public',
        relation_name
      );
    end if;
  end loop;

  for policy_record in
    select *
    from (
      values
        ('atlas_lighthouse_signal_bridge_v1', 'atlas_signal_bridge_public_read', 'anon, authenticated'),
        ('atlas_lighthouse_resource_bridge_v1', 'atlas_resource_bridge_public_read', 'anon, authenticated'),
        ('atlas_lighthouse_judicial_signal_bridge_v1', 'atlas_judicial_bridge_public_read', 'anon, authenticated'),
        ('atlas_lighthouse_legal_bridge_v1', 'atlas_legal_bridge_public_read', 'anon, authenticated'),
        ('legal_statutes', 'legal_statutes_public_read', 'anon, authenticated'),
        ('legal_case_law', 'legal_case_law_public_read', 'anon, authenticated'),
        ('metadata_machines', 'metadata_machines_public_read', 'anon, authenticated'),
        ('machine_outputs', 'machine_outputs_public_read', 'anon, authenticated'),
        ('machine_verification_requirements', 'machine_verification_requirements_public_read', 'anon, authenticated'),
        ('normalized_civic_resource', 'civic_resources_public_read', 'anon, authenticated'),
        ('api_source_registry', 'api_source_registry_public_read', 'anon, authenticated'),
        ('detected_signals', 'detected_signals_authenticated_read', 'authenticated'),
        ('cases', 'cases_authenticated_read', 'authenticated'),
        ('claims', 'claims_authenticated_read', 'authenticated'),
        ('findings', 'findings_authenticated_read', 'authenticated'),
        ('snapshots', 'snapshots_authenticated_read', 'authenticated'),
        ('pipeline_runs', 'pipeline_runs_authenticated_read', 'authenticated')
    ) as policy_config(relation_name, policy_name, role_clause)
  loop
    if to_regclass(
      format('%I.%I', 'public', policy_record.relation_name)
    ) is not null then
      execute format(
        'drop policy if exists %I on %I.%I',
        policy_record.policy_name,
        'public',
        policy_record.relation_name
      );
      execute format(
        'create policy %I on %I.%I for select to %s using (true)',
        policy_record.policy_name,
        'public',
        policy_record.relation_name,
        policy_record.role_clause
      );
    end if;
  end loop;
end
$hardening$;

commit;
