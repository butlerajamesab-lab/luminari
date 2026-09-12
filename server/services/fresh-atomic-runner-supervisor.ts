import { fork } from "node:child_process";
import { atomic_runner_receipt, type atomic_runner_configuration } from "./fresh-atomic-runner-contract";

/** A separate parent enforces wall time even if a parser blocks the child event loop. */
export async function supervise_atomic_runner(configuration: atomic_runner_configuration, child_file: string,
  environment: NodeJS.ProcessEnv = process.env, cancellation_signal?: AbortSignal) {
  const started_at_ms = Date.now();
  if (cancellation_signal?.aborted) return atomic_runner_receipt(configuration, { status: "stopped" }, 0);
  return new Promise<ReturnType<typeof atomic_runner_receipt>>(resolve => {
    const child = fork(child_file, ["--atomic-runner-child"], {
      env: environment, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let outcome: { status?: unknown; processed?: unknown; error_code?: unknown } = {
      status: "failed", error_code: "atomic_runner_child_failed",
    };
    let forced_status: string | undefined;
    let shutdown_timer: ReturnType<typeof setTimeout> | undefined;
    // Referenced child IPC and watchdog keep this one-shot process alive.
    const budget_timer = setTimeout(() => {
      forced_status = "time_budget_exhausted";
      child.kill("SIGKILL");
    }, configuration.max_duration_ms);
    const stop = () => {
      forced_status = "stopped";
      child.kill("SIGTERM");
      shutdown_timer ??= setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    cancellation_signal?.addEventListener("abort", stop, { once: true });
    child.on("message", message => {
      if (message && typeof message === "object" && !Array.isArray(message)) outcome = message;
    });
    child.on("error", () => { outcome = { status: "failed", error_code: "atomic_runner_child_failed" }; });
    child.once("close", code => {
      clearTimeout(budget_timer);
      if (shutdown_timer) clearTimeout(shutdown_timer);
      cancellation_signal?.removeEventListener("abort", stop);
      resolve(atomic_runner_receipt(configuration, forced_status ? { status: forced_status }
        : code === 0 ? outcome : { status: "failed", error_code: outcome.error_code }, Date.now() - started_at_ms));
    });
  });
}
