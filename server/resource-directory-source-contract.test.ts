import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("fresh Resource Directory source contracts", () => {
  it("uses the explicitly activated fresh resource snapshot and no legacy publication fallback", () => {
    const page = source("client/src/pages/ResourceDirectory.tsx");
    const embeddedDirectory = source("client/src/components/ResourceDirectory.tsx");
    const router = source("server/routers/resource-directory.ts");
    const shim = source("server/services/resource-directory-publishable.ts");
    const service = source("server/services/resource-directory-fresh-snapshot.ts");
    const appRouter = source("server/routers.ts");

    expect(page).toContain("trpc.resourceDirectory.summary");
    expect(page).toContain("trpc.resourceDirectory.search");
    expect(page).not.toContain("useWorldIndex");
    expect(page).not.toContain("world.getIndex");
    expect(embeddedDirectory).toContain("trpc.resourceDirectory.search");
    expect(embeddedDirectory).not.toContain("const RESOURCES:");

    expect(router).toContain("searchPublishableResourceDirectory");
    expect(router).toContain("getPublishableResourceDirectorySummary");
    expect(appRouter).toContain("resourceDirectory: resourceDirectoryRouter");
    expect(shim).toContain('from "./resource-directory-fresh-snapshot"');
    expect(service).toContain("luminari_resource_snapshot_v1");
    expect(service).toContain("luminari_resource_snapshot_identity_v1");
    expect(service).toContain("is_current=true");
    expect(service).toContain("status='active'");
    expect(service).toContain("resolution_state='resolved'");
    expect(service).not.toContain("luminari_resource_entities");
    expect(service).not.toContain("v_luminari_resource_source_candidates");
    expect(service).not.toContain("normalized_civic_resource");
    expect(service).not.toContain("unified_resources");
  });

  it("keeps searches paginated while reporting the full deduped snapshot count", () => {
    const router = source("server/routers/resource-directory.ts");
    const service = source("server/services/resource-directory-fresh-snapshot.ts");

    expect(router).toContain("max(60)");
    expect(service).toContain("count(*)::int as total");
    expect(service).toContain("limit $");
    expect(service).toContain("offset $");
    expect(service).toContain("total_resources");
    expect(service).toContain("held_identity_conflicts");
  });

  it("makes each public resource inspectable down to candidates, quality decisions, source artifacts, and hashes", () => {
    const service = source("server/services/resource-directory-fresh-snapshot.ts");
    expect(service).toContain("candidate_variants");
    expect(service).toContain("source_artifacts");
    expect(service).toContain("quality_records");
    expect(service).toContain("identity_receipt_hash");
    expect(service).toContain("source_content_sha256");
    expect(service).toContain("parser_version");
    expect(service).toContain("jurisdiction_resolution_state");
    expect(service).toContain("source_attached");
  });

  it("publishes explicit reviewed contact corrections historically without mutating source contacts", () => {
    const migration = source("supabase/migrations/20260731005055_v3_13_publication_contact_resolutions.sql");
    expect(migration).toContain("luminari_resource_contact_resolutions");
    expect(migration).toContain("v_luminari_resource_contact_points_current_v3_13");
    expect(migration).toContain("resolution_action = 'suppress'");
    expect(migration).not.toMatch(/update\s+public\.luminari_resource_contact_points/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.luminari_resource_contact_points/i);
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
    const migration = source("supabase/migrations/20260731012842_retire_legacy_civic_map_publication.sql");
    const worldIndex = source("server/services/world-index.ts");

    expect(migration).toContain("security_invoker = true");
    expect(migration).toContain("luminari_resource_entity_v3_13");
    expect(migration).toContain("where false");
    expect(migration).not.toMatch(/delete\s+from\s+public\.normalized_civic_resource/i);
    expect(migration).not.toMatch(/drop\s+table\s+.*normalized_civic_resource/i);

    expect(worldIndex).toContain("luminari_resource_entities");
    expect(worldIndex).toContain("v_luminari_resource_contact_points_current_v3_13");
    expect(worldIndex).toContain("v_luminari_resource_locations_current_v3_13");
    expect(worldIndex).not.toContain("from normalized_civic_resource");
    expect(worldIndex).not.toContain("source_table: 'normalized_civic_resource'");
  });
});
