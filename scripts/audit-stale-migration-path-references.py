from __future__ import annotations

from pathlib import Path

STALE_FILENAMES = {
    "20260528223000_create_civicmap_map_rpc_contracts.sql",
    "202606220001_create_docket_bill_detail_cache.sql",
    "202607220001_civic_genome_node_foundation.sql",
    "202607220002_seed_initial_civic_genome_domains.sql",
    "20260722160000_civic_genome_operating_substrate.sql",
    "202607230002_rosetta_genome_assembly_activation.sql",
    "202607250001_omnidirectional_graph_hardening.sql",
    "20260727120400_admin_change_log_sequence_alignment.sql",
    "20260727120500_governance_snapshots.sql",
    "20260729022000_geocode_worker_cron_auth.sql",
    "20260729105500_geocode_worker_request_timeout.sql",
    "20260729143000_atlas_stream_registry_recovery.sql",
    "20260729151500_atlas_bridge_vault_config.sql",
    "20260729154500_ingest_runs_sequence_alignment.sql",
    "20260729162000_v3_13_state_directory_reassembly.sql",
    "20260729163000_v3_13_state_directory_resource_promotion.sql",
    "20260729164000_v3_13_state_directory_resource_category_correction.sql",
    "20260729165000_v3_13_state_directory_security_hardening.sql",
    "20260729165500_v3_13_state_directory_fk_indexes.sql",
    "20260729170000_v3_13_state_directory_oversight_promotion.sql",
    "20260729171000_v3_13_state_directory_legal_promotion.sql",
    "20260729172000_v3_13_state_directory_workflow_promotion.sql",
    "20260729173000_v3_13_state_directory_profile_portability.sql",
    "20260729174000_v3_13_state_directory_organization_resources.sql",
    "20260729175000_v3_13_state_directory_field_resources.sql",
    "20260731113500_lighthouse_prism_verification_bridge.sql",
    "20260731184500_civic_genome_rosetta_receipt_columns.sql",
    "20260731190500_signal_architecture_ground_truth.sql",
    "20260731194000_atlas_observation_identity_projection.sql",
    "20260731195000_notifications_runtime_contract.sql",
    "20260731195100_notifications_service_policy_cleanup.sql",
    "20260731195500_live_data_signal_registration_receipt.sql",
    "20260731195800_lighthouse_context_rpc_lockdown.sql",
}

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".next", "coverage"}
SELF = Path(__file__).resolve()
violations: list[tuple[str, str]] = []

for path in Path(".").rglob("*"):
    if not path.is_file():
        continue
    if path.resolve() == SELF:
        continue
    if any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for filename in STALE_FILENAMES:
        if filename in text:
            violations.append((path.as_posix(), filename))

print(f"STALE_REFERENCE_COUNT={len(violations)}")
for path, filename in violations:
    print(f"STALE_REFERENCE={path}|{filename}")

if violations:
    raise SystemExit(1)

print("STALE_MIGRATION_REFERENCE_CONTRACT=PASS")
