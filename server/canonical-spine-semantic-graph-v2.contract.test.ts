import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

describe("canonical spine semantic civic graph v2 contract", () => {
  const relationshipMigration = read(
    "../supabase/migrations/20260816161657_lighthouse_explicit_civic_relationship_graph_v2.sql",
  );
  const stateOptimization = read(
    "../supabase/migrations/20260816162036_optimize_lighthouse_canonical_state_v2.sql",
  );
  const service = read("./services/current-canonical-state.ts");
  const router = read("./routers/canonical-core-router.ts");
  const panel = read("../client/src/components/CanonicalSpineDashboard.tsx");
  const parity = read("../scripts/audit-supabase-migration-ledger-parity.py");

  it("keeps structural graph v1 and adds explicit semantic relationships as v2", () => {
    expect(relationshipMigration).toContain(
      "public.v_lighthouse_graph_edges_v1",
    );
    expect(relationshipMigration).toContain(
      "public.v_lighthouse_graph_relationship_edges_v1",
    );
    expect(relationshipMigration).toContain(
      "public.v_lighthouse_graph_edges_v2",
    );
    expect(relationshipMigration).toContain(
      "'source_declared_exact'::text as evidence_state",
    );
  });

  it("resolves only source-declared exact relationships and preserves unresolved declarations", () => {
    expect(relationshipMigration).toContain("stable_id_exact_typed");
    expect(relationshipMigration).toContain("stable_id_exact_bundle");
    expect(relationshipMigration).toContain("name_exact_unique");
    expect(relationshipMigration).toContain("step_signature_exact_unique");
    expect(relationshipMigration).toContain(
      "public.v_lighthouse_graph_unresolved_relationships_v1",
    );
    expect(relationshipMigration).toContain("ambiguous_target");
    expect(relationshipMigration).toContain("missing_target");
    expect(relationshipMigration).not.toContain("levenshtein");
    expect(relationshipMigration).not.toContain("similarity(");
  });

  it("connects declared domain actors, coalition membership, and ordered enforcement paths", () => {
    expect(relationshipMigration).toContain("declares_agency");
    expect(relationshipMigration).toContain("declares_organization");
    expect(relationshipMigration).toContain("declares_legislator");
    expect(relationshipMigration).toContain("declares_advocacy_target");
    expect(relationshipMigration).toContain("has_member_organization");
    expect(relationshipMigration).toContain("has_member_legislator");
    expect(relationshipMigration).toContain("member_of_coalition");
    expect(relationshipMigration).toContain("contains_process_step");
    expect(relationshipMigration).toContain("routes_to_next_step");
  });

  it("keeps the v2 state query within one semantic declaration aggregation pass", () => {
    expect(stateOptimization).toContain("relationship_counts as materialized");
    expect(stateOptimization).toContain("semantic_graph_edges");
    expect(stateOptimization).toContain("unresolved_relationships");
    expect(stateOptimization).toContain("lighthouse_canonical_state_v2");
  });

  it("cuts canonicalCore reads over to v2 and exposes bounded edge surfaces", () => {
    expect(service).toContain("public.get_lighthouse_canonical_state_v2()");
    expect(service).toContain(
      "public.v_lighthouse_graph_relationship_edges_v1",
    );
    expect(service).toContain("public.v_lighthouse_graph_edges_v2");
    expect(service).toContain(
      "public.v_lighthouse_graph_unresolved_relationships_v1",
    );
    expect(router).toContain("graphEdges:");
    expect(router).toContain("unresolvedRelationships:");
    expect(router).toContain("max(200)");
    expect(service).toContain("limited_edges as materialized");
    expect(service).toContain("limited_unresolved as materialized");
    expect(service).toContain("CANONICAL_SAMPLE_CACHE_TTL_MS");
    expect(service).not.toContain(
      "left join public.v_lighthouse_graph_nodes_v1 f on f.node_id = e.from_node_id",
    );
  });

  it("makes Mission Control distinguish structural, semantic, and unresolved graph state", () => {
    expect(panel).toContain("Structural Edges");
    expect(panel).toContain("Semantic Edges");
    expect(panel).toContain("Unresolved Links");
    expect(panel).toContain("semanticOnly: true");
    expect(panel).toContain("Relationship Declarations");
    expect(panel).toContain("remain held rather than guessed");
    expect(panel).toContain("enabled: nodesQuery.isFetched");
    expect(panel).not.toContain("refetchInterval: 60000");
  });

  it("records both production migrations in parity without weakening the guard", () => {
    expect(parity).toContain('"20260816161657"');
    expect(parity).toContain('"20260816162036"');
    expect(parity).toContain("MIGRATION_LEDGER_PARITY_CONTRACT=PASS");
  });
});
