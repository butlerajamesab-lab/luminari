import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("canonical graph read performance contract", () => {
  const indexes = read("../supabase/migrations/20260816174809_optimize_current_civic_graph_relationship_joins.sql");
  const state = read("../supabase/migrations/20260816174926_optimize_lighthouse_canonical_state_v2_single_pass.sql");
  const parity = read("../scripts/audit-supabase-migration-ledger-parity.py");
  const productionReceipts = read("../supabase/verification/production_migration_receipts_20260829.tsv");

  it("indexes the exact candidate and reconciliation identities used by current graph projection", () => {
    expect(indexes).toContain("(candidate_hash, artifact_key, created_at desc)");
    expect(indexes).toContain("(run_id, source_candidate_hash, reconciled_at desc, object_ref)");
  });

  it("materializes current civic objects once per state call instead of rescanning graph views", () => {
    expect(state).toContain("current_objects as materialized");
    expect(state).toContain("object_counts as materialized");
    expect(state).toContain("semantic_counts as materialized");
    expect(state).not.toContain("get_lighthouse_canonical_state_v1()");
    expect(state).not.toContain("from public.v_lighthouse_graph_nodes_v1");
    expect(state).not.toContain("from public.v_lighthouse_graph_edges_v2");
  });

  it("preserves structural and semantic graph counts as separate state fields", () => {
    expect(state).toContain("'structural_graph_edges'");
    expect(state).toContain("'semantic_graph_edges'");
    expect(state).toContain("'unresolved_relationships'");
    expect(state).toContain("'graph_edge_types'");
    expect(state).toContain("'graph_node_types'");
  });

  it("records both production migration versions in parity", () => {
    expect(parity).toContain("PRODUCTION_RECEIPTS");
    expect(productionReceipts).toContain(
      "20260816174809\toptimize_current_civic_graph_relationship_joins\t",
    );
    expect(productionReceipts).toContain(
      "20260816174926\toptimize_lighthouse_canonical_state_v2_single_pass\t",
    );
  });
});
