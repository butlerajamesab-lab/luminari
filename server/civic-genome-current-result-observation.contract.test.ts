import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  join(process.cwd(), "server", "civic-genome-legislative-version-queue-worker.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "server", "prism-rosetta-worker.ts"),
  "utf8",
);
const reconciler = readFileSync(
  join(process.cwd(), "server", "civic-genome-current-result-reconciliation.ts"),
  "utf8",
);
const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260918152000_civic_genome_current_result_arrival_reconciliation.sql",
  ),
  "utf8",
);

describe("current-result observation lane contract", () => {
  it("runs independently of the ordinary legislative queue cycle", () => {
    const ordinary_start = worker.indexOf(
      "export async function run_legislative_version_queue_cycle",
    );
    const ordinary_end = worker.indexOf(
      "function schedule_legislative_version_queue_cycle",
      ordinary_start,
    );
    const ordinary = worker.slice(ordinary_start, ordinary_end);
    expect(ordinary).not.toContain("reconcile_awaiting_current_results");

    expect(worker).toContain("function schedule_current_result_observation");
    expect(worker).toContain("current_result_observation_timer = setInterval");
    expect(worker).toContain("current_result_observation_enabled =\n    !recovery_contract_scope");
    const enablement = worker.slice(
      worker.indexOf("const current_result_observation_enabled"),
      worker.indexOf("const current_result_observation_interval_ms"),
    );
    expect(enablement).toContain("!recovery_contract_scope");
    expect(enablement).not.toContain("current_sources");
    expect(worker).toContain("active_current_result_observation");
  });

  it("starts result observation even when legislative execution is disabled", () => {
    expect(worker).toContain("export function start_current_result_observation_worker");
    expect(worker).toContain("export async function stop_current_result_observation_worker");
    expect(runtime).toContain("start_current_result_observation_worker()");
    expect(runtime).toContain("stop_current_result_observation_worker()");
    const start = runtime.indexOf("start_current_result_observation_worker()");
    const authorized = runtime.indexOf("start_authorized_legislative_queue()");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(authorized).toBeGreaterThan(start);
  });

  it("keeps result observation active during ordinary current-source intake", () => {
    expect(worker).toContain("Current-source intake and result-arrival observation are independent");
    expect(worker).toContain("const current_sources = legislative_current_source_scope()");
    expect(worker).toContain("current_result_observation_enabled =\n    !recovery_contract_scope");
  });

  it("can wake a hold but cannot invoke Rosetta execution or consume queue attempts", () => {
    expect(reconciler).toContain(
      "load_rosetta_current_docket_result_for_binding",
    );
    expect(reconciler).toContain("current?.status !== \"complete\"");
    expect(reconciler).toContain("queue_state = 'eligible'");
    expect(reconciler).toContain("last_failure_class = null");
    expect(reconciler).toContain(
      "rosetta_public_current_docket_result_awaiting_publication",
    );
    expect(reconciler).not.toMatch(
      /run_rosetta|invoke_rosetta|start_class_stage|class_stage_execute|replay_execute|replay_claim/i,
    );

    const wake = reconciler.slice(
      reconciler.indexOf("async function wake_completed_current_result"),
      reconciler.indexOf("async function observe_candidate"),
    );
    expect(wake).not.toContain("attempt_count");
  });

  it("uses a dedicated observation cursor and preserves the monotonicity guard", () => {
    expect(migration).toContain(
      "add column if not exists current_result_checked_at timestamptz",
    );
    expect(migration).toContain(
      "idx_legislative_version_current_result_hold_observation",
    );
    expect(migration).toContain(
      "preserve_legislative_version_queue_state_v1",
    );
    expect(migration).toContain(
      "Does not represent parser execution, replay, retry, or queue attempt consumption",
    );
  });
});
