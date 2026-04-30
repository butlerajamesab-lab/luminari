/**
 * REAL DOCUMENTS PROCESSOR
 * 
 * Processes real documents from database through complete pipeline:
 * 1. Fetch document content
 * 2. Extract forms
 * 3. Enrich with Sunam
 * 4. Create cases
 * 5. Link signals
 */

import mysql from 'mysql2/promise';

interface RealDocument {
  id: number;
  caseId: number;
  filename: string;
  textContent: string;
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
 * Fetch real documents with content
 */
async function fetchRealDocuments(pool: mysql.Pool, limit: number = 10): Promise<RealDocument[]> {
  const query = `
    SELECT 
      id,
      caseId,
      filename,
      textContent
    FROM documents
    WHERE textContent IS NOT NULL
    AND textContent != ''
    LIMIT 10
  `;

  const [rows] = await pool.execute(query.replace('?', limit.toString()));
  return rows as RealDocument[];
}

/**
 * Insert proto-form from real document
 */
async function insertProtoForm(pool: mysql.Pool, doc: RealDocument): Promise<void> {
  const protoFormId = `REAL-DOC-${doc.id}-${Date.now()}`;
  const now = Date.now();

  const query = `
    INSERT INTO forms_registry_staging (
      proto_form_id,
      form_name,
      agency_name,
      jurisdiction,
      primary_domain,
      confidence_score,
      raw_context,
      source_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Analyze document to determine domain
  const content = doc.textContent.toLowerCase();
  let domain = 'CONSUMER';
  let confidence = 65;

  if (content.includes('wage') || content.includes('employment') || content.includes('salary')) {
    domain = 'EMPLOYMENT';
    confidence = 85;
  } else if (content.includes('housing') || content.includes('tenant') || content.includes('landlord')) {
    domain = 'HOUSING';
    confidence = 80;
  } else if (content.includes('medical') || content.includes('health') || content.includes('insurance')) {
    domain = 'BENEFITS';
    confidence = 75;
  } else if (content.includes('claim') || content.includes('complaint')) {
    domain = 'CONSUMER';
    confidence = 70;
  }

  await pool.execute(query, [
    protoFormId,
    doc.filename,
    'Document Analysis System',
    'WASHINGTON',
    domain,
    confidence,
    doc.textContent.substring(0, 5000), // First 5000 chars
    `document-${doc.id}`,
    now,
    now,
  ]);

  console.log(`[RealDocs] ✅ Proto-form inserted: ${protoFormId} (${domain}, ${confidence}%)`);
}

/**
 * Create signal from proto-form
 */
async function createSignal(pool: mysql.Pool, protoFormId: string, filename: string, domain: string, confidence: number): Promise<void> {
  const now = Date.now();
  const signalId = `REAL-${protoFormId}-${now}`;

  const domainSeverityMap: { [key: string]: string } = {
    'EMPLOYMENT': 'high',
    'HOUSING': 'high',
    'BENEFITS': 'medium',
    'CONSUMER': 'low',
  };

  const severity = domainSeverityMap[domain] || 'medium';

  const query = `
    INSERT INTO detected_signals (
      signalType,
      datasetId,
      severity,
      title,
      explanation,
      confidenceScore,
      approvalStatus,
      detectedAt,
      createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(query, [
    'FORM_DETECTION',
    'REAL_DOCUMENTS',
    severity,
    `Real Document: ${filename}`,
    `Extracted from real document: ${filename}. Domain: ${domain}. Confidence: ${confidence}%.`,
    confidence,
    'pending',
    now,
    now,
  ]);

  console.log(`[RealDocs] ✅ Signal created from: ${filename}`);
}

/**
 * Create case from signal
 */
async function createCase(pool: mysql.Pool, signalId: number, filename: string, domain: string, userId: number = 1): Promise<number> {
  const now = Date.now();

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
    `Real Document Case: ${filename}`,
    `Auto-created case from real document processing. Signal ID: ${signalId}`,
    'active',
    'REAL_DOCUMENT_INTAKE',
    now,
    now,
  ]);

  const caseId = (result as any).insertId;
  console.log(`[RealDocs] ✅ Case created: ID ${caseId}`);
  return caseId;
}

/**
 * Link signal to case
 */
async function linkSignalToCase(pool: mysql.Pool, signalId: number, caseId: number): Promise<void> {
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
    signalId,
    'REAL_DOCUMENT_SIGNAL',
    `Linked from real document signal ${signalId}`,
  ]);

  console.log(`[RealDocs] ✅ Linked signal ${signalId} to case ${caseId}`);
}

/**
 * Main execution
 */
async function processRealDocuments(limit: number = 3): Promise<void> {
  let pool: mysql.Pool | null = null;

  try {
    console.log('[RealDocs] Starting real document processing...');
    pool = await getPool();

    // Fetch real documents
    const documents = await fetchRealDocuments(pool, limit);
    console.log(`[RealDocs] Found ${documents.length} real documents`);

    if (documents.length === 0) {
      console.log('[RealDocs] No documents to process');
      return;
    }

    // Process each document through complete pipeline
    for (const doc of documents) {
      console.log(`\n[RealDocs] ═══ Processing: ${doc.filename} ═══`);

      // Step 1: Extract to proto-form
      const protoFormId = `REAL-DOC-${doc.id}-${Date.now()}`;
      const content = doc.textContent.toLowerCase();
      let domain = 'CONSUMER';
      let confidence = 65;

      if (content.includes('wage') || content.includes('employment')) {
        domain = 'EMPLOYMENT';
        confidence = 85;
      } else if (content.includes('housing') || content.includes('tenant')) {
        domain = 'HOUSING';
        confidence = 80;
      } else if (content.includes('medical') || content.includes('health')) {
        domain = 'BENEFITS';
        confidence = 75;
      }

      await insertProtoForm(pool, doc);

      // Step 2: Create signal from proto-form
      await createSignal(pool, protoFormId, doc.filename, domain, confidence);

      // Step 3: Get the signal ID (query last inserted)
      const [signals] = await pool.execute(
        'SELECT id FROM detected_signals WHERE title LIKE ? ORDER BY id DESC LIMIT 1',
        [`%${doc.filename}%`]
      );
      const signalId = (signals as any[])[0]?.id;

      if (signalId) {
        // Step 4: Create case
        const caseId = await createCase(pool, signalId, doc.filename, domain);

        // Step 5: Link signal to case
        await linkSignalToCase(pool, signalId, caseId);

        console.log(`[RealDocs] ✅ Complete: ${doc.filename} → Signal ${signalId} → Case ${caseId}`);
      }
    }

    console.log(`\n[RealDocs] ✅ Pipeline complete: ${documents.length} documents processed`);
  } catch (error) {
    console.error('[RealDocs] ❌ Failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run
processRealDocuments(3)
  .then(() => {
    console.log('[RealDocs] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[RealDocs] Fatal error:', error);
    process.exit(1);
  });
