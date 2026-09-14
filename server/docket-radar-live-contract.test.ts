import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGISCAN_ROLLOUT_STATES } from "./services/legiscan";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docket Radar live contract", () => {
  it("includes Congress in the same provider-backed jurisdiction path", () => {
    expect(LEGISCAN_ROLLOUT_STATES).toContain("US");
    expect(LEGISCAN_ROLLOUT_STATES).toHaveLength(52);
  });

  it("projects radar facts without overwriting cached provider payloads", () => {
    const routes = read("server/routes/docket.ts");
    expect(routes).toContain("enrich_bills_with_radar");
    expect(routes).toContain("public.docket_bill_velocity");
    expect(routes).toContain("public.docket_bill_next_floor_event");
    expect(routes).toContain("from requested");
    expect(routes).toContain("enrichment_unavailable");
    expect(routes).toContain("row.base_has_trait_coverage === true");
    expect(routes).not.toMatch(/upsert_state_cache\([^)]*radar/);
  });

  it("runs refresh and activation only in the authorized worker", () => {
    const worker = read("server/prism-rosetta-worker.ts");
    const blueprint = read("render.prism-worker.yaml");
    expect(worker).toContain("start_docket_state_cache_warmer");
    expect(worker).toContain("start_docket_bill_activation_queue_worker");
    expect(blueprint).toMatch(/DOCKET_STATE_CACHE_WARMER_ENABLED\s+value: "true"/);
    expect(blueprint).toMatch(/DOCKET_BILL_ACTIVATION_QUEUE_ENABLED\s+value: "true"/);
  });

  it("uses neutral lifecycle copy and hides unsupported coverage claims", () => {
    const page = read("client/src/pages/DocketRoom.tsx");
    const detail = read("client/src/components/DocketBillDetailWorkspace.tsx");
    expect(page).toContain("Live · changeable");
    expect(page).toContain("Freshness unknown");
    expect(page).not.toContain("full_national_coverage");
    expect(page).not.toContain("warm_selected_state");
    expect(detail).toContain("source disagreement, not a contradiction within the bill");
    expect(page).toContain('new Date(`${value}T00:00:00`)');
    expect(detail).toContain('new Date(`${value}T00:00:00`)');
  });

  it("keeps removed trait classes in covered drift and settles worker startup", () => {
    const migration = read("supabase/migrations/20260914080801_docket_drift_removed_class_coverage.sql");
    const coverage_migration = read("supabase/migrations/20260914082000_docket_drift_dual_extraction_coverage.sql");
    const worker = read("server/prism-rosetta-worker.ts");
    expect(migration).toContain("covered_classes");
    expect(migration).toContain("COALESCE(cl.n, 0) AS latest_count");
    expect(coverage_migration).toContain("LEFT JOIN base b ON b.genome_bill_id = l.genome_bill_id");
    expect(coverage_migration).toContain("latest_has_trait_coverage");
    expect(read("supabase/migrations/20260914082817_docket_drift_completed_verification_coverage.sql"))
      .toContain("processing_state IN ('verified', 'verified_with_findings')");
    expect(read("server/routes/docket.ts")).toContain("row.latest_has_trait_coverage === true");
    expect(read("client/src/pages/DocketRoom.tsx")).toContain("const displayed_cache_status = state_data?.fetched_at");
    expect(worker).toContain("const docket_worker_startup = start_docket_workers().catch");
    const activation_worker = read("server/docket-jurisdiction-activation-queue-worker.ts");
    expect(activation_worker).toContain("await active_queue_cycle");
    expect(worker).toContain("await stop_docket_bill_activation_queue_worker()");
  });
});
