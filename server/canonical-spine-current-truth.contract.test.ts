import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("canonical spine current civic truth contract", () => {
  const migration = read("../supabase/migrations/20260816125001_canonical_spine_current_civic_graph_v1.sql");
  const service = read("./services/current-canonical-state.ts");
  const router = read("./routers/canonical-core-router.ts");
  const panel = read("../client/src/components/CanonicalSpineDashboard.tsx");
  const parity = read("../scripts/audit-supabase-migration-ledger-parity.py");
  const productionReceipts = read("../supabase/verification/production_migration_receipts_20260829.tsv");

  it("derives graph nodes from current civic objects instead of manual world_nodes", () => {
    expect(migration).toContain("from public.v_lighthouse_civic_object_current_v1");
    expect(migration).toContain("'civic_object'::text as node_origin");
    expect(migration).toContain("graph participation is a projection and never a publication gate");
    expect(service).toContain("public.v_lighthouse_graph_nodes_v1");
  });

  it("limits structural edges to source-bound relationships in v1", () => {
    expect(migration).toContain("'within_jurisdiction'::text as edge_type");
    expect(migration).toContain("'sourced_from'::text as edge_type");
    expect(migration).toContain("'source_bound'::text as evidence_state");
    expect(migration).not.toContain("fuzzy");
  });

  it("makes canonicalCore read current reconciled truth", () => {
    expect(router).toContain("getCurrentCanonicalCoreHealth");
    expect(router).toContain("getCurrentSystemSummary");
    expect(router).toContain("getCurrentCanonicalState");
    expect(router).toContain("getCurrentGraphNodes");
    expect(router).not.toContain("getSystemSummary");
    expect(router).not.toContain("getCanonicalCoreHealth");
  });

  it("removes manual Add Node as Mission Control graph coverage", () => {
    expect(panel).toContain("Canonical Spine — Current Civic Graph");
    expect(panel).toContain("canonicalCore.currentState.useQuery");
    expect(panel).toContain("canonicalCore.graphNodes.useQuery");
    expect(panel).toContain("Graph participation is a navigation layer, never a publication gate");
    expect(panel).not.toContain("canonicalSpine.worldNodes.create");
    expect(panel).not.toContain("Add Node");
  });

  it("keeps legacy manual world nodes visible only as compatibility metadata", () => {
    expect(migration).toContain("'legacy_manual_world_nodes'");
    expect(panel).toContain("Legacy manual world nodes");
  });

  it("locks down graph views and current-state RPC to the service role", () => {
    expect(migration).toContain("revoke all on public.v_lighthouse_graph_nodes_v1 from public, anon, authenticated");
    expect(migration).toContain("revoke all on public.v_lighthouse_graph_edges_v1 from public, anon, authenticated");
    expect(migration).toContain("grant select on public.v_lighthouse_graph_nodes_v1 to service_role");
    expect(migration).toContain("grant execute on function public.get_lighthouse_canonical_state_v1() to service_role");
  });

  it("records the production migration version without weakening parity", () => {
    expect(parity).toContain("PRODUCTION_RECEIPTS");
    expect(productionReceipts).toContain(
      "20260816125001\tcanonical_spine_current_civic_graph_v1\t",
    );
    expect(parity).toContain("MIGRATION_LEDGER_PARITY_CONTRACT=PASS");
  });
});
