-- Migration: Create 14 missing Knowledge Backbone tables
-- These tables are referenced by service code but were never migrated

-- 1. evidence_confidence_rules
CREATE TABLE IF NOT EXISTS evidence_confidence_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_type VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  domain VARCHAR(80) NOT NULL,
  required_evidence JSON NOT NULL COMMENT 'Array of evidence type strings that are required',
  supporting_evidence JSON NOT NULL COMMENT 'Array of helpful but not required evidence types',
  alternative_evidence JSON NOT NULL COMMENT 'Array of alternatives if required evidence is missing',
  evidence_weights JSON NOT NULL COMMENT 'Object mapping evidence type -> numeric weight (0-30)',
  minimum_confidence INT NOT NULL DEFAULT 50 COMMENT 'Minimum score to proceed',
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- 2. claim_validation_rules
CREATE TABLE IF NOT EXISTS claim_validation_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_type VARCHAR(120) NOT NULL,
  legal_element VARCHAR(200) NOT NULL,
  element_description TEXT,
  element_order INT NOT NULL DEFAULT 1,
  required_evidence JSON NOT NULL COMMENT 'Array of evidence types that satisfy this element',
  failure_message TEXT COMMENT 'Message shown when element is not satisfied',
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_claim_type (claim_type),
  INDEX idx_element_order (claim_type, element_order)
);

-- 3. remedy_feasibility_rules
CREATE TABLE IF NOT EXISTS remedy_feasibility_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  strategy_type VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  domain VARCHAR(80) NOT NULL,
  minimum_evidence_confidence INT NOT NULL DEFAULT 50,
  estimated_cost INT NOT NULL DEFAULT 0 COMMENT 'Estimated cost in USD',
  cost_range_low INT NOT NULL DEFAULT 0,
  cost_range_high INT NOT NULL DEFAULT 0,
  time_requirement_days INT NOT NULL DEFAULT 90,
  time_range_low INT NOT NULL DEFAULT 0,
  time_range_high INT NOT NULL DEFAULT 0,
  filing_fee INT NOT NULL DEFAULT 0,
  attorney_required TINYINT(1) NOT NULL DEFAULT 0,
  pro_se_possible TINYINT(1) NOT NULL DEFAULT 1,
  service_required VARCHAR(80) DEFAULT 'none',
  complexity_level ENUM('low','medium','high','very_high') NOT NULL DEFAULT 'medium',
  success_rate_estimate VARCHAR(40) DEFAULT 'medium',
  prerequisites JSON COMMENT 'Array of prerequisite strings',
  risk_flags JSON COMMENT 'Array of risk flag strings',
  alternative_path VARCHAR(120) COMMENT 'Fallback strategy_type if this one is not viable',
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT 0
);

-- 4. procedural_paths
CREATE TABLE IF NOT EXISTS procedural_paths (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_type VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(80) NOT NULL,
  step_number INT NOT NULL,
  step_name VARCHAR(200) NOT NULL,
  step_description TEXT,
  required_documents JSON COMMENT 'Array of document names',
  estimated_duration_days INT NOT NULL DEFAULT 0,
  responsible_agency VARCHAR(200),
  next_step VARCHAR(200),
  alternative_step VARCHAR(200),
  filing_fee INT NOT NULL DEFAULT 0,
  deadline_days INT,
  form_number VARCHAR(80),
  online_portal VARCHAR(500),
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_claim_jurisdiction (claim_type, jurisdiction),
  INDEX idx_step_order (claim_type, jurisdiction, step_number)
);

-- 5. coalition_legislators
CREATE TABLE IF NOT EXISTS coalition_legislators (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  title VARCHAR(200),
  chamber VARCHAR(80),
  state VARCHAR(4),
  district VARCHAR(80),
  party VARCHAR(80),
  jurisdiction_level ENUM('federal','state','local') NOT NULL DEFAULT 'state',
  committees JSON COMMENT 'Array of committee names',
  issue_alignment JSON COMMENT 'Array of issue domain strings',
  contact_office VARCHAR(200),
  contact_phone VARCHAR(40),
  contact_email VARCHAR(200),
  website VARCHAR(500),
  social_media JSON COMMENT 'Object with platform->handle',
  voting_record_url VARCHAR(500),
  influence_score INT NOT NULL DEFAULT 50,
  accessibility_score INT NOT NULL DEFAULT 50,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_state (state),
  INDEX idx_jurisdiction_level (jurisdiction_level),
  INDEX idx_influence (influence_score)
);

-- 6. coalition_agencies
CREATE TABLE IF NOT EXISTS coalition_agencies (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  acronym VARCHAR(20),
  agency_type VARCHAR(80),
  jurisdiction_level ENUM('federal','state','local') NOT NULL DEFAULT 'state',
  state VARCHAR(4),
  parent_agency VARCHAR(200),
  domains JSON COMMENT 'Array of domain strings',
  enforcement_powers JSON COMMENT 'Array of enforcement power descriptions',
  complaint_url VARCHAR(500),
  contact_phone VARCHAR(40),
  contact_email VARCHAR(200),
  website VARCHAR(500),
  address TEXT,
  filing_methods JSON COMMENT 'Array: online, mail, in-person, fax',
  response_time_days INT,
  effectiveness_score INT NOT NULL DEFAULT 50,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_state (state),
  INDEX idx_effectiveness (effectiveness_score)
);

