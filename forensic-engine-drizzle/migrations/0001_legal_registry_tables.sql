-- Legal Registry Tables (Phase 2: Forms, Agencies, Escalation Paths)

-- Forms Registry: Centralized registry of all complaint forms, applications, and legal documents
CREATE TABLE IF NOT EXISTS `forms_registry` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `formName` varchar(256) NOT NULL,
  `agencyId` varchar(128) NOT NULL,
  `domain` enum('housing','employment','mental_health','benefits','consumer_protection','healthcare','elder_abuse','disability_rights','tribal','immigration','education','environmental','other') NOT NULL,
  `jurisdiction` varchar(64) NOT NULL,
  `url` text NOT NULL,
  `accessMethods` json NOT NULL,
  `filingDeadline` text,
  `requiredFields` json,
  `isActive` boolean NOT NULL DEFAULT true,
  `notes` text,
  `lastVerified` varchar(10) NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  INDEX `idx_forms_domain` (`domain`),
  INDEX `idx_forms_jurisdiction` (`jurisdiction`),
  INDEX `idx_forms_agency` (`agencyId`),
  INDEX `idx_forms_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agencies Registry: Centralized registry of all complaint-receiving agencies
CREATE TABLE IF NOT EXISTS `agencies_registry` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `agencyName` varchar(256) NOT NULL,
  `jurisdiction` varchar(64) NOT NULL,
  `domain` enum('housing','employment','mental_health','benefits','consumer_protection','healthcare','elder_abuse','disability_rights','tribal','immigration','education','environmental','other') NOT NULL,
  `agencyType` enum('federal','state','local','tribal','nonprofit') NOT NULL,
  `website` text,
  `contactMethods` json NOT NULL,
  `officialStatus` enum('active','inactive','merged','unknown') NOT NULL DEFAULT 'active',
  `notes` text,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  INDEX `idx_agencies_domain` (`domain`),
  INDEX `idx_agencies_jurisdiction` (`jurisdiction`),
  INDEX `idx_agencies_type` (`agencyType`),
  INDEX `idx_agencies_status` (`officialStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escalation Registry: Escalation pathways between agencies
CREATE TABLE IF NOT EXISTS `escalation_registry` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `fromAgencyId` varchar(128) NOT NULL,
  `toAgencyId` varchar(128) NOT NULL,
  `jurisdiction` varchar(64) NOT NULL,
  `domain` enum('housing','employment','mental_health','benefits','consumer_protection','healthcare','elder_abuse','disability_rights','tribal','immigration','education','environmental','other') NOT NULL,
  `triggerCondition` text NOT NULL,
  `pathwayDescription` text NOT NULL,
  `timeline` text,
  `simultaneousFiling` boolean NOT NULL DEFAULT false,
  `notes` text,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  INDEX `idx_escalation_from` (`fromAgencyId`),
  INDEX `idx_escalation_to` (`toAgencyId`),
  INDEX `idx_escalation_domain` (`domain`),
  INDEX `idx_escalation_jurisdiction` (`jurisdiction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mental Health Resources: Specialized registry for mental health crisis resources, CMHCs, and advocacy
CREATE TABLE IF NOT EXISTS `mental_health_resources` (
  `id` varchar(128) NOT NULL PRIMARY KEY,
  `resourceName` varchar(256) NOT NULL,
  `resourceType` enum('crisis_hotline','mobile_crisis','inpatient','outpatient_cmhc','substance_use','veteran_services','youth_adolescent','dv_trauma','legal_aid','tribal_services','urban_indian_health','advocacy') NOT NULL,
  `jurisdiction` varchar(64) NOT NULL,
  `website` text,
  `contactMethods` json NOT NULL,
  `availability` json,
  `populationServed` json,
  `servicesProvided` json,
  `eligibility` text,
  `cost` text,
  `languages` json,
  `sourceUrl` text,
  `lastVerified` varchar(10) NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  INDEX `idx_mh_type` (`resourceType`),
  INDEX `idx_mh_jurisdiction` (`jurisdiction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
