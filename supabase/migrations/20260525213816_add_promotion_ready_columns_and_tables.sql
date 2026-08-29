
-- ADD PROMOTION-READY COLUMNS TO EXISTING staging_v1
ALTER TABLE registry_entity_staging_v1
ADD COLUMN IF NOT EXISTS extraction_id BIGINT,
ADD COLUMN IF NOT EXISTS program_id TEXT,
ADD COLUMN IF NOT EXISTS organization_name TEXT,
ADD COLUMN IF NOT EXISTS resource_type TEXT,
ADD COLUMN IF NOT EXISTS service_categories TEXT[],
ADD COLUMN IF NOT EXISTS eligibility_summary TEXT,
ADD COLUMN IF NOT EXISTS operational_status JSONB,
ADD COLUMN IF NOT EXISTS contact_methods TEXT[],
ADD COLUMN IF NOT EXISTS is_valid_entity BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_contact_surface BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_coordinates BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS needs_geocode BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS promotion_ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS validation_notes TEXT[],
ADD COLUMN IF NOT EXISTS possible_duplicate_of BIGINT[],
ADD COLUMN IF NOT EXISTS merged_into BIGINT,
ADD COLUMN IF NOT EXISTS confidence_scores JSONB,
ADD COLUMN IF NOT EXISTS geocoding_hints JSONB,
ADD COLUMN IF NOT EXISTS geocoding_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS forensic_provenance JSONB,
ADD COLUMN IF NOT EXISTS staged_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP WITH TIME ZONE;

-- CREATE REGISTRY_ENTITY_EXTRACTION_V4
CREATE TABLE IF NOT EXISTS registry_entity_extraction_v4 (
  id BIGSERIAL PRIMARY KEY,
  source_file TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  extraction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  extraction_version TEXT NOT NULL DEFAULT 'v4',
  program_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  promotion_ready JSONB NOT NULL,
  forensic_provenance JSONB NOT NULL,
  forensic_hash TEXT NOT NULL,
  confidence_scores JSONB NOT NULL,
  geocoding_hints JSONB NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE PROMOTION_VALIDATION_RULES
CREATE TABLE IF NOT EXISTS promotion_validation_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  rule_version TEXT DEFAULT 'v1',
  description TEXT,
  rule_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  rule_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE PROMOTION_VALIDATION_LOG
CREATE TABLE IF NOT EXISTS promotion_validation_log (
  id BIGSERIAL PRIMARY KEY,
  staging_id BIGINT NOT NULL REFERENCES registry_entity_staging_v1(id) ON DELETE CASCADE,
  program_id TEXT,
  rule_id BIGINT REFERENCES promotion_validation_rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  passed BOOLEAN NOT NULL,
  confidence_score FLOAT,
  validation_message TEXT,
  validation_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE PROMOTION_ACCOUNTING
CREATE TABLE IF NOT EXISTS promotion_accounting (
  id BIGSERIAL PRIMARY KEY,
  jurisdiction TEXT NOT NULL,
  source_file TEXT NOT NULL,
  extraction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  extracted_count INT DEFAULT 0,
  staged_count INT DEFAULT 0,
  validation_passed_count INT DEFAULT 0,
  validation_failed_count INT DEFAULT 0,
  promotion_ready_count INT DEFAULT 0,
  promoted_count INT DEFAULT 0,
  geocoded_count INT DEFAULT 0,
  count_by_resource_type JSONB,
  count_by_service_category JSONB,
  accounting_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INSERT CANONICAL PROMOTION VALIDATION RULES
INSERT INTO promotion_validation_rules (rule_name, rule_type, rule_config, description) VALUES
('organization_name_required', 'required_field', '{"field": "organization_name", "min_length": 2, "required": true}'::jsonb, 'Organization name must exist and be at least 2 chars'),
('contact_surface_required', 'contact_surface', '{"requires_at_least_one": ["phone", "email", "website_url"]}'::jsonb, 'Entity must have at least one contact method'),
('resource_type_inferred', 'resource_type', '{"allow_fallback_to": "organization", "confidence_threshold": 0.5}'::jsonb, 'Resource type must be inferred or provided'),
('confidence_threshold', 'confidence', '{"min_overall_confidence": 0.6}'::jsonb, 'Overall confidence score must be >= 0.6'),
('no_coordinate_requirement', 'required_field', '{"field": "coordinates", "required": false, "note": "Geocoding is enrichment, not blocking"}'::jsonb, 'Coordinates are NOT required for promotion')
ON CONFLICT (rule_name) DO NOTHING;

-- CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_extraction_v4_jurisdiction ON registry_entity_extraction_v4(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_extraction_v4_program_id ON registry_entity_extraction_v4(program_id);
CREATE INDEX IF NOT EXISTS idx_extraction_v4_created_at ON registry_entity_extraction_v4(created_at);
CREATE INDEX IF NOT EXISTS idx_staging_promotion_ready ON registry_entity_staging_v1(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_resource_type ON registry_entity_staging_v1(resource_type);
CREATE INDEX IF NOT EXISTS idx_staging_has_contact_surface ON registry_entity_staging_v1(has_contact_surface);
CREATE INDEX IF NOT EXISTS idx_validation_log_staging_id ON promotion_validation_log(staging_id);
CREATE INDEX IF NOT EXISTS idx_validation_log_passed ON promotion_validation_log(passed);
CREATE INDEX IF NOT EXISTS idx_accounting_jurisdiction ON promotion_accounting(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_accounting_source_file ON promotion_accounting(source_file);
