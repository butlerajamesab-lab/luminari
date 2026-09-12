import { z } from "zod";

const case_id = z.number().int().positive();
const limit_per_surface = z.number().int().min(1).max(25);

/** Existing camelCase inputs terminate at the HTTP/tool boundary. */
export const case_context_input = z.object({
  case_id: case_id.optional(),
  caseId: case_id.optional(),
}).transform(input => ({ case_id: input.case_id ?? input.caseId }))
  .pipe(z.object({ case_id }));

export const case_action_context_input = z.object({
  case_id: case_id.optional(),
  problem_context: z.string().trim().max(240).optional(),
  jurisdiction: z.string().trim().max(80).optional(),
  incident_date: z.string().optional(),
  as_of_date: z.string().optional(),
  limit_per_surface: limit_per_surface.optional(),
  // Temporary legacy inputs; none of these keys is emitted by the transform.
  caseId: case_id.optional(),
  problemContext: z.string().optional(),
  incidentDate: z.string().optional(),
  asOfDate: z.string().optional(),
  limitPerSurface: limit_per_surface.optional(),
}).transform(input => ({
  case_id: input.case_id ?? input.caseId,
  problem_context: input.problem_context ?? input.problemContext,
  jurisdiction: input.jurisdiction,
  incident_date: input.incident_date ?? input.incidentDate,
  as_of_date: input.as_of_date ?? input.asOfDate,
  limit_per_surface: input.limit_per_surface ?? input.limitPerSurface,
})).pipe(z.object({
  case_id,
  problem_context: z.string().trim().max(240).optional(),
  jurisdiction: z.string().trim().max(80).optional(),
  incident_date: z.string().optional(),
  as_of_date: z.string().optional(),
  limit_per_surface: limit_per_surface.optional(),
}));
