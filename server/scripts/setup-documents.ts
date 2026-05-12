import { db } from "../db";
import { sql } from "drizzle-orm";

async function setupDocuments() {
  try {
    console.log("[SETUP] Dropping existing documents table...");
    
    // Drop table if exists
    await db.execute(sql`DROP TABLE IF EXISTS "documents"`);
    console.log("[SETUP] ✅ Table dropped");
    
    console.log("[SETUP] Creating documents table with all columns...");
    
    // Create table with all columns - using raw string to ensure full SQL
    const createSQL = `
      CREATE TABLE "documents" (
        "id" SERIAL PRIMARY KEY,
        "caseId" int NOT NULL,
        "filename" varchar(512) NOT NULL,
        "fileType" varchar(32) NOT NULL,
        "mimeType" varchar(128) NOT NULL,
        "fileSize" int NOT NULL,
        \`s3Key\` varchar(512) NOT NULL,
        \`s3Url\` text NOT NULL,
        \`sha256Hash\` varchar(64) NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'uploaded',
        "errorMessage" text,
        "retryCount" int NOT NULL DEFAULT 0,
        "textContent" mediumtext,
        "pageCount" int,
        "durationSeconds" int,
        "documentType" varchar(128),
        "documentPurpose" text,
        "aiMetadata" json,
        "createdAt" bigint NOT NULL,
        "snapshotId" int NOT NULL,
        "documentResolution" TEXT NOT NULL DEFAULT 'active',
        "replacedByDocumentId" int,
        "resolutionReason" text,
        INDEX "idx_docs_case" ("caseId"),
        INDEX "idx_docs_status" ("status"),
        UNIQUE INDEX "idx_docs_hash_case" (\`sha256Hash\`, "caseId"),
        INDEX "idx_docs_snapshot" ("snapshotId"),
        INDEX "idx_docs_resolution" ("documentResolution")
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    await db.execute(sql.raw(createSQL));
    console.log("[SETUP] ✅ documents table created");
    
    // Verify table exists
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'documents'`);
    console.log("[VERIFY] Table exists:", tables.length > 0 ? "YES" : "NO");
    
    // Verify columns exist
    const columns = await db.execute(sql`DESCRIBE "documents"`);
    console.log("[VERIFY] Column count:", columns.length);
    
    // Insert test document
    const now = Date.now();
    console.log("[INSERT] Inserting test document...");
    
    const insertSQL = `
      INSERT INTO "documents" (
        "caseId",
        "filename",
        "fileType",
        "mimeType",
        "fileSize",
        \`s3Key\`,
        \`s3Url\`,
        \`sha256Hash\`,
        "status",
        "retryCount",
        "createdAt",
        "snapshotId",
        "documentResolution"
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
        ${now},
        1,
        'active'
      )
    `;
    
    await db.execute(sql.raw(insertSQL));
    console.log("[INSERT] ✅ Test document inserted");
    
    // Verify insert
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM "documents" WHERE "caseId" = 7
    `);
    const count = (result[0] as any)?.count || 0;
    console.log("[VERIFY] Documents in case 7:", count);
    
    console.log("[SETUP] ✅ ALL OPERATIONS COMPLETE");
    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Failed:", error);
    process.exit(1);
  }
}

setupDocuments();
