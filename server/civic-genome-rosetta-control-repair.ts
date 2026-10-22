/**
 * Historical V3 extraction control replay is retired.
 *
 * Do not run a corrupt-lineage extractor from a startup environment variable.
 * Canonical source-only handoff and the selected Rosetta runtime have separate
 * entry points; a safe replacement cannot be inferred from the legacy receipt.
 */
const CONTROL_REPAIR_ENV = "ROSETTA_CONTROL_REPAIR_SOURCE_BILL_ID";

export async function run_rosetta_control_repair_from_environment(): Promise<void> {
  const configured = process.env[CONTROL_REPAIR_ENV]?.trim();
  if (!configured) return;
  throw new Error("rosetta_legacy_control_repair_retired_use_current_runtime");
}
