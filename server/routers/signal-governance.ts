/**
 * Signal Governance tRPC Router
 *
 * Current governed signal presentation reads the canonical three-domain
 * architecture. Legacy detected_signals/live_signals remain historical evidence
 * and are never presented as current Atlas-derived signals.
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getSignalAuditTrail,
  getEscalationSummary,
  getProvenance,
} from "../signal-governance";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  get_canonical_live_signal_summary,
  get_canonical_live_signals,
} from "../canonical-live-signal-queries";

export const signalGovernanceRouter = router({
  /**
   * Signal Dashboard — current canonical Atlas Domain 3 signal population.
   */
  dashboard: publicProcedure
    .input(z.object({
      datasetId: z.string().optional(),
      severityLevel: z.string().optional(),
      escalationTier: z.string().optional(),
      minConfidence: z.number().min(0).max(100).optional(),
      governedOnly: z.boolean().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      const signals = await get_canonical_live_signals({
        stream_id: input?.datasetId,
        severity: input?.severityLevel,
        limit: input?.limit,
        offset: input?.offset,
      });
      const summary = await get_canonical_live_signal_summary({
        stream_id: input?.datasetId,
        severity: input?.severityLevel,
      });
      const minConfidence = input?.minConfidence == null
        ? null
        : input.minConfidence > 1
          ? input.minConfidence / 100
          : input.minConfidence;
      const filteredSignals = minConfidence == null
        ? signals
        : signals.filter(signal => signal.confidence_score >= minConfidence);

      return {
        signals: filteredSignals,
        summary,
        total: summary.total_signals,
        total_active: summary.total_active,
        contract_version: "signal_architecture_ground_truth_v1",
        source_relation: "public.live_data_signals",
      };
    }),

  /**
   * Legacy audit trail endpoint remains available for historical signal IDs.
   * Canonical live-data signals expose their source refs/rule/engine/hash fields
   * directly in dashboard records.
   */
  auditTrail: publicProcedure
    .input(z.object({ signalId: z.string() }))
    .query(async ({ input }) => {
      return getSignalAuditTrail(input.signalId);
    }),

  escalationSummary: publicProcedure
    .query(async () => getEscalationSummary()),

  provenance: protectedProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => getProvenance(input.datasetId)),

  confidenceFactors: protectedProcedure
    .query(async () => {
      const rows = await db.execute(
        sql`SELECT factor_id, signal_type, factor_name, weight, description, measurement_method FROM confidence_factors ORDER BY factor_id`
      );
      return (rows as any)[0].map((r: any) => ({
        id: r.factor_id,
        factorName: r.factor_name,
        signalType: r.signal_type,
        weight: parseFloat(r.weight),
        description: r.description,
        measurementMethod: r.measurement_method,
      }));
    }),

  escalationThresholds: publicProcedure
    .query(async () => {
      const rows = await db.execute(
        sql`SELECT * FROM escalation_thresholds ORDER BY min_score DESC`
      );
      return (rows as any)[0].map((r: any) => ({
        tierName: r.tier_name,
        minScore: r.min_score,
        maxScore: r.max_score,
        action: r.action,
        notifyRoles: typeof r.notify_roles === "string" ? JSON.parse(r.notify_roles) : (r.notify_roles || []),
        autoEscalate: Boolean(r.auto_escalate),
      }));
    }),

  templates: protectedProcedure
    .input(z.object({
      signalType: z.string().optional(),
      datasetId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      let query = "SELECT * FROM signal_explanations_extended WHERE 1=1";
      if (input?.signalType) query += ` AND signal_type = '${input.signalType}'`;
      query += " ORDER BY signal_type";

      const rows = await db.execute(sql.raw(query));
      return (rows as any)[0].map((r: any) => ({
        templateId: r.template_id,
        signalType: r.signal_type,
        templateText: r.template_text,
        severityLevel: r.severity_level,
        confidenceRequired: r.confidence_required || 0,
        verificationMethod: r.verification_method,
        falsePositiveRisks: r.false_positive_risks,
        exampleUse: r.example_use,
        dataContextRequired: r.data_context_required,
      }));
    }),
});
