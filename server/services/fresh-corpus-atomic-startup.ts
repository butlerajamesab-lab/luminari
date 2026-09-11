import { resume_fresh_atomic_corpus_pass_from_database } from "./fresh-corpus-atomic-v1";
import { background_feature_enabled } from "../runtime-role";

// A queued scoped pass must also run after startup, and a bounded yield must resume.
// This loop remains confined to the explicitly enabled background runtime.
function schedule_atomic_resume(delay_ms: number) {
  setTimeout(() => {
    void resume_fresh_atomic_corpus_pass_from_database({ batch_size: 3, max_batches: 60 })
      .then(result => {
        if (result.status !== "idle") console.log("[fresh_atomic_corpus] resume", result);
      })
      .catch(error => {
        console.error("[fresh_atomic_corpus] resume_failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      })
      .finally(() => schedule_atomic_resume(15_000));
  }, delay_ms).unref();
}

if (process.env.NODE_ENV === "production"
  && background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED")) {
  schedule_atomic_resume(30_000);
}
