
-- ============================================================
-- LUMINARI — MIGRATION 005
-- Governance: Immutable audit log + constitutional tests
-- Append-only. Hash-chained. No updates. No deletes.
-- ============================================================

CREATE TABLE governance_log (
  id              BIGSERIAL PRIMARY KEY,
  seq_no          BIGINT NOT NULL UNIQUE,
  event_type      VARCHAR(64) NOT NULL,
  component       VARCHAR(128) NOT NULL,
  scope           VARCHAR(256),
  previous_state  TEXT,
  new_state       TEXT NOT NULL,
  rationale       TEXT NOT NULL,
  actor_hash      VARCHAR(64) NOT NULL,
  actor_role      VARCHAR(32) NOT NULL,
  previous_hash   VARCHAR(64) NOT NULL,
  entry_hash      VARCHAR(64) NOT NULL,
  created_at      BIGINT NOT NULL
);

CREATE INDEX idx_gov_event     ON governance_log(event_type);
CREATE INDEX idx_gov_component ON governance_log(component);
CREATE INDEX idx_gov_seq       ON governance_log(seq_no);
CREATE INDEX idx_gov_created   ON governance_log(created_at);

-- Constitutional test runs — verifies system integrity
CREATE TABLE constitutional_test_runs (
  id              BIGSERIAL PRIMARY KEY,
  test_type       VARCHAR(128) NOT NULL,
  test_status     TEXT NOT NULL CHECK (test_status IN ('passed','failed','skipped')),
  test_details    JSONB,
  run_at          BIGINT NOT NULL
);

-- System health checks
CREATE TABLE system_health (
  id              BIGSERIAL PRIMARY KEY,
  health_check_type VARCHAR(128) NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('healthy','degraded','failed')),
  last_check      BIGINT NOT NULL,
  details         JSONB
);

-- Interpretation trace — every L7 decision is logged
CREATE TABLE interpretation_trace_log (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT REFERENCES cases(id),
  claim_id        BIGINT REFERENCES claims(id),
  rule_id         TEXT,
  rule_source     TEXT CHECK (rule_source IN ('statute','doctrine','template','fallback','unknown')),
  resolution_path JSONB,
  fallback_used   BOOLEAN DEFAULT FALSE,
  traced_at       BIGINT NOT NULL
);

CREATE INDEX idx_trace_case ON interpretation_trace_log(case_id);

-- Gap log — when we can't give a full answer, we log the gap
-- This is the honest logged gap from the constitutional promise
CREATE TABLE gap_log (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT REFERENCES cases(id),
  intake_session_id BIGINT REFERENCES intake_sessions(id),
  gap_type        VARCHAR(64) NOT NULL,
  description     TEXT NOT NULL,
  situation_type  VARCHAR(128),
  state_code      VARCHAR(2),
  attempted_paths JSONB,
  reason          TEXT NOT NULL,
  escalated       BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_path TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_gap_case  ON gap_log(case_id);
CREATE INDEX idx_gap_state ON gap_log(state_code);
CREATE INDEX idx_gap_type  ON gap_log(gap_type);

