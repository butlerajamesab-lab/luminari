import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assert_civic_genome_external_snapshot_v1,
  civic_genome_external_snapshot_hash_basis,
  type civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-contract";

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const H3 = "3".repeat(64);
const H4 = "4".repeat(64);

function valid_snapshot(): civic_genome_external_snapshot_v1 {
  return {
    contract_id: "civic_genome.external_snapshot.v1",
    contract_version: "1.0.0",
    canonical_owner: "lighthouse/civic_genome",
    snapshot_id: "cg-snapshot-family-001",
    snapshot_kind: "baseline_export",
    immutable: true,
    scope: {
      scope_type: "family",
      scope_ids: ["family-001"],
      jurisdiction_codes: ["WA", "IA"],
    },
    as_of: "2026-08-03T21:45:00.000Z",
    methodology_version: "civic_genome_external_snapshot.1.0.0",
    components: [
      {
        component_id: "civic_genome:family:family-001",
        component_type: "family",
        canonical_record_id: "family-001",
        inclusion_state: "current",
        jurisdiction_code: null,
        temporal_scope: "2026-08-03",
        value: { family_signature: "example-family" },
        source_bindings: [
          {
            owner_service: "civic_genome",
            record_type: "civic_genome_family",
            record_id: "family-001",
            receipt_id: "family-receipt-001",
            content_hash: H1,
            engine_id: "civic_genome_family_resolver",
            engine_version: "2.0.0",
            rule_id: "weighted_confirmed_traits",
            rule_version: "2.0.0",
          },
        ],
        source_verification: [
          {
            owner_service: "civic_genome",
            state: "structurally_assigned",
            receipt_id: "family-receipt-001",
            evidence_hash: H1,
            mapping_state: "source_native_preserved",
          },
        ],
        unresolved_conditions: [],
        component_hash: H2,
      },
      {
        component_id: "civic_genome:trait:trait-001",
        component_type: "trait",
        canonical_record_id: "trait-001",
        inclusion_state: "current",
        jurisdiction_code: "WA",
        temporal_scope: "2026-08-03",
        value: { trait_class: "workflow", trait_key: "deadline", normalized_value: 30 },
        source_bindings: [
          {
            owner_service: "rosetta",
            record_type: "law_view_object",
            record_id: "rosetta-object-001",
            receipt_id: "rosetta-run-001",
            content_hash: H2,
            engine_id: "rosetta",
            engine_version: "3.0.0",
            rule_id: "five_layer_extraction",
            rule_version: "3.0.0",
          },
          {
            owner_service: "prism",
            record_type: "verification_receipt",
            record_id: "prism-receipt-001",
            receipt_id: "prism-receipt-001",
            content_hash: H3,
            engine_id: "prism",
            engine_version: "1.1.1",
            rule_id: "rosetta_structural_binding",
            rule_version: "1.0.1",
          },
        ],
        source_verification: [
          {
            owner_service: "rosetta",
            state: "completed_admissible",
            receipt_id: "rosetta-run-001",
            evidence_hash: H2,
            mapping_state: "source_native_preserved",
          },
          {
            owner_service: "prism",
            state: "verified",
            receipt_id: "prism-receipt-001",
            evidence_hash: H3,
            mapping_state: "source_native_preserved",
          },
        ],
        unresolved_conditions: [],
        component_hash: H3,
      },
    ],
    component_count: 2,
    unresolved_conditions: [],
    excluded_component_types: ["comparison_matrix", "comparison_state_cell"],
    completeness_state: "bounded_complete",
    snapshot_hash: H4,
    export_receipt: {
      export_receipt_id: "cg-export-receipt-001",
      export_receipt_hash: H1,
      snapshot_hash: H4,
      deterministic_replay_key: H2,
      replay_state: "original",
      source_commit_sha: "c23f4fc6d1904ef16eb186fcece8813c1a33a03d",
      generated_at: "2026-08-03T21:46:00.000Z",
    },
  };
}

describe("Civic Genome external snapshot contract", () => {
  it("publishes a portable schema matching the runtime contract", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../contracts/civic_genome_external_snapshot.v1.schema.json", import.meta.url), "utf8"),
    ) as {
      $schema: string;
      $id: string;
      properties: Record<string, { const?: unknown }>;
      $defs: {
        component_type: { enum: string[] };
        source_binding: {
          properties: { record_type: { not: { const: string } } };
        };
      };
    };

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://luminari.org/civic-genome/contracts/external-snapshot.v1.schema.json");
    expect(schema.properties.contract_id.const).toBe("civic_genome.external_snapshot.v1");
    expect(schema.properties.contract_version.const).toBe("1.0.0");
    expect(schema.properties.immutable.const).toBe(true);
    expect(schema.$defs.component_type.enum).toEqual([
      "family",
      "bill",
      "trait",
      "relationship",
      "lineage_edge",
      "event",
      "momentum_component",
      "momentum_snapshot",
      "comparison_matrix",
      "comparison_state_cell",
      "unresolved_family_candidate",
    ]);
    expect(schema.$defs.source_binding.properties.record_type.not.const).toBe(
      "civic_genome_projection_checkpoint",
    );
  });

  it("accepts an immutable source-bound bounded snapshot", () => {
    const snapshot = assert_civic_genome_external_snapshot_v1(valid_snapshot());
    expect(snapshot.component_count).toBe(2);
    expect(snapshot.components[1].source_verification.map(row => row.state)).toEqual([
      "completed_admissible",
      "verified",
    ]);
  });

  it("rejects the mutable internal projection continuation checkpoint", () => {
    const snapshot = valid_snapshot();
    snapshot.components[0].source_bindings[0].record_type = "civic_genome_projection_checkpoint";
    expect(() => assert_civic_genome_external_snapshot_v1(snapshot)).toThrow(
      /may not use mutable civic_genome_projection_checkpoint/,
    );
  });

  it("rejects duplicate component identities and incorrect counts", () => {
    const duplicate = valid_snapshot();
    duplicate.components[1].component_id = duplicate.components[0].component_id;
    expect(() => assert_civic_genome_external_snapshot_v1(duplicate)).toThrow(/component_id values/);

    const wrong_count = valid_snapshot();
    wrong_count.component_count = 9;
    expect(() => assert_civic_genome_external_snapshot_v1(wrong_count)).toThrow(/component_count/);
  });

  it("requires incomplete snapshots to preserve an unresolved condition", () => {
    const snapshot = valid_snapshot();
    snapshot.completeness_state = "incomplete";
    snapshot.unresolved_conditions = [];
    expect(() => assert_civic_genome_external_snapshot_v1(snapshot)).toThrow(/must state unresolved conditions/);
  });

  it("builds one semantic hash basis regardless of component and source order", () => {
    const first = valid_snapshot();
    const second = valid_snapshot();
    second.components.reverse();
    second.components.find(row => row.component_type === "trait")?.source_bindings.reverse();
    second.components.find(row => row.component_type === "trait")?.source_verification.reverse();
    second.scope.jurisdiction_codes.reverse();
    second.export_receipt.generated_at = "2026-08-03T22:46:00.000Z";

    expect(civic_genome_external_snapshot_hash_basis(first)).toEqual(
      civic_genome_external_snapshot_hash_basis(second),
    );
  });
});
