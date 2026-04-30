import { pool } from './db';

/**
 * Standard transaction wrapper for all signal INSERT operations
 * Ensures reliable persistence with explicit commit/rollback
 */
export async function withTransaction<T>(
  callback: (conn: any) => Promise<T>
): Promise<T> {
  let conn: any;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const result = await callback(conn);

    await conn.commit();
    return result;
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[Transaction] Rollback error:', e);
      }
    }
    throw err;
  } finally {
    if (conn) {
      conn.release();
    }
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
  return withTransaction(async (conn) => {
    const insertedIds: number[] = [];

    for (const signal of signals) {
      const [result] = await conn.query(
        `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [signal.caseId, signal.evidenceId, signal.signalType, signal.description]
      );
      insertedIds.push((result as any).insertId);
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
  return withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [caseId, evidenceId, signalType, description]
    );
    return (result as any).insertId;
  });
}
