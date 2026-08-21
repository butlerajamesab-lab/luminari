import { describe, expect, it } from "vitest";
import {
  CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL,
  CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL,
  build_civic_genome_family_snapshot_v1,
  produce_current_civic_genome_family_snapshot_v1,
  produce_civic_genome_family_snapshot_v1,
  type civic_genome_external_family_dataset_v1,
} from "./civic-genome-external-snapshot-producer";

const FAMILY_ID = "a9620a24-9ae4-487d-a55b-5e646c729432";
const BILL_ID = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const TRAIT_ID = "11111111-1111-4111-8111-111111111111";
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const H3 = "3".repeat(64);
const H4 = "4".repeat(64);

function fixture(): civic_genome_external_family_dataset_v1 {
  return {
    family: {
      family_id: FAMILY_ID,
      family_key: "finance:insurer_tax",
      family_label: "Concerning taxes imposed on insurers.",
      policy_domain: "finance",
      family_status: "active",
      first_seen_at: "2026-07-04T22:47:10.000Z",
      last_seen_at: "2026-08-03T22:01:51.000Z",
      active_state_count: 1,
      enacted_state_count: 1,
      momentum_score: 0.02,
      signature_json: {
        assignment_method: "docket_title_policy_domain_signature_v1",
        policy_domain: "finance",
      },
      created_at: "2026-07-04T22:47:10.000Z",
      updated_at: "2026-08-03T22:01:51.000Z",
    },
    bills: [{
      genome_bill_id: BILL_ID,
      family_id: FAMILY_ID,
      bill_id: "22222222-2222-4222-8222-222222222222",
      state_code: "WA",
      source_bill_number: "HB2487",
      source_bill_title: "Concerning taxes imposed on insurers operating within the state.",
      bill_status: "legiscan_status_4",
      current_state_position: "enacted",
      structural_dna_hash: H1,
      structural_dna_json: {
        source_bill_id: 2073426,
        source_layer: "docket_room_cache",
        source_provider: "legiscan_get_master_list",
        docket_observation_hash: H2,
        rosetta_assembly: {
          extraction_run_id: "18",
          source_document_id: 17,
          verification_state: "complete",
          rosetta_engine_version: "rosetta-v3-deterministic-sql-1.0.0",
          rosetta_rule_set_version: "rosetta-five-layer-exact-patterns-1.0.0",
          rosetta_output_content_hash: H3,
        },
        rosetta_source_receipt: {
          engine_version: "rosetta-v3-deterministic-sql-1.0.0",
          rule_set_version: "rosetta-five-layer-exact-patterns-1.0.0",
          output_content_hash: H3,
        },
      },
      introduced_at: "2026-04-01T00:00:00.000Z",
      last_action_at: "2026-04-01T00:00:00.000Z",
      created_at: "2026-07-04T22:47:10.000Z",
      updated_at: "2026-08-03T22:01:51.000Z",
    }],
    traits: [{
      trait: {
        trait_id: TRAIT_ID,
        genome_bill_id: BILL_ID,
        trait_class: "workflow",
        trait_key: "deadline",
        normalized_value_json: { days: 30 },
        source_object_type: "workflow_step",
        source_object_id: "rosetta-object-1",
        source_block_id: "section-1",
        extraction_run_id: "18",
        source_document_id: 17,
        confidence_score: 1,
        signal_status: "confirmed",
        verification_state: "confirmed",
        trait_fingerprint: H1,
        methodology_version: "rosetta-five-layer-trait-map-v1",
        engine_version: "rosetta-v3-deterministic-sql-1.0.0",
        rule_version: "rosetta-five-layer-exact-patterns-1.0.0",
        content_hash: H3,
        source_trace: [{ source_document_id: 17, extraction_run_id: 18 }],
        created_at: "2026-08-01T10:00:00.000Z",
        updated_at: "2026-08-01T10:00:00.000Z",
      },
      prism_bindings: [{
        binding_id: "33333333-3333-4333-8333-333333333333",
        genome_bill_id: BILL_ID,
        trait_id: TRAIT_ID,
        prism_verification_receipt_id: "44444444-4444-4444-8444-444444444444",
        prism_engine_version: "1.1.1",
        prism_rule_set_id: "rosetta_structural_binding",
        prism_rule_set_version: "1.0.1",
        verification_status: "verified",
        input_hash: H3,
        output_hash: H4,
        deterministic_replay_key: H2,
        created_at: "2026-08-01T11:00:00.000Z",
      }],
    }],
    events: [{
      event_id: "55555555-5555-4555-8555-555555555555",
      family_id: FAMILY_ID,
      genome_bill_id: BILL_ID,
      state_code: "WA",
      event_type: "effective_date_set",
      event_timestamp: "2026-04-01T00:00:00.000Z",
      prior_status: "legiscan_status_4",
      next_status: "legiscan_status_4",
      event_payload_json: { next_state_position: "enacted" },
      created_at: "2026-07-31T17:32:03.000Z",
    }],
    lineage_edges: [],
    relationships: [],
    momentum_components: [],
    momentum_snapshots: [{
      momentum_snapshot_id: "66666666-6666-4666-8666-666666666666",
      family_id: FAMILY_ID,
      snapshot_date: "2026-08-03",
      active_state_count: 1,
      introduced_state_count: 0,
      enacted_state_count: 1,
      failed_state_count: 0,
      new_state_count: 0,
      velocity_score: 0.02,
      acceleration_score: 0,
      collapse_score: 0,
      created_at: "2026-08-03T03:39:29.000Z",
    }],
    unresolved_family_candidates: [{
      unresolved_candidate_id: "77777777-7777-4777-8777-777777777777",
      genome_bill_id: BILL_ID,
      policy_domain: "finance",
      resolution_reason: "insufficient_confirmed_traits",
      best_candidate_score: 0.25,
      competing_family_ids: ["88888888-8888-4888-8888-888888888888"],
      methodology_version: "weighted-confirmed-traits-v2",
      observed_at: "2026-08-01T10:04:03.000Z",
      resolved_at: null,
      created_at: "2026-08-01T10:04:03.000Z",
      updated_at: "2026-08-01T10:04:03.000Z",
    }],
  };
}

