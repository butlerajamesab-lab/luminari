import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: text("role").notNull().default("analyst"),
  department: text("department"),
  badgeNumber: text("badge_number"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  jurisdiction: text("jurisdiction").notNull(),
  createdAt,
  updatedAt,
});

export const problem_instances = pgTable("problem_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  record_id: text("record_id").notNull(),
  problem_type: text("problem_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  system_primary: text("system_primary").notNull(),
  validation_status: text("validation_status").default("PENDING"),
  friction_coefficient: numeric("friction_coefficient", { precision: 5, scale: 3 }),
  friction_sources: jsonb("friction_sources"),
  alignment_micro: numeric("alignment_micro", { precision: 5, scale: 3 }),
  alignment_meso: numeric("alignment_meso", { precision: 5, scale: 3 }),
  alignment_macro: numeric("alignment_macro", { precision: 5, scale: 3 }),
  alignment_system: numeric("alignment_system", { precision: 5, scale: 3 }),
  resolution_pathways: jsonb("resolution_pathways"),
  feedback_data: jsonb("feedback_data"),
  grounding_entities: jsonb("grounding_entities"),
  coordination_data: jsonb("coordination_data"),
  createdAt,
  updatedAt,
}, (table) => ({
  problemTypeIdx: index("idx_pi_problem_type").on(table.problem_type),
  jurisdictionIdx: index("idx_pi_jurisdiction").on(table.jurisdiction),
  validationIdx: index("idx_pi_validation").on(table.validation_status),
  systemPrimaryIdx: index("idx_pi_system_primary").on(table.system_primary),
}));

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  source_document: text("source_document").notNull(),
  evidence_type: text("evidence_type").notNull(),
  content: text("content"),
  provenance_hash: text("provenance_hash"),
  status: text("status").default("ACTIVE"),
  createdAt,
}, (table) => ({
  problemInstanceIdx: index("idx_ev_problem_instance").on(table.problem_instance_id),
  typeIdx: index("idx_ev_type").on(table.evidence_type),
  statusIdx: index("idx_ev_status").on(table.status),
}));

export const evidence_items = pgTable("evidence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  source_type: text("source_type"),
  source_url: text("source_url"),
  content: text("content"),
  metadata: jsonb("metadata").default({}),
  confidence: numeric("confidence", { precision: 5, scale: 3 }),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_evidence_items_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_evidence_items_problem_instance_id").on(table.problem_instance_id),
}));

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  finding_type: text("finding_type").notNull(),
  description: text("description"),
  evidence_links: jsonb("evidence_links"),
  confidence: numeric("confidence", { precision: 5, scale: 3 }),
  severity: text("severity"),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_findings_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_fi_problem_instance").on(table.problem_instance_id),
  typeIdx: index("idx_fi_type").on(table.finding_type),
}));

export const action_queue = pgTable("action_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  action_type: text("action_type").notNull(),
  description: text("description"),
  priority: integer("priority").notNull().default(5),
  status: text("status").notNull().default("pending"),
  estimated_timeline: integer("estimated_timeline"),
  success_probability: numeric("success_probability", { precision: 5, scale: 3 }),
  cascade_impact: jsonb("cascade_impact"),
  payload: jsonb("payload").default({}),
  result: jsonb("result"),
  created_by: uuid("created_by").references(() => users.id),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  error_message: text("error_message"),
  retry_count: integer("retry_count").notNull().default(0),
  max_retries: integer("max_retries").notNull().default(3),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_aq_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_aq_problem_instance").on(table.problem_instance_id),
  statusIdx: index("idx_aq_status").on(table.status),
  priorityIdx: index("idx_aq_priority").on(table.priority),
}));

export const contradictions = pgTable("contradictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  contradiction_type: text("contradiction_type"),
  description: text("description"),
  severity: text("severity"),
  evidence_ids: jsonb("evidence_ids").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_contradictions_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_contradictions_problem_instance_id").on(table.problem_instance_id),
}));

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  recommendation_type: text("recommendation_type"),
  title: text("title"),
  description: text("description"),
  priority: integer("priority").default(5),
  status: text("status").default("open"),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_recommendations_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_recommendations_problem_instance_id").on(table.problem_instance_id),
}));

