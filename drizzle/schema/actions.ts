/**
 * Actions Domain Schema
 * Workflows, deadlines, escalations, resolutions, procedural actions
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const case_workflows = sqliteTable("case_workflows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  workflow_id: integer("workflow_id").notNull(),
  workflow_status: text("workflow_status").notNull().default("pending"), // pending, in_progress, completed, escalated
  started_at: integer("started_at"),
  completed_at: integer("completed_at"),
});

export const workflow_instances = sqliteTable("workflow_instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_workflow_id: integer("case_workflow_id").notNull(),
  step_id: integer("step_id").notNull(),
  step_status: text("step_status").notNull().default("pending"), // pending, in_progress, completed, skipped, blocked
  started_at: integer("started_at"),
  completed_at: integer("completed_at"),
  notes: text("notes"),
});

export const case_deadlines = sqliteTable("case_deadlines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  deadline_type: text("deadline_type").notNull(), // filing, appeal, response, hearing
  deadline_date: integer("deadline_date").notNull(),
  statute_reference: text("statute_reference"),
  status: text("status").notNull().default("active"), // active, met, missed, extended
  created_at: integer("created_at").notNull(),
});

export const escalation_instances = sqliteTable("escalation_instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  escalation_level: integer("escalation_level").notNull(),
  escalation_to: text("escalation_to").notNull(),
  escalation_reason: text("escalation_reason"),
  escalated_at: integer("escalated_at").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, resolved
});

export const available_actions = sqliteTable("available_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  action_type: text("action_type").notNull(), // file_complaint, appeal, request_records, escalate
  action_template_id: text("action_template_id"),
  required_inputs: text("required_inputs"), // JSON
  available_from: integer("available_from"),
  available_until: integer("available_until"),
  created_at: integer("created_at").notNull(),
});

export const action_instances = sqliteTable("action_instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  available_action_id: integer("available_action_id"),
  action_status: text("action_status").notNull().default("pending"), // pending, in_progress, completed, failed
  action_details: text("action_details"), // JSON
  executed_at: integer("executed_at"),
  completed_at: integer("completed_at"),
});
