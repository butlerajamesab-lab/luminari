import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query_with_diagnostics } from "../db";
import {
  prism_rosetta_queue_batch_ids,
  start_prism_rosetta_queue_worker,
  stop_prism_rosetta_queue_worker,
} from "./prism-rosetta-queue-worker";
import { reset_prism_rosetta_circuit } from "./prism-rosetta-client";

vi.mock("../db", () => ({ query_with_diagnostics: vi.fn() }));
vi.mock("../runtime-role", () => ({ background_feature_enabled: () => true }));
// Exercise the real queue, activation, source transport, client and receipt
// integrity checks. Contract shape validation has its own independent suite.
vi.mock("./prism-verification-contract", async () => {
  const { createHash } = await import("node:crypto");
  return {
    PRISM_ROSETTA_ENGINE_VERSION: "2.4.0",
    PRISM_ROSETTA_RULE_SET_ID: "prism-rosetta-structural-binding",
    PRISM_ROSETTA_RULE_SET_VERSION: "2.4.0",
    PRISM_ROSETTA_RULE_SET_HASH: "f".repeat(64),
    canonical_json: JSON.stringify,
    sha256_hex: (value: string) => createHash("sha256").update(value).digest("hex"),
    rosetta_semantic_request_payload: (value: unknown) => value,
    sign_prism_request: () => "test-signature",
    prism_receipt_schema: { parse: (value: unknown) => value },
    rosetta_binding_request_schema: { parse: (value: unknown) => value },
    deep_rosetta_binding_request_schema: { parse: (value: unknown) => value },
  };
});
vi.mock("./prism-rosetta-contract-v2", async () => import("./prism-verification-contract"));
vi.mock("./prism-verification-client", () => ({
  PRISM_BASE_URL: "https://prism.example",
  PrismBoundaryError: class extends Error {
    constructor(public failure_class: string, public http_status: number, message: string) { super(message); }
  },
}));

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
let fixtures: any[];
let bindings: Map<string, any>;
let receipts: Map<string, any>;
let runs: Map<string, any>;
let sent: string[];
let block_publication: Set<number>;
let source_failure: Set<number>;
let prism_failures: number;
let fixture_generation = 0;

function seed(count: number, traits_per_job = 1) {
  fixtures = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const text = `The agency must process application ${id}.`;
    const provenance = {
      rosetta_source_identity_hash: hash(`identity:${id}`),
      rosetta_source_content_hash: hash(text),
      rosetta_output_content_hash: hash(`output:${id}`),
      rosetta_rule_manifest_hash: hash("rules"),
      rosetta_configuration_hash: hash("configuration"),
    };
    const assembly = {
      assembly_run_id: uuid(100 + id), genome_bill_id: uuid(200 + id),
      source_document_id: id, extraction_run_id: String(id),
      input_hash: hash(`assembly-input:${fixture_generation}:${id}`),
      output_hash: hash(`assembly-output:${fixture_generation}:${id}`),
      verification_state: "complete", trait_count: traits_per_job, run_status: "completed",
      completed_at: "2026-01-01T00:00:00.000Z", rosetta_engine_version: "test-engine",
      rosetta_rule_set_version: "test-rule", rosetta_source_url: `https://law.example/${id}`,
      rosetta_source_version: "test-version", ...provenance,
    };
    const traits = Array.from({ length: traits_per_job }, (_, trait_index) => {
      const trace = {
        source_document_id: id, source_object_type: "workflow", source_object_id: `object:${id}:${trait_index}`,
        source_block_id: `block:${id}`, extraction_run_id: String(id), ...provenance,
        source_span: { char_offset_start: 0, char_offset_end: text.length, block_content_hash: hash(text) },
      };
      return {
        trait_id: uuid(1000 + id * 100 + trait_index), genome_bill_id: assembly.genome_bill_id,
        trait_class: "workflow", trait_key: `workflow:${trait_index}`, ...trace,
        trait_fingerprint: hash(`fingerprint:${id}:${trait_index}`), source_trace: [trace],
        verification_state: "confirmed", engine_version: "test-engine", rule_version: "test-rule",
        content_hash: hash(`trait:${id}:${trait_index}`), normalized_value_json: { action: "process" },
      };
    });
    return {
      text, assembly, traits,
      job: { queue_id: uuid(id), genome_bill_id: assembly.genome_bill_id, assembly_run_id: assembly.assembly_run_id,
        expected_trait_count: traits_per_job, receipt_count: 0, attempt_count: 0, queue_state: "eligible",
        next_attempt_at: 0, prism_rule_set_version: "2.4.0" },
    };
  });
}

