export type sunam_direct_instruction = {
  tool_name: string;
  args: Record<string, unknown>;
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
 * Deterministic routing for Sovereign Control's standard operator commands.
 *
 * These instructions must not depend on LLM interpretation. They map directly
 * to the same governed tools exposed in Sunam's additive canonical registry,
 * which preserves both operational-control and Lighthouse case-service tools.
 * The phrases below intentionally match the six quick-action instructions
 * rendered by Sovereign Control; changing either side requires updating the
 * contract tests.
 */
export function resolve_direct_sunam_instruction(
  instruction: string,
): sunam_direct_instruction | null {
  const normalized = normalize_instruction(instruction);

  if (normalized.includes("failed streams") && normalized.includes("retry")) {
    const hours_match = normalized.match(/last\s+(\d+)\s+hours?/);
    return {
      tool_name: "retry_failed_streams",
      args: {
        hours_back: bounded_integer(hours_match?.[1], 24, 1, 24 * 30),
      },
    };
  }

  if (
    normalized.includes("run ingestion for all enabled data streams") ||
    normalized.includes("run all enabled data streams") ||
    normalized === "run all streams"
  ) {
    return { tool_name: "run_all_streams", args: {} };
  }

  if (normalized.includes("execution log")) {
    const limit_match = normalized.match(/last\s+(\d+)\s+(?:entries|items|records)/);
    return {
      tool_name: "get_execution_log",
      args: {
        limit: bounded_integer(limit_match?.[1], 20, 1, 100),
      },
    };
  }

  if (normalized.includes("diagnostic") && normalized.includes("stream")) {
    return { tool_name: "get_stream_diagnostics", args: {} };
  }

  if (
    normalized.includes("refresh") &&
    normalized.includes("stream") &&
    normalized.includes("schedule")
  ) {
    return { tool_name: "refresh_scheduler", args: {} };
  }

  if (
    normalized.includes("system state") ||
    (normalized.includes("engines") &&
      normalized.includes("streams") &&
      normalized.includes("scheduler"))
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
