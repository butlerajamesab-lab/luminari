import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const route = read("server/routes/docket.ts");
const page = read("client/src/pages/DocketRoom.tsx");
const migration = read("supabase/migrations/20261118090000_docket_corpus_indexed_public_read.sql");
const orderingMigration = read("supabase/migrations/20261119010000_docket_history_session_ordering.sql");

const searchRoute = route.slice(
  route.indexOf('docket_router.get("/search"'),
  route.indexOf('docket_router.get("/state"'),
);
const archiveRoute = route.slice(
  route.indexOf('docket_router.get("/archive",'),
  route.indexOf('docket_router.get("/search"'),
);

describe("Docket complete preserved-source public browsing contract", () => {
  it("lists canonical Docket source inventory using a bounded keyset cursor", () => {
    expect(route).toContain('docket_router.get("/archive"');
    expect(archiveRoute).toContain("public.docket_bill_detail_cache");
    expect(archiveRoute).toContain("docket-preserved-archive-v3");
    expect(archiveRoute).toContain("order by ${action_date_expr} desc nulls last,cache.bill_id asc");
    expect(archiveRoute).toContain("docket_bill_latest_action_date_v1(cache.bill)");
    expect(archiveRoute).toContain("after_date");
    expect(archiveRoute).toContain("after_id");
    expect(archiveRoute).toContain("matching_total");
    expect(archiveRoute).toContain("current_session_only");
    expect(archiveRoute).toContain("verified_current_sessions");
    expect(archiveRoute).toContain("next_cursor");
    expect(archiveRoute).toContain("limit+1");
    expect(archiveRoute).toContain("docket_archive_cursor_incomplete");
    expect(archiveRoute).toContain("docket_archive_action_order_index_not_installed");
    expect(archiveRoute).toContain("docket_archive_state_action_order_index_not_installed");
    expect(archiveRoute).toContain("docket_archive_session_action_order_index_not_installed");
    expect(archiveRoute).toContain("session_evidence->>'prior'");
    expect(archiveRoute).toContain("session_evidence->>'sine_die'");
    expect(archiveRoute.indexOf("when session_evidence->>'sine_die' in ('1','true','yes','y') then false"))
      .toBeLessThan(archiveRoute.indexOf("when session_evidence->>'prior' in ('0','false','no','n') then true"));
    expect(route).toContain('docket_router.get("/archive/sessions"');
    expect(route).toContain("docket-preserved-sessions-v1");
    expect(route).toContain("group by 1,2,3");
    expect(archiveRoute).not.toContain("get_master_list");
    expect(archiveRoute).not.toContain("get_bill(");
    expect(archiveRoute).not.toContain("register_docket");
  });

  it("searches source IDs, normal bill numbers and titles, rather than globally sorting JSON", () => {
    expect(route).toContain('docket_router.get("/search"');
    expect(searchRoute).toContain('"docket-full-corpus-search-v1"');
    expect(searchRoute).toContain("docket_corpus_search_indexes_not_installed");
    expect(route).toContain("with source_matches as (");
    expect(route).toContain("where cache.bill_id=$5::integer");
    expect(route).toContain("upper(regexp_replace(");
    expect(route).toContain("coalesce(cache.bill->>'title','') ilike");
    const titleStart = route.indexOf("select cache.bill_id,2 as match_rank");
    const titleEnd = route.indexOf(") candidates", titleStart);
    const titleBranch = route.slice(titleStart, titleEnd);
    expect(titleStart).toBeGreaterThanOrEqual(0);
    expect(titleEnd).toBeGreaterThan(titleStart);
    expect(titleBranch).not.toContain("order by cache.bill_id");
    expect(route).toContain("select cache.bill_id,0 as match_rank");
    expect(route).toContain("select cache.bill_id,1 as match_rank");
    expect(route).toContain("select cache.bill_id,2 as match_rank");
    expect(route).not.toContain("with detail as materialized");
    expect(searchRoute).not.toContain("get_master_list");
    expect(searchRoute).not.toContain("get_bill(");
  });

  it("accepts jurisdiction-prefixed searches such as PA HB1000", () => {
    expect(searchRoute).toContain("const prefix = /^([A-Za-z]{2})");
    expect(searchRoute).toContain("\\s*[: -]\\s*");
    expect(searchRoute).toContain("\\d+[A-Za-z]?");
    expect(searchRoute).toContain("const state = requested_state ?? prefix_state;");
    expect(searchRoute).toContain("normalize_search_query(prefix[2])");
    expect(searchRoute).not.toContain("\\\\s*[: -]");
    const literal = searchRoute.match(/const prefix = (\/[^/]+\/[a-z]*)\.exec\(normalized\.query\);/)?.[1];
    expect(literal).toBeDefined();
    const slash = literal!.lastIndexOf("/");
    const pattern = new RegExp(literal!.slice(1, slash), literal!.slice(slash + 1));
    for (const [input, billNumber] of [["PA HB1000", "HB1000"], ["PA: HB 1000", "HB 1000"], ["PA-HB1000", "HB1000"]]) {
      expect(pattern.exec(input)?.slice(1)).toEqual(["PA", billNumber]);
    }
  });

  it("keeps federal bills out of the state scope", () => {
    expect(archiveRoute).toContain('jurisdiction_scope === "state"');
    expect(archiveRoute).toContain("upper(coalesce(cache.bill->>'state','')) <> 'US'");
    expect(searchRoute).toContain('exclude_federal: jurisdiction_scope === "state"');
    expect(route).toContain("not $6::boolean or upper(coalesce(cache.bill->>'state','')) <> 'US'");
    expect(page).toContain('level === "state" && preferred_state === "US" ? "ALL"');
  });

  it("defaults to verified current-session scope and keeps historical snapshots separate", () => {
    expect(page).toContain("/api/docket/archive?");
    expect(page).toContain("const candidate_bills = search_active ? search_bills : preserved_bills;");
    expect(page).toContain("Verified current sessions");
    expect(page).toContain("Separate legacy session snapshot");
    expect(page).toContain('useState("ALL")');
    expect(page).toContain("Load more records");
    expect(page).toContain("View in Civic Genome (source ID");
    expect(page).toContain("curated analysis records (official source bills are browsed below)");
    expect(page).not.toContain("entries analyzed");
    expect(page).toContain("set_archive_cursor(null);");
    expect(page).toContain("[selected_state, selected_archive_session, search_active, level, archive_view]");
    expect(page).toContain("docket-preserved-archive-v3");
    expect(page).toContain("Undeliberated · verified current session");
    expect(page).toContain("Deliberated · terminal outcome");
    expect(page).toContain("Choose a jurisdiction first");
    expect(page).toContain('"Verified current session"');
    expect(page).toContain("Session / year");
    expect(page).toContain("Current session is unverified for");
    expect(page).toContain("archive_reset_pending.current");
    expect(page).toContain('params.set("jurisdiction_scope", "state")');
    expect(page).toContain('new URLSearchParams({ q: search_term, limit: "25" })');
    expect(page).toContain('return !resolution.is_terminal\n          && (selected_archive_session !== "" || session_is_current === true);');
    expect(page).toContain('return resolution.is_terminal\n        && (selected_archive_session !== "" || session_is_current === true);');
    expect(page).toContain("resolution.is_terminal");
  });

  it("caps searches and requires real SQL indexes without charging provider calls", () => {
    expect(route).toContain("return Math.min(parsed, 50)");
    expect(route).toContain("query.length < 2 || query.length > 160");
    expect(migration).toContain("docket_bill_detail_cache_state_bill_id_public_idx");
    expect(migration).toContain("docket_bill_detail_cache_normalized_number_public_idx");
    expect(migration).toContain("docket_bill_detail_cache_title_trgm_public_idx");
    expect(migration).toContain("FROM pg_extension e JOIN pg_namespace n");
    expect(migration).not.toContain("extensions.gin_trgm_ops");
    expect(orderingMigration).toContain("docket_bill_latest_action_date_v1");
    expect(orderingMigration).toContain("docket_bill_detail_cache_action_date_public_idx");
    expect(orderingMigration).toContain("docket_bill_detail_cache_state_session_action_public_idx");
    expect(orderingMigration).toContain("history_items(history_item)");
    expect(orderingMigration).toContain("ADD COLUMN IF NOT EXISTS sessions jsonb");
    expect(archiveRoute).not.toContain("get_master_list");
    expect(searchRoute).not.toContain("get_master_list");
    expect(archiveRoute).not.toContain("get_bill(");
    expect(searchRoute).not.toContain("get_bill(");
  });
});
