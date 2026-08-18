import { createHash } from "node:crypto";

import {
  DbTimeoutDiagnosticError,
  classify_db_error,
  connect_with_pool_timeout,
  query_with_diagnostics as legacy_query_with_diagnostics,
} from "./db-legacy";

type query_diagnostics_options = {
  label?: string;
  pool_acquire_timeout_ms?: number;
  query_timeout_ms?: number;
};

type queue_circuit_state = {
  consecutive_timeouts: number;
  next_attempt_at_ms: number;
};

const queue_circuit = new Map<string, queue_circuit_state>();
const QUEUE_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000] as const;

function normalize_error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queue_managed_label(label: string): boolean {
  return [
    "rosetta_generation_activation_",
    "rosetta_generation_upgrade_",
    "prism_rosetta_queue_",
    "legislative_version_queue_",
    "legislative_version_record_failure",
    "docket_bill_activation_",
  ].some(prefix => label.startsWith(prefix));
}

/**
 * Circuit breaking is intentionally limited to cycle-level claim/reconcile work.
 * Completion/failure writes still receive PostgreSQL statement_timeout protection,
 * but never receive a synthetic circuit-open error inside a successfully processed
 * job. This prevents a DB backoff from being misclassified as a pipeline failure.
 */
function circuit_guarded_label(label: string): boolean {
  return queue_managed_label(label)
    && (label.endsWith("_claim") || label.endsWith("_reconcile_completed"));
}

function jittered_backoff_ms(label: string, failure_number: number): number {
  const index = Math.max(0, Math.min(QUEUE_BACKOFF_MS.length - 1, failure_number - 1));
  const base = QUEUE_BACKOFF_MS[index];
  const digest = createHash("sha256")
    .update(`${label}:${failure_number}:${process.pid}`)
    .digest();
  const unit = digest.readUInt16BE(0) / 65_535;
  return Math.round(base * (0.8 + (unit * 0.4)));
}

function assert_circuit_closed(label: string): void {
  const state = queue_circuit.get(label);
  if (!state) return;
  const remaining_ms = state.next_attempt_at_ms - Date.now();
  if (remaining_ms <= 0) return;
  throw new DbTimeoutDiagnosticError(
    "query_timeout",
    `${label} queue circuit open for ${remaining_ms}ms`,
    remaining_ms,
    "queue_query_circuit_open",
  );
}

function record_timeout(label: string, failure_class: "pool_acquire_timeout" | "query_timeout"): void {
  const prior = queue_circuit.get(label)?.consecutive_timeouts ?? 0;
  const consecutive_timeouts = prior + 1;
  const retry_delay_ms = jittered_backoff_ms(label, consecutive_timeouts);
  queue_circuit.set(label, {
    consecutive_timeouts,
    next_attempt_at_ms: Date.now() + retry_delay_ms,
  });
  console.error("[DB] queue_query_circuit_opened", {
    label,
    failure_class,
    consecutive_timeouts,
    retry_delay_ms,
  });
}

function clear_timeout_state(label: string): void {
  if (queue_circuit.delete(label)) {
    console.log("[DB] queue_query_circuit_closed", { label });
  }
}

function server_statement_timeout_ms(client_timeout_ms: number): number {
  const margin_ms = Math.min(1_000, Math.max(250, Math.floor(client_timeout_ms * 0.1)));
  return Math.max(250, client_timeout_ms - margin_ms);
}

export async function query_with_diagnostics<T = any>(
  text: string,
  values: unknown[] = [],
  options: query_diagnostics_options = {},
): Promise<{ rows: T[]; rowCount: number | null }> {
  const label = options.label ?? "db_query";
  if (!queue_managed_label(label)) {
    return legacy_query_with_diagnostics<T>(text, values, options);
  }

  const circuit_guarded = circuit_guarded_label(label);
  if (circuit_guarded) assert_circuit_closed(label);

  const pool_acquire_timeout_ms = options.pool_acquire_timeout_ms ?? 1_000;
  const query_timeout_ms = options.query_timeout_ms ?? 10_000;
  const statement_timeout_ms = server_statement_timeout_ms(query_timeout_ms);

  let client: any;
  try {
    client = await connect_with_pool_timeout(pool_acquire_timeout_ms, label);
  } catch (error) {
    if (circuit_guarded && classify_db_error(error) === "pool_acquire_timeout") {
      record_timeout(label, "pool_acquire_timeout");
    }
    throw error;
  }

  let release_error: Error | boolean | undefined;
  let transaction_started = false;
  let query_started_at = 0;

  try {
    await client.query({ text: "begin", query_timeout: Math.min(2_000, query_timeout_ms) });
    transaction_started = true;
    await client.query({
      text: "select set_config('statement_timeout', $1, true)",
      values: [`${statement_timeout_ms}ms`],
      query_timeout: Math.min(2_000, query_timeout_ms),
    });

    query_started_at = Date.now();
    const result = await client.query({
      text,
      values,
      query_timeout: query_timeout_ms,
    });

    await client.query({ text: "commit", query_timeout: Math.min(2_000, query_timeout_ms) });
    transaction_started = false;
    if (circuit_guarded) clear_timeout_state(label);
    console.warn("[DB] query_diagnostics", {
      label,
      query_execution_time_ms: Date.now() - query_started_at,
      query_timeout_ms,
      server_statement_timeout_ms: statement_timeout_ms,
      row_count: result.rowCount,
    });
    return result;
  } catch (error) {
    if (query_started_at > 0) {
      console.warn("[DB] query_diagnostics", {
        label,
        query_execution_time_ms: Date.now() - query_started_at,
        query_timeout_ms,
        server_statement_timeout_ms: statement_timeout_ms,
        status: "failed",
        error: normalize_error_message(error),
      });
    }

    if (transaction_started) {
      try {
        await client.query({ text: "rollback", query_timeout: 2_000 });
        transaction_started = false;
      } catch (rollback_error) {
        release_error = rollback_error instanceof Error ? rollback_error : true;
        console.error("[DB] queue_query_rollback_failed", {
          label,
          error: normalize_error_message(rollback_error),
        });
      }
    }

    const failure_class = classify_db_error(error);
    if (failure_class === "query_timeout") {
      if (circuit_guarded) record_timeout(label, "query_timeout");
      throw new DbTimeoutDiagnosticError(
        "query_timeout",
        `${label} query timed out after ${query_timeout_ms}ms`,
        query_timeout_ms,
        normalize_error_message(error),
      );
    }
    if (failure_class === "pool_acquire_timeout") {
      if (circuit_guarded) record_timeout(label, "pool_acquire_timeout");
      throw error;
    }
    throw error;
  } finally {
    client.release(release_error as any);
  }
}
