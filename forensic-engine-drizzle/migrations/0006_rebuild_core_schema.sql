-- Rebuild core forensic schema (missing tables)
-- This migration recreates all core case management tables

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `openId` varchar(64) NOT NULL UNIQUE,
  `name` text,
  `email` varchar(320),
  `loginMethod` varchar(64),
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `plan` enum('free','advocacy','family_advocacy','analyst','professional','enterprise') NOT NULL DEFAULT 'free',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `lastSignedIn` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Corpus Snapshots table
CREATE TABLE IF NOT EXISTS `corpus_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `version` int NOT NULL,
  `engineVersion` varchar(256) NOT NULL,
  `documentIds` json NOT NULL,
  `documentHashes` json NOT NULL,
  `createdAt` bigint NOT NULL,
  `sealedAt` bigint,
  `status` enum('open','sealed') NOT NULL DEFAULT 'open',
  `signature` text,
  `signatureAlgorithm` varchar(64),
  `publicKeyFingerprint` varchar(128),
  UNIQUE KEY `idx_snapshot_case_version` (`caseId`, `version`),
  KEY `idx_snapshot_case` (`caseId`),
  KEY `idx_snapshot_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cases table
CREATE TABLE IF NOT EXISTS `cases` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `name` varchar(512) NOT NULL,
  `description` text,
  `domain` varchar(256),
  `container` varchar(256),
  `pipelineType` varchar(64),
  `manualLensOverrides` json,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  KEY `idx_cases_user` (`userId`),
  KEY `idx_cases_domain` (`domain`),
  KEY `idx_cases_container` (`container`),
  KEY `idx_cases_pipeline` (`pipelineType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Documents table
CREATE TABLE IF NOT EXISTS `documents` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `filename` varchar(512) NOT NULL,
  `fileType` varchar(32) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSize` int NOT NULL,
  `s3Key` varchar(512) NOT NULL,
  `s3Url` text NOT NULL,
  `sha256Hash` varchar(64) NOT NULL,
  `status` enum('uploaded','extracting','analyzing','ready','error','retrying','failed_permanent') NOT NULL DEFAULT 'uploaded',
  `errorMessage` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `textContent` mediumtext,
  `pageCount` int,
  `durationSeconds` int,
  `documentType` varchar(128),
  `documentPurpose` text,
  `aiMetadata` json,
  `createdAt` bigint NOT NULL,
  `snapshotId` int NOT NULL,
  `documentResolution` enum('active','superseded','excluded','corrupted') NOT NULL DEFAULT 'active',
  `replacedByDocumentId` int,
  `resolutionReason` text,
  KEY `idx_docs_case` (`caseId`),
  KEY `idx_docs_status` (`status`),
  UNIQUE KEY `idx_docs_hash_case` (`sha256Hash`, `caseId`),
  KEY `idx_docs_snapshot` (`snapshotId`),
  KEY `idx_docs_resolution` (`documentResolution`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quotes table
CREATE TABLE IF NOT EXISTS `quotes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `documentId` int NOT NULL,
  `quoteText` text NOT NULL,
  `pageNumber` int,
  `timestampStart` double,
  `timestampEnd` double,
  `context` text,
  `statementOrigin` enum('sworn_testimony','court_filing','discovery_disclosure','media_report','internal_memo','informal_communication','unknown') NOT NULL DEFAULT 'unknown',
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  KEY `idx_quotes_case` (`caseId`),
  KEY `idx_quotes_doc` (`documentId`),
  KEY `idx_quotes_origin` (`statementOrigin`),
  KEY `idx_quotes_lane` (`laneId`),
  KEY `idx_quotes_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Entities table
CREATE TABLE IF NOT EXISTS `entities` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `name` varchar(512) NOT NULL,
  `type` varchar(64) NOT NULL,
  `description` text,
  `aliases` json,
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  KEY `idx_entities_case` (`caseId`),
  KEY `idx_entities_name` (`name`),
  KEY `idx_entities_type` (`type`),
  KEY `idx_entities_lane` (`laneId`),
  KEY `idx_entities_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Entity Roles table
CREATE TABLE IF NOT EXISTS `entity_roles` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `entityId` int NOT NULL,
  `documentId` int NOT NULL,
  `role` varchar(128) NOT NULL,
  `quoteId` int,
  `engineVersion` varchar(256) NOT NULL,
  KEY `idx_er_entity` (`entityId`),
  KEY `idx_er_doc` (`documentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relationships table
CREATE TABLE IF NOT EXISTS `relationships` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `sourceEntityId` int NOT NULL,
  `targetEntityId` int NOT NULL,
  `relationshipType` varchar(128) NOT NULL,
  `description` text,
  `evidenceCount` int DEFAULT 0,
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  KEY `idx_rels_case` (`caseId`),
  KEY `idx_rels_source` (`sourceEntityId`),
  KEY `idx_rels_target` (`targetEntityId`),
  KEY `idx_rels_lane` (`laneId`),
  KEY `idx_rels_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relationship Evidence table
CREATE TABLE IF NOT EXISTS `relationship_evidence` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `relationshipId` int NOT NULL,
  `quoteId` int NOT NULL,
  `explanation` text,
  KEY `idx_re_rel` (`relationshipId`),
  KEY `idx_re_quote` (`quoteId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Claims table
CREATE TABLE IF NOT EXISTS `claims` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `documentId` int NOT NULL,
  `quoteId` int NOT NULL,
  `claimText` text NOT NULL,
  `claimType` varchar(64) NOT NULL,
  `dateReferenced` varchar(64),
  `entitiesInvolved` json,
  `claimStatementOrigin` enum('sworn_testimony','court_filing','discovery_disclosure','media_report','internal_memo','informal_communication','unknown') NOT NULL DEFAULT 'unknown',
  `evidentiaryWeight` enum('finding_eligible','signal_only') NOT NULL DEFAULT 'signal_only',
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  KEY `idx_claims_case` (`caseId`),
  KEY `idx_claims_doc` (`documentId`),
  KEY `idx_claims_quote` (`quoteId`),
  KEY `idx_claims_origin` (`claimStatementOrigin`),
  KEY `idx_claims_weight` (`evidentiaryWeight`),
  KEY `idx_claims_lane` (`laneId`),
  KEY `idx_claims_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Findings table
CREATE TABLE IF NOT EXISTS `findings` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text NOT NULL,
  `findingType` varchar(64) NOT NULL,
  `severity` enum('critical','high','medium','low') DEFAULT 'medium',
  `supportingClaimIds` json,
  `supportingQuoteIds` json,
  `entitiesInvolved` json,
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  KEY `idx_findings_case` (`caseId`),
  KEY `idx_findings_type` (`findingType`),
  KEY `idx_findings_severity` (`severity`),
  KEY `idx_findings_lane` (`laneId`),
  KEY `idx_findings_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Events table
CREATE TABLE IF NOT EXISTS `events` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `documentId` int,
  `eventType` varchar(64) NOT NULL,
  `eventDate` varchar(64),
  `description` text,
  `entitiesInvolved` json,
  `significance` text,
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  KEY `idx_events_case` (`caseId`),
  KEY `idx_events_doc` (`documentId`),
  KEY `idx_events_type` (`eventType`),
  KEY `idx_events_lane` (`laneId`),
  KEY `idx_events_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Signal Flags table
CREATE TABLE IF NOT EXISTS `signal_flags` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `flagType` varchar(128) NOT NULL,
  `description` text NOT NULL,
  `severity` enum('critical','high','medium','low') DEFAULT 'medium',
  `supportingQuoteIds` json,
  `entitiesInvolved` json,
  `engineVersion` varchar(256) NOT NULL,
  `laneId` varchar(256) NOT NULL,
  `snapshotId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  KEY `idx_flags_case` (`caseId`),
  KEY `idx_flags_type` (`flagType`),
  KEY `idx_flags_severity` (`severity`),
  KEY `idx_flags_lane` (`laneId`),
  KEY `idx_flags_snapshot` (`snapshotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Chat Messages table
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('user','assistant','system') NOT NULL,
  `content` text NOT NULL,
  `metadata` json,
  `createdAt` bigint NOT NULL,
  KEY `idx_chat_case` (`caseId`),
  KEY `idx_chat_user` (`userId`),
  KEY `idx_chat_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit Trail table
CREATE TABLE IF NOT EXISTS `audit_trail` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `userId` int NOT NULL,
  `action` varchar(128) NOT NULL,
  `resourceType` varchar(64) NOT NULL,
  `resourceId` int,
  `changes` json,
  `sha256Hash` varchar(64),
  `previousHash` varchar(64),
  `createdAt` bigint NOT NULL,
  KEY `idx_audit_case` (`caseId`),
  KEY `idx_audit_user` (`userId`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
