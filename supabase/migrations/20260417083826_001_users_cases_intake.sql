
-- ============================================================
-- LUMINARI — MIGRATION 001
-- Foundation: Users, Cases, Intake
-- ============================================================

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  open_id         VARCHAR(64) NOT NULL UNIQUE,
  name            TEXT,
  email           VARCHAR(320),
  login_method    VARCHAR(64),
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'advocacy', 'family_advocacy', 'analyst', 'professional', 'enterprise')),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0,
  last_signed_in  BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE cases (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  name            VARCHAR(512) NOT NULL,
  description     TEXT,
  situation_type  VARCHAR(128),
  state_code      VARCHAR(2),
  county          VARCHAR(128),
  city            VARCHAR(128),
  tribe_key       VARCHAR(64),
  pipeline_type   VARCHAR(64),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cases_user      ON cases(user_id);
CREATE INDEX idx_cases_state     ON cases(state_code);
CREATE INDEX idx_cases_situation ON cases(situation_type);

-- Intake fires two tracks simultaneously:
-- Track 1: immediate_help_surfaced — populated instantly from programs table
-- Track 2: case builds in background
CREATE TABLE intake_sessions (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  BIGINT REFERENCES users(id),
  case_id                  BIGINT REFERENCES cases(id),
  situation_raw            TEXT,
  situation_type           VARCHAR(128),
  state_code               VARCHAR(2),
  county                   VARCHAR(128),
  city                     VARCHAR(128),
  household_size           INT,
  has_children             BOOLEAN DEFAULT FALSE,
  is_veteran               BOOLEAN DEFAULT FALSE,
  is_tribal_member         BOOLEAN DEFAULT FALSE,
  tribe_key                VARCHAR(64),
  immediate_help_surfaced  JSONB,
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at               BIGINT NOT NULL DEFAULT 0,
  updated_at               BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_intake_user      ON intake_sessions(user_id);
CREATE INDEX idx_intake_state     ON intake_sessions(state_code);
CREATE INDEX idx_intake_situation ON intake_sessions(situation_type);

