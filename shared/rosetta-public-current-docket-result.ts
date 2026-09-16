import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/i);
const extraction_run_id = z.union([
  z.number().int().positive().safe(),
  z.string().regex(/^[1-9]\d*$/),
]);
const layer_coverage = z.object({
  status: z.enum(["populated", "not_applicable", "pending_extraction", "extraction_failed"]),
  reason: z.string().max(500).nullable().optional(),
  validated_at: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
const coverage = z.object({
  help: layer_coverage.optional(),
  workflow: layer_coverage.optional(),
  accountability: layer_coverage.optional(),
  override: layer_coverage.optional(),
  definition: layer_coverage.optional(),
}).strict();

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
    completed_at: z.string().datetime({ offset: true }),
    admissibility_state: z.literal("admissible"),
  }).strict().nullable(),
  coverage,
  validation_summary: z.object({
    terminal: z.boolean().optional(),
    validator_count: z.number().int().nonnegative().safe().optional(),
  }).strict(),
  public_reason: z.string().max(500),
}).strict().superRefine((value, context) => {
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
});

export type RosettaPublicCurrentDocketResult = z.infer<
  typeof rosetta_public_current_docket_result_schema
>;
