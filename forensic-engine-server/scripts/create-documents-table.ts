import { db } from "../db";
import { sql } from "drizzle-orm";

async function createDocumentsTable() {
  try {
    console.log("[SETUP] Creating documents table...");
    
    // Create table using raw SQL through the db connection
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`documents\` (
        \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`caseId\` int NOT NULL,
        \`filename\` varchar(512) NOT NULL,
        \`fileType\` varchar(32) NOT NULL,
        \`mimeType\` varchar(128) NOT NULL,
        \`fileSize\` int NOT NULL,
        \`s3Key\` varchar(512) NOT NULL,
        \`s3Url\` text NOT NULL,
        \`sha256Hash\` varchar(64) NOT NULL,
        \`status\` enum('uploaded', 'extracting', 'analyzing', 'ready', 'error', 'retrying', 'failed_permanent') NOT NULL DEFAULT 'uploaded',
        \`errorMessage\` text,
        \`retryCount\` int NOT NULL DEFAULT 0,
        \`textContent\` mediumtext,
        \`pageCount\` int,
        \`durationSeconds\` int,
        \`documentType\` varchar(128),
        \`documentPurpose\` text,
        \`aiMetadata\` json,
        \`createdAt\` bigint NOT NULL,
        \`snapshotId\` int NOT NULL,
        \`documentResolution\` enum('active', 'superseded', 'excluded', 'corrupted') NOT NULL DEFAULT 'active',
        \`replacedByDocumentId\` int,
        \`resolutionReason\` text,
        INDEX \`idx_docs_case\` (\`caseId\`),
        INDEX \`idx_docs_status\` (\`status\`),
        UNIQUE INDEX \`idx_docs_hash_case\` (\`sha256Hash\`, \`caseId\`),
        INDEX \`idx_docs_snapshot\` (\`snapshotId\`),
        INDEX \`idx_docs_resolution\` (\`documentResolution\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log("[SETUP] ✅ documents table created");
    
    // Verify table exists
    const tables = await db.execute(sql`SHOW TABLES LIKE 'documents'`);
    console.log("[VERIFY] Table exists:", tables.length > 0 ? "YES" : "NO");
    
    // Insert test document
    const now = Date.now();
    console.log("[INSERT] Inserting test document...");
    
    await db.execute(sql`
      INSERT INTO \`documents\` (
        \`caseId\`,
        \`filename\`,
        \`fileType\`,
        \`mimeType\`,
        \`fileSize\`,
        \`s3Key\`,
        \`s3Url\`,
        \`sha256Hash\`,
        \`status\`,
        \`createdAt\`,
        \`snapshotId\`,
        \`documentResolution\`
      ) VALUES (
        7,
        'test_insurance_policy.pdf',
        'pdf',
        'application/pdf',
        1024,
        'test/test_insurance_policy.pdf',
        'https://example.com/test_insurance_policy.pdf',
        'abc123def456',
        'uploaded',
        ${now},
        1,
        'active'
      )
    `);
    
    console.log("[INSERT] ✅ Test document inserted");
    
    // Verify insert
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM \`documents\` WHERE \`caseId\` = 7
    `);
    console.log("[VERIFY] Documents in case 7:", result[0]?.count || 0);
    
    console.log("[SETUP] ✅ ALL OPERATIONS COMPLETE");
    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Failed:", error);
    process.exit(1);
  }
}

createDocumentsTable();
