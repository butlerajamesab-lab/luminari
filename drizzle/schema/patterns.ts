/**
 * Patterns Domain Schema
 * Pattern detection, signals, civic signals
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const patterns = sqliteTable("patterns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern_type: text("pattern_type").notNull(), // systemic_denial, geographic_gap, temporal_clustering, contradictory_rulings
  pattern_description: text("pattern_description"),
  pattern_rule: text("pattern_rule"), // JSON detection logic
  severity: text("severity"), // low, medium, high, critical
  created_at: integer("created_at").notNull(),
});

export const pattern_occurrences = sqliteTable("pattern_occurrences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id"),
  pattern_id: integer("pattern_id").notNull(),
  occurrence_count: integer("occurrence_count").default(1),
  supporting_claims: text("supporting_claims"), // JSON array of claim ids
  detected_at: integer("detected_at").notNull(),
});

export const signal_flags = sqliteTable("signal_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  signal_type: text("signal_type").notNull(), // violation, gap, contradiction, fallback, missing_backbone
  signal_description: text("signal_description"),
  severity: text("severity"), // low, medium, high, critical
  requires_action: integer("requires_action").default(0),
  created_at: integer("created_at").notNull(),
});

export const civic_signals = sqliteTable("civic_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signal_type: text("signal_type").notNull(), // action_desert, rule_absence, geographic_gap, systemic_pattern
  jurisdiction: text("jurisdiction"),
  claim_type: text("claim_type"),
  signal_description: text("signal_description"),
  affected_cases: integer("affected_cases"),
  severity: text("severity"),
  created_at: integer("created_at").notNull(),
});

export const signal_registry = sqliteTable("signal_registry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signal_name: text("signal_name").notNull().unique(),
  signal_definition: text("signal_definition"),
  trigger_conditions: text("trigger_conditions"), // JSON
  response_action: text("response_action"),
  created_at: integer("created_at").notNull(),
});
