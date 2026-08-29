
-- ============================================================
-- MIGRATION 037: Problem Framework Tables
-- From SQL manifest (converted from TiDB/MySQL to Postgres)
-- problem_instances, populations_affected, vectors,
-- collision_points, conflicts_detected, constants_registry,
-- layer_ref, engine_activation_state_ref
-- ============================================================

-- Layer reference (canonical)
CREATE TABLE layer_ref (
  layer_id      VARCHAR(10) PRIMARY KEY,
  layer_number  INT NOT NULL,
  layer_name    VARCHAR(100) NOT NULL,
  description   TEXT
);

INSERT INTO layer_ref (layer_id, layer_number, layer_name, description) VALUES
('L0',  0,  'Source Intake Layer',              'Entry point for all source material'),
('L1',  1,  'Ingestion + Provenance Layer',      'Document registration, intake binding, provenance, snapshots'),
('L2',  2,  'Extraction + Structuring Layer',    'Parsing, quote/entity/timeline/field extraction'),
('L3',  3,  'Registry + Knowledge Backbone Layer', 'Canonical registries, legal library, workflows, agencies'),
('L4',  4,  'Validation + Normalization Layer',  'Canonicalization, validation, deterministic checks'),
('L5',  5,  'Evidence / Claim / Finding Layer',  'Claims, findings, missing records, evidence requirements'),
('L6',  6,  'Pattern + Signal Layer',            'Patterns, occurrences, fingerprints, civic signals'),
('L7',  7,  'Interpretation Layer — THE TRUST CORE', 'Projection-only. No side effects. No tables. One instance ONLY.'),
('L8',  8,  'Procedural / Action Layer',         'Workflows, deadlines, escalation, enforcement pathways'),
('L9',  9,  'Export / Assembly Layer',           'Bundles, packets, FOIA, narrative, artifact generation'),
('L10', 10, 'Operations / Oversight Layer',      'Mission control, constitutional test, determinism, rule freeze'),
('L11', 11, 'Public / Admin UI Surfaces',        'Sunam, dispatcher, sovereign control, exposed interfaces');

-- Engine activation state reference
CREATE TABLE engine_activation_state_ref (
  activation_state  VARCHAR(50) PRIMARY KEY,
  description       TEXT
);

INSERT INTO engine_activation_state_ref (activation_state, description) VALUES
('active',     'Engine is operational and in use'),
('shadow',     'Engine runs in parallel with active engine for testing'),
('test_only',  'Engine used only in test environments'),
('deprecated', 'Legacy engine; should not be used'),
('disabled',   'Temporarily disabled');

-- Constants registry (immutable)
CREATE TABLE constants_registry (
  constant_id           VARCHAR(128) PRIMARY KEY,
  category              VARCHAR(100) NOT NULL,
  value                 TEXT NOT NULL,
  definition            TEXT,
  framework_version     VARCHAR(50) NOT NULL,
  locked_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by             VARCHAR(256) NOT NULL,
  framework_hash_sha256 VARCHAR(64) NOT NULL,
  modification_locked   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            BIGINT NOT NULL DEFAULT 0,
  UNIQUE (framework_hash_sha256)
);

