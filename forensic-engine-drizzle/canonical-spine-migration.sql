-- ═══════════════════════════════════════════════════════════════════════
-- CANONICAL SPINE MIGRATION — Implementation Package (Proof Stream Prep)
-- ═══════════════════════════════════════════════════════════════════════
-- 
-- 1. ALTER ingested_records: add source_hash, stream_id, metadata_l1_l2
-- 2. ALTER detected_signals: add parent_record_id, sunam_status, forensic_logic
-- 3. ALTER remedy_paths: add signal_id_rp, route_direction, target_node_id, block_reason, canonical_remedy_status
-- 4. CREATE signal_flow_logs (L7 — read-only visibility)
-- 5. CREATE world_nodes (L10 — sovereign domain, metadata carrier)

-- ─── 1. ingested_records: canonical columns ───
ALTER TABLE `ingested_records` ADD COLUMN `source_hash` VARCHAR(128) NULL;
ALTER TABLE `ingested_records` ADD COLUMN `stream_id_ir` VARCHAR(128) NULL;
ALTER TABLE `ingested_records` ADD COLUMN `metadata_l1_l2` JSON NULL;

-- ─── 2. detected_signals: canonical columns ───
ALTER TABLE `detected_signals` ADD COLUMN `parent_record_id` INT NULL;
ALTER TABLE `detected_signals` ADD COLUMN `sunam_status` VARCHAR(32) NULL;
ALTER TABLE `detected_signals` ADD COLUMN `forensic_logic` JSON NULL;

-- ─── 3. remedy_paths: canonical columns ───
ALTER TABLE `remedy_paths` ADD COLUMN `signal_id_rp` VARCHAR(64) NULL;
ALTER TABLE `remedy_paths` ADD COLUMN `route_direction` VARCHAR(16) NULL;
ALTER TABLE `remedy_paths` ADD COLUMN `target_node_id` INT NULL;
ALTER TABLE `remedy_paths` ADD COLUMN `block_reason` TEXT NULL;
ALTER TABLE `remedy_paths` ADD COLUMN `canonical_remedy_status` VARCHAR(32) NULL;
ALTER TABLE `remedy_paths` ADD INDEX `idx_rp_signal` (`signal_id_rp`);
ALTER TABLE `remedy_paths` ADD INDEX `idx_rp_direction` (`route_direction`);
ALTER TABLE `remedy_paths` ADD INDEX `idx_rp_target_node` (`target_node_id`);

-- ─── 4. signal_flow_logs: L7 read-only visibility ───
CREATE TABLE IF NOT EXISTS `signal_flow_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `signal_id_sfl` VARCHAR(64) NOT NULL,
  `vector_path` VARCHAR(512) NOT NULL,
  `flow_density` DECIMAL(8, 4) NOT NULL,
  `visibility_metadata` JSON NOT NULL,
  `processed_at` BIGINT NOT NULL,
  INDEX `idx_sfl_signal` (`signal_id_sfl`),
  INDEX `idx_sfl_vector` (`vector_path`(255)),
  INDEX `idx_sfl_processed` (`processed_at`)
);

-- ─── 5. world_nodes: L10 sovereign domain ───
CREATE TABLE IF NOT EXISTS `world_nodes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `biome_type` VARCHAR(64) NOT NULL,
  `node_name_wn` VARCHAR(512) NOT NULL,
  `latitude` DECIMAL(10, 7) NULL,
  `longitude` DECIMAL(10, 7) NULL,
  `metadata_l10` JSON NOT NULL,
  `active_remedy` BOOLEAN NOT NULL DEFAULT FALSE,
  `last_verified_at_wn` BIGINT NOT NULL,
  `created_at_wn` BIGINT NOT NULL,
  `updated_at_wn` BIGINT NOT NULL,
  INDEX `idx_wn_biome` (`biome_type`),
  INDEX `idx_wn_name` (`node_name_wn`(255)),
  INDEX `idx_wn_active` (`active_remedy`),
  INDEX `idx_wn_verified` (`last_verified_at_wn`)
);
