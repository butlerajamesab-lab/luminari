/**
 * LUMINARI REGISTRY - COMPLETE SCHEMA INITIALIZATION
 * 
 * Creates all 16 tables + 3 views for the full Luminari Action Engine
 * Production-ready, immutable, locked schema
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function initLuminariCompleteSchema() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("LUMINARI REGISTRY - COMPLETE SCHEMA INITIALIZATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const db = await getLuminariDb();

    // ============================================================
    // LAYER 0: JURISDICTIONS (Foundation)
    // ============================================================
    console.log("[SCHEMA] Creating jurisdictions table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jurisdictions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        code VARCHAR(10) NOT NULL UNIQUE,
        region VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ jurisdictions");

    // ============================================================
    // LAYER 1: PROGRAMS (Help Resources)
    // ============================================================
    console.log("[SCHEMA] Creating layer1_programs table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS layer1_programs (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        name VARCHAR(500) NOT NULL,
        domain VARCHAR(100),
        description TEXT,
        url VARCHAR(500),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        access_methods TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ layer1_programs");

    console.log("[SCHEMA] Creating program_contacts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS program_contacts (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL REFERENCES layer1_programs(id),
        contact_name VARCHAR(255),
        contact_title VARCHAR(255),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        contact_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ program_contacts");

    // ============================================================
    // LAYER 2: WORKFLOWS (Resolution Guidance)
    // ============================================================
    console.log("[SCHEMA] Creating layer2_workflows table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS layer2_workflows (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        name VARCHAR(500) NOT NULL,
        domain VARCHAR(100),
        description TEXT,
        escalation_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ layer2_workflows");

    console.log("[SCHEMA] Creating workflow_steps table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES layer2_workflows(id),
        step_number INTEGER NOT NULL,
        step_name VARCHAR(255) NOT NULL,
        description TEXT,
        required_documents TEXT,
        estimated_time VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ workflow_steps");

    console.log("[SCHEMA] Creating workflow_step_contacts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_step_contacts (
        id SERIAL PRIMARY KEY,
        step_id INTEGER NOT NULL REFERENCES workflow_steps(id),
        contact_name VARCHAR(255),
        contact_title VARCHAR(255),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ workflow_step_contacts");

    // ============================================================
    // LAYER 3: ACCOUNTABILITY (Oversight & Enforcement)
    // ============================================================
    console.log("[SCHEMA] Creating layer3_accountability_entities table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS layer3_accountability_entities (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        name VARCHAR(500) NOT NULL,
        entity_type VARCHAR(100),
        domain VARCHAR(100),
        description TEXT,
        oversight_authority TEXT,
        complaint_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ layer3_accountability_entities");

    console.log("[SCHEMA] Creating accountability_filing_methods table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_filing_methods (
        id SERIAL PRIMARY KEY,
        entity_id INTEGER NOT NULL REFERENCES layer3_accountability_entities(id),
        filing_method VARCHAR(100),
        url VARCHAR(500),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ accountability_filing_methods");

    // ============================================================
    // LAYER 0: ALERTS & SIGNALS (Enforcement Triggers)
    // ============================================================
    console.log("[SCHEMA] Creating layer0_alerts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS layer0_alerts (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        alert_type VARCHAR(100),
        alert_description TEXT,
        severity VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ layer0_alerts");

    console.log("[SCHEMA] Creating enforcement_signals table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS enforcement_signals (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        signal_type VARCHAR(100),
        signal_description TEXT,
        related_entity_id INTEGER REFERENCES layer3_accountability_entities(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ enforcement_signals");

    // ============================================================
    // CROSS-CUTTING CONCERNS
    // ============================================================
    console.log("[SCHEMA] Creating cross_cutting_deadlines table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_deadlines (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        deadline_type VARCHAR(100),
        deadline_date DATE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ cross_cutting_deadlines");

    console.log("[SCHEMA] Creating cross_cutting_geographic_qualifiers table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_geographic_qualifiers (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        geographic_qualifier VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ cross_cutting_geographic_qualifiers");

    console.log("[SCHEMA] Creating cross_cutting_population_qualifiers table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_population_qualifiers (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id),
        population_qualifier VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ cross_cutting_population_qualifiers");

    // ============================================================
    // SYSTEM INTEGRITY & PROVENANCE
    // ============================================================
    console.log("[SCHEMA] Creating extraction_versions table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS extraction_versions (
        id SERIAL PRIMARY KEY,
        version_number VARCHAR(50) NOT NULL UNIQUE,
        extraction_date TIMESTAMP NOT NULL,
        total_records INTEGER,
        jurisdictions_count INTEGER,
        programs_count INTEGER,
        workflows_count INTEGER,
        entities_count INTEGER,
        signals_count INTEGER,
        data_gaps INTEGER,
        duplicates INTEGER,
        fabrication INTEGER,
        canonical_reference BOOLEAN DEFAULT true,
        capture_rate DECIMAL(5,2),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ extraction_versions");

    console.log("[SCHEMA] Creating item_provenance table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS item_provenance (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(100),
        record_id INTEGER,
        source_document VARCHAR(255),
        extraction_version VARCHAR(50),
        verified BOOLEAN DEFAULT false,
        verification_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ item_provenance");

    console.log("[SCHEMA] Creating system_integrity_log table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_integrity_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100),
        event_description TEXT,
        affected_table VARCHAR(100),
        affected_record_id INTEGER,
        hash_value VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ system_integrity_log");

    // ============================================================
    // VIEWS
    // ============================================================
    console.log("[SCHEMA] Creating views...");
    
    await db.execute(sql`
      CREATE OR REPLACE VIEW vw_jurisdiction_summary AS
      SELECT 
        j.id,
        j.name,
        j.code,
        COUNT(DISTINCT p.id) as program_count,
        COUNT(DISTINCT w.id) as workflow_count,
        COUNT(DISTINCT e.id) as entity_count
      FROM jurisdictions j
      LEFT JOIN layer1_programs p ON j.id = p.jurisdiction_id
      LEFT JOIN layer2_workflows w ON j.id = w.jurisdiction_id
      LEFT JOIN layer3_accountability_entities e ON j.id = e.jurisdiction_id
      GROUP BY j.id, j.name, j.code
    `);
    console.log("✓ vw_jurisdiction_summary");

    await db.execute(sql`
      CREATE OR REPLACE VIEW vw_critical_jurisdictions AS
      SELECT 
        j.id,
        j.name,
        j.code,
        COUNT(DISTINCT s.id) as signal_count,
        COUNT(DISTINCT a.id) as alert_count
      FROM jurisdictions j
      LEFT JOIN enforcement_signals s ON j.id = s.jurisdiction_id
      LEFT JOIN layer0_alerts a ON j.id = a.jurisdiction_id
      WHERE s.id IS NOT NULL OR a.id IS NOT NULL
      GROUP BY j.id, j.name, j.code
      ORDER BY signal_count DESC, alert_count DESC
    `);
    console.log("✓ vw_critical_jurisdictions");

    await db.execute(sql`
      CREATE OR REPLACE VIEW vw_deadline_summary AS
      SELECT 
        j.id,
        j.name,
        d.deadline_type,
        d.deadline_date,
        d.description,
        CASE 
          WHEN d.deadline_date < CURRENT_DATE THEN 'OVERDUE'
          WHEN d.deadline_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'URGENT'
          ELSE 'ON TRACK'
        END as deadline_status
      FROM jurisdictions j
      LEFT JOIN cross_cutting_deadlines d ON j.id = d.jurisdiction_id
      WHERE d.id IS NOT NULL
      ORDER BY d.deadline_date ASC
    `);
    console.log("✓ vw_deadline_summary");

    // ============================================================
    // VERIFICATION
    // ============================================================
    console.log("\n[VERIFY] Checking table creation...");
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`✅ Schema initialization complete`);
    console.log(`   Tables created: ${tables.length}`);
    console.log(`   Connection: PostgreSQL (luminari_registry)`);
    console.log(`   Status: READY FOR DATA INGESTION\n`);

    return {
      success: true,
      tables_created: tables.length,
      timestamp: new Date().toISOString(),
      connection: "PostgreSQL (luminari_registry)",
      status: "READY"
    };
  } catch (err: any) {
    console.error("❌ Schema initialization failed:", err.message);
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initLuminariCompleteSchema().then(() => {
    console.log("✅ Schema initialization complete. Exiting.");
    process.exit(0);
  });
}

export { initLuminariCompleteSchema };
