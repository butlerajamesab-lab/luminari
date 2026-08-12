import "dotenv/config";
import { runAtomicSqlRecoveryStartupOnce } from "../services/fresh-corpus-atomic-sql-recovery-startup";

async function main() {
  if (process.env.ATOMIC_SQL_RECOVERY_EXECUTION_MODE !== "isolated_worker") {
    throw new Error("atomic_sql_recovery_requires_isolated_worker_mode");
  }

  const result = await runAtomicSqlRecoveryStartupOnce();
  console.log("[FreshAtomicSqlRecoveryWorker] result", result);
}

main().catch(error => {
  console.error("[FreshAtomicSqlRecoveryWorker] failed", {
    error_class: error instanceof Error ? error.name : "unknown",
    error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
  });
  process.exitCode = 1;
});
