/**
 * Signal Extraction Router
 * 
 * tRPC procedures for the Signal Extraction Layer.
 * Exposes: extractDocument, extractCase, listExtractions, getExtraction
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { extractAndPersist, extractCase } from "../signal-extraction";
import { signalExtractions } from "../../drizzle/schema";
import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";

export const signalExtractionRouter = router({
  /** Extract signals from a single document */
  extractDocument: protectedProcedure
    .input(z.object({ documentId: z.number(), caseId: z.number() }))
    .mutation(async ({ input }) => {
      const record = await extractAndPersist(input.documentId, input.caseId);
      return { status: "EXTRACTION_STABLE", record };
    }),

  /** Batch extract all ready documents in a case */
  extractCaseBatch: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await extractCase(input.caseId);
      return { status: "EXTRACTION_STABLE", ...result };
    }),

  /** List all extractions for a case */
  listExtractions: protectedProcedure
    .input(z.object({ caseId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(signalExtractions)
        .where(eq(signalExtractions.caseId, input.caseId))
        .orderBy(desc(signalExtractions.extractedAt))
        .limit(input.limit || 100);

      return rows.map(r => ({
        id: r.id,
        docId: r.docId,
        caseId: r.caseId,
        entities: {
          people: JSON.parse(r.entitiesPeople || "[]"),
          companies: JSON.parse(r.entitiesCompanies || "[]"),
          agencies: JSON.parse(r.entitiesAgencies || "[]"),
        },
        complaint: {
          type: r.complaintType || "",
          description: r.complaintDescription || "",
          category: r.complaintCategory || "other",
          raw_category: r.complaintRawCategory || "",
        },
        location: {
          city: r.locationCity,
          county: r.locationCounty,
          state: r.locationState,
        },
        timeline: {
          event_date: r.eventDate,
          filed_date: r.filedDate,
        },
        signals: {
          fingerprint: r.fingerprint,
          keywords: JSON.parse(r.keywords || "[]"),
        },
        source: {
          source_id: r.sourceId || "",
          dataset: r.dataset || "",
        },
        extractedAt: r.extractedAt,
      }));
    }),

  /** Get a single extraction by document ID */
  getByDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select()
        .from(signalExtractions)
        .where(eq(signalExtractions.docId, input.documentId))
        .limit(1);

      if (!row) return null;

      return {
        id: row.id,
        docId: row.docId,
        caseId: row.caseId,
        entities: {
          people: JSON.parse(row.entitiesPeople || "[]"),
          companies: JSON.parse(row.entitiesCompanies || "[]"),
          agencies: JSON.parse(row.entitiesAgencies || "[]"),
        },
        complaint: {
          type: row.complaintType || "",
          description: row.complaintDescription || "",
          category: row.complaintCategory || "other",
          raw_category: row.complaintRawCategory || "",
        },
        location: {
          city: row.locationCity,
          county: row.locationCounty,
          state: row.locationState,
        },
        timeline: {
          event_date: row.eventDate,
          filed_date: row.filedDate,
        },
        signals: {
          fingerprint: row.fingerprint,
          keywords: JSON.parse(row.keywords || "[]"),
        },
        source: {
          source_id: row.sourceId || "",
          dataset: row.dataset || "",
        },
        extractedAt: row.extractedAt,
      };
    }),

  /** Get extraction stats for a case */
  stats: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const [rows] = await db.execute(
        sql`SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT fingerprint_se) as unique_fingerprints,
          COUNT(DISTINCT location_state_se) as states_covered,
          SUM(CASE WHEN complaint_category_se = 'financial' THEN 1 ELSE 0 END) as financial,
          SUM(CASE WHEN complaint_category_se = 'medical' THEN 1 ELSE 0 END) as medical,
          SUM(CASE WHEN complaint_category_se = 'housing' THEN 1 ELSE 0 END) as housing,
          SUM(CASE WHEN complaint_category_se = 'legal' THEN 1 ELSE 0 END) as legal,
          SUM(CASE WHEN complaint_category_se = 'other' THEN 1 ELSE 0 END) as other_cat
        FROM signal_extractions WHERE case_id_se = ${input.caseId}`
      );
      const r = (rows as unknown as any[])[0] || {};
      return {
        total: Number(r.total || 0),
        uniqueFingerprints: Number(r.unique_fingerprints || 0),
        statesCovered: Number(r.states_covered || 0),
        byCategory: {
          financial: Number(r.financial || 0),
          medical: Number(r.medical || 0),
          housing: Number(r.housing || 0),
          legal: Number(r.legal || 0),
          other: Number(r.other_cat || 0),
        },
      };
    }),
});
