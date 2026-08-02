from pathlib import Path

LEGACY_FILENAMES = {
    '20260521_crosswalk_enrichment_trigger.sql',
    '20260522_crosswalk_security_and_recursion_fix.sql',
    '20260528_120000_atlas_lighthouse_bridge_reconcile.sql',
    '20260528_runtime_hotfix_sync.sql',
    '20260607_nationwide_jurisdiction_substrate.sql',
    '20260612_corpus_import_queue_worker_contract.sql',
    '20260613_contacts_registry_jsonb_backfill.sql',
    '20260613_contacts_schema.sql',
    '202606140001_create_docket_bill_state_cache.sql',
    '20260614_admin_change_log_timestamp_acl_timestamptz.sql',
    '202606220001_users_auth_lookup_indexes.sql',
    '202606260001_living_civic_genome_substrate.sql',
    '202607030001_harden_civic_genome_event_integrity.sql',
    '202607050001_execute_sql_substrate_handoff.sql',
    '202607130001_v3_13_reconciliation_control.sql',
    '202607130002_stage_disability_deep_dive_v3_13.sql',
    '202607130003_load_disability_statute_candidates_v3_13.sql',
    '202607130004_classify_disability_statute_candidates_v3_13.sql',
    '202607130005_load_disability_resource_candidates_batch_1.sql',
    '202607130006_load_disability_resource_candidates_batch_2.sql',
    '202607130007_load_disability_resource_candidates_batch_3.sql',
    '202607130008_load_disability_resource_candidates_batch_4.sql',
    '202607130009_load_disability_resource_candidates_batch_5.sql',
    '202607130010_create_corpus_artifact_manifest.sql',
    '202607130011_reconcile_generated_sql_source_manifest.sql',
    '202607130012_record_direct_sql_parse_audit.sql',
    '2026071300135_allow_state_directory_candidate_kind.sql',
    '202607130013_create_substrate_promotion_readiness.sql',
    '202607130014_stage_disability_jurisdictions.sql',
    '202607130015_finalize_disability_jurisdiction_stage_shape.sql',
    '202607140001_promote_disability_national_resources.sql',
    '202607170001_sql_handoff_pending_compatibility.sql',
    '20260731_math_engine_v2_tables.sql',
}

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', 'coverage'}
SELF = Path(__file__).resolve()
ARCHIVE_ROOT = Path('supabase/migration_sources/legacy_unversioned').resolve()
violations: list[tuple[str, str]] = []

for path in Path('.').rglob('*'):
    if not path.is_file():
        continue
    resolved = path.resolve()
    if resolved == SELF or ARCHIVE_ROOT in resolved.parents:
        continue
    if any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    for filename in LEGACY_FILENAMES:
        executable_path = f'supabase/migrations/{filename}'
        if executable_path in text or f'../migrations/{filename}' in text or f'../../migrations/{filename}' in text or f'../../../supabase/migrations/{filename}' in text:
            violations.append((path.as_posix(), filename))

print(f'LEGACY_MIGRATION_REFERENCE_COUNT={len(violations)}')
for path, filename in violations:
    print(f'LEGACY_MIGRATION_REFERENCE={path}|{filename}')

if violations:
    raise SystemExit(1)

print('LEGACY_MIGRATION_REFERENCE_CONTRACT=PASS')
