import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/i).transform(value => value.toLowerCase());
const uuid = z.string().uuid();
const positive_id = z.number().int().positive().safe();
const extraction_run_id = z.union([
  positive_id,
  z.string().regex(/^[1-9]\d*$/),
]);
const timestamp = z.string().datetime({ offset: true });
const bounded_text = z.string().min(1).max(512);
const layer_coverage = z.object({
  status: z.enum(["populated", "not_applicable", "pending_extraction", "extraction_failed"]),
  reason: z.string().max(500).nullable().optional(),
  validated_at: timestamp.nullable().optional(),
}).strict();
const coverage = z.object({
  help: layer_coverage.optional(),
  workflow: layer_coverage.optional(),
  accountability: layer_coverage.optional(),
  override: layer_coverage.optional(),
  definition: layer_coverage.optional(),
}).strict();

export const rosetta_current_source_state = z.enum([
  "complete",
  "processing",
  "held",
  "failed",
  "not_admitted",
]);

export const rosetta_current_source_status_schema = z.object({
  contract: z.literal("rosetta-current-source-result-v1"),
  state: rosetta_current_source_state,
  source_document_key: bounded_text,
  source_content_hash: hash,
  rosetta_source_document_id: positive_id.nullable(),
  rosetta_source_registry_id: uuid.nullable(),
  source_registry_id: uuid.nullable(),
  current_engine_id: bounded_text.nullable(),
  current_engine_version: bounded_text.nullable(),
  current_rule_set_version: bounded_text.nullable(),
  current_rule_manifest_hash: hash.nullable(),
  current_manifest_hash: hash.nullable(),
  current_closure_hash: hash.nullable(),
  current_configuration_hash: hash.nullable(),
  stage_id: uuid.nullable(),
  attempt_id: uuid.nullable(),
  extraction_run_id: positive_id.nullable(),
  assembly_run_id: positive_id.nullable(),
  assembly_required: z.boolean(),
  validation_run_id: positive_id.nullable(),
  validation_receipt_id: bounded_text.nullable(),
  validation_receipt_hash: hash.nullable(),
  output_content_hash: hash.nullable(),
  result_eligible: z.boolean(),
  failure_class: bounded_text.nullable(),
  failure_code: bounded_text.nullable(),
  failure_stage: bounded_text.nullable(),
  failure_message_safe: bounded_text.nullable(),
  held_reason: bounded_text.nullable(),
  started_at: timestamp.nullable(),
  amendment_readiness: z.enum([
    "eligible_for_delta_decomposition",
    "held_incomplete_amendment_artifact",
    "held_missing_base_source",
    "held_base_hash_mismatch",
    "held_unresolved_attachment",
    "not_applicable",
  ]).nullable(),
  base_source_document_key: bounded_text.nullable(),
  base_source_content_hash: hash.nullable(),
  amendment_attachment_state: bounded_text.nullable(),
  amendment_attachment_receipt_hash: hash.nullable(),
  observed_at: timestamp,
  completed_at: timestamp.nullable(),
  receipt_hash: hash.nullable(),
  automatic_retry: z.literal(false),
  replay_policy: z.literal("explicit_distinct_remediation_only"),
}).strict().superRefine((value, context) => {
  if (value.source_registry_id !== value.rosetta_source_registry_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["source_registry_id"], message: "Source registry aliases must agree." });
  }
  if (value.current_manifest_hash !== value.current_rule_manifest_hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_manifest_hash"], message: "Manifest aliases must agree." });
  }
  if (value.state === "complete") {
    const required = [
      value.rosetta_source_document_id,
      value.rosetta_source_registry_id,
      value.current_engine_id,
      value.current_engine_version,
      value.current_rule_set_version,
      value.current_rule_manifest_hash,
      value.current_configuration_hash,
      value.current_closure_hash,
      value.stage_id,
      value.attempt_id,
      value.extraction_run_id,
      value.validation_receipt_id,
      value.validation_receipt_hash,
      value.output_content_hash,
      value.receipt_hash,
      value.completed_at,
    ];
    if (!value.result_eligible || required.some(item => item == null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["result_eligible"], message: "Complete current-source results require durable current provenance." });
    }
  } else if (value.result_eligible || value.output_content_hash !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["result_eligible"], message: "Only complete results may be eligible or expose an output hash." });
  }
  if (value.state === "processing" && (!value.attempt_id || !value.stage_id || !value.started_at || !value.current_configuration_hash)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "Processing requires an exact active attempt and configuration." });
  }
  if (value.state === "held" && !value.held_reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["held_reason"], message: "Held results require an explicit hold reason." });
  }
  if (value.state === "failed" && (!value.failure_code || !value.failure_class || !value.failure_stage || !value.attempt_id || !value.current_configuration_hash)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["failure_code"], message: "Failed results require durable failure provenance." });
  }
  if (value.state === "not_admitted" && [
    value.rosetta_source_registry_id,
    value.current_configuration_hash,
    value.stage_id,
    value.attempt_id,
    value.extraction_run_id,
    value.assembly_run_id,
    value.validation_run_id,
    value.validation_receipt_id,
    value.completed_at,
    value.receipt_hash,
  ].some(item => item !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "A not-admitted source cannot expose a current run or registry binding." });
  }
});

