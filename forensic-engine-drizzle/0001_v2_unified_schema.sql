-- LUMINARI V2.0 UNIFIED SCHEMA MIGRATION
-- PostgreSQL migration for forensic-engine
-- Adds V2.0 tables alongside existing forensic schema

-- ============================================================
-- PART 1: IMMUTABLE CONSTANTS REGISTRY
-- ============================================================

CREATE TABLE IF NOT EXISTS constants_registry (
  constant_id VARCHAR(50) PRIMARY KEY,
  constant_name VARCHAR(255) NOT NULL,
  constant_type VARCHAR(64) NOT NULL,
  domain_name VARCHAR(255) NOT NULL,
  jurisdiction VARCHAR(255),
  source_authority VARCHAR(255),
  source_citation TEXT,
  description TEXT NOT NULL,
  formal_expression TEXT,
  severity_if_violated VARCHAR(64) DEFAULT 'HIGH',
  framework_hash_sha256 CHAR(64) NOT NULL UNIQUE,
  modification_locked BOOLEAN DEFAULT true,
  version_tag VARCHAR(64) DEFAULT 'v1.0.0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  retired_at TIMESTAMP,
  retired_reason TEXT
);

CREATE INDEX idx_constants_domain ON constants_registry(domain_name);
CREATE INDEX idx_constants_type ON constants_registry(constant_type);
CREATE INDEX idx_constants_jurisdiction ON constants_registry(jurisdiction);

-- ============================================================
-- PART 2: VERSIONED PROBLEM INSTANCES
-- ============================================================

