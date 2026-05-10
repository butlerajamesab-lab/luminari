/**
 * Export Formats Utility
 * Generates downloadable exports of case data in multiple formats.
 */

import Papa from 'papaparse';

export interface ProvenanceReceipt {
  id: string;
  entity_id: string;
  operation: string;
  timestamp: string;
  transition_id: string;
  payload_hash: string;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceChain {
  caseId: string;
  recordId: string;
  receipts: ProvenanceReceipt[];
  created_at: string;
  updated_at: string;
}

export interface BatchResult {
  recordId: string;
  caseId: string;
  stages: Record<string, { success?: boolean; skipped?: boolean; reason?: string }>;
  error?: string;
  final_state: string;
}

export interface BatchResults {
  total: number;
  completed: BatchResult[];
  skipped_already_complete: BatchResult[];
  blocked: BatchResult[];
  guard_blocked: BatchResult[];
  errors: BatchResult[];
  summary: {
    total: number;
    completed: number;
    skipped_already_complete: number;
    blocked_by_truth: number;
    blocked_by_guards: number;
    errors: number;
  };
  timestamp: string;
}

/**
 * Export case as JSON
 */
export async function exportCaseAsJSON(caseData: ProvenanceChain): Promise<Blob> {
  const json = JSON.stringify(caseData, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Export batch results as CSV
 */
export async function exportBatchResultsAsCSV(results: BatchResults): Promise<Blob> {
  const allResults = [
    ...results.completed,
    ...results.skipped_already_complete,
    ...results.blocked,
    ...results.guard_blocked,
    ...results.errors,
  ];

  const rows = allResults.map((r) => ({
    recordId: r.recordId,
    caseId: r.caseId,
    status: r.final_state,
    stages: Object.keys(r.stages).join('; '),
    error: r.error || '',
  }));

  const csv = Papa.unparse(rows);
  return new Blob([csv], { type: 'text/csv' });
}

/**
 * Export provenance chain as HTML (for PDF conversion)
 */
export function generateProvenanceHTML(chain: ProvenanceChain): string {
  const receiptRows = chain.receipts
    .map(
      (r) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${r.operation}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(r.timestamp).toLocaleString()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; font-family: monospace; font-size: 12px;">${r.transition_id}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; font-family: monospace; font-size: 11px;">${r.payload_hash}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Provenance Chain - ${chain.recordId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background-color: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #ddd; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    .metadata { background-color: #f9f9f9; padding: 10px; border-left: 3px solid #007bff; margin: 10px 0; }
    .footer { margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <h1>Provenance Chain Report</h1>
  
  <h2>Case Information</h2>
  <div class="metadata">
    <p><strong>Record ID:</strong> ${chain.recordId}</p>
    <p><strong>Case ID:</strong> ${chain.caseId}</p>
    <p><strong>Created:</strong> ${new Date(chain.created_at).toLocaleString()}</p>
    <p><strong>Updated:</strong> ${new Date(chain.updated_at).toLocaleString()}</p>
  </div>

  <h2>Receipt Chain (${chain.receipts.length} receipts)</h2>
  <table>
    <thead>
      <tr>
        <th>Operation</th>
        <th>Timestamp (UTC)</th>
        <th>Transition ID</th>
        <th>Payload Hash</th>
      </tr>
    </thead>
    <tbody>
      ${receiptRows}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated: ${new Date().toLocaleString()}</p>
    <p>Luminari V2 Civic-Forensic Operating System</p>
  </div>
</body>
</html>
  `;
}

/**
 * Trigger a file download in the browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename with timestamp
 */
export function generateFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${timestamp}.${extension}`;
}
