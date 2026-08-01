import { query_with_diagnostics } from "../db";
import {
  PRISM_ROSETTA_ENGINE_VERSION,
  PRISM_ROSETTA_RULE_SET_HASH,
  PRISM_ROSETTA_RULE_SET_ID,
  PRISM_ROSETTA_RULE_SET_VERSION,
  canonical_json,
  rosetta_binding_request_schema,
  sha256_hex,
  type PrismReceipt,
  type RosettaBindingRequest,
} from "./prism-verification-contract";
import { submit_rosetta_prism_request } from "./prism-rosetta-client";

export const LIGHTHOUSE_PRISM_ROSETTA_RUNTIME_VERSION =
  "lighthouse-prism-rosetta-v1";
const PRISM_CONCURRENCY = 6;

type AssemblyRow = {
  assembly_run_id: string;
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id: string;
  input_hash: string;
  output_hash: string;
  verification_state: string;
  trait_count: number;
  run_status: string;
  completed_at: string;
  rosetta_engine_version: string;
  rosetta_rule_set_version: string;
  rosetta_rule_manifest_hash: string;
  rosetta_configuration_hash: string;
  rosetta_source_identity_hash: string;
  rosetta_source_content_hash: string;
  rosetta_output_content_hash: string;
  rosetta_source_url: string;
  rosetta_source_version: string;
};

type TraitClass =
  | "help"
  | "workflow"
  | "accountability"
  | "override"
  | "definition";

type TraitRow = {
  trait_id: string;
  genome_bill_id: string;
  trait_class: TraitClass;
  trait_key: string;
  source_object_type: string;
  source_object_id: string;
  source_block_id: string;
  extraction_run_id: string;
  trait_fingerprint: string;
  source_trace: unknown;
  source_document_id: number;
  verification_state: string;
  engine_version: string;
  rule_version: string;
  content_hash: string;
};

type SourceTrace = {
  source_document_id: number;
  source_object_type: string;
  source_object_id: string;
  source_block_id: string;
  extraction_run_id: string;
  source_span: {
    char_offset_start: number;
    char_offset_end: number;
    block_content_hash: string;
  };
  rosetta_rule_manifest_hash: string;
  rosetta_configuration_hash: string;
  rosetta_source_identity_hash: string;
  rosetta_source_content_hash: string;
  rosetta_output_content_hash: string;
};

export type PrismRosettaActivationResult = {
  verification_run_id: string;
  genome_bill_id: string;
  assembly_run_id: string;
  expected_trait_count: number;
  receipt_count: number;
  status_counts: Record<string, number>;
  input_hash: string;
  output_hash: string;
  receipt_manifest_hash: string;
  replayed: boolean;
};

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function required_string(
  record: Record<string, unknown>,
  key: string,
  error_code: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(error_code);
  return value;
}

function parse_source_trace(trait: TraitRow): SourceTrace {
  if (!Array.isArray(trait.source_trace) || trait.source_trace.length === 0) {
    throw new Error(`prism_rosetta_source_trace_missing:${trait.trait_id}`);
  }
  const trace = trait.source_trace[0];
  if (!is_record(trace) || !is_record(trace.source_span)) {
    throw new Error(`prism_rosetta_source_trace_invalid:${trait.trait_id}`);
  }
  const start = trace.source_span.char_offset_start;
  const end = trace.source_span.char_offset_end;
  if (
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 0 ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    end <= start
  ) {
    throw new Error(`prism_rosetta_source_span_invalid:${trait.trait_id}`);
  }
  const source_document_id = trace.source_document_id;
  if (typeof source_document_id !== "number" || !Number.isInteger(source_document_id)) {
    throw new Error(`prism_rosetta_source_document_invalid:${trait.trait_id}`);
  }
  return {
    source_document_id,
    source_object_type: required_string(
      trace,
      "source_object_type",
      `prism_rosetta_source_object_type_missing:${trait.trait_id}`,
    ),
    source_object_id: required_string(
      trace,
      "source_object_id",
      `prism_rosetta_source_object_id_missing:${trait.trait_id}`,
    ),
    source_block_id: required_string(
      trace,
      "source_block_id",
      `prism_rosetta_source_block_id_missing:${trait.trait_id}`,
    ),
    extraction_run_id: required_string(
      trace,
      "extraction_run_id",
      `prism_rosetta_extraction_run_missing:${trait.trait_id}`,
    ),
    source_span: {
      char_offset_start: start,
      char_offset_end: end,
      block_content_hash: required_string(
        trace.source_span,
        "block_content_hash",
        `prism_rosetta_block_hash_missing:${trait.trait_id}`,
      ),
    },
    rosetta_rule_manifest_hash: required_string(
      trace,
      "rosetta_rule_manifest_hash",
      `prism_rosetta_rule_manifest_missing:${trait.trait_id}`,
    ),
    rosetta_configuration_hash: required_string(
      trace,
      "rosetta_configuration_hash",
      `prism_rosetta_configuration_missing:${trait.trait_id}`,
    ),
    rosetta_source_identity_hash: required_string(
      trace,
      "rosetta_source_identity_hash",
      `prism_rosetta_source_identity_missing:${trait.trait_id}`,
    ),
    rosetta_source_content_hash: required_string(
      trace,
      "rosetta_source_content_hash",
      `prism_rosetta_source_content_missing:${trait.trait_id}`,
    ),
    rosetta_output_content_hash: required_string(
      trace,
      "rosetta_output_content_hash",
      `prism_rosetta_output_content_missing:${trait.trait_id}`,
    ),
  };
}