CREATE TABLE IF NOT EXISTS problem_instances (
  record_id VARCHAR(50) PRIMARY KEY,
  problem_uuid CHAR(36) NOT NULL UNIQUE,
  case_reference VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  problem_type VARCHAR(50) NOT NULL,
  scale_level VARCHAR(64) NOT NULL,
  current_version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  superseded_by_record_id VARCHAR(50),
  validation_status VARCHAR(64) DEFAULT 'OPEN',
  conflicts_detected BOOLEAN DEFAULT false,
  summary TEXT,
  jurisdiction VARCHAR(255),
  friction_coefficient NUMERIC(5,4),
  alignment_score NUMERIC(5,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL,
  FOREIGN KEY (problem_type) REFERENCES constants_registry(constant_id),
  FOREIGN KEY (superseded_by_record_id) REFERENCES problem_instances(record_id)
);

CREATE INDEX idx_problem_case_reference ON problem_instances(case_reference);
CREATE INDEX idx_problem_type ON problem_instances(problem_type);
CREATE INDEX idx_problem_scale ON problem_instances(scale_level);
CREATE INDEX idx_problem_status ON problem_instances(validation_status);
CREATE INDEX idx_problem_is_current ON problem_instances(is_current);
CREATE INDEX idx_problem_conflicts ON problem_instances(conflicts_detected);

-- ============================================================
-- PART 3: FINDINGS (Evidence-backed analysis)
-- ============================================================

CREATE TABLE IF NOT EXISTS findings (
  finding_id VARCHAR(50) PRIMARY KEY,
  problem_instance_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  finding_type VARCHAR(64) NOT NULL,
  severity VARCHAR(64) DEFAULT 'MEDIUM',
  status VARCHAR(64) DEFAULT 'DRAFT',
  evidence_count INTEGER DEFAULT 0,
  constant_support_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(record_id)
);

CREATE INDEX idx_findings_problem ON findings(problem_instance_id);
CREATE INDEX idx_findings_type ON findings(finding_type);
CREATE INDEX idx_findings_status ON findings(status);
CREATE INDEX idx_findings_severity ON findings(severity);

-- ============================================================
-- PART 4: EVIDENCE UNITS (Atomic evidence pieces)
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence_units (
  evidence_id VARCHAR(50) PRIMARY KEY,
  finding_id VARCHAR(50) NOT NULL,
  source_document_id INTEGER,
  source_quote_id INTEGER,
  evidence_text TEXT NOT NULL,
  evidence_type VARCHAR(64) NOT NULL,
  source_url TEXT,
  confidence NUMERIC(5,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finding_id) REFERENCES findings(finding_id)
);

CREATE INDEX idx_evidence_finding ON evidence_units(finding_id);
CREATE INDEX idx_evidence_type ON evidence_units(evidence_type);

-- ============================================================
-- PART 5: FINDING-EVIDENCE SUPPORT (Junction)
-- ============================================================

CREATE TABLE IF NOT EXISTS finding_evidence_support (
  id BIGSERIAL PRIMARY KEY,
  finding_id VARCHAR(50) NOT NULL,
  evidence_id VARCHAR(50) NOT NULL,
  support_strength NUMERIC(5,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finding_id) REFERENCES findings(finding_id),
  FOREIGN KEY (evidence_id) REFERENCES evidence_units(evidence_id)
);

CREATE INDEX idx_finding_evidence_finding ON finding_evidence_support(finding_id);
CREATE INDEX idx_finding_evidence_evidence ON finding_evidence_support(evidence_id);

-- ============================================================
-- PART 6: FINDING-CONSTANT SUPPORT (Junction)
-- ============================================================

CREATE TABLE IF NOT EXISTS finding_constant_support (
  id BIGSERIAL PRIMARY KEY,
  finding_id VARCHAR(50) NOT NULL,
  constant_id VARCHAR(50) NOT NULL,
  relevance NUMERIC(5,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finding_id) REFERENCES findings(finding_id),
  FOREIGN KEY (constant_id) REFERENCES constants_registry(constant_id)
);

CREATE INDEX idx_finding_constant_finding ON finding_constant_support(finding_id);
CREATE INDEX idx_finding_constant_constant ON finding_constant_support(constant_id);

-- ============================================================
-- PART 7: CONFLICTS DETECTED
-- ============================================================

CREATE TABLE IF NOT EXISTS conflicts_detected (
  conflict_id VARCHAR(50) PRIMARY KEY,
  problem_instance_id VARCHAR(50) NOT NULL,
  conflict_type VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(64) DEFAULT 'DETECTED',
  severity VARCHAR(64) DEFAULT 'MEDIUM',
  resolved_by VARCHAR(255),
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  resolved_at TIMESTAMP,
  FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(record_id)
);

CREATE INDEX idx_conflicts_problem ON conflicts_detected(problem_instance_id);
CREATE INDEX idx_conflicts_type ON conflicts_detected(conflict_type);
CREATE INDEX idx_conflicts_status ON conflicts_detected(status);

-- ============================================================
-- PART 8: AUDIT TRAIL
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_trail (
  audit_id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  action VARCHAR(64) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_trail(action);
CREATE INDEX idx_audit_timestamp ON audit_trail(changed_at);

-- ============================================================
-- PART 9: LEGAL STATUTES (Registry)
-- ============================================================

CREATE TABLE IF NOT EXISTS legal_statutes (
  statute_id VARCHAR(50) PRIMARY KEY,
  jurisdiction VARCHAR(255) NOT NULL,
  statute_code VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  full_text TEXT,
  effective_date TIMESTAMP,
  repealed BOOLEAN DEFAULT false,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(jurisdiction, statute_code)
);

CREATE INDEX idx_statute_jurisdiction ON legal_statutes(jurisdiction);
CREATE INDEX idx_statute_code ON legal_statutes(statute_code);

-- ============================================================
-- PART 10: WORKFLOW PIPELINE
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_pipeline (
  workflow_id VARCHAR(50) PRIMARY KEY,
  workflow_name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL,
  jurisdiction VARCHAR(255),
  steps JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workflow_category ON workflow_pipeline(category);
CREATE INDEX idx_workflow_jurisdiction ON workflow_pipeline(jurisdiction);

-- ============================================================
-- PART 11: DETECTED SIGNALS
-- ============================================================

CREATE TABLE IF NOT EXISTS detected_signals (
  signal_id VARCHAR(50) PRIMARY KEY,
  signal_type VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  jurisdiction VARCHAR(255),
  severity VARCHAR(64) DEFAULT 'MEDIUM',
  frequency INTEGER DEFAULT 1,
  last_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_signal_type ON detected_signals(signal_type);
CREATE INDEX idx_signal_jurisdiction ON detected_signals(jurisdiction);
CREATE INDEX idx_signal_severity ON detected_signals(severity);

-- ============================================================
-- PART 12: PROGRAMS (Civic Map Resources)
-- ============================================================

CREATE TABLE IF NOT EXISTS programs (
  program_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  subcategory VARCHAR(64),
  description TEXT,
  phone VARCHAR(20),
  url TEXT,
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(128),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  coverage VARCHAR(64),
  languages JSONB,
  hours TEXT,
  eligibility TEXT,
  cost VARCHAR(64),
  services JSONB,
  source_directory VARCHAR(255),
  source_url TEXT,
  last_verified TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_program_state ON programs(state);
CREATE INDEX idx_program_category ON programs(category);
CREATE INDEX idx_program_active ON programs(is_active);

-- ============================================================
-- PART 13: ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  org_id VARCHAR(50) PRIMARY KEY,
  org_name VARCHAR(255) NOT NULL,
  org_type VARCHAR(64) NOT NULL,
  jurisdiction VARCHAR(255),
  has_grounding BOOLEAN DEFAULT false,
  has_reach BOOLEAN DEFAULT false,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  onboarding_status VARCHAR(64) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_org_type ON organizations(org_type);
CREATE INDEX idx_org_jurisdiction ON organizations(jurisdiction);

-- ============================================================
-- PART 14: STAKEHOLDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS stakeholders (
  stakeholder_id VARCHAR(50) PRIMARY KEY,
  problem_instance_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(128) NOT NULL,
  organization VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(record_id)
);

CREATE INDEX idx_stakeholder_problem ON stakeholders(problem_instance_id);
CREATE INDEX idx_stakeholder_role ON stakeholders(role);

-- ============================================================
-- PART 15: DISTRIBUTION CHANNELS
-- ============================================================

CREATE TABLE IF NOT EXISTS distribution_channels (
  channel_id VARCHAR(50) PRIMARY KEY,
  channel_name VARCHAR(255) NOT NULL,
  channel_type VARCHAR(64) NOT NULL,
  description TEXT,
  endpoint TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_channel_type ON distribution_channels(channel_type);
CREATE INDEX idx_channel_active ON distribution_channels(is_active);

-- ============================================================
-- SEED CONSTANTS
-- ============================================================

INSERT INTO constants_registry (
  constant_id, constant_name, constant_type, domain_name, 
  description, framework_hash_sha256, created_by
) VALUES
  ('CONST_DENIAL', 'DENIAL', 'SYSTEMIC', 'problem_types', 
   'System says no - access blocked, request denied', 
   'hash_denial_v1', 'system'),
  ('CONST_ESCALATION', 'ESCALATION', 'SYSTEMIC', 'problem_types',
   'Issue gets worse automatically; system moves to higher stakes irreversibly',
   'hash_escalation_v1', 'system'),
  ('CONST_GAP', 'GAP', 'SYSTEMIC', 'problem_types',
   'No pathway exists; procedure missing; coordination failure',
   'hash_gap_v1', 'system'),
  ('CONST_CONTRADICTION', 'CONTRADICTION', 'SYSTEMIC', 'problem_types',
   'Two systems apply incompatible rules to the same fact',
   'hash_contradiction_v1', 'system'),
  ('CONST_SIGNAL', 'SIGNAL', 'SYSTEMIC', 'problem_types',
   'Observable indicator of systemic failure; visible pattern; early warning',
   'hash_signal_v1', 'system'),
  ('SCALE_MICRO', 'MICRO', 'MATHEMATICAL', 'geographic_scales',
   'Individual + City/County',
   'hash_micro_v1', 'system'),
  ('SCALE_MESO', 'MESO', 'MATHEMATICAL', 'geographic_scales',
   'State/Region',
   'hash_meso_v1', 'system'),
  ('SCALE_MACRO', 'MACRO', 'MATHEMATICAL', 'geographic_scales',
   'National/Federal',
   'hash_macro_v1', 'system'),
  ('SCALE_GLOBAL', 'GLOBAL', 'MATHEMATICAL', 'geographic_scales',
   'International/Comparative',
   'hash_global_v1', 'system')
ON CONFLICT DO NOTHING;
