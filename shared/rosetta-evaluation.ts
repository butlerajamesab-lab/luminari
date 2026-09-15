import { z } from "zod";

export const rosetta_evaluation_status = z.enum(["passed", "failed", "held", "unprocessed", "processing"]);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const extraction_run_id = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]);

const attempt = z.object({
  attempt_id: z.string().uuid(),
  source_registry_id: z.string().uuid(),
  extraction_run_id: extraction_run_id.nullable(),
  engine_version: z.string(),
  rule_set_version: z.string().optional(),
  status: z.string(),
  failure_class: z.string().nullable().optional(),
  identity_valid: z.boolean().optional(),
  validator_count: z.number().optional(),
  all_validators_pass: z.boolean().nullable().optional(),
});

export const rosetta_evaluation_schema = z.object({
  contract: z.literal("rosetta-review-law-v1"),
  observed_at: z.string(),
  publication_status: z.literal("candidate"),
  status: rosetta_evaluation_status,
  failure_class: z.string().nullable(),
  parser_invoked: z.literal(false),
  evidence_created: z.literal(false),
  source: z.object({
    source_registry_id: z.string().uuid(),
    source_document_id: z.number().int().positive(),
    source_content_id: z.string().uuid(),
    source_content_hash: hash,
    source_url: z.string().nullable(),
    document_name: z.string(),
    document_identifier: z.string().nullable(),
    parent_source_registry_id: z.string().uuid().nullable().optional(),
    revision_kind: z.string().nullable().optional(),
  }),
  selected_attempt: attempt.nullable(),
  attempts: z.array(attempt),
  law_view: z.object({
    objects: z.array(z.object({
      layer: z.enum(["help", "workflow", "accountability", "override", "definition"]),
      key: z.string(),
      source_object_type: z.string(),
      source_object_id: z.string(),
      source_block_id: z.string().nullable(),
      extraction_run_id,
      normalized_value: z.unknown(),
      confidence: z.number().min(0).max(1),
      confirmed: z.boolean(),
    })),
    coverage: z.unknown(),
  }).nullable(),
  validation_results: z.array(z.unknown()),
  source_receipt: z.unknown(),
  extraction_manifest: z.unknown(),
});

export type RosettaEvaluation = z.infer<typeof rosetta_evaluation_schema>;
