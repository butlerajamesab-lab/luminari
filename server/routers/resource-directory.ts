import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getLiveAnomalyViewfinderStates } from "../services/anomaly-viewfinder-live";
import {
  getPublishableResourceDirectoryDetail,
  getPublishableResourceDirectorySummary,
  searchPublishableResourceDirectory,
} from "../services/resource-directory-publishable";
import { getGovOfficeDetail } from "../services/resource-directory";

const searchInput = z
  .object({
    query: z.string().trim().max(160).optional(),
    jurisdiction: z.string().trim().length(2).optional(),
    category: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    limit: z.number().int().min(1).max(60).optional(),
    offset: z.number().int().min(0).max(20_000).optional(),
  })
  .optional();

// Directory detail accepts both identity shapes: canonical resource UUIDs
// and hash-derived government-office keys (gof_ + sha256 hex).
const resourceIdentifier = z
  .string()
  .regex(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|gof_[a-f0-9]{16,32})$/i,
    "Invalid resource identifier"
  );

export const resourceDirectoryRouter = router({
  summary: publicProcedure.query(async () => {
    return getPublishableResourceDirectorySummary();
  }),

  search: publicProcedure.input(searchInput).query(async ({ input }) => {
    return searchPublishableResourceDirectory(input ?? {});
  }),

  viewfinderStates: publicProcedure.query(async () => {
    return getLiveAnomalyViewfinderStates();
  }),

  detail: publicProcedure
    .input(
      z.object({
        resourceEntityId: resourceIdentifier,
      })
    )
    .query(async ({ input }) => {
      const resource = /^gof_/i.test(input.resourceEntityId)
        ? await getGovOfficeDetail(input.resourceEntityId)
        : await getPublishableResourceDirectoryDetail(input.resourceEntityId);
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      return resource;
    }),
});
