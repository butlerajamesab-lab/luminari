import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("current Did You Know discovery", () => {
  it("reads the current source-backed discovery candidate universe", () => {
    const service = read("server/services/current-discovery-facts.ts");
    expect(service).toContain("v_lighthouse_did_you_know_candidates_v1");
    expect(service).toContain("count(*) over()::int as filtered_total");
    expect(service).toContain("window_only: true");
    expect(service).toContain("verification_status");
    expect(service).toContain("source_lane");
  });

  it("exposes current discovery through canonical core", () => {
    const router = read("server/routers/canonical-core-router.ts");
    expect(router).toContain("discoveryFacts: publicProcedure");
    expect(router).toContain("readCurrentDiscoveryFacts");
    expect(router).toContain("limit: z.number().int().min(1).max(100).default(60)");
  });

  it("does not let the legacy 45-card array define visible discovery breadth", () => {
    const page = read("client/src/pages/DiscoverBenefits.tsx");
    expect(page).toContain("trpc.canonicalCore.discoveryFacts.useQuery");
    expect(page).toContain("Current discovery results");
    expect(page).toContain("Paging reaches the full filtered universe");
    expect(page).toContain("v_lighthouse_did_you_know_candidates_v1");
    expect(page).not.toContain("trpc.discovery.all.useQuery");
  });
});
