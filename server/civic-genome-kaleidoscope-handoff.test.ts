import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "./lib/determinism";
import type { civic_genome_external_snapshot_v1 } from "./civic-genome-external-snapshot-contract";
import {
  CIVIC_GENOME_KALEIDOSCOPE_AUTH_SCHEME,
  CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID,
  CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION,
  CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH,
  CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID,
  CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_ID,
  CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_VERSION,
  build_civic_genome_kaleidoscope_delivery_body_v1,
  deliver_civic_genome_snapshot_to_kaleidoscope_v1,
  sign_civic_genome_kaleidoscope_delivery_v1,
} from "./civic-genome-kaleidoscope-handoff";
import { civic_genome_kaleidoscope_handoff_configuration_from_environment } from "./civic-genome-kaleidoscope-handoff-startup";

const KEY_ID = "lighthouse-civic-genome-v1";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HASH1 = "1".repeat(64);
const HASH2 = "2".repeat(64);
const HASH3 = "3".repeat(64);
const HASH4 = "4".repeat(64);

function source_snapshot(): civic_genome_external_snapshot_v1 {
  return {
    contract_id: "civic_genome.external_snapshot.v1",
    contract_version: "1.0.0",
    canonical_owner: "lighthouse/civic_genome",
    snapshot_id: "cg-family-snapshot-proof",
    snapshot_kind: "baseline_export",
    immutable: true,
    scope: {
      scope_type: "family",
      scope_ids: ["a9620a24-9ae4-487d-a55b-5e646c729432"],
      jurisdiction_codes: ["WA"],
    },
    as_of: "2026-08-03T22:24:00.000Z",
    methodology_version: "civic_genome_external_family_snapshot.1.0.0",
    components: [{
      component_id: "civic_genome:family:a9620a24-9ae4-487d-a55b-5e646c729432",
      component_type: "family",
      canonical_record_id: "a9620a24-9ae4-487d-a55b-5e646c729432",
      inclusion_state: "current",
      jurisdiction_code: null,
      temporal_scope: "2026-08-03T22:01:51.000Z",
      value: { family_status: "active" },
      source_bindings: [{
        owner_service: "civic_genome",
        record_type: "civic_genome_family",
        record_id: "a9620a24-9ae4-487d-a55b-5e646c729432",
        receipt_id: null,
        content_hash: HASH1,
        engine_id: "civic_genome_family_resolver",
        engine_version: "weighted-confirmed-traits-v2",
        rule_id: "docket_title_policy_domain_signature_v1",
        rule_version: "1",
      }],
      source_verification: [{
        owner_service: "civic_genome",
        state: "active",
        receipt_id: null,
        evidence_hash: HASH1,
        mapping_state: "source_native_preserved",
      }],
      unresolved_conditions: [],
      component_hash: HASH2,
    }],
    component_count: 1,
    unresolved_conditions: [],
    excluded_component_types: ["comparison_matrix", "comparison_state_cell"],
    completeness_state: "bounded_complete",
    snapshot_hash: HASH3,
    export_receipt: {
      export_receipt_id: "cg-export-proof",
      export_receipt_hash: HASH4,
      snapshot_hash: HASH3,
      deterministic_replay_key: HASH1,
      replay_state: "original",
      source_commit_sha: "614294c36eddac4aad0acdb22bfb004599e73682",
      generated_at: "2026-08-03T22:25:00.000Z",
    },
  };
}

function receipt_for(snapshot: civic_genome_external_snapshot_v1, overrides: Record<string, unknown> = {}) {
  const basis: Record<string, unknown> = {
    delivery_contract_id: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_ID,
    delivery_contract_version: CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_CONTRACT_VERSION,
    validation_state: "validated_bound",
    authenticated: true,
    auth_scheme: CIVIC_GENOME_KALEIDOSCOPE_AUTH_SCHEME,
    key_id: KEY_ID,
    source_schema_id: CIVIC_GENOME_KALEIDOSCOPE_SOURCE_SCHEMA_ID,
    source_contract_id: snapshot.contract_id,
    source_contract_version: snapshot.contract_version,
    source_snapshot_id: snapshot.snapshot_id,
    source_snapshot_hash: snapshot.snapshot_hash,
    source_export_receipt_id: snapshot.export_receipt.export_receipt_id,
    source_export_receipt_hash: snapshot.export_receipt.export_receipt_hash,
    source_component_count: snapshot.component_count,
    source_completeness_state: snapshot.completeness_state,
    binding_id: "kcg-binding-proof",
    binding_hash: HASH2,
    binding_state: "accepted",
    binding_errors: [],
    verification_mapping_state: "mapped_by_declared_rule",
    verification_mapping_rule_id: CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_ID,
    verification_mapping_rule_version: CIVIC_GENOME_KALEIDOSCOPE_VERIFICATION_MAPPING_RULE_VERSION,
    persisted: false,
    projection_executed: false,
    no_mutation: true,
    ...overrides,
  };
  const receipt_hash = computeCanonicalHash({
    ...basis,
    binding_errors: [...basis.binding_errors as string[]].sort(),
  });
  return {
    ...basis,
    delivery_receipt_id: `kcg-delivery-${receipt_hash.slice(0, 32)}`,
    delivery_receipt_hash: receipt_hash,
  };
}