function assert_identity(
  assembly: AssemblyRow,
  trait: TraitRow,
  trace: SourceTrace,
): void {
  const checks: Array<[unknown, unknown, string]> = [
    [trait.genome_bill_id, assembly.genome_bill_id, "genome_bill"],
    [trait.source_document_id, assembly.source_document_id, "source_document"],
    [trace.source_document_id, assembly.source_document_id, "trace_source_document"],
    [trait.extraction_run_id, assembly.extraction_run_id, "extraction_run"],
    [trace.extraction_run_id, assembly.extraction_run_id, "trace_extraction_run"],
    [trait.source_object_id, trace.source_object_id, "source_object"],
    [trait.source_object_type, trace.source_object_type, "source_object_type"],
    [trait.source_block_id, trace.source_block_id, "source_block"],
    [trace.rosetta_rule_manifest_hash, assembly.rosetta_rule_manifest_hash, "rule_manifest"],
    [trace.rosetta_configuration_hash, assembly.rosetta_configuration_hash, "configuration"],
    [trace.rosetta_source_identity_hash, assembly.rosetta_source_identity_hash, "source_identity"],
    [trace.rosetta_source_content_hash, assembly.rosetta_source_content_hash, "source_content"],
    [trace.rosetta_output_content_hash, assembly.rosetta_output_content_hash, "rosetta_output"],
    [trait.engine_version, assembly.rosetta_engine_version, "engine_version"],
    [trait.rule_version, assembly.rosetta_rule_set_version, "rule_set_version"],
  ];
  const mismatch = checks.find(([observed, expected]) => observed !== expected);
  if (mismatch) {
    throw new Error(`prism_rosetta_identity_mismatch:${trait.trait_id}:${mismatch[2]}`);
  }
  if (trait.verification_state !== "confirmed") {
    throw new Error(`prism_rosetta_trait_not_confirmed:${trait.trait_id}`);
  }
}

