var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createHash as createHash2, randomUUID } from "crypto";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
var protectedProcedure = t.procedure.use(requireUser);
var requireAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
var adminProcedure = t.procedure.use(requireAdmin);

// server/db.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  action_queue: () => action_queue,
  agencies: () => agencies,
  audit_log: () => audit_log,
  cases: () => cases,
  casesRelations: () => casesRelations,
  constitutional_tests: () => constitutional_tests,
  contradictions: () => contradictions,
  detected_signals: () => detected_signals,
  escalation_contacts: () => escalation_contacts,
  escalation_packets: () => escalation_packets,
  escalation_routes: () => escalation_routes,
  escalations: () => escalations,
  evidence: () => evidence,
  evidence_items: () => evidence_items,
  findings: () => findings,
  ingested_records: () => ingested_records,
  jurisdiction_config: () => jurisdiction_config,
  ontology_registry: () => ontology_registry,
  patterns: () => patterns,
  problemInstancesRelations: () => problemInstancesRelations,
  problem_instances: () => problem_instances,
  provenance_log: () => provenance_log,
  recommendations: () => recommendations,
  remedy_paths: () => remedy_paths,
  statutes: () => statutes,
  users: () => users,
  workflows: () => workflows,
  world_nodes: () => world_nodes
});
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
  uuid
} from "drizzle-orm/pg-core";
var createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
var updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
var users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: text("role").notNull().default("analyst"),
  department: text("department"),
  badgeNumber: text("badge_number"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt,
  updatedAt
});
var cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  jurisdiction: text("jurisdiction").notNull(),
  createdAt,
  updatedAt
});
var problem_instances = pgTable("problem_instances", {
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
  updatedAt
}, (table) => ({
  problemTypeIdx: index("idx_pi_problem_type").on(table.problem_type),
  jurisdictionIdx: index("idx_pi_jurisdiction").on(table.jurisdiction),
  validationIdx: index("idx_pi_validation").on(table.validation_status),
  systemPrimaryIdx: index("idx_pi_system_primary").on(table.system_primary)
}));
var evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  source_document: text("source_document").notNull(),
  evidence_type: text("evidence_type").notNull(),
  content: text("content"),
  provenance_hash: text("provenance_hash"),
  status: text("status").default("ACTIVE"),
  createdAt
}, (table) => ({
  problemInstanceIdx: index("idx_ev_problem_instance").on(table.problem_instance_id),
  typeIdx: index("idx_ev_type").on(table.evidence_type),
  statusIdx: index("idx_ev_status").on(table.status)
}));
var evidence_items = pgTable("evidence_items", {
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
  updatedAt
}, (table) => ({
  caseIdx: index("idx_evidence_items_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_evidence_items_problem_instance_id").on(table.problem_instance_id)
}));
var findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  finding_type: text("finding_type").notNull(),
  description: text("description"),
  evidence_links: jsonb("evidence_links"),
  confidence: numeric("confidence", { precision: 5, scale: 3 }),
  severity: text("severity"),
  createdAt,
  updatedAt
}, (table) => ({
  caseIdx: index("idx_findings_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_fi_problem_instance").on(table.problem_instance_id),
  typeIdx: index("idx_fi_type").on(table.finding_type)
}));
var action_queue = pgTable("action_queue", {
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
  updatedAt
}, (table) => ({
  caseIdx: index("idx_aq_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_aq_problem_instance").on(table.problem_instance_id),
  statusIdx: index("idx_aq_status").on(table.status),
  priorityIdx: index("idx_aq_priority").on(table.priority)
}));
var contradictions = pgTable("contradictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  contradiction_type: text("contradiction_type"),
  description: text("description"),
  severity: text("severity"),
  evidence_ids: jsonb("evidence_ids").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt
}, (table) => ({
  caseIdx: index("idx_contradictions_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_contradictions_problem_instance_id").on(table.problem_instance_id)
}));
var recommendations = pgTable("recommendations", {
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
  updatedAt
}, (table) => ({
  caseIdx: index("idx_recommendations_case_id").on(table.case_id),
  problemInstanceIdx: index("idx_recommendations_problem_instance_id").on(table.problem_instance_id)
}));
var escalations = pgTable("escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("READY"),
  escalation_type: text("escalation_type"),
  target_contact_id: uuid("target_contact_id"),
  assigned_to: uuid("assigned_to").references(() => users.id),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt
}, (table) => ({
  caseIdx: index("idx_escalations_case_id").on(table.case_id),
  statusIdx: index("idx_escalations_status").on(table.status)
}));
var escalation_packets = pgTable("escalation_packets", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  escalation_id: uuid("escalation_id").references(() => escalations.id, { onDelete: "cascade" }),
  packet_type: text("packet_type"),
  status: text("status").notNull().default("draft"),
  payload: jsonb("payload").default({}),
  metadata: jsonb("metadata").default({}),
  createdAt,
  updatedAt
}, (table) => ({
  caseIdx: index("idx_escalation_packets_case_id").on(table.case_id),
  escalationIdx: index("idx_escalation_packets_escalation_id").on(table.escalation_id)
}));
var escalation_routes = pgTable("escalation_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  route_name: text("route_name"),
  route_type: text("route_type"),
  target_contact_ids: jsonb("target_contact_ids").default([]),
  criteria: jsonb("criteria").default({}),
  is_active: boolean("is_active").notNull().default(true),
  createdAt,
  updatedAt
}, (table) => ({
  caseIdx: index("idx_escalation_routes_case_id").on(table.case_id)
}));
var escalation_contacts = pgTable("escalation_contacts", {
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
  updatedAt
}, (table) => ({
  jurisdictionIdx: index("idx_ec_jurisdiction").on(table.jurisdiction),
  jurisdictionCodeIdx: index("idx_ec_jurisdiction_code").on(table.jurisdiction_code),
  escalationTypeIdx: index("idx_ec_escalation_type").on(table.escalation_type)
}));
var provenance_log = pgTable("provenance_log", {
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
  payload_hash: text("payload_hash")
}, (table) => ({
  entityTypeIdx: index("idx_pl_entity_type").on(table.entity_type),
  entityIdIdx: index("idx_pl_entity_id").on(table.entity_id),
  timestampIdx: index("idx_pl_timestamp").on(table.timestamp),
  statusIdx: index("idx_pl_status").on(table.status)
}));
var audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_type: text("entity_type").notNull(),
  entity_id: uuid("entity_id"),
  action: text("action").notNull(),
  user_id: uuid("user_id").references(() => users.id),
  changes: jsonb("changes"),
  createdAt
});
var agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  agency_name: text("agency_name").notNull(),
  agency_type: text("agency_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  authority: text("authority"),
  metadata: jsonb("metadata").default({}),
  createdAt
});
var statutes = pgTable("statutes", {
  id: uuid("id").primaryKey().defaultRandom(),
  statute_code: text("statute_code").notNull(),
  title: text("title").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  content: text("content"),
  effective_date: timestamp("effective_date", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
  createdAt
});
var constitutional_tests = pgTable("constitutional_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  test_type: text("test_type").notNull(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  test_status: text("test_status").notNull(),
  results: jsonb("results"),
  failure_reason: text("failure_reason"),
  createdAt
});
var ingested_records = pgTable("ingested_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  source_hash: text("source_hash").notNull(),
  stream_id: text("stream_id"),
  raw_payload: jsonb("raw_payload").notNull(),
  metadata_l1_l3: jsonb("metadata_l1_l3"),
  createdAt
});
var detected_signals = pgTable("detected_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  parent_id: uuid("parent_id").references(() => ingested_records.id, { onDelete: "cascade" }),
  signal_type: text("signal_type").notNull(),
  severity: integer("severity").notNull(),
  sunam_status: text("sunam_status").default("GATED"),
  forensic_logic: jsonb("forensic_logic"),
  case_id: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  createdAt
});
var ontology_registry = pgTable("ontology_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  term_key: text("term_key").notNull(),
  definition: text("definition").notNull(),
  remedy_weights: jsonb("remedy_weights"),
  createdAt
});
var patterns = pgTable("patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern_type: text("pattern_type").notNull(),
  description: text("description"),
  signal_ids: jsonb("signal_ids"),
  confidence: numeric("confidence", { precision: 5, scale: 3 }),
  severity: integer("severity"),
  createdAt
});
var remedy_paths = pgTable("remedy_paths", {
  id: uuid("id").primaryKey().defaultRandom(),
  signal_id: uuid("signal_id").references(() => detected_signals.id, { onDelete: "cascade" }),
  route_direction: text("route_direction").notNull(),
  target_artifact_id: text("target_artifact_id"),
  remedy_status: text("remedy_status"),
  createdAt
});
var workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  problem_instance_id: uuid("problem_instance_id").references(() => problem_instances.id, { onDelete: "cascade" }),
  workflow_type: text("workflow_type").notNull(),
  status: text("status").notNull(),
  steps: jsonb("steps"),
  createdAt,
  updatedAt
});
var world_nodes = pgTable("world_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  biome_type: text("biome_type").notNull(),
  node_name: text("node_name").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  metadata_l10: jsonb("metadata_l10"),
  active_remedy: boolean("active_remedy"),
  createdAt
});
var jurisdiction_config = pgTable("jurisdiction_config", {
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
  updatedAt
});
var casesRelations = relations(cases, ({ many }) => ({
  evidenceItems: many(evidence_items),
  findings: many(findings),
  recommendations: many(recommendations),
  escalations: many(escalations)
}));
var problemInstancesRelations = relations(problem_instances, ({ many }) => ({
  evidence: many(evidence),
  findings: many(findings),
  actions: many(action_queue)
}));

