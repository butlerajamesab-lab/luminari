import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getLiveAnomalyViewfinderStates } from "../services/anomaly-viewfinder-live";
import {
  getPublishableResourceDirectoryDetail,
  getPublishableResourceDirectorySummary,
  searchPublishableResourceDirectory,
} from "../services/resource-directory-publishable";

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
        resourceEntityId: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            "Invalid resource entity identifier"
          ),
      })
    )
    .query(async ({ input }) => {
      const resource = await getPublishableResourceDirectoryDetail(
        input.resourceEntityId
      );
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      return resource;
    }),
});
