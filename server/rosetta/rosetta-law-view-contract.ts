import { createHash } from "crypto";
import { z } from "zod";

const confidence_schema = z.number().min(0).max(1);
const signal_status_schema = z.enum(["confirmed", "tentative", "human_review_required"]);

const provenance_row_schema = z.object({
  corpus_id: z.number().int().positive(),
  source_document_id: z.number().int().positive(),
  extraction_run_id: z.number().int().positive(),
  canon_version: z.number().int().positive(),
  source_block_id: z.string().min(1),
});

const help_entity_schema = provenance_row_schema.extend({
  id: z.string().min(1),
  entity_name: z.string().min(1),
  entity_type: z.string().min(1),
  governing_section: z.string().nullable(),
  status: z.string().nullable(),
  effective_date: z.string().nullable(),
  sunset_date: z.string().nullable(),
  confidence: confidence_schema,
  signal_status: signal_status_schema,
});

const workflow_step_schema = z.object({
  id: z.string().min(1),
  step_order: z.number().int().positive(),
  step_name: z.string().min(1),
  actor: z.string().nullable(),
  actor_canonical: z.string().nullable(),
  verb: z.string().nullable(),
  governing_section: z.string().nullable(),
  confidence: confidence_schema.nullable().optional(),
  signal_status: signal_status_schema.nullable().optional(),
});

const workflow_pipeline_schema = provenance_row_schema.extend({
  pipeline_id: z.string().min(1),
  pipeline_name: z.string().min(1),
  pipeline_type: z.string().nullable(),
  governing_section: z.string().nullable(),
  confidence: confidence_schema,
  signal_status: signal_status_schema,
  steps: z.array(workflow_step_schema),
});

const escalation_node_schema = z.object({
  id: z.string().min(1),
  escalation_order: z.number().int().positive(),
  node_name: z.string().min(1),
  authority_level: z.string().nullable(),
  actor: z.string().nullable(),
  actor_canonical: z.string().nullable(),
  action_verb: z.string().nullable(),
  deadline_text: z.string().nullable(),
  confidence: confidence_schema.nullable().optional(),
});

const appeal_pathway_schema = z.object({
  id: z.string().min(1),
  pathway_order: z.number().int().positive(),
  pathway_name: z.string().min(1),
  filing_deadline_text: z.string().nullable(),
  filing_body: z.string().nullable(),
  actor_canonical: z.string().nullable(),
  standard_of_review: z.string().nullable(),
  confidence: confidence_schema.nullable().optional(),
});

const accountability_route_schema = provenance_row_schema.extend({
  id: z.string().min(1),
  route_name: z.string().min(1),
  trigger_condition: z.string().nullable(),
  responsible_actor: z.string().nullable(),
  actor_canonical: z.string().nullable(),
  enforcement_mechanism: z.string().nullable(),
  enforcement_direction: z.string().nullable(),
  penalty_range: z.string().nullable(),
  confidence: confidence_schema,
  signal_status: signal_status_schema,
  escalation_nodes: z.array(escalation_node_schema),
  appeal_pathways: z.array(appeal_pathway_schema),
});

const override_schema = provenance_row_schema.extend({
  id: z.string().min(1),
  override_type: z.string().min(1),
  overridden_authority: z.string().nullable(),
  override_scope: z.string().nullable(),
  override_condition: z.string().nullable(),
  granting_actor: z.string().nullable(),
  actor_canonical: z.string().nullable(),
  effective_date: z.string().nullable(),
  sunset_date: z.string().nullable(),
  temporal_status: z.string().nullable(),
  confidence: confidence_schema,
  signal_status: signal_status_schema,
});

const term_definition_schema = provenance_row_schema.extend({
  id: z.string().min(1),
  term: z.string().min(1),
  definition_text: z.string().min(1),
  scope: z.string().nullable(),
  definition_type: z.string().nullable(),
  effect_type: z.string().nullable(),
  confidence: confidence_schema,
  signal_status: signal_status_schema,
  affected_step_ids: z.array(z.string()),
});

const matched_law_schema = z.object({
  corpus_id: z.number().int().positive(),
  jurisdiction: z.string().nullable(),
  domain: z.string().nullable(),
  source_document_id: z.number().int().positive(),
  citation_key: z.string().nullable(),
  title: z.string().nullable(),
  enacted_date: z.string().nullable(),
});

const provenance_schema = z.object({
  extraction_run_id: z.number().int().positive(),
  canon_version: z.number().int().positive(),
  validation_status: z.string().min(1),
  total_source_blocks: z.number().int().nonnegative(),
  total_entities_extracted: z.number().int().nonnegative(),
  total_workflows_extracted: z.number().int().nonnegative(),
  total_accountability_routes: z.number().int().nonnegative(),
  total_overrides: z.number().int().nonnegative(),
  total_definitions: z.number().int().nonnegative(),
  hash_algorithm: z.string().min(1),
  hashes: z.array(z.string()),
});

export const rosetta_law_view_schema = z.object({
  law_view: z.object({
    matched_law: z.array(matched_law_schema),
    protections: z.array(help_entity_schema),
    workflow_pipelines: z.array(workflow_pipeline_schema),
    accountability_routes: z.array(accountability_route_schema),
    overrides: z.array(override_schema),
    definitions: z.array(term_definition_schema),
    provenance: provenance_schema,
  }),
  context: z.object({
    rosetta_extraction_run_id: z.number().int().positive(),
    rosetta_canon_version: z.number().int().positive(),
  }),
  availability: z.object({
    rosetta: z.literal("available"),
    missing_inputs: z.array(z.string()),
    errors: z.array(z.string()),
  }),
});

export type rosetta_law_view = z.infer<typeof rosetta_law_view_schema>;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
};

export const build_rosetta_authority_basis = (input: rosetta_law_view) => {
  const parsed = rosetta_law_view_schema.parse(input);

  return canonicalize({
    protections: parsed.law_view.protections.map(({ corpus_id, source_document_id, extraction_run_id, canon_version, source_block_id, confidence, signal_status, ...row }) => row),
    workflow_pipelines: parsed.law_view.workflow_pipelines.map(({ corpus_id, source_document_id, extraction_run_id, canon_version, source_block_id, confidence, signal_status, ...row }) => row),
    accountability_routes: parsed.law_view.accountability_routes.map(({ corpus_id, source_document_id, extraction_run_id, canon_version, source_block_id, confidence, signal_status, ...row }) => row),
    overrides: parsed.law_view.overrides.map(({ corpus_id, source_document_id, extraction_run_id, canon_version, source_block_id, confidence, signal_status, ...row }) => row),
    definitions: parsed.law_view.definitions.map(({ corpus_id, source_document_id, extraction_run_id, canon_version, source_block_id, confidence, signal_status, ...row }) => row),
  });
};

export const build_rosetta_authority_fingerprint = (input: rosetta_law_view): string =>
  createHash("sha256").update(JSON.stringify(build_rosetta_authority_basis(input))).digest("hex");