export const escalations = pgTable("escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("READY"),
  escalation_type: text("escalation_type"),
  target_contact_id: uuid("target_contact_id"),
  assigned_to: uuid("assigned_to").references(() => users.id),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_escalations_case_id").on(table.case_id),
  statusIdx: index("idx_escalations_status").on(table.status),
}));

export const escalation_packets = pgTable("escalation_packets", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  escalation_id: uuid("escalation_id").references(() => escalations.id, { onDelete: "cascade" }),
  packet_type: text("packet_type"),
  status: text("status").notNull().default("draft"),
  payload: jsonb("payload").default({}),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_escalation_packets_case_id").on(table.case_id),
  escalationIdx: index("idx_escalation_packets_escalation_id").on(table.escalation_id),
}));

export const escalation_routes = pgTable("escalation_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  route_name: text("route_name"),
  route_type: text("route_type"),
  target_contact_ids: jsonb("target_contact_ids").default([]),
  criteria: jsonb("criteria").default({}),
  is_active: boolean("is_active").notNull().default(true),
  createdAt,
  updatedAt,
}, (table) => ({
  caseIdx: index("idx_escalation_routes_case_id").on(table.case_id),
}));

export const escalation_contacts = pgTable("escalation_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  title: text("title"),
  organization: text("organization"),
  entity_name: text("entity_name"),
  entity_type: text("entity_type"),
  jurisdiction: text("jurisdiction"),
  jurisdiction_level: text("jurisdiction_level"),
  jurisdiction_code: text("jurisdiction_code"),
  contact_type: text("contact_type"),
  contact_value: text("contact_value"),
  escalation_type: text("escalation_type"),
  trigger_signals: jsonb("trigger_signals").default([]),
  phone: text("phone"),
  email: text("email"),
  web_url: text("web_url"),
  form_url: text("form_url"),
  mailing_address: text("mailing_address"),
  contact_notes: text("contact_notes"),
  metadata: jsonb("metadata").default({}),
  escalation_routes: jsonb("escalation_routes").default([]),
  is_active: boolean("is_active").notNull().default(true),
  is_verified: boolean("is_verified").default(false),
  last_verified: timestamp("last_verified", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => ({
  jurisdictionIdx: index("idx_ec_jurisdiction").on(table.jurisdiction),
  jurisdictionCodeIdx: index("idx_ec_jurisdiction_code").on(table.jurisdiction_code),
  escalationTypeIdx: index("idx_ec_escalation_type").on(table.escalation_type),
}));

export const provenance_log = pgTable("provenance_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  transition_id: text("transition_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  from_library: text("from_library").notNull(),
  to_library: text("to_library").notNull(),
  status: text("status").notNull(),
  failure_type: text("failure_type"),
  reasons: jsonb("reasons"),
  object_types: jsonb("object_types"),
  provenance_ref: text("provenance_ref"),
  entity_type: text("entity_type"),
  entity_id: uuid("entity_id"),
  operation: text("operation"),
  caller: text("caller"),
  payload_hash: text("payload_hash"),
}, (table) => ({
  entityTypeIdx: index("idx_pl_entity_type").on(table.entity_type),
  entityIdIdx: index("idx_pl_entity_id").on(table.entity_id),
  timestampIdx: index("idx_pl_timestamp").on(table.timestamp),
  statusIdx: index("idx_pl_status").on(table.status),
}));

export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_type: text("entity_type").notNull(),
  entity_id: uuid("entity_id"),
  action: text("action").notNull(),
  user_id: uuid("user_id").references(() => users.id),
  changes: jsonb("changes"),
  createdAt,
});

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  agency_name: text("agency_name").notNull(),
  agency_type: text("agency_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  authority: text("authority"),
  metadata: jsonb("metadata").default({}),
  createdAt,
});

