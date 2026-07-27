import { query_with_diagnostics } from "../db";

export type sunam_stream_registry_row = {
  stream_id: string;
  stream_name: string | null;
  enabled: boolean;
  auto_disabled: boolean;
  consecutive_failures: number;
  last_failure_at: number | null;
  last_run_status: string | null;
  disabled_reason: string | null;
};

export type sunam_stream_selection = {
  eligible: sunam_stream_registry_row[];
  excluded_auto_disabled: sunam_stream_registry_row[];
  excluded_disabled: sunam_stream_registry_row[];
  excluded_retired: sunam_stream_registry_row[];
};

function is_retired_stream(row: sunam_stream_registry_row): boolean {
  return row.last_run_status === "retired_superseded_by_atlas";
}

function sort_streams(
  rows: sunam_stream_registry_row[],
): sunam_stream_registry_row[] {
  return [...rows].sort((left, right) =>
    left.stream_id.localeCompare(right.stream_id),
  );
}

function create_empty_selection(): sunam_stream_selection {
  return {
    eligible: [],
    excluded_auto_disabled: [],
    excluded_disabled: [],
    excluded_retired: [],
  };
}

/**
 * Classifies the full registry for the explicit "Run All Streams" operator
 * action. Enabled is necessary but not sufficient: auto-disabled safety state
 * and explicit Atlas-superseded retirement remain authoritative.
 */
export function classify_sunam_run_all_streams(
  rows: sunam_stream_registry_row[],
): sunam_stream_selection {
  const selection = create_empty_selection();

  for (const row of sort_streams(rows)) {
    if (is_retired_stream(row)) {
      selection.excluded_retired.push(row);
    } else if (row.auto_disabled) {
      selection.excluded_auto_disabled.push(row);
    } else if (!row.enabled) {
      selection.excluded_disabled.push(row);
    } else {
      selection.eligible.push(row);
    }
  }

  return selection;
}

/**
 * Classifies retry candidates from the canonical stream registry rather than
 * the sparse historical ingest_runs table. The lookback applies to the
 * registry's latest observed failure timestamp and requires a positive current
 * consecutive-failure count.
 */
export function classify_sunam_retry_failed_streams(
  rows: sunam_stream_registry_row[],
  cutoff_ms: number,
): sunam_stream_selection {
  const recent_failures = rows.filter(
    (row) =>
      row.consecutive_failures > 0 &&
      row.last_failure_at !== null &&
      row.last_failure_at >= cutoff_ms,
  );

  return classify_sunam_run_all_streams(recent_failures);
}

export async function load_sunam_stream_registry(): Promise<
  sunam_stream_registry_row[]
> {
  const result = await query_with_diagnostics<sunam_stream_registry_row>(
    `select
       stream_id_dsr as stream_id,
       stream_name_dsr as stream_name,
       coalesce(enabled_dsr, false) as enabled,
       coalesce(auto_disabled_dsr, false) as auto_disabled,
       coalesce(consecutive_failures_dsr, 0) as consecutive_failures,
       last_failure_at_dsr as last_failure_at,
       last_run_status_dsr as last_run_status,
       disabled_reason_dsr as disabled_reason
     from public.data_stream_registry
     order by stream_id_dsr`,
    [],
    {
      label: "sunam_stream_registry_selection",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );

  return result.rows;
}

export async function get_sunam_run_all_selection(): Promise<
  sunam_stream_selection
> {
  return classify_sunam_run_all_streams(await load_sunam_stream_registry());
}

export async function get_sunam_retry_selection(
  hours_back: number,
  now_ms = Date.now(),
): Promise<sunam_stream_selection & { cutoff_ms: number; hours_back: number }> {
  const bounded_hours_back = Math.min(
    24 * 30,
    Math.max(1, Math.floor(Number(hours_back) || 24)),
  );
  const cutoff_ms = now_ms - bounded_hours_back * 3_600_000;
  const selection = classify_sunam_retry_failed_streams(
    await load_sunam_stream_registry(),
    cutoff_ms,
  );

  return { ...selection, cutoff_ms, hours_back: bounded_hours_back };
}

export function summarize_sunam_exclusions(selection: sunam_stream_selection) {
  return {
    auto_disabled: selection.excluded_auto_disabled.map((row) => ({
      stream_id: row.stream_id,
      reason: row.disabled_reason,
    })),
    disabled: selection.excluded_disabled.map((row) => ({
      stream_id: row.stream_id,
      reason: row.disabled_reason,
    })),
    retired: selection.excluded_retired.map((row) => ({
      stream_id: row.stream_id,
      status: row.last_run_status,
    })),
  };
}
