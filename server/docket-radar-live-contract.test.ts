import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sort_docket_warm_candidates } from "./docket-state-cache-warmer";
import { LEGISCAN_ROLLOUT_STATES } from "./services/legiscan";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docket Radar live contract", () => {
  it("does not spend ordinary capacity on retries whose backoff has not elapsed", () => {
    expect(sort_docket_warm_candidates([
      { state: "AA", has_cache: false, fetched_at: null, is_fresh: false, retry_scheduled: true, requires_retry: false },
      { state: "BB", has_cache: false, fetched_at: null, is_fresh: false, retry_scheduled: false, requires_retry: false },
      { state: "CC", has_cache: false, fetched_at: null, is_fresh: false, retry_scheduled: true, requires_retry: true },
    ]).map(row => row.state)).toEqual(["CC", "BB"]);
  });

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

  it("keeps refresh projection durable and bill-event writes atomic", () => {
    const routes = read("server/routes/docket.ts");
    const projection = read("server/civic-genome-projection.ts");
    const correction = read("supabase/migrations/20260914103304_docket_event_classification_correction.sql");
    expect(routes).toContain("with cache_write as (");
    expect(routes).toContain("await upsert_state_cache(row, !project_to_civic_genome)");
    expect(routes).toContain("request_scoped_cache_refresh_requires_projection");
    expect(projection).toContain('await client.query("begin")');
    expect(projection).toContain('await client.query("commit")');
    expect(projection).toContain('await client.query("rollback")');
    expect(correction).toContain("classification_superseded");
    expect(correction).toContain("docket_classification_corrected");
    expect(read("server/civic-genome-external-snapshot-producer.ts")).toContain("superseded_event_id' = e.event_id::text");
    expect(read("server/civic-genome-db.ts")).toContain("superseded_event_id' = event.event_id::text");
    expect(read("server/civic-genome-db.ts")).toMatch(/list_genome_bills[\s\S]*conditions\.push\(`family_id = \$\$\{params\.length\}`\)/);
    expect(read("server/civic-genome-db.ts")).toMatch(/list_genome_events[\s\S]*conditions\.push\(`event\.family_id = \$\$\{params\.length\}`\)/);
    expect(read("supabase/migrations/20260914104100_docket_event_correction_append_only_repair.sql")).toContain("event_payload_json - 'classification_correction'");
    expect(read("supabase/migrations/20260914110220_docket_terminal_event_classification_corrections.sql")).toContain("event.event_type in ('enacted', 'vetoed', 'failed')");
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
    expect(page).not.toContain("[4, 5, 6].includes(status)");
    expect(page).toContain("Freshness unknown");
    expect(page).not.toContain("full_national_coverage");
    expect(page).not.toContain("warm_selected_state");
    expect(detail).toContain("source disagreement, not a contradiction within the bill");
    expect(detail).toContain("Passed · further action possible");
    expect(page).not.toMatch(/\\b\(\?:enacted\|withdrawn/);
    expect(detail).not.toMatch(/\\b\(\?:enacted\|withdrawn/);
    expect(page).toContain("effective date|enacted|withdrawn|dead|vetoed");
    expect(page).toContain("signed by governor|governor signed|became law");
    expect(detail).toContain("signed by governor|governor signed|became law");
    expect(page).toContain("failed\\s+(?:final passage|to pass)");
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
    expect(read("server/docket-state-cache-warmer.ts")).toContain("await active_cycle");
    expect(worker).toContain("await stop_docket_state_cache_warmer()");
    expect(read("server/routes/docket.ts")).toContain('get_or_start_state_refresh(state, "background")');
    expect(worker).toContain("await wait_for_docket_state_refreshes()");
    expect(read("server/routes/docket.ts")).toContain("project_docket_state_cache_to_civic_genome_serialized(state)");
    expect(activation_worker).toContain("project_docket_state_cache_to_civic_genome_serialized(normalized_state)");
    expect(read("server/civic-genome-projection.ts")).toContain("docket_state_projection_in_flight");
    expect(read("server/civic-genome-projection.ts")).toContain("if (previous) await previous.catch(() => undefined)");
    expect(read("server/routes/docket.ts")).toContain("project_to_civic_genome\n        ? await project_refreshed_state_to_civic_genome(state)");
    expect(read("server/routes/docket.ts")).not.toContain("project_refreshed_state_to_civic_genome = async (state: string): Promise<civic_genome_projection_status> => {\n  try {");
    expect(read("server/docket-state-cache-warmer.ts")).toContain("public.docket_state_projection_retry");
    expect(read("server/docket-state-cache-warmer.ts")).toContain("select_docket_warm_batch(candidates, limit)");
    expect(read("server/docket-state-cache-warmer.ts")).toContain('record_retry(candidate.state, new Error("projection_attempt_in_progress"))');
    expect(read("server/docket-state-cache-warmer.ts")).toContain("with configured(state) as (select unnest($1::text[]))");
  });
});
