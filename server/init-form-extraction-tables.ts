/**
 * Initialize Form Extraction Staging Tables
 * Creates three tables for form signal extraction pipeline:
 * - forms_registry_staging (proto-forms with validation flags)
 * - agency_candidates (extracted agency references)
 * - workflow_form_links_staging (workflow-form associations)
 */

import mysql from "mysql2/promise";

async function initFormExtractionTables() {
  console.log("[FormExtraction] Starting table initialization...");

  try {
    const connection = await mysql.createConnection({
      host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
      port: 4000,
      user: "2jhK1AfHyk6mXSq.root",
      password: "2k5Lq94U8voiLkatA3uZ",
      database: "luminari_registry",
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      // Create forms_registry_staging table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS forms_registry_staging (
          proto_form_id VARCHAR(64) PRIMARY KEY,
          form_name VARCHAR(512),
          form_name_strategy VARCHAR(64),
          submission_url VARCHAR(2048),
          submission_method VARCHAR(64),
          agency_name VARCHAR(256),
          jurisdiction VARCHAR(64),
          primary_domain VARCHAR(64),
          deadline_in_days INT,
          deadline_raw_match TEXT,
          confidence_score INT NOT NULL,
          validation_flags JSON,
          raw_context LONGTEXT,
          source_id VARCHAR(256),
          ingested_at BIGINT,
          live_signal_id VARCHAR(64),
          enrichment_status VARCHAR(64),
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          KEY idx_confidence (confidence_score),
          KEY idx_jurisdiction (jurisdiction),
          KEY idx_domain (primary_domain),
          KEY idx_enrichment_status (enrichment_status),
          KEY idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created forms_registry_staging table");

      // Create agency_candidates table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS agency_candidates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          proto_form_id VARCHAR(64) NOT NULL,
          agency_name VARCHAR(256) NOT NULL,
          aliases JSON,
          jurisdiction JSON,
          confidence DECIMAL(3, 2),
          created_at BIGINT NOT NULL,
          KEY idx_proto_form_id (proto_form_id),
          KEY idx_agency_name (agency_name),
          FOREIGN KEY (proto_form_id) REFERENCES forms_registry_staging(proto_form_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created agency_candidates table");

      // Create workflow_form_links_staging table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS workflow_form_links_staging (
          id INT AUTO_INCREMENT PRIMARY KEY,
          proto_form_id VARCHAR(64) NOT NULL,
          workflow_hint VARCHAR(256) NOT NULL,
          matched_keyword VARCHAR(512),
          confidence DECIMAL(3, 2),
          is_ca_prefixed BOOLEAN DEFAULT FALSE,
          created_at BIGINT NOT NULL,
          KEY idx_proto_form_id (proto_form_id),
          KEY idx_workflow_hint (workflow_hint),
          FOREIGN KEY (proto_form_id) REFERENCES forms_registry_staging(proto_form_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created workflow_form_links_staging table");

      console.log("[FormExtraction] ✅ All tables created successfully");
      return { success: true, message: "All form extraction tables created" };
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error("[FormExtraction] ❌ Error:", error.message);
    throw error;
  }
}

// Run if executed directly
initFormExtractionTables()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

export { initFormExtractionTables };