export function build_rosetta_binding_request(input: {
  assembly: AssemblyRow;
  trait: TraitRow;
  lighthouse_commit: string;
}): RosettaBindingRequest {
  const { assembly, trait } = input;
  const trace = parse_source_trace(trait);
  assert_identity(assembly, trait, trace);
  const source_trace_hash = sha256_hex(canonical_json(trait.source_trace));
  const request_identity = sha256_hex(canonical_json({
    assembly_run_id: assembly.assembly_run_id,
    trait_id: trait.trait_id,
    trait_content_hash: trait.content_hash,
    prism_rule_set_id: PRISM_ROSETTA_RULE_SET_ID,
    prism_rule_set_version: PRISM_ROSETTA_RULE_SET_VERSION,
  }));
  const evidence_document_id =
    `rosetta-source-document:${assembly.source_document_id}`;
  return rosetta_binding_request_schema.parse({
    request_id: `prism-rosetta-v1-${request_identity}`,
    lighthouse_case_id: assembly.genome_bill_id,
    evidence_document_id,
    evidence_fingerprint: trait.trait_fingerprint,
    source_content_hash: assembly.rosetta_source_content_hash,
    claim_assertion_id: trait.source_object_id,
    rule_set_id: PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: PRISM_ROSETTA_RULE_SET_VERSION,
    requested_checks: [
      "verify_identity_chain",
      "verify_hash_chain",
      "verify_source_binding",
      "verify_rule_binding",
      "classify_support_state",
    ],
    originating_lighthouse_commit: input.lighthouse_commit,
    originating_lighthouse_runtime_version:
      LIGHTHOUSE_PRISM_ROSETTA_RUNTIME_VERSION,
    subject_type: "civic_genome_trait",
    subject_id: trait.trait_id,
    evidence_refs: [{
      evidence_id: `rosetta-object:${trait.source_object_id}`,
      document_id: evidence_document_id,
      evidence_fingerprint: trait.trait_fingerprint,
      source_content_hash: assembly.rosetta_source_content_hash,
      relationship: "supports",
      independent_source_id:
        `rosetta-source:${assembly.rosetta_source_identity_hash}`,
    }],
    rosetta_binding: {
      genome_bill_id: assembly.genome_bill_id,
      assembly_run_id: assembly.assembly_run_id,
      source_document_id: assembly.source_document_id,
      extraction_run_id: assembly.extraction_run_id,
      trait_id: trait.trait_id,
      trait_class: trait.trait_class,
      trait_key: trait.trait_key,
      source_object_type: trait.source_object_type,
      source_object_id: trait.source_object_id,
      source_block_id: trait.source_block_id,
      source_span: trace.source_span,
      trait_fingerprint: trait.trait_fingerprint,
      trait_content_hash: trait.content_hash,
      source_trace_hash,
      assembly_input_hash: assembly.input_hash,
      assembly_output_hash: assembly.output_hash,
      rosetta_source_identity_hash: assembly.rosetta_source_identity_hash,
      rosetta_source_content_hash: assembly.rosetta_source_content_hash,
      rosetta_output_content_hash: assembly.rosetta_output_content_hash,
      rosetta_rule_manifest_hash: assembly.rosetta_rule_manifest_hash,
      rosetta_configuration_hash: assembly.rosetta_configuration_hash,
    },
  });
}

