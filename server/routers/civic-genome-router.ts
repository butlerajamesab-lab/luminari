/**
 * Civic Genome — tRPC Router
 *
 * Lighthouse read surface for the living civic genome substrate plus bounded,
 * admin-only projection, Rosetta assembly, and family resolution commands.
 *
 * Principle: Observe. Do not assert. Projection never calls LegiScan directly.
 */
import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
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
import { get_genome_bill_by_source_id } from "../civic-genome-source-id";
import { project_docket_cache_to_civic_genome } from "../civic-genome-projection";
import { resolve_or_assemble_docket_bill } from "../civic-genome-single-bill-assembly";
import { ingest_docket_bill_to_rosetta_source } from "../civic-genome-rosetta-source-ingestion";
import {
  get_latest_rosetta_law_view_by_source_document,
  get_rosetta_law_view_by_extraction_run,
} from "../civic-genome-rosetta-contract";
import { assemble_rosetta_and_resolve_family } from "../civic-genome-rosetta-family-orchestration";
import { backfill_explicit_rosetta_bindings } from "../civic-genome-rosetta-backfill";
import { get_civic_genome_bill_detail } from "../civic-genome-bill-detail";
import { resolve_civic_genome_family } from "../civic-genome-family-resolution";

const uuid_param = z.string().uuid();
const source_bill_id_param = z.coerce.number().int().positive();
const positive_integer_param = z.coerce.number().int().positive();

export const civicGenomeRouter = router({
  stats: publicProcedure.query(async () => get_genome_stats()),

  project_from_docket_cache: adminProcedure
    .input(z.object({
      state_code: z.string().max(10).optional(),
      limit: z.number().min(1).max(500).optional(),
    }).optional())
    .mutation(async ({ input }) => project_docket_cache_to_civic_genome(input ?? {})),

  resolve_or_assemble_docket_bill: adminProcedure
    .input(z.object({ source_bill_id: source_bill_id_param }))
    .mutation(async ({ input }) => resolve_or_assemble_docket_bill(input.source_bill_id)),

  ingest_docket_bill_to_rosetta_source: adminProcedure
    .input(z.object({ source_bill_id: source_bill_id_param }))
    .mutation(async ({ input }) => ingest_docket_bill_to_rosetta_source(input.source_bill_id)),

  get_rosetta_law_view_by_extraction_run: adminProcedure
    .input(z.object({ extraction_run_id: positive_integer_param }))
    .query(async ({ input }) => get_rosetta_law_view_by_extraction_run(input.extraction_run_id)),

  get_latest_rosetta_law_view_by_source_document: adminProcedure
    .input(z.object({ source_document_id: positive_integer_param }))
    .query(async ({ input }) => get_latest_rosetta_law_view_by_source_document(input.source_document_id)),

  assemble_rosetta_structural_dna: adminProcedure
    .input(z.object({
      genome_bill_id: uuid_param,
      source_document_id: positive_integer_param,
      extraction_run_id: positive_integer_param.optional(),
    }))
    .mutation(async ({ input }) => assemble_rosetta_and_resolve_family(input)),

  backfill_explicit_rosetta_bindings: adminProcedure
    .input(z.object({
      bindings: z.array(z.object({
        genome_bill_id: uuid_param,
        source_document_id: positive_integer_param,
        extraction_run_id: positive_integer_param.optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ input }) => backfill_explicit_rosetta_bindings(input.bindings)),

  resolve_family: adminProcedure
    .input(z.object({ genome_bill_id: uuid_param }))
    .mutation(async ({ input }) => resolve_civic_genome_family(input.genome_bill_id)),

  list_families: publicProcedure
    .input(z.object({
      policy_domain: z.string().optional(),
      family_status: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => list_genome_families(input ?? {})),

  get_family: publicProcedure
    .input(z.object({ family_id: uuid_param }))
    .query(async ({ input }) => get_genome_family(input.family_id)),

  list_bills: publicProcedure
    .input(z.object({
      family_id: uuid_param.optional(),
      state_code: z.string().max(10).optional(),
      bill_status: z.string().optional(),
      current_state_position: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => list_genome_bills(input ?? {})),

  get_bill: publicProcedure
    .input(z.object({ genome_bill_id: uuid_param }))
    .query(async ({ input }) => get_genome_bill(input.genome_bill_id)),

  get_bill_detail: publicProcedure
    .input(z.object({ genome_bill_id: uuid_param }))
    .query(async ({ input }) => get_civic_genome_bill_detail(input.genome_bill_id)),

  get_bill_by_source_id: publicProcedure
    .input(z.object({ source_bill_id: source_bill_id_param }))
    .query(async ({ input }) => get_genome_bill_by_source_id(input.source_bill_id)),

  list_events: publicProcedure
    .input(z.object({
      family_id: uuid_param.optional(),
      genome_bill_id: uuid_param.optional(),
      state_code: z.string().max(10).optional(),
      event_type: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => list_genome_events(input ?? {})),

  list_lineage_edges: publicProcedure
    .input(z.object({
      family_id: uuid_param.optional(),
      from_bill_id: uuid_param.optional(),
      to_bill_id: uuid_param.optional(),
      relationship_type: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
    }).optional())
    .query(async ({ input }) => list_lineage_edges(input ?? {})),

  list_momentum_snapshots: publicProcedure
    .input(z.object({
      family_id: uuid_param,
      limit: z.number().min(1).max(365).optional(),
    }))
    .query(async ({ input }) => list_momentum_snapshots(input)),
});
