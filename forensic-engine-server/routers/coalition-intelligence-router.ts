import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  searchCoalitionEntities,
  getLegislatorDetail,
  getAgencyDetail,
  getAdvocacyOrgDetail,
  getMediaDetail,
  assessCoalitionReadiness,
  recommendCoalition,
  getCoalitionIntelligenceDashboard,
} from "../coalition-intelligence-service";

const entityTypeEnum = z.enum(["legislator", "agency", "advocacy_org", "media"]);

export const coalitionIntelligenceRouter = router({
  // Unified search across all entity types
  search: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      entityTypes: z.array(entityTypeEnum).optional(),
      domains: z.array(z.string()).optional(),
      jurisdiction: z.string().optional(),
      state: z.string().optional(),
      minInfluence: z.number().min(0).max(100).optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      return searchCoalitionEntities(input);
    }),

  // Entity detail endpoints
  legislatorDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getLegislatorDetail(input.id);
    }),

  agencyDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getAgencyDetail(input.id);
    }),

  advocacyOrgDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getAdvocacyOrgDetail(input.id);
    }),

  mediaDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getMediaDetail(input.id);
    }),

  // Coalition readiness assessment
  assessReadiness: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      state: z.string().optional(),
      domains: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      return assessCoalitionReadiness(input);
    }),

  // Coalition recommendation
  recommend: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      state: z.string().optional(),
      domains: z.array(z.string()),
      maxPerType: z.number().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      return recommendCoalition(input);
    }),

  // Dashboard stats
  dashboard: protectedProcedure
    .query(async () => {
      return getCoalitionIntelligenceDashboard();
    }),
});
