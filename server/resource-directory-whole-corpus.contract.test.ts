import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Resource Directory whole-corpus cutover contract", () => {
  const alias = read("./services/resource-directory-publishable.ts");
  const service = read("./services/resource-directory-current-corpus.ts");
  const router = read("./routers/resource-directory.ts");
  const migration = read("../supabase/migrations/20260816103729_resource_directory_whole_corpus_projection_v2.sql");

  it("keeps the existing public Resource Directory API seam", () => {
    expect(router).toContain("publicProcedure");
    expect(router).toContain("summary:");
    expect(router).toContain("search:");
    expect(router).toContain("detail:");
    expect(router).toContain("z.string().uuid()");
  });

  it("routes the publishable service to the current whole-corpus projection", () => {
    expect(alias).toContain('./resource-directory-current-corpus');
    expect(service).toContain('public.v_lighthouse_resource_directory_whole_corpus_v2');
    expect(service).not.toContain('from public.luminari_resource_snapshot_identity_v1');
    expect(service).not.toContain('from public.luminari_resource_snapshot_v1');
  });

  it("preserves stable UUID continuity without fuzzy identity merging", () => {
    expect(migration).toContain("sm.resource_entity_id is not null as legacy_identity_preserved");
    expect(migration).toContain("luminari_resource_identity_uuid_v1");
    expect(migration).toContain("partition by m.stable_resource_entity_id");
    expect(migration).not.toMatch(/similarity\s*\(/i);
    expect(migration).not.toMatch(/levenshtein/i);
    expect(migration).not.toMatch(/fuzzy/i);
  });

  it("only publishes person-facing-ready current resource/program objects", () => {
    expect(migration).toContain("where c.person_facing_ready");
    expect(migration).toContain("where stable_identity_rank=1");
    expect(service).toContain('publication_status: "active"');
  });

  it("preserves source addresses without asserting unverified map coordinates", () => {
    expect(service).toContain('disposition: "source_attached_address_unverified_for_map"');
    expect(service).toContain('map_eligible: false');
    expect(service).toContain('latitude: null');
    expect(service).toContain('longitude: null');
  });

  it("keeps source provenance visible in detail responses", () => {
    expect(service).toContain("source_candidate_hash");
    expect(service).toContain("source_content_sha256");
    expect(service).toContain("field_provenance");
    expect(service).toContain("quality_receipts");
    expect(service).toContain("source_artifacts");
  });
});
