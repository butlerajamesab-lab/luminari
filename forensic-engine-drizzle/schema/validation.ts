/**
 * Validation Domain Schema
 * Claim rules, validation failures, canonical mappings
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const claim_rules = sqliteTable("claim_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claim_type: text("claim_type").notNull().unique(),
  required_elements: text("required_elements"), // JSON array
  validation_logic: text("validation_logic"),
  statute_references: text("statute_references"), // JSON array
  created_at: integer("created_at").notNull(),
});

export const validation_failures = sqliteTable("validation_failures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  claim_id: integer("claim_id"),
  failure_type: text("failure_type").notNull(), // missing_element, contradicts_statute, insufficient_evidence
  failure_description: text("failure_description"),
  severity: text("severity"), // low, medium, high
  remediation_path: text("remediation_path"),
  created_at: integer("created_at").notNull(),
});

export const canonical_mappings = sqliteTable("canonical_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source_value: text("source_value").notNull(),
  source_domain: text("source_domain").notNull(), // claim_type, jurisdiction, agency, statute
  canonical_value: text("canonical_value").notNull(),
  mapping_authority: text("mapping_authority"), // statute, doctrine, admin_guidance
  created_at: integer("created_at").notNull(),
  UNIQUE: "source_domain, source_value",
});

export const normalization_rules = sqliteTable("normalization_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rule_type: text("rule_type").notNull(), // claim_type, jurisdiction, agency, statute
  input_pattern: text("input_pattern"),
  output_canonical: text("output_canonical").notNull(),
  priority: integer("priority").default(100),
  created_at: integer("created_at").notNull(),
});
