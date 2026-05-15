-- ============================================================
-- CIVIC OPERATING STACK v1.0.0
-- PHASE 1 — GOVERNANCE LOCK
-- Immutability enforcement + Truth gates
-- ============================================================

-- ============================================================
-- PART 1: SEED CONSTANTS REGISTRY
-- ============================================================

INSERT INTO constants_registry (
  constant_key,
  constant_name,
  constant_type,
  domain_name,
  jurisdiction,
  source_authority,
  description,
  severity_if_violated,
  is_active,
  immutable_flag,
  version_tag,
  created_by
) VALUES
  (
    'EVIDENCE_REQUIRED_FOR_FINDING',
    'Evidence Required for Finding',
    'FORENSIC',
    'GLOBAL',
    'GLOBAL',
    'Civic Operating Stack v1.0.0',
    'Every finding must be supported by evidence. No finding can exist without evidence_sufficient_flag = 1.',
    'CRITICAL',
    1,
    1,
    'v1.0.0',
    'SYSTEM'
  ),
  (
    'CONSTANTS_REQUIRED_FOR_FINDING',
    'Constants Required for Finding',
    'FORENSIC',
    'GLOBAL',
    'GLOBAL',
    'Civic Operating Stack v1.0.0',
    'Every finding must reference at least one constant. No finding can exist without constants_applied_flag = 1.',
    'CRITICAL',
    1,
    1,
    'v1.0.0',
    'SYSTEM'
  ),
  (
    'VALIDATION_REQUIRED_FOR_FINDING',
    'Validation Required for Finding',
    'FORENSIC',
    'GLOBAL',
    'GLOBAL',
    'Civic Operating Stack v1.0.0',
    'Every finding must pass validation. No finding can exist without validation_passed_flag = 1.',
    'CRITICAL',
    1,
    1,
    'v1.0.0',
    'SYSTEM'
  ),
  (
    'NO_SILENT_CONFLICT_RESOLUTION',
    'No Silent Conflict Resolution',
    'SYSTEMIC',
    'GLOBAL',
    'GLOBAL',
    'Civic Operating Stack v1.0.0',
    'Conflicts must be surfaced explicitly. No conflict can be resolved silently or by assumption.',
    'CRITICAL',
    1,
    1,
    'v1.0.0',
    'SYSTEM'
  );

-- ============================================================
-- PART 2: IMMUTABILITY TRIGGERS
-- ============================================================

-- Prevent UPDATE on constants_registry
DELIMITER $$

CREATE TRIGGER trg_constants_registry_no_update
BEFORE UPDATE ON constants_registry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'constants_registry is immutable';
END$$

-- Prevent DELETE on constants_registry
CREATE TRIGGER trg_constants_registry_no_delete
BEFORE DELETE ON constants_registry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'constants_registry is immutable';
END$$

-- ============================================================
-- PART 3: FINDINGS GOVERNANCE TRIGGERS
-- ============================================================

-- Enforce evidence_sufficient_flag
CREATE TRIGGER trg_findings_require_evidence
BEFORE INSERT ON findings
FOR EACH ROW
BEGIN
  IF NEW.evidence_sufficient_flag != 1 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'finding blocked: evidence_sufficient_flag must be 1';
  END IF;
END$$

-- Enforce constants_applied_flag
CREATE TRIGGER trg_findings_require_constants
BEFORE INSERT ON findings
FOR EACH ROW
BEGIN
  IF NEW.constants_applied_flag != 1 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'finding blocked: constants_applied_flag must be 1';
  END IF;
END$$

-- Enforce validation_passed_flag
CREATE TRIGGER trg_findings_require_validation
BEFORE INSERT ON findings
FOR EACH ROW
BEGIN
  IF NEW.validation_passed_flag != 1 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'finding blocked: validation_passed_flag must be 1';
  END IF;
END$$

DELIMITER ;

-- ============================================================
-- PART 4: AUDIT TRAIL IMMUTABILITY
-- ============================================================

-- Prevent DELETE on audit_trail
DELIMITER $$

CREATE TRIGGER trg_audit_trail_no_delete
BEFORE DELETE ON audit_trail
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'audit_trail is immutable';
END$$

DELIMITER ;
