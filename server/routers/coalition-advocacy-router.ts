import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  matchAdvocacyTargets,
  activateCoalition,
  generateAdvocacyPackage,
  recordAdvocacyOutcome,
  getCoalitionDashboard,
} from "../coalition-advocacy-service";

export const coalitionAdvocacyRouter = router({
  // Match advocacy targets for a pattern
  matchTargets: protectedProcedure
    .input(z.object({
      patternId: z.string(),
      jurisdiction: z.string().optional(),
      issueDomain: z.string().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return matchAdvocacyTargets(input.patternId, {
        jurisdiction: input.jurisdiction,
        issueDomain: input.issueDomain,
        limit: input.limit,
      });
    }),

  // Activate coalition outreach
  activate: protectedProcedure
    .input(z.object({
      patternId: z.string(),
      coalitionIds: z.array(z.string()),
      actionType: z.enum([
        "coalition_share", "advocacy_outreach", "legislator_contact",
        "media_brief", "public_comment_submission", "oversight_referral",
      ]),
    }))
    .mutation(async ({ input }) => {
      return activateCoalition(input.patternId, input.coalitionIds, input.actionType);
    }),

  // Generate advocacy package
  generatePackage: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .mutation(async ({ input }) => {
      return generateAdvocacyPackage(input.patternId);
    }),

  // Record an advocacy outcome
  recordOutcome: protectedProcedure
    .input(z.object({
      patternId: z.string(),
      coalitionId: z.string().nullable(),
      outcomeType: z.enum([
        "media_coverage", "policy_hearing", "legislation_introduced",
        "regulatory_action", "coalition_participation", "public_campaign_result",
      ]),
      description: z.string(),
      impactScore: z.number().min(0).max(100),
    }))
    .mutation(async ({ input }) => {
      const outcomeId = await recordAdvocacyOutcome(
        input.patternId, input.coalitionId, input.outcomeType,
        input.description, input.impactScore
      );
      return { outcomeId };
    }),

  // Get coalition dashboard
  dashboard: protectedProcedure.query(async () => {
    return getCoalitionDashboard();
  }),

  // ─── Escalation Route Catalog ─────────────────────────────────────────────
  escalationRoutes: protectedProcedure
    .input(z.object({
      domain: z.string().optional(),
      claimType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let q;
      if (input.domain && input.claimType) {
        q = sql`SELECT * FROM escalation_route_catalog WHERE domain = ${input.domain} AND claim_type = ${input.claimType} ORDER BY route_id`;
      } else if (input.domain) {
        q = sql`SELECT * FROM escalation_route_catalog WHERE domain = ${input.domain} ORDER BY route_id`;
      } else if (input.claimType) {
        q = sql`SELECT * FROM escalation_route_catalog WHERE claim_type = ${input.claimType} ORDER BY route_id`;
      } else {
        q = sql`SELECT * FROM escalation_route_catalog ORDER BY route_id`;
      }
      const [rows] = await db.execute(q);
      return (rows as unknown as any[]).map(r => ({
        routeId: r.route_id,
        claimType: r.claim_type,
        domain: r.domain,
        primaryAgency: r.primary_agency,
        secondaryAgency: r.secondary_agency,
        courtLevel: r.court_level,
        appealBody: r.appeal_body,
        oversightBody: r.oversight_body,
        advocacyOrganizations: (() => { try { return JSON.parse(r.advocacy_organizations); } catch { return []; } })(),
        mediaEscalationPossible: !!r.media_escalation_possible,
        policyEscalationPossible: !!r.policy_escalation_possible,
        escalationTriggers: (() => { try { return JSON.parse(r.escalation_triggers); } catch { return []; } })(),
        notes: r.notes,
      }));
    }),

  // ─── Deadline Rule Catalog ────────────────────────────────────────────────
  deadlineRules: protectedProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      claimType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let q;
      if (input.jurisdiction && input.claimType) {
        q = sql`SELECT * FROM deadline_rule_catalog WHERE jurisdiction = ${input.jurisdiction} AND claim_type = ${input.claimType} ORDER BY rule_id`;
      } else if (input.jurisdiction) {
        q = sql`SELECT * FROM deadline_rule_catalog WHERE jurisdiction = ${input.jurisdiction} ORDER BY rule_id`;
      } else if (input.claimType) {
        q = sql`SELECT * FROM deadline_rule_catalog WHERE claim_type = ${input.claimType} ORDER BY rule_id`;
      } else {
        q = sql`SELECT * FROM deadline_rule_catalog ORDER BY rule_id`;
      }
      const [rows] = await db.execute(q);
      return (rows as unknown as any[]).map(r => ({
        ruleId: r.rule_id,
        claimType: r.claim_type,
        jurisdiction: r.jurisdiction,
        statuteOfLimitations: r.statute_of_limitations,
        administrativeFilingDeadline: r.administrative_filing_deadline,
        appealDeadline: r.appeal_deadline,
        documentDeadline: r.document_deadline,
        sourceStatute: r.source_statute,
        tollingConditions: r.tolling_conditions,
        exceptions: r.exceptions,
        notes: r.notes,
      }));
    }),
});



// ============================================================