function fake_database(_sql: string, p: any[], o: any): any {
  const by_assembly = fixtures.find((f) => f.assembly.assembly_run_id === p[0] || f.assembly.assembly_run_id === p[1]);
  const by_bill = fixtures.find((f) => f.assembly.genome_bill_id === p[0]);
  switch (o.label) {
    case "prism_rosetta_queue_reconcile_completed":
    case "prism_rosetta_queue_replenish_v25": return { rows: [] };
    case "prism_rosetta_queue_claim": {
      expect(_sql).toContain("queue.queue_state in ('eligible', 'degraded', 'receipt_partial')");
      expect(_sql).toContain("queue.queue_id = any($6::uuid[])");
      const f = fixtures.find(({ job }) => job.prism_rule_set_version === p[2]
        && ["eligible", "degraded", "receipt_partial"].includes(job.queue_state)
        && job.next_attempt_at <= Date.now() && (!p[4] || job.queue_id === p[4])
        && (!p[5] || p[5].includes(job.queue_id)) && (!p[6] || p[6].includes(job.queue_id)));
      if (!f) return { rows: [] };
      f.job.queue_state = "submitted";
      return { rows: [{ ...f.job }] };
    }
    case "prism_rosetta_queue_complete": {
      const f = fixtures.find((f) => f.job.queue_id === p[0]);
      Object.assign(f.job, { queue_state: "completed", receipt_count: p[1] });
      return { rows: [] };
    }
    case "prism_rosetta_queue_fail": {
      const f = fixtures.find((f) => f.job.queue_id === p[0]);
      Object.assign(f.job, { queue_state: p[1], receipt_count: p[2], last_failure_class: p[3],
        attempt_count: f.job.attempt_count + 1, next_attempt_at: Date.now() + p[6] * 1000 });
      return { rows: [] };
    }
    case "prism_rosetta_queue_receipt_count": return { rows: [{ receipt_count: [...bindings.values()].filter((b) => b.assembly_run_id === p[0]).length }] };
    case "prism_rosetta_load_assembly": return { rows: [by_bill.assembly] };
    case "prism_rosetta_load_traits":
    case "prism_rosetta_load_structural_peer_traits": return { rows: by_bill.traits };
    case "prism_rosetta_load_document_context": return { rows: [{ document_family: "text", adopted: null }] };
    case "prism_rosetta_load_existing_binding_receipts": return { rows: [...bindings.values()].filter((b) => b.assembly_run_id === p[0]).map((b) => ({ trait_id: b.trait_id, ...receipts.get(b.request_id), verification_receipt_id: b.prism_verification_receipt_id })) };
    case "prism_rosetta_record_request": return { rows: [{ input_hash: p[11] }] };
    case "prism_rosetta_record_attempt":
    case "prism_rosetta_complete_request":
    case "prism_rosetta_fail_request": return { rows: [] };
    case "prism_rosetta_mirror_receipt": receipts.set(p[1], { verification_receipt_id: p[0], request_id: p[1], prism_engine_version: p[2], rule_set_id: p[3], rule_set_version: p[4], rule_set_hash: p[5], input_hash: p[6], output_hash: p[7], status: p[8], supported_findings: JSON.parse(p[9]), contradictions: JSON.parse(p[10]), missing_evidence: JSON.parse(p[11]), unresolved_conditions: JSON.parse(p[12]), cited_evidence_identifiers: JSON.parse(p[13]), deterministic_replay_key: p[14], completion_timestamp: p[15] }); return { rows: [] };
    case "prism_rosetta_verify_mirror": return { rows: [{ ...receipts.get(p[0]), prism_verification_receipt_id: receipts.get(p[0]).verification_receipt_id }] };
    case "prism_rosetta_persist_binding": bindings.set(p[2], { genome_bill_id: p[0], assembly_run_id: p[1], trait_id: p[2], request_id: p[6], prism_verification_receipt_id: p[7], input_hash: p[13], output_hash: p[14] }); return { rows: [] };
    case "prism_rosetta_verify_binding": return { rows: [bindings.get(p[0])] };
    case "prism_rosetta_persist_run": runs.set(p[1], { verification_run_id: uuid(10000 + by_assembly.assembly.source_document_id), expected_trait_count: p[7], receipt_count: p[8], status_counts: JSON.parse(p[9]), input_hash: p[10], output_hash: p[11], receipt_manifest_hash: p[12] }); return { rows: [runs.get(p[1])] };
    case "prism_rosetta_verify_run": return { rows: [runs.get(p[0])] };
    default: throw new Error(`Unexpected database operation: ${o.label}`);
  }
}