-- Problem instances (V2 validated data model — 54 instances exist)
CREATE TABLE problem_instances (
  record_id             VARCHAR(50) PRIMARY KEY,
  source_fingerprint    VARCHAR(256) NOT NULL,
  canonical_hash        VARCHAR(256) NOT NULL,
  submitted_by          VARCHAR(256) NOT NULL,
  submission_date       TIMESTAMPTZ NOT NULL,
  framework_version     VARCHAR(50) NOT NULL,
  scale                 TEXT NOT NULL CHECK (scale IN ('micro','meso','macro','global')),
  jurisdiction          VARCHAR(100) NOT NULL,
  problem_type          TEXT NOT NULL CHECK (problem_type IN ('DENIAL','ESCALATION','GAP','CONTRADICTION','SIGNAL')),
  domain                VARCHAR(100),
  specifics             JSONB,
  friction_coefficient  DECIMAL(6,4),
  alignment_micro       DECIMAL(6,4),
  alignment_meso        DECIMAL(6,4),
  alignment_macro       DECIMAL(6,4),
  confidence            DECIMAL(6,4),
  validation_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','VALIDATED','FLAGGED','SUPERSEDED')),
  created_at            BIGINT NOT NULL DEFAULT 0,
  updated_at            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_pi_problem_type       ON problem_instances(problem_type);
CREATE INDEX idx_pi_scale              ON problem_instances(scale);
CREATE INDEX idx_pi_validation_status  ON problem_instances(validation_status);
CREATE INDEX idx_pi_domain             ON problem_instances(domain);

-- Populations affected
CREATE TABLE populations_affected (
  population_id         VARCHAR(50) PRIMARY KEY,
  record_id             VARCHAR(50) NOT NULL REFERENCES problem_instances(record_id),
  population            VARCHAR(256) NOT NULL,
  impact_description    TEXT NOT NULL,
  is_disproportionate   BOOLEAN,
  source_citation       VARCHAR(512),
  supporting_evidence   TEXT,
  evidence_level        TEXT CHECK (evidence_level IN ('DOCUMENTED','OBSERVED','CLAIMED','DISPUTED')),
  created_at            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_pa_record_id  ON populations_affected(record_id);
CREATE INDEX idx_pa_population ON populations_affected(population);

-- Vectors (scale escalation/propagation mechanisms)
CREATE TABLE vectors (
  vector_id             VARCHAR(50) PRIMARY KEY,
  record_id             VARCHAR(50) NOT NULL REFERENCES problem_instances(record_id),
  vector_from_scale     VARCHAR(20) NOT NULL,
  vector_to_scale       VARCHAR(20) NOT NULL,
  mechanism             TEXT NOT NULL,
  affected_systems      TEXT NOT NULL,
  cascading_effects     TEXT NOT NULL,
  evidence_citation     VARCHAR(512),
  created_at            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_vectors_record_id ON vectors(record_id);

-- Collision points (cross-problem conflicts)
CREATE TABLE collision_points (
  collision_id          VARCHAR(50) PRIMARY KEY,
  record_ids            JSONB NOT NULL,
  system_a              VARCHAR(256) NOT NULL,
  system_b              VARCHAR(256) NOT NULL,
  collision_scale       VARCHAR(20),
  collision_problem     TEXT NOT NULL,
  collision_type        VARCHAR(50) NOT NULL,
  resolution_required   TEXT,
  priority_order        JSONB,
  created_at            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cp_system_a ON collision_points(system_a);
CREATE INDEX idx_cp_system_b ON collision_points(system_b);

-- Conflicts detected (cross-record contradictions)
CREATE TABLE conflicts_detected (
  conflict_id           VARCHAR(50) PRIMARY KEY,
  record_id_a           VARCHAR(50) NOT NULL,
  record_id_b           VARCHAR(50) NOT NULL,
  conflict_type         TEXT NOT NULL CHECK (conflict_type IN (
    'SYSTEMIC_CONTRADICTION','RESEARCHER_ERROR','ARCHITECTURAL_BLINDSPOT',
    'EVIDENCE_DISAGREEMENT','SCALE_MISMATCH','BIDIRECTIONAL_MISALIGNMENT',
    'PENDING_CLASSIFICATION')),
  conflict_description  TEXT NOT NULL,
  impact_on_framework   TEXT,
  resolution_status     TEXT NOT NULL DEFAULT 'OPEN' CHECK (resolution_status IN ('OPEN','RESOLVED','ESCALATED')),
  resolved_as           TEXT,
  resolution_date       TIMESTAMPTZ,
  resolved_by           VARCHAR(256),
  created_at            BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cd_record_a           ON conflicts_detected(record_id_a);
CREATE INDEX idx_cd_record_b           ON conflicts_detected(record_id_b);
CREATE INDEX idx_cd_resolution_status  ON conflicts_detected(resolution_status);
