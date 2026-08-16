import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Doctrine Graph semantic boundary", () => {
  it("reads the governed doctrine registry and explicit doctrine edges", () => {
    const router = read("server/routers/enforcement-intelligence.ts");
    const graphProcedure = router.slice(
      router.indexOf("getDoctrineGraph: publicProcedure"),
      router.indexOf("// ═══ Litigation Barriers")
    );

    expect(graphProcedure).toContain("public.doctrine_registry");
    expect(graphProcedure).toContain("public.doctrine_graph_edges");
    expect(graphProcedure).not.toMatch(/\blimit\s+\d+/i);
  });

  it("does not substitute the whole civic catalog into the doctrine surface", () => {
    const page = read("client/src/pages/DoctrineGraph.tsx");

    expect(page).toContain("trpc.enforcementIntel.getDoctrineGraph.useQuery");
    expect(page).toContain("const doctrineList = graphData?.doctrines");
    expect(page).not.toContain("canonicalCore.legalExplorer");
    expect(page).not.toContain("legal_authority:");
    expect(page).not.toContain("resource:");
    expect(page).not.toContain("program:");
    expect(page).not.toContain("contact_record:");
    expect(page).not.toContain("policy_alert:");
  });

  it("normalizes legacy doctrine-name edge endpoints onto registry IDs", () => {
    const page = read("client/src/pages/DoctrineGraph.tsx");

    expect(page).toContain("doctrineIdByName");
    expect(page).toContain("endpointId");
    expect(page).toContain("doctrine:${canonicalId ?? value}");
    expect(page).toContain("setSelectedNode(`doctrine:${d.id}`)");
  });
});
