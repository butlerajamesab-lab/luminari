-- ============================================================
-- CIVIC OPERATING STACK v1.0.0
-- PHASE 1 — FOUNDATION LOCK
-- MySQL / TiDB-compatible
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- CONSTANTS REGISTRY
-- Immutable governing truths / rules / constraints / standards
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constants_registry (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  constant_key VARCHAR(255) NOT NULL,
  constant_name VARCHAR(255) NOT NULL,
  constant_type ENUM(
    'LEGAL',
    'PROCEDURAL',
    'SCIENTIFIC',
    'MATHEMATICAL',
    'SYSTEMIC',
    'ETHICAL',
    'CIVIC',
    'FORENSIC'
  ) NOT NULL,
  domain_name VARCHAR(255) NOT NULL,
  jurisdiction VARCHAR(255) NULL,
  source_authority VARCHAR(255) NULL,
  source_citation TEXT NULL,
  description TEXT NOT NULL,
  formal_expression TEXT NULL,
  severity_if_violated ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'HIGH',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  immutable_flag TINYINT(1) NOT NULL DEFAULT 1,
  version_tag VARCHAR(64) NOT NULL DEFAULT 'v1.0.0',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  retired_at DATETIME NULL,
  retired_reason TEXT NULL,
  UNIQUE KEY uq_constants_registry_key_version (constant_key, version_tag),
  KEY idx_constants_registry_domain (domain_name),
  KEY idx_constants_registry_type (constant_type),
  KEY idx_constants_registry_jurisdiction (jurisdiction),
  KEY idx_constants_registry_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- EVIDENCE ITEMS
-- Raw or normalized evidence entering the stack
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  evidence_uuid CHAR(36) NOT NULL,
  case_reference VARCHAR(255) NULL,
  source_type ENUM(
    'DOCUMENT',
    'IMAGE',
    'VIDEO',
    'AUDIO',
    'TESTIMONY',
    'DATA_FEED',
    'GOV_RECORD',
    'WEB_CAPTURE',
    'OTHER'
  ) NOT NULL,
  source_uri TEXT NULL,
  sha256_hash CHAR(64) NULL,
  title VARCHAR(500) NULL,
  description TEXT NULL,
  raw_payload LONGTEXT NULL,
  structured_payload LONGTEXT NULL,
  provenance_json LONGTEXT NULL,
  intake_status ENUM('RECEIVED','STRUCTURED','FAILED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_evidence_items_uuid (evidence_uuid),
  KEY idx_evidence_items_case_reference (case_reference),
  KEY idx_evidence_items_source_type (source_type),
  KEY idx_evidence_items_intake_status (intake_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- PROBLEM INSTANCES
-- A concrete civic / legal / systemic incident under analysis
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problem_instances (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  problem_uuid CHAR(36) NOT NULL,
  case_reference VARCHAR(255) NULL,
  title VARCHAR(500) NOT NULL,
  problem_type VARCHAR(255) NOT NULL,
  scale_level ENUM('MICRO','MESO','MACRO','META') NOT NULL,
  status ENUM(
    'OPEN',
    'UNDER_ANALYSIS',
    'CONFLICTED',
    'GAP_BLOCKED',
    'ACTION_READY',
    'CLOSED'
  ) NOT NULL DEFAULT 'OPEN',
  summary TEXT NULL,
  jurisdiction VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_problem_instances_uuid (problem_uuid),
  KEY idx_problem_instances_case_reference (case_reference),
  KEY idx_problem_instances_problem_type (problem_type),
  KEY idx_problem_instances_scale_level (scale_level),
  KEY idx_problem_instances_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- EVIDENCE TO PROBLEM LINK
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problem_evidence_links (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  problem_instance_id BIGINT NOT NULL,
  evidence_item_id BIGINT NOT NULL,
  relevance_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  linkage_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  CONSTRAINT fk_problem_evidence_problem
    FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(id),
  CONSTRAINT fk_problem_evidence_evidence
    FOREIGN KEY (evidence_item_id) REFERENCES evidence_items(id),
  UNIQUE KEY uq_problem_evidence_link (problem_instance_id, evidence_item_id),
  KEY idx_problem_evidence_problem (problem_instance_id),
  KEY idx_problem_evidence_evidence (evidence_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- KNOWLEDGE TYPES
-- Required by PACK_4_KNOWLEDGE_ENGINE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  type_key VARCHAR(100) NOT NULL,
  type_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_knowledge_types_key (type_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- SCALE LEVELS
-- Required by PACK_4_KNOWLEDGE_ENGINE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scale_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scale_key VARCHAR(50) NOT NULL,
  scale_name VARCHAR(255) NOT NULL,
  ordinal_position INT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE KEY uq_scale_levels_key (scale_key),
  UNIQUE KEY uq_scale_levels_ordinal (ordinal_position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- VARIABLE MATRIX
-- Crosswalk between constants, knowledge types, scales, and domains
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS variable_matrix (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  matrix_key VARCHAR(255) NOT NULL,
  domain_name VARCHAR(255) NOT NULL,
  constant_id BIGINT NOT NULL,
  knowledge_type_id BIGINT NOT NULL,
  scale_level_id BIGINT NOT NULL,
  variable_name VARCHAR(255) NOT NULL,
  expected_value_type ENUM('BOOLEAN','NUMBER','TEXT','DATE','JSON','ENUM') NOT NULL,
  required_flag TINYINT(1) NOT NULL DEFAULT 1,
  validation_rule TEXT NULL,
  contradiction_rule TEXT NULL,
  gap_rule TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  CONSTRAINT fk_variable_matrix_constant
    FOREIGN KEY (constant_id) REFERENCES constants_registry(id),
  CONSTRAINT fk_variable_matrix_knowledge_type
    FOREIGN KEY (knowledge_type_id) REFERENCES knowledge_types(id),
  CONSTRAINT fk_variable_matrix_scale_level
    FOREIGN KEY (scale_level_id) REFERENCES scale_levels(id),
  UNIQUE KEY uq_variable_matrix_key (matrix_key),
  KEY idx_variable_matrix_domain (domain_name),
  KEY idx_variable_matrix_constant (constant_id),
  KEY idx_variable_matrix_knowledge_type (knowledge_type_id),
  KEY idx_variable_matrix_scale_level (scale_level_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- ENGINE RUNS
-- Every deterministic stage execution
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engine_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_uuid CHAR(36) NOT NULL,
  problem_instance_id BIGINT NOT NULL,
  stage_name ENUM(
    'EVIDENCE_STRUCTURING',
    'CONSTANTS_APPLICATION',
    'FORENSIC_ANALYSIS',
    'PATTERN_DETECTION',
    'DISTORTION_DETECTION',
    'STRATEGY_GENERATION',
    'REPORT_GENERATION'
  ) NOT NULL,
  engine_name VARCHAR(255) NOT NULL,
  engine_version VARCHAR(64) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  output_hash CHAR(64) NULL,
  run_status ENUM('STARTED','PASSED','FAILED','BLOCKED') NOT NULL,
  failure_reason TEXT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  created_by VARCHAR(255) NOT NULL,
  CONSTRAINT fk_engine_runs_problem
    FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(id),
  UNIQUE KEY uq_engine_runs_uuid (run_uuid),
  KEY idx_engine_runs_problem (problem_instance_id),
  KEY idx_engine_runs_stage (stage_name),
  KEY idx_engine_runs_status (run_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FINDINGS
-- No output exists unless evidence + constants + validation passed
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS findings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  finding_uuid CHAR(36) NOT NULL,
  problem_instance_id BIGINT NOT NULL,
  stage_name ENUM(
    'FORENSIC_ANALYSIS',
    'PATTERN_DETECTION',
    'DISTORTION_DETECTION',
    'STRATEGY_GENERATION',
    'REPORT_GENERATION'
  ) NOT NULL,
  finding_type ENUM('FACT','PATTERN','DISTORTION','CONFLICT','GAP','RECOMMENDATION') NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  title VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  evidence_sufficient_flag TINYINT(1) NOT NULL DEFAULT 0,
  constants_applied_flag TINYINT(1) NOT NULL DEFAULT 0,
  validation_passed_flag TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  CONSTRAINT fk_findings_problem
    FOREIGN KEY (problem_instance_id) REFERENCES problem_instances(id),
  UNIQUE KEY uq_findings_uuid (finding_uuid),
  KEY idx_findings_problem (problem_instance_id),
  KEY idx_findings_stage (stage_name),
  KEY idx_findings_type (finding_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FINDING EVIDENCE SUPPORT
-- Links findings to evidence that supports them
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_evidence_support (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  finding_id BIGINT NOT NULL,
  evidence_item_id BIGINT NOT NULL,
  support_role ENUM('PRIMARY','CORROBORATING','CONTEXTUAL') NOT NULL DEFAULT 'PRIMARY',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finding_evidence_finding
    FOREIGN KEY (finding_id) REFERENCES findings(id),
  CONSTRAINT fk_finding_evidence_evidence
    FOREIGN KEY (evidence_item_id) REFERENCES evidence_items(id),
  UNIQUE KEY uq_finding_evidence_link (finding_id, evidence_item_id),
  KEY idx_finding_evidence_finding (finding_id),
  KEY idx_finding_evidence_evidence (evidence_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FINDING CONSTANT SUPPORT
-- Links findings to constants that govern them
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_constant_support (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  finding_id BIGINT NOT NULL,
  constant_id BIGINT NOT NULL,
  application_role ENUM('GOVERNING','INFORMING','CONTEXTUAL') NOT NULL DEFAULT 'GOVERNING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finding_constant_finding
    FOREIGN KEY (finding_id) REFERENCES findings(id),
  CONSTRAINT fk_finding_constant_constant
    FOREIGN KEY (constant_id) REFERENCES constants_registry(id),
  UNIQUE KEY uq_finding_constant_link (finding_id, constant_id),
  KEY idx_finding_constant_finding (finding_id),
  KEY idx_finding_constant_constant (constant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- AUDIT TRAIL
-- Immutable record of all system actions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_uuid CHAR(36) NOT NULL,
  actor_type ENUM('SYSTEM','USER','ADMIN','ENGINE') NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  action_type ENUM(
    'INSERT',
    'UPDATE',
    'DELETE',
    'READ',
    'VALIDATE',
    'BLOCK',
    'ESCALATE',
    'RUN_ENGINE'
  ) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  before_state LONGTEXT NULL,
  after_state LONGTEXT NULL,
  change_reason TEXT NULL,
  event_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_audit_trail_uuid (event_uuid),
  KEY idx_audit_trail_actor (actor_id),
  KEY idx_audit_trail_action (action_type),
  KEY idx_audit_trail_table (table_name),
  KEY idx_audit_trail_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
