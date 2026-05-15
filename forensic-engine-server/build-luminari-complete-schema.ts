/**
 * LUMINARI REGISTRY - COMPLETE SCHEMA INITIALIZATION
 * 
 * Builds the complete ~50+ table schema across all 8 table families:
 * A. Geography and Registry Spine (5 tables)
 * B. Shared Taxonomy (4 tables)
 * C. Resource Layer (7 tables)
 * D. Workflow Layer (9 tables)
 * E. Accountability Layer (14 tables)
 * F. Forms and Agency Seed Layer (3 tables)
 * G. Legal Backbone (3 tables)
 * H. Meaning Layer (6 tables)
 * 
 * Washington is the canonical source model.
 * No alternate state-specific schemas allowed.
 * All data must be transformed to Washington shape before insert.
 */

import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function buildLuminariCompleteSchema() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("LUMINARI REGISTRY - COMPLETE SCHEMA INITIALIZATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const db = await getLuminariDb();

    // =========================================================================
    // A. GEOGRAPHY AND REGISTRY SPINE (5 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Geography and Registry Spine tables...");

    // jurisdictions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jurisdictions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        code VARCHAR(10) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL DEFAULT 'state',
        region VARCHAR(100),
        parent_jurisdiction_id INTEGER REFERENCES jurisdictions(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ jurisdictions");

    // jurisdiction_aliases
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jurisdiction_aliases (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        alias_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ jurisdiction_aliases");

    // jurisdiction_boundaries
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jurisdiction_boundaries (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        boundary_type VARCHAR(50),
        boundary_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ jurisdiction_boundaries");

    // state_registries
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS state_registries (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        registry_name VARCHAR(255) NOT NULL,
        version VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ state_registries");

    // registry_import_runs
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS registry_import_runs (
        id SERIAL PRIMARY KEY,
        state_registry_id INTEGER NOT NULL REFERENCES state_registries(id) ON DELETE CASCADE,
        import_source VARCHAR(255),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        rows_inserted INTEGER DEFAULT 0,
        rows_updated INTEGER DEFAULT 0,
        rows_skipped INTEGER DEFAULT 0,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ registry_import_runs");

    // =========================================================================
    // B. SHARED TAXONOMY (4 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Shared Taxonomy tables...");

    // domains
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS domains (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ domains");

    // categories
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ categories");

    // entity_types
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS entity_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ entity_types");

    // lenses
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lenses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ lenses");

    // =========================================================================
    // C. RESOURCE LAYER (7 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Resource Layer tables...");

    // resources
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        resource_type VARCHAR(100),
        service_category VARCHAR(100),
        contact_info TEXT,
        website_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resources");

    // resource_alternate_names
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_alternate_names (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        alternate_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_alternate_names");

    // resource_locations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_locations (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        address VARCHAR(500),
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(20),
        phone VARCHAR(20),
        hours_of_operation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_locations");

    // resource_eligibility_rules
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_eligibility_rules (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        rule_text TEXT NOT NULL,
        population_qualifier_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_eligibility_rules");

    // resource_access_methods
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_access_methods (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        method_type VARCHAR(100),
        method_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_access_methods");

    // resource_contacts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_contacts (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        contact_name VARCHAR(255),
        contact_title VARCHAR(100),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_contacts");

    // resource_documents
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resource_documents (
        id SERIAL PRIMARY KEY,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        document_name VARCHAR(255),
        document_url VARCHAR(500),
        document_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ resource_documents");

    // =========================================================================
    // D. WORKFLOW LAYER (9 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Workflow Layer tables...");

    // workflows
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        situation_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflows");

    // workflow_lenses
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_lenses (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        lens_id INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_lenses");

    // workflow_steps
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        action_type VARCHAR(100),
        action_description TEXT,
        deadline_days INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_steps");

    // workflow_step_documents
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_step_documents (
        id SERIAL PRIMARY KEY,
        workflow_step_id INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
        document_name VARCHAR(255),
        document_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_step_documents");

    // workflow_step_evidence_outputs
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_step_evidence_outputs (
        id SERIAL PRIMARY KEY,
        workflow_step_id INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
        evidence_type VARCHAR(100),
        evidence_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_step_evidence_outputs");

    // workflow_step_contacts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_step_contacts (
        id SERIAL PRIMARY KEY,
        workflow_step_id INTEGER NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
        contact_name VARCHAR(255),
        contact_title VARCHAR(100),
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_step_contacts");

    // workflow_deadlines
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_deadlines (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        deadline_description TEXT,
        deadline_days INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_deadlines");

    // workflow_statute_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_statute_links (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        statute_citation VARCHAR(255),
        statute_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_statute_links");

    // workflow_resource_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_resource_links (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_resource_links");

    // workflow_accountability_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_accountability_links (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        accountability_path_id INTEGER,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_accountability_links");

    // workflow_escalation_rules
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_escalation_rules (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        trigger_condition TEXT,
        escalation_action TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ workflow_escalation_rules");

    // =========================================================================
    // E. ACCOUNTABILITY LAYER (14 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Accountability Layer tables...");

    // oversight_bodies
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oversight_bodies (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        authority_type VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ oversight_bodies");

    // oversight_body_contacts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oversight_body_contacts (
        id SERIAL PRIMARY KEY,
        oversight_body_id INTEGER NOT NULL REFERENCES oversight_bodies(id) ON DELETE CASCADE,
        contact_name VARCHAR(255),
        contact_title VARCHAR(100),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ oversight_body_contacts");

    // oversight_body_offices
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oversight_body_offices (
        id SERIAL PRIMARY KEY,
        oversight_body_id INTEGER NOT NULL REFERENCES oversight_bodies(id) ON DELETE CASCADE,
        office_name VARCHAR(255),
        office_address VARCHAR(500),
        office_phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ oversight_body_offices");

    // oversight_body_entity_types
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oversight_body_entity_types (
        id SERIAL PRIMARY KEY,
        oversight_body_id INTEGER NOT NULL REFERENCES oversight_bodies(id) ON DELETE CASCADE,
        entity_type_id INTEGER NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ oversight_body_entity_types");

    // accountability_paths
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_paths (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        oversight_body_id INTEGER NOT NULL REFERENCES oversight_bodies(id) ON DELETE CASCADE,
        path_name VARCHAR(255) NOT NULL,
        path_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_paths");

    // accountability_issue_types
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_issue_types (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        issue_type VARCHAR(100),
        issue_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_issue_types");

    // accountability_what_to_report
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_what_to_report (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        report_item TEXT,
        report_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_what_to_report");

    // accountability_filing_methods
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_filing_methods (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        filing_method VARCHAR(100),
        filing_instructions TEXT,
        filing_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_filing_methods");

    // accountability_required_documents
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_required_documents (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        document_name VARCHAR(255),
        document_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_required_documents");

    // accountability_deadlines
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_deadlines (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        deadline_description TEXT,
        deadline_days INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_deadlines");

    // accountability_response_expectations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_response_expectations (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        expectation_description TEXT,
        expected_timeframe_days INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_response_expectations");

    // escalation_chains
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS escalation_chains (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        chain_name VARCHAR(255),
        chain_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ escalation_chains");

    // escalation_chain_steps
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS escalation_chain_steps (
        id SERIAL PRIMARY KEY,
        escalation_chain_id INTEGER NOT NULL REFERENCES escalation_chains(id) ON DELETE CASCADE,
        level_order INTEGER NOT NULL,
        escalation_action TEXT,
        escalation_contact VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ escalation_chain_steps");

    // accountability_pattern_triggers
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_pattern_triggers (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        trigger_pattern TEXT,
        trigger_action TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_pattern_triggers");

    // accountability_legal_hooks
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_legal_hooks (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        statute_citation VARCHAR(255),
        legal_basis TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_legal_hooks");

    // accountability_sources
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accountability_sources (
        id SERIAL PRIMARY KEY,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        source_name VARCHAR(255),
        source_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ accountability_sources");

    // =========================================================================
    // F. FORMS AND AGENCY SEED LAYER (3 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Forms and Agency Seed Layer tables...");

    // agencies_registry
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agencies_registry (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        agency_name VARCHAR(255) NOT NULL,
        agency_type VARCHAR(100),
        agency_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ agencies_registry");

    // forms_registry
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS forms_registry (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER NOT NULL REFERENCES agencies_registry(id) ON DELETE CASCADE,
        form_name VARCHAR(255) NOT NULL,
        form_number VARCHAR(50),
        form_url VARCHAR(500),
        form_category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ forms_registry");

    // escalation_registry
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS escalation_registry (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        escalation_name VARCHAR(255) NOT NULL,
        escalation_description TEXT,
        escalation_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ escalation_registry");

    // =========================================================================
    // G. LEGAL BACKBONE (3 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Legal Backbone tables...");

    // legal_statutes
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS legal_statutes (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        statute_citation VARCHAR(255) NOT NULL,
        statute_title VARCHAR(500),
        statute_text TEXT,
        statute_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ legal_statutes");

    // statute_of_limitations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS statute_of_limitations (
        id SERIAL PRIMARY KEY,
        legal_statute_id INTEGER NOT NULL REFERENCES legal_statutes(id) ON DELETE CASCADE,
        claim_type VARCHAR(100),
        limitation_period_days INTEGER,
        limitation_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ statute_of_limitations");

    // legal_case_law
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS legal_case_law (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        case_citation VARCHAR(255) NOT NULL,
        case_name VARCHAR(500),
        case_summary TEXT,
        case_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ legal_case_law");

    // =========================================================================
    // H. MEANING LAYER (6 tables)
    // =========================================================================
    console.log("[SCHEMA] Creating Meaning Layer tables...");

    // signal_interpretations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS signal_interpretations (
        id SERIAL PRIMARY KEY,
        signal_type VARCHAR(100),
        interpretation_text TEXT,
        linked_workflows_count INTEGER DEFAULT 0,
        linked_accountability_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ signal_interpretations");

    // pattern_explanations
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pattern_explanations (
        id SERIAL PRIMARY KEY,
        pattern_type VARCHAR(100),
        explanation_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ pattern_explanations");

    // signal_statute_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS signal_statute_links (
        id SERIAL PRIMARY KEY,
        signal_interpretation_id INTEGER NOT NULL REFERENCES signal_interpretations(id) ON DELETE CASCADE,
        legal_statute_id INTEGER NOT NULL REFERENCES legal_statutes(id) ON DELETE CASCADE,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ signal_statute_links");

    // pattern_precedent_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pattern_precedent_links (
        id SERIAL PRIMARY KEY,
        pattern_explanation_id INTEGER NOT NULL REFERENCES pattern_explanations(id) ON DELETE CASCADE,
        legal_case_law_id INTEGER NOT NULL REFERENCES legal_case_law(id) ON DELETE CASCADE,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ pattern_precedent_links");

    // signal_workflow_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS signal_workflow_links (
        id SERIAL PRIMARY KEY,
        signal_interpretation_id INTEGER NOT NULL REFERENCES signal_interpretations(id) ON DELETE CASCADE,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ signal_workflow_links");

    // pattern_accountability_links
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pattern_accountability_links (
        id SERIAL PRIMARY KEY,
        pattern_explanation_id INTEGER NOT NULL REFERENCES pattern_explanations(id) ON DELETE CASCADE,
        accountability_path_id INTEGER NOT NULL REFERENCES accountability_paths(id) ON DELETE CASCADE,
        link_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ pattern_accountability_links");

    // =========================================================================
    // ADDITIONAL SUPPORT TABLES
    // =========================================================================
    console.log("[SCHEMA] Creating support tables...");

    // cross_cutting_deadlines
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_deadlines (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        deadline_type VARCHAR(100),
        deadline_description TEXT,
        deadline_days INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ cross_cutting_deadlines");

    // cross_cutting_geographic_qualifiers
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_geographic_qualifiers (
        id SERIAL PRIMARY KEY,
        jurisdiction_id INTEGER NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
        qualifier_type VARCHAR(100),
        qualifier_value VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ cross_cutting_geographic_qualifiers");

    // cross_cutting_population_qualifiers
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cross_cutting_population_qualifiers (
        id SERIAL PRIMARY KEY,
        qualifier_type VARCHAR(100),
        qualifier_value VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ cross_cutting_population_qualifiers");

    // extraction_versions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS extraction_versions (
        id SERIAL PRIMARY KEY,
        version_number VARCHAR(50) NOT NULL UNIQUE,
        extraction_date TIMESTAMP,
        record_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ extraction_versions");

    // item_provenance
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS item_provenance (
        id SERIAL PRIMARY KEY,
        item_type VARCHAR(100),
        item_id INTEGER,
        source_document VARCHAR(255),
        source_page INTEGER,
        extraction_version_id INTEGER REFERENCES extraction_versions(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ item_provenance");

    // system_integrity_log
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_integrity_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100),
        event_description TEXT,
        affected_table VARCHAR(100),
        affected_record_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("  ✓ system_integrity_log");

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    console.log("\n[VERIFY] Checking table creation...");

    const result = await db.execute(sql`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);

    const tableCount = (result as any)[0]?.table_count || 0;

    console.log(`\n✅ Schema initialization complete`);
    console.log(`   Tables created: ${tableCount}`);
    console.log(`   Connection: PostgreSQL (luminari_registry)`);
    console.log(`   Status: READY FOR CONTROLLED VOCABULARY SEEDING`);

    return {
      success: true,
      tables_created: tableCount,
      connection: "PostgreSQL (luminari_registry)",
      status: "READY FOR PHASE 2: CONTROLLED VOCABULARY SEEDING",
    };
  } catch (err: any) {
    console.error("❌ Error initializing schema:", err.message);
    console.error("Stack:", err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildLuminariCompleteSchema().then(() => {
    console.log("\n✅ Schema initialization complete. Exiting.");
    process.exit(0);
  });
}

export { buildLuminariCompleteSchema };
