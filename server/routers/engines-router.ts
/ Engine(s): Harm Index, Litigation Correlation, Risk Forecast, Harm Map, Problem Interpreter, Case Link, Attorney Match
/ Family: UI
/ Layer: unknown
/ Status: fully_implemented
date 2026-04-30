/**
 * Unified Router for all 7 Luminari Engines
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

// Engine imports
import { calculateHarmIndex, getHarmIndexSummary, getEntityHarmHistory } from "../engines/harm-index-service";
import { runLitigationCorrelation, getEntityLitigationMatches, getLitigationCorrelationSummary } from "../engines/litigation-correlation-service";
import { generateRiskForecasts, getRiskForecastSummary } from "../engines/risk-forecast-service";
import { generateHarmMap, getHarmMapData } from "../engines/harm-map-service";
import { startIntakeSession, getIntakeSession, getUserSessions, getClarifyingQuestions, getEvidenceGuidance } from "../engines/problem-interpreter-service";
import { generateShareableLink, accessSharedCase, getCaseShareLinks, revokeShareableLink, getShareAnalytics } from "../engines/case-link-service";
import { findMatchingAttorneys, addAttorney, getAttorneyRegistry, recordOutcome, getMatchAnalytics } from "../engines/attorney-match-service";

export const enginesRouter = router({
  // ─── Engine 1: Systemic Harm Index ───
  harmIndex: router({
    calculate: protectedProcedure.mutation(async () => {
      return withEngineTracking({ engineId: ENGINE_IDS.HARM_INDEX, caseId: 0 }, async () => {
        return await calculateHarmIndex();
      });
    }),
    getSummary: protectedProcedure.query(async () => {
      return await getHarmIndexSummary();
    }),
    getEntityHistory: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input }) => {
        return await getEntityHarmHistory(input.entityId);
      }),
  }),

  // ─── Engine 2: Litigation Correlation ───
  litigation: router({
    runCorrelation: protectedProcedure.mutation(async () => {
      return withEngineTracking({ engineId: ENGINE_IDS.LITIGATION_CORRELATION, caseId: 0 }, async () => {
        return await runLitigationCorrelation();
      });
    }),
    getEntityMatches: protectedProcedure
      .input(z.object({ entityName: z.string() }))
      .query(async ({ input }) => {
        return await getEntityLitigationMatches(input.entityName);
      }),
    getSummary: protectedProcedure.query(async () => {
      return await getLitigationCorrelationSummary();
    }),
  }),

  // ─── Engine 3: Systemic Risk Forecast ───
  riskForecast: router({
    generate: protectedProcedure
      .input(z.object({ horizonDays: z.number().default(30) }).optional())
      .mutation(async ({ input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.RISK_FORECAST, caseId: 0 }, async () => {
          return await generateRiskForecasts(input?.horizonDays ?? 30);
        });
      }),
    getSummary: protectedProcedure.query(async () => {
      return await getRiskForecastSummary();
    }),
  }),

  // ─── Engine 4: Global Systemic Harm Map ───
  harmMap: router({
    generate: protectedProcedure.mutation(async () => {
      return withEngineTracking({ engineId: ENGINE_IDS.HARM_MAP, caseId: 0 }, async () => {
        return await generateHarmMap();
      });
    }),
    getData: protectedProcedure.query(async () => {
      return await getHarmMapData();
    }),
  }),

  // ─── Engine 5: Problem Interpreter / Front Door ───
  interpreter: router({
    startSession: protectedProcedure
      .input(z.object({ story: z.string().min(10) }))
      .mutation(async ({ ctx, input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.PROBLEM_INTERPRETER, caseId: 0, userId: ctx.user?.id }, async () => {
          return await startIntakeSession(ctx.user.id, input.story);
        });
      }),
    getSession: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        return await getIntakeSession(input.sessionId);
      }),
    getMySessions: protectedProcedure.query(async ({ ctx }) => {
      return await getUserSessions(ctx.user.id);
    }),
    getClarifyingQuestions: protectedProcedure
      .input(z.object({ claimType: z.string() }))
      .query(async ({ input }) => {
        return await getClarifyingQuestions(input.claimType);
      }),
    getEvidenceGuidance: protectedProcedure
      .input(z.object({ claimType: z.string() }))
      .query(async ({ input }) => {
        return await getEvidenceGuidance(input.claimType);
      }),
  }),

  // ─── Engine 6: Case Link / Shareable Case ───
  caseLink: router({
    generate: protectedProcedure
      .input(z.object({
        caseId: z.number(),
        accessLevel: z.string().default("summary"),
        expiresInDays: z.number().nullable().default(30),
        permissions: z.object({
          allowEvidence: z.boolean().default(false),
          allowNames: z.boolean().default(true),
          allowFinancials: z.boolean().default(false),
          allowDocuments: z.boolean().default(false),
          allowPatternLinks: z.boolean().default(true),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.CASE_LINK, caseId: input.caseId, userId: ctx.user?.id }, async () => {
          return await generateShareableLink(
            input.caseId, ctx.user.id, input.accessLevel, input.expiresInDays, input.permissions
          );
        });
      }),
    access: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input, ctx }) => {
        const ip = ctx.req?.ip || null;
        const ua = ctx.req?.headers?.["user-agent"] || null;
        return await accessSharedCase(input.token, ip, ua);
      }),
    getCaseLinks: protectedProcedure
      .input(z.object({ caseId: z.number() }))
      .query(async ({ input }) => {
        return await getCaseShareLinks(input.caseId);
      }),
    revoke: protectedProcedure
      .input(z.object({ linkId: z.number() }))
      .mutation(async ({ input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.CASE_LINK, caseId: 0 }, async () => {
          return await revokeShareableLink(input.linkId);
        });
      }),
    getAnalytics: protectedProcedure
      .input(z.object({ caseId: z.number() }))
      .query(async ({ input }) => {
        return await getShareAnalytics(input.caseId);
      }),
  }),

  // ─── Engine 7: Attorney Match ───
  attorneyMatch: router({
    findMatches: protectedProcedure
      .input(z.object({
        caseId: z.number(),
        claimType: z.string(),
        jurisdiction: z.string(),
        estimatedDamages: z.number().optional(),
        needsContingency: z.boolean().optional(),
        needsProBono: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.ATTORNEY_MATCH, caseId: input.caseId }, async () => {
          return await findMatchingAttorneys(input);
        });
      }),
    addAttorney: protectedProcedure
      .input(z.object({
        name: z.string(),
        firmName: z.string().nullable().optional(),
        barNumber: z.string().nullable().optional(),
        jurisdiction: z.string().nullable().optional(),
        practiceAreas: z.array(z.string()).default([]),
        yearsExperience: z.number().default(0),
        acceptsContingency: z.boolean().default(false),
        acceptsProBono: z.boolean().default(false),
        acceptsNewClients: z.boolean().default(true),
        contactEmail: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.ATTORNEY_MATCH, caseId: 0 }, async () => {
          return await addAttorney({
            ...input,
            firmName: input.firmName ?? null,
            barNumber: input.barNumber ?? null,
            jurisdiction: input.jurisdiction ?? null,
            contactEmail: input.contactEmail ?? null,
            website: input.website ?? null,
          });
        });
      }),
    getRegistry: protectedProcedure.query(async () => {
      return await getAttorneyRegistry();
    }),
    recordOutcome: protectedProcedure
      .input(z.object({
        caseId: z.number(),
        attorneyId: z.number(),
        contactMade: z.boolean().optional(),
        representationAccepted: z.boolean().optional(),
        representationDeclined: z.boolean().optional(),
        caseResult: z.string().optional(),
        settlementAmount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return withEngineTracking({ engineId: ENGINE_IDS.ATTORNEY_MATCH, caseId: input.caseId }, async () => {
          await recordOutcome(input.caseId, input.attorneyId, input);
          return { success: true };
        });
      }),
    getAnalytics: protectedProcedure.query(async () => {
      return await getMatchAnalytics();
    }),
  }),
});
