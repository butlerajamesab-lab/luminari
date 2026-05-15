-- Migration 0008: Campaign support tables missing from 0007

CREATE TABLE IF NOT EXISTS campaign_actions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL,
  stage_number INT NOT NULL DEFAULT 1,
  date BIGINT NOT NULL,
  action TEXT NOT NULL,
  responsible_party VARCHAR(255),
  responsible_party_type VARCHAR(100),
  impact_score INT DEFAULT 0,
  result TEXT,
  source VARCHAR(100),
  source_id VARCHAR(255),
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)
);

CREATE TABLE IF NOT EXISTS campaign_outcomes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL,
  date BIGINT NOT NULL,
  result TEXT NOT NULL,
  impact_score INT DEFAULT 0,
  notes TEXT,
  policy_change_id VARCHAR(36),
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)
);

CREATE TABLE IF NOT EXISTS coalition_campaign_targets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(100) NOT NULL,
  target_id VARCHAR(255),
  target_name VARCHAR(500) NOT NULL,
  priority INT DEFAULT 5,
  strategy_notes TEXT,
  outreach_status VARCHAR(100) DEFAULT 'pending',
  response TEXT,
  last_contacted DATETIME,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)
);

CREATE TABLE IF NOT EXISTS campaign_members (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL,
  member_type VARCHAR(100) NOT NULL,
  member_id VARCHAR(255),
  member_name VARCHAR(500) NOT NULL,
  role VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  joined_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  is_active TINYINT(1) DEFAULT 1
);
