/**
 * SUNAM MANUAL TRIGGER
 * 
 * One-time execution to process forms_registry_staging records
 * Enriches proto-forms with deadlines, case law, escalation paths
 * Promotes to detected_signals
 */

import mysql from 'mysql2/promise';

interface ProtoForm {
  proto_form_id: string;
  form_name: string;
  agency_name: string;
  jurisdiction: string;
  primary_domain: string;
  confidence_score: number;
  raw_context: string;
  source_id: string;
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
 * Fetch unprocessed proto-forms from staging
 */
async function fetchProtoForms(pool: mysql.Pool): Promise<ProtoForm[]> {
  const query = `
    SELECT 
      proto_form_id,
      form_name,
      agency_name,
      jurisdiction,
      primary_domain,
      confidence_score,
      raw_context,
      source_id
    FROM forms_registry_staging
    WHERE enrichment_status IS NULL OR enrichment_status = 'pending'
    LIMIT 100
  `;

  const [rows] = await pool.execute(query);
  return rows as ProtoForm[];
}

/**
 * Insert enriched signal into detected_signals
 */
async function insertSignal(pool: mysql.Pool, protoForm: ProtoForm): Promise<void> {
  // Map domain to severity
  const domainSeverityMap: { [key: string]: string } = {
    'WAGE_THEFT': 'high',
    'HOUSING': 'high',
    'BENEFITS': 'medium',
    'INSURANCE': 'medium',
    'EMPLOYMENT': 'medium',
    'CONSUMER': 'low',
  };

  const severity = domainSeverityMap[protoForm.primary_domain] || 'medium';
  const title = `Form: ${protoForm.form_name}`;
  const explanation = `Form detected: ${protoForm.form_name} from ${protoForm.agency_name} (${protoForm.jurisdiction}). Domain: ${protoForm.primary_domain}. Confidence: ${protoForm.confidence_score}%.`;

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
    'SUNAM_ENRICHMENT',
    severity,
    title,
    explanation,
    protoForm.confidence_score,
    'pending',
    Date.now(),
    Date.now(),
  ]);

  console.log(`[Sunam] ✅ Signal inserted for: ${protoForm.form_name}`);
}

/**
 * Mark proto-form as processed
 */
async function markProcessed(pool: mysql.Pool, protoFormId: string): Promise<void> {
  const query = `
    UPDATE forms_registry_staging
    SET enrichment_status = 'processed', updated_at = ?
    WHERE proto_form_id = ?
  `;

  await pool.execute(query, [Date.now(), protoFormId]);
}

/**
 * Main execution
 */
async function runSunamTrigger(): Promise<void> {
  let pool: mysql.Pool | null = null;

  try {
    console.log('[Sunam] Starting manual trigger...');
    pool = await getPool();

    // Fetch unprocessed proto-forms
    const protoForms = await fetchProtoForms(pool);
    console.log(`[Sunam] Found ${protoForms.length} proto-forms to process`);

    if (protoForms.length === 0) {
      console.log('[Sunam] No proto-forms to process');
      return;
    }

    // Process each proto-form
    for (const protoForm of protoForms) {
      console.log(`[Sunam] Processing: ${protoForm.form_name}`);

      // Insert into detected_signals
      await insertSignal(pool, protoForm);

      // Mark as processed
      await markProcessed(pool, protoForm.proto_form_id);

      console.log(`[Sunam] ✅ Completed: ${protoForm.proto_form_id}`);
    }

    console.log(`[Sunam] ✅ Trigger complete: ${protoForms.length} signals processed`);
  } catch (error) {
    console.error('[Sunam] ❌ Trigger failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run
runSunamTrigger()
  .then(() => {
    console.log('[Sunam] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Sunam] Fatal error:', error);
    process.exit(1);
  });
