import { resumeFreshAtomicCorpusPassFromDatabase } from "./fresh-corpus-atomic-v1";
import { background_feature_enabled } from "../runtime-role";

if (
  process.env.NODE_ENV === "production"
  && background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED")
) {
  setTimeout(() => {
    void resumeFreshAtomicCorpusPassFromDatabase({ batchSize: 3, maxBatches: 60 })
      .then(result => {
        if ((result as any)?.status !== "idle") console.log("[FreshAtomicCorpus] startup_resume", result);
      })
      .catch(error => {
        console.error("[FreshAtomicCorpus] startup_resume_failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      });
  }, 30_000);
}
