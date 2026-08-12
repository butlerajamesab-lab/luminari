import { resumeAtomicSqlRecoveryFromDatabase } from "./fresh-corpus-atomic-sql-recovery-v1";

if (process.env.NODE_ENV === "production") {
  setTimeout(() => {
    void resumeAtomicSqlRecoveryFromDatabase()
      .then(result => {
        if ((result as any)?.status !== "idle") console.log("[FreshAtomicSqlRecovery] startup_resume", result);
      })
      .catch(error => {
        console.error("[FreshAtomicSqlRecovery] startup_resume_failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      });
  }, 45_000);
}
