/** Explicit opt-in for ordinary source acquisition and exact current-result
 * consumption. Recovery cohorts remain a separate, mutually exclusive scope. */
export function legislative_current_source_scope(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const value = environment.LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED;
  if (value !== undefined && value !== "" && value !== "true" && value !== "false") {
    throw new Error("legislative_current_source_scope_invalid");
  }
  if (value !== "true") return false;
  if (environment.LEGISLATIVE_VERSION_QUEUE_RECOVERY_CONTRACT_SCOPE?.trim()) {
    throw new Error("legislative_current_source_scope_conflicts_with_recovery");
  }
  return true;
}
