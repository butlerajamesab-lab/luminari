-- ============================================================================
-- LUMINARI METADATA SCHEMA - WITH ARTIFACT VERIFICATION
-- Distinguishes declared files from verified files
-- ============================================================================

-- ALTER existing table with verification fields
ALTER TABLE IF EXISTS deliverable_files
ADD COLUMN IF NOT EXISTS artifact_status VARCHAR(50) DEFAULT 'declared';

ALTER TABLE IF EXISTS deliverable_files
ADD COLUMN IF NOT EXISTS verification_source VARCHAR(100);

ALTER TABLE IF EXISTS deliverable_files
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- ============================================================================
-- DELIVERABLE FILES WITH VERIFICATION STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS deliverable_files (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) UNIQUE NOT NULL,
  file_type VARCHAR(50),
  file_size_kb INT,
  file_path VARCHAR(500),
  delivery_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version VARCHAR(20),
  status VARCHAR(50),
  content_hash VARCHAR(64),
  is_critical BOOLEAN DEFAULT FALSE,
  description TEXT,
  purpose TEXT,
  artifact_status VARCHAR(50) DEFAULT 'declared',
  verification_source VARCHAR(100),
  verified_at TIMESTAMP,
  CONSTRAINT check_artifact_status CHECK (
    artifact_status IN (
      'declared',
      'uploaded_verified',
      'provided_in_chat',
      'bundle_declared',
      'generated_by_install',
      'repo_verified',
      'runtime_verified',
      'missing'
    )
  )
);

CREATE TABLE IF NOT EXISTS file_categories (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  sequence_order INT
);

