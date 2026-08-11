import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("v3.13 Resource Directory source contracts", () => {
  it("uses the governed publishable resource projection instead of one hard-coded source lane", () => {
    const page = source("client/src/pages/ResourceDirectory.tsx");
    const embeddedDirectory = source(
      "client/src/components/ResourceDirectory.tsx"
    );
    const router = source("server/routers/resource-directory.ts");
    const service = source(
      "server/services/resource-directory-publishable.ts"
    );
    const appRouter = source("server/routers.ts");

    expect(page).toContain("trpc.resourceDirectory.summary");
    expect(page).toContain("trpc.resourceDirectory.search");
    expect(page).not.toContain("useWorldIndex");
    expect(page).not.toContain("world.getIndex");
    expect(page).not.toContain("WorldObject");
    expect(embeddedDirectory).toContain(
      "trpc.resourceDirectory.search"
    );
    expect(embeddedDirectory).not.toContain(
      "const RESOURCES:"
    );

    expect(router).toContain("searchPublishableResourceDirectory");
    expect(router).toContain("getPublishableResourceDirectorySummary");
    expect(appRouter).toContain(
      "resourceDirectory: resourceDirectoryRouter"
    );

    expect(service).toContain("luminari_resource_entities");
    expect(service).toContain("promotion_status = 'review_ready'");
    expect(service).toContain("verification_status = 'source_attached'");
    expect(service).toContain("promotion_status = 'promoted'");
    expect(service).toContain("verification_status = 'verified'");
    expect(service).toContain("v_luminari_resource_source_candidates");
    expect(service).toContain(
      "v_luminari_resource_contact_points_current_v3_13"
    );
    expect(service).toContain(
      "v_luminari_resource_locations_current_v3_13"
    );
    expect(service).not.toContain(
      'const DIRECTORY_SOURCE_TABLE = "state_directory_logical_record"'
    );
  });

  it("keeps searches paginated and bounded to one public query", () => {
    const router = source("server/routers/resource-directory.ts");
    const service = source(
      "server/services/resource-directory-publishable.ts"
    );

    expect(router).toContain("max(60)");
    expect(service).toContain("limit $4 offset $5");
    expect(service).toContain("'total', (select count(*)::int from filtered)");
    expect(service).not.toContain("Promise.all");
  });

  it("separates substrate, candidates, canonical entities, and public projection counts", () => {
    const service = source(
      "server/services/resource-directory-publishable.ts"
    );
    expect(service).toContain("'unified_resource_rows'");
    expect(service).toContain("'candidate_rows'");
    expect(service).toContain("'canonical_entity_rows'");
    expect(service).toContain("'publishable_rows'");
    expect(service).toContain("'state_directory_raw_source_rows'");
    expect(service).toContain(
      "luminari_resource_directory_publishable_v3_13"
    );
  });

  it("publishes explicit reviewed contact corrections without mutating source contacts", () => {
    const migration = source(
      "supabase/migrations/20260731005055_v3_13_publication_contact_resolutions.sql"
    );

    expect(migration).toContain(
      "luminari_resource_contact_resolutions"
    );
    expect(migration).toContain(
      "v_luminari_resource_contact_points_current_v3_13"
    );
    expect(migration).toContain("resolution_action = 'suppress'");
    expect(migration).toContain("resolution_count <> 12");
    expect(migration).not.toMatch(
      /update\s+public\.luminari_resource_contact_points/i
    );
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.luminari_resource_contact_points/i
    );
  });
});

describe("directory-first Civic Map source contracts", () => {
  it("uses directory coverage plus genuine exact-site coordinates", () => {
    const route = source("server/routes/civic-map-router.ts");
    const service = source("server/services/resource-directory.ts");
    const map = source("client/public/civicmap.html");

    expect(route).toContain('civicMapRouter.get("/coverage"');
    expect(route).toContain("getResourceDirectoryMapPoints");
    expect(service).toContain("l.manual_map_eligible is true");
    expect(service).toContain("l.latitude is not null");
    expect(service).toContain("l.longitude is not null");
    expect(map).toContain("/api/civic-map/coverage");
    expect(map).toContain("/api/civic-map/bounds");
    expect(map).toContain("Aggregate coverage and resource count");
    expect(map).toContain("Genuine geocoded public site");
    expect(map).toContain('id="categoryKey"');
    expect(map).toContain("All active resources");
    expect(map).toContain("verified_physical_sites");
    expect(service).toContain("publication_status = 'active'");
  });

  it("does not restore legacy graph, normalized-map, or event-stream inputs", () => {
    const route = source("server/routes/civic-map-router.ts");
    const service = source("server/services/resource-directory.ts");
    const map = source("client/public/civicmap.html");
    const combined = `${route}\n${service}\n${map}`.toLowerCase();

    expect(combined).not.toContain("map_layer1_points");
    expect(combined).not.toContain("map_layer2_detail");
    expect(combined).not.toContain("normalized_civic_resource");
    expect(combined).not.toContain("v_ui_civic_map_v2");
    expect(combined).not.toContain("detected_signal");
    expect(combined).not.toContain("signal_events");
    expect(combined).not.toContain("world.getindex");
  });

  it("retires the legacy public views without deleting their forensic source table", () => {
    const migration = source(
      "supabase/migrations/20260731012842_retire_legacy_civic_map_publication.sql"
    );
    const worldIndex = source("server/services/world-index.ts");

    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("luminari_resource_entity_v3_13");
    expect(migration).toContain("where false");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.normalized_civic_resource/i
    );
    expect(migration).not.toMatch(
      /drop\s+table\s+.*normalized_civic_resource/i
    );

    expect(worldIndex).toContain("luminari_resource_entities");
    expect(worldIndex).toContain(
      "v_luminari_resource_contact_points_current_v3_13"
    );
    expect(worldIndex).toContain(
      "v_luminari_resource_locations_current_v3_13"
    );
    expect(worldIndex).not.toContain("from normalized_civic_resource");
    expect(worldIndex).not.toContain(
      "source_table: 'normalized_civic_resource'"
    );
  });
});
