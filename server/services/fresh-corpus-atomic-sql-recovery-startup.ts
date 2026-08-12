import { resumeAtomicSqlRecoveryFromDatabase } from "./fresh-corpus-atomic-sql-recovery-v1";

/**
 * Explicit recovery entrypoint only.
 *
 * This module is imported by the Lighthouse web bundle for source compatibility,
 * but it intentionally has no module-load side effect. The 19MB SQL recovery
 * previously ran 45 seconds after web startup and could abort/restart the serving
 * process. Recovery must now be invoked by an isolated worker process.
 */
export async function runAtomicSqlRecoveryStartupOnce() {
  if (process.env.ATOMIC_SQL_RECOVERY_EXECUTION_MODE !== "isolated_worker") {
    return { status: "disabled", execution_mode: process.env.ATOMIC_SQL_RECOVERY_EXECUTION_MODE ?? null };
  }

  return resumeAtomicSqlRecoveryFromDatabase();
}
