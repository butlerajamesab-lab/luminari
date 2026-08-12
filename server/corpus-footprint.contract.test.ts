import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./routes/corpus-footprint-router.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../client/src/components/mission/CorpusFootprintPanel.tsx", import.meta.url), "utf8");

describe("corpus footprint contract", () => {
  it("keeps every stage separate and explicitly non-additive", () => {
    expect(route).toContain('non_additive: true');
    expect(route).toContain('storage_artifact != atomic_source_record != typed_candidate != deduped_identity != public_projection');
    expect(route).toContain('Do not add them together');
  });

  it("reports atomic source scale, typed scale, historical coverage oracle, and active publication separately", () => {
    for (const token of [
      'atomic_source_records',
      'source_occurrences',
      'fresh_typed_candidates',
      'source_bound_resource_candidates',
      'broad_resource_rows',
      'canonical_resource_entities',
      'active_public_resource_snapshot',
      'held_identity_conflicts',
    ]) expect(route).toContain(token);
  });

  it("is admin-gated and visibly warns that seed table rows are not corpus size", () => {
    expect(core).toContain('app.use("/api/corpus-footprint", requireExpressAdmin, corpus_footprint_router)');
    expect(panel).toContain('Curated Knowledge Backbone table rows are a separate seed matrix and are not a corpus-size metric.');
    expect(panel).toContain('A downstream publication count is not corpus size.');
  });
});
