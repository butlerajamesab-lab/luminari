// ─── LEGAL REGISTRY TABLES ───
// Centralized forms, agencies, and escalation path registry
// Supports all domains: housing, employment, mental_health, benefits, consumer, healthcare, elder_abuse, disability, tribal, immigration

import { mysqlTable, varchar, text, int, json, boolean, index, uniqueIndex, mysqlEnum } from "drizzle-orm/mysql-core";

// ─── Forms Registry ───
// Centralized registry of all complaint forms, applications, and legal documents
export const formsRegistry = mysqlTable("forms_registry", {
  id: varchar("id", { length: 128 }).primaryKey(), // e.g., "form_hud_903", "form_whd_complaint_ca"
  formName: varchar("formName", { length: 256 }).notNull(), // e.g., "Housing Discrimination Complaint"
  agencyId: varchar("agencyId", { length: 128 }).notNull(), // FK to agencies_registry.id
  domain: mysqlEnum("domain", [
    "housing",
    "employment",
    "mental_health",
    "benefits",
    "consumer_protection",
    "healthcare",
    "elder_abuse",
    "disability_rights",
    "tribal",
    "immigration",
    "education",
    "environmental",
    "other"
  ]).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(), // "NATIONAL", "CA", "WA", "TRIBAL", etc.
  url: text("url").notNull(), // Direct link to form or form submission page
  accessMethods: json("accessMethods").notNull().$type<("web" | "phone" | "mail" | "walk_in" | "email")[]>(), // How to access/submit
  filingDeadline: text("filingDeadline"), // e.g., "180 days from incident", "No deadline", "30 days for appeal"
  requiredFields: json("requiredFields").$type<string[]>(), // e.g., ["name", "email", "incident_date", "description"]
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"), // Additional context, e.g., "Federal form used in all states"
  lastVerified: varchar("lastVerified", { length: 10 }).notNull(), // "2026-03-25"
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_forms_domain").on(table.domain),
  index("idx_forms_jurisdiction").on(table.jurisdiction),
  index("idx_forms_agency").on(table.agencyId),
  index("idx_forms_active").on(table.isActive),
]);

export type FormsRegistry = typeof formsRegistry.$inferSelect;
export type InsertFormsRegistry = typeof formsRegistry.$inferInsert;

// ─── Agencies Registry ───
// Centralized registry of all complaint-receiving agencies
export const agenciesRegistry = mysqlTable("agencies_registry", {
  id: varchar("id", { length: 128 }).primaryKey(), // e.g., "agency_hud_fheo", "agency_ca_crd"
  agencyName: varchar("agencyName", { length: 256 }).notNull(), // e.g., "HUD Office of Fair Housing"
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(), // "NATIONAL", "CA", "WA", "TRIBAL", etc.
  domain: mysqlEnum("domain", [
    "housing",
    "employment",
    "mental_health",
    "benefits",
    "consumer_protection",
    "healthcare",
    "elder_abuse",
    "disability_rights",
    "tribal",
    "immigration",
    "education",
    "environmental",
    "other"
  ]).notNull(),
  agencyType: mysqlEnum("agencyType", ["federal", "state", "local", "tribal", "nonprofit"]).notNull(),
  website: text("website"), // Main agency website
  contactMethods: json("contactMethods").notNull().$type<{
    phone?: string;
    web?: string;
    mail?: string;
    email?: string;
    walk_in?: string; // Address or "Yes"
  }>(),
  officialStatus: mysqlEnum("officialStatus", ["active", "inactive", "merged", "unknown"]).default("active").notNull(),
  notes: text("notes"), // e.g., "Accepts complaints for housing discrimination under Fair Housing Act"
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_agencies_domain").on(table.domain),
  index("idx_agencies_jurisdiction").on(table.jurisdiction),
  index("idx_agencies_type").on(table.agencyType),
  index("idx_agencies_status").on(table.officialStatus),
]);

export type AgenciesRegistry = typeof agenciesRegistry.$inferSelect;
export type InsertAgenciesRegistry = typeof agenciesRegistry.$inferInsert;

