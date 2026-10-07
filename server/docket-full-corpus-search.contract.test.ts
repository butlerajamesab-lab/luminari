import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const route = read("server/routes/docket.ts");
const page = read("client/src/pages/DocketRoom.tsx");

describe("Docket full preserved-corpus search contract", () => {
  it("searches preserved detail and state caches without calling the provider", () => {
    expect(route).toContain('docket_router.get("/search"');
    expect(route).toContain('"docket-full-corpus-search-v1"');
    expect(route).toContain("public.docket_bill_detail_cache");
    expect(route).toContain("public.docket_bill_state_cache");
    expect(route).toContain("jsonb_array_elements(cache.bills::jsonb)");
    expect(route).toContain("select distinct on (bill_id)");
    expect(route).toContain("detail_cache");
    expect(route).toContain("state_cache");
    const searchRoute = route.slice(
      route.indexOf('docket_router.get("/search"'),
      route.indexOf('docket_router.get("/state"'),
    );
    expect(searchRoute).not.toContain("get_master_list");
    expect(searchRoute).not.toContain("get_bill(");
  });

  it("ranks exact provider bill identity before title and keyword matches", () => {
    expect(route).toContain("corpus.bill_id::text = $1 then 0");
    expect(route).toContain("regexp_replace(");
    expect(route).toContain("upper(corpus.bill_number)");
    expect(route).toContain("= $2 then 1");
    expect(route).toContain("position(lower($1) in lower(corpus.title)) > 0");
  });

  it("keeps older and completed laws searchable instead of applying live-feed eligibility", () => {
    expect(route).toContain(
      "Current-session visibility does not determine whether a preserved law is searchable.",
    );
    expect(page).toContain("Full preserved Docket corpus search");
    expect(page).toContain("current-session visibility does not limit search");
    expect(page).toContain(
      "search_active || show_completed || resolution.live_feed_eligible",
    );
  });

  it("switches the active Docket search to the server corpus while preserving normal browse mode", () => {
    expect(page).toContain("/api/docket/search?");
    expect(page).toContain('const candidate_bills = search_active ? search_bills : bills;');
    expect(page).toContain('search_state_scope = level === "federal"');
    expect(page).toContain('"all cached jurisdictions"');
    expect(page).toContain("preserved Docket search");
  });

  it("caps user-visible corpus searches and rejects unbounded query text", () => {
    expect(route).toContain("return Math.min(parsed, 50)");
    expect(route).toContain("query.length < 2 || query.length > 160");
    expect(page).toContain('new URLSearchParams({ q: search_term, limit: "25" })');
  });
});
