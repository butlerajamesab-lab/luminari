import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Civic Map breadth restoration and World Index memory safety", () => {
  const directory = read("./services/resource-directory-current-corpus.ts");
  const civicMap = read("./routes/civic-map-router.ts");
  const worldRouter = read("./routers/world.ts");
  const boundedWorld = read("./services/world-index-bounded.ts");
  const breadthMigration = read("../supabase/migrations/20260816120146_resource_catalog_breadth_preserving_union_v2.sql");
  const directoryMigration = read("../supabase/migrations/20260816120403_resource_directory_breadth_compatibility_projection_v3.sql");
  const parity = read("../scripts/audit-supabase-migration-ledger-parity.py");

  it("publishes the breadth-preserving resource/program projection", () => {
    expect(directory).toContain('public.v_lighthouse_resource_directory_breadth_v3');
    expect(directory).toContain('lighthouse_resource_directory_breadth_v3');
    expect(directory).toContain('cross_lane_corroborated_count');
    expect(directory).not.toContain('public.v_lighthouse_resource_directory_whole_corpus_v2');
  });

  it("keeps old catalog breadth and current whole-corpus rows side-by-side", () => {
    expect(breadthMigration).toContain('from public.v_lighthouse_resource_catalog_v1 c');
    expect(breadthMigration).toContain('from public.v_lighthouse_resource_directory_whole_corpus_v2 w');
    expect(breadthMigration).toContain("'legacy_catalog'::text as publication_lane");
    expect(breadthMigration).toContain("'whole_corpus_current'::text as publication_lane");
    expect(breadthMigration).toContain('corroborating_lane_count');
  });

  it("preserves UUID compatibility without fuzzy identity merging", () => {
    expect(directoryMigration).toContain('then b.source_id::uuid');
    expect(directoryMigration).toContain('public.luminari_stable_uuid_v1(b.resource_record_uid)');
    expect(directoryMigration).toContain('No fuzzy identity merge is performed');
  });

  it("uses breadth for Civic Map coverage but keeps strict reviewed geocodes", () => {
    expect(civicMap).toContain('getPublishableResourceDirectorySummary');
    expect(civicMap).toContain('getReviewedMapSiteCounts');
    expect(civicMap).toContain('breadth_preserving_resource_directory_v3');
    expect(civicMap).toContain('reviewed_v3_13_exact_public_sites');
    expect(civicMap).toContain('getResourceDirectoryMapPoints');
  });

  it("removes the full in-memory World Index build from the public router", () => {
    expect(worldRouter).toContain('getBoundedWorldIndex');
    expect(worldRouter).not.toContain('get_cached_world_index');
    expect(worldRouter).not.toContain('getWorldIndex');
    expect(boundedWorld).toContain('const PER_CLASS_LIMIT = 150');
    expect(boundedWorld).toContain('const MAX_NODES = 5000');
    expect(boundedWorld).toContain('v_lighthouse_civic_object_current_v1');
    expect(boundedWorld).toContain('complete civic-object universe remains in Postgres');
  });

  it("preserves workbook context in the corpus without publishing it as public World Index nodes", () => {
    expect(boundedWorld.match(/coalesce\(category, ''\) <> 'workbook_context'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(boundedWorld).toContain('Workbook-context rows are preserved in the canonical corpus but excluded from public World Index presentation');
  });

  it("records the exact production migration versions", () => {
    expect(parity).toContain('"20260816120146"');
    expect(parity).toContain('"20260816120403"');
  });
});
