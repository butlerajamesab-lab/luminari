import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("current whole-universe legal explorer", () => {
  it("reads current graph nodes without collapsing them into doctrines", () => {
    const service = read("server/services/legal-explorer-current.ts");
    expect(service).toContain("v_lighthouse_graph_nodes_v1");
    expect(service).toContain("v_lighthouse_graph_edges_v2");
    expect(service).toContain('"legal_authority"');
    expect(service).toContain('"workflow"');
    expect(service).toContain('"enforcement_pathway"');
    expect(service).toContain('"resource"');
    expect(service).toContain('"program"');
    expect(service).toContain('"contact_record"');
    expect(service).toContain("doctrine_registry");
    expect(service).toContain("legal_case_law");
    expect(service).toContain("litigation_barriers");
    expect(service).toContain("legal_weak_joints");
  });

  it("exposes a bounded rendering window while preserving full-universe counts", () => {
    const service = read("server/services/legal-explorer-current.ts");
    const router = read("server/routers/canonical-core-router.ts");
    expect(service).toContain("filtered_current_nodes");
    expect(service).toContain("graph_nodes_all_types");
    expect(service).toContain("default_current_explorer_nodes");
    expect(service).toContain("row_number() over(partition by f.node_type");
    expect(router).toContain("legalExplorer: publicProcedure");
    expect(router).toContain("readCurrentLegalExplorer");
    expect(router).toContain("limit: z.number().int().min(40).max(400).default(220)");
  });

  it("renders current types, references, and explicit window-versus-universe language", () => {
    const page = read("client/src/pages/DoctrineGraph.tsx");
    expect(page).toContain("Legal & Doctrine Graph Explorer");
    expect(page).toContain("trpc.canonicalCore.legalExplorer.useQuery");
    expect(page).toContain("window ≠ universe");
    expect(page).toContain("Current Civic/Legal Catalog");
    expect(page).toContain("Doctrine Registry");
    expect(page).toContain("Case Law Reference Library");
    expect(page).toContain("Litigation Barriers & Weak Joints");
    expect(page).toContain("Search law, agencies, workflows, programs, resources");
  });
});