CREATE TABLE IF NOT EXISTS file_dependencies (
  id SERIAL PRIMARY KEY,
  source_file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  dependent_file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  dependency_type VARCHAR(100),
  required BOOLEAN DEFAULT FALSE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS file_contents (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  element_type VARCHAR(100),
  element_name VARCHAR(255),
  element_description TEXT,
  line_count INT,
  code_lines INT,
  comment_lines INT,
  blank_lines INT
);

CREATE TABLE IF NOT EXISTS code_exports (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  export_type VARCHAR(100),
  export_name VARCHAR(255),
  export_signature TEXT,
  description TEXT,
  parameters JSON,
  return_type VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS documentation_sections (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  section_title VARCHAR(255),
  section_order INT,
  subsections INT,
  key_topics VARCHAR(500),
  audience VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS installation_requirements (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  requirement_type VARCHAR(100),
  requirement_name VARCHAR(255),
  version_required VARCHAR(50),
  optional BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS expansion_packs (
  id SERIAL PRIMARY KEY,
  pack_name VARCHAR(255) UNIQUE NOT NULL,
  pack_code VARCHAR(50),
  description TEXT,
  in_option_b BOOLEAN DEFAULT FALSE,
  in_option_c BOOLEAN DEFAULT TRUE,
  dependencies VARCHAR(500),
  file_id INTEGER REFERENCES deliverable_files(id)
);

CREATE TABLE IF NOT EXISTS test_coverage (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id) ON DELETE CASCADE,
  test_name VARCHAR(255),
  test_type VARCHAR(100),
  test_status VARCHAR(50),
  expected_result TEXT,
  actual_result TEXT
);

CREATE TABLE IF NOT EXISTS setup_workflow (
  id SERIAL PRIMARY KEY,
  step_number INT,
  step_title VARCHAR(255),
  step_description TEXT,
  required_files VARCHAR(500),
  creates_files VARCHAR(500),
  estimated_time_minutes INT,
  critical_step BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS verification_audit (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES deliverable_files(id),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  verification_source VARCHAR(100),
  verified_by VARCHAR(255),
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

INSERT INTO deliverable_files 
(file_name, file_type, file_size_kb, version, status, is_critical, description, purpose, artifact_status, verification_source)
VALUES
('form-signal-extraction-engine-v2.js', 'JavaScript', 34, '2.0', 'production', TRUE, 'Production-hardened form signal extraction engine', 'Core signal extraction pipeline', 'uploaded_verified', 'filesystem'),
('form-signal-extraction-engine.js', 'JavaScript', 20, '1.0', 'reference', FALSE, 'Reference implementation (v1.0)', 'Legacy reference', 'uploaded_verified', 'filesystem'),
('install.js', 'JavaScript', 18, '1.0', 'production', TRUE, 'Automated installation wizard', 'Setup orchestration (Option B & C)', 'uploaded_verified', 'filesystem'),
('verify.js', 'JavaScript', 11, '1.0', 'production', TRUE, 'Installation verification script', 'Post-install validation', 'uploaded_verified', 'filesystem'),
('expansion-packs.js', 'JavaScript', 20, '1.0', 'production', TRUE, 'All 10 expansion packs integrated', 'Feature expansion system', 'uploaded_verified', 'filesystem'),
('schema.sql', 'SQL', 4.5, '1.0', 'production', TRUE, 'PostgreSQL schema for staging tables', 'Database initialization', 'uploaded_verified', 'filesystem'),
('FINAL-DELIVERY-MANIFEST.txt', 'Documentation', 15, '1.0', 'production', TRUE, 'Complete package overview', 'Entry point for understanding delivery', 'uploaded_verified', 'filesystem'),
('INSTALLATION-PACK-OVERVIEW-B-AND-C.md', 'Documentation', 13, '1.0', 'production', TRUE, 'Comparison of Option B vs Option C', 'Installation decision guide', 'provided_in_chat', 'chat_history'),
('COMPLETE-SETUP-GUIDE.md', 'Documentation', 16, '1.0', 'production', TRUE, 'Step-by-step installation instructions', 'Complete setup walkthrough', 'provided_in_chat', 'chat_history'),
('V2-SUMMARY.md', 'Documentation', 11, '1.0', 'production', FALSE, 'V2 engine improvements and features', 'Technical summary', 'provided_in_chat', 'chat_history'),
('PRODUCTION-HARDENING-PATCH.md', 'Documentation', 27, '1.0', 'production', TRUE, 'All 10 production hardening fixes explained', 'Hardening reference', 'provided_in_chat', 'chat_history'),
('LUMINARI-INTEGRATION-GUIDE.md', 'Documentation', 14, '1.0', 'production', TRUE, 'Sunam integration code and instructions', 'Luminari integration', 'uploaded_verified', 'filesystem'),
('FORM-SIGNAL-EXTRACTION-DOCUMENTATION.md', 'Documentation', 15, '1.0', 'production', FALSE, 'Architecture reference for extraction engine', 'Architecture documentation', 'uploaded_verified', 'filesystem'),
('README.md', 'Documentation', 9, '1.0', 'production', FALSE, 'Quick start guide', 'Quick reference', 'uploaded_verified', 'filesystem'),
('START-HERE.txt', 'Documentation', 8, '1.0', 'production', TRUE, 'Initial orientation document', 'Getting started', 'uploaded_verified', 'filesystem'),
('DELIVERABLES-INDEX.md', 'Documentation', 11, '1.0', 'production', FALSE, 'Complete file manifest and descriptions', 'File inventory', 'uploaded_verified', 'filesystem'),
('METADATA-SCHEMA.sql', 'SQL', 18, '1.0', 'production', TRUE, 'SQL metadata wrapper for entire package', 'Package documentation registry', 'generated_by_install', 'runtime')
ON CONFLICT (file_name) DO NOTHING;

CREATE OR REPLACE VIEW verification_status_summary AS
SELECT artifact_status, COUNT(*) as file_count, STRING_AGG(file_name, ', ') as files
FROM deliverable_files
GROUP BY artifact_status
ORDER BY CASE artifact_status WHEN 'uploaded_verified' THEN 1 WHEN 'provided_in_chat' THEN 2 WHEN 'bundle_declared' THEN 3 WHEN 'generated_by_install' THEN 4 WHEN 'declared' THEN 5 ELSE 6 END;

CREATE OR REPLACE VIEW critical_files_verification AS
SELECT file_name, file_type, is_critical, artifact_status, verification_source,
  CASE WHEN artifact_status IN ('uploaded_verified', 'provided_in_chat') THEN 'VERIFIED' WHEN artifact_status = 'declared' THEN 'PENDING' ELSE artifact_status END as verification_state
FROM deliverable_files
WHERE is_critical = TRUE
ORDER BY CASE WHEN artifact_status IN ('uploaded_verified', 'provided_in_chat') THEN 1 ELSE 2 END, file_name;

CREATE OR REPLACE VIEW unverified_files AS
SELECT file_name, file_type, artifact_status, verification_source, 'NEEDS ACTION' as flag
FROM deliverable_files
WHERE artifact_status NOT IN ('uploaded_verified', 'provided_in_chat', 'generated_by_install')
ORDER BY file_name;

CREATE OR REPLACE VIEW verification_completeness AS
SELECT ROUND(100.0 * COUNT(CASE WHEN artifact_status IN ('uploaded_verified', 'provided_in_chat') THEN 1 END) / COUNT(*), 1) as percent_verified,
  COUNT(CASE WHEN artifact_status IN ('uploaded_verified', 'provided_in_chat') THEN 1 END) as verified_files,
  COUNT(*) as total_files
FROM deliverable_files;

CREATE OR REPLACE VIEW package_classification AS
SELECT 'Delivered Files (not generated)' as classification, COUNT(*)::VARCHAR as count FROM deliverable_files WHERE artifact_status != 'generated_by_install'
UNION ALL SELECT 'Generated by install.js', COUNT(*)::VARCHAR FROM deliverable_files WHERE artifact_status = 'generated_by_install'
UNION ALL SELECT 'Verified (uploaded or provided)', COUNT(*)::VARCHAR FROM deliverable_files WHERE artifact_status IN ('uploaded_verified', 'provided_in_chat')
UNION ALL SELECT 'Pending Verification', COUNT(*)::VARCHAR FROM deliverable_files WHERE artifact_status NOT IN ('uploaded_verified', 'provided_in_chat', 'generated_by_install');
