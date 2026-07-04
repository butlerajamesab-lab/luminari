/**
 * Civic Genome — tRPC Router
 *
 * Lighthouse read-only surface for the living civic genome substrate.
 * Exposes families, bills, events, lineage edges, and momentum snapshots.
 *
 * Principle: Observe. Do not assert. Do not write.
 * Writes originate from Atlas/Rosetta ingestion pipelines only.
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import {
  list_genome_families,
  get_genome_family,
  list_genome_bills,
  get_genome_bill,
  list_genome_events,
  list_lineage_edges,
  list_momentum_snapshots,
  get_genome_stats,
} from "../civic-genome-db";

const uuid_param = z.string().uuid();

export const civicGenomeRouter = router({
  // ─── Stats ──────────────────────────────────────────────────────────────
  stats: publicProcedure.query(async () => {
    return get_genome_stats();
  }),

  // ─── Families ───────────────────────────────────────────────────────────
  list_families: publicProcedure
    .input(
      z.object({
        policy_domain: z.string().optional(),
        family_status: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return list_genome_families(input ?? {});
    }),

  get_family: publicProcedure
    .input(z.object({ family_id: uuid_param }))
    .query(async ({ input }) => {
      return get_genome_family(input.family_id);
    }),

  // ─── Bills ──────────────────────────────────────────────────────────────
  list_bills: publicProcedure
    .input(
      z.object({
        family_id: uuid_param.optional(),
        state_code: z.string().max(10).optional(),
        bill_status: z.string().optional(),
        current_state_position: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return list_genome_bills(input ?? {});
    }),

  get_bill: publicProcedure
    .input(z.object({ genome_bill_id: uuid_param }))
    .query(async ({ input }) => {
      return get_genome_bill(input.genome_bill_id);
    }),

  // ─── Events ─────────────────────────────────────────────────────────────
  list_events: publicProcedure
    .input(
      z.object({
        family_id: uuid_param.optional(),
        genome_bill_id: uuid_param.optional(),
        state_code: z.string().max(10).optional(),
        event_type: z.string().optional(),
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return list_genome_events(input ?? {});
    }),

  // ─── Lineage Edges ───────────────────────────────────────────────────────
  list_lineage_edges: publicProcedure
    .input(
      z.object({
        family_id: uuid_param.optional(),
        from_bill_id: uuid_param.optional(),
        to_bill_id: uuid_param.optional(),
        relationship_type: z.string().optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return list_lineage_edges(input ?? {});
    }),

  // ─── Momentum Snapshots ──────────────────────────────────────────────────
  list_momentum_snapshots: publicProcedure
    .input(
      z.object({
        family_id: uuid_param,
        limit: z.number().min(1).max(365).optional(),
      })
    )
    .query(async ({ input }) => {
      return list_momentum_snapshots(input);
    }),
});
