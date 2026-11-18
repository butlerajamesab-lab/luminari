import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const route = read("server/routes/docket.ts");
const page = read("client/src/pages/DocketRoom.tsx");
const migration = read("supabase/migrations/20261118090000_docket_corpus_indexed_public_read.sql");

const searchRoute = route.slice(
  route.indexOf('docket_router.get("/search"'),
  route.indexOf('docket_router.get("/state"'),
);
const archiveRoute = route.slice(
  route.indexOf('docket_router.get("/archive"'),
  route.indexOf('docket_router.get("/search"'),
);

describe("Docket complete preserved-source public browsing contract", () => {
  it("lists canonical Docket source inventory using a bounded keyset cursor", () => {
    expect(route).toContain('docket_router.get("/archive"');
    expect(archiveRoute).toContain("public.docket_bill_detail_cache");
    expect(archiveRoute).toContain("docket-preserved-archive-v1");
    expect(archiveRoute).toContain("order by cache.bill_id");
    expect(archiveRoute).toContain("cache.bill_id>$1");
    expect(archiveRoute).toContain("total_preserved");
    expect(archiveRoute).toContain("state_total");
    expect(archiveRoute).toContain("next_cursor");
    expect(archiveRoute).toContain("limit+1");
    expect(archiveRoute).toContain('req.query.after === "0"');
    expect(archiveRoute).toContain("docket_archive_state_index_not_installed");
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
    expect(route).not.toContain("order by cache.bill_id\\n            limit $4)");
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
  });

  it("defaults to the full preserved source list and keeps historical snapshots separate", () => {
    expect(page).toContain("/api/docket/archive?");
    expect(page).toContain("const candidate_bills = search_active ? search_bills : preserved_bills;");
    expect(page).toContain("Preserved source corpus");
    expect(page).toContain("Separate legacy session snapshot");
    expect(page).toContain('useState("ALL")');
    expect(page).toContain("Load more preserved bills");
    expect(page).toContain("View in Civic Genome (source ID");
    expect(page).toContain("curated entries (separate from official source bills)");
    expect(page).not.toContain("entries analyzed");
    expect(page).toContain("set_archive_cursor(0);");
    expect(page).toContain("[selected_state, search_active, level]");
    expect(page).toContain("archive_reset_pending.current");
    expect(page).toContain('params.set("jurisdiction_scope", "state")');
    expect(page).toContain('new URLSearchParams({ q: search_term, limit: "25" })');
  });

  it("caps searches and requires real SQL indexes without charging provider calls", () => {
    expect(route).toContain("return Math.min(parsed, 50)");
    expect(route).toContain("query.length < 2 || query.length > 160");
    expect(migration).toContain("docket_bill_detail_cache_state_bill_id_public_idx");
    expect(migration).toContain("docket_bill_detail_cache_normalized_number_public_idx");
    expect(migration).toContain("docket_bill_detail_cache_title_trgm_public_idx");
    expect(migration).toContain("FROM pg_extension e JOIN pg_namespace n");
    expect(migration).not.toContain("extensions.gin_trgm_ops");
    expect(archiveRoute).not.toContain("get_master_list");
    expect(searchRoute).not.toContain("get_master_list");
    expect(archiveRoute).not.toContain("get_bill(");
    expect(searchRoute).not.toContain("get_bill(");
  });
});
