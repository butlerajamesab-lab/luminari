CREATE TABLE `raw_live_signals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `signalType` varchar(256) NOT NULL,
  `sourceId` varchar(512) NOT NULL UNIQUE,
  `value` text NOT NULL,
  `numericValue` decimal(10,2),
  `latitude` decimal(10,8),
  `longitude` decimal(11,8),
  `metadata` json,
  `timestamp` bigint NOT NULL,
  `createdAt` bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  `updatedAt` bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  PRIMARY KEY (`id`),
  INDEX `idx_rls_source_id` (`sourceId`),
  INDEX `idx_rls_signal_type` (`signalType`),
  INDEX `idx_rls_timestamp` (`timestamp`)
);