-- 7. coalition_advocacy_orgs
CREATE TABLE IF NOT EXISTS coalition_advocacy_orgs (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  org_type VARCHAR(80),
  jurisdiction VARCHAR(80),
  state VARCHAR(4),
  domains JSON COMMENT 'Array of domain strings',
  services_offered JSON COMMENT 'Array of service descriptions',
  contact_email VARCHAR(200),
  contact_phone VARCHAR(40),
  website VARCHAR(500),
  address TEXT,
  description TEXT,
  eligibility_criteria TEXT,
  languages JSON COMMENT 'Array of language codes',
  intake_url VARCHAR(500),
  coalition_willingness ENUM('high','medium','low','unknown') NOT NULL DEFAULT 'unknown',
  influence_score INT NOT NULL DEFAULT 50,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_state (state),
  INDEX idx_jurisdiction (jurisdiction)
);

-- 8. coalition_media
CREATE TABLE IF NOT EXISTS coalition_media (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  outlet VARCHAR(200),
  media_type ENUM('newspaper','tv','radio','online','podcast','newsletter','other') NOT NULL DEFAULT 'online',
  beat JSON COMMENT 'Array of beat topics',
  jurisdiction VARCHAR(80),
  state VARCHAR(4),
  contact_email VARCHAR(200),
  contact_phone VARCHAR(40),
  social_media JSON COMMENT 'Object with platform->handle',
  website VARCHAR(500),
  reach_score INT NOT NULL DEFAULT 50,
  responsiveness_score INT NOT NULL DEFAULT 50,
  previous_coverage JSON COMMENT 'Array of previous coverage objects',
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_state (state),
  INDEX idx_reach (reach_score)
);

-- 9. reform_packages
CREATE TABLE IF NOT EXISTS reform_packages (
  package_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pattern_id VARCHAR(80),
  title VARCHAR(300) NOT NULL,
  status ENUM('draft','review','published','archived') NOT NULL DEFAULT 'draft',
  executive_summary MEDIUMTEXT,
  evidence_section MEDIUMTEXT,
  root_cause_section MEDIUMTEXT,
  intervention_history_section MEDIUMTEXT,
  recommended_reforms_section MEDIUMTEXT,
  implementation_roadmap_section MEDIUMTEXT,
  supporting_data_section MEDIUMTEXT,
  jurisdiction VARCHAR(80),
  reform_type VARCHAR(80),
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_pattern_id (pattern_id),
  INDEX idx_status (status)
);

-- 10. advocacy_targets
CREATE TABLE IF NOT EXISTS advocacy_targets (
  target_id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  organization VARCHAR(200),
  role VARCHAR(200),
  jurisdiction VARCHAR(80),
  issue_domains JSON COMMENT 'Array of issue domain strings',
  influence_score INT NOT NULL DEFAULT 50,
  public_visibility_score INT NOT NULL DEFAULT 50,
  contact_email VARCHAR(200),
  contact_phone VARCHAR(40),
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_jurisdiction (jurisdiction),
  INDEX idx_influence (influence_score)
);

-- 11. campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  pattern_id VARCHAR(80),
  reform_package_id VARCHAR(80),
  jurisdiction VARCHAR(80),
  description TEXT,
  impact_index INT NOT NULL DEFAULT 0,
  status ENUM('planning','active','paused','completed','policy_change','archived') NOT NULL DEFAULT 'planning',
  current_stage INT NOT NULL DEFAULT 1,
  stage_history JSON COMMENT 'Array of stage transition objects',
  started_at BIGINT,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_status (status),
  INDEX idx_jurisdiction (jurisdiction),
  INDEX idx_pattern_id (pattern_id)
);

-- 12. reform_package_versions
CREATE TABLE IF NOT EXISTS reform_package_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id VARCHAR(80) NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  package_data MEDIUMTEXT COMMENT 'JSON snapshot of reform package at this version',
  change_summary TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  created_by VARCHAR(80),
  INDEX idx_package_id (package_id),
  INDEX idx_version (package_id, version_number)
);

-- 13. strategy_memory
CREATE TABLE IF NOT EXISTS strategy_memory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memory_id VARCHAR(80) NOT NULL UNIQUE,
  pattern_type VARCHAR(120),
  jurisdiction VARCHAR(80),
  intervention_type VARCHAR(120),
  success_score INT NOT NULL DEFAULT 0,
  confidence_score INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_pattern_type (pattern_type),
  INDEX idx_jurisdiction (jurisdiction)
);

-- 14. campaign_finance_records
CREATE TABLE IF NOT EXISTS campaign_finance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contributor_name VARCHAR(200),
  contributor_type ENUM('individual','pac','corporation','union','other') DEFAULT 'individual',
  candidate_name VARCHAR(200) NOT NULL,
  party VARCHAR(80),
  office VARCHAR(200),
  jurisdiction VARCHAR(80),
  contribution_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  contribution_date BIGINT,
  policy_domain VARCHAR(80),
  cycle_year INT,
  source_url VARCHAR(500),
  created_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_candidate (candidate_name),
  INDEX idx_policy_domain (policy_domain),
  INDEX idx_jurisdiction (jurisdiction)
);

-- 15. policy_change_registry (referenced as policy_change_registry in services)
CREATE TABLE IF NOT EXISTS policy_change_registry (
  change_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pattern_type VARCHAR(120),
  policy_name VARCHAR(300) NOT NULL,
  policy_type ENUM('statute','regulation','executive_order','court_ruling','agency_guidance','other') NOT NULL DEFAULT 'regulation',
  jurisdiction VARCHAR(80),
  effective_date BIGINT,
  description TEXT,
  impact_summary TEXT,
  affected_programs JSON COMMENT 'Array of program IDs or names',
  source_url VARCHAR(500),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_pattern_type (pattern_type),
  INDEX idx_jurisdiction (jurisdiction),
  INDEX idx_effective_date (effective_date)
);
