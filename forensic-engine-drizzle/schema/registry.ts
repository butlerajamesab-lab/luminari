/**
 * Registry Domain Schema
 * Doctrine, statutes, agencies, workflows, escalations, resources
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const doctrine_registry = sqliteTable("doctrine_registry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  doctrine_name: text("doctrine_name").notNull(),
  rule_id: text("rule_id").notNull().unique(),
  rule_text: text("rule_text").notNull(),
  authority_level: text("authority_level"), // federal, state, local
  jurisdiction: text("jurisdiction"),
  created_at: integer("created_at").notNull(),
});

export const legal_statutes = sqliteTable("legal_statutes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statute_code: text("statute_code").notNull(),
  section: text("section").notNull(),
  statute_title: text("statute_title"),
  statute_text: text("statute_text"),
  jurisdiction: text("jurisdiction").notNull(),
  statute_type: text("statute_type"), // civil_rights, employment, housing, benefits
  created_at: integer("created_at").notNull(),
  UNIQUE: "statute_code, section, jurisdiction",
});

export const agency_directory = sqliteTable("agency_directory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agency_code: text("agency_code").notNull(),
  agency_name: text("agency_name").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  agency_type: text("agency_type"), // federal, state, local
  contact_phone: text("contact_phone"),
  contact_email: text("contact_email"),
  website: text("website"),
  created_at: integer("created_at").notNull(),
  UNIQUE: "agency_code, jurisdiction",
});

export const workflow_master = sqliteTable("workflow_master", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflow_code: text("workflow_code").notNull(),
  workflow_title: text("workflow_title").notNull(),
  claim_type: text("claim_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  workflow_description: text("workflow_description"),
  created_at: integer("created_at").notNull(),
  UNIQUE: "workflow_code, jurisdiction",
});

export const workflow_steps = sqliteTable("workflow_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflow_id: integer("workflow_id").notNull(),
  step_number: integer("step_number").notNull(),
  step_label: text("step_label").notNull(),
  step_description: text("step_description"),
  required_documents: text("required_documents"), // JSON array
  deadline_days: integer("deadline_days"),
  created_at: integer("created_at").notNull(),
});

export const deadline_rules = sqliteTable("deadline_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claim_type: text("claim_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  deadline_type: text("deadline_type").notNull(), // filing, appeal, response
  deadline_days: integer("deadline_days").notNull(),
  statute_reference: text("statute_reference"),
  created_at: integer("created_at").notNull(),
});

export const escalation_routes = sqliteTable("escalation_routes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claim_type: text("claim_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  escalation_level: integer("escalation_level").notNull(),
  escalation_to: text("escalation_to").notNull(), // agency, court, ombudsman
  escalation_agency: text("escalation_agency"),
  escalation_contact: text("escalation_contact"),
  created_at: integer("created_at").notNull(),
});

export const remedy_templates = sqliteTable("remedy_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remedy_id: text("remedy_id").notNull().unique(),
  remedy_type: text("remedy_type").notNull(), // reinstatement, damages, injunction, reversal
  remedy_description: text("remedy_description"),
  applicable_claims: text("applicable_claims"), // JSON array
  created_at: integer("created_at").notNull(),
});
