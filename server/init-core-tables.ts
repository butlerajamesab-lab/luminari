/**
 * Initialize Core Tables using Direct Connection
 * 
 * Creates the three essential tables for the core loop:
 * - ingested_records
 * - detected_signals
 * - pattern_outputs
 * 
 * Cleans corrupted schema first.
 */

import mysql from "mysql2/promise";

async function initCoreTables() {
  console.log("[Init] Starting core table initialization...");

  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    try {
      // Clean database: drop all tables to remove corrupted constraints
      console.log("[Init] Cleaning database of corrupted schema...");
      try {
        await connection.execute(`SET FOREIGN_KEY_CHECKS = 0`);
        
        const [tables] = await connection.execute(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
        ) as any;
        
        for (const table of tables as any[]) {
          try {
            await connection.execute(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
            console.log(`✓ Dropped table: ${table.TABLE_NAME}`);
          } catch (e) {
            // Ignore drop errors
          }
        }
        
        await connection.execute(`SET FOREIGN_KEY_CHECKS = 1`);
        console.log("✓ Database cleaned");
      } catch (e: any) {
        console.warn("[Init] Warning during cleanup:", e.message);
      }

      // Create ingested_records table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ingested_records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          datasetId_ir VARCHAR(64) NOT NULL,
          sourceRecordId VARCHAR(256) NOT NULL,
          ingestedAt BIGINT NOT NULL,
          updatedAt_ir BIGINT NOT NULL,
          rawJson JSON NOT NULL,
          normalizedDate BIGINT,
          normalizedCategory VARCHAR(256),
          normalizedEntity VARCHAR(512),
          normalizedJurisdiction VARCHAR(128),
          normalizedCity VARCHAR(128),
          normalizedState VARCHAR(64),
          normalizedZip VARCHAR(16),
          normalizedStatus VARCHAR(64),
          normalizedAmount DECIMAL(12, 2),
          normalizedDescription TEXT,
          processed_for_signals BOOLEAN DEFAULT FALSE NOT NULL,
          UNIQUE KEY idx_ir_dataset_source_unique (datasetId_ir, sourceRecordId),
          KEY idx_ir_dataset (datasetId_ir),
          KEY idx_ir_source_record (datasetId_ir, sourceRecordId),
          KEY idx_ir_date (normalizedDate),
          KEY idx_ir_category (normalizedCategory),
          KEY idx_ir_entity (normalizedEntity),
          KEY idx_ir_jurisdiction (normalizedJurisdiction),
          KEY idx_ir_city (normalizedCity),
          KEY idx_ir_state (normalizedState)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("✓ Created ingested_records table");

      // Create detected_signals table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS detected_signals (
          signal_id VARCHAR(64) PRIMARY KEY,
          signal_type VARCHAR(100) NOT NULL,
          dataset_id VARCHAR(50) NOT NULL,
          detection_timestamp BIGINT NOT NULL,
          confidence_score INT NOT NULL,
          source_record_ids JSON,
          extraction_timestamp BIGINT,
          data_version VARCHAR(50),
          jurisdiction_scope VARCHAR(50),
          severity_level VARCHAR(50) NOT NULL,
          affected_entities JSON,
          entity_id VARCHAR(255),
          geographic_focus JSON,
          observed_value DECIMAL(20, 4),
          expected_value DECIMAL(20, 4),
          threshold_value DECIMAL(20, 4),
          percentage_change DECIMAL(10, 4),
          time_window_start BIGINT,
          time_window_end BIGINT,
          plain_language_explanation TEXT NOT NULL,
          escalation_status VARCHAR(50),
          reviewed_by VARCHAR(255),
          review_notes TEXT,
          external_reference_id VARCHAR(255),
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          entity_role VARCHAR(255),
          complaint_category VARCHAR(255),
          complaint_subcategory VARCHAR(255),
          narrative_actions_taken TEXT,
          narrative_reasoning TEXT,
          historical_trend_context VARCHAR(255),
          cross_signal_links JSON,
          deviation DECIMAL(10, 4),
          pattern_type_id VARCHAR(64),
          gate_decision_id INT,
          KEY idx_dataset (dataset_id),
          KEY idx_severity (severity_level),
          KEY idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("✓ Created detected_signals table");

      // Create pattern_outputs table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS pattern_outputs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          cluster_id VARCHAR(255) NOT NULL,
          signal_count INT NOT NULL,
          signal_types JSON NOT NULL,
          severity ENUM('low', 'medium', 'high') NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          UNIQUE KEY idx_pattern_cluster (cluster_id),
          KEY idx_pattern_severity (severity),
          KEY idx_pattern_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("✓ Created pattern_outputs table");

      // Verify tables exist
      const [tables_final] = await connection.execute(
        `SELECT table_name FROM information_schema.TABLES 
         WHERE table_schema = DATABASE() 
         AND table_name IN ('ingested_records', 'detected_signals', 'pattern_outputs')`
      ) as any;

      console.log(`\n✓ Verification: ${(tables_final as any[]).length} core tables exist`);

      // Check detected_signals count
      const [signals] = await connection.execute(
        `SELECT COUNT(*) as count FROM detected_signals`
      ) as any;
      console.log(`✓ detected_signals row count: ${(signals as any[])[0]?.count || 0}`);

      console.log("\n✓ Core tables initialized successfully");
      console.log("✓ Connection source: Direct MySQL (same as Drizzle pool)");
      console.log("✓ Ready for core loop: ingestion → detected_signals → pattern_outputs");

      return {
        success: true,
        tables_created: ["ingested_records", "detected_signals", "pattern_outputs"],
        connection_source: "Direct MySQL connection",
      };
    } finally {
      await connection.end();
    }
  } catch (err) {
    console.error("✗ Error initializing core tables:", err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initCoreTables().then(() => process.exit(0));
}

export { initCoreTables };