const options = {
  family_id: FAMILY_ID,
  as_of: "2026-08-03T22:24:00.000Z",
  source_commit_sha: "c23f4fc6d1904ef16eb186fcece8813c1a33a03d",
};

describe("Civic Genome external snapshot producer", () => {
  it("produces identical semantic hashes and receipt identities across replay", () => {
    const first = build_civic_genome_family_snapshot_v1(fixture(), {
      ...options,
      generated_at: "2026-08-03T22:25:00.000Z",
    });
    const reordered = fixture();
    reordered.bills.reverse();
    reordered.traits.reverse();
    reordered.traits[0].prism_bindings.reverse();
    reordered.events.reverse();
    reordered.momentum_snapshots.reverse();
    reordered.unresolved_family_candidates.reverse();
    const second = build_civic_genome_family_snapshot_v1(reordered, {
      ...options,
      generated_at: "2026-08-03T22:26:00.000Z",
      prior_snapshot_hash: first.snapshot_hash,
    });

    expect(second.snapshot_id).toBe(first.snapshot_id);
    expect(second.snapshot_hash).toBe(first.snapshot_hash);
    expect(second.export_receipt.export_receipt_id).toBe(first.export_receipt.export_receipt_id);
    expect(second.export_receipt.export_receipt_hash).toBe(first.export_receipt.export_receipt_hash);
    expect(second.export_receipt.deterministic_replay_key).toBe(
      first.export_receipt.deterministic_replay_key,
    );
    expect(first.export_receipt.replay_state).toBe("original");
    expect(second.export_receipt.replay_state).toBe("identical_replay");
    expect(second.component_count).toBe(6);
  });

  it("changes the component and snapshot hashes when source meaning changes", () => {
    const first = build_civic_genome_family_snapshot_v1(fixture(), options);
    const modified = fixture();
    modified.traits[0].trait.normalized_value_json = { days: 45 };
    const second = build_civic_genome_family_snapshot_v1(modified, options);

    const first_trait = first.components.find(row => row.component_type === "trait");
    const second_trait = second.components.find(row => row.component_type === "trait");
    expect(first_trait?.component_hash).not.toBe(second_trait?.component_hash);
    expect(first.snapshot_hash).not.toBe(second.snapshot_hash);
    expect(first.export_receipt.export_receipt_hash).not.toBe(second.export_receipt.export_receipt_hash);
  });

  it("executes only a repeatable-read read-only transaction", async () => {
    const statements: string[] = [];
    const dataset = fixture();
    const client = {
      async query<T>(statement: string) {
        statements.push(statement);
        if (statement === CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL) {
          return { rows: [{ dataset }] as T[] };
        }
        return { rows: [] as T[] };
      },
      release() {},
    };
    const pool = { async connect() { return client; } };

    const snapshot = await produce_civic_genome_family_snapshot_v1(options, { pool });
    expect(snapshot.component_count).toBe(6);
    expect(statements[0].toLowerCase()).toContain("repeatable read read only");
    expect(statements.at(-1)?.toLowerCase()).toBe("commit");
    expect(statements.join("\n")).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
  });

  it("raises a stale handoff as-of floor to the current source cursor in one read-only snapshot", async () => {
    const statements: Array<{ statement: string; values?: unknown[] }> = [];
    const current_as_of = "2026-08-03T22:30:00.000Z";
    const client = {
      async query<T>(statement: string, values?: unknown[]) {
        statements.push({ statement, values });
        if (statement === CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL) {
          return { rows: [{ as_of: current_as_of }] as T[] };
        }
        if (statement === CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL) {
          return { rows: [{ dataset: fixture() }] as T[] };
        }
        return { rows: [] as T[] };
      },
      release() {},
    };
    const pool = { async connect() { return client; } };

    const snapshot = await produce_current_civic_genome_family_snapshot_v1({
      family_id: FAMILY_ID,
      as_of_floor: "2026-08-03T22:24:00.000Z",
      source_commit_sha: options.source_commit_sha,
    }, { pool });

    expect(snapshot.as_of).toBe(current_as_of);
    expect(statements[0]?.statement.toLowerCase()).toContain("repeatable read read only");
    expect(statements[1]).toEqual({
      statement: CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL,
      values: [FAMILY_ID],
    });
    expect(statements[2]).toEqual({
      statement: CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL,
      values: [FAMILY_ID, current_as_of],
    });
    expect(statements.at(-1)?.statement.toLowerCase()).toBe("commit");
    expect(statements.map(row => row.statement).join("\n")).not.toMatch(
      /\b(insert|update|delete|truncate|drop|alter|create)\b/i,
    );
  });

  it("uses a database-derived millisecond ceiling for a microsecond source cursor", () => {
    expect(CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL).toContain(
      "date_trunc('milliseconds', current_cursor.as_of)",
    );
    expect(CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL).toContain(
      "interval '1 millisecond'",
    );
  });

  it("preserves a configured as-of floor that is already current", async () => {
    const current_as_of = "2026-08-03T22:01:51.000Z";
    const client = {
      async query<T>(statement: string) {
        if (statement === CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL) {
          return { rows: [{ as_of: current_as_of }] as T[] };
        }
        if (statement === CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL) {
          return { rows: [{ dataset: fixture() }] as T[] };
        }
        return { rows: [] as T[] };
      },
      release() {},
    };
    const pool = { async connect() { return client; } };
    const snapshot = await produce_current_civic_genome_family_snapshot_v1({
      family_id: FAMILY_ID,
      as_of_floor: options.as_of,
      source_commit_sha: options.source_commit_sha,
    }, { pool });

    expect(snapshot.as_of).toBe(options.as_of);
  });
});
