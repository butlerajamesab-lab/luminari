/**
 * Form Signal Extraction Router
 * 
 * Exposes form extraction as tRPC endpoints
 * Integrates form-signal-extraction-engine-v2 into Luminari pipeline
 */

import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mysql from "mysql2/promise";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the form extraction engine
let FormSignalExtractionEngine: any;
try {
  FormSignalExtractionEngine = require("./form-signal-extraction-engine.js");
} catch (e) {
  console.warn("[FormExtractionRouter] Could not load extraction engine:", e);
}

export const formExtractionRouter = router({
  /**
   * Extract form signals from raw payload
   */
  extract: publicProcedure
    .input(
      z.object({
        payload: z.string().describe("Raw text payload (HTML, Markdown, plain text)"),
        sourceId: z.string().optional().describe("Reference to Alpha Lake entry"),
        documentId: z.number().optional().describe("Associated document ID"),
      })
    )
    .mutation(async ({ input }) => {
      if (!FormSignalExtractionEngine) {
        throw new Error("Form extraction engine not available");
      }

      try {
        const engine = new FormSignalExtractionEngine();
        const result = engine.extract(input.payload);

        return {
          success: true,
          protoForms: result.proto_forms || [],
          topForms: result.top_forms || [],
          coverageGaps: result.missing_coverage || [],
          stats: result.stats || {},
          sourceId: input.sourceId,
          documentId: input.documentId,
        };
      } catch (error) {
        console.error("[FormExtractionRouter] Extraction error:", error);
        throw new Error(`Form extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  /**
   * Extract and persist to forms_registry_staging
   */
  extractAndPersist: publicProcedure
    .input(
      z.object({
        payload: z.string(),
        sourceId: z.string().optional(),
        documentId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!FormSignalExtractionEngine) {
        throw new Error("Form extraction engine not available");
      }

      let pool: mysql.Pool | null = null;
      try {
        const engine = new FormSignalExtractionEngine();
        const result = engine.extract(input.payload);

        // Persist to forms_registry_staging
        let persistedCount = 0;
        if (result.proto_forms && result.proto_forms.length > 0) {
          pool = mysql.createPool({
            host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
            port: 4000,
            user: '2jhK1AfHyk6mXSq.root',
            password: '2k5Lq94U8voiLkatA3uZ',
            database: 'luminari_registry',
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
          });

          for (const protoForm of result.proto_forms) {
            const query = `
              INSERT INTO forms_registry_staging (
                form_type,
                agency,
                jurisdiction,
                domain,
                confidence_score,
                extracted_fields,
                validation_flags,
                source_id,
                document_id,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            try {
              await pool.execute(query, [
                protoForm.type || 'unknown',
                protoForm.agency || 'unknown',
                protoForm.jurisdiction || 'unknown',
                protoForm.domain || 'unknown',
                protoForm.confidence || 0,
                JSON.stringify(protoForm.fields || {}),
                JSON.stringify(protoForm.validation_flags || []),
                input.sourceId || null,
                input.documentId || null,
              ]);
              persistedCount++;
              console.log(`[FormExtractionRouter] Persisted proto-form: ${protoForm.type}`);
            } catch (insertError) {
              console.error(`[FormExtractionRouter] Failed to insert proto-form:`, insertError);
            }
          }
        }

        if (pool) {
          await pool.end();
        }

        console.log(`[FormExtractionRouter] Extraction complete: ${result.proto_forms?.length || 0} extracted, ${persistedCount} persisted`);

        return {
          success: true,
          extracted: result.proto_forms?.length || 0,
          persisted: persistedCount,
          sourceId: input.sourceId,
          documentId: input.documentId,
        };
      } catch (error) {
        console.error("[FormExtractionRouter] Extract and persist error:", error);
        if (pool) {
          try {
            await pool.end();
          } catch (e) {
            console.error("[FormExtractionRouter] Error closing pool:", e);
          }
        }
        throw new Error(`Failed to extract and persist: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  /**
   * Get extraction status
   */
  status: publicProcedure.query(async () => {
    return {
      engineAvailable: !!FormSignalExtractionEngine,
      version: "v2",
      status: "ready",
    };
  }),
});
