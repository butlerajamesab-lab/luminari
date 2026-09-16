import { z } from "zod";

const hash = z.string().regex(/^[0-9a-f]{64}$/i);
const extraction_run_id = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]);
const passthrough_object = z.record(z.string(), z.unknown());

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
  source_registry_id: z.string().uuid(),
  status: rosetta_public_current_docket_result_status,
  current_result: z.object({
    extraction_run_id,
    output_content_hash: hash,
    engine_version: z.string().min(1),
    rule_set_version: z.string().min(1),
    rule_manifest_hash: hash,
    configuration_hash: hash,
    completed_at: z.string().min(1),
    admissibility_state: z.string().min(1),
  }).strict().nullable(),
  coverage: passthrough_object,
  validation_summary: passthrough_object,
  public_reason: z.string(),
}).strict();

export type RosettaPublicCurrentDocketResult = z.infer<
  typeof rosetta_public_current_docket_result_schema
>;
