
-- Create type-specific staging tables for each promotable source

-- PROGRAMS staging
CREATE TABLE IF NOT EXISTS registry_entity_staging_programs (
  id BIGSERIAL PRIMARY KEY,
  extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  resource_type TEXT,
  service_categories TEXT[],
  eligibility_summary TEXT,
  operational_status JSONB,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  contact_methods TEXT[],
  is_valid_entity BOOLEAN DEFAULT FALSE,
  has_contact_surface BOOLEAN DEFAULT FALSE,
  promotion_ready BOOLEAN DEFAULT FALSE,
  validation_notes TEXT[],
  confidence_scores JSONB,
  geocoding_hints JSONB,
  forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staged_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  promoted_at TIMESTAMP WITH TIME ZONE
);

-- NONPROFITS staging
CREATE TABLE IF NOT EXISTS registry_entity_staging_nonprofits (
  id BIGSERIAL PRIMARY KEY,
  extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  resource_type TEXT,
  service_categories TEXT[],
  eligibility_summary TEXT,
  operational_status JSONB,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  contact_methods TEXT[],
  is_valid_entity BOOLEAN DEFAULT FALSE,
  has_contact_surface BOOLEAN DEFAULT FALSE,
  promotion_ready BOOLEAN DEFAULT FALSE,
  validation_notes TEXT[],
  confidence_scores JSONB,
  geocoding_hints JSONB,
  forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staged_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  promoted_at TIMESTAMP WITH TIME ZONE
);

-- BENEFITS staging
CREATE TABLE IF NOT EXISTS registry_entity_staging_benefits (
  id BIGSERIAL PRIMARY KEY,
  extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  resource_type TEXT,
  service_categories TEXT[],
  eligibility_summary TEXT,
  operational_status JSONB,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  contact_methods TEXT[],
  is_valid_entity BOOLEAN DEFAULT FALSE,
  has_contact_surface BOOLEAN DEFAULT FALSE,
  promotion_ready BOOLEAN DEFAULT FALSE,
  validation_notes TEXT[],
  confidence_scores JSONB,
  geocoding_hints JSONB,
  forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staged_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  promoted_at TIMESTAMP WITH TIME ZONE
);

-- CONTACTS staging
CREATE TABLE IF NOT EXISTS registry_entity_staging_contacts (
  id BIGSERIAL PRIMARY KEY,
  extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  resource_type TEXT,
  service_categories TEXT[],
  eligibility_summary TEXT,
  operational_status JSONB,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  contact_methods TEXT[],
  is_valid_entity BOOLEAN DEFAULT FALSE,
  has_contact_surface BOOLEAN DEFAULT FALSE,
  promotion_ready BOOLEAN DEFAULT FALSE,
  validation_notes TEXT[],
  confidence_scores JSONB,
  geocoding_hints JSONB,
  forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staged_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  promoted_at TIMESTAMP WITH TIME ZONE
);

-- KNOWLEDGE staging
CREATE TABLE IF NOT EXISTS registry_entity_staging_knowledge (
  id BIGSERIAL PRIMARY KEY,
  extraction_id BIGINT REFERENCES registry_entity_extraction_v4(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  resource_type TEXT,
  service_categories TEXT[],
  eligibility_summary TEXT,
  operational_status JSONB,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  contact_methods TEXT[],
  is_valid_entity BOOLEAN DEFAULT FALSE,
  has_contact_surface BOOLEAN DEFAULT FALSE,
  promotion_ready BOOLEAN DEFAULT FALSE,
  validation_notes TEXT[],
  confidence_scores JSONB,
  geocoding_hints JSONB,
  forensic_provenance JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  staged_at TIMESTAMP WITH TIME ZONE,
  validated_at TIMESTAMP WITH TIME ZONE,
  promoted_at TIMESTAMP WITH TIME ZONE
);

-- Now POPULATE each type-specific table from extraction_v4

-- PROGRAMS: 2,434
INSERT INTO registry_entity_staging_programs (extraction_id, program_id, organization_name, resource_type, confidence_scores, geocoding_hints, forensic_provenance, staged_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), (promotion_ready->>'resource_type'), confidence_scores, geocoding_hints, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 
WHERE source_file = 'registry_programs'
ON CONFLICT DO NOTHING;

-- NONPROFITS: 2,062
INSERT INTO registry_entity_staging_nonprofits (extraction_id, program_id, organization_name, resource_type, confidence_scores, geocoding_hints, forensic_provenance, staged_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), (promotion_ready->>'resource_type'), confidence_scores, geocoding_hints, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 
WHERE source_file = 'nonprofit_registry'
ON CONFLICT DO NOTHING;

-- BENEFITS: 516
INSERT INTO registry_entity_staging_benefits (extraction_id, program_id, organization_name, resource_type, confidence_scores, geocoding_hints, forensic_provenance, staged_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), (promotion_ready->>'resource_type'), confidence_scores, geocoding_hints, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 
WHERE source_file = 'government_benefits_registry'
ON CONFLICT DO NOTHING;

-- CONTACTS: 2,125
INSERT INTO registry_entity_staging_contacts (extraction_id, program_id, organization_name, resource_type, confidence_scores, geocoding_hints, forensic_provenance, staged_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), (promotion_ready->>'resource_type'), confidence_scores, geocoding_hints, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 
WHERE source_file = 'registry_contacts'
ON CONFLICT DO NOTHING;

-- KNOWLEDGE: 2,416
INSERT INTO registry_entity_staging_knowledge (extraction_id, program_id, organization_name, resource_type, confidence_scores, geocoding_hints, forensic_provenance, staged_at)
SELECT id, program_id, (promotion_ready->>'organization_name'), (promotion_ready->>'resource_type'), confidence_scores, geocoding_hints, forensic_provenance, NOW()
FROM registry_entity_extraction_v4 
WHERE source_file = 'knowledge_entries'
ON CONFLICT DO NOTHING;

-- CREATE INDEXES for fast lookups
CREATE INDEX IF NOT EXISTS idx_staging_programs_promotion_ready ON registry_entity_staging_programs(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_nonprofits_promotion_ready ON registry_entity_staging_nonprofits(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_benefits_promotion_ready ON registry_entity_staging_benefits(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_contacts_promotion_ready ON registry_entity_staging_contacts(promotion_ready);
CREATE INDEX IF NOT EXISTS idx_staging_knowledge_promotion_ready ON registry_entity_staging_knowledge(promotion_ready);
