import type { NormalizedRecord, IngestionResult } from './socrata-adapter';

export const CFPB_API_BASE = 'https://api.consumerfinance.gov/data-research/consumer-complaints/search.json';

export async function fetchAllCfpbRecords() {
  const response = await fetch(`${CFPB_API_BASE}?size=100&no_aggs=true`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CFPB API error: ${response.status}`);
  }

  return await response.json();
}

export async function ingestCfpbDataset(
  datasetId: string,
  options?: { maxRecords?: number; onProgress?: (msg: string) => void }
): Promise<IngestionResult> {
  const data = await fetchAllCfpbRecords();

  options?.onProgress?.(`CFPB dataset ${datasetId} fetched successfully`);

  return {
    recordsProcessed: Array.isArray(data?.hits?.hits) ? data.hits.hits.length : 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    signalsGenerated: 0,
    errors: [],
    runId: 0,
    diagnostics: {
      errorClassification: null,
      httpStatus: 200,
      contentType: 'application/json',
      endpointAttempted: CFPB_API_BASE,
      adapterUsed: 'cfpb_native',
      bodyPreview: null,
      parseFailureReason: null,
      retryCount: 0,
      failureClassification: null,
      suggestedRemediation: null,
      outcomeClassification: 'completed',
    },
  };
}
