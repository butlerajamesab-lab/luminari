-- Layer 4: Meaning Layer (Legal Statutes & Case Law)
-- ============================================================================
-- This migration creates the core tables for the Meaning Layer (Layer 4)
-- which stores statutes, case law, and enforcement records for forensic analysis.

-- Legal Statutes Table
-- Stores statute citations, full text, and domain classifications
CREATE TABLE IF NOT EXISTS `legal_statutes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `jurisdiction` varchar(16) NOT NULL,
  `citation` varchar(256) NOT NULL,
  `title` varchar(512) NOT NULL,
  `fullText` mediumtext,
  `domains` json NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  KEY `idx_jurisdiction` (`jurisdiction`),
  KEY `idx_citation` (`citation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legal Case Law Table
-- Stores case citations, holdings, and domain classifications
CREATE TABLE IF NOT EXISTS `legal_case_law` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `jurisdiction` varchar(16) NOT NULL,
  `citation` varchar(512) NOT NULL,
  `caseName` varchar(512) NOT NULL,
  `holding` text,
  `domains` json NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  KEY `idx_jurisdiction` (`jurisdiction`),
  KEY `idx_citation` (`citation`),
  KEY `idx_caseName` (`caseName`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legal Enforcement Records Table
-- Stores records of enforcement actions and agency responses
CREATE TABLE IF NOT EXISTS `legal_enforcement_records` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `jurisdiction` varchar(16) NOT NULL,
  `agencyName` varchar(512) NOT NULL,
  `complaintType` varchar(256),
  `domains` json NOT NULL,
  `statutoryRequirement` text,
  `outcome` text,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  KEY `idx_jurisdiction` (`jurisdiction`),
  KEY `idx_agencyName` (`agencyName`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
