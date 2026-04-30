/**
 * Admin Domain Schema
 * System health, constitutional tests, audit logs, drift detection
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const system_health = sqliteTable("system_health", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  health_check_type: text("health_check_type").notNull(), // registry_backbone, validation_layer, interpretation_layer, procedural_layer, signal_layer
  status: text("status").notNull(), // healthy, degraded, failed
  last_check: integer("last_check").notNull(),
  details: text("details"), // JSON
});

export const constitutional_test_runs = sqliteTable("constitutional_test_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  test_type: text("test_type").notNull(), // same_snapshot_same_output, no_write_side_effects, no_shadow_interpreter, action_gate, export_gate, fallback_visibility, ordering_determinism, data_readiness_visibility, workflow_completeness, drift_stop
  test_status: text("test_status").notNull(), // passed, failed, skipped
  test_details: text("test_details"), // JSON
  run_at: integer("run_at").notNull(),
});

export const interpretation_trace_log = sqliteTable("interpretation_trace_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  claim_id: integer("claim_id"),
  rule_id: text("rule_id"),
  rule_source: text("rule_source"), // statute, doctrine, template, fallback, unknown
  resolution_path: text("resolution_path"), // JSON array
  fallback_used: integer("fallback_used").default(0),
  traced_at: integer("traced_at").notNull(),
});

export const admin_change_log = sqliteTable("admin_change_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  change_type: text("change_type").notNull(), // schema_update, config_change, rule_addition, bypass_attempt, drift_detected
  change_description: text("change_description"),
  changed_by: text("changed_by"),
  changed_at: integer("changed_at").notNull(),
  severity: text("severity"), // info, warning, critical
});

export const drift_detection_log = sqliteTable("drift_detection_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  drift_type: text("drift_type").notNull(), // interpretation_output_changed, action_without_interpretation, export_without_interpretation, bypass_detected
  case_id: integer("case_id"),
  drift_description: text("drift_description"),
  detected_at: integer("detected_at").notNull(),
  action_taken: text("action_taken"), // blocked, logged, escalated
});

export const backbone_coverage_metrics = sqliteTable("backbone_coverage_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metric_type: text("metric_type").notNull(), // doctrine_coverage, statute_coverage, workflow_coverage, escalation_coverage, form_coverage
  jurisdiction: text("jurisdiction"),
  claim_type: text("claim_type"),
  coverage_percentage: integer("coverage_percentage"),
  measured_at: integer("measured_at").notNull(),
});

export const fallback_usage_metrics = sqliteTable("fallback_usage_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id"),
  fallback_count: integer("fallback_count").default(0),
  fallback_types: text("fallback_types"), // JSON array
  measured_at: integer("measured_at").notNull(),
});
