from difflib import SequenceMatcher
from pathlib import Path

REMOTE = {
    '20260720191523': 'restore_docket_bill_detail_cache',
    '20260720220406': 'enable_rls_on_8_exposed_tables',
    '20260722235055': 'civic_genome_node_foundation',
    '20260722235229': 'seed_initial_civic_genome_domains',
    '20260724155642': 'civic_genome_operating_substrate',
    '20260724155704': 'rosetta_genome_assembly_activation',
    '20260725075541': 'omnidirectional_graph_hardening',
    '20260725075558': 'restore_public_api_grants_after_omnidirectional_migration',
    '20260725075638': 'omnidirectional_graph_runtime_functions',
    '20260727161445': 'admin_change_log_sequence_alignment',
    '20260727161504': 'governance_snapshots',
    '20260729022336': 'geocode_worker_cron_auth',
    '20260729110336': 'geocode_worker_request_timeout',
    '20260729110955': 'geocode_worker_cron_verifier_vault_source',
    '20260729111254': 'geocode_worker_cron_verifier_callable',
    '20260729111826': 'secure_geocode_worker_queue_rpcs',
    '20260729112008': 'secure_geocode_worker_queue_rpcs_hash_literal',
    '20260729112157': 'secure_geocode_worker_queue_rpcs_bigint_ids',
    '20260729112406': 'debug_geocode_candidate_probe',
    '20260729112801': 'geocode_worker_postgrest_debug_rpc',
    '20260729112815': 'geocode_worker_debug_role_rpc_receipt',
    '20260729112836': 'geocode_worker_debug_role_rpc_search_path',
    '20260729112908': 'geocode_worker_debug_endpoint_guard',
    '20260729113012': 'invoke_geocode_debug_once',
    '20260729113900': 'invoke_geocode_worker_once',
    '20260729114023': 'cleanup_geocode_worker_diagnostics',
    '20260729150409': 'atlas_stream_registry_recovery',
    '20260729150538': 'repair_usda_snap_atlas_upstream_provenance',
    '20260729151238': 'atlas_bridge_vault_config',
    '20260729154229': 'ingest_runs_sequence_alignment',
    '20260729164300': 'v3_13_state_directory_reassembly',
    '20260729165154': 'v3_13_state_directory_resource_promotion',
    '20260729165403': 'v3_13_state_directory_resource_category_correction',
    '20260729165812': 'v3_13_state_directory_security_hardening',
    '20260729165906': 'v3_13_state_directory_fk_indexes',
    '20260729171045': 'v3_13_state_directory_oversight_promotion_schema',
    '20260729171205': 'v3_13_state_directory_legal_promotion_schema',
    '20260729171421': 'v3_13_state_directory_workflow_promotion_schema',
    '20260729171644': 'v3_13_state_directory_profile_portability_schema',
    '20260729172411': 'v3_13_state_directory_remaining_resource_schema',
    '20260730093431': 'repair_world_index_runtime_contract',
    '20260731170603': 'optimize_civic_map_current_location_projection',
    '20260731181428': 'lighthouse_prism_verification_bridge',
    '20260731183944': 'civic_genome_rosetta_receipt_columns',
    '20260731185401': 'signal_architecture_ground_truth',
    '20260731192928': 'atlas_observation_identity_projection',
    '20260731193631': 'live_data_signal_registration_receipt',
    '20260731194411': 'notifications_runtime_contract',
    '20260731194541': 'notifications_service_policy_cleanup',
    '20260731195927': 'lighthouse_context_rpc_lockdown',
}

files = sorted(Path('supabase/migrations').glob('*.sql'))
local = []
for path in files:
    parts = path.stem.split('_', 1)
    local_name = parts[1] if len(parts) == 2 else path.stem
    local.append((path.name, local_name))

for version, name in REMOTE.items():
    exact = [filename for filename, local_name in local if local_name == name]
    contains = [filename for filename, local_name in local if name in local_name or local_name in name]
    scored = sorted(
        ((SequenceMatcher(None, name, local_name).ratio(), filename) for filename, local_name in local),
        reverse=True,
    )[:3]
    if exact:
        print(f'COUNTERPART={version}|{name}|EXACT|{"|".join(exact)}')
    elif contains:
        print(f'COUNTERPART={version}|{name}|CONTAINS|{"|".join(contains)}')
    else:
        print(f'COUNTERPART={version}|{name}|FUZZY|' + '|'.join(f'{score:.3f}:{filename}' for score, filename in scored))
