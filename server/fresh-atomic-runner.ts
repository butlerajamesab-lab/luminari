import "dotenv/config";
import { fileURLToPath as file_url_to_path } from "node:url";
import { atomic_runner_error_code, atomic_runner_receipt, read_atomic_runner_configuration } from "./services/fresh-atomic-runner-contract";
import { supervise_atomic_runner } from "./services/fresh-atomic-runner-supervisor";

async function main() {
  // Configuration and grants are checked before loading any database consumer.
  const configuration = read_atomic_runner_configuration();
  const cancellation = new AbortController();
  const stop = () => cancellation.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (process.argv.includes("--atomic-runner-child")) {
      if (!process.send) throw new Error("atomic_runner_child_failed");
      const { getPool: get_pool } = await import("./db");
      const { resume_fresh_atomic_corpus_pass_from_database } = await import("./services/fresh-corpus-atomic-v1");
      const started_at_ms = Date.now();
      try {
        const result = await resume_fresh_atomic_corpus_pass_from_database({ ...configuration,
          cancellation_signal: cancellation.signal });
        process.send(atomic_runner_receipt(configuration, result, Date.now() - started_at_ms));
      } catch (error) {
        process.send(atomic_runner_receipt(configuration, {
          status: "failed", error_code: atomic_runner_error_code(error),
        }, Date.now() - started_at_ms));
      } finally {
        await get_pool().end();
        process.disconnect();
      }
      return;
    }
    const receipt = await supervise_atomic_runner(configuration, file_url_to_path(import.meta.url), process.env, cancellation.signal);
    console.log(JSON.stringify(receipt));
    process.exitCode = receipt.status === "completed" ? 0
      : receipt.status === "failed" || receipt.status === "completed_with_failures" ? 1 : 2;
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

void main().catch(error => {
  // Never print a database error, source filename, URL, credential, or stack trace.
  const failure = { contract: "bounded_atomic_runner_v1", status: "failed", error_code: atomic_runner_error_code(error) };
  if (process.send) {
    process.send(failure);
    process.disconnect();
  } else console.error(JSON.stringify(failure));
  process.exitCode = 1;
});
