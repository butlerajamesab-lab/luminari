/**
 * CFPB Native Adapter — Consumer Financial Protection Bureau
 * 
 * The CFPB Consumer Complaint Database uses its own REST API (not Socrata).
 * API: https://api.consumerfinance.gov/data-research/consumer-complaints/search.json
 * 
 * 14M+ consumer financial complaints. Core stream for Luminari.
 */

import { db } from "../db";
import { ingestedRecords, dataStreamRegistry, ingestRuns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import type { NormalizedRecord, IngestionResult, IngestionDiagnostics, ErrorClass } from "./socrata-adapter";
import { classifyError, suggestRemediation } from "./socrata-adapter";

const CFPB_API_BASE = "https://api.consumerfinance.gov/data-research/consumer-complaints/search.json";
const PAGE_SIZE = 100;
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

/**
 * Fetch all CFPB records with pagination and retry logic.
 */
export async function fetchAllCfpbRecords(
  options?: { maxRecords?: number; onProgress?: (msg: string) => void }
): Promise<{ hits: { hits: any[] } }> {
  const maxRecords = options?.maxRecords ?? Infinity;
  const allHits: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && page < MAX_PAGES && allHits.length < maxRecords) {
    const offset = page * PAGE_SIZE;
    const limit = Math.min(PAGE_SIZE, maxRecords - allHits.length);

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${CFPB_API_BASE}?size=${limit}&from=${offset}&no_aggs=true`;
        options?.onProgress?.(`[CFPB] Fetching page ${page + 1} (offset ${offset})...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const pageHits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];

        allHits.push(...pageHits);
        hasMore = pageHits.length === limit;
        page++;

        options?.onProgress?.(`[CFPB] Got ${pageHits.length} records (total: ${allHits.length})`);
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        if (attempt < MAX_RETRIES) {
          options?.onProgress?.(`[CFPB] Retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    if (lastErr && allHits.length === 0) {
      throw lastErr;
    }
  }

  return { hits: { hits: allHits } };
}

/**
 * Normalize a CFPB record to standard schema.
 */
function normalizeCfpbRecord(row: any): NormalizedRecord {
  return {
    sourceRecordId: String(row.complaint_id || row.id || ""),
    rawJson: row,
    normalizedDate: row.date_received ? new Date(row.date_received).getTime() : null,
    normalizedCategory: row.product || null,
    normalizedEntity: row.company || null,
    normalizedJurisdiction: "federal",
    normalizedCity: row.consumer_city || null,
    normalizedState: row.consumer_state || null,
    normalizedZip: row.consumer_zip || null,
    normalizedStatus: row.complaint_status || null,
    normalizedAmount: row.monetary_relief ? String(row.monetary_relief) : null,
    normalizedDescription: row.complaint_what_happened || row.summary || null,
  };
}

/**
 * Ingest CFPB dataset: fetch → normalize → upsert → return stats.
 */
export async function ingestCfpbDataset(
  datasetId: string,
  options?: { maxRecords?: number; onProgress?: (msg: string) => void }
): Promise<IngestionResult> {
  const runId = Math.floor(Math.random() * 1e9);
  const errors: string[] = [];
  let recordsProcessed = 0;
  let recordsInserted = 0;
  let recordsUpdated = 0;
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let errorClassification: ErrorClass | null = null;

  try {
    options?.onProgress?.(`[CFPB] Starting ingestion for ${datasetId}...`);

    // Fetch raw data
    const data = await fetchAllCfpbRecords(options);
    const rows = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
    recordsProcessed = rows.length;

    options?.onProgress?.(`[CFPB] Fetched ${recordsProcessed} records. Normalizing...`);

    // Normalize
    const normalized = rows.map(normalizeCfpbRecord);

    // Upsert into ingested_records
    for (const record of normalized) {
      const hash = crypto.createHash("sha256").update(JSON.stringify(record.rawJson)).digest("hex");

      const [existing] = await db
        .select({ id: ingestedRecords.id, contentHash: ingestedRecords.contentHash })
        .from(ingestedRecords)
        .where(
          eq(ingestedRecords.sourceRecordId, record.sourceRecordId)
        )
        .limit(1);

      if (existing) {
        if (existing.contentHash !== hash) {
          await db
            .update(ingestedRecords)
            .set({
              contentHash: hash,
              rawJson: record.rawJson,
              normalizedJson: record,
              updatedAt: Date.now(),
            })
            .where(eq(ingestedRecords.id, existing.id));
          recordsUpdated++;
        }
      } else {
        await db.insert(ingestedRecords).values({
          datasetId,
          sourceRecordId: record.sourceRecordId,
          contentHash: hash,
          rawJson: record.rawJson,
          normalizedJson: record,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        recordsInserted++;
      }
    }

    options?.onProgress?.(`[CFPB] Upsert complete: ${recordsInserted} inserted, ${recordsUpdated} updated`);

    return {
      recordsProcessed,
      recordsInserted,
      recordsUpdated,
      signalsGenerated: 0,
      errors,
      runId,
      diagnostics: {
        errorClassification: null,
        httpStatus: 200,
        contentType: "application/json",
        endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native",
        bodyPreview: null,
        parseFailureReason: null,
        retryCount: 0,
        failureClassification: null,
        suggestedRemediation: null,
        outcomeClassification: "completed",
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errorClassification = classifyError(err);

    errors.push(errorMsg);
    options?.onProgress?.(`[CFPB] ERROR: ${errorMsg}`);

    return {
      recordsProcessed,
      recordsInserted,
      recordsUpdated,
      signalsGenerated: 0,
      errors,
      runId,
      diagnostics: {
        errorClassification,
        httpStatus,
        contentType,
        endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native",
        bodyPreview: null,
        parseFailureReason: errorMsg.substring(0, 200),
        retryCount: MAX_RETRIES,
        failureClassification: errorClassification,
        suggestedRemediation: suggestRemediation(err),
        outcomeClassification: "failed",
      },
    };
  }
}
