/**
 * CFPB Native Adapter — Consumer Financial Protection Bureau
 * 
 * The CFPB Consumer Complaint Database uses its own REST API (not Socrata).
 * API: https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/
 * 
 * 14M+ consumer financial complaints. Core stream for Luminari.
 * 
 * Response format: Elasticsearch-style hits wrapper
 * Pagination: offset-based via `frm` parameter
 * Date filtering: `date_received_min` / `date_received_max`
 * 
 * Field mapping (CFPB → NormalizedRecord):
 *   complaint_id → sourceRecordId
 *   date_received → normalizedDate
 *   product + sub_product → normalizedCategory
 *   company → normalizedEntity
 *   issue + sub_issue → normalizedDescription
 *   state → normalizedState
 *   zip_code → normalizedZip
 *   company_response → normalizedStatus
 *   submitted_via → normalizedJurisdiction (submission channel)
 */

import { db } from "../db";
import { ingestedRecords, dataStreamRegistry, ingestRuns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import type { NormalizedRecord, IngestionResult, IngestionDiagnostics, ErrorClass } from "./socrata-adapter";
import { classifyError, suggestRemediation } from "./socrata-adapter";

// ─── Constants ───

const CFPB_API_BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/";
const PAGE_SIZE = 100; // CFPB API max is 100 per request
const MAX_PAGES = 500; // Safety limit: 500 * 100 = 50,000 records max per run
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

// ─── Types ───

interface CfpbHit {
  _id: string;
  _source: {
    complaint_id: string;
    date_received: string;
    product: string;
    sub_product?: string;
    issue: string;
    sub_issue?: string;
    company: string;
    company_response: string;
    company_public_response?: string | null;
    state: string;
    zip_code: string;
    submitted_via: string;
    timely: string;
    consumer_disputed: string;
    consumer_consent_provided: string;
    tags?: string | null;
    has_narrative: boolean;
    complaint_what_happened?: string;
  };
}

interface CfpbApiResponse {
  hits: {
    total: { value: number; relation: string };
    hits: CfpbHit[];
  };
}

interface CfpbFetchResult {
  records: CfpbHit[];
  totalAvailable: number;
  apiReachable: boolean;
  errorMessage: string | null;
  pagesCompleted: number;
  lastHttpStatus: number | null;
  errorClass: ErrorClass | null;
  totalRetries: number;
}

// ─── Fetch Helpers ───

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── T1. Fetch CFPB Records ───

async function fetchCfpbPage(
  offset: number,
  size: number,
  dateMin?: string,
  dateMax?: string
): Promise<{ data: CfpbApiResponse | null; httpStatus: number | null; errorClass: ErrorClass | null; errorMessage: string | null; retryCount: number }> {
  const url = new URL(CFPB_API_BASE);
  url.searchParams.set("size", String(size));
  url.searchParams.set("frm", String(offset));
  url.searchParams.set("no_aggs", "true");
  url.searchParams.set("sort", "created_date_desc");
  
  if (dateMin) url.searchParams.set("date_received_min", dateMin);
  if (dateMax) url.searchParams.set("date_received_max", dateMax);

  let lastError: Error | null = null;
  let httpStatus: number | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url.toString(),
        { headers: { "Accept": "application/json" } },
        REQUEST_TIMEOUT_MS
      );

      httpStatus = response.status;

      if (!response.ok) {
        const err = new Error(`CFPB API error: ${response.status} ${response.statusText}`);
        lastError = err;

        // Don't retry 4xx (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return {
            data: null, httpStatus,
            errorClass: classifyError(err, httpStatus),
            errorMessage: err.message, retryCount: attempt,
          };
        }

        if (attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
          continue;
        }

        return {
          data: null, httpStatus,
          errorClass: classifyError(err, httpStatus),
          errorMessage: err.message, retryCount: attempt,
        };
      }

      const data = await response.json() as CfpbApiResponse;
      return { data, httpStatus, errorClass: null, errorMessage: null, retryCount: attempt - 1 };

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  return {
    data: null, httpStatus,
    errorClass: classifyError(lastError),
    errorMessage: lastError?.message ?? "Unknown fetch error",
    retryCount: MAX_RETRIES,
  };
}

