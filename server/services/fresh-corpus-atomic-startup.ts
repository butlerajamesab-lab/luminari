import { create_idle_backoff } from "../_core/idle-backoff";
import { resume_fresh_atomic_corpus_pass_from_database } from "./fresh-corpus-atomic-v1";
import { background_feature_enabled } from "../runtime-role";

// A queued scoped pass must also run after startup, and a bounded yield must resume.
// This loop remains confined to the explicitly enabled background runtime. Storage
// visibility is resolved per object by corpus-storage-download rather than frozen
// into startup policy.
const RESUME_INTERVAL_MS = 15_000;
const atomic_resume_backoff = create_idle_backoff("fresh_atomic_corpus_resume", RESUME_INTERVAL_MS);

function schedule_atomic_resume(delay_ms: number) {
  setTimeout(() => {
    if (!atomic_resume_backoff.should_run()) {
      schedule_atomic_resume(Math.min(RESUME_INTERVAL_MS, atomic_resume_backoff.ms_until_due()));
      return;
    }
    void resume_fresh_atomic_corpus_pass_from_database({ batch_size: 3, max_batches: 60 })
      .then(result => {
        atomic_resume_backoff.record(result.status !== "idle");
        if (result.status !== "idle") console.log("[fresh_atomic_corpus] resume", result);
      })
      .catch(error => {
        atomic_resume_backoff.record(false);
        console.error("[fresh_atomic_corpus] resume_failed", {
          error_class: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      })
      .finally(() => schedule_atomic_resume(RESUME_INTERVAL_MS));
  }, delay_ms).unref();
}

if (process.env.NODE_ENV === "production"
  && background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED")) {
  schedule_atomic_resume(30_000);
}
