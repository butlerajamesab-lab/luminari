import { z } from "zod";

export const CASE_INTAKE_CONTINUITY_SURFACES = [
  "documents",
  "entities",
  "timeline",
  "network",
  "findings",
  "review",
  "act",
  "case_overview",
] as const;

export const CASE_INTAKE_CONTINUITY_INTENTS = [
  "new_evidence",
  "supports",
  "contradicts",
  "clarifies_identity",
  "corrects_metadata",
  "adds_context",
  "requests_review",
] as const;

export const case_intake_continuity_related_subject_schema = z.object({
  type: z.enum([
    "document",
    "entity",
    "event",
    "relationship",
    "finding",
    "action",
  ]),
  id: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(200).optional(),
});

export const case_intake_continuity_origin_context_schema = z.object({
  case_id: z.number().int().positive(),
  case_uuid: z.string().uuid().optional(),
  originating_route: z.string().startsWith("/").max(512),
  originating_surface: z.enum(CASE_INTAKE_CONTINUITY_SURFACES),
  user_intent: z.enum(CASE_INTAKE_CONTINUITY_INTENTS),
  related_subject: case_intake_continuity_related_subject_schema.optional(),
  from_route: z.string().startsWith("/").max(512).optional(),
});

export type case_intake_continuity_surface =
  typeof CASE_INTAKE_CONTINUITY_SURFACES[number];
export type case_intake_continuity_intent =
  typeof CASE_INTAKE_CONTINUITY_INTENTS[number];
export type case_intake_continuity_related_subject = z.infer<
  typeof case_intake_continuity_related_subject_schema
>;
export type case_intake_continuity_origin_context = z.infer<
  typeof case_intake_continuity_origin_context_schema
>;