export async function fetchAllCfpbRecords(
  onPage?: (pageNum: number, recordCount: number) => void,
  maxRecords?: number,
  dateMin?: string,
): Promise<CfpbFetchResult> {
  const allRecords: CfpbHit[] = [];
  let offset = 0;
  let pageNum = 0;
  const effectiveMax = maxRecords ?? Infinity;
  let totalAvailable = 0;
  let apiReachable = true;
  let errorMessage: string | null = null;
  let lastHttpStatus: number | null = null;
  let errorClass: ErrorClass | null = null;
  let totalRetries = 0;

  while (pageNum < MAX_PAGES) {
    if (allRecords.length >= effectiveMax) break;

    const result = await fetchCfpbPage(offset, PAGE_SIZE, dateMin);
    totalRetries += result.retryCount;
    lastHttpStatus = result.httpStatus;

    if (!result.data) {
      apiReachable = false;
      errorMessage = result.errorMessage;
      errorClass = result.errorClass;
      break;
    }

    if (totalAvailable === 0) {
      totalAvailable = result.data.hits.total.value;
    }

    const hits = result.data.hits.hits;
    if (hits.length === 0) break;

    allRecords.push(...hits);
    onPage?.(pageNum + 1, allRecords.length);

    if (hits.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    pageNum++;

    // Small delay between pages to be respectful
    await sleep(200);
  }

  const trimmed = maxRecords ? allRecords.slice(0, maxRecords) : allRecords;
  return {
    records: trimmed,
    totalAvailable,
    apiReachable,
    errorMessage,
    pagesCompleted: pageNum + 1,
    lastHttpStatus,
    errorClass,
    totalRetries,
  };
}

// ─── T2. Normalize CFPB Records ───

function normalizeCfpbRecord(hit: CfpbHit): NormalizedRecord {
  const s = hit._source;

  // Build rich description from issue + sub_issue + narrative
  const descParts: string[] = [];
  if (s.issue) descParts.push(s.issue);
  if (s.sub_issue) descParts.push(s.sub_issue);
  if (s.complaint_what_happened) descParts.push(s.complaint_what_happened);
  const description = descParts.join(" — ");

  // Build category from product + sub_product
  const category = s.sub_product
    ? `${s.product} > ${s.sub_product}`
    : s.product;

  return {
    sourceRecordId: s.complaint_id || hit._id,
    rawJson: s as unknown as Record<string, unknown>,
    normalizedDate: s.date_received ? new Date(s.date_received).getTime() : null,
    normalizedCategory: category?.substring(0, 256) ?? null,
    normalizedEntity: s.company?.substring(0, 512) ?? null,
    normalizedJurisdiction: s.submitted_via?.substring(0, 128) ?? null,
    normalizedCity: null, // CFPB doesn't provide city
    normalizedState: s.state?.substring(0, 64) ?? null,
    normalizedZip: s.zip_code?.substring(0, 16) ?? null,
    normalizedStatus: s.company_response?.substring(0, 64) ?? null,
    normalizedAmount: null, // CFPB doesn't provide amounts
    normalizedDescription: description || null,
  };
}

// ─── T3. Batch Upsert (reuses same logic as socrata) ───

async function upsertCfpbRecords(
  datasetId: string,
  records: NormalizedRecord[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  const now = Date.now();
  const BATCH_SIZE = 200;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    try {
      const values = batch.map((record) => ({
        datasetId,
        sourceRecordId: record.sourceRecordId,
        ingestedAt: now,
        updatedAt: now,
        rawJson: record.rawJson,
        normalizedDate: record.normalizedDate,
        normalizedCategory: record.normalizedCategory,
        normalizedEntity: record.normalizedEntity,
        normalizedJurisdiction: record.normalizedJurisdiction,
        normalizedCity: record.normalizedCity,
        normalizedState: record.normalizedState,
        normalizedZip: record.normalizedZip,
        normalizedStatus: record.normalizedStatus,
        normalizedAmount: record.normalizedAmount,
        normalizedDescription: record.normalizedDescription,
        processedForSignals: false,
      }));

      await db.insert(ingestedRecords)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            rawJson: sql`VALUES(rawJson)`,
            updatedAt: sql`VALUES(updatedAt_ir)`,
            normalizedDate: sql`VALUES(normalizedDate)`,
            normalizedCategory: sql`VALUES(normalizedCategory)`,
            normalizedEntity: sql`VALUES(normalizedEntity)`,
            normalizedJurisdiction: sql`VALUES(normalizedJurisdiction)`,
            normalizedCity: sql`VALUES(normalizedCity)`,
            normalizedState: sql`VALUES(normalizedState)`,
            normalizedZip: sql`VALUES(normalizedZip)`,
            normalizedStatus: sql`VALUES(normalizedStatus)`,
            normalizedAmount: sql`VALUES(normalizedAmount)`,
            normalizedDescription: sql`VALUES(normalizedDescription)`,
            processedForSignals: sql`0`,
          },
        });

      inserted += batch.length;
    } catch (err) {
      // Fallback to individual inserts
      for (const record of batch) {
        try {
          await db.insert(ingestedRecords)
            .values({
              datasetId,
              sourceRecordId: record.sourceRecordId,
              ingestedAt: now,
              updatedAt: now,
              rawJson: record.rawJson,
              normalizedDate: record.normalizedDate,
              normalizedCategory: record.normalizedCategory,
              normalizedEntity: record.normalizedEntity,
              normalizedJurisdiction: record.normalizedJurisdiction,
              normalizedCity: record.normalizedCity,
              normalizedState: record.normalizedState,
              normalizedZip: record.normalizedZip,
              normalizedStatus: record.normalizedStatus,
              normalizedAmount: record.normalizedAmount,
              normalizedDescription: record.normalizedDescription,
              processedForSignals: false,
            })
            .onDuplicateKeyUpdate({
              set: {
                rawJson: sql`VALUES(rawJson)`,
                updatedAt: sql`VALUES(updatedAt_ir)`,
              },
            });
          inserted++;
        } catch (individualErr) {
          errors.push(`Record ${record.sourceRecordId}: ${individualErr instanceof Error ? individualErr.message : String(individualErr)}`);
        }
      }
    }
  }

  return { inserted, updated, errors };
}

