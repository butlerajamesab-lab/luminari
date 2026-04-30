/**
 * Signal Governance tRPC Router
 * 
 * Exposes the governance layer to the frontend:
 * - Signal dashboard (ranked by confidence, severity, source, timestamp)
 * - Signal audit trail (generation steps, factor breakdown)
 * - Escalation summary (tier counts)
 * - Confidence factors reference
 * - Dataset provenance
 * 
 * NOTE: DB tables use two naming conventions:
 *   - Old tables (confidence_factors, signal_explanations_extended): snake_case columns
 *   - New tables (escalation_thresholds): camelCase columns
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getSignalDashboard,
  getSignalAuditTrail,
  getEscalationSummary,
  getProvenance,
  calculateSignalConfidence,
} from "../signal-governance";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const signalGovernanceRouter = router({
  /**
   * Signal Dashboard — ranked list of governed signals
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
      return getSignalDashboard(input || {});
    }),

  /**
   * Signal Audit Trail — full generation log for a specific signal
   */
  auditTrail: publicProcedure
    .input(z.object({ signalId: z.string() }))
    .query(async ({ input }) => {
      return getSignalAuditTrail(input.signalId);
    }),

  /**
   * Escalation Summary — count of signals per escalation tier
   */
  escalationSummary: publicProcedure
    .query(async () => {
      return getEscalationSummary();
    }),

  /**
   * Dataset Provenance — source metadata for a dataset
   */
  provenance: protectedProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => {
      return getProvenance(input.datasetId);
    }),

  /**
   * Confidence Factors — reference data for the scoring model
   * Uses snake_case column names from actual DB
   */
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

  /**
   * Escalation Thresholds — tier definitions
   * Uses camelCase column names (newly created table)
   */
  escalationThresholds: publicProcedure
    .query(async () => {
      const rows = await db.execute(
        sql`SELECT * FROM escalation_thresholds ORDER BY minScore DESC`
      );
      return (rows as any)[0].map((r: any) => ({
        tierName: r.tierName,
        minScore: r.minScore,
        maxScore: r.maxScore,
        action: r.action,
        notifyRoles: typeof r.notifyRoles === "string" ? JSON.parse(r.notifyRoles) : (r.notifyRoles || []),
        autoEscalate: Boolean(r.autoEscalate),
      }));
    }),

  /**
   * Extended Templates — signal explanation templates with confidence requirements
   * Uses snake_case column names from actual DB
   */
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