function fake_fetch(raw_url: string, options: any) {
  const url = new URL(raw_url);
  if (url.pathname.endsWith("v_civic_genome_law_view_v1")) {
    const id = Number(url.searchParams.get("source_document_id")!.slice(3));
    const { assembly } = fixtures[id - 1];
    return new Response(JSON.stringify(block_publication.has(id) ? [] : [{
      extraction_run_id: id, source_document_id: id, source_identity_hash: assembly.rosetta_source_identity_hash,
      source_content_hash: assembly.rosetta_source_content_hash, output_content_hash: assembly.rosetta_output_content_hash,
      rule_manifest_hash: assembly.rosetta_rule_manifest_hash, configuration_hash: assembly.rosetta_configuration_hash,
    }]));
  }
  if (url.pathname.endsWith("source_document_content")) {
    const id = Number(url.searchParams.get("source_document_id")!.slice(3));
    if (source_failure.has(id)) return new Response("{}", { status: 503 });
    const { assembly, text } = fixtures[id - 1];
    return new Response(JSON.stringify([{ source_text: text, source_url: assembly.rosetta_source_url,
      source_version: assembly.rosetta_source_version, media_type: "text/plain",
      source_identity_hash: assembly.rosetta_source_identity_hash, source_content_hash: assembly.rosetta_source_content_hash }]));
  }
  expect(url.pathname).toBe("/api/v1/verification-requests");
  const request = JSON.parse(options.body);
  sent.push(request.request_id);
  if (prism_failures-- > 0) return new Response("{}", { status: 503 });
  const output = { prism_engine_version: "2.4.0", rule_set_id: request.rule_set_id, rule_set_version: "2.4.0",
    status: "supported_by_one_source", supported_findings: [], contradictions: [], missing_evidence: [],
    unresolved_conditions: [], cited_evidence_identifiers: [] };
  const input_hash = hash(JSON.stringify(request));
  return new Response(JSON.stringify({ ...output, verification_receipt_id: uuid(30000 + sent.length), request_id: request.request_id,
    rule_set_hash: "f".repeat(64), input_hash, output_hash: hash(JSON.stringify(output)),
    deterministic_replay_key: hash(`${"f".repeat(64)}:${input_hash}`), completion_timestamp: new Date().toISOString(), idempotency_reused: false }));
}