// ─── T4. Full CFPB Ingestion Pipeline ───

export async function ingestCfpbDataset(
  datasetId: string,
  options?: { maxRecords?: number; onProgress?: (msg: string) => void }
): Promise<IngestionResult> {
  const log = options?.onProgress ?? console.log;

  // 1. Load stream config
  const [dataset] = await db
    .select()
    .from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, datasetId))
    .limit(1);

  if (!dataset) {
    return {
      recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
      signalsGenerated: 0, errors: [`Dataset ${datasetId} not found`],
      runId: 0,
      diagnostics: {
        errorClassification: "schema_mismatch", httpStatus: null, contentType: null,
        endpointAttempted: null, adapterUsed: "cfpb_native", bodyPreview: null,
        parseFailureReason: null, retryCount: 0,
        failureClassification: "config_error",
        suggestedRemediation: "Register the dataset in the Data Stream Registry.",
        outcomeClassification: "config_error",
      },
    };
  }

  if (!dataset.enabled) {
    return {
      recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
      signalsGenerated: 0, errors: [`Dataset ${datasetId} is disabled`],
      runId: 0,
      diagnostics: {
        errorClassification: null, httpStatus: null, contentType: null,
        endpointAttempted: null, adapterUsed: "cfpb_native", bodyPreview: null,
        parseFailureReason: null, retryCount: 0,
        failureClassification: "disabled",
        suggestedRemediation: "Enable the stream in Sovereign Control.",
        outcomeClassification: "skipped_disabled",
      },
    };
  }

  // 2. Create ingest run
  const [run] = await db.insert(ingestRuns).values({
    datasetId,
    startTime: Date.now(),
    status: "running",
    endpointAttempted: CFPB_API_BASE,
    adapterUsed: "cfpb_native",
  }).$returningId();

  const runId = run.id;

  try {
    // 3. Determine date filter for incremental ingestion
    let dateMin: string | undefined;
    if (dataset.lastIngestedAt) {
      const lastDate = new Date(Number(dataset.lastIngestedAt));
      dateMin = lastDate.toISOString().split("T")[0]; // YYYY-MM-DD
    }

    log(`[CFPB] Starting fetch from CFPB API${dateMin ? ` (since ${dateMin})` : " (full)"}`);

    // 4. Fetch
    const fetchResult = await fetchAllCfpbRecords(
      (page, total) => log(`[CFPB] Page ${page}: ${total} records fetched`),
      options?.maxRecords,
      dateMin,
    );

    log(`[CFPB] Total available in CFPB database: ${fetchResult.totalAvailable.toLocaleString()}`);

    // Handle API unreachable
    if (!fetchResult.apiReachable && fetchResult.records.length === 0) {
      const failMsg = `CFPB API unreachable: ${fetchResult.errorMessage}`;
      log(`[CFPB] ${failMsg}`);

      const errorCls = fetchResult.errorClass ?? "unknown";
      const remediation = suggestRemediation(errorCls);

      await db.update(ingestRuns).set({
        endTime: Date.now(),
        recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
        status: "api_unavailable",
        errors: [failMsg],
        summary: `CFPB API unreachable — ${fetchResult.errorMessage}. ${remediation}`,
        errorClassification: errorCls,
        httpStatus: fetchResult.lastHttpStatus,
        endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native",
        retryCount: fetchResult.totalRetries,
        failureClassification: errorCls,
        suggestedRemediation: remediation,
        outcomeClassification: "api_unreachable",
      }).where(eq(ingestRuns.id, runId));

      return {
        recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
        signalsGenerated: 0, errors: [failMsg], runId,
        diagnostics: {
          errorClassification: errorCls, httpStatus: fetchResult.lastHttpStatus,
          contentType: "application/json", endpointAttempted: CFPB_API_BASE,
          adapterUsed: "cfpb_native", bodyPreview: null,
          parseFailureReason: null, retryCount: fetchResult.totalRetries,
          failureClassification: errorCls, suggestedRemediation: remediation,
          outcomeClassification: "api_unreachable",
        },
      };
    }

    // 5. Normalize
    const normalized = fetchResult.records.map(normalizeCfpbRecord);
    log(`[CFPB] Normalized ${normalized.length} records`);

    // 6. Upsert
    log(`[CFPB] Upserting ${normalized.length} records...`);
    const result = await upsertCfpbRecords(datasetId, normalized);

    // 7. Update run record
    const runStatus = !fetchResult.apiReachable ? "partial" : "completed";
    await db.update(ingestRuns).set({
      endTime: Date.now(),
      recordsProcessed: fetchResult.records.length,
      recordsInserted: result.inserted,
      recordsUpdated: result.updated,
      status: runStatus,
      errors: result.errors.length > 0 ? result.errors.slice(0, 50) : null,
      summary: `CFPB: ${fetchResult.records.length} processed, ${result.inserted} inserted, ${result.errors.length} errors (${fetchResult.totalAvailable.toLocaleString()} total available)`,
      httpStatus: fetchResult.lastHttpStatus,
      endpointAttempted: CFPB_API_BASE,
      adapterUsed: "cfpb_native",
      retryCount: fetchResult.totalRetries,
      outcomeClassification: runStatus,
    }).where(eq(ingestRuns.id, runId));

    // 8. Update stream registry
    await db.update(dataStreamRegistry).set({
      lastIngestedAt: Date.now(),
      recordsIngested: sql`records_ingested_dsr + ${result.inserted}`,
      lastRecordsIngested: result.inserted,
      lastRunStatus: runStatus,
      lastSuccessAt: Date.now(),
      consecutiveFailures: 0,
      updatedAt: Date.now(),
    }).where(eq(dataStreamRegistry.streamId, datasetId));

    log(`[CFPB] Complete: ${result.inserted} inserted, ${result.updated} updated, ${result.errors.length} errors`);

    return {
      recordsProcessed: fetchResult.records.length,
      recordsInserted: result.inserted,
      recordsUpdated: result.updated,
      signalsGenerated: 0, // Set by scheduler after signal detection
      errors: result.errors,
      runId,
      diagnostics: {
        errorClassification: null, httpStatus: fetchResult.lastHttpStatus,
        contentType: "application/json", endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native", bodyPreview: null,
        parseFailureReason: null, retryCount: fetchResult.totalRetries,
        failureClassification: null, suggestedRemediation: null,
        outcomeClassification: runStatus,
      },
    };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorCls = classifyError(err);
    const remediation = suggestRemediation(errorCls);

    try {
      await db.update(ingestRuns).set({
        endTime: Date.now(),
        status: "failed",
        errors: [errorMsg],
        errorClassification: errorCls,
        endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native",
        failureClassification: errorCls,
        suggestedRemediation: remediation,
        outcomeClassification: "pipeline_error",
      }).where(eq(ingestRuns.id, runId));
    } catch { /* non-fatal */ }

    return {
      recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
      signalsGenerated: 0, errors: [errorMsg], runId,
      diagnostics: {
        errorClassification: errorCls, httpStatus: null,
        contentType: null, endpointAttempted: CFPB_API_BASE,
        adapterUsed: "cfpb_native", bodyPreview: null,
        parseFailureReason: null, retryCount: 0,
        failureClassification: errorCls, suggestedRemediation: remediation,
        outcomeClassification: "pipeline_error",
      },
    };
  }
}
