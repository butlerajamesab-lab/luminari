import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const exists = (path: string) => existsSync(join(root, path));

describe("retired whole-universe civic/legal explorer", () => {
  it("removes the public route, page, service, and tRPC procedure", () => {
    const router = read("server/routers/canonical-core-router.ts");
    const app = read("client/src/App.tsx");
    const navigation = read("client/src/components/navigation.ts");

    expect(exists("client/src/pages/CivicLegalExplorer.tsx")).toBe(false);
    expect(exists("server/services/legal-explorer-current.ts")).toBe(false);
    expect(router).not.toContain("legalExplorer: publicProcedure");
    expect(router).not.toContain("readCurrentLegalExplorer");
    expect(router).not.toContain("legal-explorer-current");
    expect(app).not.toContain("CivicLegalExplorer");
    expect(app).not.toContain('path="/civic-legal-explorer"');
    expect(navigation).not.toContain("/civic-legal-explorer");
  });

  it("keeps bounded canonical corpus readers available without a universal explorer", () => {
    const router = read("server/routers/canonical-core-router.ts");

    expect(router).toContain("graphNodePage: publicProcedure");
    expect(router).toContain("graphEdgePage: publicProcedure");
    expect(router).toContain("unresolvedRelationshipPage: publicProcedure");
    expect(router).toContain("legalAuthorities: publicProcedure");
    expect(router).toContain("currentObjectCounts: publicProcedure");
    expect(router).toContain("filtered_total");
    expect(router).toContain("window_only: true");
  });

  it("keeps the Doctrine Graph governed by doctrine registry reads only", () => {
    const page = read("client/src/pages/DoctrineGraph.tsx");
    const router = read("server/routers/enforcement-intelligence.ts");

    expect(page).toContain("Doctrine Graph Explorer");
    expect(page).toContain("trpc.enforcementIntel.getDoctrineGraph.useQuery");
    expect(page).not.toContain("canonicalCore.legalExplorer");
    expect(page).not.toContain("/civic-legal-explorer");
    expect(router).toContain("public.doctrine_registry");
    expect(router).toContain("public.doctrine_graph_edges");
    expect(router).not.toContain("canonicalCore.legalExplorer");
  });

  it("does not advertise the retired explorer through system metadata or docs", () => {
    const visibility = read("server/routes/system-visibility-router.ts");
    const architecture = read("client/src/pages/ArchitectureMap.tsx");

    expect(visibility).not.toContain("/civic-legal-explorer");
    expect(visibility).not.toContain("civic_legal_explorer");
    expect(visibility).not.toContain("canonicalCore.legalExplorer");
    expect(architecture).not.toContain("/civic-legal-explorer");
    expect(exists("docs/LEGAL_EXPLORER_DATA_SCALE.md")).toBe(false);
    expect(exists("docs/LEGAL_EXPLORER_QUERY_BENCHMARK.md")).toBe(false);
    expect(exists("docs/LEGAL_EXPLORER_REFERENCE_LAYERS.md")).toBe(false);
    expect(exists("docs/LEGAL_EXPLORER_RELATIONSHIP_POLICY.md")).toBe(false);
    expect(exists("docs/LEGAL_EXPLORER_SCOPE.md")).toBe(false);
    expect(exists("docs/LEGAL_EXPLORER_UI_CONTRACT.md")).toBe(false);
    expect(exists("docs/README_CURRENT_EXPLORERS.md")).toBe(false);
  });

  it("removes the unauthenticated AI inspection runtime surface", () => {
    const productionEntry = read("server/_core/index.ts");
    const devEntry = read("server/core/index.ts");
    const visibility = read("server/routes/system-visibility-router.ts");
    const tsconfigCi = read("tsconfig.ci.json");

    expect(exists("server/routes/ai-inspect-router.ts")).toBe(false);
    expect(productionEntry).not.toContain("aiInspectRouter");
    expect(productionEntry).not.toContain('app.use("/api/ai"');
    expect(devEntry).toContain('app.use("/api/system", requireExpressAdminOrSystemReadToken, systemVisibilityRouter)');
    expect(visibility).toContain("Administrator auth required");
    expect(visibility).not.toContain("/api/ai");
    expect(visibility).not.toContain("AI INSPECTION ROUTER");
    expect(tsconfigCi).not.toContain("ai-inspect-router");
  });
});
