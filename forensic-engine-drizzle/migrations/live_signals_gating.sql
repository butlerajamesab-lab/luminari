-- Live Signals System Phase 2: Add gating columns to live_signals table
-- These columns enable behavioral effects on downstream consumers

ALTER TABLE `live_signals`
  ADD COLUMN `effect_type_ls` ENUM('RESOURCE_STALE','PATH_INVALID','DEADLINE_APPROACHING','POLICY_CHANGE','STREAM_ANOMALY','ENTITY_RISK') NULL,
  ADD COLUMN `target_table_ls` VARCHAR(64) NULL,
  ADD COLUMN `target_id_ls` INT NULL,
  ADD COLUMN `source_url_ls` VARCHAR(1024) NULL,
  ADD COLUMN `source_timestamp_ls` BIGINT NULL,
  ADD INDEX `idx_ls_effect_type` (`effect_type_ls`),
  ADD INDEX `idx_ls_target` (`target_table_ls`, `target_id_ls`);