describe("bounded Prism batches through the actual queue and HTTP submission path", () => {
  beforeEach(() => {
    fixture_generation += 1;
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example");
    vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test_placeholder");
    vi.stubEnv("PRISM_BRIDGE_SECRET", "test-secret"); vi.stubEnv("RENDER_GIT_COMMIT", "a".repeat(40));
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", ""); vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", "");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS", "25");
    bindings = new Map(); receipts = new Map(); runs = new Map(); sent = [];
    block_publication = new Set(); source_failure = new Set(); prism_failures = 0;
    reset_prism_rosetta_circuit();
    vi.mocked(query_with_diagnostics).mockImplementation(async (sql, p, o) => fake_database(sql, p, o));
    vi.stubGlobal("fetch", vi.fn(async (url, options) => fake_fetch(url, options)));
  });
  afterEach(async () => { await stop_prism_rosetta_queue_worker(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("submits 25 distinct requests across 25 jobs and never starts the 26th", async () => {
    seed(26); start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(400_000);
    expect(new Set(sent).size).toBe(25); expect(sent).toHaveLength(25);
    expect(fixtures.filter((f) => f.job.queue_state === "completed")).toHaveLength(25);
    expect(fixtures[25].job.queue_state).toBe("eligible"); expect(receipts.size).toBe(25);
  });
  it.each(["publication", "source"])("does not spend the allowance on a failed %s read", async (kind) => {
    seed(2); vi.stubEnv("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS", "1");
    (kind === "publication" ? block_publication : source_failure).add(1);
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(25_000);
    expect(fixtures[0].job.queue_state).toBe("degraded");
    expect(fixtures[1].job.queue_state).toBe("completed"); expect(sent).toHaveLength(1);
  });
  it("retries the same charged request after cap exhaustion without admitting another job", async () => {
    seed(2); vi.stubEnv("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS", "1"); prism_failures = 1;
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(930_000);
    expect(sent).toHaveLength(2); expect(new Set(sent).size).toBe(1);
    expect(fixtures[0].job.queue_state).toBe("completed"); expect(fixtures[1].job.queue_state).toBe("eligible");
  });
  it("applies the batch UUID allowlist and leaves terminal jobs untouched", async () => {
    seed(4); fixtures[1].job.queue_state = "permanent_failure";
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", [uuid(2), uuid(3)].join(","));
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(35_000);
    expect(fixtures.map((f) => f.job.queue_state)).toEqual(["eligible", "permanent_failure", "completed", "eligible"]);
    expect(sent).toHaveLength(1);
  });
  it("preserves the existing single-canary selector", async () => {
    seed(2); vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(2));
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(25_000);
    expect(fixtures[0].job.queue_state).toBe("eligible"); expect(fixtures[1].job.queue_state).toBe("completed");
  });
  it("preserves the default allowance of one submission", async () => {
    seed(2); vi.stubEnv("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS", "");
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(25_000);
    expect(sent).toHaveLength(1);
    expect(fixtures.map((f) => f.job.queue_state)).toEqual(["completed", "eligible"]);
  });
  it("keeps a larger assembly partial at the exact cap without charging its remaining traits", async () => {
    seed(1, 26); start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(40_000);
    expect(sent).toHaveLength(25); expect(bindings.size).toBe(25);
    expect(fixtures[0].job.queue_state).toBe("receipt_partial"); expect(runs.size).toBe(0);
  });
  it.each(["bad-id", `${uuid(1)},${uuid(1)}`, `${uuid(1)},`, Array.from({ length: 26 }, (_, i) => uuid(i)).join(",")])(
    "rejects invalid batch selection before worker startup: %s", async (value) => {
      seed(1); vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", value);
      const queries_before = vi.mocked(query_with_diagnostics).mock.calls.length;
      start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(20_000);
      expect(vi.mocked(query_with_diagnostics).mock.calls.length).toBe(queries_before); expect(sent).toHaveLength(0);
    },
  );
  it("rejects simultaneous canary and batch selectors before worker startup", async () => {
    expect(() => prism_rosetta_queue_batch_ids(uuid(1), uuid(2))).toThrow("selection_conflict");
    seed(2); vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(1));
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", uuid(2));
    const queries_before = vi.mocked(query_with_diagnostics).mock.calls.length;
    start_prism_rosetta_queue_worker(); await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.mocked(query_with_diagnostics).mock.calls.length).toBe(queries_before);
    expect(sent).toHaveLength(0);
  });
});
