import { describe, expect, it } from "vitest";
import {
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
  type civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-contract";
import { canonicalSerialize, computeCanonicalHash } from "./lib/determinism";
import { sign_prism_request } from "./services/prism-verification-contract";
import {
  PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID,
  PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION,
  PRISM_CIVIC_GENOME_INTAKE_PATH,
  PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID,
  PrismCivicGenomeHandoffError,
  build_prism_civic_genome_snapshot_intake_body_v1,
  deliver_civic_genome_snapshot_to_prism_v1,
} from "./civic-genome-prism-snapshot-handoff";

const h = (character: string) => character.repeat(64);

function snapshot(): civic_genome_external_snapshot_v1 {
  return {
    contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    canonical_owner: "lighthouse/civic_genome",
    snapshot_id: "cg-family-snapshot-11111111111111111111111111111111",
    snapshot_kind: "baseline_export",
    immutable: true,
    scope: {
      scope_type: "family",
      scope_ids: ["a9620a24-9ae4-487d-a55b-5e646c729432"],
      jurisdiction_codes: ["WA"],
    },
    as_of: "2026-08-04T12:00:00.000Z",
    methodology_version: "civic_genome_external_family_snapshot.1.0.0",
    components: [],
    component_count: 0,
    unresolved_conditions: [],
    excluded_component_types: ["comparison_matrix", "comparison_state_cell"],
    completeness_state: "bounded_complete",
    snapshot_hash: h("a"),
    export_receipt: {
      export_receipt_id: "cg-export-11111111111111111111111111111111",
      export_receipt_hash: h("b"),
      snapshot_hash: h("a"),
      deterministic_replay_key: h("c"),
      replay_state: "original",
      source_commit_sha: "b47c3f6aaf0dbeeecf111d0a8fdd8cb64ddff394",
      generated_at: "2026-08-04T12:00:01.000Z",
    },
  };
}

function receipt(source: civic_genome_external_snapshot_v1) {
  const basis = {
    intake_contract_id: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_ID,
    intake_contract_version: PRISM_CIVIC_GENOME_INTAKE_CONTRACT_VERSION,
    validation_state: "validated_unbound" as const,
    authenticated: true as const,
    auth_scheme: "hmac-sha256" as const,
    source_schema_id: PRISM_CIVIC_GENOME_SOURCE_SCHEMA_ID,
    source_contract_id: source.contract_id,
    source_contract_version: source.contract_version,
    source_snapshot_id: source.snapshot_id,
    source_snapshot_hash: source.snapshot_hash,
    source_export_receipt_id: source.export_receipt.export_receipt_id,
    source_export_receipt_hash: source.export_receipt.export_receipt_hash,
    source_component_count: source.component_count,
    source_completeness_state: source.completeness_state,
    source_native_verification_preserved: true as const,
    mapping_state: "unresolved" as const,
    mapping_errors: [
      "prism_instance_mapping_rule_not_declared",
      "source_snapshot_validated_not_persisted",
    ],
    correlation_executed: false as const,
    verification_executed: false as const,
    persisted: false as const,
    no_mutation: true as const,
  };
  const intake_receipt_hash = computeCanonicalHash({
    ...basis,
    mapping_errors: [...basis.mapping_errors].sort(),
  });
  return {
    ...basis,
    intake_receipt_id: `pcg-intake-${intake_receipt_hash.slice(0, 32)}`,
    intake_receipt_hash,
  };
}

describe("Civic Genome snapshot handoff to Prism", () => {
  it("signs the exact immutable body and accepts only an unbound receipt", async () => {
    const source = snapshot();
    const secret = "s".repeat(64);
    const result = await deliver_civic_genome_snapshot_to_prism_v1({
      snapshot: source,
      base_url: "https://prism.example.test",
      secret,
      fetcher: async (url, init) => {
        expect(url).toBe(`https://prism.example.test${PRISM_CIVIC_GENOME_INTAKE_PATH}`);
        expect(init.method).toBe("POST");
        expect(init.body).toBe(canonicalSerialize(
          build_prism_civic_genome_snapshot_intake_body_v1(source),
        ));
        expect(init.headers["x-prism-client"]).toBe("lighthouse");
        expect(init.headers["x-prism-signature"]).toBe(sign_prism_request(
          secret,
          init.headers["x-prism-timestamp"],
          "POST",
          PRISM_CIVIC_GENOME_INTAKE_PATH,
          init.body,
        ));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(receipt(source)),
        };
      },
    });
    expect(result.validation_state).toBe("validated_unbound");
    expect(result.mapping_state).toBe("unresolved");
    expect(result.persisted).toBe(false);
    expect(result.correlation_executed).toBe(false);
    expect(result.verification_executed).toBe(false);
    expect(result.no_mutation).toBe(true);
  });

  it("rejects a receiver that silently claims persistence", async () => {
    const source = snapshot();
    const changed = { ...receipt(source), persisted: true };
    await expect(deliver_civic_genome_snapshot_to_prism_v1({
      snapshot: source,
      base_url: "https://prism.example.test",
      secret: "s".repeat(64),
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(changed),
      }),
    })).rejects.toMatchObject<Partial<PrismCivicGenomeHandoffError>>({
      error_code: "persisted_mismatch",
    });
  });

  it("rejects insecure transport before sending the snapshot", async () => {
    await expect(deliver_civic_genome_snapshot_to_prism_v1({
      snapshot: snapshot(),
      base_url: "http://prism.example.test",
      secret: "s".repeat(64),
      fetcher: async () => {
        throw new Error("should_not_send");
      },
    })).rejects.toMatchObject<Partial<PrismCivicGenomeHandoffError>>({
      error_code: "https_target_required",
    });
  });
});