// ─── Escalation Registry ───
// Escalation pathways between agencies (e.g., local complaint → state → federal)
export const escalationRegistry = mysqlTable("escalation_registry", {
  id: varchar("id", { length: 128 }).primaryKey(), // e.g., "esc_housing_001"
  fromAgencyId: varchar("fromAgencyId", { length: 128 }).notNull(), // FK to agencies_registry.id
  toAgencyId: varchar("toAgencyId", { length: 128 }).notNull(), // FK to agencies_registry.id
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(), // "NATIONAL", "CA", "WA", etc.
  domain: mysqlEnum("domain", [
    "housing",
    "employment",
    "mental_health",
    "benefits",
    "consumer_protection",
    "healthcare",
    "elder_abuse",
    "disability_rights",
    "tribal",
    "immigration",
    "education",
    "environmental",
    "other"
  ]).notNull(),
  triggerCondition: text("triggerCondition").notNull(), // e.g., "Complaint filed with local agency", "Agency denies relief"
  pathwayDescription: text("pathwayDescription").notNull(), // e.g., "Local complaint can be escalated to state HRC"
  timeline: text("timeline"), // e.g., "Within 30 days", "Automatic after 180 days"
  simultaneousFiling: boolean("simultaneousFiling").default(false), // Can be filed simultaneously?
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_escalation_from").on(table.fromAgencyId),
  index("idx_escalation_to").on(table.toAgencyId),
  index("idx_escalation_domain").on(table.domain),
  index("idx_escalation_jurisdiction").on(table.jurisdiction),
]);

export type EscalationRegistry = typeof escalationRegistry.$inferSelect;
export type InsertEscalationRegistry = typeof escalationRegistry.$inferInsert;

// ─── Form Linkage (UI Integration) ───
// Maps UI components/pages to forms in the registry
// Allows dynamic form discovery without hardcoding links
export const formLinkage = mysqlTable("form_linkage", {
  id: varchar("id", { length: 128 }).primaryKey(), // e.g., "linkage_case_resolution_housing"
  componentPath: varchar("componentPath", { length: 256 }).notNull(), // e.g., "CaseResolutionLens", "BenefitsNavigator", "ShopOffice"
  formId: varchar("formId", { length: 128 }).notNull(), // FK to forms_registry.id
  displayLabel: varchar("displayLabel", { length: 256 }).notNull(), // e.g., "File Housing Complaint"
  displayOrder: int("displayOrder").default(0), // Sort order in UI
  context: text("context"), // e.g., "housing_discrimination_case", "wage_theft_investigation"
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_linkage_component").on(table.componentPath),
  index("idx_linkage_form").on(table.formId),
]);

export type FormLinkage = typeof formLinkage.$inferSelect;
export type InsertFormLinkage = typeof formLinkage.$inferInsert;

// ─── Mental Health Resources (MH Registry) ───
// Specialized registry for mental health crisis resources, CMHCs, and advocacy
export const mentalHealthResources = mysqlTable("mental_health_resources", {
  id: varchar("id", { length: 128 }).primaryKey(), // e.g., "mh_988_national", "mh_cmhc_ca_001"
  resourceName: varchar("resourceName", { length: 256 }).notNull(), // e.g., "988 Suicide & Crisis Lifeline"
  resourceType: mysqlEnum("resourceType", [
    "crisis_hotline",
    "mobile_crisis",
    "inpatient",
    "outpatient_cmhc",
    "substance_use",
    "veteran_services",
    "youth_adolescent",
    "dv_trauma",
    "legal_aid",
    "tribal_services",
    "urban_indian_health",
    "advocacy"
  ]).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(), // "NATIONAL", "CA", "WA", "TRIBAL", etc.
  website: text("website"),
  contactMethods: json("contactMethods").notNull().$type<{
    phone?: string;
    text?: string;
    chat?: string;
    web?: string;
    walk_in?: string;
    email?: string;
  }>(),
  availability: json("availability").$type<{
    hours?: string;
    is24_7?: boolean;
  }>(),
  populationServed: json("populationServed").$type<string[]>(), // e.g., ["youth", "veterans", "LGBTQ+", "Spanish-speaking"]
  servicesProvided: json("servicesProvided").$type<string[]>(), // e.g., ["crisis support", "counseling", "medication management"]
  eligibility: text("eligibility"), // e.g., "Open to all", "Residents of CA only"
  cost: text("cost"), // e.g., "Free", "Sliding scale", "Insurance accepted"
  languages: json("languages").$type<string[]>(), // e.g., ["English", "Spanish", "Mandarin"]
  sourceUrl: text("sourceUrl"), // Where this data was verified from
  lastVerified: varchar("lastVerified", { length: 10 }).notNull(), // "2026-03-25"
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_mh_type").on(table.resourceType),
  index("idx_mh_jurisdiction").on(table.jurisdiction),
]);

export type MentalHealthResources = typeof mentalHealthResources.$inferSelect;
export type InsertMentalHealthResources = typeof mentalHealthResources.$inferInsert;