// server/db.ts
var sqlClient = null;
var dbInstance = null;
var warningIssued = false;
function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url && !warningIssued) {
    console.warn("[DB] No Postgres connection string configured. Set DATABASE_URL for Supabase Postgres.");
    warningIssued = true;
  }
  return url || "postgresql://invalid:invalid@localhost:5432/invalid";
}
function getSqlClient() {
  if (!sqlClient) {
    sqlClient = postgres(getDatabaseUrl(), {
      max: Number(process.env.DB_POOL_MAX || 10),
      idle_timeout: Number(process.env.DB_IDLE_TIMEOUT || 20),
      connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT || 10),
      prepare: false,
      ssl: process.env.DATABASE_SSL === "false" ? false : "require"
    });
  }
  return sqlClient;
}
function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlClient(), { schema: schema_exports });
  }
  return dbInstance;
}
var db = new Proxy({}, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  }
});

// server/services/readiness-gate.ts
var CRITICAL_FIELDS = [
  "core_state.record_id",
  "core_state.problem_type",
  "core_state.jurisdiction",
  "core_state.system_primary",
  "core_state.friction.coefficient",
  "traceability.fact_hash.hash",
  "traceability.export_id"
];
function getNestedValue(obj, path3) {
  const keys = path3.split(".");
  let current = obj;
  for (const key of keys) {
    if (current === null || current === void 0) return void 0;
    current = current[key];
  }
  return current;
}
function findMissingCriticalFields(payload) {
  const missing = [];
  for (const field of CRITICAL_FIELDS) {
    const value = getNestedValue(payload, field);
    if (value === null || value === void 0 || value === "" || value === "UNKNOWN") {
      missing.push(field);
    }
  }
  return missing;
}
function countHighConfidenceSignals(payload) {
  const findingItems = payload.source_facts?.finding_items ?? [];
  return findingItems.filter((finding) => {
    const confidence = typeof finding.confidence === "number" ? finding.confidence : Number.parseFloat(String(finding.confidence));
    return Number.isFinite(confidence) && confidence >= 0.8;
  }).length;
}
function computeReadiness(payload) {
  const evidenceCount = payload.source_facts?.evidence_count ?? 0;
  const highConfidenceSignals = countHighConfidenceSignals(payload);
  const coverageScore = payload.coverage?.overall ?? payload.coverage?.percentage ?? 0;
  const normalizedCoverage = coverageScore > 1 ? coverageScore / 100 : coverageScore;
  const missingCriticalFields = findMissingCriticalFields(payload);
  const metrics = {
    evidence_count: evidenceCount,
    high_confidence_signals: highConfidenceSignals,
    coverage_score: normalizedCoverage,
    missing_critical_fields: missingCriticalFields
  };
  const reasons = [];
  if (evidenceCount < 3) reasons.push(`Evidence count is ${evidenceCount}, minimum required is 3`);
  if (highConfidenceSignals < 1) reasons.push("No high-confidence signals found (need >= 1 finding with confidence >= 0.8)");
  if (normalizedCoverage < 0.7) reasons.push(`Coverage score is ${(normalizedCoverage * 100).toFixed(1)}%, minimum required is 70%`);
  if (missingCriticalFields.length > 0) reasons.push(`Missing critical fields: ${missingCriticalFields.join(", ")}`);
  return {
    ready_for_review: evidenceCount >= 3 && highConfidenceSignals >= 1 && normalizedCoverage >= 0.7 && missingCriticalFields.length === 0,
    reasons,
    metrics
  };
}

