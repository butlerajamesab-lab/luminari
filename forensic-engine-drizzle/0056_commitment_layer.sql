-- Migration: 0056_commitment_layer
-- Adds: claim_validation_rules_v2, remedy_feasibility_rules_v2, case_state, case_flags, foia_tracker_requests
-- Note: v1 tables (34 rows, 5 rows) have different schema — kept intact
-- Date: 2026-04-12

-- ─── Claim Validation Rules v2 (jurisdiction-aware, from team JSON) ───────────
CREATE TABLE IF NOT EXISTS `claim_validation_rules_v2` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `jurisdiction` varchar(10) NOT NULL,
  `claim_type` varchar(64) NOT NULL,
  `element_name` varchar(128) NOT NULL,
  `required_evidence_types` json NOT NULL,
  `validation_logic` text NOT NULL,
  `created_at_cvr` bigint NOT NULL,
  UNIQUE INDEX `idx_cvr2_unique` (`jurisdiction`, `claim_type`, `element_name`),
  INDEX `idx_cvr2_jurisdiction` (`jurisdiction`),
  INDEX `idx_cvr2_claim_type` (`claim_type`),
  INDEX `idx_cvr2_element` (`element_name`)
);

-- ─── Remedy Feasibility Rules v2 (jurisdiction-aware, from team JSON) ─────────
CREATE TABLE IF NOT EXISTS `remedy_feasibility_rules_v2` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `jurisdiction` varchar(10) NOT NULL,
  `strategy_type` varchar(64) NOT NULL,
  `cost_range` varchar(64) NOT NULL,
  `time_estimate` varchar(128) NOT NULL,
  `prerequisites` json NOT NULL,
  `risk_flags` json NOT NULL,
  `created_at_rfr` bigint NOT NULL,
  UNIQUE INDEX `idx_rfr2_unique` (`jurisdiction`, `strategy_type`),
  INDEX `idx_rfr2_jurisdiction` (`jurisdiction`),
  INDEX `idx_rfr2_strategy` (`strategy_type`)
);

-- ─── Case State ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `case_state` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `case_id` int NOT NULL,
  `user_id` int NOT NULL,
  `procedural_path_id` int,
  `procedural_path_label` varchar(256),
  `remedy_strategy_id` int,
  `remedy_strategy_label` varchar(256),
  `claim_type_cs` varchar(64),
  `committed_finding_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_barrier_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_benefit_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_signal_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_statute_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_foia_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `committed_filing_ids` json NOT NULL DEFAULT (JSON_ARRAY()),
  `completeness_score` int NOT NULL DEFAULT 0,
  `completeness_breakdown` json,
  `computed_deadlines` json,
  `next_actions` json,
  `created_at_cs` bigint NOT NULL,
  `updated_at_cs` bigint NOT NULL,
  UNIQUE INDEX `idx_case_state_case` (`case_id`),
  INDEX `idx_case_state_user` (`user_id`)
);

-- ─── Case Flags ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `case_flags` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `case_id` int NOT NULL,
  `user_id` int NOT NULL,
  `flag_type` enum('system','user') NOT NULL DEFAULT 'user',
  `location` varchar(128) NOT NULL,
  `target_id` int,
  `target_type` varchar(64),
  `message` text NOT NULL,
  `flag_status` enum('open','resolved') NOT NULL DEFAULT 'open',
  `area_name` varchar(256),
  `state_code` varchar(10),
  `lat` double,
  `lng` double,
  `created_at_cf` bigint NOT NULL,
  `resolved_at_cf` bigint,
  INDEX `idx_case_flags_case` (`case_id`),
  INDEX `idx_case_flags_type` (`flag_type`),
  INDEX `idx_case_flags_status` (`flag_status`),
  INDEX `idx_case_flags_location` (`location`)
);

-- ─── FOIA Tracker Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `foia_tracker_requests` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `case_id` int,
  `user_id` int NOT NULL,
  `agency_name` varchar(256) NOT NULL,
  `agency_address` text,
  `agency_email` varchar(256),
  `request_subject` varchar(512) NOT NULL,
  `request_body` text NOT NULL,
  `requested_records` text,
  `foia_status` enum('draft','sent','acknowledged','response_received','appealed','closed') NOT NULL DEFAULT 'draft',
  `sent_at` bigint,
  `sent_method` enum('email','portal','mail','fax'),
  `sent_to` varchar(512),
  `acknowledged_at` bigint,
  `response_received_at` bigint,
  `response_notes` text,
  `response_document_url` varchar(1024),
  `statutory_deadline_days` int DEFAULT 20,
  `deadline_date` bigint,
  `attached_to_case_at` bigint,
  `generated_letter_url` varchar(1024),
  `created_at_ftr` bigint NOT NULL,
  `updated_at_ftr` bigint NOT NULL,
  INDEX `idx_foia_tracker_case` (`case_id`),
  INDEX `idx_foia_tracker_user` (`user_id`),
  INDEX `idx_foia_tracker_status` (`foia_status`)
);
