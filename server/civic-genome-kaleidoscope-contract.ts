import type { civic_genome_operating_contract } from "./civic-genome-operating-contracts";

const DEFAULT_KALEIDOSCOPE_STATUS_URL =
  "https://kaleidoscope-zm5d.onrender.com/v1/status";
const KALEIDOSCOPE_STATUS_TIMEOUT_MS = 10_000;

type json_record = Record<string, unknown>;

type kaleidoscope_status = {
  platform: "kaleidoscope";
  foundation_version: string;
  runtime_revision: string;
  civic_genome_handoff_state: string;
  civic_genome_durable_intake_state: string;
  civic_genome_durable_binding_count: number;
  civic_genome_durable_snapshot_count: number;
  civic_genome_durable_component_count: number;
  civic_genome_projection_run_count: number;
  civic_genome_projection_result_count: number;
  civic_genome_replay_receipt_count: number;
};

function as_record(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as json_record
    : null;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`kaleidoscope_status_${label}_invalid`);
  }
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`kaleidoscope_status_${label}_invalid`);
  }
  return value;
}

function status_url(): URL {
  const url = new URL(
    process.env.KALEIDOSCOPE_STATUS_URL?.trim()
      || DEFAULT_KALEIDOSCOPE_STATUS_URL,
  );
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/v1/status"
  ) {
    throw new Error("invalid_kaleidoscope_status_url");
  }
  return url;
}

function parse_kaleidoscope_status(value: unknown): kaleidoscope_status {
  const row = as_record(value);
  if (!row || row.platform !== "kaleidoscope") {
    throw new Error("kaleidoscope_status_contract_invalid");
  }
  return {
    platform: "kaleidoscope",
    foundation_version: text(row.foundation_version, "foundation_version"),
    runtime_revision: text(row.runtime_revision, "runtime_revision"),
    civic_genome_handoff_state: text(
      row.civic_genome_handoff_state,
      "civic_genome_handoff_state",
    ),
    civic_genome_durable_intake_state: text(
      row.civic_genome_durable_intake_state,
      "civic_genome_durable_intake_state",
    ),
    civic_genome_durable_binding_count: count(
      row.civic_genome_durable_binding_count,
      "durable_binding_count",
    ),
    civic_genome_durable_snapshot_count: count(
      row.civic_genome_durable_snapshot_count,
      "durable_snapshot_count",
    ),
    civic_genome_durable_component_count: count(
      row.civic_genome_durable_component_count,
      "durable_component_count",
    ),
    civic_genome_projection_run_count: count(
      row.civic_genome_projection_run_count,
      "projection_run_count",
    ),
    civic_genome_projection_result_count: count(
      row.civic_genome_projection_result_count,
      "projection_result_count",
    ),
    civic_genome_replay_receipt_count: count(
      row.civic_genome_replay_receipt_count,
      "replay_receipt_count",
    ),
  };
}

export function build_kaleidoscope_civic_genome_contract(
  status: kaleidoscope_status,
): civic_genome_operating_contract {
  const bindings = status.civic_genome_durable_binding_count;
  const snapshots = status.civic_genome_durable_snapshot_count;
  const components = status.civic_genome_durable_component_count;
  const runs = status.civic_genome_projection_run_count;
  const results = status.civic_genome_projection_result_count;
  const replay_receipts = status.civic_genome_replay_receipt_count;

  const state = results > 0
    ? "operational"
    : runs > 0
      ? "waiting"
      : bindings > 0 && snapshots > 0
        ? "bound_not_projected"
        : bindings > 0
          ? "available_unbound"
          : "ready_empty";

  const state_label = state === "operational"
    ? "Projection results available"
    : state === "waiting"
      ? "Projection run recorded, result pending"
      : state === "bound_not_projected"
        ? "Source bound, projection not executed"
        : state === "available_unbound"
          ? "Binding observed, durable snapshot incomplete"
          : "No durable Civic Genome bindings";

  const detail = state === "bound_not_projected"
    ? `${bindings} durable Civic Genome source bindings and ${snapshots} state snapshots contain ${components} components; no Civic Genome projection run or projection result has executed.`
    : state === "operational"
      ? `${bindings} durable bindings, ${snapshots} snapshots, ${runs} projection runs, ${results} projection results, and ${replay_receipts} replay receipts are reported by Kaleidoscope.`
      : state === "waiting"
        ? `${runs} Civic Genome projection run(s) are recorded, but no projection result is reported.`
        : state === "available_unbound"
          ? `${bindings} durable source binding(s) are reported, but a corresponding durable snapshot is not established.`
          : "Kaleidoscope reports no durable Civic Genome source bindings.";

  return {
    service_key: "kaleidoscope",
    display_name: "Kaleidoscope",
    external_url: null,
    role: "Authenticated immutable baseline consumer",
    state,
    state_label,
    detail,
    observed_count: snapshots,
    bound_count: bindings,
    last_observed_at: null,
    boundary:
      "Kaleidoscope owns state-response projection. A persisted Civic Genome binding or snapshot does not imply that a projection ran; projection runs and results are reported separately.",
  };
}

function unavailable_kaleidoscope_contract(detail: string): civic_genome_operating_contract {
  return {
    service_key: "kaleidoscope",
    display_name: "Kaleidoscope",
    external_url: null,
    role: "Authenticated immutable baseline consumer",
    state: "unavailable",
    state_label: "Live Kaleidoscope status unavailable",
    detail,
    observed_count: 0,
    bound_count: 0,
    last_observed_at: null,
    boundary:
      "Kaleidoscope owns state-response projection. Lighthouse does not infer binding or projection state when the live status contract cannot be read.",
  };
}

export async function get_kaleidoscope_civic_genome_contract(): Promise<civic_genome_operating_contract> {
  let url: URL;
  try {
    url = status_url();
  } catch (error) {
    return unavailable_kaleidoscope_contract(
      error instanceof Error ? error.message : "invalid_kaleidoscope_status_url",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KALEIDOSCOPE_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      return unavailable_kaleidoscope_contract(
        `Kaleidoscope status returned HTTP ${response.status}.`,
      );
    }
    const status = parse_kaleidoscope_status(await response.json());
    return build_kaleidoscope_civic_genome_contract(status);
  } catch (error) {
    return unavailable_kaleidoscope_contract(
      controller.signal.aborted
        ? "Kaleidoscope status read timed out."
        : error instanceof Error
          ? error.message
          : "Kaleidoscope status read failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
