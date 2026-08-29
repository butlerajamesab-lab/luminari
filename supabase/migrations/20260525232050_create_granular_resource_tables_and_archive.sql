
-- ARCHIVE VAULT: Raw material (immutable, untamperable)
CREATE TABLE IF NOT EXISTS raw_material_archive (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  raw_content JSONB NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archive_hash TEXT NOT NULL,
  UNIQUE(source_table, source_id)
);

-- Archive raw_table_cells
INSERT INTO raw_material_archive (source_table, source_id, raw_content, archive_hash)
SELECT 'raw_table_cells', id::text, json_build_object('id', id, 'cell_text', cell_text, 'table_id', table_id, 'registry_id', registry_id, 'row_index', row_index, 'column_index', column_index), 
  substring(md5(id::text || cell_text), 1, 32)
FROM raw_table_cells
ON CONFLICT DO NOTHING;

-- Archive field_dictionary
INSERT INTO raw_material_archive (source_table, source_id, raw_content, archive_hash)
SELECT 'field_dictionary', id::text, json_build_object('id', id, 'field_name', field_name), 
  substring(md5(id::text || field_name), 1, 32)
FROM field_dictionary
ON CONFLICT DO NOTHING;

-- GRANULAR RESOURCE TYPE STAGING TABLES (UI-ready)
CREATE TABLE IF NOT EXISTS registry_entity_staging_food_banks (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_shelters (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_healthcare (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_legal_aid (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_cash_assistance (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_utilities (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_childcare (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_employment (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS registry_entity_staging_mental_health (
  id BIGSERIAL PRIMARY KEY, extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, organization_name TEXT NOT NULL, service_categories TEXT[], phone TEXT, email TEXT, website_url TEXT,
  is_valid_entity BOOLEAN DEFAULT FALSE, promotion_ready BOOLEAN DEFAULT FALSE, confidence_scores JSONB, forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), validated_at TIMESTAMP WITH TIME ZONE, promoted_at TIMESTAMP WITH TIME ZONE
);

-- Populate granular tables by resource_type inference
INSERT INTO registry_entity_staging_food_banks (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('food_bank', 'food_pantry') OR source_file = 'registry_programs' AND name ILIKE '%food%'
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_shelters (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('shelter', 'homeless') OR source_file = 'registry_programs' AND name ILIKE '%shelter%'
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_healthcare (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('healthcare', 'hospital', 'clinic', 'fqhc') OR source_file = 'registry_programs' AND (name ILIKE '%health%' OR name ILIKE '%clinic%')
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_legal_aid (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('legal_aid', 'legal') OR source_file IN ('legal_statutes', 'legal_case_law', 'legal_enforcement_records')
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_cash_assistance (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('benefits_program', 'cash_assistance') OR name ILIKE '%cash%' OR name ILIKE '%tanf%'
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_utilities (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('utilities', 'liheap') OR name ILIKE '%utility%' OR name ILIKE '%liheap%'
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_employment (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('employment', 'workforce') OR name ILIKE '%job%' OR name ILIKE '%employment%'
ON CONFLICT DO NOTHING;

INSERT INTO registry_entity_staging_mental_health (extraction_id, program_id, organization_name, confidence_scores, forensic_provenance, created_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), confidence_scores, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 WHERE (promotion_ready->>'resource_type') IN ('mental_health', 'behavioral_health') OR name ILIKE '%mental%' OR name ILIKE '%behavioral%'
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_archive_source ON raw_material_archive(source_table);
CREATE INDEX IF NOT EXISTS idx_staging_food_banks_promotion ON registry_entity_staging_food_banks(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_shelters_promotion ON registry_entity_staging_shelters(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_healthcare_promotion ON registry_entity_staging_healthcare(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_legal_promotion ON registry_entity_staging_legal_aid(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_cash_promotion ON registry_entity_staging_cash_assistance(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_utilities_promotion ON registry_entity_staging_utilities(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_employment_promotion ON registry_entity_staging_employment(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_mental_health_promotion ON registry_entity_staging_mental_health(promotion_ready);

