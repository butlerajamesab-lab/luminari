// Signal hygiene for the queue DB circuit breaker (queue-db-diagnostics.ts).
//
// When a guarded queue claim times out, the diagnostics layer opens an
// in-process circuit and pauses claims for a jittered backoff. While the
// circuit is open, every worker poll throws the synthetic circuit-open error
// (a DbTimeoutDiagnosticError whose detail is QUEUE_CIRCUIT_OPEN_DETAIL and
// whose timeout_ms carries the remaining pause). The opening itself is
// already logged once by the diagnostics layer ("queue_query_circuit_opened"),
// so a worker that logs every poll as a cycle failure buries that signal
// under a failure line every few seconds for the whole pause.
//
// Workers use queue_circuit_open_remaining_ms to recognize the synthetic
// error and a circuit_open_log_gate to log a single "cycle_waiting" line per
// opening instead of a "cycle_failed" line per poll. This module is
// deliberately dependency-free (the error is recognized by its shape, not by
// instanceof) so importing it can never disturb worker module graphs or test
// mocks.

export const QUEUE_CIRCUIT_OPEN_DETAIL = "queue_query_circuit_open";

export function queue_circuit_open_remaining_ms(error: unknown): number | null {
  if (error === null || typeof error !== "object") return null;
  const candidate = error as {
    name?: unknown;
    detail?: unknown;
    timeout_ms?: unknown;
  };
  if (candidate.name !== "DbTimeoutDiagnosticError") return null;
  if (candidate.detail !== QUEUE_CIRCUIT_OPEN_DETAIL) return null;
  if (typeof candidate.timeout_ms !== "number") return null;
  return candidate.timeout_ms;
}

export class circuit_open_log_gate {
  private logged_until_ms = 0;

  // True exactly once per circuit opening: the first poll of an opening logs,
  // later polls stay silent until the opening's remaining window has passed.
  should_log(now_ms: number, remaining_ms: number): boolean {
    if (now_ms < this.logged_until_ms) return false;
    this.logged_until_ms = now_ms + Math.max(0, remaining_ms);
    return true;
  }

  // Call after a successful claim: the circuit is closed, so the next opening
  // is a new episode and must log even if it starts inside the old window.
  reset(): void {
    this.logged_until_ms = 0;
  }
}