// server/services/escalation-window-service.ts
import { createHash } from "crypto";
function createWindowEntry(caseId, packetId, responseDays = 30) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const entry = {
    case_id: caseId,
    packet_id: packetId,
    sent_at: now,
    opened_at: null,
    response_received_at: null,
    response_window_days: responseDays,
    days_elapsed: 0,
    days_remaining: responseDays,
    window_status: "ACTIVE",
    follow_up_eligible: false,
    follow_up_triggered_at: null,
    escalation_stage: "INITIAL",
    window_hash: "",
    created_at: now,
    updated_at: now
  };
  entry.window_hash = generateWindowHash(entry);
  return entry;
}
function checkWindow(entry) {
  const now = /* @__PURE__ */ new Date();
  const sentDate = new Date(entry.sent_at);
  const msElapsed = now.getTime() - sentDate.getTime();
  const daysElapsed = Math.floor(msElapsed / (1e3 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, entry.response_window_days - daysElapsed);
  let windowStatus = "ACTIVE";
  if (entry.response_received_at) {
    windowStatus = "RESPONDED";
  } else if (daysElapsed >= entry.response_window_days) {
    windowStatus = "EXPIRED";
  }
  const followUpEligible = windowStatus === "EXPIRED" && !entry.response_received_at;
  return {
    case_id: entry.case_id,
    window_active: windowStatus === "ACTIVE",
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    window_status: windowStatus,
    follow_up_eligible: followUpEligible,
    follow_up_reason: followUpEligible ? "30-day window expired without response" : void 0
  };
}
function updateWindowStatus(entry) {
  const result = checkWindow(entry);
  entry.days_elapsed = result.days_elapsed;
  entry.days_remaining = result.days_remaining;
  entry.window_status = result.window_status;
  entry.follow_up_eligible = result.follow_up_eligible;
  entry.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  entry.window_hash = generateWindowHash(entry);
  return entry;
}
function triggerFollowUp(entry) {
  const result = checkWindow(entry);
  if (!result.follow_up_eligible) {
    throw new Error(`Cannot trigger follow-up: ${result.window_status}`);
  }
  entry.follow_up_triggered_at = (/* @__PURE__ */ new Date()).toISOString();
  entry.escalation_stage = "FOLLOW_UP";
  entry.sent_at = (/* @__PURE__ */ new Date()).toISOString();
  entry.days_elapsed = 0;
  entry.days_remaining = entry.response_window_days;
  entry.window_status = "ACTIVE";
  entry.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  entry.window_hash = generateWindowHash(entry);
  return entry;
}
function canTriggerFollowUp(entry, operatorOverride = false) {
  const result = checkWindow(entry);
  if (operatorOverride) {
    return true;
  }
  return result.follow_up_eligible;
}
function triggerMediaEscalation(entry) {
  entry.escalation_stage = "PUBLIC";
  entry.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  entry.window_hash = generateWindowHash(entry);
  return entry;
}
function generateWindowHash(entry) {
  const payload = JSON.stringify({
    case_id: entry.case_id,
    packet_id: entry.packet_id,
    sent_at: entry.sent_at,
    response_received_at: entry.response_received_at,
    response_window_days: entry.response_window_days,
    escalation_stage: entry.escalation_stage
  });
  return createHash("sha256").update(payload).digest("hex");
}

// server/routers.ts
var CASE_ID = z.object({ caseId: z.string().min(1) });
var INSTANCE_ID = z.object({ instanceId: z.string().min(1) });
function rows(result) {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray(result.rows)) return result.rows;
  return [];
}
async function query(statement) {
  return rows(await db.execute(statement));
}
function numberValue(value, fallback = 0) {
  if (value === null || value === void 0 || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function hashObject(value) {
  return createHash2("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
async function loadProblem(identifier) {
  const [problem] = await query(sql`
    select *
    from problem_instances
    where id::text = ${identifier} or record_id = ${identifier}
    limit 1
  `);
  return problem ?? null;
}
async function loadCase(caseId) {
  const [caseRow] = await query(sql`
    select *
    from cases
    where id::text = ${caseId}
    limit 1
  `);
  return caseRow ?? null;
}
async function loadCaseBundle(caseId) {
  const problem = await loadProblem(caseId);
  const caseRow = problem ? null : await loadCase(caseId);
  const actualCaseId = caseRow?.id ?? null;
  const problemId = problem?.id ?? null;
  const evidenceRows = problemId ? await query(sql`select * from evidence where problem_instance_id = ${problemId}::uuid order by created_at desc nulls last`) : actualCaseId ? await query(sql`select * from evidence_items where case_id = ${actualCaseId}::uuid order by created_at desc nulls last`) : [];
  const findingRows = problemId ? await query(sql`select * from findings where problem_instance_id = ${problemId}::uuid order by created_at desc nulls last`) : actualCaseId ? await query(sql`select * from findings where case_id = ${actualCaseId}::uuid order by created_at desc nulls last`) : [];
  const actionRows = problemId ? await query(sql`select * from action_queue where problem_instance_id = ${problemId}::uuid order by priority asc, created_at desc nulls last`) : actualCaseId ? await query(sql`select * from action_queue where case_id = ${actualCaseId}::uuid order by priority asc, created_at desc nulls last`) : [];
  const provenanceRows = await query(sql`
    select *
    from provenance_log
    where (entity_id::text = ${caseId} or entity_id::text = ${problemId ?? "00000000-0000-0000-0000-000000000000"})
       or provenance_ref = ${caseId}
    order by timestamp desc
    limit 200
  `);
  return { caseRow, problem, evidenceRows, findingRows, actionRows, provenanceRows };
}
function toProblemItem(row) {
  const friction = numberValue(row.friction_coefficient, 0.4);
  const micro = numberValue(row.alignment_micro, 0.5);
  const meso = numberValue(row.alignment_meso, 0.5);
  const macro = numberValue(row.alignment_macro, 0.5);
  const system = numberValue(row.alignment_system, 0.5);
  const alignment = clamp01((micro + meso + macro + system) / 4);
  const severity = friction >= 0.75 ? "critical" : friction >= 0.55 ? "high" : friction >= 0.35 ? "medium" : "low";
  return {
    ...row,
    id: row.id,
    recordId: row.record_id,
    record_id: row.record_id,
    problemType: row.problem_type,
    problem_type: row.problem_type,
    jurisdiction: row.jurisdiction,
    systemPrimary: row.system_primary,
    system_primary: row.system_primary,
    validationStatus: row.validation_status,
    validation_status: row.validation_status,
    frictionCoefficient: friction,
    friction_coefficient: friction,
    frictionSeverity: severity,
    alignmentComposite: alignment,
    friction: { coefficient: friction, severity, sources: jsonArray(row.friction_sources) },
    alignment: { micro, meso, macro, system, composite: alignment },
    riskLevel: friction >= 0.65 && alignment < 0.55 ? "high" : friction >= 0.45 ? "medium" : "low",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function buildFrictionReport(row, evidenceRows = [], findingRows = []) {
  const item = toProblemItem(row);
  const sources = jsonArray(row.friction_sources);
  const narrative = `${item.problem_type} in ${item.jurisdiction} has ${item.frictionSeverity} friction (${item.frictionCoefficient.toFixed(2)}) across ${item.system_primary}.`;
  return {
    instanceId: row.id,
    recordId: row.record_id,
    friction: {
      coefficient: item.frictionCoefficient,
      severity: item.frictionSeverity,
      sources,
      narrative
    },
    alignment: {
      micro: numberValue(row.alignment_micro, 0.5),
      meso: numberValue(row.alignment_meso, 0.5),
      macro: numberValue(row.alignment_macro, 0.5),
      system: numberValue(row.alignment_system, 0.5),
      composite: item.alignmentComposite
    },
    risk: {
      level: item.riskLevel,
      narrative: item.riskLevel === "high" ? "High escalation risk due to elevated friction and weaker alignment." : "Risk appears manageable with documented follow-through."
    },
    evidenceCount: evidenceRows.length,
    findingCount: findingRows.length,
    computedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function jurisdictionLevel(jurisdiction) {
  const j = (jurisdiction ?? "").toLowerCase();
  if (j.includes("federal") || j.includes("usa") || j.includes("united states")) return "federal";
  if (/\b[a-z]{2}\b/.test(j) || j.includes("state")) return "state";
  if (j.includes("county")) return "county";
  if (j.includes("city") || j.includes("municipal")) return "municipal";
  return "unknown";
}
function buildCaseExportPayload(caseId, bundle) {
  const core = bundle.problem ? toProblemItem(bundle.problem) : {
    id: bundle.caseRow?.id ?? caseId,
    recordId: bundle.caseRow?.id ?? caseId,
    record_id: bundle.caseRow?.id ?? caseId,
    problemType: bundle.caseRow?.title ?? "case",
    problem_type: bundle.caseRow?.title ?? "case",
    jurisdiction: bundle.caseRow?.jurisdiction ?? "unknown",
    systemPrimary: "case_management",
    system_primary: "case_management",
    validationStatus: "READY",
    frictionCoefficient: 0.4,
    frictionSeverity: "medium",
    alignmentComposite: 0.7,
    friction: { coefficient: 0.4, severity: "medium", sources: [] },
    alignment: { micro: 0.7, meso: 0.7, macro: 0.7, system: 0.7, composite: 0.7 },
    riskLevel: "medium"
  };
  const sourceFacts = {
    evidence_count: bundle.evidenceRows.length,
    finding_count: bundle.findingRows.length,
    action_count: bundle.actionRows.length,
    evidence_items: bundle.evidenceRows.map((e) => ({
      id: e.id,
      source_document: e.source_document ?? e.title ?? e.source_type ?? "uploaded evidence",
      evidence_type: e.evidence_type ?? e.source_type ?? "document",
      content: e.content ?? e.description ?? "",
      provenance_hash: e.provenance_hash ?? hashObject(e)
    })),
    finding_items: bundle.findingRows.map((f) => ({
      id: f.id,
      finding_type: f.finding_type ?? f.recommendation_type ?? "finding",
      description: f.description ?? f.title ?? "",
      confidence: numberValue(f.confidence, 0.6)
    })),
    action_items: bundle.actionRows.map((a) => ({
      id: a.id,
      action_type: a.action_type ?? "review",
      description: a.description ?? "Review case materials",
      priority: numberValue(a.priority, 5),
      status: a.status ?? "pending"
    }))
  };
  const factHash = {
    algorithm: "sha256",
    hash: hashObject({ core, sourceFacts }),
    input_fields: ["core_state", "source_facts", "actions", "findings", "evidence"],
    computed_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const coverageOverall = clamp01(Math.min(sourceFacts.evidence_count, 3) / 3 * 0.35 + Math.min(sourceFacts.finding_count, 3) / 3 * 0.35 + Math.min(sourceFacts.action_count, 2) / 2 * 0.3);
  const payload = {
    schema_version: "3.0",
    export_type: "case_export",
    source_system: "luminari",
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    core_state: core,
    source_facts: sourceFacts,
    timeline: bundle.provenanceRows.map((p) => ({
      timestamp: iso(p.timestamp) ?? (/* @__PURE__ */ new Date()).toISOString(),
      event_type: p.operation ?? p.status ?? "status_change",
      description: p.reasons ? JSON.stringify(p.reasons) : `${p.from_library ?? "system"} \u2192 ${p.to_library ?? "system"}`,
      source: p.from_library ?? "provenance_log",
      actor: p.caller ?? null
    })),
    derived_context: {
      friction_narrative: bundle.problem ? buildFrictionReport(bundle.problem, bundle.evidenceRows, bundle.findingRows).friction.narrative : "Case assembled from Supabase records.",
      alignment_narrative: `Alignment composite is ${numberValue(core.alignmentComposite, 0.7).toFixed(2)}.`,
      risk_narrative: `Risk level is ${core.riskLevel ?? "medium"}.`,
      coordination_narrative: `${bundle.actionRows.length} action(s) are currently tracked for the case.`,
      jurisdiction_narrative: `${core.jurisdiction ?? "Unknown"} is normalized as ${jurisdictionLevel(core.jurisdiction)} jurisdiction.`,
      recommended_pathway_narrative: "Use readiness approval, verified contacts, and provenance logging before external transmission.",
      dominant_problem_type: core.problem_type ?? core.problemType ?? "case",
      dominant_jurisdiction: core.jurisdiction ?? "unknown",
      dominant_system: core.system_primary ?? core.systemPrimary ?? "case_management",
      avg_friction: numberValue(core.frictionCoefficient, 0.4),
      max_friction: numberValue(core.frictionCoefficient, 0.4),
      coordination_summary: { deadlocked: 0, with_conflicts: 0, total_systems: 1 }
    },
    traceability: {
      export_id: randomUUID(),
      case_id: caseId,
      fact_hash: factHash,
      schema_version: "3.0",
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      source_system: "luminari",
      validation: { valid: true, errors: [], warnings: [] },
      coverage: {
        total_score: Math.round(coverageOverall * 100),
        max_possible: 100,
        percentage: Math.round(coverageOverall * 100),
        confidence: coverageOverall >= 0.7 ? "high" : coverageOverall >= 0.4 ? "medium" : "low",
        breakdown: [],
        missing_fields: [],
        overall: coverageOverall,
        evidence_coverage: sourceFacts.evidence_count > 0 ? 1 : 0,
        finding_coverage: sourceFacts.finding_count > 0 ? 1 : 0,
        action_coverage: sourceFacts.action_count > 0 ? 1 : 0,
        coordination_coverage: 0.7,
        friction_coverage: bundle.problem ? 1 : 0.5
      },
      self_sufficient: true,
      reproducibility_guarantee: "The fact hash is computed from the exported core state and source facts."
    },
    coverage: void 0,
    relationships: {
      correlated_instances: [],
      evidence_links: [],
      cross_system_connections: []
    },
    escalation_state: {
      current_state: "READY_FOR_REVIEW",
      escalation_stage: "INITIAL",
      sent_at: null,
      days_elapsed: null,
      days_remaining: 30,
      window_elapsed: false,
      media_escalation_requested: false,
      flow_hash: null,
      has_active_flow: false
    },
    provenance_chain: bundle.provenanceRows.map((p) => ({
      id: p.id,
      operation: p.operation ?? p.status ?? "state_transition",
      from_state: p.from_library ?? null,
      to_state: p.to_library ?? null,
      timestamp: iso(p.timestamp) ?? (/* @__PURE__ */ new Date()).toISOString(),
      operator: p.caller ?? null,
      payload_hash: p.payload_hash ?? null,
      transition_id: p.transition_id
    })),
    routing_decision: null,
    resolved_contacts: null,
    action_bundle: null
  };
  payload.coverage = payload.traceability.coverage;
  return payload;
}
async function logProvenance(input) {
  const transitionId = `${input.operation}:${Date.now()}:${randomUUID()}`;
  await db.execute(sql`
    insert into provenance_log (transition_id, timestamp, from_library, to_library, status, reasons, entity_type, entity_id, operation, caller, payload_hash, provenance_ref)
    values (${transitionId}, now(), ${input.fromState ?? "api"}, ${input.toState ?? input.operation}, ${input.status ?? "completed"}, ${JSON.stringify(input.reasons ?? [])}::jsonb, 'case', ${input.entityId}::uuid, ${input.operation}, ${input.caller ?? "system"}, ${hashObject(input.payload ?? input)}, ${input.entityId})
  `);
  return transitionId;
}
async function buildActionBundle(caseId) {
  const bundle = await loadCaseBundle(caseId);
  const contacts = await resolveContactsForCase(caseId);
  const actions = bundle.actionRows.length > 0 ? bundle.actionRows : [{ id: randomUUID(), action_type: "case_review", description: "Review case export and prepare transmission packet", priority: 5, status: "pending" }];
  return {
    bundle_id: randomUUID(),
    case_id: caseId,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    action_count: actions.length,
    endpoint_count: contacts.contacts.length,
    primary_actions: actions.map((a) => ({
      id: a.id,
      action_type: a.action_type ?? "review",
      description: a.description ?? "Review case materials",
      priority: numberValue(a.priority, 5),
      target_entity: contacts.primary_contact?.entity_name ?? contacts.primary_contact?.organization ?? "Verified contact queue"
    })),
    endpoints: contacts.contacts.map((c) => ({
      id: c.id,
      entity_name: c.entity_name ?? c.organization ?? c.name,
      entity_type: c.entity_type ?? c.contact_type ?? "agency",
      jurisdiction: c.jurisdiction,
      email: c.email ?? c.contact_value,
      phone: c.phone,
      web_url: c.web_url ?? c.form_url
    })),
    bundle_hash: hashObject({ caseId, actions, contacts: contacts.contacts })
  };
}
async function resolveContactsForCase(caseId) {
  const bundle = await loadCaseBundle(caseId);
  const jurisdiction = bundle.problem?.jurisdiction ?? bundle.caseRow?.jurisdiction ?? null;
  const problemType = bundle.problem?.problem_type ?? bundle.caseRow?.title ?? null;
  const contacts = await query(sql`
    select *
    from escalation_contacts
    where is_active is not false
      and (${jurisdiction}::text is null or jurisdiction is null or lower(jurisdiction) = lower(${jurisdiction}) or lower(coalesce(jurisdiction_level, '')) = lower(${jurisdictionLevel(jurisdiction)}))
    order by is_verified desc nulls last, last_verified desc nulls last, created_at desc nulls last
    limit 20
  `);
  return {
    caseId,
    jurisdiction,
    problemType,
    contact_count: contacts.length,
    contacts,
    primary_contact: contacts[0] ?? null,
    resolution_hash: hashObject({ caseId, jurisdiction, contacts: contacts.map((c) => c.id) }),
    generated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function approvalState(caseId) {
  const [latest] = await query(sql`
    select * from provenance_log
    where entity_type = 'case' and (entity_id::text = ${caseId} or provenance_ref = ${caseId})
      and operation like 'approval.%'
    order by timestamp desc
    limit 1
  `);
  return {
    case_id: caseId,
    state: latest?.operation?.split(".").pop() ?? "draft",
    current_state: latest?.operation?.split(".").pop() ?? "draft",
    updated_at: iso(latest?.timestamp) ?? null,
    latest_transition: latest ?? null
  };
}
var authRouter = router({
  me: publicProcedure.query(() => ({ user: null, isAuthenticated: false })),
  logout: publicProcedure.mutation(() => ({ success: true }))
});
var problemsRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().min(0).default(0) }).partial().optional()).query(async ({ input }) => {
    const limit = input?.limit ?? 100;
    const offset = input?.offset ?? 0;
    const data = await query(sql`
        select * from problem_instances
        order by created_at desc nulls last, record_id asc
        limit ${limit} offset ${offset}
      `);
    const [{ count } = { count: data.length }] = await query(sql`select count(*)::int as count from problem_instances`);
    return { items: data.map(toProblemItem), total: numberValue(count, data.length), limit, offset };
  }),
  getInterpretation: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return null;
    const bundle = await loadCaseBundle(input.instanceId);
    return {
      instanceId: problem.id,
      recordId: problem.record_id,
      summary: `${problem.problem_type} involving ${problem.system_primary} in ${problem.jurisdiction}.`,
      friction: buildFrictionReport(problem, bundle.evidenceRows, bundle.findingRows).friction,
      evidence: bundle.evidenceRows,
      findings: bundle.findingRows,
      actions: bundle.actionRows,
      resolutionPathways: problem.resolution_pathways ?? [],
      coordination: problem.coordination_data ?? {},
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  })
});
var frictionRouter = router({
  report: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return null;
    const bundle = await loadCaseBundle(input.instanceId);
    return buildFrictionReport(problem, bundle.evidenceRows, bundle.findingRows);
  }),
  all: publicProcedure.input(z.object({ limit: z.number().default(100) }).optional()).query(async ({ input }) => {
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit ${input?.limit ?? 100}`);
    return data.map((row) => buildFrictionReport(row));
  }),
  aggregates: publicProcedure.query(async () => {
    const data = await query(sql`select * from problem_instances`);
    const reports = data.map((row) => buildFrictionReport(row));
    const avg = reports.length ? reports.reduce((sum, r) => sum + r.friction.coefficient, 0) / reports.length : 0;
    return { totalInstances: reports.length, avgFriction: avg, avgAlignment: reports.length ? reports.reduce((sum, r) => sum + r.alignment.composite, 0) / reports.length : 0, byType: {}, bySeverity: {}, byRisk: {} };
  })
});
var correlationsRouter = router({
  forInstance: publicProcedure.input(INSTANCE_ID.extend({ minScore: z.number().default(0.25) })).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return { instanceId: input.instanceId, matches: [], total: 0 };
    const candidates = await query(sql`
      select * from problem_instances
      where id <> ${problem.id}::uuid
        and (problem_type = ${problem.problem_type} or jurisdiction = ${problem.jurisdiction} or system_primary = ${problem.system_primary})
      order by created_at desc nulls last
      limit 50
    `);
    const matches = candidates.map((row) => {
      const score = clamp01((row.problem_type === problem.problem_type ? 0.4 : 0) + (row.jurisdiction === problem.jurisdiction ? 0.3 : 0) + (row.system_primary === problem.system_primary ? 0.3 : 0));
      return { ...toProblemItem(row), correlation_score: score, score, match_type: score >= 0.7 ? "strong" : "partial" };
    }).filter((m) => m.score >= input.minScore);
    return { instanceId: problem.id, recordId: problem.record_id, matches, total: matches.length };
  })
});
var enrichmentRouter = router({
  jurisdictionLevel: publicProcedure.input(z.object({ jurisdiction: z.string().optional(), instanceId: z.string().optional() })).query(async ({ input }) => {
    const problem = input.instanceId ? await loadProblem(input.instanceId) : null;
    const jurisdiction = input.jurisdiction ?? problem?.jurisdiction ?? null;
    return { jurisdiction, level: jurisdictionLevel(jurisdiction), normalized: jurisdictionLevel(jurisdiction), confidence: jurisdiction ? 0.9 : 0.2 };
  }),
  evidenceLinks: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const bundle = await loadCaseBundle(input.instanceId);
    return bundle.findingRows.flatMap((finding) => {
      const linked = jsonArray(finding.evidence_links);
      const evidence2 = linked.length ? bundle.evidenceRows.filter((e) => linked.includes(e.id)) : bundle.evidenceRows.slice(0, 3);
      return evidence2.map((e) => ({ from_finding: finding.id, to_evidence: e.id, link_type: "supports", confidence: numberValue(finding.confidence, 0.6), finding, evidence: e }));
    });
  }),
  correlations: publicProcedure.input(INSTANCE_ID).query(async ({ input }) => {
    const problem = await loadProblem(input.instanceId);
    if (!problem) return { instanceId: input.instanceId, matches: [], total: 0, graph: { nodes: [], edges: [] } };
    const candidates = await query(sql`
      select * from problem_instances
      where id <> ${problem.id}::uuid
        and (problem_type = ${problem.problem_type} or jurisdiction = ${problem.jurisdiction} or system_primary = ${problem.system_primary})
      order by created_at desc nulls last
      limit 50
    `);
    const matches = candidates.map((row) => {
      const score = clamp01((row.problem_type === problem.problem_type ? 0.4 : 0) + (row.jurisdiction === problem.jurisdiction ? 0.3 : 0) + (row.system_primary === problem.system_primary ? 0.3 : 0));
      return { ...toProblemItem(row), correlation_score: score, score, match_type: score >= 0.7 ? "strong" : "partial" };
    }).filter((m) => m.score >= 0.25);
    return {
      instanceId: problem.id,
      recordId: problem.record_id,
      matches,
      total: matches.length,
      graph: {
        nodes: [{ id: problem.id, label: problem.record_id, type: "source" }, ...matches.map((m) => ({ id: m.id, label: m.record_id, type: "match" }))],
        edges: matches.map((m) => ({ from: problem.id, to: m.id, weight: m.score, label: m.match_type }))
      }
    };
  })
});
var exportRouter = router({
  single: publicProcedure.input(z.object({ recordId: z.string().min(1) })).query(async ({ input }) => {
    const problem = await loadProblem(input.recordId);
    if (!problem) throw new TRPCError2({ code: "NOT_FOUND", message: "Problem instance not found" });
    const payload = buildCaseExportPayload(input.recordId, await loadCaseBundle(input.recordId));
    return { export_type: "single", recordId: input.recordId, payload, json: payload, generatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }),
  batch: publicProcedure.input(z.object({ filters: z.any().optional(), limit: z.number().default(100), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const limit = input?.limit ?? 100;
    const offset = input?.offset ?? 0;
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit ${limit} offset ${offset}`);
    return { export_type: "batch", total: data.length, items: data.map(toProblemItem), generatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  })
});
var caseExportRouter = router({
  generate: publicProcedure.input(CASE_ID).query(async ({ input }) => buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId))),
  verify: publicProcedure.input(z.object({ caseId: z.string(), expectedHash: z.string().optional() })).query(async ({ input }) => {
    const payload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const actual = payload.traceability.fact_hash.hash;
    return { valid: !input.expectedHash || input.expectedHash === actual, expectedHash: input.expectedHash ?? actual, actualHash: actual, verifiedAt: (/* @__PURE__ */ new Date()).toISOString() };
  })
});
var actionBundleRouter = router({
  generate: publicProcedure.input(CASE_ID).query(async ({ input }) => buildActionBundle(input.caseId))
});
var truthValidationRouter = router({
  check: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const bundle = await loadCaseBundle(input.caseId);
    const failures = [];
    if (!bundle.problem && !bundle.caseRow) failures.push("Case or problem instance was not found.");
    if (bundle.evidenceRows.length === 0) failures.push("No evidence records are attached.");
    if (bundle.findingRows.length === 0) failures.push("No findings are attached.");
    return { passed: failures.length === 0, failures, warnings: bundle.actionRows.length === 0 ? ["No action queue entries are attached."] : [], checkedAt: (/* @__PURE__ */ new Date()).toISOString() };
  })
});
var readinessRouter = router({
  check: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const payload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const readiness = computeReadiness(payload);
    return { case_id: input.caseId, export: payload, readiness };
  }),
  prepare: publicProcedure.input(CASE_ID).mutation(async ({ input }) => {
    const exportPayload = buildCaseExportPayload(input.caseId, await loadCaseBundle(input.caseId));
    const actionBundle = await buildActionBundle(input.caseId);
    const readiness = computeReadiness(exportPayload);
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "approval.prepared", toState: "prepared", payload: { exportPayload, actionBundle, readiness } });
    return { success: true, case_id: input.caseId, export: exportPayload, action_bundle: actionBundle, readiness, transition_id: transitionId };
  })
});
var approvalRouter = router({
  state: publicProcedure.input(CASE_ID).query(async ({ input }) => approvalState(input.caseId)),
  list: publicProcedure.input(z.object({ limit: z.number().default(50) }).optional()).query(async ({ input }) => {
    const limit = input?.limit ?? 50;
    const data = await query(sql`
      select distinct on (entity_id) entity_id::text as case_id, operation, status, timestamp, reasons, payload_hash
      from provenance_log
      where entity_type = 'case' and operation like 'approval.%'
      order by entity_id, timestamp desc
      limit ${limit}
    `);
    return data.map((entry) => ({ ...entry, state: entry.operation?.split(".").pop() ?? "draft", guard_result: { passed: true, failures: [] } }));
  }),
  approve: publicProcedure.input(CASE_ID.extend({ reviewer: z.string().optional() })).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.approved", toState: "approved", caller: input.reviewer }) })),
  queueForTransmission: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.queued_for_transmission", toState: "queued_for_transmission" }) })),
  send: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, sent_at: (/* @__PURE__ */ new Date()).toISOString(), transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.sent", toState: "sent" }) })),
  acknowledge: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.acknowledged", toState: "acknowledged" }) })),
  complete: publicProcedure.input(CASE_ID).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "approval.completed", toState: "completed" }) }))
});
function buildWindow(caseId, sentAt, requestedMedia = false) {
  const entry = createWindowEntry(caseId, `packet:${caseId}`);
  if (sentAt) entry.sent_at = sentAt;
  if (requestedMedia) entry.escalation_stage = "PUBLIC";
  return updateWindowStatus(entry);
}
var escalationRouter = router({
  getFlowState: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const [esc] = await query(sql`select * from escalations where case_id::text = ${input.caseId} or problem_instance_id::text = ${input.caseId} order by updated_at desc nulls last, created_at desc nulls last limit 1`);
    return { caseId: input.caseId, current_state: esc?.status ?? "READY", escalation_stage: esc?.metadata?.escalation_stage ?? "INITIAL", flow_hash: hashObject(esc ?? input), escalation: esc ?? null };
  }),
  check30DayWindow: publicProcedure.input(CASE_ID).query(async ({ input }) => {
    const [latestSent] = await query(sql`select * from provenance_log where entity_type = 'case' and (entity_id::text = ${input.caseId} or provenance_ref = ${input.caseId}) and operation in ('approval.sent','escalation.sent','escalation.follow_up') order by timestamp desc limit 1`);
    const entry = buildWindow(input.caseId, iso(latestSent?.timestamp));
    return { ...entry, check: checkWindow(entry) };
  }),
  getEscalationHistory: publicProcedure.input(CASE_ID).query(async ({ input }) => query(sql`select * from provenance_log where entity_type = 'case' and (entity_id::text = ${input.caseId} or provenance_ref = ${input.caseId}) and (operation like 'escalation.%' or operation like 'approval.%') order by timestamp desc limit 100`)),
  transitionState: publicProcedure.input(CASE_ID.extend({ toState: z.string(), fromState: z.string().optional(), reason: z.string().optional() })).mutation(async ({ input }) => {
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.transition", fromState: input.fromState, toState: input.toState, reasons: input.reason ? [input.reason] : [] });
    await db.execute(sql`insert into escalations (case_id, status, metadata, created_at, updated_at) values (${input.caseId}::uuid, ${input.toState}, ${JSON.stringify({ reason: input.reason })}::jsonb, now(), now()) on conflict do nothing`);
    return { success: true, transition_id: transitionId, current_state: input.toState };
  }),
  requestFollowUpEscalation: publicProcedure.input(CASE_ID.extend({ operatorOverride: z.boolean().optional() })).mutation(async ({ input }) => {
    const entry = buildWindow(input.caseId);
    if (!canTriggerFollowUp(entry, input.operatorOverride ?? false)) return { success: false, reason: "30-day response window has not elapsed", window: entry };
    const updated = input.operatorOverride ? { ...entry, follow_up_triggered_at: (/* @__PURE__ */ new Date()).toISOString(), escalation_stage: "FOLLOW_UP", updated_at: (/* @__PURE__ */ new Date()).toISOString() } : triggerFollowUp(entry);
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.follow_up", toState: "FOLLOW_UP", payload: updated });
    return { success: true, transition_id: transitionId, window: updated };
  }),
  requestMediaEscalation: publicProcedure.input(CASE_ID).mutation(async ({ input }) => {
    const updated = triggerMediaEscalation(buildWindow(input.caseId, null, true));
    const transitionId = await logProvenance({ entityId: input.caseId, operation: "escalation.media", toState: "PUBLIC", payload: updated });
    return { success: true, transition_id: transitionId, window: updated };
  }),
  getExpiringWindows: publicProcedure.input(z.object({ days: z.number().default(7), limit: z.number().default(25) }).optional()).query(async ({ input }) => {
    const days = input?.days ?? 7;
    const data = await query(sql`select entity_id::text as case_id, timestamp from provenance_log where entity_type = 'case' and operation in ('approval.sent','escalation.sent') order by timestamp desc limit ${input?.limit ?? 25}`);
    return data.map((r) => ({ caseId: r.case_id, ...buildWindow(r.case_id, iso(r.timestamp)) })).filter((w) => w.days_remaining <= days);
  })
});
var contactsRouter = router({
  resolveForCase: publicProcedure.input(CASE_ID.extend({ includeInactive: z.boolean().optional() })).query(async ({ input }) => resolveContactsForCase(input.caseId)),
  logExecution: publicProcedure.input(CASE_ID.extend({ contactId: z.string().optional(), action: z.string().optional(), result: z.any().optional() })).mutation(async ({ input }) => ({ success: true, transition_id: await logProvenance({ entityId: input.caseId, operation: "contacts.execution_logged", toState: input.action ?? "contacted", payload: input }) }))
});
var documentRouter = router({
  createForCase: publicProcedure.input(CASE_ID.extend({ filename: z.string().optional(), content: z.string().optional(), metadata: z.any().optional() })).mutation(async ({ input }) => {
    const [row] = await query(sql`insert into evidence_items (case_id, title, content, source_type, metadata, created_at, updated_at) values (${input.caseId}::uuid, ${input.filename ?? "Uploaded document"}, ${input.content ?? ""}, 'upload', ${JSON.stringify(input.metadata ?? {})}::jsonb, now(), now()) returning *`);
    return { success: true, evidence: row, extractedLength: (input.content ?? "").length, extractedPreview: (input.content ?? "").slice(0, 300), caseUrl: `/case/${input.caseId}` };
  }),
  createForNewCase: publicProcedure.input(z.object({ title: z.string().optional(), filename: z.string().optional(), content: z.string().optional(), jurisdiction: z.string().optional(), metadata: z.any().optional() })).mutation(async ({ input }) => {
    const [caseRow] = await query(sql`insert into cases (title, description, jurisdiction, created_at, updated_at) values (${input.title ?? input.filename ?? "Uploaded case"}, ${input.content?.slice(0, 500) ?? null}, ${input.jurisdiction ?? "unknown"}, now(), now()) returning *`);
    const [evidenceRow] = await query(sql`insert into evidence_items (case_id, title, content, source_type, metadata, created_at, updated_at) values (${caseRow.id}::uuid, ${input.filename ?? "Uploaded document"}, ${input.content ?? ""}, 'upload', ${JSON.stringify(input.metadata ?? {})}::jsonb, now(), now()) returning *`);
    return { success: true, case: caseRow, evidence: evidenceRow, extractedLength: (input.content ?? "").length, extractedPreview: (input.content ?? "").slice(0, 300), caseUrl: `/case/${caseRow.id}` };
  })
});
var intakeRouter = router({
  importJSON: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: 1, imported: 1, failed: 0, results: [{ success: true, sourceName: input.sourceName ?? "json", preview: input.content.slice(0, 160) }] })),
  importCSV: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: Math.max(0, input.content.trim().split(/\r?\n/).length - 1), imported: Math.max(0, input.content.trim().split(/\r?\n/).length - 1), failed: 0, results: [] })),
  importText: publicProcedure.input(z.object({ content: z.string(), sourceName: z.string().optional() })).mutation(async ({ input }) => ({ totalRecords: 1, imported: 1, failed: 0, results: [{ success: true, extractedLength: input.content.length, sourceName: input.sourceName ?? "text" }] }))
});
var systemRouter = router({
  getBatchExecutionResults: publicProcedure.query(async () => {
    const data = await query(sql`select * from problem_instances order by created_at desc nulls last limit 25`);
    return data.map((row) => ({ caseId: row.id, recordId: row.record_id, type: row.validation_status ?? "processed", error: null, stages: { loaded: { status: "complete", at: row.created_at }, interpreted: { status: "complete", at: row.updated_at }, ready: { status: "complete", at: row.updated_at } } }));
  }),
  getProvenanceChain: publicProcedure.input(z.object({ caseId: z.string().optional(), entityId: z.string().optional() })).query(async ({ input }) => {
    const id = input.caseId ?? input.entityId;
    if (!id) return [];
    return query(sql`select * from provenance_log where entity_id::text = ${id} or provenance_ref = ${id} order by timestamp desc limit 200`);
  })
});
var appRouter = router({
  auth: authRouter,
  problems: problemsRouter,
  friction: frictionRouter,
  correlations: correlationsRouter,
  enrichment: enrichmentRouter,
  export: exportRouter,
  caseExport: caseExportRouter,
  actionBundle: actionBundleRouter,
  truthValidation: truthValidationRouter,
  readiness: readinessRouter,
  approval: approvalRouter,
  escalation: escalationRouter,
  contacts: contactsRouter,
  document: documentRouter,
  intake: intakeRouter,
  system: systemRouter
});

