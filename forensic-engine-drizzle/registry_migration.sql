-- Registry Ingestion Migration: 8 new tables for Luminari Registry

CREATE TABLE IF NOT EXISTS `registry_jurisdictions` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `name` text,
  `abbreviation` text,
  `fips` text,
  `type_rj` text,
  `population_rj` text,
  `medicaid_status` text,
  `minimum_wage` text,
  `ui_max` text,
  `wage_sol` text,
  `civil_rights_sol` text,
  `created_at_rj` bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS `registry_policy_alerts` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rpa` varchar(128) NOT NULL,
  `severity_rpa` text,
  `title_rpa` text,
  `description_rpa` text,
  `created_at_rpa` bigint NOT NULL
);
CREATE INDEX `idx_rpa_jurisdiction` ON `registry_policy_alerts` (`jurisdiction_id_rpa`);

CREATE TABLE IF NOT EXISTS `registry_programs` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rp` varchar(128) NOT NULL,
  `category_rp` text,
  `name_rp` text,
  `agency_rp` text,
  `eligibility_rp` text,
  `contact_rp` text,
  `website_rp` text,
  `apply_notes_rp` text,
  `fingerprint_rp` varchar(128),
  `created_at_rp` bigint NOT NULL
);
CREATE INDEX `idx_rp_jurisdiction` ON `registry_programs` (`jurisdiction_id_rp`);
CREATE INDEX `idx_rp_fingerprint` ON `registry_programs` (`fingerprint_rp`);

CREATE TABLE IF NOT EXISTS `registry_workflows` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rw` varchar(128) NOT NULL,
  `workflow_type_rw` text,
  `primary_statutes_rw` text,
  `steps_rw` json,
  `deadlines_rw` text,
  `escalation_paths_rw` text,
  `created_at_rw` bigint NOT NULL
);
CREATE INDEX `idx_rw_jurisdiction` ON `registry_workflows` (`jurisdiction_id_rw`);

CREATE TABLE IF NOT EXISTS `registry_oversight_bodies` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rob` varchar(128) NOT NULL,
  `agency_name_rob` text,
  `function_rob` text,
  `statute_of_limitations_rob` text,
  `contact_rob` text,
  `pathway_rob` text,
  `escalation_rob` text,
  `created_at_rob` bigint NOT NULL
);
CREATE INDEX `idx_rob_jurisdiction` ON `registry_oversight_bodies` (`jurisdiction_id_rob`);

CREATE TABLE IF NOT EXISTS `registry_source_traceability` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rst` varchar(128) NOT NULL,
  `source_documents_rst` json,
  `source_variants_rst` json,
  `notes_on_merge_rst` text,
  `conflicts_rst` json,
  `created_at_rst` bigint NOT NULL
);
CREATE INDEX `idx_rst_jurisdiction` ON `registry_source_traceability` (`jurisdiction_id_rst`);

CREATE TABLE IF NOT EXISTS `registry_signals` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `jurisdiction_id_rs` varchar(128) NOT NULL,
  `category_rs` text,
  `signal_type_rs` text,
  `severity_rs` text,
  `source_reference_rs` text,
  `fingerprint_rs` varchar(128),
  `created_at_rs` bigint NOT NULL
);
CREATE INDEX `idx_rs_jurisdiction` ON `registry_signals` (`jurisdiction_id_rs`);
CREATE INDEX `idx_rs_signal_type` ON `registry_signals` (`signal_type_rs`(255));
CREATE INDEX `idx_rs_fingerprint` ON `registry_signals` (`fingerprint_rs`);