describe("Civic Genome authenticated Kaleidoscope handoff", () => {
  it("signs the v1.1 canonical delivery body deterministically", () => {
    const body = build_civic_genome_kaleidoscope_delivery_body_v1(source_snapshot());
    expect(body.delivery_contract_version).toBe("1.1.0");
    const first = sign_civic_genome_kaleidoscope_delivery_v1(body, KEY_ID, SECRET);
    const second = sign_civic_genome_kaleidoscope_delivery_v1(
      JSON.parse(JSON.stringify(body)),
      KEY_ID,
      SECRET,
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a declared-rule mapped transient binding and still forbids persistence", async () => {
    const snapshot = source_snapshot();
    let observed_headers: Record<string, string> | null = null;
    const receipt = await deliver_civic_genome_snapshot_to_kaleidoscope_v1({
      snapshot,
      url: `https://kaleidoscope.example${CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH}`,
      key_id: KEY_ID,
      secret: SECRET,
      fetcher: async (_url, init) => {
        observed_headers = init.headers;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(receipt_for(snapshot)),
        };
      },
    });
    expect(observed_headers?.["x-kaleidoscope-key-id"]).toBe(KEY_ID);
    expect(observed_headers?.["x-kaleidoscope-signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.validation_state).toBe("validated_bound");
    expect(receipt.binding_state).toBe("accepted");
    expect(receipt.verification_mapping_state).toBe("mapped_by_declared_rule");
    expect(receipt.binding_errors).toEqual([]);
    expect(receipt.persisted).toBe(false);
    expect(receipt.projection_executed).toBe(false);
  });

  it("accepts a mapped but unresolved receipt only for declared source-snapshot blockers", async () => {
    const snapshot = source_snapshot();
    const receipt = await deliver_civic_genome_snapshot_to_kaleidoscope_v1({
      snapshot,
      url: `https://kaleidoscope.example${CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH}`,
      key_id: KEY_ID,
      secret: SECRET,
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(receipt_for(snapshot, {
          validation_state: "validated_unbound",
          binding_state: "unresolved",
          binding_errors: ["source_snapshot_has_unresolved_conditions"],
        })),
      }),
    });
    expect(receipt.validation_state).toBe("validated_unbound");
    expect(receipt.binding_state).toBe("unresolved");
    expect(receipt.binding_errors).toEqual(["source_snapshot_has_unresolved_conditions"]);
    expect(receipt.persisted).toBe(false);
  });

  it("rejects an unmapped receiver response on the v1.1 path", async () => {
    const snapshot = source_snapshot();
    await expect(deliver_civic_genome_snapshot_to_kaleidoscope_v1({
      snapshot,
      url: `https://kaleidoscope.example${CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH}`,
      key_id: KEY_ID,
      secret: SECRET,
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(receipt_for(snapshot, {
          validation_state: "validated_unbound",
          binding_state: "unresolved",
          binding_errors: ["verification_mapping_rule_not_declared"],
          verification_mapping_state: "unmapped_source_native",
          verification_mapping_rule_id: null,
          verification_mapping_rule_version: null,
        })),
      }),
    })).rejects.toThrow(/verification_mapping_state_mismatch/);
  });

  it("rejects a receiver response that claims persistence", async () => {
    const snapshot = source_snapshot();
    await expect(deliver_civic_genome_snapshot_to_kaleidoscope_v1({
      snapshot,
      url: `https://kaleidoscope.example${CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH}`,
      key_id: KEY_ID,
      secret: SECRET,
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(receipt_for(snapshot, { persisted: true })),
      }),
    })).rejects.toThrow(/persisted_mismatch/);
  });

  it("requires a complete environment set and preserves the exact as-of time", () => {
    expect(civic_genome_kaleidoscope_handoff_configuration_from_environment({})).toBeNull();
    expect(() => civic_genome_kaleidoscope_handoff_configuration_from_environment({
      CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_FAMILY_ID: "a9620a24-9ae4-487d-a55b-5e646c729432",
    })).toThrow(/requires_complete_configuration/);

    const configured = civic_genome_kaleidoscope_handoff_configuration_from_environment({
      CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_FAMILY_ID: "a9620a24-9ae4-487d-a55b-5e646c729432",
      CIVIC_GENOME_KALEIDOSCOPE_HANDOFF_AS_OF: "2026-08-03T22:24:00Z",
      KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_URL:
        `https://kaleidoscope.example${CIVIC_GENOME_KALEIDOSCOPE_DELIVERY_PATH}`,
      KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_KEY_ID: KEY_ID,
      KALEIDOSCOPE_CIVIC_GENOME_HANDSHAKE_SECRET: SECRET,
    });
    expect(configured?.as_of).toBe("2026-08-03T22:24:00.000Z");
  });
});