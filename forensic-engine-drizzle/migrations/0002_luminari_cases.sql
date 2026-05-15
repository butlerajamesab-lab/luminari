-- Luminari Cases: User-owned case data for Action Engine
CREATE TABLE IF NOT EXISTS `luminari_cases` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int,
  `jurisdictionId` int NOT NULL COMMENT 'FK to luminari_registry.jurisdictions',
  `category` varchar(64) NOT NULL COMMENT 'housing, employment, benefits, healthcare, disability, other',
  `selectedWorkflowId` int NOT NULL COMMENT 'FK to luminari_registry.layer2_workflows',
  `status` enum('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  INDEX `idx_luminari_cases_user` (`userId`),
  INDEX `idx_luminari_cases_jurisdiction` (`jurisdictionId`),
  INDEX `idx_luminari_cases_workflow` (`selectedWorkflowId`),
  INDEX `idx_luminari_cases_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Luminari Case Notes: User-owned notes
CREATE TABLE IF NOT EXISTS `luminari_case_notes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `content` text NOT NULL,
  `createdAt` bigint NOT NULL,
  INDEX `idx_case_notes_case` (`caseId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Luminari Case Events: Action tracking
CREATE TABLE IF NOT EXISTS `luminari_case_events` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `eventType` varchar(64) NOT NULL COMMENT 'step_completed, action_recorded, note_added, status_changed',
  `eventData` json NOT NULL,
  `createdAt` bigint NOT NULL,
  INDEX `idx_case_events_case` (`caseId`),
  INDEX `idx_case_events_type` (`eventType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Luminari Case Actions: User actions taken
CREATE TABLE IF NOT EXISTS `luminari_case_actions` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `caseId` int NOT NULL,
  `actionType` varchar(64) NOT NULL COMMENT 'step_completed, contact_made, document_filed, etc.',
  `metadata` json NOT NULL,
  `createdAt` bigint NOT NULL,
  INDEX `idx_case_actions_case` (`caseId`),
  INDEX `idx_case_actions_type` (`actionType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