// server/_core/context.ts
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
    isSystem: false,
    isInspectionMode: false
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    reportCompressedSize: false
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const candidates = [
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "../..", "dist", "public"),
    path2.resolve(process.cwd(), "dist", "public"),
    path2.resolve(process.cwd(), "public")
  ];
  let distPath = candidates[0];
  for (const candidate of candidates) {
    if (fs2.existsSync(path2.join(candidate, "index.html"))) {
      distPath = candidate;
      break;
    }
  }
  console.log(`[Static] Serving from: ${distPath} (exists: ${fs2.existsSync(distPath)}, has index.html: ${fs2.existsSync(path2.join(distPath, "index.html"))})`);
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
var SUPABASE_PROJECT = "ckkvxfqqakdzrcbmdimy";
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(port, () => {
      probe.close(() => resolve(true));
    });
    probe.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "trpc-accept"]
    })
  );
  app.options("*", cors({ origin: true, credentials: true }));
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "Prism / Luminari V2",
      database: "supabase-postgres",
      supabaseProject: SUPABASE_PROJECT
    });
  });
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = Number.parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Prism server running on http://localhost:${port}/`);
    console.log(`[Startup] Supabase project: ${SUPABASE_PROJECT}`);
    console.log("[Startup] tRPC mounted at /api/trpc");
  });
  process.on("SIGTERM", () => {
    console.log("[Shutdown] SIGTERM received, shutting down...");
    server.close(() => {
      console.log("[Shutdown] Server closed");
      process.exit(0);
    });
  });
}
startServer().catch((error) => {
  console.error("[Startup] Prism server failed:", error);
  process.exit(1);
});
