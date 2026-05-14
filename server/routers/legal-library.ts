import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  createStatute, getStatuteById, searchStatutes, countStatutes, updateStatute, deleteStatute,
  createCaseLaw, getCaseLawById, searchCaseLaw, countCaseLaw,
  createEnforcementRecord, getEnforcementRecordById, searchEnforcementRecords,
  createWeakJoint, getWeakJointById, searchWeakJoints,
  createContradiction, getContradictionById, listContradictions,
  getLegalLibraryStats,
  getClausesByStatuteId, getStatuteWithClauses, searchEnrichedStatutes,
} from "../legal-library-db";
import { LEGAL_DOMAINS, type LegalDomain } from "../../drizzle/schema";

const domainEnum = z.enum(LEGAL_DOMAINS as unknown as [string, ...string[]]);
const castDomains = (d: string[]) => d as LegalDomain[];
const legalRecordId = z.string().uuid();

export const legalLibraryRouter = router({
  // ─── Stats (canonical tables only) ───
  stats: publicProcedure
    .input(z.object({ jurisdiction: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return getLegalLibraryStats(input?.jurisdiction);
    }),

  // ─── Statutes ───
  searchStatutes: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: domainEnum.optional(),
      query: z.string().optional(),
      sourceType: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return searchStatutes({ ...input, domain: input.domain as LegalDomain | undefined });
    }),

  getStatute: publicProcedure
    .input(z.object({ id: legalRecordId }))
    .query(async ({ input }) => {
      return getStatuteById(input.id);
    }),

  createStatute: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      citation: z.string(),
      title: z.string(),
      fullText: z.string().optional(),
      summary: z.string().optional(),
      domains: z.array(domainEnum),
      sourceType: z.enum(["statute", "regulation", "case_law", "executive_order", "agency_guidance", "model_legislation"]).optional(),
      keyRequirements: z.array(z.string()).optional(),
      deadlines: z.array(z.object({ description: z.string(), days: z.number(), from: z.string() })).optional(),
      effectiveDate: z.number().optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createStatute({ ...input, domains: castDomains(input.domains), addedBy: ctx.user.name ?? ctx.user.openId });
      return { id };
    }),

  updateStatute: protectedProcedure
    .input(z.object({
      id: legalRecordId,
      citation: z.string().optional(),
      title: z.string().optional(),
      fullText: z.string().optional(),
      summary: z.string().optional(),
      domains: z.array(z.string()).optional(),
      keyRequirements: z.array(z.string()).optional(),
      deadlines: z.array(z.object({ description: z.string(), days: z.number(), from: z.string() })).optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateStatute(id, { ...data, domains: data.domains ? (data.domains as unknown as string[]).map(d => d) as LegalDomain[] : undefined });
      return { success: true };
    }),

  deleteStatute: protectedProcedure
    .input(z.object({ id: legalRecordId }))
    .mutation(async ({ input }) => {
      await deleteStatute(input.id);
      return { success: true };
    }),

  // ─── Case Law ───
  searchCaseLaw: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: domainEnum.optional(),
      query: z.string().optional(),
      court: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return searchCaseLaw({ ...input, domain: input.domain as LegalDomain | undefined });
    }),

  getCaseLaw: publicProcedure
    .input(z.object({ id: legalRecordId }))
    .query(async ({ input }) => {
      return getCaseLawById(input.id);
    }),

  createCaseLaw: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      citation: z.string(),
      caseName: z.string(),
      court: z.string(),
      yearDecided: z.number().optional(),
      holding: z.string().optional(),
      keyQuotes: z.array(z.object({ quote: z.string(), page: z.string().optional(), context: z.string().optional() })).optional(),
      statutesInterpreted: z.array(z.string()).optional(),
      domains: z.array(domainEnum),
      subsequentHistory: z.string().optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createCaseLaw({ ...input, domains: castDomains(input.domains), addedBy: ctx.user.name ?? ctx.user.openId });
      return { id };
    }),

  // ─── Enforcement Records ───
  searchEnforcement: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: domainEnum.optional(),
      agency: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return searchEnforcementRecords({ ...input, domain: input.domain as LegalDomain | undefined });
    }),

  getEnforcement: publicProcedure
    .input(z.object({ id: legalRecordId }))
    .query(async ({ input }) => {
      return getEnforcementRecordById(input.id);
    }),

  createEnforcement: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      agencyName: z.string(),
      complaintType: z.string().optional(),
      domains: z.array(domainEnum),
      statutoryRequirement: z.string().optional(),
      statuteCitation: z.string().optional(),
      outcome: z.string().optional(),
      requiredResponseDays: z.number().optional(),
      observedResponseDays: z.number().optional(),
      patternDescription: z.string().optional(),
      dataSource: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createEnforcementRecord({ ...input, domains: castDomains(input.domains), addedBy: ctx.user.name ?? ctx.user.openId });
      return { id };
    }),

  // ─── Weak Joints ───
  searchWeakJoints: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: domainEnum.optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return searchWeakJoints({ ...input, domain: input.domain as LegalDomain | undefined });
    }),

  getWeakJoint: publicProcedure
    .input(z.object({ id: legalRecordId }))
    .query(async ({ input }) => {
      return getWeakJointById(input.id);
    }),

  createWeakJoint: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      statuteCitation: z.string(),
      statuteId: z.number().optional(),
      whatLawRequires: z.string(),
      whatActuallyHappens: z.string(),
      divergenceDescription: z.string(),
      domains: z.array(domainEnum),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      evidenceSources: z.array(z.string()).optional(),
      affectedPopulation: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createWeakJoint({ ...input, domains: castDomains(input.domains), addedBy: ctx.user.name ?? ctx.user.openId });
      return { id };
    }),

  // ─── Contradictions ───
  listContradictions: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      domain: domainEnum.optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return listContradictions({ ...input, domain: input.domain as LegalDomain | undefined });
    }),

  getContradiction: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getContradictionById(input.id);
    }),

  createContradiction: protectedProcedure
    .input(z.object({
      title: z.string(),
      doctrineA: z.string(),
      doctrineACitation: z.string().optional(),
      doctrineB: z.string(),
      doctrineBCitation: z.string().optional(),
      contradictionDescription: z.string(),
      harmDescription: z.string().optional(),
      domains: z.array(domainEnum),
      jurisdiction: z.string(),
      reformStatus: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createContradiction({ ...input, domains: castDomains(input.domains), addedBy: ctx.user.name ?? ctx.user.openId });
      return { id };
    }),
  // ─── Statute Clauses (X-Ray) ───
  getStatuteWithClauses: publicProcedure
    .input(z.object({ statuteId: legalRecordId }))
    .query(async ({ input }) => {
      return getStatuteWithClauses(input.statuteId);
    }),
  getClausesByStatuteId: publicProcedure
    .input(z.object({ statuteId: z.number() }))
    .query(async ({ input }) => {
      return getClausesByStatuteId(input.statuteId);
    }),
  searchEnrichedStatutes: publicProcedure
    .input(z.object({
      domain: domainEnum.optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? {};
      return searchEnrichedStatutes({ ...opts, domain: opts.domain as LegalDomain | undefined });
    }),
});
