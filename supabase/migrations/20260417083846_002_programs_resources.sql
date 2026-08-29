
-- ============================================================
-- LUMINARI — MIGRATION 002
-- Programs: The Promise Keeper
-- Every resource a person might need. Fires at intake.
-- One table. Every door.
-- ============================================================

CREATE TABLE programs (
  id                BIGSERIAL PRIMARY KEY,
  program_key       VARCHAR(128) NOT NULL UNIQUE,
  name              VARCHAR(256) NOT NULL,

  -- What kind of help this is
  resource_type     TEXT NOT NULL CHECK (resource_type IN (
    'emergency_cash',
    'rental_assistance',
    'utility_assistance',
    'food',
    'healthcare',
    'mental_health',
    'substance_use',
    'dental',
    'vision',
    'prescription',
    'housing',
    'shelter',
    'dv_services',
    'legal_aid',
    'expungement',
    'immigration',
    'benefits_navigation',
    'disability',
    'veterans',
    'childcare',
    'youth',
    'elder_care',
    'job_training',
    'transportation',
    'tribal',
    'faith_based',
    'nonprofit_emergency',
    'grant',
    'hotline',
    'other'
  )),

  -- Who runs it
  provider_type     TEXT NOT NULL CHECK (provider_type IN (
    'federal', 'state', 'county', 'city',
    'tribal', 'nonprofit', 'faith_based',
    'fqhc', 'ihs', 'va', 'legal_aid_org', 'other'
  )),

  -- Where it applies
  state_code        VARCHAR(2),        -- NULL means national
  county            VARCHAR(128),
  city              VARCHAR(128),
  tribe_key         VARCHAR(64),
  is_national       BOOLEAN DEFAULT FALSE,

  -- Who it's for — used for immediate matching at intake
  situation_tags    TEXT[],            -- ['eviction','housing_discrimination','dv','expungement']
  population_tags   TEXT[],            -- ['veterans','children','seniors','tribal','lgbtq','immigrant']
  income_threshold  BOOLEAN DEFAULT FALSE,  -- true = has income limit
  income_notes      TEXT,

  -- How urgent / how fast
  turnaround        VARCHAR(64),       -- 'same_day', '48_hours', '1_week', 'ongoing'
  is_emergency      BOOLEAN DEFAULT FALSE,

  -- Contact
  phone             VARCHAR(64),
  text_line         VARCHAR(64),
  chat_url          VARCHAR(512),
  application_url   VARCHAR(512),
  website           VARCHAR(512),
  walk_in_address   TEXT,
  hours             VARCHAR(128),
  is_24_7           BOOLEAN DEFAULT FALSE,

  -- Eligibility and cost
  eligibility       TEXT NOT NULL,
  cost              VARCHAR(128),      -- 'Free', 'Sliding scale', 'Insurance accepted'
  languages         TEXT[],

  -- Verification
  source_url        VARCHAR(512),
  last_verified     VARCHAR(16),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,

  created_at        BIGINT NOT NULL DEFAULT 0,
  updated_at        BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_programs_type       ON programs(resource_type);
CREATE INDEX idx_programs_state      ON programs(state_code);
CREATE INDEX idx_programs_provider   ON programs(provider_type);
CREATE INDEX idx_programs_emergency  ON programs(is_emergency);
CREATE INDEX idx_programs_national   ON programs(is_national);
CREATE INDEX idx_programs_active     ON programs(is_active);
CREATE INDEX idx_programs_situations ON programs USING GIN(situation_tags);
CREATE INDEX idx_programs_population ON programs USING GIN(population_tags);

-- ============================================================
-- TRIBAL JURISDICTIONS
-- 29 WA federally recognized tribes — separate sovereigns
-- Expanded to support all 574 federally recognized tribes nationally
-- ============================================================

CREATE TABLE tribal_jurisdictions (
  id              BIGSERIAL PRIMARY KEY,
  tribe_key       VARCHAR(64) NOT NULL UNIQUE,
  tribe_name      VARCHAR(256) NOT NULL,
  state_code      VARCHAR(2),
  region          VARCHAR(128),
  county          VARCHAR(128),
  website_url     VARCHAR(512),
  phone           VARCHAR(64),
  tribal_court            VARCHAR(256),
  tribal_social_services  VARCHAR(256),
  tribal_housing          VARCHAR(256),
  tribal_tanf             VARCHAR(256),
  tribal_health           VARCHAR(256),
  tribal_enrollment       VARCHAR(256),
  treaty_rights_in_state  BOOLEAN NOT NULL DEFAULT TRUE,
  is_federally_recognized BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_tribal_state ON tribal_jurisdictions(state_code);
