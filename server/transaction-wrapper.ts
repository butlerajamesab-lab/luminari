import { getPool } from './db';

/**
 * Standard transaction wrapper for all signal INSERT operations
 * Ensures reliable persistence with explicit commit/rollback
 * Uses pg Pool client with BEGIN/COMMIT/ROLLBACK
 */
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      console.error('[Transaction] Rollback error:', e);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Batch insert signals with transaction
 */
export async function insertSignalsBatch(
  signals: Array<{
    caseId: number;
    evidenceId: number;
    signalType: string;
    description: string;
  }>
): Promise<number[]> {
  return withTransaction(async (client) => {
    const insertedIds: number[] = [];

    for (const signal of signals) {
      const { rows } = await client.query(
        `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
        [signal.caseId, signal.evidenceId, signal.signalType, signal.description]
      );
      insertedIds.push(rows[0].id);
    }

    return insertedIds;
  });
}

/**
 * Insert single signal with transaction
 */
export async function insertSignal(
  caseId: number,
  evidenceId: number,
  signalType: string,
  description: string
): Promise<number> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [caseId, evidenceId, signalType, description]
    );
    return rows[0].id;
  });
}
