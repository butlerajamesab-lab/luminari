import { z } from "zod";
import { case_intake_continuity_origin_context_schema } from "./case-intake-continuity";

export const DECLARED_INTAKE_CONTEXT_CONTRACT_VERSION =
  "luminari.declared_intake_context.v1.0.0" as const;

export const DECLARED_INTAKE_CONTEXT_MIME_TYPE =
  "application/vnd.luminari.declared-intake+json" as const;

export const declared_intake_entry_surface_schema = z.enum([
  "guided_intake",
  "conversation_intake",
  "offline_bundle",
]);

export const declared_intake_selection_basis_schema = z.enum([
  "explicit_pipeline",
  "deterministic_rules",
  "general_fallback",
  "existing_case_context",
]);

export const declared_intake_statement_schema = z.object({
  prompt_id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(20_000),
});

export const declared_intake_submission_schema = z.object({
  entry_surface: declared_intake_entry_surface_schema,
  selection_basis: declared_intake_selection_basis_schema,
  selected_pipeline: z.string().trim().min(1).max(120),
  statements: z.array(declared_intake_statement_schema).min(1).max(24),
  urgent_situation: z.string().trim().min(1).max(2_000).optional(),
  origin_context: case_intake_continuity_origin_context_schema.optional(),
  language_assistance: z.object({
    requested: z.boolean(),
    scope: z.literal("wording_only"),
    user_content_shared_with_model: z.literal(false),
  }).optional(),
});

export const declared_intake_context_schema = z.object({
  contract_version: z.literal(DECLARED_INTAKE_CONTEXT_CONTRACT_VERSION),
  entry_surface: declared_intake_entry_surface_schema,
  captured_at: z.string().datetime(),
  selection: z.object({
    basis: declared_intake_selection_basis_schema,
    selected_pipeline: z.string().trim().min(1).max(120),
  }),
  declarations: z.array(declared_intake_statement_schema).min(1).max(24),
  origin_context: case_intake_continuity_origin_context_schema.optional(),
  language_assistance: z.object({
    requested: z.boolean(),
    scope: z.literal("wording_only"),
    user_content_shared_with_model: z.literal(false),
  }).optional(),
});

export type declared_intake_submission = z.infer<
  typeof declared_intake_submission_schema
>;

export type declared_intake_context = z.infer<
  typeof declared_intake_context_schema
>;
