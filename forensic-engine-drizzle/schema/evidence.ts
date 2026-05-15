/**
 * Evidence Domain Schema
 * Claims, findings, missing records
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const claims = sqliteTable("claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  claim_type: text("claim_type").notNull(), // employment_discrimination, housing_discrimination, etc.
  claim_text: text("claim_text").notNull(),
  claim_status: text("claim_status").notNull().default("unvalidated"), // unvalidated, valid, invalid, disputed
  source_quote_id: integer("source_quote_id"),
  extracted_at: integer("extracted_at").notNull(),
  validated_at: integer("validated_at"),
});

export const findings = sqliteTable("findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  finding_type: text("finding_type").notNull(), // violation, pattern, contradiction, gap
  finding_text: text("finding_text").notNull(),
  severity: text("severity"), // low, medium, high, critical
  supporting_claims: text("supporting_claims"), // JSON array of claim ids
  supporting_evidence: text("supporting_evidence"), // JSON array of quote ids
  created_at: integer("created_at").notNull(),
});

export const missing_records = sqliteTable("missing_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  record_type: text("record_type").notNull(), // application, decision, appeal, medical, employment
  record_description: text("record_description").notNull(),
  expected_source: text("expected_source"), // agency, employer, court
  gap_severity: text("gap_severity"), // low, medium, high, critical
  identified_at: integer("identified_at").notNull(),
});

export const contradictions = sqliteTable("contradictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  claim_1_id: integer("claim_1_id"),
  claim_2_id: integer("claim_2_id"),
  contradiction_type: text("contradiction_type").notNull(), // factual, temporal, legal
  contradiction_text: text("contradiction_text"),
  resolution_status: text("resolution_status").default("unresolved"), // unresolved, resolved, acknowledged
  identified_at: integer("identified_at").notNull(),
});
