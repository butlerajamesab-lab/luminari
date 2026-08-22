import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  eligible_integrity_routes,
  integrity_route_catalog,
} from "../integrity/integrity-routing-catalog";
import {
  attach_integrity_review_evidence,
  create_integrity_escalation_draft,
  get_integrity_candidate_detail,
  get_integrity_projection_readiness,
  list_integrity_candidates,
  record_integrity_corroboration,
  sync_atlas_integrity_candidates,
  transition_integrity_candidate,
} from "../integrity/integrity-routing-service";

const timestamp_schema = z.string().refine(
  value => Number.isFinite(Date.parse(value)),
  "valid timestamp required",
);
const sha256_schema = z.string().regex(/^[a-f0-9]{64}$/i);

const candidate_type_schema = z.enum([
  "phoenix_successor_pattern",
  "exact_identifier_reuse_pattern",
  "financial_conduit_pattern",
  "dark_money_pattern",
  "legislative_integrity_anomaly",
  "procurement_integrity_anomaly",
  "contradiction_pattern",
  "numeric_range_anomaly",
  "other",
]);

const candidate_status_schema = z.enum([
  "candidate",
  "evidence_gathering",
  "corroboration_review",
  "review_hold",
  "corroborated",
  "contradicted",
  "inconclusive",
  "dismissed",
  "routing_review",
  "escalation_ready",
  "escalated",
  "closed",
]);

const source_class_schema = z.enum([
  "official_primary",
  "official_secondary",
  "court_record",
  "legislative_record",
  "campaign_finance_record",
  "lobbying_disclosure",
  "foreign_agent_registration",
  "regulatory_record",
  "corporate_record",
  "procurement_record",
  "audited_financial_record",
  "journalistic_source",
  "user_supplied",
  "other",
]);

export const integrity_routing_router = router({
  sync_atlas_candidates: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(1000).default(1000) }).optional())
    .mutation(({ input }) => sync_atlas_integrity_candidates(input?.limit ?? 1000)),

  candidates: adminProcedure
    .input(z.object({ candidate_id: z.string().uuid().optional() }).optional())
    .query(({ input }) => list_integrity_candidates(input?.candidate_id)),

  candidate_detail: adminProcedure
    .input(z.object({ candidate_id: z.string().uuid() }))
    .query(({ input }) => get_integrity_candidate_detail(input.candidate_id)),

  projection_readiness: adminProcedure
    .query(() => get_integrity_projection_readiness()),

  route_catalog: adminProcedure
    .input(z.object({
      jurisdiction_id: z.string().trim().min(1).max(100).optional(),
      candidate_type: candidate_type_schema.optional(),
    }).optional())
    .query(({ input }) => {
      if (input?.jurisdiction_id && input.candidate_type) {
        return eligible_integrity_routes(input.jurisdiction_id, input.candidate_type);
      }
      return integrity_route_catalog;
    }),

  attach_evidence: adminProcedure
    .input(z.object({
      candidate_id: z.string().uuid(),
      source_class: source_class_schema,
      source_relation: z.string().trim().min(1).max(300),
      source_record_key: z.string().trim().min(1).max(500),
      source_uri: z.string().url().max(2_000).optional(),
      quote_text: z.string().trim().min(1).max(10_000).optional(),
      pinpoint: z.string().trim().min(1).max(1_000).optional(),
      source_content_hash: sha256_schema,
      supports_or_contradicts: z.enum(["supports", "contradicts", "context_only", "unresolved"]),
      observed_at: timestamp_schema.optional(),
    }).refine(
      value => Boolean(value.source_uri || value.quote_text || value.pinpoint),
      "source_uri, quote_text, or pinpoint is required",
    ))
    .mutation(async ({ input, ctx }) => ({
      evidence_link_id: await attach_integrity_review_evidence({
        ...input,
        created_by_id: String(ctx.user.id),
      }),
    })),

  record_corroboration: adminProcedure
    .input(z.object({
      candidate_id: z.string().uuid(),
      assessment_state: z.enum([
        "uncorroborated",
        "single_source",
        "independently_supported",
        "contradicted",
        "disputed",
        "inconclusive",
        "verified_for_routing",
      ]),
      rationale: z.string().trim().min(10).max(20_000),
      evidence_link_ids: z.array(z.string().uuid()).min(1).max(1_000),
    }))
    .mutation(async ({ input, ctx }) => ({
      assessment_id: await record_integrity_corroboration({
        ...input,
        assessed_by_id: String(ctx.user.id),
      }),
    })),

  transition_candidate: adminProcedure
    .input(z.object({
      candidate_id: z.string().uuid(),
      to_status: candidate_status_schema,
      reason: z.string().trim().min(10).max(20_000),
      assessment_id: z.string().uuid().optional(),
    }))
    .mutation(async ({ input, ctx }) => ({
      transition_id: await transition_integrity_candidate({
        ...input,
        actor_type: "administrator",
        actor_id: String(ctx.user.id),
      }),
    })),

  create_escalation_draft: adminProcedure
    .input(z.object({
      candidate_id: z.string().uuid(),
      assessment_id: z.string().uuid(),
      evidence_link_ids: z.array(z.string().uuid()).min(1).max(1_000),
      route_id: z.string().trim().min(1).max(200).optional(),
      reviewer_notes: z.string().trim().min(10).max(20_000),
    }))
    .mutation(({ input, ctx }) => create_integrity_escalation_draft({
      ...input,
      created_by_id: String(ctx.user.id),
    })),
});
