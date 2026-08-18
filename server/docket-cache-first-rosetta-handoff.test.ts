import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sort_docket_warm_candidates } from "./docket-state-cache-warmer";

const docketRoute = readFileSync(new URL("./routes/docket.ts", import.meta.url), "utf8");
const genomeRouter = readFileSync(new URL("./routers/civic-genome-router.ts", import.meta.url), "utf8");
const docketWarmer = readFileSync(new URL("./docket-state-cache-warmer.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`missing_source_range:${start}:${end}`);
  return source.slice(startIndex, endIndex);
}

describe("Docket cache-first and Rosetta source-handoff boundaries", () => {
  it("serves an existing stale state cache before provider refresh work", () => {
    const stateRoute = between(
      docketRoute,
      'docket_router.get("/state"',
      'docket_router.get("/bill/:bill_id"',
    );

    expect(stateRoute).toContain("const cached = await read_state_cache(state)");
    expect(stateRoute).toContain('source: fresh ? "cache" : "cache_stale_refreshing"');
    expect(stateRoute).toContain("if (!fresh) schedule_state_refresh(state)");

    const cachedBranch = stateRoute.indexOf("if (cached)");
    const cachedResponse = stateRoute.indexOf("return res.json", cachedBranch);
    const uncachedRefresh = stateRoute.indexOf("const refreshed = await refresh_state_cache(state)");

    expect(cachedBranch).toBeGreaterThanOrEqual(0);
    expect(cachedResponse).toBeGreaterThan(cachedBranch);
    expect(uncachedRefresh).toBeGreaterThan(cachedResponse);
  });

  it("deduplicates background state refreshes per jurisdiction", () => {
    expect(docketRoute).toContain("state_refresh_in_flight");
    expect(docketRoute).toContain("if (state_refresh_in_flight.has(state)) return");
    expect(docketRoute).toContain("state_refresh_in_flight.set(state, refresh)");
    expect(docketRoute).toContain("state_refresh_in_flight.delete(state)");
  });

  it("reports bulk cache status from production Postgres truth", () => {
    const bulkRead = between(
      docketRoute,
      "const read_all_state_cache = async",
      "const upsert_state_cache = async",
    );
    const cacheStatus = between(
      docketRoute,
      'docket_router.get("/cache-status"',
      'docket_router.post("/warm-state"',
    );

    expect(docketRoute).toContain('import { query_with_diagnostics } from "../db"');
    expect(bulkRead).toContain("from public.docket_bill_state_cache");
    expect(bulkRead).toContain("where state = any($1::text[])");
    expect(bulkRead).toContain('label: "docket_state_cache_status_rows"');
    expect(bulkRead).not.toContain('supabase_cache_url("docket_bill_state_cache"');
    expect(cacheStatus).toContain('status_source: "production_database"');
  });

  it("keeps automatic recovery on the same canonical eight-hour cache TTL", () => {
    expect(docketRoute).toContain("const cache_ttl_ms = 8 * 60 * 60 * 1000");
    expect(docketWarmer).toContain("const STATE_CACHE_TTL_MS = 8 * 60 * 60 * 1000");
    expect(docketWarmer).toContain("now_ms - fetched_ms < STATE_CACHE_TTL_MS");
    expect(docketWarmer).not.toContain("payload.ttl_hours");
    expect(docketWarmer).not.toContain("docket_state_cache_status_invalid_ttl");
  });

  it("prioritizes uncached jurisdictions before stale cached jurisdictions", () => {
    const ordered = sort_docket_warm_candidates([
      { state: "WA", has_cache: true, fetched_at: "2026-08-17T00:00:00Z", is_fresh: false },
      { state: "CA", has_cache: true, fetched_at: "2026-08-10T00:00:00Z", is_fresh: false },
      { state: "NY", has_cache: false, fetched_at: null, is_fresh: false },
      { state: "AK", has_cache: false, fetched_at: null, is_fresh: false },
      { state: "OR", has_cache: true, fetched_at: "2026-08-18T03:00:00Z", is_fresh: true },
    ]);

    expect(ordered.map(row => row.state)).toEqual(["AK", "NY", "CA", "WA"]);
  });

  it("automatic recovery reconciles cache membership against production Postgres", () => {
    expect(docketWarmer).toContain("/api/docket/cache-status");
    expect(docketWarmer).toContain("from public.docket_bill_state_cache");
    expect(docketWarmer).toContain("where state = any($1::text[])");
    expect(docketWarmer).toContain('label: "docket_state_cache_warmer_cache_rows"');
    expect(docketWarmer).toContain('status_source: "database_reconciled"');
  });

  it("automatic recovery warms exact states with the existing provider spacing", () => {
    expect(docketWarmer).toContain("sort_docket_warm_candidates(cache_states)");
    expect(docketWarmer).toContain("/api/docket/warm-state");
    expect(docketWarmer).not.toContain("/api/docket/warm-next-batch");
    expect(docketWarmer).toContain("const WARM_STATE_DELAY_MS = 750");
    expect(docketWarmer).toContain("await sleep(WARM_STATE_DELAY_MS)");
    expect(docketWarmer).toContain('recovery_order: "missing_then_oldest_stale"');
  });

  it("keeps the Rosetta source-handoff button source-only", () => {
    expect(genomeRouter).toContain(
      'ingest_docket_bill_to_rosetta_source as create_rosetta_source_handoff',
    );

    const handoff = between(
      genomeRouter,
      "ingest_docket_bill_to_rosetta_source: adminProcedure",
      "process_docket_bill_through_rosetta: adminProcedure",
    );

    expect(handoff).toContain("create_rosetta_source_handoff(input.source_bill_id)");
    expect(handoff).not.toContain("process_rosetta_pipeline_once");
    expect(handoff).not.toContain("process_docket_bill_through_rosetta_and_genome");
  });

  it("retains the explicit full Rosetta processing action separately", () => {
    const processing = between(
      genomeRouter,
      "process_docket_bill_through_rosetta: adminProcedure",
      "get_rosetta_law_view_by_extraction_run: adminProcedure",
    );
    expect(processing).toContain("process_rosetta_pipeline_once(input.source_bill_id)");
  });
});
