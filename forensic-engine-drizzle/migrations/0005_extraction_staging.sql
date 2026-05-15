-- Sunam Gate Data Entry Point
-- ============================================================================
-- This migration creates the extraction_staging table which serves as the
-- physical intake entry point for the Sunam Gate (ingestion pipeline).
-- Data flows: extraction_staging → sunam_gate_log → live_signals → detected_signals

CREATE TABLE IF NOT EXISTS `extraction_staging` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `datasetId` varchar(64),
  `rawContent` longtext,
  `status` varchar(50),
  `createdAt` bigint NOT NULL,
  KEY `idx_datasetId` (`datasetId`),
  KEY `idx_status` (`status`),
  KEY `idx_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
