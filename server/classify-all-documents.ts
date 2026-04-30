import mysql from 'mysql2/promise';
import { classifyDocumentMode } from './document-mode-classifier';

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

async function classifyAll() {
  let pool: mysql.Pool | null = null;
  try {
    pool = await getPool();
    
    const [docs] = await pool.execute('SELECT id, filename, textContent FROM documents WHERE textContent IS NOT NULL AND textContent != "" LIMIT 50');
    const documents = docs as any[];
    
    console.log(`[Classifier] Analyzing ${documents.length} documents\n`);
    
    let ingestionCount = 0;
    let backboneCount = 0;
    const results: any[] = [];
    
    for (const doc of documents) {
      const classification = classifyDocumentMode(doc.textContent, doc.filename);
      results.push({
        filename: doc.filename,
        mode: classification.mode,
        confidence: classification.confidence,
      });
      
      if (classification.mode === 'INGESTION') {
        ingestionCount++;
      } else {
        backboneCount++;
      }
    }
    
    console.log(`[Results Summary]`);
    console.log(`  ✅ INGESTION: ${ingestionCount} documents → signals + cases`);
    console.log(`  📚 BACKBONE: ${backboneCount} documents → reference storage`);
    console.log(`  Total: ${documents.length}\n`);
    
    console.log(`[Document Breakdown]`);
    for (const result of results) {
      const icon = result.mode === 'INGESTION' ? '✅' : '📚';
      console.log(`  ${icon} ${result.filename.padEnd(40)} ${result.mode.padEnd(10)} (${result.confidence}%)`);
    }
  } finally {
    if (pool) await pool.end();
  }
}

classifyAll().catch(console.error);
