import { getPool } from './db';
import { detectBusinessSignals } from './business-detector';

export async function runDetection(datasetId: string) {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT processed_data
      FROM ingested_records
      WHERE dataset_id = $1
    `, [datasetId]);

    if (!res.rows || res.rows.length === 0) {
      console.log(`No records found for dataset ${datasetId}`);
      return [];
    }

    const records = res.rows.map(r => {
      if (typeof r.processed_data === 'string') {
        return JSON.parse(r.processed_data);
      }
      return r.processed_data;
    });

    const signals = await detectBusinessSignals(records, datasetId, 'pos_transactions');
    console.log(`Detection complete: ${signals.length} signals processed for dataset ${datasetId}`);
    return signals;
  } catch (error) {
    console.error(`Error running detection for dataset ${datasetId}:`, error);
    throw error;
  }
}
