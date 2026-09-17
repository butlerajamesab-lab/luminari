import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/i).transform(value => value.toLowerCase());
const positive_id = z.union([
  z.number().int().positive().safe(),
  z.string().regex(/^[1-9]\d*$/),
]);
const extraction_run_id = positive_id;
const timestamp = z.string().datetime({ offset: true });
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
  source_document_key: z.string().min(1).max(512),
  source_content_hash: hash,
  rosetta_source_document_id: z.number().int().positive().safe().nullable(),
  rosetta_source_registry_id: z.string().uuid().nullable(),
  source_registry_id: z.string().uuid().nullable().optional(),
  current_engine_id: z.string().uuid().nullable(),
  current_engine_version: z.string().min(1).nullable(),
  current_rule_set_version: z.string().min(1).nullable(),
  current_rule_manifest_hash: hash.nullable(),
  current_manifest_hash: hash.nullable().optional(),
  current_closure_hash: hash.nullable(),
  current_configuration_hash: hash.nullable(),
  stage_id: z.string().uuid().nullable(),
  attempt_id: z.string().uuid().nullable(),
  extraction_run_id: positive_id.nullable(),
  assembly_run_id: positive_id.nullable(),
  assembly_required: z.boolean(),
  validation_run_id: positive_id.nullable(),
  validation_receipt_id: z.string().min(1).nullable(),
  validation_receipt_hash: hash.nullable(),
  output_content_hash: hash.nullable(),
  result_eligible: z.boolean(),
  failure_class: z.string().min(1).max(500).nullable(),
  failure_code: z.string().min(1).max(500).nullable(),
  failure_stage: z.string().min(1).max(500).nullable(),
  failure_message_safe: z.string().max(500).nullable(),
  held_reason: z.string().min(1).max(500).nullable(),
  started_at: timestamp.nullable(),
  amendment_readiness: z.enum([
    "eligible_for_delta_decomposition",
    "held_incomplete_amendment_artifact",
    "held_missing_base_source",
    "held_base_hash_mismatch",
    "held_unresolved_attachment",
    "not_applicable",
  ]).nullable(),
  base_source_document_key: z.string().min(1).max(512).nullable(),
  base_source_content_hash: hash.nullable(),
  amendment_attachment_state: z.string().min(1).max(500).nullable(),
  amendment_attachment_receipt_hash: hash.nullable(),
  observed_at: timestamp,
  completed_at: timestamp.nullable(),
  receipt_hash: hash.nullable(),
  automatic_retry: z.literal(false),
  replay_policy: z.literal("explicit_distinct_remediation_only"),
}).strict().superRefine((value, context) => {
  if (value.source_registry_id !== undefined && value.source_registry_id !== value.rosetta_source_registry_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["source_registry_id"], message: "Registry aliases must agree." });
  }
  if (value.current_manifest_hash !== undefined && value.current_manifest_hash !== value.current_rule_manifest_hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_manifest_hash"], message: "Manifest aliases must agree." });
  }
  if (value.state === "complete" && (!value.result_eligible || value.extraction_run_id === null || value.receipt_hash === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["result_eligible"], message: "Complete requires an eligible durable exact-source result." });
  }
  if (value.state !== "complete" && value.result_eligible) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["result_eligible"], message: "Only complete may be eligible." });
  }
  if (value.state === "not_admitted" && (value.rosetta_source_registry_id !== null || value.attempt_id !== null || value.extraction_run_id !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "Not-admitted state cannot carry a current registry/run binding." });
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
  source_registry_id: z.string().uuid().nullable(),
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
  // Transitional optionality allows Lighthouse and Rosetta to deploy in either
  // order. Once present it is strictly validated and is the status-of-record.
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
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_result"], message: "Only a complete status may carry an admissible current result, and it must carry one." });
  }
  const precise = value.current_source_status;
  if (precise) {
    if (precise.source_document_key !== value.docket_source_key || precise.source_content_hash !== value.source_content_hash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_source_status"], message: "Precise status must use the same immutable source selector." });
    }
    if (value.status === "complete" && precise.state !== "complete") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["current_source_status"], message: "Complete compatibility payload requires a complete precise status." });
    }
    if (precise.state === "complete" && value.status !== "complete") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Precise completion cannot be collapsed to a noncomplete compatibility state." });
    }
  }
});

export type RosettaCurrentSourceStatus = z.infer<typeof rosetta_current_source_status_schema>;
export type RosettaPublicCurrentDocketResult = z.infer<typeof rosetta_public_current_docket_result_schema>;