export const statutes = pgTable("statutes", {
  id: uuid("id").primaryKey().defaultRandom(),
  statute_code: text("statute_code").notNull(),
  title: text("title").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  content: text("content"),
  effective_date: timestamp("effective_date", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
  createdAt,
});

export const constitutional_tests = pgTable("constitutional_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  test_type: text("test_type").notNull(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  test_status: text("test_status").notNull(),
  results: jsonb("results"),
  failure_reason: text("failure_reason"),
  createdAt,
});

export const ingested_records = pgTable("ingested_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  source_hash: text("source_hash").notNull(),
  stream_id: text("stream_id"),
  raw_payload: jsonb("raw_payload").notNull(),
  metadata_l1_l3: jsonb("metadata_l1_l3"),
  createdAt,
});

export const detected_signals = pgTable("detected_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  parent_id: uuid("parent_id").references(() => ingested_records.id, { onDelete: "cascade" }),
  signal_type: text("signal_type").notNull(),
  severity: integer("severity").notNull(),
  sunam_status: text("sunam_status").default("GATED"),
  forensic_logic: jsonb("forensic_logic"),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  createdAt,
});

export const ontology_registry = pgTable("ontology_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  term_key: text("term_key").notNull(),
  definition: text("definition").notNull(),
  remedy_weights: jsonb("remedy_weights"),
  createdAt,
});

export const patterns = pgTable("patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern_type: text("pattern_type").notNull(),
  description: text("description"),
  signal_ids: jsonb("signal_ids"),
  confidence: numeric("confidence", { precision: 5, scale: 3 }),
  severity: integer("severity"),
  createdAt,
});

export const remedy_paths = pgTable("remedy_paths", {
  id: uuid("id").primaryKey().defaultRandom(),
  signal_id: uuid("signal_id").references(() => detected_signals.id, { onDelete: "cascade" }),
  route_direction: text("route_direction").notNull(),
  target_artifact_id: text("target_artifact_id"),
  remedy_status: text("remedy_status"),
  createdAt,
});

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  workflow_type: text("workflow_type").notNull(),
  status: text("status").notNull(),
  steps: jsonb("steps"),
  createdAt,
  updatedAt,
});

export const world_nodes = pgTable("world_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  biome_type: text("biome_type").notNull(),
  node_name: text("node_name").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  metadata_l10: jsonb("metadata_l10"),
  active_remedy: boolean("active_remedy"),
  createdAt,
});

export const jurisdiction_config = pgTable("jurisdiction_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  jurisdiction_code: text("jurisdiction_code").notNull().unique(),
  jurisdiction_name: text("jurisdiction_name").notNull(),
  jurisdiction_type: text("jurisdiction_type").notNull(),
  parent_jurisdiction: text("parent_jurisdiction"),
  contact_info: jsonb("contact_info").default({}),
  statutes: jsonb("statutes").default({}),
  rules: jsonb("rules").default({}),
  is_active: boolean("is_active").notNull().default(true),
  atlas_fingerprint: text("atlas_fingerprint"),
  createdAt,
  updatedAt,
});

export const casesRelations = relations(cases, ({ many }) => ({
  evidenceItems: many(evidence_items),
  findings: many(findings),
  recommendations: many(recommendations),
  escalations: many(escalations),
}));

export const problemInstancesRelations = relations(problem_instances, ({ many }) => ({
  evidence: many(evidence),
  findings: many(findings),
  actions: many(action_queue),
}));

export type User = typeof users.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type ProblemInstance = typeof problem_instances.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type EvidenceItem = typeof evidence_items.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ActionQueueItem = typeof action_queue.$inferSelect;
export type EscalationContact = typeof escalation_contacts.$inferSelect;
export type Escalation = typeof escalations.$inferSelect;
export type EscalationPacket = typeof escalation_packets.$inferSelect;
export type EscalationRoute = typeof escalation_routes.$inferSelect;
export type ProvenanceLog = typeof provenance_log.$inferSelect;
export type InsertProblemInstance = typeof problem_instances.$inferInsert;
export type InsertEvidence = typeof evidence.$inferInsert;
export type InsertFinding = typeof findings.$inferInsert;
export type InsertActionQueueItem = typeof action_queue.$inferInsert;
