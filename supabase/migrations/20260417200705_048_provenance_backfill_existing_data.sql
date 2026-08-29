
-- ============================================================
-- MIGRATION 048: BACKFILL PROVENANCE FOR ALL EXISTING DATA
-- Every row already in the database gets a provenance record.
-- Source, layer, family, status all set based on known migration history.
-- engine_id and ui_surface left NULL — assigned when full registry loaded.
-- ============================================================

-- PROGRAMS (L3 Knowledge — seeded migrations 008-012)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
SELECT
  CASE
    WHEN state_code = 'WA' THEN 'luminari-wa-knowledge-backbone.docx'
    WHEN state_code IN ('AL','TN','SC') THEN 'seed_migration_010'
    WHEN state_code IN ('NC','MD','AR') THEN 'seed_migration_011'
    WHEN state_code IN ('MS','LA','CT') THEN 'seed_migration_012'
    WHEN is_national = true THEN 'system_seed'
    ELSE 'seed_migration'
  END,
  CASE
    WHEN state_code = 'WA' THEN '008_seed_wa_programs'
    WHEN state_code IN ('AL','TN','SC') THEN '010_seed_state_programs_al_tn_sc'
    WHEN state_code IN ('NC','MD','AR') THEN '011_seed_state_programs_nc_md_ar'
    WHEN state_code IN ('MS','LA','CT') THEN '012_seed_state_programs_ms_la_ct'
    ELSE 'seed_migration'
  END,
  'claude_migration',
  'L3', 'Knowledge Backbone', 'programs', 'verified', 'claude',
  'Seeded from state registry research documents in rebuild session 2026-04-17'
FROM programs;

UPDATE programs p
SET provenance_id = prov.id
FROM provenance prov
WHERE prov.table_name = 'programs'
  AND p.provenance_id IS NULL;

-- TRIBAL JURISDICTIONS (L3 — migrations 009, 013)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'luminari-wa-knowledge-backbone.docx + multi-state tribal data',
  '009_seed_wa_tribes + 013_seed_tribal_nations_10_states',
  'claude_migration', 'L3', 'Knowledge Backbone', 'tribal_jurisdictions',
  'verified', 'claude', '39 tribal jurisdictions across WA and 10 additional states'
);

UPDATE tribal_jurisdictions
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'tribal_jurisdictions' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- ENGINE REGISTRY V3 (L0-L11 — migrations 017-018)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_1_ENGINE_INVENTORY.md + LUMINARI-PLATFORM-EXTRACTION.json',
  '017_engine_registry_v3_corrected + 018_seed_engine_registry_v3',
  'manus_extraction', 'CROSS-CUTTING', 'Engine Registry', 'engine_registry_v3',
  'partial', 'claude', '69 of 359 canonical engines. Full INSERT block in Manus conversation 12971568'
);

UPDATE engine_registry_v3
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'engine_registry_v3' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- CLAIM ELEMENTS MATRIX (L5 — migration 033-034)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_3_CODE_MANIFEST.ts + claim element research',
  '033_knowledge_base_claim_elements + 034_seed_claim_elements_and_statutes',
  'claude_migration', 'L5', 'Evidence', 'claim_elements_matrix',
  'verified', 'claude', '28 elements across 9 claim types'
);

UPDATE claim_elements_matrix
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'claim_elements_matrix' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- CLAIM TYPE METADATA (L5 — migration 034)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_3_CODE_MANIFEST.ts',
  '034_seed_claim_elements_and_statutes',
  'claude_migration', 'L5', 'Evidence', 'claim_type_metadata',
  'verified', 'claude', '9 claim types with win probability and timeline data'
);

UPDATE claim_type_metadata
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'claim_type_metadata' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- STATUTES REGISTRY (L3 — migration 034)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_2_SQL_MANIFEST.sql',
  '034_seed_claim_elements_and_statutes',
  'claude_migration', 'L3', 'Knowledge Backbone', 'statutes_registry',
  'partial', 'claude', '14 federal statutes. Missing state statutes and full text summaries.'
);

UPDATE statutes_registry
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'statutes_registry' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- DAMAGES MATRIX (L8 — migration 029)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_2_SQL_MANIFEST.ts',
  '029_seed_damages_matrix_and_settlement_formulas',
  'claude_migration', 'L8', 'Remedy', 'damages_matrix',
  'verified', 'claude', '24 entries federal baseline. State multipliers pending.'
);

UPDATE damages_matrix
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'damages_matrix' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- WORKFLOWS (L8 — migration 031)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_2_SQL_MANIFEST.ts',
  '031_seed_remedy_template_and_workflows',
  'claude_migration', 'L8', 'Procedural', 'workflows',
  'verified', 'claude', '8 federal workflows. 73 more needed.'
);

UPDATE workflows
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'workflows' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- FILING TEMPLATES (L8 — migration 035)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_2_SQL_MANIFEST.ts',
  '035_seed_filing_templates_and_coalition',
  'claude_migration', 'L8', 'Procedural', 'filing_templates_registry',
  'verified', 'claude', '5 federal filing templates. 15 more needed.'
);

