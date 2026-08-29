
-- ============================================================
-- LUMINARI — MIGRATION 006
-- CDA Engine: Claim Denial Analysis v1.0-PATCH3
-- Cleared for engine integration per spec verification
-- Deterministic pipeline: T1→T9, 8 data structures, 4 outputs
-- No legal conclusions. No outcome predictions. Verbatim only.
-- ============================================================

-- Extend quotes table with CDA-required fields
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS category_tag TEXT CHECK (category_tag IN (
    'policy_clause','denial_reason','denial_supporting_fact','claim_fact',
    'date_reference','amount_reference','party_reference','declarations_field',
    'commitment','representation','other'
  )),
  ADD COLUMN IF NOT EXISTS extraction_method TEXT CHECK (extraction_method IN ('manual','ocr','digital_text')),
  ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS location_hint TEXT,
  ADD COLUMN IF NOT EXISTS information_layer TEXT CHECK (information_layer IN ('L1','L2','L3','L4')) DEFAULT 'L1';

-- CDA Runs — one run per claim denial analysis
-- Tracks the full pipeline state from intake to artifact generation
CREATE TABLE cda_runs (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  run_status      TEXT NOT NULL DEFAULT 'pending' CHECK (run_status IN (
    'pending','running','complete','incomplete','failed'
  )),
  spec_version    VARCHAR(32) NOT NULL DEFAULT '1.0-PATCH3',

  -- Failure flags (F1–F7 from spec)
  failure_flags   TEXT[],         -- ['F1','F3'] etc

  -- Locked end condition tracking (11 criteria)
  end_condition_met BOOLEAN NOT NULL DEFAULT FALSE,
  end_condition_details JSONB,

  -- Extracted entities (E1–E8)
  claim_id_extracted    VARCHAR(256),
  policy_number         VARCHAR(256),
  insured_name          VARCHAR(512),
  insurer_name          VARCHAR(512),
  loss_date             VARCHAR(64),
  denial_date           VARCHAR(64),
  coverage_types        TEXT[],
  denial_reasons_count  INT DEFAULT 0,

  started_at      BIGINT NOT NULL DEFAULT 0,
  completed_at    BIGINT,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_runs_case   ON cda_runs(case_id);
CREATE INDEX idx_cda_runs_status ON cda_runs(run_status);

-- S4: Denial Reason Ledger
-- One row per atomic denial reason extracted from I2
CREATE TABLE cda_denial_reasons (
  id                        BIGSERIAL PRIMARY KEY,
  run_id                    BIGINT NOT NULL REFERENCES cda_runs(id),
  case_id                   BIGINT NOT NULL REFERENCES cases(id),
  reason_text_verbatim      TEXT NOT NULL,
  normalized_reason_code    TEXT NOT NULL CHECK (normalized_reason_code IN (
    'exclusion_applies','condition_not_met','coverage_not_in_effect',
    'policy_lapsed','late_filing','insufficient_documentation',
    'pre_existing_condition','not_covered_peril','liability_disputed',
    'amount_disputed','duplicate_claim','misrepresentation_alleged',
    'cooperation_clause','other'
  )),
  cited_policy_refs_verbatim  TEXT,
  cited_facts_verbatim        TEXT,
  source_quote_ids            BIGINT[],
  created_at                  BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_reasons_run  ON cda_denial_reasons(run_id);
CREATE INDEX idx_cda_reasons_case ON cda_denial_reasons(case_id);

-- S5: Policy Clause Ledger
-- One row per clause extracted from I1 (policy document)
CREATE TABLE cda_policy_clauses (
  id                      BIGSERIAL PRIMARY KEY,
  run_id                  BIGINT NOT NULL REFERENCES cda_runs(id),
  case_id                 BIGINT NOT NULL REFERENCES cases(id),
  clause_text_verbatim    TEXT NOT NULL,
  section_heading         TEXT,
  clause_type             TEXT NOT NULL CHECK (clause_type IN (
    'coverage_grant','exclusion','condition','definition',
    'limitation','endorsement','rider','other'
  )),
  defined_terms           TEXT[],
  effective_scope_note    TEXT,
  source_quote_ids        BIGINT[],
  created_at              BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_clauses_run  ON cda_policy_clauses(run_id);
CREATE INDEX idx_cda_clauses_case ON cda_policy_clauses(case_id);
CREATE INDEX idx_cda_clauses_type ON cda_policy_clauses(clause_type);

-- S6: Comparison Matrix
-- One row per reason-clause pair. Core of T6/T7.
CREATE TABLE cda_comparison_matrix (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES cda_runs(id),
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  reason_id       BIGINT NOT NULL REFERENCES cda_denial_reasons(id),
  clause_id       BIGINT REFERENCES cda_policy_clauses(id),   -- null if no link found

  -- T6: How the link was established
  linking_basis   TEXT NOT NULL CHECK (linking_basis IN (
    'explicit_citation','verbatim_language_overlap',
    'defined_term_overlap','heading_overlap','none'
  )),

  -- T7: Match assessment (null until T7 runs)
  match_type      TEXT CHECK (match_type IN (
    'supported','partially_supported','unsupported','ambiguous','not_assessable'
  )),
  mismatch_type   TEXT CHECK (mismatch_type IN (
    'reason_contradicts_clause','reason_misquotes_clause',
    'reason_cites_inapplicable_clause','clause_supports_coverage',
    'no_clause_found','insufficient_reason_detail'
  )),

  -- Evidence fields (T7)
  required_evidence   TEXT,
  missing_evidence    TEXT,
  conflict_evidence   TEXT,
  supporting_quote_ids BIGINT[],
  notes               TEXT,

  -- Information layer classification
  information_layer   TEXT CHECK (information_layer IN ('L1','L2','L3','L4')),

  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_matrix_run    ON cda_comparison_matrix(run_id);
CREATE INDEX idx_cda_matrix_reason ON cda_comparison_matrix(reason_id);
CREATE INDEX idx_cda_matrix_match  ON cda_comparison_matrix(match_type);

-- S8: Contradiction Register
-- Conflicts detected across documents — must cite 2+ quotes from 2+ different docs
CREATE TABLE cda_contradictions (
  id                  BIGSERIAL PRIMARY KEY,
  run_id              BIGINT NOT NULL REFERENCES cda_runs(id),
  case_id             BIGINT NOT NULL REFERENCES cases(id),
  conflict_type       TEXT NOT NULL CHECK (conflict_type IN (
    'date_conflict','amount_conflict','fact_conflict',
    'coverage_characterization_conflict','party_identity_conflict','other'
  )),
  claim_reference     TEXT,
  denial_reference    TEXT,
  policy_reference    TEXT,
  explanation         TEXT NOT NULL,   -- factual description only, no interpretation
  linked_quote_ids    BIGINT[],        -- minimum 2 from different doc_ids per spec
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_contradictions_run  ON cda_contradictions(run_id);
CREATE INDEX idx_cda_contradictions_type ON cda_contradictions(conflict_type);

-- CDA Artifacts (O1–O4)
-- Generated outputs from T9 — stored for export and advocacy packet assembly
CREATE TABLE cda_artifacts (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES cda_runs(id),
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  artifact_type   TEXT NOT NULL CHECK (artifact_type IN (
    'O1_claim_ledger',
    'O2_policy_denial_matrix',
    'O3_evidence_gaps_contradictions',
    'O4_advocacy_packet_outline'
  )),
  content         JSONB NOT NULL,       -- structured artifact content
  citation_count  INT NOT NULL DEFAULT 0,
  has_orphaned_conclusions BOOLEAN NOT NULL DEFAULT FALSE,  -- must always be FALSE
  generated_at    BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cda_artifacts_run  ON cda_artifacts(run_id);
CREATE INDEX idx_cda_artifacts_type ON cda_artifacts(artifact_type);

