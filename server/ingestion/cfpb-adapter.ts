import { eq, sql } from 'drizzle-orm';
import { dataStreamRegistry, ingestRuns } from '../../drizzle/schema';
import { db } from '../db';
import {
  classifyError,
  normalizeRecord,
  suggestRemediation,
  upsertRecords,
  type IngestionResult,
} from './socrata-adapter';

export const CFPB_API_BASE = 'https://api.consumerfinance.gov/data-research/consumer-complaints/search.json';

export async function fetchAllCfpbRecords(maxRecords = 100) {
  const size = Math.min(Math.max(maxRecords, 1), 1000);
  const response = await fetch(`${CFPB_API_BASE}?size=${size}&no_aggs=true`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CFPB API error: ${response.status}`);
  }

  return await response.json();
}

function flattenCfpbHit(hit: Record<string, any>): Record<string, unknown> {
  const source = hit._source ?? hit;
  return {
    ...source,
    complaint_id: source.complaint_id ?? hit._id,
  };
}

function disabledResult(datasetId: string): IngestionResult {
  return {
    recordsProcessed: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    signalsGenerated: 0,
    errors: [`Dataset ${datasetId} is disabled`],
    runId: 0,
    diagnostics: {
      errorClassification: null,
      httpStatus: null,
      contentType: null,
      endpointAttempted: CFPB_API_BASE,
      adapterUsed: 'cfpb_native',
      bodyPreview: null,
      parseFailureReason: null,
      retryCount: 0,
      failureClassification: 'disabled',
      suggestedRemediation: 'Enable the CFPB stream before running ingestion.',
      outcomeClassification: 'disabled',
    },
  };
}

export async function ingestCfpbDataset(
  datasetId: string,
  options?: { maxRecords?: number; onProgress?: (msg: string) => void }
): Promise<IngestionResult> {
  const log = options?.onProgress ?? console.log;

  const [dataset] = await db
    .select()
    .from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, datasetId))
    .limit(1);

  if (!dataset) {
    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      signalsGenerated: 0,
      errors: [`Dataset ${datasetId} not found in registry`],
      runId: 0,
      diagnostics: {
        errorClassification: 'schema_mismatch',
        httpStatus: null,
        contentType: null,
        endpointAttempted: CFPB_API_BASE,
        adapterUsed: 'cfpb_native',
        bodyPreview: null,
        parseFailureReason: null,
        retryCount: 0,
        failureClassification: 'config_error',
        suggestedRemediation: 'Register the CFPB stream before running ingestion.',
        outcomeClassification: 'config_error',
      },
    };
  }

  if (!dataset.enabled) {
    log(`[CFPB] ${datasetId} is disabled; skipping ingestion`);
    return disabledResult(datasetId);
  }

  const [run] = await db.insert(ingestRuns).values({
    datasetId,
    startTime: Date.now(),
    status: 'running',
    endpointAttempted: dataset.apiUrl ?? CFPB_API_BASE,
    adapterUsed: 'cfpb_native',
  }).$returningId();

  const runId = run.id;

  try {
    const data = await fetchAllCfpbRecords(options?.maxRecords ?? 500);
    const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
    const rawRecords = hits.map(flattenCfpbHit);
    const fieldMapping = (dataset.fieldMapping as Record<string, string>) ?? {};

    log(`[CFPB] ${datasetId} fetched ${rawRecords.length} complaint records`);

    const normalized = rawRecords.map((raw: Record<string, unknown>) => {
      const record = normalizeRecord(raw, fieldMapping);
      if (!record.normalizedJurisdiction) record.normalizedJurisdiction = dataset.jurisdiction ?? 'United States';
      return record;
    });

    const result = await upsertRecords(datasetId, normalized);

    await db.update(ingestRuns).set({
      endTime: Date.now(),
      recordsProcessed: rawRecords.length,
      recordsInserted: result.inserted,
      recordsUpdated: result.updated,
      status: 'completed',
      errors: result.errors.length > 0 ? result.errors.slice(0, 50) : null,
      summary: `Processed ${rawRecords.length} CFPB records: ${result.inserted} inserted, ${result.updated} updated, ${result.errors.length} errors`,
      httpStatus: 200,
      contentType: 'application/json',
      endpointAttempted: dataset.apiUrl ?? CFPB_API_BASE,
      adapterUsed: 'cfpb_native',
      outcomeClassification: 'completed',
    }).where(eq(ingestRuns.id, runId));

    await db.update(dataStreamRegistry).set({
      lastIngestedAt: Date.now(),
      recordsIngested: sql`records_ingested_dsr + ${result.inserted}`,
      lastRecordsIngested: result.inserted,
      lastRunStatus: 'completed',
      lastSuccessAt: Date.now(),
      consecutiveFailures: 0,
      updatedAt: Date.now(),
    }).where(eq(dataStreamRegistry.streamId, datasetId));

    return {
      recordsProcessed: rawRecords.length,
      recordsInserted: result.inserted,
      recordsUpdated: result.updated,
      signalsGenerated: 0,
      errors: result.errors,
      runId,
      diagnostics: {
        errorClassification: null,
        httpStatus: 200,
        contentType: 'application/json',
        endpointAttempted: dataset.apiUrl ?? CFPB_API_BASE,
        adapterUsed: 'cfpb_native',
        bodyPreview: null,
        parseFailureReason: null,
        retryCount: 0,
        failureClassification: null,
        suggestedRemediation: null,
        outcomeClassification: 'completed',
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorClass = classifyError(err);
    const remediation = suggestRemediation(errorClass);

    await db.update(ingestRuns).set({
      endTime: Date.now(),
      status: 'failed',
      errors: [errorMsg],
      errorClassification: errorClass,
      endpointAttempted: dataset.apiUrl ?? CFPB_API_BASE,
      adapterUsed: 'cfpb_native',
      failureClassification: errorClass,
      suggestedRemediation: remediation,
      outcomeClassification: 'pipeline_error',
    }).where(eq(ingestRuns.id, runId));

    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      signalsGenerated: 0,
      errors: [errorMsg],
      runId,
      diagnostics: {
        errorClassification: errorClass,
        httpStatus: null,
        contentType: null,
        endpointAttempted: dataset.apiUrl ?? CFPB_API_BASE,
        adapterUsed: 'cfpb_native',
        bodyPreview: null,
        parseFailureReason: null,
        retryCount: 0,
        failureClassification: errorClass,
        suggestedRemediation: remediation,
        outcomeClassification: 'pipeline_error',
      },
    };
  }
}
