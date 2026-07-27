export type sunam_direct_instruction = {
  tool_name: string;
  args: Record<string, unknown>;
};

export type sunam_background_launch = {
  stream_id: string;
  status: "started";
  started_at: number;
};

type sunam_ingestion_result = {
  success?: boolean;
  recordsProcessed?: number;
  signalsGenerated?: number;
};

function normalize_instruction(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function bounded_integer(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

/**
 * Starts one canonical ingestion promise without tying its lifetime to the
 * Sovereign Control HTTP request. Completion remains observable through
 * ingest_runs and the structured runtime log emitted here.
 */
export function launch_sunam_background_ingestion(
  stream_id: string,
  task: () => Promise<sunam_ingestion_result>,
): sunam_background_launch {
  const started_at = Date.now();

  void Promise.resolve()
    .then(task)
    .then((result) => {
      console.warn("[SUNAM] background_ingestion_completed", {
        stream_id,
        success: result.success ?? true,
        records_processed: result.recordsProcessed ?? 0,
        signals_generated: result.signalsGenerated ?? 0,
        duration_ms: Date.now() - started_at,
      });
    })
    .catch((error) => {
      console.error("[SUNAM] background_ingestion_failed", {
        stream_id,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - started_at,
      });
    });

  return { stream_id, status: "started", started_at };
}

/**
 * Deterministic routing for Sovereign Control's standard operator commands.
 *
 * These instructions must not depend on LLM interpretation. They map directly
 * to the same governed tools exposed in Sunam's additive canonical registry,
 * which preserves both operational-control and Lighthouse case-service tools.
 * Only exact affirmative quick-action forms are eligible for direct execution;
 * questions, explanations, negations, and other free-form instructions must
 * continue through the governed interpretation loop.
 */
export function resolve_direct_sunam_instruction(
  instruction: string,
): sunam_direct_instruction | null {
  const normalized = normalize_instruction(instruction);

  const retry_match = normalized.match(
    /^find all failed streams from the last (\d+) hours? and retry them$/,
  );
  if (retry_match) {
    return {
      tool_name: "retry_failed_streams",
      args: {
        hours_back: bounded_integer(retry_match[1], 24, 1, 24 * 30),
      },
    };
  }

  if (
    normalized === "run ingestion for all enabled data streams" ||
    normalized === "run all enabled data streams" ||
    normalized === "run all streams"
  ) {
    return { tool_name: "run_all_streams", args: {} };
  }

  const execution_log_match = normalized.match(
    /^get the last (\d+) entries from the execution log$/,
  );
  if (execution_log_match) {
    return {
      tool_name: "get_execution_log",
      args: {
        limit: bounded_integer(execution_log_match[1], 20, 1, 100),
      },
    };
  }

  if (
    normalized ===
    "get diagnostics for all streams that have consecutive failures"
  ) {
    return { tool_name: "get_stream_diagnostics", args: {} };
  }

  if (normalized === "refresh all stream schedules from the registry") {
    return { tool_name: "refresh_scheduler", args: {} };
  }

  if (
    normalized ===
    "get the current system state: all engines, streams, failures, and scheduler status"
  ) {
    return { tool_name: "get_system_state", args: {} };
  }

  return null;
}

/**
 * PostgreSQL identifiers cannot be parameterized. Inspection therefore accepts
 * only one unqualified public-schema identifier and quotes it after validation.
 */
export function assert_safe_public_table_name(value: unknown): string {
  const table_name = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(table_name)) {
    throw new Error("table_name must be one unqualified PostgreSQL identifier");
  }
  return table_name;
}
