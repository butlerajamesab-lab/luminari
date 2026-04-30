/**
 * FORMS TO CASES CONNECTOR
 * 
 * Links detected form signals to cases
 * - Creates new cases from detected signals
 * - Links signals to cases via signal_flags
 * - Establishes bidirectional relationship
 */

import mysql from 'mysql2/promise';

interface DetectedSignal {
  id: number;
  signalType: string;
  title: string;
  explanation: string;
  severity: string;
  confidenceScore: number;
}

async function getPool(): Promise<mysql.Pool> {
  return mysql.createPool({
    host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2jhK1AfHyk6mXSq.root',
    password: '2k5Lq94U8voiLkatA3uZ',
    database: 'luminari_registry',
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

/**
 * Fetch unlinked detected signals
 */
async function fetchUnlinkedSignals(pool: mysql.Pool): Promise<DetectedSignal[]> {
  const query = `
    SELECT 
      ds.id,
      ds.signalType,
      ds.title,
      ds.explanation,
      ds.severity,
      ds.confidenceScore
    FROM detected_signals ds
    LEFT JOIN signal_flags sf ON ds.id = sf.id
    WHERE sf.id IS NULL
    LIMIT 100
  `;

  const [rows] = await pool.execute(query);
  return rows as DetectedSignal[];
}

/**
 * Create case from signal
 */
async function createCaseFromSignal(
  pool: mysql.Pool,
  signal: DetectedSignal,
  userId: number
): Promise<number> {
  const now = Date.now();
  const caseName = signal.title || `Signal ${signal.id}`;
  const domain = signal.signalType === 'FORM_DETECTION' ? 'FORM_INTAKE' : signal.signalType;

  const query = `
    INSERT INTO cases (
      userId,
      name,
      description,
      status,
      domain,
      createdAt,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.execute(query, [
    userId,
    caseName,
    signal.explanation,
    'active',
    domain,
    now,
    now,
  ]);

  const caseId = (result as any).insertId;
  console.log(`[Connector] ✅ Case created: ID ${caseId} from signal ${signal.id}`);
  return caseId;
}

/**
 * Link signal to case via signal_flags
 */
async function linkSignalToCase(
  pool: mysql.Pool,
  signalId: number,
  caseId: number
): Promise<void> {
  const query = `
    INSERT INTO signal_flags (
      caseId,
      documentId,
      flagType,
      description
    ) VALUES (?, ?, ?, ?)
  `;

  await pool.execute(query, [
    caseId,
    signalId, // Using signal ID as document ID placeholder
    'FORM_SIGNAL',
    `Linked from detected signal ${signalId}`,
  ]);

  console.log(`[Connector] ✅ Signal ${signalId} linked to case ${caseId}`);
}

/**
 * Main execution
 */
export async function connectFormsToCases(userId: number = 1): Promise<void> {
  let pool: mysql.Pool | null = null;

  try {
    console.log('[Connector] Starting forms-to-cases linking...');
    pool = await getPool();

    // Fetch unlinked signals
    const signals = await fetchUnlinkedSignals(pool);
    console.log(`[Connector] Found ${signals.length} unlinked signals`);

    if (signals.length === 0) {
      console.log('[Connector] No signals to link');
      return;
    }

    // Process each signal
    for (const signal of signals) {
      console.log(`[Connector] Processing signal: ${signal.title}`);

      // Create case from signal
      const caseId = await createCaseFromSignal(pool, signal, userId);

      // Link signal to case
      await linkSignalToCase(pool, signal.id, caseId);

      console.log(`[Connector] ✅ Completed: Signal ${signal.id} → Case ${caseId}`);
    }

    console.log(`[Connector] ✅ Complete: ${signals.length} signals linked to cases`);
  } catch (error) {
    console.error('[Connector] ❌ Failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run
connectFormsToCases(1)
  .then(() => {
    console.log('[Connector] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Connector] Fatal error:', error);
    process.exit(1);
  });
