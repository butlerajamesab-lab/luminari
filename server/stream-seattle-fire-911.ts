/**
 * SEATTLE FIRE 911 STREAM INGESTION
 * 
 * Controlled stream setup:
 * 1. Fetch 5-10 records from Seattle Fire 911 API
 * 2. Normalize to documents
 * 3. Route through INGESTION pipeline
 * 4. Log to ingested_records
 * 5. Manual run first, then enable loop
 */

import mysql from 'mysql2/promise';
import axios from 'axios';

const STREAM_ID = 'seattle_fire_911';
const API_URL = 'https://data.seattle.gov/resource/kzjm-xkqj.json';
const BATCH_SIZE = 5;

interface FireCall {
  incident_number?: string;
  incident_type?: string;
  incident_datetime?: string;
  incident_location?: string;
  latitude?: number;
  longitude?: number;
  [key: string]: any;
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
 * Fetch records from Seattle Fire 911 API
 */
async function fetchFireCalls(limit: number = BATCH_SIZE): Promise<FireCall[]> {
  try {
    console.log(`[Stream] Fetching ${limit} records from Seattle Fire 911 API...`);
    const response = await axios.get(API_URL, {
      params: {
        $limit: limit,
      },
      timeout: 10000,

    });

    const records = Array.isArray(response.data) ? response.data : [];
    if (!Array.isArray(records) || records.length === 0) {
      console.log(`[Stream] Response data:`, JSON.stringify(response.data).substring(0, 200));
    }
    console.log(`[Stream] ✅ Fetched ${records.length} records`);
    return records;
  } catch (error) {
    console.error(`[Stream] ❌ API fetch failed:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Normalize fire call to document format
 */
function normalizeToDocument(call: FireCall): {
  filename: string;
  textContent: string;
  sourceId: string;
  timestamp: number;
} {
  const incidentType = call.incident_type || 'Unknown Incident';
  const location = call.incident_location || 'Location Unknown';
  const timestamp = call.incident_datetime ? new Date(call.incident_datetime).getTime() : Date.now();

  return {
    filename: `911-${call.incident_number || 'unknown'}.txt`,
    textContent: `SEATTLE FIRE 911 CALL. Incident Number: ${call.incident_number}. Type: ${incidentType}. Location: ${location}. Datetime: ${call.incident_datetime}. Latitude: ${call.latitude}. Longitude: ${call.longitude}. Description: Fire Department 911 dispatch record.`,
    sourceId: `seattle_fire_911_${call.incident_number}`,
    timestamp,
  };
}

/**
 * Insert normalized documents into database
 */
async function insertDocuments(
  pool: mysql.Pool,
  documents: ReturnType<typeof normalizeToDocument>[]
): Promise<number[]> {
  const documentIds: number[] = [];

  for (const doc of documents) {
    const query = `
      INSERT INTO documents (
        caseId,
        filename,
        fileType,
        mimeType,
        fileSize,
        s3Key,
        s3Url,
        sha256Hash,
        status,
        snapshotId,
        textContent,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(query, [
      1, // caseId (default)
      doc.filename,
      'txt',
      'text/plain',
      doc.textContent.length,
      `stream/${STREAM_ID}/${doc.filename}`,
      `https://example.com/stream/${STREAM_ID}/${doc.filename}`,
      `hash_${doc.sourceId}`,
      'ready',
      1, // snapshotId
      doc.textContent,
      doc.timestamp,
    ]);

    const docId = (result as any).insertId;
    documentIds.push(docId);

    console.log(`[Stream] ✅ Document inserted: ${doc.filename} (ID: ${docId})`);
  }

  return documentIds;
}

/**
 * Log ingestion to ingested_records
 */
async function logIngestion(
  pool: mysql.Pool,
  sourceId: string,
  status: 'success' | 'error',
  recordCount: number,
  errorMessage?: string
): Promise<void> {
  const query = `
    INSERT INTO ingested_records (
      source_id,
      status,
      record_count,
      error_message,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `;

  await pool.execute(query, [
    sourceId,
    status,
    recordCount,
    errorMessage || null,
    Date.now(),
  ]);

  console.log(`[Stream] ✅ Logged ingestion: ${sourceId} (${status}, ${recordCount} records)`);
}

/**
 * Update stream registry
 */
async function updateStreamRegistry(
  pool: mysql.Pool,
  recordCount: number,
  error?: string
): Promise<void> {
  const status = error ? 'ERROR' : 'ACTIVE';
  const consecutiveFailures = error ? 1 : 0;

  const query = `
    UPDATE data_stream_registry
    SET 
      last_poll = ?,
      records_ingested = records_ingested + ?,
      status = ?,
      consecutive_failures = ?,
      last_error_message = ?,
      updated_at = ?
    WHERE stream_id = ?
  `;

  await pool.execute(query, [
    Date.now(),
    recordCount,
    status,
    consecutiveFailures,
    error || null,
    Date.now(),
    STREAM_ID,
  ]);

  console.log(`[Stream] ✅ Updated registry: ${recordCount} records, status: ${status}`);
}

/**
 * Main ingestion run
 */
async function runIngestion(): Promise<void> {
  let pool: mysql.Pool | null = null;

  try {
    console.log(`\n[Stream] ═══ SEATTLE FIRE 911 INGESTION ═══\n`);

    pool = await getPool();

    // Step 1: Fetch fire calls
    const fireCalls = await fetchFireCalls(BATCH_SIZE);

    if (fireCalls.length === 0) {
      console.log(`[Stream] ⚠️  No records fetched`);
      await updateStreamRegistry(pool, 0);
      return;
    }

    // Step 2: Normalize to documents
    console.log(`[Stream] Normalizing ${fireCalls.length} records...`);
    const documents = fireCalls.map(normalizeToDocument);

    // Step 3: Insert documents
    console.log(`[Stream] Inserting documents...`);
    const documentIds = await insertDocuments(pool, documents);

    // Step 4: Log ingestion
    await logIngestion(pool, STREAM_ID, 'success', documentIds.length);

    // Step 5: Update registry
    await updateStreamRegistry(pool, documentIds.length);

    console.log(`\n[Stream] ✅ Ingestion complete: ${documentIds.length} documents inserted`);
    console.log(`[Stream] Next: Run classifier → extract → Sunam → signals → cases\n`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Stream] ❌ Ingestion failed:`, errorMsg);

    if (pool) {
      await logIngestion(pool, STREAM_ID, 'error', 0, errorMsg);
      await updateStreamRegistry(pool, 0, errorMsg);
    }

    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run
runIngestion()
  .then(() => {
    console.log('[Stream] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Stream] Fatal error:', error);
    process.exit(1);
  });
