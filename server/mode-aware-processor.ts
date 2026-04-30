/**
 * MODE-AWARE DOCUMENT PROCESSOR
 * 
 * Routes documents based on classification:
 * - INGESTION: Extract → Signal → Case
 * - BACKBONE: Store as reference (no signals, no cases)
 */

import mysql from 'mysql2/promise';
import { classifyDocumentMode } from './document-mode-classifier';

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
 * Fetch unprocessed documents
 */
async function fetchDocuments(pool: mysql.Pool, limit: number = 10): Promise<RealDocument[]> {
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
 * Store BACKBONE document as reference
 */
async function storeBackboneReference(
  pool: mysql.Pool,
  doc: RealDocument,
  classification: ReturnType<typeof classifyDocumentMode>
): Promise<void> {
  // Create a reference entry (could be in a separate backbone_references table)
  console.log(`[Processor] 📚 BACKBONE: Storing ${doc.filename} as reference`);
  console.log(`            Classification: ${classification.mode} (${classification.confidence}%)`);
  console.log(`            Keywords: ${classification.keywords.slice(0, 3).join(', ')}`);

  // In production, would insert into backbone_references table
  // For now, just log the action
}

/**
 * Process INGESTION document (extract → signal → case)
 */
async function processIngestionDocument(
  pool: mysql.Pool,
  doc: RealDocument,
  classification: ReturnType<typeof classifyDocumentMode>
): Promise<void> {
  console.log(`[Processor] 📋 INGESTION: Processing ${doc.filename}`);
  console.log(`            Classification: ${classification.mode} (${classification.confidence}%)`);

  const protoFormId = `INGESTION-${doc.id}-${Date.now()}`;
  const now = Date.now();

  // Step 1: Extract to proto-form
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

  await pool.execute(query, [
    protoFormId,
    doc.filename,
    'Document Analysis System',
    'WASHINGTON',
    'CLAIM', // Generic claim type
    classification.confidence,
    doc.textContent.substring(0, 5000),
    `document-${doc.id}`,
    now,
    now,
  ]);

  console.log(`[Processor] ✅ Proto-form: ${protoFormId}`);

  // Step 2: Create signal
  const signalQuery = `
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

  await pool.execute(signalQuery, [
    'FORM_DETECTION',
    'INGESTION_PIPELINE',
    'medium',
    `Ingestion: ${doc.filename}`,
    `Extracted from ingestion document: ${doc.filename}. Keywords: ${classification.keywords.slice(0, 3).join(', ')}.`,
    classification.confidence,
    'pending',
    now,
    now,
  ]);

  console.log(`[Processor] ✅ Signal created`);

  // Step 3: Get signal ID and create case
  const [signals] = await pool.execute(
    'SELECT id FROM detected_signals WHERE title LIKE ? ORDER BY id DESC LIMIT 1',
    [`%${doc.filename}%`]
  );
  const signalId = (signals as any[])[0]?.id;

  if (signalId) {
    const caseQuery = `
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

    const [result] = await pool.execute(caseQuery, [
      1,
      `Ingestion Case: ${doc.filename}`,
      `Auto-created from ingestion pipeline. Signal ID: ${signalId}`,
      'active',
      'INGESTION_INTAKE',
      now,
      now,
    ]);

    const caseId = (result as any).insertId;
    console.log(`[Processor] ✅ Case created: ${caseId}`);

    // Step 4: Link signal to case
    const linkQuery = `
      INSERT INTO signal_flags (
        caseId,
        documentId,
        flagType,
        description
      ) VALUES (?, ?, ?, ?)
    `;

    await pool.execute(linkQuery, [
      caseId,
      signalId,
      'INGESTION_SIGNAL',
      `Linked from ingestion signal ${signalId}`,
    ]);

    console.log(`[Processor] ✅ Linked: Signal ${signalId} → Case ${caseId}`);
  }
}

/**
 * Main execution
 */
async function processDocumentsWithModeAwareness(limit: number = 10): Promise<void> {
  let pool: mysql.Pool | null = null;

  try {
    console.log('[Processor] Starting mode-aware document processing...\n');
    pool = await getPool();

    // Fetch documents
    const documents = await fetchDocuments(pool, limit);
    console.log(`[Processor] Found ${documents.length} documents\n`);

    if (documents.length === 0) {
      console.log('[Processor] No documents to process');
      return;
    }

    // Statistics
    let ingestionCount = 0;
    let backboneCount = 0;

    // Process each document
    for (const doc of documents) {
      console.log(`\n[Processor] ═══ Document: ${doc.filename} ═══`);

      // Classify
      const classification = classifyDocumentMode(doc.textContent, doc.filename);

      // Route based on mode
      if (classification.mode === 'INGESTION') {
        await processIngestionDocument(pool, doc, classification);
        ingestionCount++;
      } else {
        await storeBackboneReference(pool, doc, classification);
        backboneCount++;
      }
    }

    console.log(`\n[Processor] ✅ Complete:`);
    console.log(`   INGESTION: ${ingestionCount} documents → signals + cases`);
    console.log(`   BACKBONE: ${backboneCount} documents → reference storage`);
  } catch (error) {
    console.error('[Processor] ❌ Failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run
processDocumentsWithModeAwareness(10)
  .then(() => {
    console.log('\n[Processor] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Processor] Fatal error:', error);
    process.exit(1);
  });
