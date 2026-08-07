import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const docketRoute = readFileSync(new URL("./routes/docket.ts", import.meta.url), "utf8");
const genomeRouter = readFileSync(new URL("./routers/civic-genome-router.ts", import.meta.url), "utf8");

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
