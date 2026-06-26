import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { documents, entities, relationships } from "../../drizzle/schema";
import { sql } from "drizzle-orm";
import { processDocument } from "../analysis-pipeline";
import { queryForensicMetadata } from "../forensic-db";
// Note: processDocument runs with INGESTION_ENGINE system context internally

export const extractionRouter = router({
  /**
   * Get list of all documents with their extraction status
   */
  listDocuments: publicProcedure
    .input(z.object({
      caseId: z.number().optional(),
      status: z.enum(["uploaded", "extracting", "ready", "error"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      try {
        let query = db.select().from(documents);
        
        if (input.caseId) {
          // @ts-ignore - Drizzle query chain type
          query = query.where(sql`caseId = ${input.caseId}`);
        }
        
        if (input.status) {
          // @ts-ignore - Drizzle query chain type
          query = query.where(sql`status = ${input.status}`);
        }
        
        const docs = await query.limit(input.limit).offset(input.offset);
        
        return {
          success: true,
          documents: docs,
          count: docs.length,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          documents: [],
          count: 0,
        };
      }
    }),

  /**
   * Get extraction status for a specific document
   */
  getStatus: publicProcedure
    .input(z.object({
      documentId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const doc = await db.select().from(documents).where(sql`id = ${input.documentId}`);
        
        if (doc.length === 0) {
          return {
            success: false,
            error: "Document not found",
          };
        }
        
        const document = doc[0];
        
        // Get entity count for this document's case
        const entityCount = await queryForensicMetadata(
          'SELECT COUNT(*) as count FROM entities WHERE caseId = ?',
          [document.caseId]
        );
        
        // Get relationship count for this document's case
        const relationshipCount = await queryForensicMetadata(
          'SELECT COUNT(*) as count FROM relationships WHERE caseId = ?',
          [document.caseId]
        );
        
        return {
          success: true,
          document: {
            id: document.id,
            filename: document.filename,
            status: document.status,
            case_id: document.caseId,
            created_at: document.createdAt,
          },
          stats: {
            entities: (entityCount as any)[0]?.count || 0,
            relationships: (relationshipCount as any)[0]?.count || 0,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  /**
   * Start extraction on a document
   * Runs with INGESTION_ENGINE system context to bypass ownership checks
   */
  startExtraction: publicProcedure
    .input(z.object({
      documentId: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Update document status to extracting
        await db.update(documents)
          .set({ status: "extracting" })
          .where(sql`id = ${input.documentId}`);
        
        // Start extraction in background
        // processDocument runs with INGESTION_ENGINE system context
        processDocument(input.documentId).catch(err => {
          console.error("[Extraction] Background error:", err);
        });
        
        return {
          success: true,
          message: "Extraction started",
          document_id: input.documentId,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  /**
   * Search entities by type and case
   */
  searchEntities: publicProcedure
    .input(z.object({
      caseId: z.number(),
      type: z.string().optional(),
      query: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      try {
        let sql_query = `
          SELECT id, caseId, name, type 
          FROM entities 
          WHERE caseId = ?
        `;
        const params: any[] = [input.caseId];
        
        if (input.type) {
          sql_query += ` AND type = ?`;
          params.push(input.type);
        }
        
        if (input.query) {
          sql_query += ` AND name LIKE ?`;
          params.push(`%${input.query}%`);
        }
        
        sql_query += ` LIMIT ?`;
        params.push(input.limit);
        
        const results = await queryForensicMetadata(sql_query, params);
        
        return {
          success: true,
          entities: results,
          count: results.length,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          entities: [],
          count: 0,
        };
      }
    }),

  /**
   * Get entity details
   */
  getEntity: publicProcedure
    .input(z.object({
      entityId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const results = await queryForensicMetadata(
          'SELECT id, caseId, name, type, description FROM entities WHERE id = ?',
          [input.entityId]
        );
        
        if (results.length === 0) {
          return {
            success: false,
            error: "Entity not found",
          };
        }
        
        const entity = results[0];
        
        // Get relationships
        const relationships_data = await queryForensicMetadata(
          'SELECT id, sourceEntityId, targetEntityId, relationshipType FROM relationships WHERE sourceEntityId = ? OR targetEntityId = ? LIMIT 50',
          [input.entityId, input.entityId]
        );
        
        return {
          success: true,
          entity: entity,
          relationships: relationships_data,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  /**
   * Get all entity types for a case
   */
  getEntityTypes: publicProcedure
    .input(z.object({
      caseId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const results = await queryForensicMetadata(
          'SELECT DISTINCT type FROM entities WHERE caseId = ? ORDER BY type',
          [input.caseId]
        );
        
        return {
          success: true,
          types: results.map((r: any) => r.type),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          types: [],
        };
      }
    }),

  /**
   * Get extraction statistics for a case
   */
  getStats: publicProcedure
    .input(z.object({
      caseId: z.number(),
    }))
    .query(async ({ input }) => {
      try {
        const entityCount = await queryForensicMetadata(
          'SELECT COUNT(*) as count FROM entities WHERE caseId = ?',
          [input.caseId]
        );
        
        const relationshipCount = await queryForensicMetadata(
          'SELECT COUNT(*) as count FROM relationships WHERE caseId = ?',
          [input.caseId]
        );
        
        const typeBreakdown = await queryForensicMetadata(
          'SELECT type, COUNT(*) as count FROM entities WHERE caseId = ? GROUP BY type ORDER BY count DESC',
          [input.caseId]
        );
        
        const documentCount = await db.select().from(documents).where(sql`caseId = ${input.caseId}`);
        
        return {
          success: true,
          stats: {
            total_entities: (entityCount as any)[0]?.count || 0,
            total_relationships: (relationshipCount as any)[0]?.count || 0,
            total_documents: documentCount.length,
            entities_by_type: typeBreakdown,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stats: {
            total_entities: 0,
            total_relationships: 0,
            total_documents: 0,
            entities_by_type: [],
          },
        };
      }
    }),
});
