import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getLiveAnomalyViewfinderStates } from "../services/anomaly-viewfinder-live";
import {
  get_publishable_resource_directory_detail,
  get_publishable_resource_directory_summary,
  search_publishable_resource_directory,
} from "../services/resource-directory-publishable";
import { getGovOfficeDetail } from "../services/resource-directory";

const search_input = z
  .object({
    query: z.string().trim().max(160).optional(),
    jurisdiction: z
      .string()
      .trim()
      .transform((value) =>
        value.toUpperCase() === "USVI" ? "VI" : value.toUpperCase(),
      )
      .pipe(z.string().length(2))
      .optional(),
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
const resource_uuid_pattern =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const gov_office_id_pattern = "^gof_[a-f0-9]{16,32}$";
const resource_identifier = z
  .string()
  .regex(
    new RegExp(
      `^(?:${resource_uuid_pattern.slice(1, -1)}|${gov_office_id_pattern.slice(1, -1)})$`,
      "i",
    ),
    "Invalid resource entity identifier",
  );

export const resourceDirectoryRouter = router({
  summary: publicProcedure.query(async () => {
    return get_publishable_resource_directory_summary();
  }),

  search: publicProcedure.input(search_input).query(async ({ input }) => {
    return search_publishable_resource_directory(input ?? {});
  }),

  viewfinderStates: publicProcedure.query(async () => {
    return getLiveAnomalyViewfinderStates();
  }),

  detail: publicProcedure
    .input(
      z
        .object({
          resource_entity_id: resource_identifier.optional(),
          resourceEntityId: resource_identifier.optional(),
        })
        .transform((input) => ({
          resource_entity_id:
            input.resource_entity_id ?? input.resourceEntityId,
        }))
        .refine(
          (input) => Boolean(input.resource_entity_id),
          "Resource identifier is required",
        ),
    )
    .query(async ({ input }) => {
      const resource = /^gof_/i.test(input.resource_entity_id!)
        ? await getGovOfficeDetail(input.resource_entity_id!)
        : await get_publishable_resource_directory_detail(
            input.resource_entity_id!,
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