async function load_assembly(input: {
  genome_bill_id: string;
  assembly_run_id?: string;
}): Promise<AssemblyRow> {
  const result = await query_with_diagnostics<AssemblyRow>(
    `select assembly_run_id::text, genome_bill_id::text, source_document_id,
            extraction_run_id, input_hash, output_hash, verification_state,
            trait_count, run_status, completed_at,
            rosetta_engine_version, rosetta_rule_set_version,
            rosetta_rule_manifest_hash, rosetta_configuration_hash,
            rosetta_source_identity_hash, rosetta_source_content_hash,
            rosetta_output_content_hash, rosetta_source_url,
            rosetta_source_version
       from public.civic_genome_assembly_run
      where genome_bill_id = $1::uuid
        and ($2::uuid is null or assembly_run_id = $2::uuid)
      order by completed_at desc, assembly_run_id desc
      limit 1`,
    [input.genome_bill_id, input.assembly_run_id ?? null],
    {
      label: "prism_rosetta_load_assembly",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const assembly = result.rows[0];
  if (!assembly) throw new Error("prism_rosetta_assembly_not_found");
  if (assembly.run_status !== "completed") {
    throw new Error("prism_rosetta_assembly_not_completed");
  }
  if (assembly.verification_state !== "complete") {
    throw new Error("prism_rosetta_assembly_not_complete");
  }
  const required = [
    assembly.input_hash,
    assembly.output_hash,
    assembly.rosetta_engine_version,
    assembly.rosetta_rule_set_version,
    assembly.rosetta_rule_manifest_hash,
    assembly.rosetta_configuration_hash,
    assembly.rosetta_source_identity_hash,
    assembly.rosetta_source_content_hash,
    assembly.rosetta_output_content_hash,
    assembly.rosetta_source_url,
    assembly.rosetta_source_version,
  ];
  if (required.some((value) => !value)) {
    throw new Error("prism_rosetta_assembly_receipt_incomplete");
  }
  return assembly;
}

async function load_traits(assembly: AssemblyRow): Promise<TraitRow[]> {
  const result = await query_with_diagnostics<TraitRow>(
    `select trait_id::text, genome_bill_id::text, trait_class, trait_key,
            source_object_type, source_object_id, source_block_id,
            extraction_run_id, trait_fingerprint, source_trace,
            source_document_id, verification_state, engine_version,
            rule_version, content_hash
       from public.civic_genome_trait
      where genome_bill_id = $1::uuid
        and source_document_id = $2
        and extraction_run_id = $3
      order by trait_id`,
    [
      assembly.genome_bill_id,
      assembly.source_document_id,
      assembly.extraction_run_id,
    ],
    {
      label: "prism_rosetta_load_traits",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  if (result.rows.length !== assembly.trait_count) {
    throw new Error(
      `prism_rosetta_trait_count_mismatch:${assembly.trait_count}:${result.rows.length}`,
    );
  }
  if (result.rows.length === 0) {
    throw new Error("prism_rosetta_traits_missing");
  }
  return result.rows;
}

async function map_bounded<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next_index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = next_index;
        next_index += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function persist_binding(input: {
  assembly: AssemblyRow;
  trait: TraitRow;
  receipt: PrismReceipt;
}): Promise<void> {
  const { assembly, trait, receipt } = input;
  await query_with_diagnostics(
    `insert into public.civic_genome_prism_verification_binding (
       genome_bill_id, assembly_run_id, trait_id, source_document_id,
       extraction_run_id, source_object_id, request_id,
       prism_verification_receipt_id, prism_engine_version,
       prism_rule_set_id, prism_rule_set_version, prism_rule_set_hash,
       verification_status, input_hash, output_hash,
       deterministic_replay_key
     ) values (
       $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::uuid,$9,$10,$11,$12,$13,$14,$15,$16
     ) on conflict (trait_id, prism_rule_set_id, prism_rule_set_version) do nothing`,
    [
      assembly.genome_bill_id,
      assembly.assembly_run_id,
      trait.trait_id,
      assembly.source_document_id,
      assembly.extraction_run_id,
      trait.source_object_id,
      receipt.request_id,
      receipt.verification_receipt_id,
      receipt.prism_engine_version,
      receipt.rule_set_id,
      receipt.rule_set_version,
      receipt.rule_set_hash,
      receipt.status,
      receipt.input_hash,
      receipt.output_hash,
      receipt.deterministic_replay_key,
    ],
    {
      label: "prism_rosetta_persist_binding",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const existing = await query_with_diagnostics<{
    request_id: string;
    prism_verification_receipt_id: string;
    input_hash: string;
    output_hash: string;
  }>(
    `select request_id, prism_verification_receipt_id::text,
            input_hash, output_hash
       from public.civic_genome_prism_verification_binding
      where trait_id = $1::uuid
        and prism_rule_set_id = $2
        and prism_rule_set_version = $3`,
    [trait.trait_id, receipt.rule_set_id, receipt.rule_set_version],
    {
      label: "prism_rosetta_verify_binding",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.request_id !== receipt.request_id ||
    row.prism_verification_receipt_id !== receipt.verification_receipt_id ||
    row.input_hash !== receipt.input_hash ||
    row.output_hash !== receipt.output_hash
  ) {
    throw new Error(`prism_rosetta_binding_conflict:${trait.trait_id}`);
  }
}

function count_statuses(receipts: PrismReceipt[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const receipt of receipts) {
    counts[receipt.status] = (counts[receipt.status] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function persist_run(input: {
  assembly: AssemblyRow;
  receipts: PrismReceipt[];
}): Promise<PrismRosettaActivationResult> {
  const { assembly } = input;
  const receipts = [...input.receipts].sort((left, right) =>
    left.request_id.localeCompare(right.request_id)
  );
  const status_counts = count_statuses(receipts);
  const input_manifest = receipts.map((receipt) => ({
    request_id: receipt.request_id,
    input_hash: receipt.input_hash,
  }));
  const receipt_manifest = receipts.map((receipt) => ({
    request_id: receipt.request_id,
    verification_receipt_id: receipt.verification_receipt_id,
    status: receipt.status,
    output_hash: receipt.output_hash,
    deterministic_replay_key: receipt.deterministic_replay_key,
  }));
  const input_hash = sha256_hex(canonical_json({
    assembly_run_id: assembly.assembly_run_id,
    assembly_input_hash: assembly.input_hash,
    assembly_output_hash: assembly.output_hash,
    prism_rule_set_id: PRISM_ROSETTA_RULE_SET_ID,
    prism_rule_set_version: PRISM_ROSETTA_RULE_SET_VERSION,
    requests: input_manifest,
  }));
  const receipt_manifest_hash = sha256_hex(canonical_json(receipt_manifest));
  const output_hash = sha256_hex(canonical_json({
    receipt_manifest_hash,
    status_counts,
  }));
  const completed_at = receipts
    .map((receipt) => receipt.completion_timestamp)
    .sort()
    .at(-1);
  if (!completed_at) throw new Error("prism_rosetta_completion_timestamp_missing");

  const inserted = await query_with_diagnostics<{ verification_run_id: string }>(
    `insert into public.civic_genome_prism_verification_run (
       genome_bill_id, assembly_run_id, source_document_id, extraction_run_id,
       prism_engine_version, prism_rule_set_id, prism_rule_set_version,
       expected_trait_count, receipt_count, status_counts,
       input_hash, output_hash, receipt_manifest_hash, completed_at
     ) values (
       $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14::timestamptz
     ) on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
       do nothing
     returning verification_run_id::text`,
    [
      assembly.genome_bill_id,
      assembly.assembly_run_id,
      assembly.source_document_id,
      assembly.extraction_run_id,
      PRISM_ROSETTA_ENGINE_VERSION,
      PRISM_ROSETTA_RULE_SET_ID,
      PRISM_ROSETTA_RULE_SET_VERSION,
      assembly.trait_count,
      receipts.length,
      JSON.stringify(status_counts),
      input_hash,
      output_hash,
      receipt_manifest_hash,
      completed_at,
    ],
    {
      label: "prism_rosetta_persist_run",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  const existing = await query_with_diagnostics<{
    verification_run_id: string;
    expected_trait_count: number;
    receipt_count: number;
    status_counts: Record<string, number>;
    input_hash: string;
    output_hash: string;
    receipt_manifest_hash: string;
  }>(
    `select verification_run_id::text, expected_trait_count, receipt_count,
            status_counts, input_hash, output_hash, receipt_manifest_hash
       from public.civic_genome_prism_verification_run
      where assembly_run_id = $1::uuid
        and prism_rule_set_id = $2
        and prism_rule_set_version = $3`,
    [
      assembly.assembly_run_id,
      PRISM_ROSETTA_RULE_SET_ID,
      PRISM_ROSETTA_RULE_SET_VERSION,
    ],
    {
      label: "prism_rosetta_verify_run",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.expected_trait_count !== assembly.trait_count ||
    row.receipt_count !== receipts.length ||
    row.input_hash !== input_hash ||
    row.output_hash !== output_hash ||
    row.receipt_manifest_hash !== receipt_manifest_hash ||
    canonical_json(row.status_counts) !== canonical_json(status_counts)
  ) {
    throw new Error("prism_rosetta_run_receipt_conflict");
  }
  return {
    verification_run_id: row.verification_run_id,
    genome_bill_id: assembly.genome_bill_id,
    assembly_run_id: assembly.assembly_run_id,
    expected_trait_count: row.expected_trait_count,
    receipt_count: row.receipt_count,
    status_counts: row.status_counts,
    input_hash: row.input_hash,
    output_hash: row.output_hash,
    receipt_manifest_hash: row.receipt_manifest_hash,
    replayed: inserted.rows.length === 0,
  };
}

export async function activate_prism_for_rosetta_assembly(input: {
  genome_bill_id: string;
  assembly_run_id?: string;
}): Promise<PrismRosettaActivationResult> {
  const lighthouse_commit = process.env.RENDER_GIT_COMMIT?.trim();
  if (!lighthouse_commit || !/^[a-f0-9]{7,64}$/i.test(lighthouse_commit)) {
    throw new Error("prism_rosetta_lighthouse_commit_missing");
  }
  const assembly = await load_assembly(input);
  const traits = await load_traits(assembly);
  const receipts = await map_bounded(
    traits,
    PRISM_CONCURRENCY,
    async (trait) => {
      const request = build_rosetta_binding_request({
        assembly,
        trait,
        lighthouse_commit,
      });
      const receipt = await submit_rosetta_prism_request(request);
      await persist_binding({ assembly, trait, receipt });
      return receipt;
    },
  );
  if (receipts.length !== assembly.trait_count) {
    throw new Error("prism_rosetta_receipt_count_mismatch");
  }
  return persist_run({ assembly, receipts });
}
