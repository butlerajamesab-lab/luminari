import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(
  new URL("./routers/agency-metrics.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../client/src/pages/AgencyMetrics.tsx", import.meta.url),
  "utf8",
);

describe("Agency Performance canonical Lighthouse reader", () => {
  it("uses the governed accountability catalog instead of the mixed World Index agency bucket", () => {
    expect(router).toContain("listCanonicalAgencies");
    expect(router).toContain(
      "public.v_lighthouse_workflow_accountability_catalog_v1",
    );
    expect(router).toContain("object_class in ('agency','oversight_body')");
    expect(router).toContain("display_rank=1");
    expect(router).toContain("source_variant_refs");
    expect(page).toContain("trpc.agencyMetrics.listCanonicalAgencies.useQuery");
    expect(page).not.toContain("useWorldIndex");
    expect(page).not.toContain("Oversight Bodies from World Index");
  });

  it("keeps the public list bounded, searchable, and single-column on mobile", () => {
    expect(router).toContain(
      "limit: z.number().int().min(1).max(64).default(16)",
    );
    expect(router).toContain("has_more: hasMore");
    expect(page).toContain("Search canonical agencies");
    expect(page).toContain('gridTemplateColumns: "minmax(0, 1fr)"');
    expect(page).toContain("Show 16 more");
  });

  it("does not render a false empty state while canonical identities are visible", () => {
    expect(page).toContain("canonicalDirectory.items.length > 0");
    expect(page).toContain("(canonicalDirectory?.items.length ?? 0) === 0");
    expect(page).toContain(
      "The canonical agency directory could not load",
    );
    expect(page).toContain(
      "Their canonical agency records remain available",
    );
  });
});