export const rosetta_public_current_docket_result_status = z.enum([
  "complete",
  "requires_review",
  "awaiting_analysis",
  "unavailable",
]);

export const rosetta_public_current_docket_result_schema = z.object({
  contract: z.literal("rosetta-public-current-docket-result-v1"),
  docket_source_key: z.string().min(1),
  source_content_hash: hash,
  source_registry_id: uuid.nullable(),
  status: rosetta_public_current_docket_result_status,
  current_result: z.object({
    extraction_run_id,
    output_content_hash: hash,
    engine_version: z.string().min(1),
    rule_set_version: z.string().min(1),
    rule_manifest_hash: hash,
    configuration_hash: hash,
    completed_at: timestamp,
    admissibility_state: z.literal("admissible"),
  }).strict().nullable(),
  coverage,
  validation_summary: z.object({
    terminal: z.boolean().optional(),
    validator_count: z.number().int().nonnegative().safe().optional(),
  }).strict(),
  public_reason: z.string().max(500),
  current_source_status: rosetta_current_source_status_schema.optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "complete" && (
    ["help", "workflow", "accountability", "override", "definition"].some(key => {
      const layer = value.coverage[key as keyof typeof value.coverage];
      return !layer || !["populated", "not_applicable"].includes(layer.status);
    }) || value.validation_summary.terminal !== true || value.validation_summary.validator_count !== 9
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["coverage"], message: "Complete results require all five terminal layers and nine validators." });
  }
  if (value.source_registry_id === null && value.status !== "unavailable") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["source_registry_id"], message: "A known source is required for this status." });
  }
  if ((value.status === "complete") !== (value.current_result !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["current_result"],
      message: "Only a complete status may carry an admissible current result, and it must carry one.",
    });
  }
  if (value.current_source_status) {
    const precise = value.current_source_status;
    if (precise.source_document_key !== value.docket_source_key || precise.source_content_hash !== value.source_content_hash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_source_status"], message: "Precise current-source identity must match the Docket selector exactly." });
    }
    if (precise.state === "complete" && value.status !== "complete") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Compatibility status cannot hide a complete precise current result." });
    }
    if (value.status === "complete" && precise.result_eligible !== true) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_source_status"], message: "Compatibility completion requires an eligible precise current result." });
    }
    if (value.source_registry_id !== null && precise.rosetta_source_registry_id !== null && value.source_registry_id !== precise.rosetta_source_registry_id) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["source_registry_id"], message: "Compatibility and precise source registries must agree." });
    }
  }
});

export type RosettaCurrentSourceStatus = z.infer<typeof rosetta_current_source_status_schema>;
export type RosettaPublicCurrentDocketResult = z.infer<
  typeof rosetta_public_current_docket_result_schema
>;
