import mysql from "mysql2/promise";

async function setupDocuments() {
  const pool = mysql.createPool({
    host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
    port: 4000,
    user: "2jhK1AfHyk6mXSq.root",
    password: "2k5Lq94U8voiKlatA3uZ",
    database: "luminari_registry",
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const connection = await pool.getConnection();
    
    console.log("[SETUP] Dropping existing documents table...");
    await connection.execute("DROP TABLE IF EXISTS `documents`");
    console.log("[SETUP] ✅ Table dropped");
    
    console.log("[SETUP] Creating documents table with all columns...");
    
    const createSQL = `
      CREATE TABLE \`documents\` (
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
    `;
    
    await connection.execute(createSQL);
    console.log("[SETUP] ✅ documents table created");
    
    // Verify table exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'documents'");
    console.log("[VERIFY] Table exists:", (tables as any[]).length > 0 ? "YES" : "NO");
    
    // Verify columns exist
    const [columns] = await connection.execute("DESCRIBE `documents`");
    console.log("[VERIFY] Column count:", (columns as any[]).length);
    
    // Insert test document
    const now = Date.now();
    console.log("[INSERT] Inserting test document...");
    
    const insertSQL = `
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
        \`retryCount\`,
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
        0,
        ?,
        1,
        'active'
      )
    `;
    
    await connection.execute(insertSQL, [now]);
    console.log("[INSERT] ✅ Test document inserted");
    
    // Verify insert
    const [result] = await connection.execute("SELECT COUNT(*) as count FROM `documents` WHERE `caseId` = 7");
    const count = (result as any[])[0]?.count || 0;
    console.log("[VERIFY] Documents in case 7:", count);
    
    connection.release();
    await pool.end();
    
    console.log("[SETUP] ✅ ALL OPERATIONS COMPLETE");
    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Failed:", error);
    process.exit(1);
  }
}

setupDocuments();