UPDATE filing_templates_registry
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'filing_templates_registry' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- ADVOCACY ORGANIZATIONS (L10 — migration 022)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'luminari-advocacy-coalition-network.json',
  '022_seed_advocacy_orgs',
  'manus_extraction', 'L10', 'Oversight', 'advocacy_organizations',
  'verified', 'claude', '46 orgs across 13 policy domains'
);

UPDATE advocacy_organizations
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'advocacy_organizations' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- LEGISLATOR CONTACTS (L10 — migration 023)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'luminari-advocacy-coalition-network.json',
  '023_seed_legislators_agencies_coalitions',
  'manus_extraction', 'L10', 'Oversight', 'legislator_contacts',
  'partial', 'claude', '28 legislators. Party filled. Contact form URLs pending team research.'
);

UPDATE legislator_contacts
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'legislator_contacts' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- COALITION AGENCIES (L10 — migration 023)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'luminari-advocacy-coalition-network.json',
  '023_seed_legislators_agencies_coalitions',
  'manus_extraction', 'L10', 'Oversight', 'coalition_agencies',
  'verified', 'claude', '29 coalition agencies'
);

UPDATE coalition_agencies
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'coalition_agencies' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- COALITION NETWORKS (L10 — migration 023)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'luminari-advocacy-coalition-network.json',
  '023_seed_legislators_agencies_coalitions',
  'manus_extraction', 'L10', 'Oversight', 'coalition_networks',
  'verified', 'claude', '10 coalition networks'
);

UPDATE coalition_networks
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'coalition_networks' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- SERVICES REGISTRY (L11 — migration 038)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_1_ENGINE_INVENTORY.md',
  '038_skill_md_canonical_architecture',
  'manus_extraction', 'L11', 'Control Plane', 'services_registry',
  'verified', 'claude', '34 services from SKILL.md canonical architecture'
);

UPDATE services_registry
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'services_registry' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- WORKERS REGISTRY (L11 — migration 038)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'SKILL.md',
  '038_skill_md_canonical_architecture',
  'manus_extraction', 'L11', 'Control Plane', 'workers_registry',
  'verified', 'claude', '18 workers from SKILL.md canonical architecture'
);

UPDATE workers_registry
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'workers_registry' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- ARCHITECTURE GAPS LOG (CROSS-CUTTING — migrations 039-041)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'SKILL.md + Luminari_Registry_Gap_Analysis_1.md + LUMINARI_REGISTRY_TABLE_MAPPING_INTEGRITY_AUDIT.md',
  '039_seed_foundation_engines_and_gaps + 041_update_gaps_log_with_new_findings',
  'claude_migration', 'CROSS-CUTTING', 'Governance', 'architecture_gaps_log',
  'verified', 'claude', '23 open gaps across code, data, schema, and wiring categories'
);

UPDATE architecture_gaps_log
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'architecture_gaps_log' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- KNOWLEDGE DOCUMENTS (CROSS-CUTTING — migrations 027, 040)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'Multiple uploaded files',
  '027_seed_knowledge_docs_and_sunam_protocol + 040_store_new_knowledge_and_audit_docs',
  'claude_migration', 'CROSS-CUTTING', 'Knowledge', 'knowledge_documents',
  'verified', 'claude', '19 knowledge documents cataloging uploaded files, audits, and specs'
);

UPDATE knowledge_documents
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'knowledge_documents' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- LAYER REF (CROSS-CUTTING — migration 038)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'SKILL.md',
  '038_skill_md_canonical_architecture',
  'system_seed', 'CROSS-CUTTING', 'Reference', 'layer_ref',
  'verified', 'claude', '12 canonical layers L0-L11 from SKILL.md'
);

UPDATE layer_ref
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'layer_ref' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- SETTLEMENT CALCULATIONS (L8 — migration 029)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_2_SQL_MANIFEST.ts',
  '029_seed_damages_matrix_and_settlement_formulas',
  'claude_migration', 'L8', 'Remedy', 'settlement_calculations',
  'verified', 'claude', '8 settlement formula seeds'
);

UPDATE settlement_calculations
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'settlement_calculations' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- SCHEMA TABLE REGISTRY (CROSS-CUTTING — migration 032)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'ARTIFACT_1_ENGINE_INVENTORY.md + schema__4_.ts',
  '032_engine_inventory_full_107_and_schema_366',
  'manus_extraction', 'CROSS-CUTTING', 'Registry', 'schema_table_registry',
  'verified', 'claude', '292 tables mapped from Manus drizzle/schema.ts'
);

UPDATE schema_table_registry
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'schema_table_registry' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

-- SUNAM CONTROL PROTOCOL (L11 — migration 027)
INSERT INTO provenance (source_file, source_migration, populated_by, layer, family, table_name, status, verified_by, notes)
VALUES (
  'SKILL.md + Sunam architecture docs',
  '027_seed_knowledge_docs_and_sunam_protocol',
  'manus_extraction', 'L11', 'Control Plane', 'sunam_control_protocol',
  'verified', 'claude', '25 Sunam control protocol rules'
);

UPDATE sunam_control_protocol
SET provenance_id = (SELECT id FROM provenance WHERE table_name = 'sunam_control_protocol' ORDER BY id DESC LIMIT 1)
WHERE provenance_id IS NULL;

