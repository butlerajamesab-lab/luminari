import { int, mysqlEnum, mysqlTable, text, mediumtext, varchar, bigint, boolean, json, index, uniqueIndex, double, decimal, tinyint, char, date, timestamp, float } from "drizzle-orm/mysql-core";

// ─── Users (auth - framework managed) ───
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  plan: mysqlEnum("plan", ["free", "advocacy", "family_advocacy", "analyst", "professional", "enterprise"]).default("free").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  lastSignedIn: bigint("lastSignedIn", { mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Corpus Snapshots: versioned corpus states per case (Gate 6) ───
export const corpusSnapshots = mysqlTable("corpus_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  version: int("version").notNull(),
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  documentIds: json("documentIds").notNull().$type<number[]>(),
  documentHashes: json("documentHashes").notNull().$type<Record<string, string>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  sealedAt: bigint("sealedAt", { mode: "number" }),
  status: mysqlEnum("snapshotStatus", ["open", "sealed"]).default("open").notNull(),
  // Cryptographic signing (Gate 9)
  signature: text("signature"),
  signatureAlgorithm: varchar("signatureAlgorithm", { length: 64 }),
  publicKeyFingerprint: varchar("publicKeyFingerprint", { length: 128 }),
}, (table) => [
  uniqueIndex("idx_snapshot_case_version").on(table.caseId, table.version),
  index("idx_snapshot_case").on(table.caseId),
  index("idx_snapshot_status").on(table.status),
]);

export type CorpusSnapshot = typeof corpusSnapshots.$inferSelect;

// ─── Cases: isolated investigation workspaces ───
// Statement origin classification — determines evidentiary weight
export const STATEMENT_ORIGINS = ["sworn_testimony", "court_filing", "discovery_disclosure", "media_report", "internal_memo", "informal_communication", "unknown"] as const;
export const FINDING_ELIGIBLE_ORIGINS = ["sworn_testimony", "court_filing", "discovery_disclosure"] as const;
export type StatementOrigin = typeof STATEMENT_ORIGINS[number];

export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 512 }).notNull(),
  description: text("description"),
  // Gating fields — Domain Gate + Container Gate
  domain: varchar("domain", { length: 256 }), // e.g., "SDNY Criminal", "SDNY Civil", "State Family Court"
  container: varchar("container", { length: 256 }), // e.g., "Maxwell 20 Cr. 330", "Epstein 08-80736"
  pipelineType: varchar("pipelineType", { length: 64 }), // e.g., "insurance", "custody", "icwa"
  manualLensOverrides: json("manualLensOverrides").$type<string[]>(), // user-toggled lens IDs
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cases_user").on(table.userId),
  index("idx_cases_domain").on(table.domain),
  index("idx_cases_container").on(table.container),
  index("idx_cases_pipeline").on(table.pipelineType),
]);

export type Case = typeof cases.$inferSelect;

// ─── Luminari Cases: user-owned case data for Action Engine ───
export const luminariCases = mysqlTable("luminari_cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  jurisdictionId: int("jurisdictionId").notNull(), // FK to luminari_registry.jurisdictions
  category: varchar("category", { length: 64 }).notNull(), // housing, employment, benefits, healthcare, disability, other
  selectedWorkflowId: int("selectedWorkflowId").notNull(), // FK to luminari_registry.layer2_workflows
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_luminari_cases_user").on(table.userId),
  index("idx_luminari_cases_jurisdiction").on(table.jurisdictionId),
  index("idx_luminari_cases_workflow").on(table.selectedWorkflowId),
  index("idx_luminari_cases_status").on(table.status),
]);

export type LuminariCase = typeof luminariCases.$inferSelect;
export type InsertLuminariCase = typeof luminariCases.$inferInsert;

// ─── Luminari Case Notes: user-owned notes ───
export const luminariCaseNotes = mysqlTable("luminari_case_notes", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_notes_case").on(table.caseId),
]);

export type LuminariCaseNote = typeof luminariCaseNotes.$inferSelect;
export type InsertLuminariCaseNote = typeof luminariCaseNotes.$inferInsert;

// ─── Luminari Case Events: action tracking ───
export const luminariCaseEvents = mysqlTable("luminari_case_events", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // step_completed, action_recorded, note_added, status_changed
  eventData: json("eventData").notNull().$type<Record<string, any>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_events_case").on(table.caseId),
  index("idx_case_events_type").on(table.eventType),
]);

export type LuminariCaseEvent = typeof luminariCaseEvents.$inferSelect;
export type InsertLuminariCaseEvent = typeof luminariCaseEvents.$inferInsert;

// ─── Luminari Case Actions: user actions taken ───
export const luminariCaseActions = mysqlTable("luminari_case_actions", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  actionType: varchar("actionType", { length: 64 }).notNull(), // step_completed, contact_made, document_filed, etc.
  metadata: json("metadata").notNull().$type<Record<string, any>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_actions_case").on(table.caseId),
  index("idx_case_actions_type").on(table.actionType),
]);

export type LuminariCaseAction = typeof luminariCaseActions.$inferSelect;
export type InsertLuminariCaseAction = typeof luminariCaseActions.$inferInsert;

// ─── Documents: source evidence files ───
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  filename: varchar("filename", { length: 512 }).notNull(),
  fileType: varchar("fileType", { length: 32 }).notNull(), // pdf, image, video, audio, text
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: int("fileSize").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: text("s3Url").notNull(),
  sha256Hash: varchar("sha256Hash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["uploaded", "extracting", "analyzing", "ready", "error", "retrying", "failed_permanent"]).default("uploaded").notNull(),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0).notNull(),
  textContent: mediumtext("textContent"),
  pageCount: int("pageCount"),
  durationSeconds: int("durationSeconds"),
  // AI-extracted metadata (Pass 1)
  documentType: varchar("documentType", { length: 128 }), // court_filing, medical_record, etc.
  documentPurpose: text("documentPurpose"), // plain-language what this doc IS and DOES
  aiMetadata: json("aiMetadata"), // { case_name, case_number, court_docket, date_filed, author, recipient, subject }
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
  // Document Resolution (Gate 1 — replacement model)
  documentResolution: mysqlEnum("documentResolution", ["active", "superseded", "excluded", "corrupted"]).default("active").notNull(),
  replacedByDocumentId: int("replacedByDocumentId"),  // FK to documents.id — set when superseded
  resolutionReason: text("resolutionReason"),  // required for corrupted/excluded
}, (table) => [
  index("idx_docs_case").on(table.caseId),
  index("idx_docs_status").on(table.status),
  uniqueIndex("idx_docs_hash_case").on(table.sha256Hash, table.caseId),
  index("idx_docs_snapshot").on(table.snapshotId),
  index("idx_docs_resolution").on(table.documentResolution),
]);

export type Document = typeof documents.$inferSelect;

// ─── Quotes: the evidence spine — exact text excerpts with locations ───
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  documentId: int("documentId").notNull(),
  text: text("quoteText").notNull(),
  pageNumber: int("pageNumber"), // for PDFs/text
  timestampStart: double("timestampStart"), // for audio/video (seconds)
  timestampEnd: double("timestampEnd"),
  context: text("context"), // surrounding text for context
  // Statement origin classification
  statementOrigin: mysqlEnum("statementOrigin", ["sworn_testimony", "court_filing", "discovery_disclosure", "media_report", "internal_memo", "informal_communication", "unknown"]).default("unknown").notNull(),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_quotes_case").on(table.caseId),
  index("idx_quotes_doc").on(table.documentId),
  index("idx_quotes_origin").on(table.statementOrigin),
  index("idx_quotes_lane").on(table.laneId),
  index("idx_quotes_snapshot").on(table.snapshotId),
]);

export type Quote = typeof quotes.$inferSelect;

// ─── Entities: people, organizations, locations ───
export const entities = mysqlTable("entities", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  name: varchar("name", { length: 512 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(), // person, organization, location, event, legal_concept, financial, date_reference
  description: text("description"),
  aliases: json("aliases"), // string[]
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_entities_case").on(table.caseId),
  index("idx_entities_name").on(table.name),
  index("idx_entities_type").on(table.type),
  index("idx_entities_lane").on(table.laneId),
  index("idx_entities_snapshot").on(table.snapshotId),
]);

export type Entity = typeof entities.$inferSelect;

// ─── Entity Roles: what role an entity plays in a specific document ───
export const entityRoles = mysqlTable("entity_roles", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entityId").notNull(),
  documentId: int("documentId").notNull(),
  role: varchar("role", { length: 128 }).notNull(), // Defendant, Victim-Witness, Caseworker, Judge, etc.
  quoteId: int("quoteId"), // evidence for this role assignment
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
}, (table) => [
  index("idx_er_entity").on(table.entityId),
  index("idx_er_doc").on(table.documentId),
]);

export type EntityRole = typeof entityRoles.$inferSelect;

// ─── Relationships: connections between entities with evidence ───
export const relationships = mysqlTable("relationships", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  sourceEntityId: int("sourceEntityId").notNull(),
  targetEntityId: int("targetEntityId").notNull(),
  relationshipType: varchar("relationshipType", { length: 128 }).notNull(),
  description: text("description"), // plain-language description
  evidenceCount: int("evidenceCount").default(0),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_rels_case").on(table.caseId),
  index("idx_rels_source").on(table.sourceEntityId),
  index("idx_rels_target").on(table.targetEntityId),
  index("idx_rels_lane").on(table.laneId),
  index("idx_rels_snapshot").on(table.snapshotId),
]);

export type Relationship = typeof relationships.$inferSelect;

// ─── Relationship Evidence: quotes that support a relationship ───
export const relationshipEvidence = mysqlTable("relationship_evidence", {
  id: int("id").autoincrement().primaryKey(),
  relationshipId: int("relationshipId").notNull(),
  quoteId: int("quoteId").notNull(),
  explanation: text("explanation"), // how this quote supports the relationship
}, (table) => [
  index("idx_re_rel").on(table.relationshipId),
  index("idx_re_quote").on(table.quoteId),
]);

export type RelationshipEvidence = typeof relationshipEvidence.$inferSelect;

// ─── Claims: factual assertions derived from quotes ───
export const claims = mysqlTable("claims", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  documentId: int("documentId").notNull(),
  quoteId: int("quoteId").notNull(),
  claimText: text("claimText").notNull(),
  claimType: varchar("claimType", { length: 64 }).notNull(), // statement, action, event, legal_filing, testimony, observation
  dateReferenced: varchar("dateReferenced", { length: 64 }),
  entitiesInvolved: json("entitiesInvolved"), // number[] of entity IDs
  // Statement origin + evidentiary weight
  statementOrigin: mysqlEnum("claimStatementOrigin", ["sworn_testimony", "court_filing", "discovery_disclosure", "media_report", "internal_memo", "informal_communication", "unknown"]).default("unknown").notNull(),
  evidentiaryWeight: mysqlEnum("evidentiaryWeight", ["finding_eligible", "signal_only"]).default("signal_only").notNull(),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_claims_case").on(table.caseId),
  index("idx_claims_doc").on(table.documentId),
  index("idx_claims_quote").on(table.quoteId),
  index("idx_claims_weight").on(table.evidentiaryWeight),
  index("idx_claims_lane").on(table.laneId),
  index("idx_claims_snapshot").on(table.snapshotId),
]);

export type Claim = typeof claims.$inferSelect;

// ─── Findings: patterns/conclusions across multiple claims ───
export const findings = mysqlTable("findings", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  findingType: varchar("findingType", { length: 64 }).notNull(), // pattern, contradiction, corroboration, timeline_gap, undocumented_claim
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description").notNull(), // plain-language explanation
  significance: text("significance"), // why this matters
  claimIds: json("claimIds").notNull().$type<number[]>().default([]), // number[] of claim IDs — NOT NULL, default []
  confidence: mysqlEnum("confidence", ["strong", "moderate", "preliminary"]).default("preliminary").notNull(),
  // Evidentiary classification — only finding_eligible claims can generate true Findings
  evidentiaryWeight: mysqlEnum("findingEvidentiaryWeight", ["finding", "note_signal"]).default("note_signal").notNull(),
  // Two-state provenance invariant:
  // State A (linked): claimIds non-empty
  // State B (unsupported): claimIds empty + provenanceStatus='unsupported' + provenanceAttempted=true
  // CHECK constraint chk_findings_provenance documents this invariant (NOT ENFORCED in TiDB, enforced at app layer)
  provenanceStatus: mysqlEnum("provenanceStatus", ["linked", "unsupported", "unsupported_synthesis", "rerun_error"]).default("linked").notNull(),
  provenanceAttempted: boolean("provenanceAttempted").default(false).notNull(),
  // Matching metadata — populated during pipeline matching
  candidateClaimCount: int("candidateClaimCount").default(0).notNull(),
  fallbackTriggered: boolean("fallbackTriggered").default(false).notNull(),
  matchAttemptTimestamp: bigint("matchAttemptTimestamp", { mode: "number" }),
  matchMetadata: json("matchMetadata").$type<Record<string, unknown>>(), // raw LLM + fallback results
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_findings_case").on(table.caseId),
  index("idx_findings_type").on(table.findingType),
  index("idx_findings_weight").on(table.evidentiaryWeight),
  index("idx_findings_provenance").on(table.provenanceStatus),
  index("idx_findings_lane").on(table.laneId),
  index("idx_findings_snapshot").on(table.snapshotId),
]);

export type Finding = typeof findings.$inferSelect;

// ─── Events: structured event objects from documents ───
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // travel, hearing, filing, testimony, disclosure, incident, decision
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  dateOccurred: varchar("dateOccurred", { length: 64 }),
  datePrecision: varchar("datePrecision", { length: 32 }), // exact, approximate, range
  location: varchar("location", { length: 256 }),
  entitiesInvolved: json("entitiesInvolved"), // number[] of entity IDs
  quoteIds: json("quoteIds"), // number[] of quote IDs
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_events_case").on(table.caseId),
  index("idx_events_type").on(table.eventType),
  index("idx_events_lane").on(table.laneId),
  index("idx_events_snapshot").on(table.snapshotId),
]);

export type Event = typeof events.$inferSelect;

// ─── Signal Flags: boolean indicators for key patterns ───
export const signalFlags = mysqlTable("signal_flags", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  documentId: int("documentId").notNull(),
  flagType: varchar("flagType", { length: 64 }).notNull(),
  description: text("description"),
  quoteId: int("quoteId"),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
  // Sunam gate status (Signal Flow Engine)
  sunamStatus: mysqlEnum("sunamStatus", ["pending", "approved", "rejected", "deferred"]).default("pending").notNull(),
  // Confidence score from gate decision
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }).default("0"),
}, (table) => [
  index("idx_flags_case").on(table.caseId),
  index("idx_flags_doc").on(table.documentId),
  index("idx_flags_lane").on(table.laneId),
  index("idx_flags_snapshot").on(table.snapshotId),
]);

export type SignalFlag = typeof signalFlags.$inferSelect;

// ─── Document Correlations: cross-document links ───
export const documentCorrelations = mysqlTable("document_correlations", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  sourceDocumentId: int("sourceDocumentId").notNull(),
  targetDocumentId: int("targetDocumentId").notNull(),
  correlationType: varchar("correlationType", { length: 128 }).notNull(),
  description: text("description"),
  sharedIdentifiers: json("sharedIdentifiers"), // string[]
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: int("snapshotId").notNull(),
}, (table) => [
  index("idx_corr_case").on(table.caseId),
  index("idx_corr_source").on(table.sourceDocumentId),
  index("idx_corr_target").on(table.targetDocumentId),
  index("idx_corr_lane").on(table.laneId),
  index("idx_corr_snapshot").on(table.snapshotId),
]);

export type DocumentCorrelation = typeof documentCorrelations.$inferSelect;

// ─── Presentations: courtroom presentation builder ───
export const presentations = mysqlTable("presentations", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  snapshotId: int("snapshotId"),
  slideCount: int("slideCount").notNull().default(0),
  theme: varchar("theme", { length: 64 }).notNull().default("courtroom"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pres_case").on(table.caseId),
]);

export type Presentation = typeof presentations.$inferSelect;

// ─── Presentation Slides ───
export const presentationSlides = mysqlTable("presentation_slides", {
  id: int("id").autoincrement().primaryKey(),
  presentationId: int("presentationId").notNull(),
  orderIndex: int("orderIndex").notNull(),
  slideType: varchar("slideType", { length: 64 }).notNull(), // title, finding, evidence_quote, timeline, entity_map, summary, custom
  title: varchar("title", { length: 512 }),
  content: text("content"), // markdown
  sourceCitations: json("sourceCitations"), // { documentId, documentName, page, quote, claimId }[]
  notes: text("notes"), // speaker notes
  layout: varchar("layout", { length: 64 }).notNull().default("default"), // default, split, full_quote, evidence_grid
  metadata: json("metadata"), // { findingId, entityIds, eventIds, correlationId, significance }
}, (table) => [
  index("idx_slides_pres").on(table.presentationId),
]);

export type PresentationSlide = typeof presentationSlides.$inferSelect;

// ─── Entity Merge Suggestions: reviewable deduplication proposals ───
export const entityMergeSuggestions = mysqlTable("entity_merge_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  sourceEntityId: int("sourceEntityId").notNull(), // entity to be merged (absorbed)
  targetEntityId: int("targetEntityId").notNull(), // surviving entity
  confidence: double("confidence").notNull(), // 0.0 - 1.0
  reason: text("reason").notNull(), // explanation of why these are likely duplicates
  status: mysqlEnum("mergeStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  reviewedBy: int("reviewedBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_merge_case").on(table.caseId),
  index("idx_merge_source").on(table.sourceEntityId),
  index("idx_merge_target").on(table.targetEntityId),
  index("idx_merge_status").on(table.status),
]);

export type EntityMergeSuggestion = typeof entityMergeSuggestions.$inferSelect;

// ─── Audit Trail: immutable log with hash chain ───
export const auditTrail = mysqlTable("audit_trail", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId"),
  userId: int("userId"),
  action: varchar("action", { length: 128 }).notNull(), // upload, extract, analyze, export, view, edit, delete
  targetType: varchar("targetType", { length: 64 }), // document, entity, finding, presentation, export
  targetId: int("targetId"),
  details: json("details"),
  hash: varchar("hash", { length: 64 }).notNull(), // SHA-256 of this entry + previous hash
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_audit_case").on(table.caseId),
  index("idx_audit_action").on(table.action),
]);

export type AuditTrailEntry = typeof auditTrail.$inferSelect;

// ─── Chat Messages: Ask the Evidence ───
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("chatRole", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  citations: json("citations"), // { documentId, page, quote }[]
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_chat_case").on(table.caseId),
]);

export type ChatMessage = typeof chatMessages.$inferSelect;

// ─── Upload Sessions: persistent upload tracking (survives navigation) ───
export const uploadSessions = mysqlTable("upload_sessions", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  totalFiles: int("totalFiles").notNull().default(0),
  completedFiles: int("completedFiles").notNull().default(0),
  failedFiles: int("failedFiles").notNull().default(0),
  duplicateFiles: int("duplicateFiles").notNull().default(0),
  status: mysqlEnum("sessionStatus", ["uploading", "processing", "complete", "failed", "expired"]).default("uploading").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_upload_session_user").on(table.userId),
  index("idx_upload_session_case").on(table.caseId),
  index("idx_upload_session_status").on(table.status),
]);

export type UploadSession = typeof uploadSessions.$inferSelect;

// ─── Provenance Audit Logs: immutable record of provenance decisions ───
export const provenanceAuditLogs = mysqlTable("provenance_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("findingId").notNull(),
  userId: int("userId").notNull(),
  actionType: mysqlEnum("actionType", ["re_run_matching", "mark_synthesis", "flag_for_review", "batch_rerun"]).notNull(),
  reason: text("reason"), // mandatory for mark_synthesis
  previousStatus: varchar("previousStatus", { length: 64 }).notNull(),
  newStatus: varchar("newStatus", { length: 64 }).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(), // action-specific details (match results, etc.)
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_prov_audit_finding").on(table.findingId),
  index("idx_prov_audit_user").on(table.userId),
  index("idx_prov_audit_action").on(table.actionType),
]);
export type ProvenanceAuditLog = typeof provenanceAuditLogs.$inferSelect;

// ─── Batch Rerun Runs: tracks batch provenance re-run operations ───
export const batchRerunRuns = mysqlTable("batch_rerun_runs", {
  id: int("id").autoincrement().primaryKey(),
  startedBy: int("startedBy").notNull(), // userId
  status: mysqlEnum("status", ["running", "completed", "aborted", "error"]).default("running").notNull(),
  totalFindings: int("totalFindings").default(0).notNull(),
  processedCount: int("processedCount").default(0).notNull(),
  resolvedCount: int("resolvedCount").default(0).notNull(), // newly linked
  errorCount: int("errorCount").default(0).notNull(),
  stillUnsupported: int("stillUnsupported").default(0).notNull(),
  lastProcessedFindingId: int("lastProcessedFindingId"), // for resume
  fallbackUsageCount: int("fallbackUsageCount").default(0).notNull(),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  abortedAt: bigint("abortedAt", { mode: "number" }),
  runtimeMs: bigint("runtimeMs", { mode: "number" }),
}, (table) => [
  index("idx_batch_rerun_status").on(table.status),
  index("idx_batch_rerun_user").on(table.startedBy),
]);
export type BatchRerunRun = typeof batchRerunRuns.$inferSelect;

// ─── Provenance Alert Events ───

export const provenanceAlertEvents = mysqlTable("provenance_alert_events", {
  id: int("id").primaryKey().autoincrement(),
  alertType: mysqlEnum("alert_type", ["PROVENANCE_DRIFT", "PROVENANCE_COVERAGE_DROP"]).notNull(),
  metrics: json("metrics").$type<{
    coverage: number;
    unsupportedRate: number;
    fallbackRate: number;
    totalFindings: number;
    unsupportedCount: number;
    batchId?: number;
  }>().notNull(),
  cooldownUntil: bigint("cooldown_until", { mode: "number" }).notNull(),
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_alert_type").on(table.alertType),
  index("idx_alert_cooldown").on(table.alertType, table.cooldownUntil),
]);
export type ProvenanceAlertEvent = typeof provenanceAlertEvents.$inferSelect;

// ─── Case Collaborators: per-case read-only or write access for authorized users ───
export const COLLABORATOR_ACCESS_LEVELS = ["READ_ONLY", "WRITE"] as const;
export type CollaboratorAccessLevel = typeof COLLABORATOR_ACCESS_LEVELS[number];

export const caseCollaborators = mysqlTable("case_collaborators", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  accessLevel: mysqlEnum("accessLevel", ["READ_ONLY", "WRITE"]).default("READ_ONLY").notNull(),
  grantedBy: int("grantedBy").notNull(),
  grantedAt: bigint("grantedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_collab_case_user").on(table.caseId, table.userId),
  index("idx_collab_user").on(table.userId),
  index("idx_collab_case").on(table.caseId),
]);
export type CaseCollaborator = typeof caseCollaborators.$inferSelect;

// ─── Phase-2: Read-Only Projection Layer ───

/**
 * Phase-2 Runs: derived analysis runs that consume sealed snapshots.
 * Each run is bound to a single sealed snapshot and produces derived artifacts.
 * Phase-2 never mutates Phase-1 tables.
 */
export const phase2Runs = mysqlTable("phase2_runs", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  snapshotId: int("snapshotId").notNull(),
  engineVersionReference: varchar("engineVersionReference", { length: 256 }).notNull(),
  status: mysqlEnum("phase2Status", ["open", "complete", "error"]).default("open").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2runs_case").on(table.caseId),
  index("idx_p2runs_snapshot").on(table.snapshotId),
  index("idx_p2runs_status").on(table.status),
]);

export type Phase2Run = typeof phase2Runs.$inferSelect;

/**
 * Phase-2 Evidence Requirements: derived artifacts identifying evidentiary gaps
 * or requirements surfaced by projection analysis.
 */
export const phase2EvidenceRequirements = mysqlTable("phase2_evidence_requirements", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  snapshotId: int("snapshotId").notNull(),
  payload: json("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2er_run").on(table.runId),
  index("idx_p2er_snapshot").on(table.snapshotId),
]);

export type Phase2EvidenceRequirement = typeof phase2EvidenceRequirements.$inferSelect;

/**
 * Phase-2 Structured Notes: derived artifacts containing structured analytical notes
 * produced by projection analysis.
 */
export const phase2StructuredNotes = mysqlTable("phase2_structured_notes", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  snapshotId: int("snapshotId").notNull(),
  payload: json("payload").notNull().$type<Record<string, unknown>>(),
  /** ISO 8601 temporal anchors extracted from snapshot date fields. Sorted ascending, deduplicated. */
  temporalAnchors: json("temporalAnchors").$type<string[]>().default([]),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2sn_run").on(table.runId),
  index("idx_p2sn_snapshot").on(table.snapshotId),
]);

export type Phase2StructuredNote = typeof phase2StructuredNotes.$inferSelect;

// ─── Document Checklist Items: per-case checklist tracking ───
export const checklistItems = mysqlTable("checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  label: varchar("label", { length: 512 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["critical", "important", "helpful"]).default("important").notNull(),
  checked: boolean("checked").default(false).notNull(),
  checkedAt: bigint("checkedAt", { mode: "number" }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_checklist_case").on(table.caseId),
]);
export type ChecklistItem = typeof checklistItems.$inferSelect;

// ─── User Feedback: Clippy-style help assistant submissions ───
export const userFeedback = mysqlTable("user_feedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  caseId: int("caseId"),
  feedbackType: mysqlEnum("feedbackType", ["suggestion", "question", "bug_report", "praise", "other"]).default("suggestion").notNull(),
  message: text("message").notNull(),
  currentPage: varchar("currentPage", { length: 256 }),
  pipelineType: varchar("pipelineType", { length: 64 }),
  status: mysqlEnum("feedbackStatus", ["new", "reviewed", "resolved"]).default("new").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_feedback_user").on(table.userId),
  index("idx_feedback_status").on(table.status),
]);
export type UserFeedback = typeof userFeedback.$inferSelect;

// ─── Pipeline Analytics: track pipeline usage events ───
export const pipelineEvents = mysqlTable("pipeline_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pipelineType: varchar("pipelineType", { length: 64 }).notNull(),
  eventType: mysqlEnum("eventType", ["intake_start", "intake_complete", "direct_create", "document_uploaded", "extraction_complete", "analysis_started", "analysis_complete", "findings_generated", "export_created", "case_completed", "guided_intake_complete", "guided_to_conversation"]).default("direct_create").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // geographic scope for map clustering
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pe_pipeline").on(table.pipelineType),
  index("idx_pe_event").on(table.eventType),
  index("idx_pe_created").on(table.createdAt),
  index("idx_pe_state").on(table.stateCode),
]);
export type PipelineEvent = typeof pipelineEvents.$inferSelect;

// ─── Share Links: time-limited read-only case sharing for advocates ───
export const shareLinks = mysqlTable("share_links", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  createdBy: int("createdBy").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 256 }), // e.g., "For my attorney", "Legal aid review"
  permissions: mysqlEnum("permissions", ["read_only", "read_export"]).default("read_only").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  revokedAt: bigint("revokedAt", { mode: "number" }),
  lastAccessedAt: bigint("lastAccessedAt", { mode: "number" }),
  accessCount: int("accessCount").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_share_token").on(table.token),
  index("idx_share_case").on(table.caseId),
  index("idx_share_created_by").on(table.createdBy),
  index("idx_share_expires").on(table.expiresAt),
]);
export type ShareLink = typeof shareLinks.$inferSelect;


// ─── Notifications ───
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // share_accessed, extraction_complete, new_findings, case_status, feedback_response, share_expiring
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  metadata: json("metadata").$type<Record<string, any>>(), // caseId, documentId, shareLinkId, etc.
  linkUrl: varchar("linkUrl", { length: 500 }), // in-app URL to navigate to
  readAt: bigint("readAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_notif_user").on(table.userId),
  index("idx_notif_user_read").on(table.userId, table.readAt),
  index("idx_notif_created").on(table.createdAt),
]);
export type Notification = typeof notifications.$inferSelect;

// ─── Admin Invite Links (targetRole, targetPlan, inviteStatus) ───
export const adminInvites = mysqlTable("admin_invites", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  createdBy: int("createdBy").notNull(),
  targetRole: mysqlEnum("targetRole", ["user", "admin"]).default("admin").notNull(),
  targetPlan: mysqlEnum("targetPlan", ["free", "advocacy", "family_advocacy", "analyst", "professional", "enterprise"]).default("advocacy").notNull(),
  label: varchar("label", { length: 256 }),
  maxUses: int("maxUses").default(1).notNull(),
  useCount: int("useCount").default(0).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  inviteStatus: mysqlEnum("inviteStatus", ["active", "expired", "revoked", "exhausted"]).default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_invite_token").on(table.token),
  index("idx_invite_created_by").on(table.createdBy),
  index("idx_invite_status").on(table.inviteStatus),
  index("idx_invite_expires").on(table.expiresAt),
]);
export type AdminInvite = typeof adminInvites.$inferSelect;

// ─── Invite Redemptions (tracks who used which invite) ───
export const inviteRedemptions = mysqlTable("invite_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  inviteId: int("inviteId").notNull(),
  userId: int("userId").notNull(),
  redeemedAt: bigint("redeemedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_redemption_invite").on(table.inviteId),
  index("idx_redemption_user").on(table.userId),
]);
export type InviteRedemption = typeof inviteRedemptions.$inferSelect;


// ─── Missing Records (FOIA gap detection — records the engine expects but didn't find) ───
export const missingRecords = mysqlTable("missing_records", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  label: varchar("label", { length: 256 }).notNull(),
  description: text("description").notNull(),
  legalBasis: text("legalBasis"),
  severity: mysqlEnum("severity", ["critical", "important", "helpful"]).notNull(),
  agencyType: varchar("agencyType", { length: 256 }),
  foiaEligible: boolean("foiaEligible").default(false).notNull(),
  status: mysqlEnum("missingRecordStatus", ["detected", "acknowledged", "requested", "received", "not_applicable"]).default("detected").notNull(),
  detectedAt: bigint("detectedAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_missing_records_case").on(table.caseId),
  index("idx_missing_records_domain").on(table.domain),
  index("idx_missing_records_status").on(table.status),
  index("idx_missing_records_severity").on(table.severity),
]);
export type MissingRecord = typeof missingRecords.$inferSelect;
export type InsertMissingRecord = typeof missingRecords.$inferInsert;

// ─── FOIA Statutes: public records laws by jurisdiction ───
export const foiaStatutes = mysqlTable("foia_statutes", {
  id: int("id").autoincrement().primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  lawName: varchar("lawName", { length: 256 }).notNull(),
  statuteReference: varchar("statuteReference", { length: 256 }).notNull(),
  responseDeadlineDays: int("responseDeadlineDays"),
  appealDeadlineDays: int("appealDeadlineDays"),
  feeWaiverAvailable: boolean("feeWaiverAvailable").default(false).notNull(),
  expeditedProcessingAvailable: boolean("expeditedProcessingAvailable").default(false).notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_statutes_state").on(table.stateCode),
]);
export type FoiaStatute = typeof foiaStatutes.$inferSelect;
export type InsertFoiaStatute = typeof foiaStatutes.$inferInsert;

// ─── FOIA Agencies: agency registry ───
export const foiaAgencies = mysqlTable("foia_agencies", {
  id: int("id").autoincrement().primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  jurisdictionLevel: mysqlEnum("jurisdictionLevel", ["federal", "state", "county", "municipal", "court"]).notNull(),
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  agencyComponent: varchar("agencyComponent", { length: 256 }),
  portalUrl: text("portalUrl"),
  email: varchar("email", { length: 320 }),
  mailingAddress: text("mailingAddress"),
  submissionMethods: mysqlEnum("submissionMethods", ["portal", "email", "mail", "mixed"]).default("mixed").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_agencies_state").on(table.stateCode),
  index("idx_foia_agencies_jurisdiction").on(table.jurisdictionLevel),
]);
export type FoiaAgency = typeof foiaAgencies.$inferSelect;
export type InsertFoiaAgency = typeof foiaAgencies.$inferInsert;

// ─── FOIA Record Types: canonical record definitions ───
export const foiaRecordTypes = mysqlTable("foia_record_types", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  recordDescription: text("recordDescription").notNull(),
  typicalKeywords: json("typicalKeywords").$type<string[]>(),
  retentionNotes: text("retentionNotes"),
}, (table) => [
  index("idx_foia_record_types_domain").on(table.domain),
  uniqueIndex("idx_foia_record_types_unique").on(table.domain, table.recordType),
]);
export type FoiaRecordType = typeof foiaRecordTypes.$inferSelect;
export type InsertFoiaRecordType = typeof foiaRecordTypes.$inferInsert;

// ─── FOIA Agency Records: junction mapping records → agencies → statutes ───
export const foiaAgencyRecords = mysqlTable("foia_agency_records", {
  id: int("id").autoincrement().primaryKey(),
  agencyId: int("agencyId").notNull(),
  recordTypeId: int("recordTypeId").notNull(),
  statuteId: int("statuteId").notNull(),
  confidence: mysqlEnum("confidence", ["high", "medium", "low"]).default("medium").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_agency_records_agency").on(table.agencyId),
  index("idx_foia_agency_records_record").on(table.recordTypeId),
  index("idx_foia_agency_records_statute").on(table.statuteId),
]);
export type FoiaAgencyRecord = typeof foiaAgencyRecords.$inferSelect;
export type InsertFoiaAgencyRecord = typeof foiaAgencyRecords.$inferInsert;

// ─── FOIA Requests: system-generated records request drafts ───
export const foiaRequests = mysqlTable("foia_requests", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  missingRecordId: int("missingRecordId").notNull(), // FK → missing_records.id
  agencyId: int("agencyId"), // FK → foia_agencies.id (null if no AKB match)
  statuteId: int("statuteId"), // FK → foia_statutes.id (null if no AKB match)
  // Request metadata
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  stateCode: varchar("stateCode", { length: 8 }).default("WA").notNull(),
  // Request fingerprint — deterministic hash for cross-request analytics
  requestFingerprint: varchar("requestFingerprint", { length: 128 }).notNull(),
  // Letter content
  letterContent: mediumtext("letterContent").notNull(),
  // Requester info (populated from user profile + case context)
  requesterName: varchar("requesterName", { length: 256 }),
  requesterAddress: text("requesterAddress"),
  requesterEmail: varchar("requesterEmail", { length: 320 }),
  requesterPhone: varchar("requesterPhone", { length: 32 }),
  // Agency target info (denormalized for letter generation)
  agencyName: varchar("agencyName", { length: 256 }),
  agencyAddress: text("agencyAddress"),
  agencyEmail: varchar("agencyEmail", { length: 320 }),
  // Status tracking
  status: mysqlEnum("foiaRequestStatus", [
    "draft",        // Generated, awaiting user review
    "ready",        // User reviewed and approved
    "submitted",    // User reports they've sent it
    "acknowledged", // Agency acknowledged receipt
    "in_processing",// Agency is processing
    "records_produced", // Records received
    "partial_denial",   // Some records withheld
    "denied",       // Full denial
    "appeal_prepared",  // Appeal letter generated
    "appeal_submitted", // Appeal sent
    "closed",       // Resolved
  ]).default("draft").notNull(),
  // Gating metadata — why the system recommended this request
  gatingReason: text("gatingReason"), // JSON: { criteria_met, case_stage, severity_threshold }
  warmHandoff: boolean("warmHandoff").default(false).notNull(), // true if system recommends human advocate
  warmHandoffReason: text("warmHandoffReason"),
  // Timing
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  submittedAt: bigint("submittedAt", { mode: "number" }),
  responseDueAt: bigint("responseDueAt", { mode: "number" }), // calculated from statute deadline
  responseReceivedAt: bigint("responseReceivedAt", { mode: "number" }),
}, (table) => [
  index("idx_foia_req_case").on(table.caseId),
  index("idx_foia_req_user").on(table.userId),
  index("idx_foia_req_status").on(table.status),
  index("idx_foia_req_missing").on(table.missingRecordId),
  index("idx_foia_req_fingerprint").on(table.requestFingerprint),
  uniqueIndex("idx_foia_req_case_fingerprint").on(table.caseId, table.requestFingerprint),
  index("idx_foia_req_agency").on(table.agencyId),
  index("idx_foia_req_domain").on(table.domain),
]);
export type FoiaRequest = typeof foiaRequests.$inferSelect;
export type InsertFoiaRequest = typeof foiaRequests.$inferInsert;

// ─── Case Narratives: Statement of Facts generated from evidence timeline ───
export const caseNarratives = mysqlTable("case_narratives", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  content: mediumtext("content").notNull(), // Markdown narrative
  // Source map: JSON array mapping paragraph indices to source evidence
  // Each entry: { paragraphIndex, sources: [{ type, id, label, documentId?, page?, date? }] }
  sourceMap: json("sourceMap").$type<NarrativeSourceMap>().notNull(),
  // Timeline item count at generation time (for staleness detection)
  timelineItemCount: int("timelineItemCount").notNull(),
  // Snapshot ID at generation time (optional future compatibility)
  snapshotId: int("snapshotId"),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_narrative_case").on(table.caseId), // Only one active narrative per case
  index("idx_narrative_user").on(table.userId),
]);

export type NarrativeSourceEntry = {
  type: "event" | "quote" | "claim" | "finding" | "foia_request";
  id: number;
  label: string;
  documentId?: number;
  documentName?: string;
  page?: number;
  date?: string;
};

export type NarrativeSourceMap = {
  paragraphIndex: number;
  sources: NarrativeSourceEntry[];
}[];

export type CaseNarrative = typeof caseNarratives.$inferSelect;
export type InsertCaseNarrative = typeof caseNarratives.$inferInsert;

// ─── Pattern Types: categories of cross-case patterns ───
export const PATTERN_TYPE_VALUES = [
  "entity_recurrence",
  "agency_behavior",
  "denial_language_pattern",
  "regulatory_violation_pattern",
  "foia_denial_pattern",
  "record_gap_pattern",
] as const;
export type PatternTypeValue = typeof PATTERN_TYPE_VALUES[number];

export const patternTypes = mysqlTable("pattern_types", {
  id: int("id").autoincrement().primaryKey(),
  patternType: varchar("patternType", { length: 128 }).notNull().unique(),
  description: text("description").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type PatternType = typeof patternTypes.$inferSelect;
export type InsertPatternType = typeof patternTypes.$inferInsert;

// ─── Patterns: unique cross-case pattern instances with deterministic signatures ───
export const patterns = mysqlTable("patterns", {
  id: int("id").autoincrement().primaryKey(),
  patternTypeId: int("patternTypeId").notNull(), // FK → pattern_types.id
  signature: varchar("signature", { length: 512 }).notNull(), // deterministic canonical hash
  description: text("description").notNull(),
  firstSeenAt: bigint("firstSeenAt", { mode: "number" }).notNull(),
  lastSeenAt: bigint("lastSeenAt", { mode: "number" }).notNull(),
  occurrenceCount: int("occurrenceCount").notNull().default(1),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_patterns_signature").on(table.signature),
  index("idx_patterns_type").on(table.patternTypeId),
  index("idx_patterns_occurrence_count").on(table.occurrenceCount),
]);

export type Pattern = typeof patterns.$inferSelect;
export type InsertPattern = typeof patterns.$inferInsert;

// ─── Pattern Occurrences: where a pattern appears (case + evidence reference) ───
export const patternOccurrences = mysqlTable("pattern_occurrences", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("patternId").notNull(), // FK → patterns.id
  caseId: int("caseId").notNull(),
  entityId: int("entityId"), // optional: entity involved
  agencyId: int("agencyId"), // optional: agency involved
  evidenceReferenceId: int("evidenceReferenceId").notNull(), // ID of the evidence item (entity, claim, foia_request, etc.)
  evidenceReferenceType: varchar("evidenceReferenceType", { length: 64 }).notNull(), // "entity", "claim", "foia_request", "finding", "missing_record"
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_po_pattern").on(table.patternId),
  index("idx_po_case").on(table.caseId),
  index("idx_po_entity").on(table.entityId),
  index("idx_po_agency").on(table.agencyId),
  uniqueIndex("idx_po_unique").on(table.patternId, table.caseId, table.evidenceReferenceId, table.evidenceReferenceType),
]);

export type PatternOccurrence = typeof patternOccurrences.$inferSelect;
export type InsertPatternOccurrence = typeof patternOccurrences.$inferInsert;

// ─── Benefit Applications: track user's benefit application status ───
export const benefitApplications = mysqlTable("benefit_applications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK → users.id
  caseId: int("caseId"), // optional FK → cases.id (if linked to a case)
  programId: varchar("programId", { length: 128 }).notNull(), // matches BenefitProgram.id
  programName: varchar("programName", { length: 256 }).notNull(), // human-readable name at time of creation
  status: mysqlEnum("benefitAppStatus", [
    "not_started",    // User bookmarked the program but hasn't applied
    "gathering_docs", // Actively collecting required documents
    "applied",        // Application submitted
    "waiting",        // Waiting for a decision
    "approved",       // Application approved
    "denied",         // Application denied
    "appealing",      // Appealing a denial
    "expired",        // Application or benefit expired
  ]).default("not_started").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // state if localized
  appliedAt: bigint("appliedAt", { mode: "number" }), // when they submitted
  decisionAt: bigint("decisionAt", { mode: "number" }), // when decision came
  nextDeadline: bigint("nextDeadline", { mode: "number" }), // upcoming deadline
  deadlineLabel: varchar("deadlineLabel", { length: 256 }), // e.g. "Appeal deadline", "Recertification due"
  notes: text("notes"), // user's personal notes
  denialReason: text("denialReason"), // if denied, why
  applicationUrl: text("applicationUrl"), // link to the application portal
  confirmationNumber: varchar("confirmationNumber", { length: 128 }), // application confirmation/reference number
  documentsNeeded: json("documentsNeeded").$type<string[]>(), // list of documents still needed
  documentsSubmitted: json("documentsSubmitted").$type<string[]>(), // list of documents already submitted
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ba_user").on(table.userId),
  index("idx_ba_case").on(table.caseId),
  index("idx_ba_program").on(table.programId),
  index("idx_ba_status").on(table.status),
  index("idx_ba_deadline").on(table.nextDeadline),
]);
export type BenefitApplication = typeof benefitApplications.$inferSelect;
export type InsertBenefitApplication = typeof benefitApplications.$inferInsert;


// ─── Lighthouse: Community Hub Tables ───

// Suggestions — community-submitted ideas for the board
export const lighthouseSuggestions = mysqlTable("lighthouse_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK → users.id
  content: text("content").notNull(),
  status: mysqlEnum("suggestionStatus", ["pending", "reviewed", "accepted", "implemented", "declined"]).default("pending").notNull(),
  votes: int("votes").default(0).notNull(),
  adminNote: text("adminNote"), // admin response or note
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_suggestion_user").on(table.userId),
  index("idx_lh_suggestion_status").on(table.status),
  index("idx_lh_suggestion_votes").on(table.votes),
]);
export type LighthouseSuggestion = typeof lighthouseSuggestions.$inferSelect;
export type InsertLighthouseSuggestion = typeof lighthouseSuggestions.$inferInsert;

// Suggestion votes — track who voted to prevent duplicates
export const lighthouseSuggestionVotes = mysqlTable("lighthouse_suggestion_votes", {
  id: int("id").autoincrement().primaryKey(),
  suggestionId: int("suggestionId").notNull(), // FK → lighthouse_suggestions.id
  userId: int("userId").notNull(), // FK → users.id
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_lh_vote_unique").on(table.suggestionId, table.userId),
]);

// Spotlight — admin-curated featured content that rotates
export const lighthouseSpotlight = mysqlTable("lighthouse_spotlight", {
  id: int("id").autoincrement().primaryKey(),
  eyebrow: varchar("eyebrow", { length: 64 }).notNull(), // e.g., "THIS MONTH'S FOCUS"
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  color: varchar("color", { length: 32 }).default("#d4a017").notNull(), // hex color for theming
  cta: varchar("cta", { length: 64 }).default("Learn More").notNull(), // call-to-action text
  href: text("href"), // optional link
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  startDate: bigint("startDate", { mode: "number" }), // optional scheduling
  endDate: bigint("endDate", { mode: "number" }),
  lat: double("lat"), // geocoded latitude
  lng: double("lng"), // geocoded longitude
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_spotlight_active").on(table.active),
  index("idx_lh_spotlight_order").on(table.sortOrder),
]);
export type LighthouseSpotlight = typeof lighthouseSpotlight.$inferSelect;
export type InsertLighthouseSpotlight = typeof lighthouseSpotlight.$inferInsert;

// Job Board — vetted job postings, apprenticeships, workforce programs
export const lighthouseJobs = mysqlTable("lighthouse_jobs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  organization: varchar("organization", { length: 256 }).notNull(),
  description: text("description").notNull(),
  jobType: mysqlEnum("jobType", ["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]).notNull(),
  category: mysqlEnum("jobCategory", ["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).default("general").notNull(),
  location: varchar("location", { length: 256 }), // city/region
  stateCode: varchar("stateCode", { length: 2 }), // state abbreviation
  remote: boolean("remote").default(false).notNull(),
  url: text("url"), // external application link
  contactInfo: text("contactInfo"), // how to apply if no URL
  requirements: text("requirements"), // qualifications
  compensation: varchar("compensation", { length: 128 }), // e.g., "$18-22/hr", "Free training"
  lat: double("lat"), // geocoded latitude
  lng: double("lng"), // geocoded longitude
  postedBy: int("postedBy").notNull(), // FK → users.id (admin who posted)
  status: mysqlEnum("jobStatus", ["active", "filled", "expired", "draft"]).default("active").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }), // auto-expire date
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_job_status").on(table.status),
  index("idx_lh_job_state").on(table.stateCode),
  index("idx_lh_job_type").on(table.jobType),
  index("idx_lh_job_geo").on(table.lat, table.lng),
  index("idx_lh_job_expires").on(table.expiresAt),
]);
export type LighthouseJob = typeof lighthouseJobs.$inferSelect;
export type InsertLighthouseJob = typeof lighthouseJobs.$inferInsert;

// Community Board — help wanted/offered, skill shares, resource sharing
export const lighthousePosts = mysqlTable("lighthouse_posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK → users.id
  category: mysqlEnum("postCategory", ["ask_help", "offer_help", "skill_share", "resource_share", "general"]).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // optional geographic scope
  location: varchar("location", { length: 256 }), // city/region
  lat: double("lat"), // geocoded latitude
  lng: double("lng"), // geocoded longitude
  status: mysqlEnum("postStatus", ["active", "resolved", "expired", "flagged", "removed"]).default("active").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }), // auto-expire (30 days default)
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_post_user").on(table.userId),
  index("idx_lh_post_category").on(table.category),
  index("idx_lh_post_status").on(table.status),
  index("idx_lh_post_state").on(table.stateCode),
  index("idx_lh_post_created").on(table.createdAt),
  index("idx_lh_post_geo").on(table.lat, table.lng),
]);
export type LighthousePost = typeof lighthousePosts.$inferSelect;
export type InsertLighthousePost = typeof lighthousePosts.$inferInsert;


// ─── Civic Map: Geocode Cache ───
// Caches address → lat/lng lookups to avoid repeated geocoding API calls.
// Key is a normalized address string; coordinates are stored as decimal degrees.
export const geocodeCache = mysqlTable("geocode_cache", {
  id: int("id").autoincrement().primaryKey(),
  addressKey: varchar("addressKey", { length: 512 }).notNull().unique(), // normalized input
  formattedAddress: varchar("formattedAddress", { length: 512 }), // Google's canonical form
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  placeId: varchar("placeId", { length: 256 }), // Google place_id for dedup
  source: mysqlEnum("geocodeSource", ["google", "manual", "registry"]).default("google").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_gc_address").on(table.addressKey),
  index("idx_gc_place").on(table.placeId),
]);
export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type InsertGeocodeCache = typeof geocodeCache.$inferInsert;

// ─── Civic Map: Events / Workshops ───
// Lighthouse events (workshops, trainings, community gatherings) with location data.
export const lighthouseEvents = mysqlTable("lighthouse_events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  eventType: mysqlEnum("eventType", ["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).default("workshop").notNull(),
  organization: varchar("organization", { length: 256 }),
  stateCode: varchar("stateCode", { length: 2 }),
  location: varchar("location", { length: 256 }), // human-readable address
  lat: double("lat"),
  lng: double("lng"),
  url: text("url"), // registration or info link
  contactInfo: text("contactInfo"),
  startsAt: bigint("startsAt", { mode: "number" }).notNull(), // event start time
  endsAt: bigint("endsAt", { mode: "number" }), // event end time
  recurring: boolean("recurring").default(false).notNull(),
  postedBy: int("postedBy").notNull(), // FK → users.id
  status: mysqlEnum("eventStatus", ["upcoming", "active", "completed", "cancelled"]).default("upcoming").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_event_status").on(table.status),
  index("idx_lh_event_state").on(table.stateCode),
  index("idx_lh_event_type").on(table.eventType),
  index("idx_lh_event_starts").on(table.startsAt),
  index("idx_lh_event_geo").on(table.lat, table.lng),
]);
export type LighthouseEvent = typeof lighthouseEvents.$inferSelect;
export type InsertLighthouseEvent = typeof lighthouseEvents.$inferInsert;

// ─── Map-Based Intake Sessions ───
// Stores intake sessions initialized from the Civic Map.
// Contains geographic context, nearby resources, pattern signals, and suggested pipelines.
export const mapIntakeSessions = mysqlTable("map_intake_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Session status: active → completed (case created) or expired (abandoned) */
  status: mysqlEnum("mapIntakeStatus", ["active", "completed", "expired"]).default("active").notNull(),
  /** Coordinates the user clicked on the map */
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  /** Detected state code from coordinates */
  detectedState: varchar("detectedState", { length: 2 }),
  /** Detected city/region from coordinates */
  detectedRegion: varchar("detectedRegion", { length: 128 }),
  /** Nearby resources (programs, oversight, tribal) — JSON array of resource summaries */
  nearbyResources: json("nearbyResources").$type<Array<{
    id: string;
    name: string;
    type: string;
    category?: string;
    phone?: string;
    website?: string;
    distanceKm: number;
  }>>(),
  /** Nearby pattern signals — aggregated, no individual case data */
  patternSignals: json("patternSignals").$type<Array<{
    pipeline: string;
    count: number;
  }>>(),
  /** Suggested pipelines from geographic + signal analysis */
  suggestedPipelines: json("suggestedPipelines").$type<Array<{
    pipeline_id: string;
    label: string;
    confidence: number;
    confidence_label: "high" | "medium" | "low";
    match_reasons: string[];
  }>>(),
  /** Pre-populated programs for intake navigator */
  nearestPrograms: json("nearestPrograms").$type<Array<{
    id: string;
    name: string;
    category?: string;
    phone?: string;
    website?: string;
  }>>(),
  /** Pre-populated oversight bodies for intake navigator */
  nearestOversight: json("nearestOversight").$type<Array<{
    id: string;
    name: string;
    agency?: string;
    phone?: string;
    website?: string;
  }>>(),
  /** If the user completed intake, the resulting case ID */
  caseId: int("caseId"),
  /** Search radius used (km) */
  radiusKm: int("radiusKm").default(50).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_mis_user").on(table.userId),
  index("idx_mis_status").on(table.status),
  index("idx_mis_state").on(table.detectedState),
  index("idx_mis_geo").on(table.lat, table.lng),
]);
export type MapIntakeSession = typeof mapIntakeSessions.$inferSelect;
export type InsertMapIntakeSession = typeof mapIntakeSessions.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// DOCKET ROOM — Structural legislative analysis module
// Principle: Reveal structure. Interpret nothing. Judge nothing.
// ═══════════════════════════════════════════════════════════════════════

// ─── Docket Entries: the law or proposal being analyzed ───
export const docketEntries = mysqlTable("docket_entries", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  shortTitle: varchar("shortTitle", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(), // "federal", "washington", "seattle"
  jurisdictionLevel: mysqlEnum("jurisdictionLevel", ["federal", "state", "county", "city", "tribal"]).notNull(),
  lawType: mysqlEnum("lawType", ["statute", "ordinance", "regulation", "executive_order", "ballot_measure", "proposed_bill", "constitutional_amendment"]).notNull(),
  status: mysqlEnum("docketStatus", ["enacted", "proposed", "repealed", "amended", "under_review"]).notNull(),
  dateIntroduced: varchar("dateIntroduced", { length: 32 }),
  dateEnacted: varchar("dateEnacted", { length: 32 }),
  dateEffective: varchar("dateEffective", { length: 32 }),
  // Plain-language summary (Section 1)
  summary: mediumtext("summary"),
  keyChanges: json("keyChanges").$type<string[]>(),
  // Implementation Dock (Section 4)
  implementationAgencies: json("implementationAgencies").$type<string[]>(),
  adminSteps: json("adminSteps").$type<string[]>(),
  complianceObligations: json("complianceObligations").$type<string[]>(),
  rolloutTimeline: json("rolloutTimeline").$type<string[]>(),
  // Loophole Lantern (Section 5)
  structuralExemptions: json("structuralExemptions").$type<string[]>(),
  enforcementGaps: json("enforcementGaps").$type<string[]>(),
  reportingGaps: json("reportingGaps").$type<string[]>(),
  delegatedAuthority: json("delegatedAuthority").$type<string[]>(),
  // Comparative Bay (Section 6)
  similarLaws: json("similarLaws").$type<{ jurisdiction: string; title: string; note: string }[]>(),
  historicalPrecedents: json("historicalPrecedents").$type<{ title: string; year: string; note: string }[]>(),
  implementationVariations: json("implementationVariations").$type<string[]>(),
  // Metadata
  primarySourceUrl: varchar("primarySourceUrl", { length: 1024 }),
  sourceDocumentUrl: varchar("sourceDocumentUrl", { length: 1024 }), // S3 URL for the full law/proposal document
  sourceDocumentName: varchar("sourceDocumentName", { length: 512 }),
  analysisVersion: varchar("analysisVersion", { length: 32 }).default("1.0").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_docket_jurisdiction").on(table.jurisdiction),
  index("idx_docket_level").on(table.jurisdictionLevel),
  index("idx_docket_type").on(table.lawType),
  index("idx_docket_status").on(table.status),
]);

export type DocketEntry = typeof docketEntries.$inferSelect;
export type InsertDocketEntry = typeof docketEntries.$inferInsert;

// ─── Docket Actors: sponsors, committees, agencies, lobbyists (Section 2) ───
export const docketActors = mysqlTable("docket_actors", {
  id: int("id").autoincrement().primaryKey(),
  docketId: int("docketId").notNull(),
  actorName: varchar("actorName", { length: 512 }).notNull(),
  actorType: mysqlEnum("actorType", [
    "sponsor", "cosponsor", "committee", "implementing_agency",
    "regulatory_body", "lobbyist_org", "advocacy_group", "opposition_group",
    "executive_signatory", "judicial_body"
  ]).notNull(),
  role: varchar("role", { length: 256 }), // specific role description
  affiliation: varchar("affiliation", { length: 256 }), // party, org, etc.
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  sourceNote: text("sourceNote"), // "not yet documented" if unsourced
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_actor_docket").on(table.docketId),
  index("idx_actor_type").on(table.actorType),
]);

export type DocketActor = typeof docketActors.$inferSelect;
export type InsertDocketActor = typeof docketActors.$inferInsert;

// ─── Docket Impacts: populations, industries, agencies affected (Section 3) ───
export const docketImpacts = mysqlTable("docket_impacts", {
  id: int("id").autoincrement().primaryKey(),
  docketId: int("docketId").notNull(),
  impactCategory: mysqlEnum("impactCategory", [
    "population", "industry", "government_agency", "geographic"
  ]).notNull(),
  affectedEntity: varchar("affectedEntity", { length: 512 }).notNull(),
  impactDescription: text("impactDescription"), // factual description of how affected
  scope: varchar("scope", { length: 256 }), // "nationwide", "statewide", "city of seattle"
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  sourceNote: text("sourceNote"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_impact_docket").on(table.docketId),
  index("idx_impact_category").on(table.impactCategory),
]);

export type DocketImpact = typeof docketImpacts.$inferSelect;
export type InsertDocketImpact = typeof docketImpacts.$inferInsert;

// ─── Docket Sources: primary source ledger (Section 7) ───
export const docketSources = mysqlTable("docket_sources", {
  id: int("id").autoincrement().primaryKey(),
  docketId: int("docketId").notNull(),
  sourceType: mysqlEnum("sourceType", [
    "legislation_text", "committee_report", "agency_rule", "court_decision",
    "federal_register", "congressional_record", "state_legislature",
    "executive_order", "press_release", "government_report", "other"
  ]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  url: varchar("url", { length: 1024 }),
  citation: text("citation"), // formal legal citation
  accessDate: varchar("accessDate", { length: 32 }),
  note: text("note"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_source_docket").on(table.docketId),
  index("idx_source_type").on(table.sourceType),
]);

export type DocketSource = typeof docketSources.$inferSelect;
export type InsertDocketSource = typeof docketSources.$inferInsert;


// ─── Docket Submissions: user-submitted law requests ───
export const docketSubmissions = mysqlTable("docket_submissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 256 }),
  userEmail: varchar("userEmail", { length: 320 }),
  lawTitle: varchar("lawTitle", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  jurisdictionLevel: mysqlEnum("submissionJurisdictionLevel", ["federal", "state", "county", "city", "tribal"]).notNull(),
  referenceUrl: varchar("referenceUrl", { length: 1024 }),
  fileUrl: varchar("fileUrl", { length: 1024 }), // S3 URL for uploaded document
  fileName: varchar("fileName", { length: 512 }), // original file name
  notes: text("notes"), // why this law matters / context
  status: mysqlEnum("submissionStatus", ["pending", "in_review", "published", "rejected"]).default("pending").notNull(),
  adminNotes: text("adminNotes"),
  docketEntryId: int("docketEntryId"), // linked docket entry once published
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_submission_user").on(table.userId),
  index("idx_submission_status").on(table.status),
]);

export type DocketSubmission = typeof docketSubmissions.$inferSelect;
export type InsertDocketSubmission = typeof docketSubmissions.$inferInsert;


// ─── LumenSend: Document Generation & Delivery ───

export const lumensendTemplates = mysqlTable("lumensend_templates", {
  id: int("id").autoincrement().primaryKey(),
  documentType: mysqlEnum("documentType", [
    "appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"
  ]).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  subjectTemplate: text("subjectTemplate").notNull(),
  bodyTemplate: text("bodyTemplate").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LumensendTemplate = typeof lumensendTemplates.$inferSelect;
export type InsertLumensendTemplate = typeof lumensendTemplates.$inferInsert;

export const lumensendDrafts = mysqlTable("lumensend_drafts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  caseId: int("caseId"),
  documentType: mysqlEnum("draftDocumentType", [
    "appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"
  ]).notNull(),
  templateId: int("templateId"),
  // Recipient info (pre-filled from registry)
  recipientAgency: varchar("recipientAgency", { length: 512 }),
  recipientName: varchar("recipientName", { length: 256 }),
  recipientAddress: text("recipientAddress"),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  recipientPhone: varchar("recipientPhone", { length: 64 }),
  // Letter content
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // Sender info
  senderName: varchar("senderName", { length: 256 }),
  senderAddress: text("senderAddress"),
  senderEmail: varchar("senderEmail", { length: 320 }),
  senderPhone: varchar("senderPhone", { length: 64 }),
  // Context: where in Luminari did this originate
  contextType: mysqlEnum("contextType", [
    "registry_program", "oversight_body", "cda_denial", "case_repair", "docket_entry", "manual"
  ]).default("manual").notNull(),
  contextId: varchar("contextId", { length: 256 }),
  contextLabel: text("contextLabel"),
  // State & jurisdiction
  jurisdiction: varchar("draftJurisdiction", { length: 64 }),
  // Status
  status: mysqlEnum("draftStatus", ["draft", "ready", "sent", "printed", "copied"]).default("draft").notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
  sentMethod: mysqlEnum("sentMethod", ["email", "print", "copy"]),
  // Dispatch bundle: related actions suggested by the LLM
  relatedActions: text("relatedActions"), // JSON array
  // Follow-up
  followUpDate: bigint("followUpDate", { mode: "number" }),
  followUpSent: boolean("followUpSent").default(false),
  // Timestamps
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lumensend_user").on(table.userId),
  index("idx_lumensend_case").on(table.caseId),
  index("idx_lumensend_status").on(table.status),
]);
export type LumensendDraft = typeof lumensendDrafts.$inferSelect;
export type InsertLumensendDraft = typeof lumensendDrafts.$inferInsert;


// ─── Legal Library: The Law Itself ───
// Domain tags for cross-referencing statutes, regulations, case law, and enforcement records
export const LEGAL_DOMAINS = [
  "housing", "employment", "wages", "insurance", "benefits",
  "civil_rights", "family", "consumer", "foia", "healthcare",
  "education", "immigration", "criminal_justice", "environmental",
  "disability", "tribal", "utilities", "tax", "voting",
  "mental_health", "labor", "child_welfare", "public_accommodation",
  "other"
] as const;
export type LegalDomain = typeof LEGAL_DOMAINS[number];

export const LEGAL_SOURCE_TYPES = ["statute", "regulation", "case_law", "executive_order", "agency_guidance", "model_legislation"] as const;
export type LegalSourceType = typeof LEGAL_SOURCE_TYPES[number];

// ─── Legal Library: Statutes ───
export const legalStatutes = mysqlTable("legal_statutes", {
  id: int("id").autoincrement().primaryKey(),
  // Jurisdiction: state code (e.g., "OR", "AK") or "federal"
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(),
  // Citation: e.g., "ORS 90.427", "15 U.S.C. § 1", "42 U.S.C. § 1983"
  citation: varchar("citation", { length: 256 }).notNull(),
  // Title: human-readable short name
  title: varchar("title", { length: 512 }).notNull(),
  // Full text of the statute
  fullText: mediumtext("fullText"),
  // Summary: plain-language description of what the statute requires
  summary: text("summary"),
  // Domain tags (JSON array of LegalDomain values)
  domains: json("domains").notNull().$type<LegalDomain[]>(),
  // Source type
  sourceType: mysqlEnum("sourceType", ["statute", "regulation", "case_law", "executive_order", "agency_guidance", "model_legislation"]).default("statute").notNull(),
  // Key requirements extracted from the statute (JSON array of strings)
  keyRequirements: json("keyRequirements").$type<string[]>(),
  // Deadlines embedded in the statute (JSON array of {description, days, from})
  deadlines: json("deadlines").$type<Array<{ description: string; days: number; from: string }>>(),
  // Effective date (UTC timestamp)
  effectiveDate: bigint("effectiveDate", { mode: "number" }),
  // Repeal/amendment date if no longer in effect
  repealedDate: bigint("repealedDate", { mode: "number" }),
  // Amendment history (JSON array of {date, description, citation})
  amendments: json("amendments").$type<Array<{ date: number; description: string; citation?: string }>>(),
  // URL to official source
  sourceUrl: text("sourceUrl"),
  // ─── Extended Metadata (Enriched Statute Packets) ───
  // Key provisions (JSON array of strings)
  keyProvisions: json("keyProvisions").$type<string[]>(),
  // Statutory definitions (JSON array of strings)
  definitions: json("definitions").$type<string[]>(),
  // Administrative agencies responsible (JSON array of strings)
  administrativeAgencies: json("administrativeAgencies").$type<string[]>(),
  // Actors map: legislative, administrative, stakeholders
  actors: json("actors").$type<{ legislative?: string[]; administrative?: string[]; stakeholders?: string[] }>(),
  // Structural beneficiaries (JSON array of strings)
  beneficiariesStructural: json("beneficiariesStructural").$type<string[]>(),
  // Funding mechanics (JSON array of strings)
  fundingMechanics: json("fundingMechanics").$type<string[]>(),
  // Enforcement triggers (JSON array of strings)
  enforcementTriggers: json("enforcementTriggers").$type<string[]>(),
  // Loopholes and gaps (JSON array of strings)
  loopholesAndGaps: json("loopholesAndGaps").$type<string[]>(),
  // Impact scope (JSON array of strings)
  impactScope: json("impactScope").$type<string[]>(),
  // Implementation steps (JSON array of strings)
  implementationSteps: json("implementationSteps").$type<string[]>(),
  // Comparative examples (JSON array of strings)
  comparativeExamples: json("comparativeExamples").$type<string[]>(),
  // Public sources (JSON array of strings)
  publicSources: json("publicSources").$type<string[]>(),
  // Neutral summary card (one-paragraph neutral description)
  neutralSummaryCard: text("neutralSummaryCard"),
  // Contact map (JSON array of strings — who to contact)
  contactMap: json("contactMap").$type<string[]>(),
  // Who added this entry
  addedBy: varchar("addedBy", { length: 128 }),
  // Timestamps
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_legal_statutes_jurisdiction").on(table.jurisdiction),
  index("idx_legal_statutes_source_type").on(table.sourceType),
]);
export type LegalStatute = typeof legalStatutes.$inferSelect;
export type InsertLegalStatute = typeof legalStatutes.$inferInsert;

// ─── Legal Library: Statute Clause X-Ray ───
export const legalStatuteClauses = mysqlTable("legal_statute_clauses", {
  id: int("id").autoincrement().primaryKey(),
  // FK to legal_statutes
  statuteId: int("statuteId").notNull(),
  // Title of the clause group (e.g., "TITLE I — QUALITY, AFFORDABLE HEALTH CARE")
  titleGroup: varchar("titleGroup", { length: 512 }).notNull(),
  // Section number (e.g., "Section 1101")
  sectionNumber: varchar("sectionNumber", { length: 64 }).notNull(),
  // Section name (e.g., "Temporary High-Risk Pool Program")
  sectionName: varchar("sectionName", { length: 512 }).notNull(),
  // Mechanic: what the section does
  mechanic: text("mechanic"),
  // Funding mechanism if applicable
  funding: text("funding"),
  // Delegation: who implements
  delegation: text("delegation"),
  // Authority granted
  authority: text("authority"),
  // Constraint or limitation
  constraintNote: text("constraintNote"),
  // Status (e.g., "Authorized but not funded", "Delayed and later repealed")
  status: text("status"),
  // Formula if applicable
  formula: text("formula"),
  // Sort order within the statute
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_statute_clauses_statute").on(table.statuteId),
]);
export type LegalStatuteClause = typeof legalStatuteClauses.$inferSelect;
export type InsertLegalStatuteClause = typeof legalStatuteClauses.$inferInsert;

// ─── Legal Library: Case Law ───
export const legalCaseLaw = mysqlTable("legal_case_law", {
  id: int("id").autoincrement().primaryKey(),
  // Jurisdiction
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(),
  // Case citation: e.g., "Gideon v. Wainwright, 372 U.S. 335 (1963)"
  citation: varchar("citation", { length: 512 }).notNull(),
  // Case name
  caseName: varchar("caseName", { length: 512 }).notNull(),
  // Court: e.g., "U.S. Supreme Court", "9th Circuit", "Oregon Supreme Court"
  court: varchar("court", { length: 256 }).notNull(),
  // Year decided
  yearDecided: int("yearDecided"),
  // Holding: what the court decided
  holding: text("holding"),
  // Key quotes from the opinion (JSON array of {quote, page, context})
  keyQuotes: json("keyQuotes").$type<Array<{ quote: string; page?: string; context?: string }>>(),
  // Statutes interpreted (JSON array of statute citations)
  statutesInterpreted: json("statutesInterpreted").$type<string[]>(),
  // Domain tags
  domains: json("domains").notNull().$type<LegalDomain[]>(),
  // Subsequent history: overruled, affirmed, distinguished, etc.
  subsequentHistory: text("subsequentHistory"),
  // URL to opinion
  sourceUrl: text("sourceUrl"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_legal_case_law_jurisdiction").on(table.jurisdiction),
  index("idx_legal_case_law_court").on(table.court),
]);
export type LegalCaseLaw = typeof legalCaseLaw.$inferSelect;
export type InsertLegalCaseLaw = typeof legalCaseLaw.$inferInsert;

// ─── Legal Library: Enforcement Records ───
export const legalEnforcementRecords = mysqlTable("legal_enforcement_records", {
  id: int("id").autoincrement().primaryKey(),
  // Jurisdiction
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(),
  // Agency that should have enforced
  agencyName: varchar("agencyName", { length: 512 }).notNull(),
  // Complaint type
  complaintType: varchar("complaintType", { length: 256 }),
  // Domain tags
  domains: json("domains").notNull().$type<LegalDomain[]>(),
  // What the statute requires
  statutoryRequirement: text("statutoryRequirement"),
  // Related statute citation
  statuteCitation: varchar("statuteCitation", { length: 256 }),
  // Observed outcome
  outcome: text("outcome"),
  // Average response time (days) — observed vs required
  requiredResponseDays: int("requiredResponseDays"),
  observedResponseDays: int("observedResponseDays"),
  // Pattern description
  patternDescription: text("patternDescription"),
  // Data source
  dataSource: text("dataSource"),
  // Time period covered
  periodStart: bigint("periodStart", { mode: "number" }),
  periodEnd: bigint("periodEnd", { mode: "number" }),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_legal_enforcement_jurisdiction").on(table.jurisdiction),
  index("idx_legal_enforcement_agency").on(table.agencyName),
]);
export type LegalEnforcementRecord = typeof legalEnforcementRecords.$inferSelect;
export type InsertLegalEnforcementRecord = typeof legalEnforcementRecords.$inferInsert;

// ─── Legal Library: Weak Joints (where law and practice diverge) ───
export const legalWeakJoints = mysqlTable("legal_weak_joints", {
  id: int("id").autoincrement().primaryKey(),
  // Jurisdiction
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(),
  // The statute that should govern
  statuteCitation: varchar("statuteCitation", { length: 256 }).notNull(),
  statuteId: int("statuteId"), // FK → legal_statutes.id (nullable)
  // What the statute requires
  whatLawRequires: text("whatLawRequires").notNull(),
  // What actually happens in practice
  whatActuallyHappens: text("whatActuallyHappens").notNull(),
  // The divergence — the gap between law and practice
  divergenceDescription: text("divergenceDescription").notNull(),
  // Domain tags
  domains: json("domains").notNull().$type<LegalDomain[]>(),
  // Severity: how much harm the divergence causes
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  // Evidence supporting this weak joint
  evidenceSources: json("evidenceSources").$type<string[]>(),
  // Related enforcement record IDs
  relatedEnforcementIds: json("relatedEnforcementIds").$type<number[]>(),
  // Who is harmed
  affectedPopulation: text("affectedPopulation"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_legal_weak_joints_jurisdiction").on(table.jurisdiction),
  index("idx_legal_weak_joints_severity").on(table.severity),
]);
export type LegalWeakJoint = typeof legalWeakJoints.$inferSelect;
export type InsertLegalWeakJoint = typeof legalWeakJoints.$inferInsert;

// ─── Legal Library: Systemic Contradictions (the meta-argument) ───
export const legalContradictions = mysqlTable("legal_contradictions", {
  id: int("id").autoincrement().primaryKey(),
  // Title: short name for the contradiction
  title: varchar("title", { length: 512 }).notNull(),
  // Doctrine A: the first legal principle
  doctrineA: text("doctrineA").notNull(),
  doctrineACitation: varchar("doctrineACitation", { length: 256 }),
  // Doctrine B: the contradicting legal principle
  doctrineB: text("doctrineB").notNull(),
  doctrineBCitation: varchar("doctrineBCitation", { length: 256 }),
  // The contradiction: how these two doctrines conflict
  contradictionDescription: text("contradictionDescription").notNull(),
  // Who is harmed by this contradiction
  harmDescription: text("harmDescription"),
  // Domain tags
  domains: json("domains").notNull().$type<LegalDomain[]>(),
  // Jurisdiction: "federal" or state code, or "all" for universal contradictions
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull(),
  // Status of reform efforts
  reformStatus: text("reformStatus"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_legal_contradictions_jurisdiction").on(table.jurisdiction),
]);
export type LegalContradiction = typeof legalContradictions.$inferSelect;
export type InsertLegalContradiction = typeof legalContradictions.$inferInsert;

// ─── Pipeline Intake Enrichments: investigation patterns, red flags, cross-pipeline links ───
export const pipelineIntakeEnrichments = mysqlTable("pipeline_intake_enrichments", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: varchar("pipelineId", { length: 128 }).notNull(),
  investigationPatterns: json("investigationPatterns").$type<string[]>(),
  redFlags: json("redFlags").$type<string[]>(),
  crossPipelineLinks: json("crossPipelineLinks").$type<Array<{ pipeline: string; reason: string }>>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_pie_pipeline").on(table.pipelineId),
]);
export type PipelineIntakeEnrichment = typeof pipelineIntakeEnrichments.$inferSelect;
export type InsertPipelineIntakeEnrichment = typeof pipelineIntakeEnrichments.$inferInsert;


// ─── Agency Performance Metrics: yearly performance data for enforcement agencies ───
export const agencyPerformanceMetrics = mysqlTable("agency_performance_metrics", {
  id: int("id").autoincrement().primaryKey(),
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  agencyAbbreviation: varchar("agencyAbbreviation", { length: 32 }),
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull().default("federal"),
  statutoryAuthority: varchar("statutoryAuthority", { length: 512 }),
  fiscalYear: int("fiscalYear").notNull(),
  chargesFiled: int("chargesFiled"),
  chargesResolved: int("chargesResolved"),
  backlog: int("backlog"),
  avgProcessingDays: int("avgProcessingDays"),
  statutoryDeadlineDays: int("statutoryDeadlineDays"),
  gapDays: int("gapDays"),
  causeFindings: int("causeFindings"),
  causePercentage: decimal("causePercentage", { precision: 5, scale: 2 }),
  conciliationSuccessRate: decimal("conciliationSuccessRate", { precision: 5, scale: 2 }),
  noReasonableCause: int("noReasonableCause"),
  noReasonableCausePercentage: decimal("noReasonableCausePercentage", { precision: 5, scale: 2 }),
  administrativeClosure: int("administrativeClosure"),
  administrativeClosurePercentage: decimal("administrativeClosurePercentage", { precision: 5, scale: 2 }),
  rightToSueIssued: int("rightToSueIssued"),
  rightToSuePercentage: decimal("rightToSuePercentage", { precision: 5, scale: 2 }),
  monetaryRelief: bigint("monetaryRelief", { mode: "number" }),
  sourceUrls: json("sourceUrls").$type<string[]>(),
  dataConfidence: varchar("dataConfidence", { length: 1 }).default("B"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_apm_agency_year").on(table.agencyName, table.fiscalYear),
]);
export type AgencyPerformanceMetric = typeof agencyPerformanceMetrics.$inferSelect;
export type InsertAgencyPerformanceMetric = typeof agencyPerformanceMetrics.$inferInsert;


// ─── Doctrine Registry: named legal doctrines with primary cases and domains ───
export const doctrineRegistry = mysqlTable("doctrine_registry", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull().unique(),
  description: text("description").notNull(),
  primaryCases: json("primaryCases").notNull().$type<string[]>(),
  domains: json("domains").notNull().$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type DoctrineRegistryEntry = typeof doctrineRegistry.$inferSelect;
export type InsertDoctrineRegistryEntry = typeof doctrineRegistry.$inferInsert;

// ─── Agency Authority Map: enforcement pathways per statute/agency pair ───
export const agencyAuthorityMap = mysqlTable("agency_authority_map", {
  id: int("id").autoincrement().primaryKey(),
  statute: varchar("statute", { length: 512 }).notNull(),
  agency: varchar("agency", { length: 512 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 64 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  complaintTypes: json("complaintTypes").notNull().$type<string[]>(),
  statutoryAuthority: json("statutoryAuthority").notNull().$type<string[]>(),
  responseTimelineDays: int("responseTimelineDays"),
  complaintPathway: text("complaintPathway"),
  commonOutcomes: json("commonOutcomes").notNull().$type<string[]>(),
  linkedWeakJoints: json("linkedWeakJoints").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_aam_statute_agency").on(table.statute, table.agencyShort),
]);
export type AgencyAuthorityMapEntry = typeof agencyAuthorityMap.$inferSelect;
export type InsertAgencyAuthorityMapEntry = typeof agencyAuthorityMap.$inferInsert;

// ─── Doctrine Graph Edges: relationship layer connecting statutes, cases, doctrines, weak joints, agencies ───
export const doctrineGraphEdges = mysqlTable("doctrine_graph_edges", {
  id: int("id").autoincrement().primaryKey(),
  fromType: mysqlEnum("fromType", ["statute", "case", "doctrine", "weak_joint", "agency", "domain"]).notNull(),
  fromId: varchar("fromId", { length: 512 }).notNull(),
  edgeType: mysqlEnum("edgeType", ["interpreted_by", "creates", "triggers", "fails_at", "enforced_by", "routes_to", "associated_with", "blocks", "supports"]).notNull(),
  toType: mysqlEnum("toType", ["statute", "case", "doctrine", "weak_joint", "agency", "domain"]).notNull(),
  toId: varchar("toId", { length: 512 }).notNull(),
  strength: mysqlEnum("strength", ["strong", "moderate", "contextual"]).default("moderate").notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_dge_from").on(table.fromType, table.fromId),
  index("idx_dge_to").on(table.toType, table.toId),
  index("idx_dge_edge").on(table.edgeType),
]);
export type DoctrineGraphEdge = typeof doctrineGraphEdges.$inferSelect;
export type InsertDoctrineGraphEdge = typeof doctrineGraphEdges.$inferInsert;


// ─── Litigation Barriers: doctrines/procedures that block claims before merits review ───
export const litigationBarriers = mysqlTable("litigation_barriers", {
  id: int("id").autoincrement().primaryKey(),
  barrierId: varchar("barrierId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  barrierType: mysqlEnum("barrierType", ["jurisdictional", "immunity", "procedural", "timing", "evidentiary", "contractual"]).notNull(),
  domains: json("domains").$type<string[]>().notNull(),
  description: text("description").notNull(),
  leadingAuthorities: json("leadingAuthorities").$type<string[]>(),
  whatItBlocks: text("whatItBlocks").notNull(),
  commonTriggerPatterns: json("commonTriggerPatterns").$type<string[]>(),
  usualOutcome: json("usualOutcome").$type<string[]>(),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).default("high").notNull(),
  linkedWeakJoints: json("linkedWeakJoints").$type<string[]>(),
  possibleWorkarounds: json("possibleWorkarounds").$type<string[]>(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lb_type").on(table.barrierType),
  index("idx_lb_severity").on(table.severity),
]);
export type LitigationBarrier = typeof litigationBarriers.$inferSelect;
export type InsertLitigationBarrier = typeof litigationBarriers.$inferInsert;

// ─── Evidence Sources: real-world proof sources for weak joints and contradictions ───
export const evidenceSources = mysqlTable("evidence_sources", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["audit", "inspector_general", "court_record", "lawsuit", "foia_log", "journalism", "academic_study", "consent_decree", "agency_report"]).notNull(),
  producingEntity: varchar("producingEntity", { length: 512 }).notNull(),
  domains: json("domains").$type<string[]>().notNull(),
  typicalContent: json("typicalContent").$type<string[]>(),
  usefulness: mysqlEnum("usefulness", ["high", "moderate", "contextual"]).default("high").notNull(),
  linkedWeakJoints: json("linkedWeakJoints").$type<string[]>(),
  linkedContradictionTemplates: json("linkedContradictionTemplates").$type<string[]>(),
  accessMethod: text("accessMethod"),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_es_type").on(table.sourceType),
  index("idx_es_usefulness").on(table.usefulness),
]);
export type EvidenceSource = typeof evidenceSources.$inferSelect;
export type InsertEvidenceSource = typeof evidenceSources.$inferInsert;

// ─── Pipeline Intelligence Map: connects investigation pipelines to their legal stack ───
export const pipelineIntelligenceMap = mysqlTable("pipeline_intelligence_map", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: varchar("pipelineId", { length: 64 }).notNull().unique(),
  pipelineName: varchar("pipelineName", { length: 256 }).notNull(),
  primaryDoctrines: json("primaryDoctrines").$type<string[]>(),
  keyStatutes: json("keyStatutes").$type<string[]>(),
  leadingCases: json("leadingCases").$type<string[]>(),
  frequentWeakJoints: json("frequentWeakJoints").$type<string[]>(),
  litigationBarriers: json("litigationBarriers").$type<string[]>(),
  enforcementAgencies: json("enforcementAgencies").$type<string[]>(),
  contradictionTemplates: json("contradictionTemplates").$type<string[]>(),
  evidenceSources: json("evidenceSources").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type PipelineIntelligence = typeof pipelineIntelligenceMap.$inferSelect;
export type InsertPipelineIntelligence = typeof pipelineIntelligenceMap.$inferInsert;

// ─── Signal Registry: detection patterns for investigative signals ───
export const signalRegistry = mysqlTable("signal_registry", {
  id: int("id").autoincrement().primaryKey(),
  signalType: varchar("signalType", { length: 128 }).notNull().unique(),
  domain: varchar("domain", { length: 128 }).notNull(),
  triggerPatterns: json("triggerPatterns").$type<string[]>().notNull(),
  linkedDoctrine: json("linkedDoctrine").$type<string[]>(),
  linkedWeakJoints: json("linkedWeakJoints").$type<string[]>(),
  linkedContradictionTemplates: json("linkedContradictionTemplates").$type<string[]>(),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).default("high").notNull(),
  explanation: text("explanation").notNull(),
  recommendedNextSteps: json("recommendedNextSteps").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  // Signal Flow Engine routing (dedup clustering)
  clusterId: varchar("clusterId", { length: 256 }),
  // Engine routing targets
  routeToPatternEngine: boolean("routeToPatternEngine").default(true),
  routeToStrategyEngine: boolean("routeToStrategyEngine").default(true),
  routeToProceduralEngine: boolean("routeToProceduralEngine").default(true),
}, (table) => [
  index("idx_sr_domain").on(table.domain),
  index("idx_sr_severity").on(table.severity),
]);
export type SignalRegistryEntry = typeof signalRegistry.$inferSelect;
export type InsertSignalRegistryEntry = typeof signalRegistry.$inferInsert;

// ─── Timeline Rules: normalization patterns for temporal references ───
export const timelineRules = mysqlTable("timeline_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("ruleId", { length: 64 }).notNull().unique(),
  pattern: varchar("pattern", { length: 512 }).notNull(),
  normalizedMeaning: varchar("normalizedMeaning", { length: 256 }).notNull(),
  action: varchar("action", { length: 256 }).notNull(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type TimelineRule = typeof timelineRules.$inferSelect;
export type InsertTimelineRule = typeof timelineRules.$inferInsert;

// ─── Timeline Signals: higher-level timing signals emitted after normalization ───
export const timelineSignals = mysqlTable("timeline_signals", {
  id: int("id").autoincrement().primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull().unique(),
  domain: varchar("domain", { length: 128 }).notNull(),
  legalMeaning: text("legalMeaning").notNull(),
  linkedDoctrine: json("linkedDoctrine").$type<string[]>(),
  linkedWeakJoints: json("linkedWeakJoints").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ts_domain").on(table.domain),
]);
export type TimelineSignal = typeof timelineSignals.$inferSelect;
export type InsertTimelineSignal = typeof timelineSignals.$inferInsert;


// ─── Contradiction Templates: structured contradiction detection patterns ───
export const contradictionTemplates = mysqlTable("contradiction_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateId: varchar("templateId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  linkedDoctrine: varchar("linkedDoctrine", { length: 256 }),
  linkedStatute: json("linkedStatute").$type<string[]>(),
  linkedCases: json("linkedCases").$type<string[]>(),
  linkedWeakJoint: varchar("linkedWeakJoint", { length: 64 }),
  legalRequirement: text("legalRequirement").notNull(),
  typicalAgencyClaim: text("typicalAgencyClaim").notNull(),
  evidenceIndicators: json("evidenceIndicators").$type<string[]>(),
  contradictionLogic: text("contradictionLogic").notNull(),
  severity: mysqlEnum("ct_severity", ["critical", "high", "medium", "low"]).notNull(),
  investigationPathways: json("investigationPathways").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ct_domain").on(table.domain),
  index("idx_ct_severity").on(table.severity),
]);
export type ContradictionTemplate = typeof contradictionTemplates.$inferSelect;
export type InsertContradictionTemplate = typeof contradictionTemplates.$inferInsert;

// ─── Narrative Templates: output generation templates for different audiences ───
export const narrativeTemplates = mysqlTable("narrative_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateId: varchar("templateId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  audience: mysqlEnum("nt_audience", ["investigator", "advocate", "legal", "executive"]).notNull(),
  structure: json("structure").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_nt_audience").on(table.audience),
]);
export type NarrativeTemplate = typeof narrativeTemplates.$inferSelect;
export type InsertNarrativeTemplate = typeof narrativeTemplates.$inferInsert;

// ─── Workflow Definitions: orchestration workflows for document analysis pipelines ───
export const workflowDefinitions = mysqlTable("workflow_definitions", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: varchar("workflowId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  trigger: mysqlEnum("wf_trigger", ["document_upload", "batch_ingest", "manual_review", "api_call"]).notNull(),
  steps: json("steps").$type<Array<{
    stepId: string;
    stepType: string;
    input: string[];
    output: string[];
    failureMode: string;
    notes: string;
  }>>(),
  escalationRules: json("escalationRules").$type<string[]>(),
  exportModes: json("exportModes").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type InsertWorkflowDefinition = typeof workflowDefinitions.$inferInsert;


// ─── Agency Case Prioritization: models how agencies prioritize cases after intake ───
export const agencyCasePrioritization = mysqlTable("agency_case_prioritization", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  priorityFactor: text("priorityFactor").notNull(),
  priorityLevel: mysqlEnum("priorityLevel", ["critical", "high", "medium", "low"]).notNull(),
  impactWeight: mysqlEnum("impactWeight", ["very_high", "high", "moderate", "low"]).notNull(),
  investigationAcceleration: text("investigationAcceleration").notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_acp_agency").on(table.agency),
  index("idx_acp_pipeline").on(table.pipelineCategory),
]);
export type AgencyCasePrioritization = typeof agencyCasePrioritization.$inferSelect;
export type InsertAgencyCasePrioritization = typeof agencyCasePrioritization.$inferInsert;

// ─── Agency Resource Capacity: models agency enforcement bandwidth and constraints ───
export const agencyResourceCapacity = mysqlTable("agency_resource_capacity", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  regionalOffice: varchar("regionalOffice", { length: 256 }),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  investigatorCount: varchar("investigatorCount", { length: 128 }),
  annualCaseLoad: varchar("annualCaseLoad", { length: 128 }),
  caseBacklog: varchar("caseBacklog", { length: 64 }),
  enforcementBudget: varchar("enforcementBudget", { length: 128 }),
  resourcePressureLevel: mysqlEnum("resourcePressureLevel", ["low", "medium", "medium-high", "high", "critical"]).notNull(),
  estimatedResponseTime: varchar("estimatedResponseTime", { length: 128 }),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_arc_agency").on(table.agency),
]);
export type AgencyResourceCapacity = typeof agencyResourceCapacity.$inferSelect;
export type InsertAgencyResourceCapacity = typeof agencyResourceCapacity.$inferInsert;


// ─── Agency Intake Decision Rules ───
export const agencyIntakeRules = mysqlTable("agency_intake_rules", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  minimumIntakeElements: json("minimumIntakeElements").$type<string[]>(),
  automaticRejectionConditions: json("automaticRejectionConditions").$type<string[]>(),
  priorityInvestigationTriggers: json("priorityInvestigationTriggers").$type<string[]>(),
  documentationWeight: varchar("documentationWeight", { length: 64 }).notNull(),
  screeningMethod: varchar("screeningMethod", { length: 256 }).notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_air_agency").on(table.agency),
]);
export type AgencyIntakeRule = typeof agencyIntakeRules.$inferSelect;
export type InsertAgencyIntakeRule = typeof agencyIntakeRules.$inferInsert;

// ─── Inter-Agency Referral Network ───
export const interagencyReferrals = mysqlTable("interagency_referrals", {
  id: int("id").autoincrement().primaryKey(),
  originAgency: varchar("originAgency", { length: 256 }).notNull(),
  destinationAgency: varchar("destinationAgency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  referralTrigger: text("referralTrigger").notNull(),
  referralStage: varchar("referralStage", { length: 256 }).notNull(),
  legalAuthority: varchar("legalAuthority", { length: 512 }).notNull(),
  typicalOutcome: text("typicalOutcome").notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_iar_origin").on(table.originAgency),
  index("idx_iar_dest").on(table.destinationAgency),
]);
export type InteragencyReferral = typeof interagencyReferrals.$inferSelect;
export type InsertInteragencyReferral = typeof interagencyReferrals.$inferInsert;

// ─── Agency Coordination Matrix ───
export const agencyCoordinationMatrix = mysqlTable("agency_coordination_matrix", {
  id: int("id").autoincrement().primaryKey(),
  primaryAgency: varchar("primaryAgency", { length: 256 }).notNull(),
  partnerAgency: varchar("partnerAgency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  coordinationTrigger: text("coordinationTrigger").notNull(),
  coordinationStage: varchar("coordinationStage", { length: 256 }).notNull(),
  legalBasis: varchar("legalBasis", { length: 512 }).notNull(),
  combinedEnforcementAction: text("combinedEnforcementAction").notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_acm_primary").on(table.primaryAgency),
  index("idx_acm_partner").on(table.partnerAgency),
]);
export type AgencyCoordination = typeof agencyCoordinationMatrix.$inferSelect;
export type InsertAgencyCoordination = typeof agencyCoordinationMatrix.$inferInsert;

// ─── Federal Enforcement Priority Index ───
export const enforcementPriorityIndex = mysqlTable("enforcement_priority_index", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  priorityIssue: text("priorityIssue").notNull(),
  priorityLevel: varchar("priorityLevel", { length: 64 }).notNull(),
  policySource: varchar("policySource", { length: 512 }).notNull(),
  policyYear: int("policyYear").notNull(),
  impactWeight: varchar("impactWeight", { length: 64 }).notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_epi_agency").on(table.agency),
  index("idx_epi_year").on(table.policyYear),
]);
export type EnforcementPriority = typeof enforcementPriorityIndex.$inferSelect;
export type InsertEnforcementPriority = typeof enforcementPriorityIndex.$inferInsert;

// ─── Historical Enforcement Trends ───
export const enforcementTrends = mysqlTable("enforcement_trends", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  year: int("year").notNull(),
  enforcementActions: varchar("enforcementActions", { length: 256 }),
  penaltyTotal: varchar("penaltyTotal", { length: 256 }),
  averagePenalty: varchar("averagePenalty", { length: 256 }),
  majorCases: varchar("majorCases", { length: 256 }),
  trendDirection: varchar("trendDirection", { length: 64 }).notNull(),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_et_agency").on(table.agency),
  index("idx_et_year").on(table.year),
]);
export type EnforcementTrend = typeof enforcementTrends.$inferSelect;
export type InsertEnforcementTrend = typeof enforcementTrends.$inferInsert;


// ─── Agency Forms Directory ───
export const agencyForms = mysqlTable("agency_forms", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  formName: varchar("formName", { length: 512 }).notNull(),
  formNumber: varchar("formNumber", { length: 128 }),
  purpose: text("purpose").notNull(),
  requiredFields: json("requiredFields").$type<string[]>(),
  supportingDocuments: json("supportingDocuments").$type<string[]>(),
  submissionMethods: json("submissionMethods").$type<string[]>(),
  filingDeadline: varchar("filingDeadline", { length: 512 }),
  link: text("link"),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_af_agency").on(table.agencyShort),
]);
export type AgencyForm = typeof agencyForms.$inferSelect;
export type InsertAgencyForm = typeof agencyForms.$inferInsert;

// ─── Regulatory Guidance Repository ───
export const regulatoryGuidance = mysqlTable("regulatory_guidance", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  documentTitle: varchar("documentTitle", { length: 512 }).notNull(),
  issueArea: varchar("issueArea", { length: 256 }).notNull(),
  authorityBasis: varchar("authorityBasis", { length: 512 }),
  guidanceType: varchar("guidanceType", { length: 128 }).notNull(),
  keyRules: json("keyRules").$type<string[]>(),
  publicationDate: varchar("publicationDate", { length: 64 }),
  citation: varchar("citation", { length: 512 }),
  documentLink: text("documentLink"),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_rg_agency").on(table.agencyShort),
  index("idx_rg_issue").on(table.issueArea),
]);
export type RegulatoryGuidanceEntry = typeof regulatoryGuidance.$inferSelect;
export type InsertRegulatoryGuidance = typeof regulatoryGuidance.$inferInsert;

// ─── Enforcement Penalties ───
export const enforcementPenalties = mysqlTable("enforcement_penalties", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  violationType: varchar("violationType", { length: 256 }).notNull(),
  statutoryMaxPenalty: varchar("statutoryMaxPenalty", { length: 256 }),
  averagePenalty: varchar("averagePenalty", { length: 256 }),
  typicalSettlementRange: varchar("typicalSettlementRange", { length: 256 }),
  additionalRemedies: json("additionalRemedies").$type<string[]>(),
  notableCases: json("notableCases").$type<string[]>(),
  notes: text("notes"),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ep_agency").on(table.agencyShort),
  index("idx_ep_violation").on(table.violationType),
]);
export type EnforcementPenalty = typeof enforcementPenalties.$inferSelect;
export type InsertEnforcementPenalty = typeof enforcementPenalties.$inferInsert;

// ─── Enforcement Viability Rules ───
export const enforcementViabilityRules = mysqlTable("enforcement_viability_rules", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  minimumIntakeThreshold: text("minimumIntakeThreshold"),
  deadlineDependency: text("deadlineDependency"),
  triggerStrength: varchar("triggerStrength", { length: 64 }),
  historicalActionability: varchar("historicalActionability", { length: 64 }),
  recommendedChannel: varchar("recommendedChannel", { length: 256 }),
  notes: text("notes"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_evr_agency").on(table.agencyShort),
  index("idx_evr_claim").on(table.claimType),
  index("idx_evr_pipeline").on(table.pipelineCategory),
]);
export type EnforcementViabilityRule = typeof enforcementViabilityRules.$inferSelect;
export type InsertEnforcementViabilityRule = typeof enforcementViabilityRules.$inferInsert;

// ─── Proof Framework Library ───
export const proofFrameworks = mysqlTable("proof_frameworks", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  elementsOfProof: json("elementsOfProof").$type<string[]>().notNull(),
  burdenOfProof: text("burdenOfProof").notNull(),
  standardOfReview: varchar("standardOfReview", { length: 128 }),
  requiredCausation: varchar("requiredCausation", { length: 256 }),
  typicalEvidence: json("typicalEvidence").$type<string[]>(),
  commonDefenses: json("commonDefenses").$type<string[]>(),
  keyPrecedents: json("keyPrecedents").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pf_claim").on(table.claimType),
  index("idx_pf_domain").on(table.domain),
]);
export type ProofFramework = typeof proofFrameworks.$inferSelect;
export type InsertProofFramework = typeof proofFrameworks.$inferInsert;

// ─── Claim Element Matrix ───
export const claimElementMatrix = mysqlTable("claim_element_matrix", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  elementName: varchar("elementName", { length: 256 }).notNull(),
  elementDescription: text("elementDescription").notNull(),
  elementOrder: int("elementOrder").notNull(),
  evidenceTypes: json("evidenceTypes").$type<string[]>(),
  strengthIndicators: json("strengthIndicators").$type<string[]>(),
  commonWeaknesses: json("commonWeaknesses").$type<string[]>(),
  relatedAgency: varchar("relatedAgency", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cem_claim").on(table.claimType),
  index("idx_cem_domain").on(table.domain),
]);
export type ClaimElement = typeof claimElementMatrix.$inferSelect;
export type InsertClaimElement = typeof claimElementMatrix.$inferInsert;

// ─── Investigation Guidance ───
export const investigationGuidance = mysqlTable("investigation_guidance", {
  id: int("id").autoincrement().primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  investigationFocus: text("investigationFocus").notNull(),
  typicalQuestions: json("typicalQuestions").$type<string[]>().notNull(),
  criticalEvidence: json("criticalEvidence").$type<string[]>().notNull(),
  secondaryEvidence: json("secondaryEvidence").$type<string[]>(),
  commonMistakes: json("commonMistakes").$type<string[]>().notNull(),
  recommendedPreparation: json("recommendedPreparation").$type<string[]>().notNull(),
  investigationStages: json("investigationStages").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ig_agency").on(table.agencyShort),
  index("idx_ig_claim").on(table.claimType),
  index("idx_ig_pipeline").on(table.pipelineCategory),
]);
export type InvestigationGuidanceRecord = typeof investigationGuidance.$inferSelect;
export type InsertInvestigationGuidance = typeof investigationGuidance.$inferInsert;

// ─── Filing Generator ───
export const filingGenerator = mysqlTable("filing_generator", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  formName: varchar("formName", { length: 256 }).notNull(),
  formNumber: varchar("formNumber", { length: 64 }),
  filingLink: text("filingLink"),
  filingDeadline: varchar("filingDeadline", { length: 256 }),
  requiredFields: json("requiredFields").$type<string[]>().notNull(),
  requiredEvidence: json("requiredEvidence").$type<string[]>().notNull(),
  recommendedAttachments: json("recommendedAttachments").$type<string[]>(),
  submissionMethods: json("submissionMethods").$type<string[]>().notNull(),
  expectedTimeline: varchar("expectedTimeline", { length: 256 }),
  intakeWarnings: json("intakeWarnings").$type<string[]>(),
  priorityFlags: json("priorityFlags").$type<string[]>(),
  nextSteps: json("nextSteps").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_fg_agency").on(table.agencyShort),
  index("idx_fg_claim").on(table.claimType),
  index("idx_fg_pipeline").on(table.pipelineCategory),
]);
export type FilingGeneratorRecord = typeof filingGenerator.$inferSelect;
export type InsertFilingGenerator = typeof filingGenerator.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// PROCEDURAL ENGINE — Steps 1-3: Jurisdiction, Timeline Law, Workflows
// ═══════════════════════════════════════════════════════════════════════════

// ─── Jurisdiction Hierarchy: federal → state → county → city ───
export const jurisdictionHierarchy = mysqlTable("jurisdiction_hierarchy", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  type: mysqlEnum("jurisdictionType", ["federal", "state", "county", "city", "tribal", "territory"]).notNull(),
  parentId: int("parentId"),
  level: int("level").notNull(),
  abbreviation: varchar("abbreviation", { length: 16 }),
  fipsCode: varchar("fipsCode", { length: 16 }),
  preemptionRules: json("preemptionRules").$type<Array<{ rule: string; scope: string; authority: string }>>(),
  overrideRules: json("overrideRules").$type<Array<{ rule: string; condition: string }>>(),
  agencies: json("agencies").$type<string[]>(),
  keyStatutes: json("keyStatutes").$type<string[]>(),
  filingVenues: json("filingVenues").$type<string[]>(),
  notes: text("notes"),
  status: mysqlEnum("jurisdictionStatus", ["active", "inactive", "pending"]).default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_jh_type").on(table.type),
  index("idx_jh_parent").on(table.parentId),
  index("idx_jh_level").on(table.level),
]);
export type JurisdictionHierarchyRecord = typeof jurisdictionHierarchy.$inferSelect;
export type InsertJurisdictionHierarchy = typeof jurisdictionHierarchy.$inferInsert;

// ─── Node Timeline: temporal state of legal nodes ───
export const nodeTimeline = mysqlTable("node_timeline", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("nodeId", { length: 256 }).notNull(),
  nodeType: mysqlEnum("nodeTimelineType", ["doctrine", "statute", "regulation", "case_law", "agency_guidance", "executive_order"]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  effectiveDate: bigint("effectiveDate", { mode: "number" }).notNull(),
  amendedDate: bigint("amendedDate", { mode: "number" }),
  repealedDate: bigint("repealedDate", { mode: "number" }),
  supersededBy: varchar("supersededBy", { length: 256 }),
  precedentStrength: mysqlEnum("precedentStrength", ["binding", "persuasive", "advisory", "superseded", "overturned"]).default("persuasive"),
  jurisdictionScope: varchar("jurisdictionScope", { length: 256 }),
  citation: varchar("citation", { length: 512 }),
  domain: varchar("domain", { length: 256 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_nt_node_id").on(table.nodeId),
  index("idx_nt_node_type").on(table.nodeType),
  index("idx_nt_effective").on(table.effectiveDate),
]);
export type NodeTimelineRecord = typeof nodeTimeline.$inferSelect;
export type InsertNodeTimeline = typeof nodeTimeline.$inferInsert;

// ─── Timeline Events: legal events that affect the state of law ───
export const timelineEvents = mysqlTable("timeline_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("timelineEventType", ["court_decision", "statute_enactment", "statute_amendment", "regulation_change", "agency_guidance", "doctrine_shift", "executive_order", "legislative_action"]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  date: bigint("date", { mode: "number" }).notNull(),
  sourceDocument: text("sourceDocument"),
  citation: varchar("citation", { length: 512 }),
  affectedNodes: json("affectedNodes").$type<string[]>(),
  impactType: mysqlEnum("timelineImpactType", ["creates", "amends", "supersedes", "repeals", "expands", "narrows", "clarifies", "overturns"]).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  domain: varchar("domain", { length: 256 }),
  significance: text("significance"),
  status: mysqlEnum("timelineEventStatus", ["active", "superseded", "repealed"]).default("active"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_te_type").on(table.eventType),
  index("idx_te_date").on(table.date),
  index("idx_te_jurisdiction").on(table.jurisdiction),
  index("idx_te_impact").on(table.impactType),
]);
export type TimelineEventRecord = typeof timelineEvents.$inferSelect;
export type InsertTimelineEvent = typeof timelineEvents.$inferInsert;

// ─── Timeline Edges: relationships between legal nodes over time ───
export const timelineEdges = mysqlTable("timeline_edges", {
  id: int("id").autoincrement().primaryKey(),
  sourceNode: varchar("sourceNode", { length: 256 }).notNull(),
  targetNode: varchar("targetNode", { length: 256 }).notNull(),
  relationshipType: mysqlEnum("timelineRelType", ["supersedes", "amends", "overturns", "interprets", "limits", "expands", "narrows", "clarifies", "codifies", "implements"]).notNull(),
  effectiveDate: bigint("effectiveDate", { mode: "number" }).notNull(),
  expirationDate: bigint("expirationDate", { mode: "number" }),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_tedge_source").on(table.sourceNode),
  index("idx_tedge_target").on(table.targetNode),
  index("idx_tedge_type").on(table.relationshipType),
  index("idx_tedge_effective").on(table.effectiveDate),
]);
export type TimelineEdgeRecord = typeof timelineEdges.$inferSelect;
export type InsertTimelineEdge = typeof timelineEdges.$inferInsert;

// ─── Workflow Master: complete procedural workflows ───
export const workflowMaster = mysqlTable("workflow_master", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  domain: varchar("domain", { length: 256 }).notNull(),
  issueTypes: json("issueTypes").$type<string[]>().notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }).notNull(),
  triggerConditions: json("triggerConditions").$type<string[]>(),
  primaryAgency: varchar("primaryAgency", { length: 256 }).notNull(),
  entryForms: json("entryForms").$type<string[]>(),
  initialDeadlineRule: text("initialDeadlineRule"),
  evidenceProfileId: int("evidenceProfileId"),
  appealChain: json("appealChain").$type<Array<{ step: string; agency: string; deadline?: string }>>(),
  weakJointIds: json("weakJointIds").$type<number[]>(),
  estimatedDuration: varchar("estimatedDuration", { length: 256 }),
  successRate: varchar("successRate", { length: 256 }),
  remedies: json("remedies").$type<string[]>(),
  status: mysqlEnum("workflowStatus", ["draft", "active", "deprecated", "archived"]).default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_wm_domain").on(table.domain),
  index("idx_wm_agency").on(table.primaryAgency),
  index("idx_wm_jurisdiction").on(table.jurisdiction),
  index("idx_wm_status").on(table.status),
]);
export type WorkflowMasterRecord = typeof workflowMaster.$inferSelect;
export type InsertWorkflowMaster = typeof workflowMaster.$inferInsert;

// ─── Workflow Steps: ordered steps within a workflow ───
export const workflowSteps = mysqlTable("workflow_steps", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  stepOrder: int("stepOrder").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  stepType: mysqlEnum("stepType", ["eligibility_check", "evidence_collection", "form_completion", "filing", "service", "agency_review", "response_deadline", "mediation", "appeal", "escalation", "records_request", "investigation", "hearing", "decision"]).notNull(),
  description: text("description"),
  requiredInputs: json("requiredInputs").$type<string[]>(),
  decisionLogic: text("decisionLogic"),
  nextStepOnSuccess: int("nextStepOnSuccess"),
  nextStepOnFailure: int("nextStepOnFailure"),
  estimatedDays: int("estimatedDays"),
  deadlineRule: text("deadlineRule"),
  warnings: json("warnings").$type<string[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ws_workflow").on(table.workflowId),
  index("idx_ws_order").on(table.workflowId, table.stepOrder),
  index("idx_ws_type").on(table.stepType),
]);
export type WorkflowStepRecord = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

// ─── Evidence Profiles: required evidence per issue type ───
export const evidenceProfiles = mysqlTable("evidence_profiles", {
  id: int("id").autoincrement().primaryKey(),
  issueType: varchar("issueType", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 256 }),
  requiredMinimum: json("requiredMinimum").$type<string[]>().notNull(),
  recommended: json("recommended").$type<string[]>(),
  highValue: json("highValue").$type<string[]>(),
  commonFailureModes: json("commonFailureModes").$type<string[]>(),
  preservationNotes: text("preservationNotes"),
  spoliationRisks: json("spoliationRisks").$type<string[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ep_issue").on(table.issueType),
]);
export type EvidenceProfileRecord = typeof evidenceProfiles.$inferSelect;
export type InsertEvidenceProfile = typeof evidenceProfiles.$inferInsert;

// ─── Escalation Routes: escalation paths from workflows ───
export const escalationRoutes = mysqlTable("escalation_routes", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  title: varchar("title", { length: 512 }),
  triggerConditions: json("triggerConditions").$type<string[]>().notNull(),
  routes: json("routes").$type<Array<{ target: string; method: string; deadline?: string; notes?: string }>>().notNull(),
  priority: mysqlEnum("escalationPriority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  preservationRequirements: json("preservationRequirements").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_er_workflow").on(table.workflowId),
  index("idx_er_priority").on(table.priority),
]);
export type EscalationRouteRecord = typeof escalationRoutes.$inferSelect;
export type InsertEscalationRoute = typeof escalationRoutes.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM VIABILITY ENGINE — Pipeline Tables (Teams 1-3 Brief)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Deadline Rules: computable deadline logic for workflows ───
export const deadlineRules = mysqlTable("deadline_rules", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
  triggerEvent: varchar("triggerEvent", { length: 256 }).notNull(),
  deadlineType: mysqlEnum("deadlineType", ["filing", "response", "appeal", "discovery", "administrative_exhaustion", "tolling_expiry", "statute_of_limitations"]).notNull(),
  timeLimitDays: int("timeLimitDays"),
  extendedLimitDays: int("extendedLimitDays"),
  extendedCondition: text("extendedCondition"),
  tollingPossible: boolean("tollingPossible").default(false).notNull(),
  tollingConditions: json("tollingConditions").$type<string[]>(),
  warningThresholdDays: int("warningThresholdDays").default(30),
  criticalThresholdDays: int("criticalThresholdDays").default(7),
  authority: varchar("authority", { length: 256 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_dr2_claim_type").on(table.claimType),
  index("idx_dr2_jurisdiction").on(table.jurisdiction),
  index("idx_dr2_workflow").on(table.workflowId),
]);
export type DeadlineRule = typeof deadlineRules.$inferSelect;
export type InsertDeadlineRule = typeof deadlineRules.$inferInsert;

// ─── Weak Joint Triggers: conditions that activate weak joint detection ───
export const weakJointTriggers = mysqlTable("weak_joint_triggers", {
  id: int("id").autoincrement().primaryKey(),
  weakJointId: int("weakJointId").notNull(),
  triggerName: varchar("triggerName", { length: 256 }).notNull(),
  triggerCondition: text("triggerCondition").notNull(),
  severityWeight: decimal("severityWeight", { precision: 3, scale: 2 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_wjt_weak_joint").on(table.weakJointId),
]);
export type WeakJointTrigger = typeof weakJointTriggers.$inferSelect;
export type InsertWeakJointTrigger = typeof weakJointTriggers.$inferInsert;

// ─── Weak Joint Hits: per-case detection of weak joint vulnerabilities ───
export const weakJointHits = mysqlTable("weak_joint_hits", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  weakJointId: int("weakJointId").notNull(),
  triggerId: int("triggerId").notNull(),
  hitStrength: decimal("hitStrength", { precision: 3, scale: 2 }).notNull(),
  supportingFactPatterns: json("supportingFactPatterns").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_wjh_case").on(table.caseId),
  index("idx_wjh_weak_joint").on(table.weakJointId),
]);
export type WeakJointHit = typeof weakJointHits.$inferSelect;
export type InsertWeakJointHit = typeof weakJointHits.$inferInsert;

// ─── Fact Claims: per-case extracted factual assertions ───
export const factClaims = mysqlTable("fact_claims", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  sourceType: varchar("sourceType", { length: 64 }).notNull(),
  sourceReference: varchar("sourceReference", { length: 256 }),
  actor: varchar("actor", { length: 256 }),
  factType: varchar("factType", { length: 128 }).notNull(),
  factValue: text("factValue").notNull(),
  relatedEvent: varchar("relatedEvent", { length: 256 }),
  eventDate: bigint("eventDate", { mode: "number" }),
  confidenceScore: decimal("confidenceScore", { precision: 3, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_fc_case").on(table.caseId),
  index("idx_fc_fact_type").on(table.factType),
]);
export type FactClaim = typeof factClaims.$inferSelect;
export type InsertFactClaim = typeof factClaims.$inferInsert;

// ─── Case Fact Patterns: structured fact patterns extracted from documents ───
export const caseFactPatterns = mysqlTable("case_fact_patterns", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  factText: text("factText").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cfp_case").on(table.caseId),
  index("idx_cfp_category").on(table.pipelineCategory),
]);
export type CaseFactPattern = typeof caseFactPatterns.$inferSelect;
export type InsertCaseFactPattern = typeof caseFactPatterns.$inferInsert;

// ─── Claim Detection Rules: rules matching fact patterns to claim types ───
export const claimDetectionRules = mysqlTable("claim_detection_rules", {
  id: int("id").autoincrement().primaryKey(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  triggerPhrase: text("triggerPhrase").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  weight: decimal("weight", { precision: 3, scale: 2 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cdr_category").on(table.pipelineCategory),
  index("idx_cdr_claim_type").on(table.claimType),
]);
export type ClaimDetectionRule = typeof claimDetectionRules.$inferSelect;
export type InsertClaimDetectionRule = typeof claimDetectionRules.$inferInsert;

// ─── Claim Detection Results: per-case claim detection output ───
export const claimDetectionResults = mysqlTable("claim_detection_results", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  confidenceScore: decimal("confidenceScore", { precision: 3, scale: 2 }).notNull(),
  matchedRules: json("matchedRules").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cdres_case").on(table.caseId),
  index("idx_cdres_claim_type").on(table.claimType),
]);
export type ClaimDetectionResult = typeof claimDetectionResults.$inferSelect;
export type InsertClaimDetectionResult = typeof claimDetectionResults.$inferInsert;

// ─── Evidence Records: per-case evidence tracking with reliability scoring ───
export const evidenceRecords = mysqlTable("evidence_records", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  evidenceType: varchar("evidenceType", { length: 128 }).notNull(),
  source: varchar("source", { length: 256 }),
  dateCreated: bigint("dateCreated", { mode: "number" }),
  relatedClaim: varchar("relatedClaim", { length: 128 }),
  relatedElement: varchar("relatedElement", { length: 256 }),
  reliabilityClass: mysqlEnum("reliabilityClass", ["primary", "secondary", "tertiary", "hearsay", "circumstantial"]).default("secondary"),
  confidenceScore: decimal("confidenceScore", { precision: 3, scale: 2 }),
  documentReference: varchar("documentReference", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_evrec_case").on(table.caseId),
  index("idx_evrec_type").on(table.evidenceType),
  index("idx_evrec_claim").on(table.relatedClaim),
]);
export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRecords.$inferInsert;

// ─── Element Strength: per-case evaluation of claim elements ───
export const elementStrength = mysqlTable("element_strength", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  supportingEvidence: json("supportingEvidence").$type<number[]>(),
  strengthScore: decimal("strengthScore", { precision: 3, scale: 2 }).notNull(),
  confidenceLevel: mysqlEnum("confidenceLevel", ["high", "medium", "low", "insufficient"]).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_es_case").on(table.caseId),
  index("idx_es_claim_type").on(table.claimType),
]);
export type ElementStrengthRecord = typeof elementStrength.$inferSelect;
export type InsertElementStrength = typeof elementStrength.$inferInsert;

// ─── Contradiction Scores: per-case contradiction detection results ───
export const contradictionScores = mysqlTable("contradiction_scores", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  contradictionType: varchar("contradictionType", { length: 128 }).notNull(),
  severityScore: decimal("severityScore", { precision: 3, scale: 2 }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
  factClaimA: int("factClaimA"),
  factClaimB: int("factClaimB"),
  evidenceReferences: json("evidenceReferences").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cs_case").on(table.caseId),
  index("idx_cs_type").on(table.contradictionType),
]);
export type ContradictionScoreRecord = typeof contradictionScores.$inferSelect;
export type InsertContradictionScore = typeof contradictionScores.$inferInsert;

// ─── Claim Viability: per-case viability assessment output ───
export const claimViability = mysqlTable("claim_viability", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  elementsSatisfied: json("elementsSatisfied").$type<string[]>(),
  elementsMissing: json("elementsMissing").$type<string[]>(),
  confidenceScore: decimal("confidenceScore", { precision: 3, scale: 2 }).notNull(),
  solStatus: mysqlEnum("solStatus", ["valid", "warning", "expired", "unknown"]).default("unknown").notNull(),
  solDaysRemaining: int("solDaysRemaining"),
  evidenceSufficiency: mysqlEnum("evidenceSufficiency", ["strong", "moderate", "weak", "insufficient"]).default("insufficient").notNull(),
  recommendedEvidence: json("recommendedEvidence").$type<string[]>(),
  recommendedAction: text("recommendedAction"),
  agencyRouting: varchar("agencyRouting", { length: 256 }),
  contradictionCount: int("contradictionCount").default(0),
  weakJointCount: int("weakJointCount").default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cv_case").on(table.caseId),
  index("idx_cv_claim_type").on(table.claimType),
  index("idx_cv_sol_status").on(table.solStatus),
]);
export type ClaimViabilityRecord = typeof claimViability.$inferSelect;
export type InsertClaimViability = typeof claimViability.$inferInsert;

// ============================================================
// STRATEGY ENGINE (10 tables)
// Consumes viability pipeline output, computes optimal legal strategies
// ============================================================

export const strategyMatterProfile = mysqlTable("strategy_matter_profile", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  domain: varchar("domain", { length: 128 }),
  incidentDate: varchar("incidentDate", { length: 64 }),
  filingDeadline: varchar("filingDeadline", { length: 64 }),
  opposingParties: json("opposingParties"),
  keyFacts: json("keyFacts"),
  riskFactors: json("riskFactors"),
  statusSummary: text("statusSummary"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_smp_case").on(table.caseId),
]);
export type StrategyMatterProfile = typeof strategyMatterProfile.$inferSelect;
export type InsertStrategyMatterProfile = typeof strategyMatterProfile.$inferInsert;

export const strategyFactMatrix = mysqlTable("strategy_fact_matrix", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  matterProfileId: int("matterProfileId").notNull(),
  factClaimId: int("factClaimId"),
  factText: text("factText").notNull(),
  factType: varchar("factType", { length: 64 }),
  actor: varchar("actor", { length: 256 }),
  dateOccurred: varchar("dateOccurred", { length: 64 }),
  sourceQuoteId: int("sourceQuoteId"),
  sourceDocumentId: int("sourceDocumentId"),
  relevanceScore: decimal("relevanceScore", { precision: 5, scale: 2 }),
  disputeStatus: mysqlEnum("disputeStatus", ["undisputed", "disputed", "unknown"]).default("unknown"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sfm_case").on(table.caseId),
  index("idx_sfm_profile").on(table.matterProfileId),
]);
export type StrategyFactMatrix = typeof strategyFactMatrix.$inferSelect;
export type InsertStrategyFactMatrix = typeof strategyFactMatrix.$inferInsert;

export const strategyClaimCatalog = mysqlTable("strategy_claim_catalog", {
  id: int("id").primaryKey().autoincrement(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  statuteCitation: varchar("statuteCitation", { length: 256 }),
  elementsRequired: json("elementsRequired"),
  standardOfProof: varchar("standardOfProof", { length: 128 }),
  typicalForum: varchar("typicalForum", { length: 128 }),
  solYears: int("solYears"),
  damagesAvailable: json("damagesAvailable"),
  defenses: json("defenses"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_scc_type").on(table.claimType),
  index("idx_scc_jurisdiction").on(table.jurisdiction),
]);
export type StrategyClaimCatalog = typeof strategyClaimCatalog.$inferSelect;
export type InsertStrategyClaimCatalog = typeof strategyClaimCatalog.$inferInsert;

export const strategyClaimCandidates = mysqlTable("strategy_claim_candidates", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  matterProfileId: int("matterProfileId").notNull(),
  catalogId: int("catalogId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  viabilityScore: decimal("viabilityScore", { precision: 5, scale: 2 }),
  elementsSatisfied: json("elementsSatisfied"),
  elementsMissing: json("elementsMissing"),
  supportingFactIds: json("supportingFactIds"),
  solStatus: mysqlEnum("candidateSolStatus", ["within", "expiring_soon", "expired", "tolled", "unknown"]).default("unknown"),
  solDaysRemaining: int("solDaysRemaining"),
  recommendation: mysqlEnum("recommendation", ["pursue", "investigate_further", "weak", "barred"]).default("investigate_further"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_scand_case").on(table.caseId),
  index("idx_scand_profile").on(table.matterProfileId),
  index("idx_scand_type").on(table.claimType),
]);
export type StrategyClaimCandidate = typeof strategyClaimCandidates.$inferSelect;
export type InsertStrategyClaimCandidate = typeof strategyClaimCandidates.$inferInsert;

export const strategyViabilityAssessment = mysqlTable("strategy_viability_assessment", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  matterProfileId: int("matterProfileId").notNull(),
  candidateId: int("candidateId").notNull(),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }),
  elementScore: decimal("elementScore", { precision: 5, scale: 2 }),
  evidenceScore: decimal("evidenceScore", { precision: 5, scale: 2 }),
  contradictionPenalty: decimal("contradictionPenalty", { precision: 5, scale: 2 }),
  weakJointPenalty: decimal("weakJointPenalty", { precision: 5, scale: 2 }),
  solScore: decimal("solScore", { precision: 5, scale: 2 }),
  patternBonus: decimal("patternBonus", { precision: 5, scale: 2 }),
  assessmentDetails: json("assessmentDetails"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sva_case").on(table.caseId),
  index("idx_sva_candidate").on(table.candidateId),
]);
export type StrategyViabilityAssessment = typeof strategyViabilityAssessment.$inferSelect;
export type InsertStrategyViabilityAssessment = typeof strategyViabilityAssessment.$inferInsert;

export const strategyDeadlineEngine = mysqlTable("strategy_deadline_engine", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  matterProfileId: int("matterProfileId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  deadlineType: varchar("deadlineType", { length: 128 }),
  triggerEvent: varchar("triggerEvent", { length: 256 }),
  triggerDate: varchar("triggerDate", { length: 64 }),
  deadlineDate: varchar("deadlineDate", { length: 64 }),
  daysRemaining: int("daysRemaining"),
  tollingApplied: boolean("tollingApplied").default(false),
  tollingReason: text("tollingReason"),
  deadlineStatus: mysqlEnum("deadlineStatus", ["active", "expired", "tolled", "waived"]).default("active"),
  sourceRuleId: int("sourceRuleId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sde_case").on(table.caseId),
  index("idx_sde_claim").on(table.claimType),
  index("idx_sde_status").on(table.deadlineStatus),
]);
export type StrategyDeadlineEngine = typeof strategyDeadlineEngine.$inferSelect;
export type InsertStrategyDeadlineEngine = typeof strategyDeadlineEngine.$inferInsert;

export const strategyPaths = mysqlTable("strategy_paths", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  matterProfileId: int("matterProfileId").notNull(),
  pathLabel: varchar("pathLabel", { length: 256 }).notNull(),
  claimCandidateIds: json("claimCandidateIds"),
  recommendedForum: varchar("recommendedForum", { length: 256 }),
  forumRuleId: int("forumRuleId"),
  estimatedStrength: decimal("estimatedStrength", { precision: 5, scale: 2 }),
  estimatedTimeline: varchar("estimatedTimeline", { length: 128 }),
  riskFactors: json("riskFactors"),
  advantages: json("advantages"),
  disadvantages: json("disadvantages"),
  patternEntityClusterId: int("patternEntityClusterId"),
  patternOutcomeAnalyticsId: int("patternOutcomeAnalyticsId"),
  patternConductClusterId: int("patternConductClusterId"),
  patternConfidence: decimal("patternConfidence", { precision: 5, scale: 2 }),
  patternNotes: text("patternNotes"),
  priorityRank: int("priorityRank"),
  pathStatus: mysqlEnum("pathStatus", ["draft", "recommended", "selected", "rejected"]).default("draft"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sp_case").on(table.caseId),
  index("idx_sp_profile").on(table.matterProfileId),
  index("idx_sp_status").on(table.pathStatus),
]);
export type StrategyPath = typeof strategyPaths.$inferSelect;
export type InsertStrategyPath = typeof strategyPaths.$inferInsert;

export const strategyForumRules = mysqlTable("strategy_forum_rules", {
  id: int("id").primaryKey().autoincrement(),
  forumName: varchar("forumName", { length: 256 }).notNull(),
  forumType: mysqlEnum("forumType", ["federal_court", "state_court", "administrative_agency", "tribal_court", "arbitration", "mediation"]),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  claimTypesAccepted: json("claimTypesAccepted"),
  filingRequirements: json("filingRequirements"),
  typicalTimeline: varchar("typicalTimeline", { length: 128 }),
  costEstimate: varchar("costEstimate", { length: 128 }),
  advantageFactors: json("advantageFactors"),
  disadvantageFactors: json("disadvantageFactors"),
  exhaustionRequired: boolean("exhaustionRequired").default(false),
  exhaustionAgency: varchar("exhaustionAgency", { length: 128 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sfr_type").on(table.forumType),
  index("idx_sfr_jurisdiction").on(table.jurisdiction),
]);
export type StrategyForumRule = typeof strategyForumRules.$inferSelect;
export type InsertStrategyForumRule = typeof strategyForumRules.$inferInsert;

export const strategyElementFactLinks = mysqlTable("strategy_element_fact_links", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  candidateId: int("candidateId").notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  factMatrixId: int("factMatrixId"),
  quoteId: int("quoteId"),
  linkStrength: mysqlEnum("linkStrength", ["strong", "moderate", "weak", "absent"]).default("absent"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sefl_case").on(table.caseId),
  index("idx_sefl_candidate").on(table.candidateId),
]);
export type StrategyElementFactLink = typeof strategyElementFactLinks.$inferSelect;
export type InsertStrategyElementFactLink = typeof strategyElementFactLinks.$inferInsert;

export const strategyMissingEvidenceTasks = mysqlTable("strategy_missing_evidence_tasks", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  candidateId: int("candidateId").notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  currentStrength: mysqlEnum("currentStrength", ["strong", "moderate", "weak", "absent"]).default("absent"),
  suggestedEvidenceType: varchar("suggestedEvidenceType", { length: 256 }),
  suggestedSource: varchar("suggestedSource", { length: 256 }),
  taskPriority: mysqlEnum("taskPriority", ["critical", "high", "medium", "low"]).default("medium"),
  taskStatus: mysqlEnum("taskStatus", ["open", "in_progress", "obtained", "unavailable"]).default("open"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_smet_case").on(table.caseId),
  index("idx_smet_candidate").on(table.candidateId),
  index("idx_smet_priority").on(table.taskPriority),
  index("idx_smet_status").on(table.taskStatus),
]);
export type StrategyMissingEvidenceTask = typeof strategyMissingEvidenceTasks.$inferSelect;
export type InsertStrategyMissingEvidenceTask = typeof strategyMissingEvidenceTasks.$inferInsert;

// ============================================================
// CASE ASSEMBLY GENERATOR (13 tables)
// Generates actual legal documents from strategy engine output
// ============================================================

export const assemblyDocumentTemplates = mysqlTable("assembly_document_templates", {
  id: int("id").primaryKey().autoincrement(),
  templateName: varchar("templateName", { length: 256 }).notNull(),
  documentType: varchar("documentType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  forumType: varchar("forumType", { length: 128 }),
  claimTypes: json("claimTypes"),
  templateStructure: json("templateStructure"),
  requiredSections: json("requiredSections"),
  optionalSections: json("optionalSections"),
  formattingRules: json("formattingRules"),
  legalCitations: json("legalCitations"),
  version: varchar("version", { length: 32 }).default("1.0"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_adt_type").on(table.documentType),
  index("idx_adt_jurisdiction").on(table.jurisdiction),
]);
export type AssemblyDocumentTemplate = typeof assemblyDocumentTemplates.$inferSelect;
export type InsertAssemblyDocumentTemplate = typeof assemblyDocumentTemplates.$inferInsert;

export const assemblySectionLibrary = mysqlTable("assembly_section_library", {
  id: int("id").primaryKey().autoincrement(),
  sectionName: varchar("sectionName", { length: 256 }).notNull(),
  sectionType: varchar("sectionType", { length: 128 }).notNull(),
  templateId: int("templateId"),
  orderIndex: int("orderIndex").default(0),
  contentTemplate: text("contentTemplate"),
  placeholders: json("placeholders"),
  conditionalRules: json("conditionalRules"),
  legalStandards: json("legalStandards"),
  exampleContent: text("exampleContent"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_asl_type").on(table.sectionType),
  index("idx_asl_template").on(table.templateId),
]);
export type AssemblySectionLibrary = typeof assemblySectionLibrary.$inferSelect;
export type InsertAssemblySectionLibrary = typeof assemblySectionLibrary.$inferInsert;

export const assemblyExhibitIndex = mysqlTable("assembly_exhibit_index", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  exhibitLabel: varchar("exhibitLabel", { length: 64 }).notNull(),
  exhibitTitle: varchar("exhibitTitle", { length: 512 }).notNull(),
  documentId: int("documentId"),
  quoteIds: json("quoteIds"),
  description: text("description"),
  relevantClaims: json("relevantClaims"),
  relevantElements: json("relevantElements"),
  orderIndex: int("orderIndex").default(0),
  exhibitStatus: mysqlEnum("exhibitStatus", ["draft", "included", "excluded", "pending_review"]).default("draft"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aei_case").on(table.caseId),
  index("idx_aei_packet").on(table.packetId),
  index("idx_aei_status").on(table.exhibitStatus),
]);
export type AssemblyExhibitIndex = typeof assemblyExhibitIndex.$inferSelect;
export type InsertAssemblyExhibitIndex = typeof assemblyExhibitIndex.$inferInsert;

export const assemblyFilingPackets = mysqlTable("assembly_filing_packets", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  strategyPathId: int("strategyPathId"),
  packetName: varchar("packetName", { length: 256 }).notNull(),
  packetType: varchar("packetType", { length: 128 }).notNull(),
  forum: varchar("forum", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  claimTypes: json("claimTypes"),
  generatedDocumentIds: json("generatedDocumentIds"),
  exhibitIds: json("exhibitIds"),
  filingDeadline: varchar("filingDeadline", { length: 64 }),
  packetStatus: mysqlEnum("packetStatus", ["draft", "in_progress", "review", "finalized", "filed"]).default("draft"),
  reviewNotes: text("reviewNotes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_afp_case").on(table.caseId),
  index("idx_afp_strategy").on(table.strategyPathId),
  index("idx_afp_status").on(table.packetStatus),
]);
export type AssemblyFilingPacket = typeof assemblyFilingPackets.$inferSelect;
export type InsertAssemblyFilingPacket = typeof assemblyFilingPackets.$inferInsert;

export const assemblyGeneratedSections = mysqlTable("assembly_generated_sections", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId").notNull(),
  sectionLibraryId: int("sectionLibraryId"),
  sectionName: varchar("sectionName", { length: 256 }).notNull(),
  orderIndex: int("orderIndex").default(0),
  generatedContent: text("generatedContent"),
  placeholderValues: json("placeholderValues"),
  citationsUsed: json("citationsUsed"),
  factsReferenced: json("factsReferenced"),
  exhibitsReferenced: json("exhibitsReferenced"),
  sectionStatus: mysqlEnum("sectionStatus", ["generated", "reviewed", "approved", "needs_revision"]).default("generated"),
  revisionNotes: text("revisionNotes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ags_case").on(table.caseId),
  index("idx_ags_packet").on(table.packetId),
  index("idx_ags_status").on(table.sectionStatus),
]);
export type AssemblyGeneratedSection = typeof assemblyGeneratedSections.$inferSelect;
export type InsertAssemblyGeneratedSection = typeof assemblyGeneratedSections.$inferInsert;

export const assemblyCitationIndex = mysqlTable("assembly_citation_index", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  citationType: varchar("citationType", { length: 64 }).notNull(),
  citationText: text("citationText").notNull(),
  bluebookFormat: text("bluebookFormat"),
  sourceStatuteId: int("sourceStatuteId"),
  sourceCaseLawId: int("sourceCaseLawId"),
  sourceDoctrineId: int("sourceDoctrineId"),
  relevantClaims: json("relevantClaims"),
  sectionIds: json("sectionIds"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aci_case").on(table.caseId),
  index("idx_aci_packet").on(table.packetId),
  index("idx_aci_type").on(table.citationType),
]);
export type AssemblyCitationIndex = typeof assemblyCitationIndex.$inferSelect;
export type InsertAssemblyCitationIndex = typeof assemblyCitationIndex.$inferInsert;

export const assemblyFactNarrativeBlocks = mysqlTable("assembly_fact_narrative_blocks", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  blockType: varchar("blockType", { length: 64 }).notNull(),
  orderIndex: int("orderIndex").default(0),
  narrativeText: text("narrativeText"),
  factMatrixIds: json("factMatrixIds"),
  quoteIds: json("quoteIds"),
  exhibitRefs: json("exhibitRefs"),
  timelinePosition: varchar("timelinePosition", { length: 64 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_afnb_case").on(table.caseId),
  index("idx_afnb_packet").on(table.packetId),
]);
export type AssemblyFactNarrativeBlock = typeof assemblyFactNarrativeBlocks.$inferSelect;
export type InsertAssemblyFactNarrativeBlock = typeof assemblyFactNarrativeBlocks.$inferInsert;

export const assemblyLegalArgumentBlocks = mysqlTable("assembly_legal_argument_blocks", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  argumentHeading: varchar("argumentHeading", { length: 512 }),
  orderIndex: int("orderIndex").default(0),
  argumentText: text("argumentText"),
  supportingCitations: json("supportingCitations"),
  supportingFacts: json("supportingFacts"),
  elementsCovered: json("elementsCovered"),
  counterarguments: json("counterarguments"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_alab_case").on(table.caseId),
  index("idx_alab_packet").on(table.packetId),
  index("idx_alab_claim").on(table.claimType),
]);
export type AssemblyLegalArgumentBlock = typeof assemblyLegalArgumentBlocks.$inferSelect;
export type InsertAssemblyLegalArgumentBlock = typeof assemblyLegalArgumentBlocks.$inferInsert;

export const assemblyReliefRequests = mysqlTable("assembly_relief_requests", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  reliefType: varchar("reliefType", { length: 128 }).notNull(),
  reliefDescription: text("reliefDescription"),
  legalBasis: text("legalBasis"),
  estimatedValue: varchar("estimatedValue", { length: 128 }),
  claimTypes: json("claimTypes"),
  orderIndex: int("orderIndex").default(0),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_arr_case").on(table.caseId),
  index("idx_arr_packet").on(table.packetId),
]);
export type AssemblyReliefRequest = typeof assemblyReliefRequests.$inferSelect;
export type InsertAssemblyReliefRequest = typeof assemblyReliefRequests.$inferInsert;

export const assemblyPartyDesignations = mysqlTable("assembly_party_designations", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  partyRole: varchar("partyRole", { length: 128 }).notNull(),
  partyName: varchar("partyName", { length: 512 }).notNull(),
  entityId: int("entityId"),
  partyType: varchar("partyType", { length: 64 }),
  address: text("address"),
  counsel: varchar("counsel", { length: 256 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_apd_case").on(table.caseId),
  index("idx_apd_packet").on(table.packetId),
]);
export type AssemblyPartyDesignation = typeof assemblyPartyDesignations.$inferSelect;
export type InsertAssemblyPartyDesignation = typeof assemblyPartyDesignations.$inferInsert;

export const assemblyComplianceChecklist = mysqlTable("assembly_compliance_checklist", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId"),
  checkItem: varchar("checkItem", { length: 512 }).notNull(),
  category: varchar("category", { length: 128 }),
  checkStatus: mysqlEnum("checkStatus", ["pending", "passed", "failed", "waived"]).default("pending"),
  details: text("details"),
  ruleReference: varchar("ruleReference", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_acc_case").on(table.caseId),
  index("idx_acc_packet").on(table.packetId),
  index("idx_acc_status").on(table.checkStatus),
]);
export type AssemblyComplianceChecklist = typeof assemblyComplianceChecklist.$inferSelect;
export type InsertAssemblyComplianceChecklist = typeof assemblyComplianceChecklist.$inferInsert;

export const assemblyVersionHistory = mysqlTable("assembly_version_history", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  changeType: varchar("changeType", { length: 64 }),
  changeSummary: text("changeSummary"),
  changedBy: varchar("changedBy", { length: 256 }),
  previousContent: json("previousContent"),
  newContent: json("newContent"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_avh_case").on(table.caseId),
  index("idx_avh_packet").on(table.packetId),
]);
export type AssemblyVersionHistory = typeof assemblyVersionHistory.$inferSelect;
export type InsertAssemblyVersionHistory = typeof assemblyVersionHistory.$inferInsert;

export const assemblyOutputRegistry = mysqlTable("assembly_output_registry", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("caseId").notNull(),
  packetId: int("packetId").notNull(),
  outputFormat: varchar("outputFormat", { length: 64 }).notNull(),
  outputUrl: text("outputUrl"),
  outputKey: varchar("outputKey", { length: 512 }),
  fileSize: int("fileSize"),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  sha256Hash: varchar("sha256Hash", { length: 64 }),
  outputStatus: mysqlEnum("outputStatus", ["generating", "ready", "error"]).default("generating"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aor_case").on(table.caseId),
  index("idx_aor_packet").on(table.packetId),
  index("idx_aor_status").on(table.outputStatus),
]);
export type AssemblyOutputRegistry = typeof assemblyOutputRegistry.$inferSelect;
export type InsertAssemblyOutputRegistry = typeof assemblyOutputRegistry.$inferInsert;

// ============================================================
// PATTERN AGGREGATION ENGINE (13 tables)
// Cross-case pattern detection for systemic violations
// Feeds back into Strategy Engine via strategy_paths.pattern* fields
// ============================================================

export const patternEntityClusters = mysqlTable("pattern_entity_clusters", {
  id: int("id").primaryKey().autoincrement(),
  entityName: varchar("entityName", { length: 512 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  aliases: json("aliases"),
  caseIds: json("caseIds"),
  caseCount: int("caseCount").default(0),
  firstSeen: bigint("firstSeen", { mode: "number" }),
  lastSeen: bigint("lastSeen", { mode: "number" }),
  jurisdictions: json("jurisdictions"),
  claimTypes: json("claimTypes"),
  riskScore: decimal("riskScore", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pec_name").on(table.entityName),
  index("idx_pec_type").on(table.entityType),
]);
export type PatternEntityCluster = typeof patternEntityClusters.$inferSelect;
export type InsertPatternEntityCluster = typeof patternEntityClusters.$inferInsert;

export const patternConductClusters = mysqlTable("pattern_conduct_clusters", {
  id: int("id").primaryKey().autoincrement(),
  conductType: varchar("conductType", { length: 256 }).notNull(),
  conductCategory: varchar("conductCategory", { length: 128 }),
  description: text("description"),
  caseIds: json("caseIds"),
  caseCount: int("caseCount").default(0),
  entityClusterIds: json("entityClusterIds"),
  commonElements: json("commonElements"),
  frequencyScore: decimal("frequencyScore", { precision: 5, scale: 2 }),
  severityScore: decimal("severityScore", { precision: 5, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pcc_type").on(table.conductType),
  index("idx_pcc_category").on(table.conductCategory),
]);
export type PatternConductCluster = typeof patternConductClusters.$inferSelect;
export type InsertPatternConductCluster = typeof patternConductClusters.$inferInsert;

export const patternOutcomeAnalytics = mysqlTable("pattern_outcome_analytics", {
  id: int("id").primaryKey().autoincrement(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  forum: varchar("forum", { length: 256 }),
  totalCases: int("totalCases").default(0),
  winRate: decimal("winRate", { precision: 5, scale: 2 }),
  settlementRate: decimal("settlementRate", { precision: 5, scale: 2 }),
  avgSettlementAmount: decimal("avgSettlementAmount", { precision: 12, scale: 2 }),
  avgTimeToResolution: varchar("avgTimeToResolution", { length: 64 }),
  medianDamagesAwarded: decimal("medianDamagesAwarded", { precision: 12, scale: 2 }),
  keyFactors: json("keyFactors"),
  timeRange: varchar("timeRange", { length: 64 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_poa_claim").on(table.claimType),
  index("idx_poa_jurisdiction").on(table.jurisdiction),
]);
export type PatternOutcomeAnalytic = typeof patternOutcomeAnalytics.$inferSelect;
export type InsertPatternOutcomeAnalytic = typeof patternOutcomeAnalytics.$inferInsert;

export const patternOutcomeDivergence = mysqlTable("pattern_outcome_divergence", {
  id: int("id").primaryKey().autoincrement(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdictionA: varchar("jurisdictionA", { length: 128 }).notNull(),
  jurisdictionB: varchar("jurisdictionB", { length: 128 }).notNull(),
  metricName: varchar("metricName", { length: 128 }).notNull(),
  valueA: decimal("valueA", { precision: 10, scale: 2 }),
  valueB: decimal("valueB", { precision: 10, scale: 2 }),
  divergenceScore: decimal("divergenceScore", { precision: 5, scale: 2 }),
  explanation: text("explanation"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pod_claim").on(table.claimType),
  index("idx_pod_jA").on(table.jurisdictionA),
  index("idx_pod_jB").on(table.jurisdictionB),
]);
export type PatternOutcomeDivergence = typeof patternOutcomeDivergence.$inferSelect;
export type InsertPatternOutcomeDivergence = typeof patternOutcomeDivergence.$inferInsert;

export const patternSystemicInferences = mysqlTable("pattern_systemic_inferences", {
  id: int("id").primaryKey().autoincrement(),
  inferenceType: varchar("inferenceType", { length: 128 }).notNull(),
  description: text("description").notNull(),
  entityClusterIds: json("entityClusterIds"),
  conductClusterIds: json("conductClusterIds"),
  supportingCaseIds: json("supportingCaseIds"),
  evidenceStrength: mysqlEnum("evidenceStrength", ["strong", "moderate", "preliminary"]).default("preliminary"),
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }),
  legalImplications: text("legalImplications"),
  recommendedActions: json("recommendedActions"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_psi_type").on(table.inferenceType),
  index("idx_psi_strength").on(table.evidenceStrength),
]);
export type PatternSystemicInference = typeof patternSystemicInferences.$inferSelect;
export type InsertPatternSystemicInference = typeof patternSystemicInferences.$inferInsert;

export const patternTemporalTrends = mysqlTable("pattern_temporal_trends", {
  id: int("id").primaryKey().autoincrement(),
  trendType: varchar("trendType", { length: 128 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  periodStart: varchar("periodStart", { length: 32 }),
  periodEnd: varchar("periodEnd", { length: 32 }),
  metricName: varchar("metricName", { length: 128 }).notNull(),
  metricValue: decimal("metricValue", { precision: 10, scale: 2 }),
  previousValue: decimal("previousValue", { precision: 10, scale: 2 }),
  changePercent: decimal("changePercent", { precision: 7, scale: 2 }),
  trendDirection: mysqlEnum("trendDirection", ["increasing", "decreasing", "stable"]).default("stable"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ptt_type").on(table.trendType),
  index("idx_ptt_claim").on(table.claimType),
]);
export type PatternTemporalTrend = typeof patternTemporalTrends.$inferSelect;
export type InsertPatternTemporalTrend = typeof patternTemporalTrends.$inferInsert;

export const patternGeographicHotspots = mysqlTable("pattern_geographic_hotspots", {
  id: int("id").primaryKey().autoincrement(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  region: varchar("region", { length: 128 }),
  claimType: varchar("claimType", { length: 128 }),
  caseCount: int("caseCount").default(0),
  densityScore: decimal("densityScore", { precision: 5, scale: 2 }),
  topEntities: json("topEntities"),
  topConductTypes: json("topConductTypes"),
  periodCovered: varchar("periodCovered", { length: 64 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pgh_jurisdiction").on(table.jurisdiction),
  index("idx_pgh_claim").on(table.claimType),
]);
export type PatternGeographicHotspot = typeof patternGeographicHotspots.$inferSelect;
export type InsertPatternGeographicHotspot = typeof patternGeographicHotspots.$inferInsert;

export const patternIndustryProfiles = mysqlTable("pattern_industry_profiles", {
  id: int("id").primaryKey().autoincrement(),
  industryName: varchar("industryName", { length: 256 }).notNull(),
  naicsCode: varchar("naicsCode", { length: 16 }),
  commonClaimTypes: json("commonClaimTypes"),
  commonViolations: json("commonViolations"),
  avgCaseCount: int("avgCaseCount").default(0),
  riskLevel: mysqlEnum("riskLevel", ["high", "medium", "low"]).default("medium"),
  regulatoryFocus: json("regulatoryFocus"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pip_name").on(table.industryName),
  index("idx_pip_risk").on(table.riskLevel),
]);
export type PatternIndustryProfile = typeof patternIndustryProfiles.$inferSelect;
export type InsertPatternIndustryProfile = typeof patternIndustryProfiles.$inferInsert;

export const patternEvidenceCorrelations = mysqlTable("pattern_evidence_correlations", {
  id: int("id").primaryKey().autoincrement(),
  evidenceType: varchar("evidenceType", { length: 128 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  correlationStrength: decimal("correlationStrength", { precision: 5, scale: 2 }),
  outcomeImpact: mysqlEnum("outcomeImpact", ["strongly_positive", "positive", "neutral", "negative", "strongly_negative"]).default("neutral"),
  sampleSize: int("sampleSize").default(0),
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pecorr_evidence").on(table.evidenceType),
  index("idx_pecorr_claim").on(table.claimType),
]);
export type PatternEvidenceCorrelation = typeof patternEvidenceCorrelations.$inferSelect;
export type InsertPatternEvidenceCorrelation = typeof patternEvidenceCorrelations.$inferInsert;

export const patternDefenseStrategies = mysqlTable("pattern_defense_strategies", {
  id: int("id").primaryKey().autoincrement(),
  defenseName: varchar("defenseName", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  frequencyObserved: int("frequencyObserved").default(0),
  successRate: decimal("successRate", { precision: 5, scale: 2 }),
  counterStrategies: json("counterStrategies"),
  vulnerabilities: json("vulnerabilities"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pds_name").on(table.defenseName),
  index("idx_pds_claim").on(table.claimType),
]);
export type PatternDefenseStrategy = typeof patternDefenseStrategies.$inferSelect;
export type InsertPatternDefenseStrategy = typeof patternDefenseStrategies.$inferInsert;

export const patternCaseLinks = mysqlTable("pattern_case_links", {
  id: int("id").primaryKey().autoincrement(),
  caseIdA: int("caseIdA").notNull(),
  caseIdB: int("caseIdB").notNull(),
  linkType: varchar("linkType", { length: 128 }).notNull(),
  sharedEntityClusterIds: json("sharedEntityClusterIds"),
  sharedConductClusterIds: json("sharedConductClusterIds"),
  similarityScore: decimal("similarityScore", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pcl_caseA").on(table.caseIdA),
  index("idx_pcl_caseB").on(table.caseIdB),
  index("idx_pcl_type").on(table.linkType),
]);
export type PatternCaseLink = typeof patternCaseLinks.$inferSelect;
export type InsertPatternCaseLink = typeof patternCaseLinks.$inferInsert;

export const patternAggregationRuns = mysqlTable("pattern_aggregation_runs", {
  id: int("id").primaryKey().autoincrement(),
  runType: varchar("runType", { length: 64 }).notNull(),
  caseIdsAnalyzed: json("caseIdsAnalyzed"),
  totalCasesProcessed: int("totalCasesProcessed").default(0),
  entityClustersFound: int("entityClustersFound").default(0),
  conductClustersFound: int("conductClustersFound").default(0),
  systemicInferencesGenerated: int("systemicInferencesGenerated").default(0),
  runStatus: mysqlEnum("runStatus", ["running", "completed", "failed"]).default("running"),
  errorMessage: text("errorMessage"),
  startedAt: bigint("startedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_par_type").on(table.runType),
  index("idx_par_status").on(table.runStatus),
]);
export type PatternAggregationRun = typeof patternAggregationRuns.$inferSelect;
export type InsertPatternAggregationRun = typeof patternAggregationRuns.$inferInsert;

export const patternFeedbackLoop = mysqlTable("pattern_feedback_loop", {
  id: int("id").primaryKey().autoincrement(),
  strategyPathId: int("strategyPathId").notNull(),
  entityClusterId: int("entityClusterId"),
  conductClusterId: int("conductClusterId"),
  outcomeAnalyticsId: int("outcomeAnalyticsId"),
  systemicInferenceId: int("systemicInferenceId"),
  feedbackType: varchar("feedbackType", { length: 64 }).notNull(),
  adjustmentApplied: text("adjustmentApplied"),
  confidenceDelta: decimal("confidenceDelta", { precision: 5, scale: 2 }),
  appliedAt: bigint("appliedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pfl_strategy").on(table.strategyPathId),
  index("idx_pfl_entity").on(table.entityClusterId),
  index("idx_pfl_type").on(table.feedbackType),
]);
export type PatternFeedbackLoop = typeof patternFeedbackLoop.$inferSelect;
export type InsertPatternFeedbackLoop = typeof patternFeedbackLoop.$inferInsert;

// ============================================================
// ENGINE RUNS ORCHESTRATION (1 table)
// Tracks end-to-end pipeline execution across all engines
// ============================================================

export const engineRuns = mysqlTable("engine_runs", {
  id: int("id").primaryKey().autoincrement(),
  runId: varchar("run_id", { length: 128 }),
  caseId: int("caseId").notNull(),
  engineId: varchar("engine_id", { length: 128 }),
  userId: int("userId"),
  runType: mysqlEnum("engineRunType", ["full_pipeline", "viability_only", "strategy_only", "assembly_only", "pattern_only"]).default("full_pipeline"),
  runStatus: mysqlEnum("engineRunStatus", ["pending", "running", "success", "failed", "unknown", "superseded"]).default("pending"),
  status: varchar("status", { length: 32 }).default("pending"),
  currentStage: varchar("currentStage", { length: 64 }),
  stageResults: json("stageResults"),
  outputRefs: json("output_refs"),
  snapshotId: int("snapshot_id"),
  viabilityRunId: int("viabilityRunId"),
  strategyMatterProfileId: int("strategyMatterProfileId"),
  assemblyPacketId: int("assemblyPacketId"),
  patternAggregationRunId: int("patternAggregationRunId"),
  errorMessage: text("errorMessage"),
  startedAt: bigint("startedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_er_case").on(table.caseId),
  index("idx_er_status").on(table.runStatus),
  index("idx_er_type").on(table.runType),
]);
export type EngineRun = typeof engineRuns.$inferSelect;
export type InsertEngineRun = typeof engineRuns.$inferInsert;

// ─── Legislator Contacts: elected officials and their contact info ───
export const legislatorContacts = mysqlTable("legislator_contacts", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("full_name", { length: 256 }).notNull(),
  title: varchar("title", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  chamber: mysqlEnum("chamber", ["federal_senate", "federal_house", "state_senate", "state_house", "state_assembly", "city_council", "county_commission", "other"]).notNull(),
  party: varchar("party", { length: 64 }),
  district: varchar("district", { length: 128 }),
  state: varchar("state", { length: 64 }),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 64 }),
  officeAddress: text("office_address"),
  website: varchar("website", { length: 512 }),
  committees: json("committees").$type<string[]>(),
  domains: json("domains").$type<string[]>(),
  termStart: bigint("term_start", { mode: "number" }),
  termEnd: bigint("term_end", { mode: "number" }),
  notes: text("notes"),
  addedBy: varchar("added_by", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_lc_jurisdiction").on(table.jurisdiction),
  index("idx_lc_chamber").on(table.chamber),
  index("idx_lc_state").on(table.state),
]);
export type LegislatorContact = typeof legislatorContacts.$inferSelect;
export type InsertLegislatorContact = typeof legislatorContacts.$inferInsert;

// ─── Advocacy Organizations: nonprofits, legal aid, community orgs ───
export const advocacyOrganizations = mysqlTable("advocacy_organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  orgType: mysqlEnum("org_type", ["legal_aid", "nonprofit", "community_org", "union", "bar_association", "government_program", "advocacy_group", "research_institute", "other"]).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  state: varchar("state", { length: 64 }),
  domains: json("domains").$type<string[]>(),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 64 }),
  website: varchar("website", { length: 512 }),
  address: text("address"),
  description: text("description"),
  servicesOffered: json("services_offered").$type<string[]>(),
  eligibilityCriteria: text("eligibility_criteria"),
  languages: json("languages").$type<string[]>(),
  hoursOfOperation: varchar("hours_of_operation", { length: 256 }),
  intakeUrl: varchar("intake_url", { length: 512 }),
  isVerified: boolean("is_verified").default(false).notNull(),
  addedBy: varchar("added_by", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ao_type").on(table.orgType),
  index("idx_ao_jurisdiction").on(table.jurisdiction),
  index("idx_ao_state").on(table.state),
]);
export type AdvocacyOrganization = typeof advocacyOrganizations.$inferSelect;
export type InsertAdvocacyOrganization = typeof advocacyOrganizations.$inferInsert;

// ─── Court Directory: filing information for courts and tribunals ───
export const courtDirectory = mysqlTable("court_directory", {
  id: int("id").autoincrement().primaryKey(),
  courtId: varchar("court_id", { length: 32 }).notNull().unique(),
  courtName: varchar("court_name", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }).notNull(),
  courtType: mysqlEnum("court_type", [
    "Appellate", "State Supreme Court", "Administrative Tribunal",
    "Federal District", "State Trial", "Bankruptcy", "Tax", "Military", "Tribal"
  ]).notNull(),
  filingPortal: varchar("filing_portal", { length: 512 }),
  clerkPhone: varchar("clerk_phone", { length: 64 }),
  address: text("address"),
  filingFee: varchar("filing_fee", { length: 64 }),
  keyDeadlines: text("key_deadlines"),
  localRulesUrl: varchar("local_rules_url", { length: 512 }),
  proSeResources: varchar("pro_se_resources", { length: 512 }),
  efiling: varchar("efiling", { length: 256 }),
  caseTypes: text("case_types"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_cd_type").on(table.courtType),
  index("idx_cd_jurisdiction").on(table.jurisdiction),
]);
export type CourtDirectory = typeof courtDirectory.$inferSelect;
export type InsertCourtDirectory = typeof courtDirectory.$inferInsert;

// ─── Intake Document Templates: fillable templates for pro se filings ───
export const intakeDocumentTemplates = mysqlTable("intake_document_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateId: varchar("template_id", { length: 32 }).notNull().unique(),
  templateName: varchar("template_name", { length: 512 }).notNull(),
  purpose: text("purpose"),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  requiredFields: json("required_fields").$type<string[]>(),
  templateText: mediumtext("template_text").notNull(),
  attachmentsRequired: text("attachments_required"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_idt_jurisdiction").on(table.jurisdiction),
]);
export type IntakeDocumentTemplate = typeof intakeDocumentTemplates.$inferSelect;
export type InsertIntakeDocumentTemplate = typeof intakeDocumentTemplates.$inferInsert;

// ─── Evidence Items: user-submitted evidence artifacts (State Graph layer) ───
export const EVIDENCE_TYPES = [
  "email", "text_message", "letter", "notice", "policy_document",
  "medical_record", "photo", "timeline_entry", "witness_statement",
  "call_log", "contract", "receipt", "government_form", "court_filing",
  "audio_recording", "video_recording", "screenshot", "other",
] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];

export const evidenceItems = mysqlTable("evidence_items", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  evidenceType: varchar("evidenceType", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  sourceName: varchar("sourceName", { length: 256 }),
  sourceDate: bigint("sourceDate", { mode: "number" }),
  fileReference: text("fileReference"), // S3 URL if uploaded
  extractedText: mediumtext("extractedText"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ei_case").on(table.caseId),
  index("idx_ei_type").on(table.evidenceType),
]);
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type InsertEvidenceItem = typeof evidenceItems.$inferInsert;

// ─── Evidence → Proof Element Links: maps evidence to proof framework elements ───
export const evidenceProofLinks = mysqlTable("evidence_proof_links", {
  id: int("id").autoincrement().primaryKey(),
  evidenceId: int("evidenceId").notNull(),
  frameworkId: int("frameworkId").notNull(),
  elementNumber: int("elementNumber").notNull(), // 1-indexed element in proof framework
  relationshipStrength: decimal("relationshipStrength", { precision: 3, scale: 2 }), // 0.00-1.00
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_epl_evidence").on(table.evidenceId),
  index("idx_epl_framework").on(table.frameworkId),
  index("idx_epl_element").on(table.frameworkId, table.elementNumber),
]);
export type EvidenceProofLink = typeof evidenceProofLinks.$inferSelect;
export type InsertEvidenceProofLink = typeof evidenceProofLinks.$inferInsert;

// ─── Evidence → Event Links: connects evidence to events it proves ───
export const evidenceEventLinks = mysqlTable("evidence_event_links", {
  id: int("id").autoincrement().primaryKey(),
  evidenceId: int("evidenceId").notNull(),
  eventId: int("eventId").notNull(),
  relationship: varchar("relationship", { length: 64 }).notNull(), // proves, corroborates, contradicts, references
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_eel_evidence").on(table.evidenceId),
  index("idx_eel_event").on(table.eventId),
]);
export type EvidenceEventLink = typeof evidenceEventLinks.$inferSelect;
export type InsertEvidenceEventLink = typeof evidenceEventLinks.$inferInsert;

// ─── Evidence Graph Edges: typed relationships between evidence/events and claims/barriers/agencies ───
export const evidenceGraphEdges = mysqlTable("evidence_graph_edges", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  fromType: mysqlEnum("fromType_eg", ["evidence", "event"]).notNull(),
  fromId: int("fromId").notNull(),
  edgeType: mysqlEnum("edgeType_eg", ["proves", "supports", "triggers", "involves", "corroborates", "contradicts"]).notNull(),
  toType: mysqlEnum("toType_eg", ["event", "claim", "barrier", "agency", "proof_element"]).notNull(),
  toId: varchar("toId_eg", { length: 256 }).notNull(), // claim type string, barrier ID, agency name, or proof element ref
  strength: mysqlEnum("strength_eg", ["strong", "moderate", "weak"]).default("moderate").notNull(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ege_case").on(table.caseId),
  index("idx_ege_from").on(table.fromType, table.fromId),
  index("idx_ege_to").on(table.toType, table.toId),
  index("idx_ege_edge").on(table.edgeType),
]);
export type EvidenceGraphEdge = typeof evidenceGraphEdges.$inferSelect;
export type InsertEvidenceGraphEdge = typeof evidenceGraphEdges.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// LIVE DATA INGESTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════

// ─── Dataset Registry: metadata for each connected data source ───
export const datasetRegistry = mysqlTable("dataset_registry", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 64 }).notNull().unique(),
  datasetName: varchar("datasetName", { length: 256 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(), // socrata, courtlistener, data_gov, csv
  apiUrl: varchar("apiUrl", { length: 512 }).notNull(),
  updateFrequency: mysqlEnum("updateFrequency", ["hourly", "daily", "weekly", "monthly", "manual"]).default("daily").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  domain: varchar("domain_dr", { length: 128 }).notNull(),
  description: text("description_dr"),
  fieldMapping: json("fieldMapping").$type<Record<string, string>>(), // maps source fields to normalized fields
  enabled: boolean("enabled").default(true).notNull(),
  lastIngestedAt: bigint("lastIngestedAt", { mode: "number" }),
  totalRecordsIngested: int("totalRecordsIngested").default(0).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_dr_source").on(table.source),
  index("idx_dr_jurisdiction").on(table.jurisdiction),
  index("idx_dr_domain").on(table.domain),
]);
export type DatasetRegistryEntry = typeof datasetRegistry.$inferSelect;
export type InsertDatasetRegistryEntry = typeof datasetRegistry.$inferInsert;

// ─── Ingested Records: normalized rows from external data sources ───
export const ingestedRecords = mysqlTable("ingested_records", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId_ir", { length: 64 }).notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 256 }).notNull(),
  ingestedAt: bigint("ingestedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt_ir", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  rawJson: json("rawJson").$type<Record<string, unknown>>().notNull(),
  // Normalized fields for cross-dataset analysis
  normalizedDate: bigint("normalizedDate", { mode: "number" }),
  normalizedCategory: varchar("normalizedCategory", { length: 256 }),
  normalizedEntity: varchar("normalizedEntity", { length: 512 }),
  normalizedJurisdiction: varchar("normalizedJurisdiction", { length: 128 }),
  normalizedCity: varchar("normalizedCity", { length: 128 }),
  normalizedState: varchar("normalizedState", { length: 64 }),
  normalizedZip: varchar("normalizedZip", { length: 16 }),
  normalizedStatus: varchar("normalizedStatus", { length: 64 }),
  normalizedAmount: decimal("normalizedAmount", { precision: 12, scale: 2 }),
  normalizedDescription: text("normalizedDescription"),
  // Session 80: Signal processing tracking
  processedForSignals: boolean("processed_for_signals").default(false).notNull(),
  // ─── Canonical Spine (Implementation Package) ───
  sourceHash: varchar("source_hash", { length: 128 }),
  streamId: varchar("stream_id_ir", { length: 128 }),
  metadataL1L2: json("metadata_l1_l2").$type<Record<string, unknown>>(),
}, (table) => [
  index("idx_ir_dataset").on(table.datasetId),
  index("idx_ir_source_record").on(table.datasetId, table.sourceRecordId),
  uniqueIndex("idx_ir_dataset_source_unique").on(table.datasetId, table.sourceRecordId),
  index("idx_ir_date").on(table.normalizedDate),
  index("idx_ir_category").on(table.normalizedCategory),
  index("idx_ir_entity").on(table.normalizedEntity),
  index("idx_ir_jurisdiction").on(table.normalizedJurisdiction),
  index("idx_ir_city").on(table.normalizedCity),
  index("idx_ir_state").on(table.normalizedState),
]);
export type IngestedRecord = typeof ingestedRecords.$inferSelect;
export type InsertIngestedRecord = typeof ingestedRecords.$inferInsert;

// ─── Ingest Runs: audit log for each ingestion execution ───
export const ingestRuns = mysqlTable("ingest_runs", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId_run", { length: 64 }).notNull(),
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  endTime: bigint("endTime", { mode: "number" }),
  recordsProcessed: int("recordsProcessed").default(0).notNull(),
  recordsInserted: int("recordsInserted").default(0).notNull(),
  recordsUpdated: int("recordsUpdated").default(0).notNull(),
  signalsGenerated: int("signalsGenerated").default(0).notNull(),
  status: mysqlEnum("ingestStatus", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"]).default("running").notNull(),
  errors: json("errors_run").$type<string[]>(),
  summary: text("summary_run"),
  // Session 80: Structured diagnostics
  errorClassification: varchar("error_classification_run", { length: 64 }),
  httpStatus: int("http_status_run"),
  contentType: varchar("content_type_run", { length: 128 }),
  endpointAttempted: varchar("endpoint_attempted_run", { length: 512 }),
  adapterUsed: varchar("adapter_used_run", { length: 64 }),
  bodyPreview: text("body_preview_run"),
  parseFailureReason: text("parse_failure_reason_run"),
  retryCount: int("retry_count_run").default(0).notNull(),
  failureClassification: varchar("failure_classification_run", { length: 64 }),
  suggestedRemediation: text("suggested_remediation_run"),
  signalsProcessed: boolean("signals_processed_run").default(false).notNull(),
  postProcessingEngine: varchar("post_processing_engine_run", { length: 128 }),
  outcomeClassification: varchar("outcome_classification_run", { length: 64 }),
}, (table) => [
  index("idx_run_dataset").on(table.datasetId),
  index("idx_run_status").on(table.status),
  index("idx_run_start").on(table.startTime),
]);
export type IngestRun = typeof ingestRuns.$inferSelect;
export type InsertIngestRun = typeof ingestRuns.$inferInsert;

// ─── Live Signals: signals detected from ingested live data ───
export const liveSignals = mysqlTable("live_signals", {
  id: int("id").autoincrement().primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull(),
  datasetId: varchar("datasetId", { length: 64 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).default("high").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation").notNull(),
  patternSummary: text("patternSummary").notNull(),
  supportingStatistics: json("supportingStatistics").$type<{
    recordsAnalyzed: number;
    patternCount: number;
    percentageAffected: number;
    timeRange: { from: number; to: number };
    jurisdictionsAffected: string[];
    dataSource: string;
    additionalMetrics?: Record<string, number | string>;
  }>().notNull(),
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 4 }).notNull(),
  detectedAt: bigint("detectedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  ingestRunId: int("ingestRunId"),
  // Link to existing signal registry if this matches a known pattern
  signalRegistryId: int("signalRegistryId"),
  // Deduplication: hash of signal type + dataset + jurisdiction + time window
  signalFingerprint: varchar("signalFingerprint", { length: 64 }).notNull(),
  supersededBy: int("supersededBy"), // if a newer signal replaces this one
  active: boolean("active").default(true).notNull(),
  // Entity classification fields (Session 65)
  entityType: mysqlEnum("entity_type_ls", [
    "corporation", "organization", "government_agency", "nonprofit",
    "landlord_entity", "contractor_business", "financial_institution",
    "telecom_company", "media_company", "individual_person", "unknown"
  ]),
  entityConfidenceScore: decimal("entity_confidence_score_ls", { precision: 5, scale: 4 }),
  canonicalEntityName: varchar("canonical_entity_name", { length: 512 }),
  entityAliasesJson: json("entity_aliases_json").$type<string[]>(),
  entityRole: varchar("entity_role", { length: 64 }),
  roleConfidence: decimal("role_confidence", { precision: 5, scale: 4 }),
  // ─── Gating fields (Live Signals System Phase 2) ───
  // effectType: behavioral effect on downstream consumers
  effectType: mysqlEnum("effect_type_ls", [
    "RESOURCE_STALE",
    "PATH_INVALID",
    "DEADLINE_APPROACHING",
    "POLICY_CHANGE",
    "STREAM_ANOMALY",
    "ENTITY_RISK",
  ]),
  // targetTable: which table the signal applies to
  targetTable: varchar("target_table_ls", { length: 64 }),
  // targetId: the specific row ID in targetTable
  targetId: int("target_id_ls"),
  // sourceUrl: canonical URL of the source record that triggered this signal
  sourceUrl: varchar("source_url_ls", { length: 1024 }),
  // sourceTimestamp: when the source event occurred
  sourceTimestamp: bigint("source_timestamp_ls", { mode: "number" }),
}, (table) => [
  index("idx_ls_dataset").on(table.datasetId),
  index("idx_ls_jurisdiction").on(table.jurisdiction),
  index("idx_ls_domain").on(table.domain),
  index("idx_ls_severity").on(table.severity),
  index("idx_ls_detected").on(table.detectedAt),
  index("idx_ls_fingerprint").on(table.signalFingerprint),
  index("idx_ls_active").on(table.active),
  index("idx_ls_effect_type").on(table.effectType),
  index("idx_ls_target").on(table.targetTable, table.targetId),
]);
export type LiveSignal = typeof liveSignals.$inferSelect;
export type InsertLiveSignal = typeof liveSignals.$inferInsert;

// ─── Raw Live Signals: simple streaming table for ingested data ───
export const rawLiveSignals = mysqlTable("raw_live_signals", {
  id: int("id").autoincrement().primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull(),
  sourceId: varchar("sourceId", { length: 512 }).notNull().unique(),
  value: text("value").notNull(),
  numericValue: decimal("numericValue", { precision: 10, scale: 2 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rls_source_id").on(table.sourceId),
  index("idx_rls_signal_type").on(table.signalType),
  index("idx_rls_timestamp").on(table.timestamp),
]);

export type RawLiveSignal = typeof rawLiveSignals.$inferSelect;
export type InsertRawLiveSignal = typeof rawLiveSignals.$inferInsert;

// ─── Interpretation Layers: dataset-specific interpretive context ───

// T1. Category Interpretations — maps raw dataset categories to plain-language explanations
export const interpCategoryInterpretations = mysqlTable("interp_category_interpretations", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),   // e.g. "gpri-47xz" or "j78t-andi"
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  plainLanguageExplanation: text("plainLanguageExplanation").notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),         // e.g. "campaign_finance", "financial_harm"
  relatedLaws: json("relatedLaws").$type<string[]>(),
  relatedAgencies: json("relatedAgencies").$type<string[]>(),
}, (table) => [
  index("idx_ici_dataset").on(table.datasetId),
  index("idx_ici_domain").on(table.domain),
]);
export type InterpCategoryInterpretation = typeof interpCategoryInterpretations.$inferSelect;
export type InsertInterpCategoryInterpretation = typeof interpCategoryInterpretations.$inferInsert;

// T2. Harm / Transparency Risk Mapping — maps categories to harm domains with detection indicators
export const interpHarmMappings = mysqlTable("interp_harm_mappings", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  riskType: varchar("riskType", { length: 100 }).notNull(),     // e.g. "undisclosed_political_funding", "financial_harm"
  riskDescription: text("riskDescription").notNull(),
  detectionIndicators: json("detectionIndicators").$type<string[]>(),
  severityBase: varchar("severityBase", { length: 50 }).notNull(),
}, (table) => [
  index("idx_ihm_dataset").on(table.datasetId),
  index("idx_ihm_risk").on(table.riskType),
]);
export type InterpHarmMapping = typeof interpHarmMappings.$inferSelect;
export type InsertInterpHarmMapping = typeof interpHarmMappings.$inferInsert;

// T3. Timeline / Resolution Expectations — expected processing or filing timelines
export const interpTimelineExpectations = mysqlTable("interp_timeline_expectations", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  frequency: varchar("frequency", { length: 100 }),             // e.g. "weekly during session", "monthly"
  expectedMinDays: int("expectedMinDays").notNull(),
  expectedMaxDays: int("expectedMaxDays").notNull(),
  sourceReference: varchar("sourceReference", { length: 255 }),
  notes: text("notes"),
  electionCycleMultiplier: double("electionCycleMultiplier"),   // PDC-specific: multiplier during election cycles
}, (table) => [
  index("idx_ite_dataset").on(table.datasetId),
]);
export type InterpTimelineExpectation = typeof interpTimelineExpectations.$inferSelect;
export type InsertInterpTimelineExpectation = typeof interpTimelineExpectations.$inferInsert;

// T4. Entity Signal Rules — thresholds for detecting repeat entity patterns
export const interpEntitySignalRules = mysqlTable("interp_entity_signal_rules", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  thresholdCount: int("thresholdCount").notNull(),
  timeWindowDays: int("timeWindowDays").notNull(),
  severity: varchar("severity", { length: 50 }).notNull(),
  description: text("description").notNull(),
  actionRecommendation: text("actionRecommendation"),
}, (table) => [
  index("idx_iesr_dataset").on(table.datasetId),
  index("idx_iesr_signal").on(table.signalType),
]);
export type InterpEntitySignalRule = typeof interpEntitySignalRules.$inferSelect;
export type InsertInterpEntitySignalRule = typeof interpEntitySignalRules.$inferInsert;

// T5. Geographic Signal Rules — thresholds for geographic cluster detection
export const interpGeographicSignalRules = mysqlTable("interp_geographic_signal_rules", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  geographicScope: varchar("geographicScope", { length: 50 }).notNull(),
  thresholdCount: int("thresholdCount").notNull(),
  thresholdPercentage: double("thresholdPercentage"),           // PDC-specific: percentage thresholds
  timeWindowDays: int("timeWindowDays"),                        // PDC-specific
  description: text("description").notNull(),
  baselineComparison: varchar("baselineComparison", { length: 100 }),
}, (table) => [
  index("idx_igsr_dataset").on(table.datasetId),
  index("idx_igsr_signal").on(table.signalType),
]);
export type InterpGeographicSignalRule = typeof interpGeographicSignalRules.$inferSelect;
export type InsertInterpGeographicSignalRule = typeof interpGeographicSignalRules.$inferInsert;

// T6. Status Interpretations — maps record statuses to meanings and signal interpretations
export const interpStatusInterpretations = mysqlTable("interp_status_interpretations", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  status: varchar("status", { length: 255 }).notNull(),
  meaning: text("meaning").notNull(),
  transparencyImplication: text("transparencyImplication"),     // PDC-specific
  signalInterpretation: text("signalInterpretation").notNull(),
  warningThresholdPercentage: int("warningThresholdPercentage"),
}, (table) => [
  index("idx_isi_dataset").on(table.datasetId),
]);
export type InterpStatusInterpretation = typeof interpStatusInterpretations.$inferSelect;
export type InsertInterpStatusInterpretation = typeof interpStatusInterpretations.$inferInsert;

// T7. Signal Explanation Templates — parameterized templates for generating signal explanations
export const interpSignalTemplates = mysqlTable("interp_signal_templates", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  templateText: text("templateText").notNull(),
  severityLevel: varchar("severityLevel", { length: 50 }).notNull(),
  exampleUse: text("exampleUse"),
  dataContextRequired: json("dataContextRequired").$type<string[]>(),
}, (table) => [
  index("idx_ist_dataset").on(table.datasetId),
  index("idx_ist_signal").on(table.signalType),
]);
export type InterpSignalTemplate = typeof interpSignalTemplates.$inferSelect;
export type InsertInterpSignalTemplate = typeof interpSignalTemplates.$inferInsert;

// T8. Jurisdiction Scope Guidance — classification rules for signal scope (local/regional/statewide/national)
export const interpJurisdictionGuidance = mysqlTable("interp_jurisdiction_guidance", {
  id: int("id").autoincrement().primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  scopeName: varchar("scopeName", { length: 50 }).notNull(),
  description: text("description").notNull(),
  detectionCriteria: text("detectionCriteria").notNull(),
  examples: json("examples").$type<string[]>(),
  signalImplications: text("signalImplications"),
}, (table) => [
  index("idx_ijg_dataset").on(table.datasetId),
  index("idx_ijg_scope").on(table.scopeName),
]);
export type InterpJurisdictionGuidance = typeof interpJurisdictionGuidance.$inferSelect;
export type InsertInterpJurisdictionGuidance = typeof interpJurisdictionGuidance.$inferInsert;

// ─── Knowledge Backbone Tables ──────────────────────────────────

export const knowledgeModules = mysqlTable("knowledge_modules", {
  id: int("id").primaryKey().autoincrement(),
  moduleType: varchar("moduleType", { length: 50 }).notNull(),
  moduleName: varchar("moduleName", { length: 200 }).notNull(),
  description: text("description").notNull(),
  sourceFile: varchar("sourceFile", { length: 200 }),
  totalEntries: int("totalEntries").notNull().default(0),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  loadedAt: bigint("loadedAt", { mode: "number" }).notNull(),
  isActive: tinyint("isActive").notNull().default(1),
});

export const knowledgeEntries = mysqlTable("knowledge_entries", {
  id: int("id").primaryKey().autoincrement(),
  moduleId: int("moduleId").notNull(),
  entryId: varchar("entryId", { length: 200 }).notNull(),
  entryName: varchar("entryName", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),
  severity: varchar("severity", { length: 20 }),
  domain: varchar("domain", { length: 100 }),
  payload: json("payload").notNull(),
  tags: json("tags"),
  crossRefModules: json("crossRefModules"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const knowledgeCrossRefs = mysqlTable("knowledge_cross_refs", {
  id: int("id").primaryKey().autoincrement(),
  sourceModuleId: int("sourceModuleId").notNull(),
  sourceEntryId: varchar("sourceEntryId", { length: 200 }).notNull(),
  targetModuleId: int("targetModuleId").notNull(),
  targetEntryId: varchar("targetEntryId", { length: 200 }),
  targetTable: varchar("targetTable", { length: 100 }),
  relationship: varchar("relationship", { length: 100 }).notNull(),
  notes: text("notes"),
});

// ─── Signal Governance Tables ───────────────────────────────────

export const signalExplanationsExtended = mysqlTable("signal_explanations_extended", {
  id: int("id").primaryKey().autoincrement(),
  templateId: varchar("templateId", { length: 50 }).notNull(),
  signalType: varchar("signalType", { length: 50 }).notNull(),
  datasetId: varchar("datasetId", { length: 50 }),
  templateText: text("templateText").notNull(),
  requiredFields: json("requiredFields"),
  confidenceRequired: int("confidenceRequired").notNull().default(0),
  verificationMethod: varchar("verificationMethod", { length: 100 }),
  falsePositiveRisks: json("falsePositiveRisks"),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const confidenceFactors = mysqlTable("confidence_factors", {
  id: int("id").primaryKey().autoincrement(),
  factorName: varchar("factorName", { length: 100 }).notNull(),
  weight: varchar("weight", { length: 10 }).notNull(),
  description: text("description").notNull(),
  scoringRules: json("scoringRules").notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
});

export const datasetProvenance = mysqlTable("dataset_provenance", {
  id: int("id").primaryKey().autoincrement(),
  datasetId: varchar("datasetId", { length: 50 }).notNull(),
  sourceName: varchar("sourceName", { length: 200 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 500 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  domain: varchar("domain", { length: 100 }),
  updateFrequency: varchar("updateFrequency", { length: 50 }),
  lastFetched: bigint("lastFetched", { mode: "number" }),
  recordCount: int("recordCount").default(0),
  qualityScore: int("qualityScore"),
  notes: text("notes"),
});

export const detectedSignals = mysqlTable("detected_signals", {
  signalId: varchar("signal_id", { length: 64 }).notNull().primaryKey(),
  signalType: varchar("signal_type", { length: 100 }).notNull(),
  datasetId: varchar("dataset_id", { length: 50 }).notNull(),
  detectionTimestamp: bigint("detection_timestamp", { mode: "number" }).notNull(),
  confidenceScore: int("confidence_score").notNull(),
  sourceRecordIds: json("source_record_ids").$type<string[]>(),
  extractionTimestamp: bigint("extraction_timestamp", { mode: "number" }),
  dataVersion: varchar("data_version", { length: 50 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 50 }),
  severityLevel: varchar("severity_level", { length: 50 }).notNull(),
  affectedEntities: json("affected_entities").$type<string[]>(),
  entityId: varchar("entity_id", { length: 255 }),
  geographicFocus: json("geographic_focus"),
  observedValue: decimal("observed_value", { precision: 20, scale: 4 }),
  expectedValue: decimal("expected_value", { precision: 20, scale: 4 }),
  thresholdValue: decimal("threshold_value", { precision: 20, scale: 4 }),
  percentageChange: decimal("percentage_change", { precision: 10, scale: 4 }),
  timeWindowStart: bigint("time_window_start", { mode: "number" }),
  timeWindowEnd: bigint("time_window_end", { mode: "number" }),
  plainLanguageExplanation: text("plain_language_explanation").notNull(),
  escalationStatus: varchar("escalation_status", { length: 50 }),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewNotes: text("review_notes"),
  externalReferenceId: varchar("external_reference_id", { length: 255 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  entityRole: varchar("entity_role", { length: 255 }),
  complaintCategory: varchar("complaint_category", { length: 255 }),
  complaintSubcategory: varchar("complaint_subcategory", { length: 255 }),
  narrativeActionsTaken: text("narrative_actions_taken"),
  narrativeReasoning: text("narrative_reasoning"),
  historicalTrendContext: varchar("historical_trend_context", { length: 255 }),
  crossSignalLinks: json("cross_signal_links"),
  deviation: decimal("deviation", { precision: 10, scale: 4 }),
  patternTypeId: varchar("pattern_type_id", { length: 64 }),
  gateDecisionId: int("gate_decision_id"),
  // ─── Canonical Spine (Implementation Package) ───
  parentRecordId: int("parent_record_id"), // FK to ingested_records.id
  sunamStatus: varchar("sunam_status", { length: 32 }), // pending | approved | rejected | escalated
  forensicLogic: json("forensic_logic").$type<Record<string, unknown>>(), // deterministic reasoning chain
});

export const signalGenerationLog = mysqlTable("signal_generation_log", {
  id: int("id").primaryKey().autoincrement(),
  signalId: varchar("signalId", { length: 50 }).notNull(),
  stepName: varchar("stepName", { length: 100 }).notNull(),
  templateUsed: varchar("templateUsed", { length: 50 }),
  parameters: json("parameters"),
  verificationResult: varchar("verificationResult", { length: 50 }),
  factorBreakdown: json("factorBreakdown"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const escalationThresholds = mysqlTable("escalation_thresholds", {
  id: int("id").primaryKey().autoincrement(),
  tierName: varchar("tierName", { length: 50 }).notNull(),
  minScore: int("minScore").notNull(),
  maxScore: int("maxScore").notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  notifyRoles: json("notifyRoles"),
  autoEscalate: tinyint("autoEscalate").notNull().default(0),
});


// ═══════════════════════════════════════════════════════════════════════
// REMEDY PATH ENGINE
// ═══════════════════════════════════════════════════════════════════════

// ─── Remedy Paths: generated remedy strategies for a case ───
export const remedyPaths = mysqlTable("remedy_paths", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  pathType: varchar("pathType", { length: 64 }).notNull(), // administrative, judicial, legislative, informal, hybrid
  viability: varchar("viability", { length: 32 }).notNull(), // strong, moderate, weak, uncertain
  estimatedTimeline: varchar("estimatedTimeline", { length: 128 }),
  estimatedCost: varchar("estimatedCost", { length: 128 }),
  riskLevel: varchar("riskLevel", { length: 32 }), // low, medium, high
  prerequisites: json("prerequisites").$type<string[]>(),
  relatedClaimTypes: json("relatedClaimTypes").$type<string[]>(),
  generatedBy: varchar("generatedBy", { length: 32 }).default("llm").notNull(), // llm, manual, template
  status: mysqlEnum("remedyStatus", ["draft", "active", "completed", "abandoned"]).default("draft").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  // ─── Canonical Spine (Implementation Package) ───
  signalId: varchar("signal_id_rp", { length: 64 }), // FK to detected_signals.signal_id
  routeDirection: varchar("route_direction", { length: 16 }), // UPWARD | LATERAL
  targetNodeId: int("target_node_id"), // FK to world_nodes.id
  blockReason: text("block_reason"), // null unless blocked
  canonicalRemedyStatus: varchar("canonical_remedy_status", { length: 32 }), // pending | routed | blocked | resolved
}, (table) => [
  index("idx_rp_case").on(table.caseId),
  index("idx_rp_user").on(table.userId),
  index("idx_rp_type").on(table.pathType),
  index("idx_rp_status").on(table.status),
  index("idx_rp_signal").on(table.signalId),
  index("idx_rp_direction").on(table.routeDirection),
  index("idx_rp_target_node").on(table.targetNodeId),
]);
export type RemedyPath = typeof remedyPaths.$inferSelect;
export type InsertRemedyPath = typeof remedyPaths.$inferInsert;

// ─── Remedy Steps: ordered steps within a remedy path ───
export const remedySteps = mysqlTable("remedy_steps", {
  id: int("id").autoincrement().primaryKey(),
  pathId: int("pathId").notNull(),
  stepOrder: int("stepOrder").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  actionType: varchar("actionType", { length: 64 }).notNull(), // file_document, gather_evidence, contact_agency, attend_hearing, submit_form, wait, review
  deadline: bigint("deadline", { mode: "number" }),
  estimatedDuration: varchar("estimatedDuration", { length: 64 }),
  status: mysqlEnum("stepStatus", ["pending", "in_progress", "completed", "skipped", "blocked"]).default("pending").notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  notes: text("notes"),
  linkedToolHref: varchar("linkedToolHref", { length: 256 }), // e.g., "/filing-generator", "/foia"
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rs_path").on(table.pathId),
  index("idx_rs_status").on(table.status),
]);
export type RemedyStep = typeof remedySteps.$inferSelect;
export type InsertRemedyStep = typeof remedySteps.$inferInsert;

// ─── Remedy Documentation Requirements: what documents are needed for each step ───
export const remedyDocRequirements = mysqlTable("remedy_doc_requirements", {
  id: int("id").autoincrement().primaryKey(),
  stepId: int("stepId").notNull(),
  documentType: varchar("documentType", { length: 128 }).notNull(),
  description: text("description"),
  required: tinyint("required").notNull().default(1),
  fulfilled: tinyint("fulfilled").notNull().default(0),
  fulfilledByDocId: int("fulfilledByDocId"), // links to documents table
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rdr_step").on(table.stepId),
]);
export type RemedyDocRequirement = typeof remedyDocRequirements.$inferSelect;
export type InsertRemedyDocRequirement = typeof remedyDocRequirements.$inferInsert;

// ─── Paperwork Templates: reusable document templates for the paperwork engine ───
export const paperworkTemplates = mysqlTable("paperwork_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateType: varchar("templateType", { length: 64 }).notNull(), // appeal_letter, complaint_filing, foia_request, record_request, grievance, cease_desist
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  templateBody: mediumtext("templateBody").notNull(), // Markdown template with {{placeholders}}
  requiredFields: json("requiredFields").$type<string[]>(), // field names needed to fill template
  applicableClaimTypes: json("applicableClaimTypes").$type<string[]>(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pt_type").on(table.templateType),
]);
export type PaperworkTemplate = typeof paperworkTemplates.$inferSelect;
export type InsertPaperworkTemplate = typeof paperworkTemplates.$inferInsert;

// ─── Generated Documents: documents produced by the paperwork engine ───
export const generatedDocuments = mysqlTable("generated_documents", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  templateId: int("templateId"),
  remedyStepId: int("remedyStepId"), // links to remedy step if generated as part of a remedy path
  documentType: varchar("documentType", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  content: mediumtext("content").notNull(), // Generated markdown content
  status: mysqlEnum("genDocStatus", ["draft", "review", "finalized", "sent", "archived"]).default("draft").notNull(),
  recipientName: varchar("recipientName", { length: 256 }),
  recipientAddress: text("recipientAddress"),
  sentAt: bigint("sentAt", { mode: "number" }),
  fileUrl: text("fileUrl"), // S3 URL if exported
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_gd_case").on(table.caseId),
  index("idx_gd_user").on(table.userId),
  index("idx_gd_type").on(table.documentType),
  index("idx_gd_status").on(table.status),
]);
export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;

// ─── Pattern Registry Engine ───

export const patternRegistry = mysqlTable("pattern_registry", {
  id: int("id").autoincrement().primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull().unique(),
  patternName: varchar("pattern_name", { length: 255 }).notNull(),
  patternDescription: text("pattern_description"),
  patternType: varchar("pattern_type", { length: 100 }),
  signalType: varchar("signal_type", { length: 100 }),
  triggerThreshold: int("trigger_threshold"),
  confidenceThreshold: int("confidence_threshold"),
  confidenceScore: int("confidence_score").default(0),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 50 }),
  firstDetected: bigint("first_detected", { mode: "number" }),
  lastConfirmed: bigint("last_confirmed", { mode: "number" }),
  lastUpdated: bigint("last_updated", { mode: "number" }),
  signalCount: int("signal_count").default(0),
  uniqueEntitiesCount: int("unique_entities_count").default(0),
  geographicSpread: int("geographic_spread").default(0),
  timeSpanDays: int("time_span_days").default(0),
  decayStatus: varchar("decay_status", { length: 50 }).default("active"),
  decayReason: text("decay_reason"),
  relatedLaws: json("related_laws").$type<string[]>(),
  relatedAgencies: json("related_agencies").$type<string[]>(),
  harmDomains: json("harm_domains").$type<string[]>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }),
}, (t) => [
  index("idx_pr_type").on(t.patternType),
  index("idx_pr_status").on(t.decayStatus),
  index("idx_pr_confirmed").on(t.lastConfirmed),
]);

export const patternSignalLinks = mysqlTable("pattern_signal_links", {
  id: int("id").autoincrement().primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  signalId: varchar("signal_id", { length: 100 }),
  signalType: varchar("signal_type", { length: 100 }),
  confidenceAtLink: int("confidence_at_link"),
  contributingFactor: decimal("contributing_factor", { precision: 5, scale: 2 }),
  linkedAt: bigint("linked_at", { mode: "number" }),
  datasetId: varchar("dataset_id", { length: 50 }),
  sourceRecordIds: json("source_record_ids").$type<string[]>(),
}, (t) => [
  index("idx_psl_pattern_drz").on(t.patternId),
  index("idx_psl_signal_drz").on(t.signalId),
  uniqueIndex("uq_pattern_signal_drz").on(t.patternId, t.signalId),
]);

export const patternMetadata = mysqlTable("pattern_metadata", {
  id: int("id").autoincrement().primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  metadataType: varchar("metadata_type", { length: 100 }),
  metadataKey: varchar("metadata_key", { length: 255 }),
  metadataValue: text("metadata_value"),
  confidenceScore: int("confidence_score"),
  source: varchar("source", { length: 255 }),
  verified: tinyint("verified").default(0),
  createdAt: bigint("created_at", { mode: "number" }),
}, (t) => [
  index("idx_pm_pattern_drz").on(t.patternId),
]);

export const patternEvolution = mysqlTable("pattern_evolution", {
  id: int("id").autoincrement().primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }),
  signalCount: int("signal_count"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  geographicSpread: int("geographic_spread"),
  status: varchar("status", { length: 50 }),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }),
}, (t) => [
  index("idx_pe_pattern_drz").on(t.patternId),
]);

export const patternRelationships = mysqlTable("pattern_relationships", {
  id: int("id").autoincrement().primaryKey(),
  sourcePatternId: char("source_pattern_id", { length: 36 }).notNull(),
  targetPatternId: char("target_pattern_id", { length: 36 }).notNull(),
  relationshipType: varchar("relationship_type", { length: 100 }),
  confidenceScore: int("confidence_score"),
  discoveredAt: bigint("discovered_at", { mode: "number" }),
  lastObserved: bigint("last_observed", { mode: "number" }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  index("idx_prel_source").on(t.sourcePatternId),
  index("idx_prel_target").on(t.targetPatternId),
]);

export const patternConfidenceFactors = mysqlTable("pattern_confidence_factors", {
  id: int("id").autoincrement().primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }),
  factorName: varchar("factor_name", { length: 100 }),
  weight: int("weight"),
  description: text("description"),
  calculationMethod: text("calculation_method"),
});

export const patternDecayRules = mysqlTable("pattern_decay_rules", {
  id: int("id").autoincrement().primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }),
  dormantAfterDays: int("dormant_after_days"),
  archiveAfterDays: int("archive_after_days"),
  reactivationThreshold: int("reactivation_threshold"),
  description: text("description"),
});

export const patternCreationThresholds = mysqlTable("pattern_creation_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  signalType: varchar("signal_type", { length: 100 }).notNull(),
  triggerThreshold: int("trigger_threshold").notNull(),
  confidenceThreshold: int("confidence_threshold").notNull(),
  timeWindowDays: int("time_window_days").notNull(),
  description: text("description"),
});

// ─── Trend & Pressure Engine ─────────────────────────────────────────

export const trendRegistry = mysqlTable("trend_registry", {
  trendId: char("trend_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  trendClassification: varchar("trend_classification", { length: 50 }).default("emerging"),
  momentumDirection: varchar("momentum_direction", { length: 20 }).default("plateau"),
  pressureIndex: int("pressure_index").default(0),
  currentSignalCount: int("current_signal_count").default(0),
  currentConfidenceScore: decimal("current_confidence_score", { precision: 5, scale: 2 }).default("0"),
  currentGeographicSpread: int("current_geographic_spread").default(0),
  currentTimeSpanDays: int("current_time_span_days").default(0),
  growthRate7d: decimal("growth_rate_7d", { precision: 8, scale: 2 }).default("0"),
  growthRate30d: decimal("growth_rate_30d", { precision: 8, scale: 2 }).default("0"),
  growthRate90d: decimal("growth_rate_90d", { precision: 8, scale: 2 }).default("0"),
  accelerationRate: decimal("acceleration_rate", { precision: 8, scale: 2 }).default("0"),
  momentumScore: int("momentum_score").default(0),
  geographicExpansionRate: decimal("geographic_expansion_rate", { precision: 8, scale: 2 }).default("0"),
  newRegionsCount: int("new_regions_count").default(0),
  regionConcentrationIndex: decimal("region_concentration_index", { precision: 5, scale: 2 }).default("0"),
  signalDensity: decimal("signal_density", { precision: 8, scale: 2 }).default("0"),
  densityTrend: varchar("density_trend", { length: 20 }).default("stable"),
  forecast30dSignalCount: int("forecast_30d_signal_count").default(0),
  forecastConfidence: decimal("forecast_confidence", { precision: 5, scale: 2 }).default("0"),
  projectedPeakDate: date("projected_peak_date"),
  pressureFactors: json("pressure_factors"),
  lastCalculated: timestamp("last_calculated").defaultNow(),
  validUntil: timestamp("valid_until"),
  isCurrent: boolean("is_current").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trendSnapshots = mysqlTable("trend_snapshots", {
  snapshotId: char("snapshot_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  snapshotDate: date("snapshot_date"),
  signalCount: int("signal_count").default(0),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).default("0"),
  geographicSpread: int("geographic_spread").default(0),
  timeSpanDays: int("time_span_days").default(0),
  growthRateSinceLast: decimal("growth_rate_since_last", { precision: 8, scale: 2 }).default("0"),
  momentumAtSnapshot: varchar("momentum_at_snapshot", { length: 20 }),
  pressureAtSnapshot: int("pressure_at_snapshot").default(0),
  snapshotData: json("snapshot_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendPressureMetrics = mysqlTable("trend_pressure_metrics", {
  metricId: char("metric_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  snapshotDate: date("snapshot_date"),
  volumePressure: int("volume_pressure").default(0),
  velocityPressure: int("velocity_pressure").default(0),
  geographicPressure: int("geographic_pressure").default(0),
  severityPressure: int("severity_pressure").default(0),
  entityPressure: int("entity_pressure").default(0),
  temporalPressure: int("temporal_pressure").default(0),
  pressureIndex: int("pressure_index").default(0),
  criticalThresholdCrossed: boolean("critical_threshold_crossed").default(false),
  warningThresholdCrossed: boolean("warning_threshold_crossed").default(false),
  alertTriggered: boolean("alert_triggered").default(false),
  alertLevel: varchar("alert_level", { length: 50 }).default("info"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendForecasts = mysqlTable("trend_forecasts", {
  forecastId: char("forecast_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  forecastDate: date("forecast_date"),
  forecastHorizonDays: int("forecast_horizon_days").default(30),
  predictedSignalCount: json("predicted_signal_count"),
  predictedConfidence: json("predicted_confidence"),
  predictedGeographicSpread: json("predicted_geographic_spread"),
  lowerBound: json("lower_bound"),
  upperBound: json("upper_bound"),
  modelUsed: varchar("model_used", { length: 100 }).default("linear_regression"),
  rSquared: decimal("r_squared", { precision: 5, scale: 4 }).default("0"),
  forecastAccuracy: decimal("forecast_accuracy", { precision: 5, scale: 2 }).default("0"),
  predictedPeakDate: date("predicted_peak_date"),
  predictedInflectionPoints: json("predicted_inflection_points"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendInterventionImpacts = mysqlTable("trend_intervention_impacts", {
  impactId: char("impact_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  interventionId: char("intervention_id", { length: 36 }),
  interventionDate: date("intervention_date"),
  preTrendClassification: varchar("pre_trend_classification", { length: 50 }),
  preGrowthRate: decimal("pre_growth_rate", { precision: 8, scale: 2 }),
  prePressureIndex: int("pre_pressure_index"),
  postTrendClassification: varchar("post_trend_classification", { length: 50 }),
  postGrowthRate: decimal("post_growth_rate", { precision: 8, scale: 2 }),
  postPressureIndex: int("post_pressure_index"),
  growthRateChange: decimal("growth_rate_change", { precision: 8, scale: 2 }),
  pressureReduction: int("pressure_reduction"),
  daysToImpact: int("days_to_impact"),
  impactDurationDays: int("impact_duration_days"),
  sustainedImpact: boolean("sustained_impact").default(false),
  confidenceOfImpact: decimal("confidence_of_impact", { precision: 5, scale: 2 }),
  confoundingFactors: json("confounding_factors"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendAlertRules = mysqlTable("trend_alert_rules", {
  ruleId: int("rule_id").autoincrement().primaryKey(),
  ruleName: varchar("rule_name", { length: 255 }),
  conditionType: varchar("condition_type", { length: 100 }),
  thresholdValue: decimal("threshold_value", { precision: 10, scale: 2 }),
  thresholdDirection: varchar("threshold_direction", { length: 20 }),
  timeWindowDays: int("time_window_days"),
  alertSeverity: varchar("alert_severity", { length: 50 }),
  notificationChannels: json("notification_channels"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
});


// ═══════════════════════════════════════════════════════════════════════════
// SYSTEMIC STRATEGY PATHFINDING ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export const systemicStrategyRegistry = mysqlTable("strategy_registry", {
  strategyId: char("strategy_id", { length: 36 }).primaryKey(),
  strategyName: varchar("strategy_name", { length: 255 }),
  strategyType: varchar("strategy_type", { length: 100 }),
  strategyDescription: text("strategy_description"),
  applicablePatternTypes: json("applicable_pattern_types"),
  applicableHarmDomains: json("applicable_harm_domains"),
  minimumPressureIndex: int("minimum_pressure_index"),
  maximumPressureIndex: int("maximum_pressure_index"),
  jurisdictionRequirements: json("jurisdiction_requirements"),
  legalAuthority: json("legal_authority"),
  primaryLaws: json("primary_laws"),
  secondaryLaws: json("secondary_laws"),
  leadAgency: varchar("lead_agency", { length: 255 }),
  supportingAgencies: json("supporting_agencies"),
  agencyContactTemplates: json("agency_contact_templates"),
  baseCostEstimate: decimal("base_cost_estimate", { precision: 12, scale: 2 }),
  costPerEntity: decimal("cost_per_entity", { precision: 10, scale: 2 }),
  costPerGeographicUnit: decimal("cost_per_geographic_unit", { precision: 10, scale: 2 }),
  baseDurationDays: int("base_duration_days"),
  durationPerEntity: int("duration_per_entity"),
  staffingRequirements: json("staffing_requirements"),
  historicalSuccessRate: decimal("historical_success_rate", { precision: 5, scale: 2 }),
  avgImpactScore: int("avg_impact_score"),
  confidenceInSuccess: decimal("confidence_in_success", { precision: 5, scale: 2 }),
  lastUpdatedFromOutcomes: date("last_updated_from_outcomes"),
  createdBy: varchar("created_by", { length: 255 }),
  isActive: boolean("is_active").default(true),
  version: int("version").default(1),
  supersededBy: char("superseded_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const strategySelectionRules = mysqlTable("strategy_selection_rules", {
  ruleId: int("rule_id").primaryKey().autoincrement(),
  patternType: varchar("pattern_type", { length: 100 }),
  trendClassification: varchar("trend_classification", { length: 50 }),
  minPressureIndex: int("min_pressure_index"),
  recommendedStrategyId: char("recommended_strategy_id", { length: 36 }),
  recommendedStrategyName: varchar("recommended_strategy_name", { length: 255 }),
  priorityRank: int("priority_rank"),
  ruleDescription: text("rule_description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sysStrategyPaths = mysqlTable("sys_strategy_paths", {
  pathId: char("path_id", { length: 36 }).primaryKey(),
  strategyId: char("strategy_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  pathName: varchar("path_name", { length: 255 }),
  pathDescription: text("path_description"),
  trendClassificationAtCreation: varchar("trend_classification_at_creation", { length: 50 }),
  pressureIndexAtCreation: int("pressure_index_at_creation"),
  signalCountAtCreation: int("signal_count_at_creation"),
  geographicScopeAtCreation: json("geographic_scope_at_creation"),
  estimatedDurationDays: int("estimated_duration_days"),
  estimatedCost: decimal("estimated_cost", { precision: 12, scale: 2 }),
  estimatedImpactScore: int("estimated_impact_score"),
  successProbability: decimal("success_probability", { precision: 5, scale: 2 }),
  assignedLead: varchar("assigned_lead", { length: 255 }),
  pathStatus: varchar("path_status", { length: 50 }).default("proposed"),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  abandonedReason: text("abandoned_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sysStrategySteps = mysqlTable("strategy_steps", {
  stepId: char("step_id", { length: 36 }).primaryKey(),
  pathId: char("path_id", { length: 36 }).notNull(),
  stepNumber: int("step_number").notNull(),
  stepName: varchar("step_name", { length: 255 }),
  stepDescription: text("step_description"),
  stepType: varchar("step_type", { length: 100 }),
  responsibleParty: varchar("responsible_party", { length: 255 }),
  dependencies: json("dependencies"),
  estimatedDurationDays: int("estimated_duration_days"),
  actualDurationDays: int("actual_duration_days"),
  documentationRequired: json("documentation_required"),
  evidenceRequired: json("evidence_required"),
  legalAuthorityReference: text("legal_authority_reference"),
  stepStatus: varchar("step_status", { length: 50 }).default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  blockedReason: text("blocked_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const strategySuccessRates = mysqlTable("strategy_success_rates", {
  rateId: int("rate_id").primaryKey().autoincrement(),
  strategyId: char("strategy_id", { length: 36 }),
  patternType: varchar("pattern_type", { length: 100 }),
  pressureRangeMin: int("pressure_range_min"),
  pressureRangeMax: int("pressure_range_max"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  totalAttempts: int("total_attempts").default(0),
  successfulOutcomes: int("successful_outcomes").default(0),
  partialOutcomes: int("partial_outcomes").default(0),
  failedOutcomes: int("failed_outcomes").default(0),
  avgDurationDays: int("avg_duration_days"),
  avgCost: decimal("avg_cost", { precision: 12, scale: 2 }),
  avgImpactScore: int("avg_impact_score"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTCOME & FEEDBACK ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export const outcomeRegistry = mysqlTable("outcome_registry", {
  outcomeId: char("outcome_id", { length: 36 }).primaryKey(),
  pathId: char("path_id", { length: 36 }),
  strategyId: char("strategy_id", { length: 36 }),
  patternId: char("pattern_id", { length: 36 }),
  outcomeStatus: varchar("outcome_status", { length: 50 }),
  outcomeDescription: text("outcome_description"),
  interventionStartDate: timestamp("intervention_start_date"),
  interventionEndDate: timestamp("intervention_end_date"),
  signalsBefore: int("signals_before"),
  signalsAfter: int("signals_after"),
  signalReductionPct: decimal("signal_reduction_pct", { precision: 5, scale: 2 }),
  pressureBefore: int("pressure_before"),
  pressureAfter: int("pressure_after"),
  pressureReductionPct: decimal("pressure_reduction_pct", { precision: 5, scale: 2 }),
  trendBefore: varchar("trend_before", { length: 50 }),
  trendAfter: varchar("trend_after", { length: 50 }),
  entitiesAffected: int("entities_affected"),
  geographicAreasAffected: int("geographic_areas_affected"),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  costPerSignalReduced: decimal("cost_per_signal_reduced", { precision: 10, scale: 2 }),
  overallEffectivenessScore: int("overall_effectiveness_score"),
  lessonsLearned: text("lessons_learned"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const outcomeMetrics = mysqlTable("outcome_metrics", {
  metricId: int("metric_id").primaryKey().autoincrement(),
  outcomeId: char("outcome_id", { length: 36 }),
  metricName: varchar("metric_name", { length: 255 }),
  metricCategory: varchar("metric_category", { length: 100 }),
  valueBefore: decimal("value_before", { precision: 12, scale: 4 }),
  valueAfter: decimal("value_after", { precision: 12, scale: 4 }),
  changePct: decimal("change_pct", { precision: 8, scale: 4 }),
  measurementDate: timestamp("measurement_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const strategyEffectiveness = mysqlTable("strategy_effectiveness", {
  effectivenessId: int("effectiveness_id").primaryKey().autoincrement(),
  strategyId: char("strategy_id", { length: 36 }),
  patternType: varchar("pattern_type", { length: 100 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  totalDeployments: int("total_deployments").default(0),
  successfulDeployments: int("successful_deployments").default(0),
  avgSignalReductionPct: decimal("avg_signal_reduction_pct", { precision: 5, scale: 2 }),
  avgPressureReductionPct: decimal("avg_pressure_reduction_pct", { precision: 5, scale: 2 }),
  avgEffectivenessScore: int("avg_effectiveness_score"),
  avgCost: decimal("avg_cost", { precision: 12, scale: 2 }),
  avgDurationDays: int("avg_duration_days"),
  bestOutcomeId: char("best_outcome_id", { length: 36 }),
  worstOutcomeId: char("worst_outcome_id", { length: 36 }),
  lastCalculated: timestamp("last_calculated").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════
// Session 49 — Intervention Network + Policy Impact Tables
// ═══════════════════════════════════════════════════════════════════════

export const interventionEndpoints = mysqlTable("intervention_endpoints", {
  endpointId: char("endpoint_id", { length: 36 }).primaryKey(),
  agencyName: varchar("agency_name", { length: 255 }).notNull(),
  agencyAbbreviation: varchar("agency_abbreviation", { length: 50 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 100 }).notNull(),
  interventionType: varchar("intervention_type", { length: 100 }).notNull(),
  contactMethod: varchar("contact_method", { length: 100 }),
  contactDetails: text("contact_details"),
  submissionFormat: varchar("submission_format", { length: 100 }),
  requiredDocuments: json("required_documents"),
  escalationLevel: int("escalation_level").default(1),
  websiteUrl: varchar("website_url", { length: 500 }),
  responseSla: int("response_sla_days"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const patternInterventionRoutes = mysqlTable("pattern_intervention_routes", {
  routeId: int("route_id").primaryKey().autoincrement(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  harmDomain: varchar("harm_domain", { length: 100 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 100 }),
  recommendedEndpointIds: json("recommended_endpoint_ids").notNull(),
  priorityOrder: int("priority_order").default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interventionEscalationRules = mysqlTable("intervention_escalation_rules", {
  ruleId: int("rule_id").primaryKey().autoincrement(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  harmDomain: varchar("harm_domain", { length: 100 }),
  signalThreshold: int("signal_threshold").default(5),
  pressureThreshold: int("pressure_threshold").default(50),
  confidenceThreshold: decimal("confidence_threshold", { precision: 5, scale: 2 }),
  recommendedEndpoint: char("recommended_endpoint", { length: 36 }),
  recommendedStrategy: char("recommended_strategy", { length: 36 }),
  escalationAction: varchar("escalation_action", { length: 100 }),
  autoEscalate: boolean("auto_escalate").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interventionSubmissions = mysqlTable("intervention_submissions", {
  submissionId: char("submission_id", { length: 36 }).primaryKey(),
  endpointId: char("endpoint_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }),
  strategyId: char("strategy_id", { length: 36 }),
  pathId: char("path_id", { length: 36 }),
  caseId: int("case_id"),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionDescription: text("action_description"),
  evidenceBundle: json("evidence_bundle"),
  documentsSent: json("documents_sent"),
  submissionDate: timestamp("submission_date").defaultNow(),
  responseStatus: varchar("response_status", { length: 50 }).default("submitted"),
  responseDate: timestamp("response_date"),
  responseDetails: text("response_details"),
  followupRequired: boolean("followup_required").default(false),
  followupDate: timestamp("followup_date"),
  outcomeReference: char("outcome_reference", { length: 36 }),
  trackingIdentifier: varchar("tracking_identifier", { length: 255 }),
  submittedBy: varchar("submitted_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const policyEvents = mysqlTable("policy_events", {
  policyId: char("policy_id", { length: 36 }).primaryKey(),
  policyName: varchar("policy_name", { length: 500 }).notNull(),
  policyType: varchar("policy_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  effectiveDate: date("effective_date"),
  enactedDate: date("enacted_date"),
  affectedDomains: json("affected_domains"),
  relatedLaws: json("related_laws"),
  description: text("description"),
  sourceUrl: varchar("source_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const policyPatternImpacts = mysqlTable("policy_pattern_impacts", {
  impactId: int("impact_id").primaryKey().autoincrement(),
  policyId: char("policy_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  baselineSignalRate: decimal("baseline_signal_rate", { precision: 10, scale: 2 }),
  postPolicySignalRate: decimal("post_policy_signal_rate", { precision: 10, scale: 2 }),
  impactPercentage: decimal("impact_percentage", { precision: 8, scale: 2 }),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  measurementWindowDays: int("measurement_window_days").default(90),
  measurementStart: date("measurement_start"),
  measurementEnd: date("measurement_end"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Session 51: Remedy Templates & Settlement Calculator Module ───

export const settlementFormulas = mysqlTable("settlement_formulas", {
  formulaId: varchar("formula_id", { length: 36 }).primaryKey(),
  formulaName: varchar("formula_name", { length: 256 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  formulaExpression: text("formula_expression").notNull(),
  variables: json("variables").$type<string[]>(),
  multiplierRanges: json("multiplier_ranges").$type<Record<string, any>>(),
  statutoryBasis: json("statutory_basis").$type<string[]>(),
  notes: text("notes"),
  effectiveDate: date("effective_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const remedyTemplates = mysqlTable("remedy_templates", {
  templateId: varchar("template_id", { length: 36 }).primaryKey(),
  templateName: varchar("template_name", { length: 256 }).notNull(),
  templateType: varchar("template_type", { length: 50 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  templateBody: mediumtext("template_body").notNull(),
  placeholderFields: json("placeholder_fields").$type<string[]>(),
  governingLaw: json("governing_law").$type<string[]>(),
  difficultyLevel: varchar("difficulty_level", { length: 20 }).default("basic"),
  usageCount: int("usage_count").default(0),
  successRate: decimal("success_rate", { precision: 5, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const templateJurisdictionMap = mysqlTable("template_jurisdiction_map", {
  mapId: varchar("map_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),
});

export const damagesMatrix = mysqlTable("damages_matrix", {
  matrixId: varchar("matrix_id", { length: 36 }).primaryKey(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  violationDescription: text("violation_description"),
  damagesRangeLow: decimal("damages_range_low", { precision: 12, scale: 2 }),
  damagesRangeHigh: decimal("damages_range_high", { precision: 12, scale: 2 }),
  typicalAward: decimal("typical_award", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const settlementCalculations = mysqlTable("settlement_calculations", {
  calcId: varchar("calc_id", { length: 36 }).primaryKey(),
  caseId: int("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  formulaId: varchar("formula_id", { length: 36 }),
  inputVariables: json("input_variables").$type<Record<string, number>>(),
  calculatedAmount: decimal("calculated_amount", { precision: 14, scale: 2 }),
  confidenceLevel: varchar("confidence_level", { length: 20 }),
  breakdownJson: json("breakdown_json").$type<Record<string, any>>(),
  calculatedBy: int("calculated_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const generatedRemedyDocs = mysqlTable("generated_remedy_docs", {
  docId: varchar("doc_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  caseId: int("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  strategyPathId: varchar("strategy_path_id", { length: 36 }),
  filledContent: mediumtext("filled_content"),
  placeholderValues: json("placeholder_values").$type<Record<string, string>>(),
  status: varchar("status", { length: 30 }).default("draft"),
  generatedBy: int("generated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const docGenerationQueue = mysqlTable("doc_generation_queue", {
  queueId: varchar("queue_id", { length: 36 }).primaryKey(),
  caseId: int("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  templateId: varchar("template_id", { length: 36 }),
  strategyPathId: varchar("strategy_path_id", { length: 36 }),
  priority: int("priority").default(5),
  status: varchar("status", { length: 30 }).default("pending"),
  requestedBy: int("requested_by"),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const remedyOutcomeTracking = mysqlTable("remedy_outcome_tracking", {
  trackingId: varchar("tracking_id", { length: 36 }).primaryKey(),
  docId: varchar("doc_id", { length: 36 }).notNull(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  caseId: int("case_id"),
  outcomeStatus: varchar("outcome_status", { length: 30 }).default("pending"),
  settlementAmount: decimal("settlement_amount", { precision: 14, scale: 2 }),
  responseReceived: boolean("response_received").default(false),
  daysToResolution: int("days_to_resolution"),
  effectivenessScore: decimal("effectiveness_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const formulaVersionHistory = mysqlTable("formula_version_history", {
  versionId: varchar("version_id", { length: 36 }).primaryKey(),
  formulaId: varchar("formula_id", { length: 36 }).notNull(),
  previousExpression: text("previous_expression"),
  newExpression: text("new_expression"),
  changeReason: text("change_reason"),
  changedBy: int("changed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const templateEffectiveness = mysqlTable("template_effectiveness", {
  effectivenessId: varchar("effectiveness_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  totalUsed: int("total_used").default(0),
  successfulOutcomes: int("successful_outcomes").default(0),
  avgSettlementAmount: decimal("avg_settlement_amount", { precision: 14, scale: 2 }),
  avgDaysToResolution: int("avg_days_to_resolution"),
  effectivenessRating: decimal("effectiveness_rating", { precision: 5, scale: 2 }),
  lastCalculated: timestamp("last_calculated"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jurisdictionRules = mysqlTable("jurisdiction_rules", {
  ruleId: varchar("rule_id", { length: 36 }).primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  statuteOfLimitations: int("statute_of_limitations"),
  filingRequirements: json("filing_requirements").$type<string[]>(),
  mandatoryNotice: boolean("mandatory_notice").default(false),
  noticePeriodDays: int("notice_period_days"),
  adminExhaustionRequired: boolean("admin_exhaustion_required").default(false),
  adminAgency: varchar("admin_agency", { length: 256 }),
  maxDamages: decimal("max_damages", { precision: 14, scale: 2 }),
  trebleDamagesAvailable: boolean("treble_damages_available").default(false),
  attorneyFeesRecoverable: boolean("attorney_fees_recoverable").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calculationAuditLog = mysqlTable("calculation_audit_log", {
  logId: varchar("log_id", { length: 36 }).primaryKey(),
  calcId: varchar("calc_id", { length: 36 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  userId: int("user_id"),
  previousValues: json("previous_values").$type<Record<string, any>>(),
  newValues: json("new_values").$type<Record<string, any>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});


// ─── Knowledge Freshness Monitoring ───
export const knowledgeFreshness = mysqlTable("knowledge_freshness", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("table_name", { length: 128 }).notNull().unique(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  lastUpdate: bigint("last_update", { mode: "number" }),
  recordCount: int("record_count").default(0).notNull(),
  freshnessScore: int("freshness_score").default(100).notNull(), // 0-100
  staleFlag: boolean("stale_flag").default(false).notNull(),
  staleDays: int("stale_days").default(180).notNull(), // configurable per table
  category: varchar("category_kf", { length: 64 }).notNull(), // 'backbone', 'live_data', 'engine'
  lastChecked: bigint("last_checked", { mode: "number" }),
  createdAt: bigint("created_at_kf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_kf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_kf_category").on(table.category),
  index("idx_kf_stale").on(table.staleFlag),
  index("idx_kf_score").on(table.freshnessScore),
]);
export type KnowledgeFreshness = typeof knowledgeFreshness.$inferSelect;
export type InsertKnowledgeFreshness = typeof knowledgeFreshness.$inferInsert;

// ─── Knowledge Coverage Metrics (Gap Analysis) ───
export const knowledgeCoverageMetrics = mysqlTable("knowledge_coverage_metrics", {
  id: int("id").autoincrement().primaryKey(),
  jurisdiction: varchar("jurisdiction_kcm", { length: 128 }).notNull(),
  claimType: varchar("claim_type_kcm", { length: 128 }).notNull(),
  statuteCount: int("statute_count").default(0).notNull(),
  caseLawCount: int("case_law_count").default(0).notNull(),
  agencyCount: int("agency_count").default(0).notNull(),
  proceduralCount: int("procedural_count").default(0).notNull(),
  evidenceProfilesCount: int("evidence_profiles_count").default(0).notNull(),
  advocacyTargetsCount: int("advocacy_targets_count").default(0).notNull(),
  remedyTemplatesCount: int("remedy_templates_count").default(0).notNull(),
  deadlineRulesCount: int("deadline_rules_count").default(0).notNull(),
  coverageScore: int("coverage_score").default(0).notNull(), // 0-100 weighted
  lastCalculated: bigint("last_calculated", { mode: "number" }),
  createdAt: bigint("created_at_kcm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_kcm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_kcm_jurisdiction_claim").on(table.jurisdiction, table.claimType),
  index("idx_kcm_jurisdiction").on(table.jurisdiction),
  index("idx_kcm_claim_type").on(table.claimType),
  index("idx_kcm_score").on(table.coverageScore),
]);
export type KnowledgeCoverageMetric = typeof knowledgeCoverageMetrics.$inferSelect;
export type InsertKnowledgeCoverageMetric = typeof knowledgeCoverageMetrics.$inferInsert;


// ─── Entity Aliases: canonical name mapping for entity deduplication ───
export const entityAliases = mysqlTable("entity_aliases", {
  id: int("id").autoincrement().primaryKey(),
  canonicalName: varchar("canonical_name", { length: 512 }).notNull(),
  aliasName: varchar("alias_name", { length: 512 }).notNull(),
  entityType: mysqlEnum("entity_type_ea", [
    "corporation", "organization", "government_agency", "nonprofit",
    "landlord_entity", "contractor_business", "financial_institution",
    "telecom_company", "media_company", "individual_person", "unknown"
  ]).default("unknown").notNull(),
  confidence: decimal("confidence_ea", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  source: varchar("source_ea", { length: 64 }).default("heuristic").notNull(), // heuristic, manual, llm
  createdAt: bigint("created_at_ea", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_ea_alias_unique").on(table.aliasName),
  index("idx_ea_canonical").on(table.canonicalName),
  index("idx_ea_entity_type").on(table.entityType),
]);
export type EntityAlias = typeof entityAliases.$inferSelect;
export type InsertEntityAlias = typeof entityAliases.$inferInsert;


// ─── Engine 1: Systemic Harm Index ───
export const harmIndexEntities = mysqlTable("harm_index_entities", {
  id: int("id").autoincrement().primaryKey(),
  entityName: varchar("entity_name", { length: 500 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).default("unknown"),
  industrySector: varchar("industry_sector", { length: 200 }),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  firstDetected: bigint("first_detected", { mode: "number" }),
  lastUpdated: bigint("last_updated", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmIndexScores = mysqlTable("harm_index_scores", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entity_id").notNull(),
  complaintCount: int("complaint_count").default(0),
  litigationCount: int("litigation_count").default(0),
  enforcementCount: int("enforcement_count").default(0),
  geographicSpread: decimal("geographic_spread", { precision: 5, scale: 2 }).default("0"),
  severityScore: decimal("severity_score", { precision: 5, scale: 2 }).default("0"),
  patternAcceleration: decimal("pattern_acceleration", { precision: 5, scale: 2 }).default("0"),
  systemicHarmScore: decimal("systemic_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskClassification: varchar("risk_classification", { length: 50 }).default("Low Risk"),
  calculatedAt: bigint("calculated_at", { mode: "number" }).notNull(),
});

export const harmIndexHistory = mysqlTable("harm_index_history", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entity_id").notNull(),
  systemicHarmScore: decimal("systemic_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskClassification: varchar("risk_classification", { length: 50 }),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

// ─── Engine 2: Litigation Correlation ───
export const litigationRegistry = mysqlTable("litigation_registry", {
  id: int("id").autoincrement().primaryKey(),
  entityName: varchar("entity_name", { length: 500 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  caseName: varchar("case_name", { length: 500 }),
  caseNumber: varchar("case_number", { length: 200 }),
  court: varchar("court", { length: 300 }),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  filingDate: bigint("filing_date", { mode: "number" }),
  caseStatus: varchar("case_status", { length: 100 }).default("active"),
  claimType: varchar("claim_type", { length: 200 }),
  relatedLaw: varchar("related_law", { length: 500 }),
  enforcementAgency: varchar("enforcement_agency", { length: 300 }),
  settlementAmount: decimal("settlement_amount", { precision: 15, scale: 2 }),
  sourceUrl: text("source_url"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const entityLitigationLinks = mysqlTable("entity_litigation_links", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entity_id").notNull(),
  litigationId: int("litigation_id").notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0"),
  linkReason: text("link_reason"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Engine 3: Systemic Risk Forecast ───
export const riskForecasts = mysqlTable("risk_forecasts", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id"),
  forecastDate: bigint("forecast_date", { mode: "number" }).notNull(),
  forecastHorizonDays: int("forecast_horizon_days").default(30),
  predictedSignalGrowth: decimal("predicted_signal_growth", { precision: 5, scale: 2 }).default("0"),
  predictedPressureIndex: decimal("predicted_pressure_index", { precision: 5, scale: 2 }).default("0"),
  predictedGeographicSpread: decimal("predicted_geographic_spread", { precision: 5, scale: 2 }).default("0"),
  predictedEntityCount: int("predicted_entity_count").default(0),
  riskForecastScore: decimal("risk_forecast_score", { precision: 5, scale: 2 }).default("0"),
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 4 }).default("0"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const riskForecastHistory = mysqlTable("risk_forecast_history", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id"),
  forecastDate: bigint("forecast_date", { mode: "number" }),
  predictedScore: decimal("predicted_score", { precision: 5, scale: 2 }).default("0"),
  actualScore: decimal("actual_score", { precision: 5, scale: 2 }),
  accuracyPercent: decimal("accuracy_percent", { precision: 5, scale: 2 }),
  evaluatedAt: bigint("evaluated_at", { mode: "number" }),
});

export const entityRiskProjection = mysqlTable("entity_risk_projection", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entity_id"),
  entityName: varchar("entity_name", { length: 500 }),
  industrySector: varchar("industry_sector", { length: 200 }),
  currentHarmScore: decimal("current_harm_score", { precision: 5, scale: 2 }).default("0"),
  predictedHarmScore: decimal("predicted_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskCategory: varchar("risk_category", { length: 50 }).default("Stable"),
  projectionHorizonDays: int("projection_horizon_days").default(30),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Engine 4: Global Systemic Harm Map ───
export const harmMapNodes = mysqlTable("harm_map_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeType: varchar("node_type", { length: 50 }).notNull(),
  nodeLabel: varchar("node_label", { length: 500 }).notNull(),
  entityId: int("entity_id"),
  patternId: int("pattern_id"),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  industrySector: varchar("industry_sector", { length: 200 }),
  harmScore: decimal("harm_score", { precision: 5, scale: 2 }).default("0"),
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("active"),
  metadata: json("metadata"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmMapEdges = mysqlTable("harm_map_edges", {
  id: int("id").autoincrement().primaryKey(),
  sourceNodeId: int("source_node_id").notNull(),
  targetNodeId: int("target_node_id").notNull(),
  relationshipType: varchar("relationship_type", { length: 100 }).notNull(),
  strengthScore: decimal("strength_score", { precision: 5, scale: 2 }).default("0"),
  evidenceCount: int("evidence_count").default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmMapSnapshots = mysqlTable("harm_map_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }).notNull(),
  nodeCount: int("node_count").default(0),
  edgeCount: int("edge_count").default(0),
  topRiskSectors: json("top_risk_sectors"),
  topHarmEntities: json("top_harm_entities"),
  summary: text("summary"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Engine 5: Problem Interpreter / Front Door ───
export const problemIntakeSessions = mysqlTable("problem_intake_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id"),
  rawStory: text("raw_story").notNull(),
  jurisdictionGuess: varchar("jurisdiction_guess", { length: 200 }),
  claimCandidates: json("claim_candidates"),
  selectedClaim: varchar("selected_claim", { length: 200 }),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0"),
  status: varchar("status", { length: 50 }).default("started"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const interpreterClaimMatches = mysqlTable("interpreter_claim_matches", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("session_id").notNull(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0"),
  reasoningSummary: text("reasoning_summary"),
  supportingKeywords: json("supporting_keywords"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const interpreterQuestionFlow = mysqlTable("interpreter_question_flow", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type", { length: 50 }).default("text"),
  answerOptions: json("answer_options"),
  weight: decimal("weight", { precision: 3, scale: 2 }).default("1.00"),
  nextQuestionMap: json("next_question_map"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const interpreterEvidenceGuidance = mysqlTable("interpreter_evidence_guidance", {
  id: int("id").autoincrement().primaryKey(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  evidenceType: varchar("evidence_type", { length: 200 }).notNull(),
  priority: int("priority").default(1),
  guidanceText: text("guidance_text"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Engine 6: Case Link / Shareable Case ───
export const shareableCaseLinks = mysqlTable("shareable_case_links", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  generatedBy: int("generated_by"),
  accessLevel: varchar("access_level", { length: 50 }).default("summary"),
  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
  viewCount: int("view_count").default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastViewedAt: bigint("last_viewed_at", { mode: "number" }),
});

export const shareableCaseViews = mysqlTable("shareable_case_views", {
  id: int("id").autoincrement().primaryKey(),
  linkId: int("link_id").notNull(),
  viewerIp: varchar("viewer_ip", { length: 100 }),
  viewerUserAgent: text("viewer_user_agent"),
  viewerType: varchar("viewer_type", { length: 50 }).default("unknown"),
  viewedAt: bigint("viewed_at", { mode: "number" }).notNull(),
});

export const caseSharePermissions = mysqlTable("case_share_permissions", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  allowEvidence: boolean("allow_evidence").default(false),
  allowNames: boolean("allow_names").default(true),
  allowFinancials: boolean("allow_financials").default(false),
  allowDocuments: boolean("allow_documents").default(false),
  allowPatternLinks: boolean("allow_pattern_links").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── Engine 7: Attorney Match ───
export const attorneyRegistry = mysqlTable("attorney_registry", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  firmName: varchar("firm_name", { length: 500 }),
  barNumber: varchar("bar_number", { length: 100 }),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  practiceAreas: json("practice_areas"),
  yearsExperience: int("years_experience").default(0),
  acceptsContingency: boolean("accepts_contingency").default(false),
  acceptsProBono: boolean("accepts_pro_bono").default(false),
  acceptsNewClients: boolean("accepts_new_clients").default(true),
  contactEmail: varchar("contact_email", { length: 300 }),
  website: varchar("website", { length: 500 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const attorneyCaseMatch = mysqlTable("attorney_case_match", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  attorneyId: int("attorney_id").notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).default("0"),
  practiceMatchScore: decimal("practice_match_score", { precision: 5, scale: 2 }).default("0"),
  jurisdictionMatchScore: decimal("jurisdiction_match_score", { precision: 5, scale: 2 }).default("0"),
  damagesMatchScore: decimal("damages_match_score", { precision: 5, scale: 2 }).default("0"),
  patternMatchScore: decimal("pattern_match_score", { precision: 5, scale: 2 }).default("0"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const attorneyOutcomes = mysqlTable("attorney_outcomes", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  attorneyId: int("attorney_id").notNull(),
  contactMade: boolean("contact_made").default(false),
  representationAccepted: boolean("representation_accepted").default(false),
  representationDeclined: boolean("representation_declined").default(false),
  caseResult: varchar("case_result", { length: 200 }),
  settlementAmount: decimal("settlement_amount", { precision: 15, scale: 2 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});


// ═══════════════════════════════════════════════════════════════════════
// CASE → PATTERN BRIDGE
// ═══════════════════════════════════════════════════════════════════════

// ─── Case Signals: signals extracted from individual case data ───
export const caseSignals = mysqlTable("case_signals", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  userId: int("user_id").notNull(),
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  entityName: varchar("entity_name", { length: 512 }),
  entityType: varchar("entity_type", { length: 64 }),
  claimType: varchar("claim_type", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  domain: varchar("domain", { length: 128 }),
  severity: varchar("severity", { length: 20 }).default("medium").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation").notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  evidenceStrength: decimal("evidence_strength", { precision: 5, scale: 4 }).default("0.0000"),
  entityRepetition: int("entity_repetition").default(0),
  geographicSpread: int("geographic_spread").default(0),
  timeClustering: decimal("time_clustering", { precision: 5, scale: 4 }).default("0.0000"),
  damagesTotal: decimal("damages_total", { precision: 15, scale: 2 }).default("0.00"),
  sourceClaimIds: json("source_claim_ids").$type<number[]>(),
  sourceEntityIds: json("source_entity_ids").$type<number[]>(),
  sourceFindingIds: json("source_finding_ids").$type<number[]>(),
  sourceSignalFlagIds: json("source_signal_flag_ids").$type<number[]>(),
  patternCandidateId: int("pattern_candidate_id"),
  detectedSignalId: int("detected_signal_id"),
  active: tinyint("active").default(1).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cs_case").on(table.caseId),
  index("idx_cs_user").on(table.userId),
  index("idx_cs_entity").on(table.entityName),
  index("idx_cs_claim_type").on(table.claimType),
  index("idx_cs_jurisdiction").on(table.jurisdiction),
  index("idx_cs_pattern").on(table.patternCandidateId),
  index("idx_cs_active").on(table.active),
  index("idx_cs_created").on(table.createdAt),
]);
export type CaseSignal = typeof caseSignals.$inferSelect;
export type InsertCaseSignal = typeof caseSignals.$inferInsert;

// ─── Pattern Candidates: potential systemic patterns awaiting confirmation ───
export const patternCandidates = mysqlTable("pattern_candidates", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: char("candidate_id", { length: 36 }).notNull().unique(),
  patternName: varchar("pattern_name", { length: 255 }).notNull(),
  patternDescription: text("pattern_description"),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  entityName: varchar("entity_name", { length: 512 }),
  entityType: varchar("entity_type", { length: 64 }),
  claimType: varchar("claim_type", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  domain: varchar("domain", { length: 128 }),
  patternStatus: varchar("pattern_status", { length: 50 }).default("candidate").notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  signalCount: int("signal_count").default(0).notNull(),
  caseCount: int("case_count").default(0).notNull(),
  uniqueUsers: int("unique_users").default(0).notNull(),
  evidenceStrength: decimal("evidence_strength", { precision: 5, scale: 4 }).default("0.0000"),
  geographicSpread: int("geographic_spread").default(0),
  timeSpanDays: int("time_span_days").default(0),
  firstSignalAt: bigint("first_signal_at", { mode: "number" }),
  lastSignalAt: bigint("last_signal_at", { mode: "number" }),
  promotedPatternId: char("promoted_pattern_id", { length: 36 }),
  promotionThreshold: int("promotion_threshold").default(3).notNull(),
  confirmationThreshold: int("confirmation_threshold").default(5).notNull(),
  timeWindowDays: int("time_window_days").default(90).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pc_status").on(table.patternStatus),
  index("idx_pc_entity").on(table.entityName),
  index("idx_pc_claim").on(table.claimType),
  index("idx_pc_jurisdiction").on(table.jurisdiction),
  index("idx_pc_promoted").on(table.promotedPatternId),
  index("idx_pc_created").on(table.createdAt),
]);
export type PatternCandidate = typeof patternCandidates.$inferSelect;
export type InsertPatternCandidate = typeof patternCandidates.$inferInsert;

// ─── Case Pattern Links: which cases contribute to which patterns ───
export const casePatternLinks = mysqlTable("case_pattern_links", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  patternCandidateId: int("pattern_candidate_id"),
  patternRegistryId: char("pattern_registry_id", { length: 36 }),
  caseSignalId: int("case_signal_id"),
  contributionType: varchar("contribution_type", { length: 64 }).default("supporting").notNull(),
  linkedAt: bigint("linked_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cpl_case").on(table.caseId),
  index("idx_cpl_candidate").on(table.patternCandidateId),
  index("idx_cpl_pattern").on(table.patternRegistryId),
]);
export type CasePatternLink = typeof casePatternLinks.$inferSelect;
export type InsertCasePatternLink = typeof casePatternLinks.$inferInsert;


// ── Lobbying Activity (Session 69) ──────────────────────────────────
export const lobbyingActivity = mysqlTable("lobbying_activity", {
  id: int("id").autoincrement().primaryKey(),
  lobbyistName: varchar("lobbyist_name", { length: 500 }),
  lobbyingFirm: varchar("lobbying_firm", { length: 500 }),
  clientName: varchar("client_name", { length: 500 }).notNull(),
  industry: varchar("industry", { length: 255 }),
  policyArea: varchar("policy_area", { length: 500 }),
  lobbyingAmount: decimal("lobbying_amount", { precision: 15, scale: 2 }),
  reportingPeriod: varchar("reporting_period", { length: 50 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  legislatorsContacted: text("legislators_contacted"),
  sourceUrl: text("source_url"),
  streamSource: varchar("stream_source", { length: 100 }).default("lobbying_disclosure"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type LobbyingActivity = typeof lobbyingActivity.$inferSelect;

// ── Federal Litigation Cases (Session 69) ───────────────────────────
export const federalLitigationCases = mysqlTable("federal_litigation_cases", {
  id: int("id").autoincrement().primaryKey(),
  caseId: varchar("case_id", { length: 255 }),
  courtName: varchar("court_name", { length: 500 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  filingDate: date("filing_date"),
  caseType: varchar("case_type", { length: 255 }),
  natureOfSuit: varchar("nature_of_suit", { length: 500 }),
  plaintiffName: varchar("plaintiff_name", { length: 500 }),
  defendantName: varchar("defendant_name", { length: 500 }),
  lawFirm: varchar("law_firm", { length: 500 }),
  judge: varchar("judge", { length: 500 }),
  industry: varchar("industry", { length: 255 }),
  caseStatus: varchar("case_status", { length: 100 }),
  sourceUrl: text("source_url"),
  streamSource: varchar("stream_source", { length: 100 }).default("courtlistener"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type FederalLitigationCase = typeof federalLitigationCases.$inferSelect;

// ── Administrative Decisions (Session 69) ───────────────────────────
export const administrativeDecisions = mysqlTable("administrative_decisions", {
  id: int("id").autoincrement().primaryKey(),
  decisionId: varchar("decision_id", { length: 255 }),
  agency: varchar("agency", { length: 500 }).notNull(),
  program: varchar("program", { length: 255 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  claimType: varchar("claim_type", { length: 255 }),
  decisionDate: date("decision_date"),
  initialOutcome: varchar("initial_outcome", { length: 100 }),
  appealOutcome: varchar("appeal_outcome", { length: 100 }),
  processingTimeDays: int("processing_time_days"),
  hearingRequested: boolean("hearing_requested").default(false),
  reversal: boolean("reversal").default(false),
  entityOrAgency: varchar("entity_or_agency", { length: 500 }),
  sourceUrl: text("source_url"),
  streamSource: varchar("stream_source", { length: 100 }).default("administrative_decision"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AdministrativeDecision = typeof administrativeDecisions.$inferSelect;

// ── Verified Reports (Session 69) ───────────────────────────────────
export const verifiedReports = mysqlTable("verified_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("report_id", { length: 255 }).unique(),
  reporterType: varchar("reporter_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  industry: varchar("industry", { length: 255 }),
  entityNamed: varchar("entity_named", { length: 500 }),
  claimType: varchar("claim_type", { length: 255 }),
  evidenceCount: int("evidence_count").default(0),
  verificationStatus: varchar("verification_status", { length: 50 }).default("unverified"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).default("0"),
  narrative: text("narrative"),
  submittedBy: int("submitted_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type VerifiedReport = typeof verifiedReports.$inferSelect;

// ── Cross-Stream Correlations (Session 69) ──────────────────────────
export const crossStreamCorrelations = mysqlTable("cross_stream_correlations", {
  id: int("id").autoincrement().primaryKey(),
  correlationId: varchar("correlation_id", { length: 255 }).unique(),
  entity: varchar("entity", { length: 500 }).notNull(),
  claimType: varchar("claim_type", { length: 255 }),
  industry: varchar("industry", { length: 255 }),
  geographicRegion: varchar("geographic_region", { length: 255 }),
  correlationLevel: int("correlation_level").default(1),
  streamCount: int("stream_count").default(0),
  streamSources: json("stream_sources"),
  signalIds: json("signal_ids"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).default("0"),
  confidenceBoost: decimal("confidence_boost", { precision: 5, scale: 2 }).default("0"),
  patternCandidateId: int("pattern_candidate_id"),
  status: varchar("status", { length: 50 }).default("detected"),
  timeWindowStart: timestamp("time_window_start"),
  timeWindowEnd: timestamp("time_window_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type CrossStreamCorrelation = typeof crossStreamCorrelations.$inferSelect;

// ── Civil Society / Advocacy Reports (Session 70) ─────────────────────
export const advocacyReports = mysqlTable("advocacy_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("report_id", { length: 255 }).unique(),
  organizationName: varchar("organization_name", { length: 500 }).notNull(),
  organizationType: varchar("organization_type", { length: 100 }),
  reportTitle: varchar("report_title", { length: 500 }).notNull(),
  reportType: mysqlEnum("report_type_ar", [
    "policy_brief", "investigative_report", "public_comment",
    "testimony", "amicus_brief", "community_survey",
    "impact_assessment", "regulatory_petition", "enforcement_complaint",
    "annual_report", "press_release", "coalition_letter", "other"
  ]).default("other"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  policyArea: varchar("policy_area", { length: 255 }),
  industry: varchar("industry", { length: 255 }),
  entityNamed: varchar("entity_named", { length: 500 }),
  claimType: varchar("claim_type", { length: 255 }),
  harmType: varchar("harm_type", { length: 255 }),
  affectedPopulation: varchar("affected_population", { length: 500 }),
  estimatedAffectedCount: int("estimated_affected_count"),
  keyFindings: text("key_findings"),
  recommendedActions: text("recommended_actions"),
  sourceUrl: text("source_url"),
  publishDate: date("publish_date"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).default("0"),
  verificationStatus: varchar("verification_status", { length: 50 }).default("unverified"),
  linkedSignalIds: json("linked_signal_ids").$type<number[]>(),
  linkedPatternIds: json("linked_pattern_ids").$type<number[]>(),
  tags: json("tags").$type<string[]>(),
  submittedBy: int("submitted_by"),
  streamSource: varchar("stream_source", { length: 100 }).default("advocacy_report"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ar_org").on(table.organizationName),
  index("idx_ar_type").on(table.reportType),
  index("idx_ar_jurisdiction").on(table.jurisdiction),
  index("idx_ar_policy").on(table.policyArea),
  index("idx_ar_entity").on(table.entityNamed),
  index("idx_ar_harm").on(table.harmType),
]);
export type AdvocacyReport = typeof advocacyReports.$inferSelect;
export type InsertAdvocacyReport = typeof advocacyReports.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════
// TIME-TRAVEL ANALYSIS ENGINE (Session 71)
// Historical replay, counterfactual analysis, algorithm comparison
// ═══════════════════════════════════════════════════════════════════════

// ─── Data Snapshots: reference points for historical datasets ───
export const dataSnapshots = mysqlTable("data_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }).notNull(),
  sourceTable: varchar("source_table", { length: 128 }).notNull(),
  recordCount: int("record_count").notNull().default(0),
  snapshotMetadata: json("snapshot_metadata").$type<{
    datasetIds?: string[];
    jurisdictions?: string[];
    dateRange?: { from: number; to: number };
    signalCount?: number;
    patternCount?: number;
    description?: string;
  }>(),
  status: mysqlEnum("snapshot_status", ["pending", "complete", "failed"]).default("complete").notNull(),
  createdAt: bigint("created_at_ds", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdBy: int("created_by_ds"),
}, (t) => [
  index("idx_ds_date").on(t.snapshotDate),
  index("idx_ds_source").on(t.sourceTable),
  index("idx_ds_status").on(t.status),
]);
export type DataSnapshot = typeof dataSnapshots.$inferSelect;
export type InsertDataSnapshot = typeof dataSnapshots.$inferInsert;

// ─── Time-Travel Runs: each replay/comparison/counterfactual execution ───
export const timeTravelRuns = mysqlTable("time_travel_runs", {
  id: int("id").autoincrement().primaryKey(),
  runId: char("run_id", { length: 36 }).notNull().unique().$defaultFn(() => crypto.randomUUID()),
  snapshotId: int("snapshot_id"),
  algorithmVersion: varchar("algorithm_version", { length: 128 }).notNull().default("current"),
  runType: mysqlEnum("run_type", [
    "historical_replay", "counterfactual_replay",
    "algorithm_comparison", "early_warning_test"
  ]).notNull(),
  startDate: bigint("start_date_ttr", { mode: "number" }),
  endDate: bigint("end_date_ttr", { mode: "number" }),
  status: mysqlEnum("run_status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  patternsDetected: int("patterns_detected").default(0),
  signalsDetected: int("signals_detected").default(0),
  notes: text("notes_ttr"),
  // For algorithm comparison: the second algorithm version
  comparisonAlgorithmVersion: varchar("comparison_algorithm_version", { length: 128 }),
  // Summary results
  summary: json("summary").$type<{
    totalRecordsProcessed?: number;
    totalSignals?: number;
    totalPatterns?: number;
    totalTrends?: number;
    earliestDetection?: number; // timestamp
    confidenceRange?: { min: number; max: number };
    keyFindings?: string[];
    comparisonDelta?: {
      signalDiff: number;
      patternDiff: number;
      avgConfidenceDiff: number;
      earlierDetections: number;
    };
  }>(),
  createdAt: bigint("created_at_ttr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completed_at_ttr", { mode: "number" }),
  createdBy: int("created_by_ttr"),
}, (t) => [
  index("idx_ttr_run_id").on(t.runId),
  index("idx_ttr_snapshot").on(t.snapshotId),
  index("idx_ttr_type").on(t.runType),
  index("idx_ttr_status").on(t.status),
  index("idx_ttr_created").on(t.createdAt),
]);
export type TimeTravelRun = typeof timeTravelRuns.$inferSelect;
export type InsertTimeTravelRun = typeof timeTravelRuns.$inferInsert;

// ─── Historical Signals: mirrors live_signals, isolated from production ───
export const historicalSignals = mysqlTable("historical_signals", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id_hs").notNull(),
  sourceRecordId: varchar("source_record_id", { length: 128 }),
  signalType: varchar("signal_type_hs", { length: 256 }).notNull(),
  entityName: varchar("entity_name_hs", { length: 512 }),
  entityType: varchar("entity_type_hs", { length: 128 }),
  datasetId: varchar("dataset_id_hs", { length: 64 }),
  jurisdiction: varchar("jurisdiction_hs", { length: 128 }),
  domain: varchar("domain_hs", { length: 128 }),
  severity: mysqlEnum("severity_hs", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  title: varchar("title_hs", { length: 512 }).notNull(),
  explanation: text("explanation_hs"),
  confidenceScore: decimal("confidence_score_hs", { precision: 5, scale: 4 }).notNull(),
  originalDetectedAt: bigint("original_detected_at", { mode: "number" }),
  replayDetectedAt: bigint("replay_detected_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  algorithmVersion: varchar("algorithm_version_hs", { length: 128 }),
}, (t) => [
  index("idx_hs_run").on(t.runId),
  index("idx_hs_signal_type").on(t.signalType),
  index("idx_hs_entity").on(t.entityName),
  index("idx_hs_dataset").on(t.datasetId),
]);
export type HistoricalSignal = typeof historicalSignals.$inferSelect;

// ─── Historical Patterns: mirrors pattern_registry, isolated from production ───
export const historicalPatterns = mysqlTable("historical_patterns", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id_hp").notNull(),
  patternType: varchar("pattern_type_hp", { length: 128 }).notNull(),
  patternName: varchar("pattern_name_hp", { length: 255 }),
  entityName: varchar("entity_name_hp", { length: 512 }),
  jurisdiction: varchar("jurisdiction_hp", { length: 128 }),
  patternConfidence: decimal("pattern_confidence_hp", { precision: 5, scale: 4 }).notNull(),
  signalCount: int("signal_count_hp").default(0),
  firstDetectedAt: bigint("first_detected_at_hp", { mode: "number" }),
  lastConfirmedAt: bigint("last_confirmed_at_hp", { mode: "number" }),
  algorithmVersion: varchar("algorithm_version_hp", { length: 128 }),
  contributingSignals: json("contributing_signals_hp").$type<number[]>(),
  metadata: json("metadata_hp").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at_hp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_hp_run").on(t.runId),
  index("idx_hp_type").on(t.patternType),
  index("idx_hp_entity").on(t.entityName),
  index("idx_hp_first_detected").on(t.firstDetectedAt),
]);
export type HistoricalPattern = typeof historicalPatterns.$inferSelect;

// ─── Historical Trends: mirrors trend_pressure_metrics, isolated ───
export const historicalTrends = mysqlTable("historical_trends", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id_ht").notNull(),
  patternId: int("pattern_id_ht"),
  momentumScore: int("momentum_score_ht").default(0),
  pressureIndex: int("pressure_index_ht").default(0),
  trendClassification: varchar("trend_classification_ht", { length: 64 }),
  volumePressure: int("volume_pressure_ht").default(0),
  velocityPressure: int("velocity_pressure_ht").default(0),
  geographicPressure: int("geographic_pressure_ht").default(0),
  severityPressure: int("severity_pressure_ht").default(0),
  algorithmVersion: varchar("algorithm_version_ht", { length: 128 }),
  createdAt: bigint("created_at_ht", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ht_run").on(t.runId),
  index("idx_ht_pattern").on(t.patternId),
  index("idx_ht_classification").on(t.trendClassification),
]);
export type HistoricalTrend = typeof historicalTrends.$inferSelect;

// ─── Counterfactual Parameters: "what if" scenario configuration ───
export const counterfactualParameters = mysqlTable("counterfactual_parameters", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("run_id_cf").notNull(),
  parameterName: varchar("parameter_name", { length: 255 }).notNull(),
  parameterValue: text("parameter_value").notNull(),
  parameterType: mysqlEnum("parameter_type", [
    "weight_override", "filter_toggle", "threshold_change",
    "stream_inclusion", "date_shift", "entity_filter"
  ]).default("weight_override").notNull(),
  description: text("description_cf"),
  createdAt: bigint("created_at_cf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cf_run").on(t.runId),
  index("idx_cf_name").on(t.parameterName),
]);
export type CounterfactualParameter = typeof counterfactualParameters.$inferSelect;


// ═══════════════════════════════════════════════════════════════
// SESSION 72 — ENTITY INTELLIGENCE + INSTITUTIONAL ACCOUNTABILITY
//             + REGULATORY CAPTURE + CRISIS PREDICTION + DATA STREAMS
// ═══════════════════════════════════════════════════════════════

// ─── Entity Registry: structured entity profiles ───
export const entityRegistry = mysqlTable("entity_registry", {
  id: int("id").autoincrement().primaryKey(),
  entityName: varchar("entity_name", { length: 512 }).notNull(),
  canonicalName: varchar("canonical_name", { length: 512 }).notNull(),
  entityType: mysqlEnum("entity_type", [
    "person", "attorney", "law_firm", "corporation", "business",
    "government_agency", "nonprofit", "individual_litigant", "organization", "unknown"
  ]).default("unknown").notNull(),
  industry: varchar("industry", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  aliases: json("aliases").$type<string[]>(),
  corporateParent: varchar("corporate_parent", { length: 512 }),
  confidenceScore: int("confidence_score").default(0).notNull(),
  complaintCount: int("complaint_count").default(0).notNull(),
  litigationCount: int("litigation_count").default(0).notNull(),
  enforcementCount: int("enforcement_count").default(0).notNull(),
  patternCount: int("pattern_count").default(0).notNull(),
  firstSeenAt: bigint("first_seen_at", { mode: "number" }),
  lastSeenAt: bigint("last_seen_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_entity_name").on(t.entityName),
  index("idx_entity_canonical").on(t.canonicalName),
  index("idx_entity_type").on(t.entityType),
  index("idx_entity_industry").on(t.industry),
  index("idx_entity_jurisdiction").on(t.jurisdiction),
]);
export type EntityRegistryRow = typeof entityRegistry.$inferSelect;

// ─── Entity Relationships: connections between entities ───
export const entityRelationships = mysqlTable("entity_relationships", {
  id: int("id").autoincrement().primaryKey(),
  entityIdA: int("entity_id_a").notNull(),
  entityIdB: int("entity_id_b").notNull(),
  relationshipType: mysqlEnum("relationship_type", [
    "subsidiary", "parent_company", "legal_representation",
    "regulatory_target", "corporate_affiliation", "ownership",
    "co_defendant", "opposing_party"
  ]).notNull(),
  confidenceScore: int("confidence_score").default(50).notNull(),
  evidenceSource: varchar("evidence_source", { length: 256 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_er_entity_a").on(t.entityIdA),
  index("idx_er_entity_b").on(t.entityIdB),
  index("idx_er_type").on(t.relationshipType),
]);
export type EntityRelationshipRow = typeof entityRelationships.$inferSelect;

// ─── Institution Registry: regulators, agencies, oversight bodies ───
export const institutionRegistry = mysqlTable("institution_registry", {
  id: int("id").autoincrement().primaryKey(),
  institutionName: varchar("institution_name", { length: 512 }).notNull(),
  institutionType: mysqlEnum("institution_type", [
    "regulator", "enforcement_agency", "oversight_body",
    "legislative_committee", "inspector_general",
    "licensing_board", "administrative_court"
  ]).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  industryScope: varchar("industry_scope", { length: 256 }),
  oversightAuthority: text("oversight_authority"),
  enforcementPowerLevel: mysqlEnum("enforcement_power_level", [
    "full", "limited", "advisory", "none"
  ]).default("limited").notNull(),
  parentInstitution: varchar("parent_institution", { length: 512 }),
  sourceUrl: text("source_url"),
  accountabilityScore: int("accountability_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_inst_name").on(t.institutionName),
  index("idx_inst_type").on(t.institutionType),
  index("idx_inst_jurisdiction").on(t.jurisdiction),
  index("idx_inst_industry").on(t.industryScope),
]);
export type InstitutionRegistryRow = typeof institutionRegistry.$inferSelect;

// ─── Pattern-Institution Links: maps patterns to responsible institutions ───
export const patternInstitutionLinks = mysqlTable("pattern_institution_links", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id").notNull(),
  institutionId: int("institution_id").notNull(),
  responsibilityType: mysqlEnum("responsibility_type", [
    "primary_regulator", "secondary_regulator",
    "enforcement_authority", "oversight_authority", "legislative_oversight"
  ]).notNull(),
  responseStatus: mysqlEnum("response_status", [
    "unknown", "monitoring", "investigating", "enforcing", "policy_action", "inactive"
  ]).default("unknown").notNull(),
  responseDate: bigint("response_date", { mode: "number" }),
  confidenceScore: int("confidence_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pil_pattern").on(t.patternId),
  index("idx_pil_institution").on(t.institutionId),
]);
export type PatternInstitutionLinkRow = typeof patternInstitutionLinks.$inferSelect;

// ─── Institution Activity: tracked actions by institutions ───
export const institutionActivity = mysqlTable("institution_activity", {
  id: int("id").autoincrement().primaryKey(),
  institutionId: int("institution_id").notNull(),
  activityType: mysqlEnum("activity_type", [
    "investigation_opened", "enforcement_action", "hearing_announced",
    "regulation_proposed", "policy_change", "public_statement"
  ]).notNull(),
  patternId: int("pattern_id"),
  entityName: varchar("entity_name", { length: 512 }),
  actionDescription: text("action_description"),
  actionDate: bigint("action_date", { mode: "number" }),
  sourceStream: varchar("source_stream", { length: 128 }),
  confidenceScore: int("confidence_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ia_institution").on(t.institutionId),
  index("idx_ia_pattern").on(t.patternId),
  index("idx_ia_type").on(t.activityType),
]);
export type InstitutionActivityRow = typeof institutionActivity.$inferSelect;

// ─── Regulatory Capture Patterns: detected capture risk patterns ───
export const regulatoryCapturePatterns = mysqlTable("regulatory_capture_patterns", {
  id: int("id").autoincrement().primaryKey(),
  industry: varchar("industry", { length: 256 }).notNull(),
  regulatedEntity: varchar("regulated_entity", { length: 512 }),
  regulatoryAgency: varchar("regulatory_agency", { length: 512 }),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  captureRiskScore: int("capture_risk_score").default(0).notNull(),
  complaintVolume: int("complaint_volume").default(0).notNull(),
  enforcementActions: int("enforcement_actions").default(0).notNull(),
  lobbyingSpend: int("lobbying_spend").default(0).notNull(),
  campaignContributions: int("campaign_contributions").default(0).notNull(),
  policyChanges: int("policy_changes").default(0).notNull(),
  patternStatus: mysqlEnum("pattern_status", [
    "candidate", "monitoring", "high_risk", "confirmed_pattern", "resolved"
  ]).default("candidate").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcp_industry").on(t.industry),
  index("idx_rcp_agency").on(t.regulatoryAgency),
  index("idx_rcp_status").on(t.patternStatus),
  index("idx_rcp_risk").on(t.captureRiskScore),
]);
export type RegulatoryCapturePatternRow = typeof regulatoryCapturePatterns.$inferSelect;

// ─── Regulatory Capture Signals: individual capture indicators ───
export const regulatoryCaptureSignals = mysqlTable("regulatory_capture_signals", {
  id: int("id").autoincrement().primaryKey(),
  capturePatternId: int("capture_pattern_id").notNull(),
  signalType: mysqlEnum("signal_type_rcs", [
    "complaint_spike", "enforcement_silence", "lobbying_pressure",
    "campaign_finance_spike", "policy_change", "litigation_cluster", "whistleblower_report"
  ]).notNull(),
  entity: varchar("entity_rcs", { length: 512 }),
  agency: varchar("agency_rcs", { length: 512 }),
  industry: varchar("industry_rcs", { length: 256 }),
  sourceStream: varchar("source_stream_rcs", { length: 128 }),
  confidenceScore: int("confidence_score_rcs").default(50).notNull(),
  evidenceReference: text("evidence_reference_rcs"),
  createdAt: bigint("created_at_rcs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcsi_pattern").on(t.capturePatternId),
  index("idx_rcsi_type").on(t.signalType),
]);
export type RegulatoryCaptureSignalRow = typeof regulatoryCaptureSignals.$inferSelect;

// ─── Regulatory Capture Metrics: computed ratios and scores ───
export const regulatoryCaptureMetrics = mysqlTable("regulatory_capture_metrics", {
  id: int("id").autoincrement().primaryKey(),
  capturePatternId: int("capture_pattern_id_rcm").notNull(),
  complaintEnforcementRatio: decimal("complaint_enforcement_ratio", { precision: 10, scale: 2 }),
  lobbyingToEnforcementRatio: decimal("lobbying_to_enforcement_ratio", { precision: 10, scale: 2 }),
  campaignToPolicyRatio: decimal("campaign_to_policy_ratio", { precision: 10, scale: 2 }),
  regulatoryDelayDays: int("regulatory_delay_days"),
  industryPenetrationScore: int("industry_penetration_score"),
  computedRiskScore: int("computed_risk_score").default(0).notNull(),
  calculatedAt: bigint("calculated_at_rcm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcm_pattern").on(t.capturePatternId),
]);
export type RegulatoryCaptureMetricRow = typeof regulatoryCaptureMetrics.$inferSelect;

// ─── Crisis Predictions: forecasted systemic crises ───
export const crisisPredictions = mysqlTable("crisis_predictions", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id_cp"),
  industry: varchar("industry_cp", { length: 256 }),
  jurisdiction: varchar("jurisdiction_cp", { length: 256 }),
  entityName: varchar("entity_name_cp", { length: 512 }),
  predictionType: mysqlEnum("prediction_type", [
    "industry_crisis", "institutional_failure",
    "enforcement_collapse", "policy_shockwave"
  ]).notNull(),
  crisisProbability: int("crisis_probability").default(0).notNull(),
  estimatedEscalationDate: bigint("estimated_escalation_date", { mode: "number" }),
  predictionConfidence: int("prediction_confidence").default(0).notNull(),
  riskLevel: mysqlEnum("risk_level_cp", [
    "low", "moderate", "high", "critical"
  ]).default("low").notNull(),
  triggerFactors: json("trigger_factors").$type<string[]>(),
  createdAt: bigint("created_at_cp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cp_pattern").on(t.patternId),
  index("idx_cp_type").on(t.predictionType),
  index("idx_cp_risk").on(t.riskLevel),
  index("idx_cp_probability").on(t.crisisProbability),
]);
export type CrisisPredictionRow = typeof crisisPredictions.$inferSelect;

// ─── Regulatory Enforcement Actions: FTC, FCC, CFPB, SEC, DOL, AG ───
export const regulatoryEnforcementActions = mysqlTable("regulatory_enforcement_actions", {
  id: int("id").autoincrement().primaryKey(),
  agencyName: varchar("agency_name_rea", { length: 256 }).notNull(),
  entityName: varchar("entity_name_rea", { length: 512 }).notNull(),
  industry: varchar("industry_rea", { length: 256 }),
  jurisdiction: varchar("jurisdiction_rea", { length: 256 }),
  violationType: varchar("violation_type", { length: 256 }),
  penaltyAmount: int("penalty_amount"),
  investigationStartDate: bigint("investigation_start_date", { mode: "number" }),
  resolutionDate: bigint("resolution_date", { mode: "number" }),
  caseReference: varchar("case_reference", { length: 256 }),
  sourceUrl: text("source_url_rea"),
  createdAt: bigint("created_at_rea", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rea_agency").on(t.agencyName),
  index("idx_rea_entity").on(t.entityName),
  index("idx_rea_industry").on(t.industry),
]);
export type RegulatoryEnforcementActionRow = typeof regulatoryEnforcementActions.$inferSelect;

// ─── Litigation Cases: court filings, class actions, settlements ───
export const litigationCases = mysqlTable("litigation_cases", {
  id: int("id").autoincrement().primaryKey(),
  courtName: varchar("court_name", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_lc", { length: 256 }),
  filingDate: bigint("filing_date", { mode: "number" }),
  caseType: varchar("case_type", { length: 128 }),
  claimType: varchar("claim_type_lc", { length: 256 }),
  plaintiffName: varchar("plaintiff_name", { length: 512 }),
  defendantName: varchar("defendant_name", { length: 512 }),
  lawFirm: varchar("law_firm", { length: 512 }),
  judge: varchar("judge_name", { length: 256 }),
  caseStatus: mysqlEnum("case_status", [
    "filed", "pending", "discovery", "trial", "settled", "dismissed", "appealed"
  ]).default("filed").notNull(),
  industry: varchar("industry_lc", { length: 256 }),
  sourceUrl: text("source_url_lc"),
  createdAt: bigint("created_at_lc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_lc_defendant").on(t.defendantName),
  index("idx_lc_plaintiff").on(t.plaintiffName),
  index("idx_lc_court").on(t.courtName),
  index("idx_lc_status").on(t.caseStatus),
]);
export type LitigationCaseRow = typeof litigationCases.$inferSelect;

// ─── Administrative Decisions (Session 72): already defined above at line ~5420 ───
// Using the original table definition; this duplicate has been removed.

// ─── Investigative Reports: media investigations ───
export const investigativeReports = mysqlTable("investigative_reports", {
  id: int("id").autoincrement().primaryKey(),
  publicationName: varchar("publication_name", { length: 256 }).notNull(),
  reportTitle: varchar("report_title_ir", { length: 512 }).notNull(),
  issueArea: varchar("issue_area_ir", { length: 256 }),
  entitiesNamed: json("entities_named_ir").$type<string[]>(),
  jurisdiction: varchar("jurisdiction_ir", { length: 256 }),
  summary: text("summary_ir"),
  sourceUrl: text("source_url_ir"),
  publicationDate: bigint("publication_date_ir", { mode: "number" }),
  credibilityScore: int("credibility_score_ir").default(70).notNull(),
  createdAt: bigint("created_at_ir", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ir_publication").on(t.publicationName),
  index("idx_ir_issue").on(t.issueArea),
]);
export type InvestigativeReportRow = typeof investigativeReports.$inferSelect;

// ─── Oversight Reports: IG, GAO, audit reports ───
export const oversightReports = mysqlTable("oversight_reports", {
  id: int("id").autoincrement().primaryKey(),
  oversightBody: varchar("oversight_body", { length: 256 }).notNull(),
  reportTitle: varchar("report_title_or", { length: 512 }).notNull(),
  issueArea: varchar("issue_area_or", { length: 256 }),
  agencyReviewed: varchar("agency_reviewed", { length: 256 }),
  jurisdiction: varchar("jurisdiction_or", { length: 256 }),
  findingsSummary: text("findings_summary"),
  sourceUrl: text("source_url_or"),
  publicationDate: bigint("publication_date_or", { mode: "number" }),
  credibilityScore: int("credibility_score_or").default(80).notNull(),
  createdAt: bigint("created_at_or", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_or_body").on(t.oversightBody),
  index("idx_or_agency").on(t.agencyReviewed),
  index("idx_or_issue").on(t.issueArea),
]);
export type OversightReportRow = typeof oversightReports.$inferSelect;


// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — SYSTEMIC SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════

export const simulationRuns = mysqlTable("simulation_runs", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id"),
  simulationType: varchar("simulation_type", { length: 64 }).notNull(),
  scenarioName: varchar("scenario_name", { length: 256 }).notNull(),
  inputParameters: json("input_parameters").$type<Record<string, unknown>>(),
  predictedOutcome: text("predicted_outcome"),
  predictedPressureChange: decimal("predicted_pressure_change", { precision: 8, scale: 2 }),
  predictedSignalChange: decimal("predicted_signal_change", { precision: 8, scale: 2 }),
  predictedTimelineChange: varchar("predicted_timeline_change", { length: 128 }),
  confidenceScore: int("confidence_score").default(50).notNull(),
  status: varchar("status_sim", { length: 32 }).default("completed").notNull(),
  createdAt: bigint("created_at_sim", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdBy: varchar("created_by_sim", { length: 128 }),
}, (t) => [
  index("idx_sim_pattern").on(t.patternId),
  index("idx_sim_type").on(t.simulationType),
  index("idx_sim_status").on(t.status),
]);
export type SimulationRunRow = typeof simulationRuns.$inferSelect;

export const simulationAssumptions = mysqlTable("simulation_assumptions", {
  id: int("id").autoincrement().primaryKey(),
  simulationId: int("simulation_id").notNull(),
  parameterName: varchar("parameter_name", { length: 128 }).notNull(),
  parameterValue: varchar("parameter_value", { length: 256 }).notNull(),
  rationale: text("rationale"),
  createdAt: bigint("created_at_sa", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sa_sim").on(t.simulationId),
]);
export type SimulationAssumptionRow = typeof simulationAssumptions.$inferSelect;

export const simulationResults = mysqlTable("simulation_results", {
  id: int("id").autoincrement().primaryKey(),
  simulationId: int("simulation_id_sr").notNull(),
  patternId: int("pattern_id_sr"),
  metricName: varchar("metric_name", { length: 128 }).notNull(),
  baselineValue: decimal("baseline_value", { precision: 12, scale: 4 }),
  projectedValue: decimal("projected_value", { precision: 12, scale: 4 }),
  deltaValue: decimal("delta_value", { precision: 12, scale: 4 }),
  impactLevel: varchar("impact_level", { length: 32 }),
  createdAt: bigint("created_at_sr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sr_sim").on(t.simulationId),
  index("idx_sr_metric").on(t.metricName),
]);
export type SimulationResultRow = typeof simulationResults.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — PUBLIC TRANSPARENCY LAYER
// ═══════════════════════════════════════════════════════════════════

export const publicReports = mysqlTable("public_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportType: varchar("report_type_pr", { length: 64 }).notNull(),
  title: varchar("title_pr", { length: 512 }).notNull(),
  summary: text("summary_pr"),
  patternId: int("pattern_id_pr"),
  jurisdiction: varchar("jurisdiction_pr", { length: 256 }),
  audienceType: varchar("audience_type_pr", { length: 64 }).default("public").notNull(),
  status: varchar("status_pr", { length: 32 }).default("draft").notNull(),
  generatedAt: bigint("generated_at_pr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  generatedBy: varchar("generated_by_pr", { length: 128 }),
}, (t) => [
  index("idx_pr_type").on(t.reportType),
  index("idx_pr_pattern").on(t.patternId),
  index("idx_pr_status").on(t.status),
  index("idx_pr_audience").on(t.audienceType),
]);
export type PublicReportRow = typeof publicReports.$inferSelect;

export const publicReportSections = mysqlTable("public_report_sections", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id_prs").notNull(),
  sectionType: varchar("section_type_prs", { length: 64 }).notNull(),
  heading: varchar("heading_prs", { length: 256 }).notNull(),
  content: text("content_prs"),
  displayOrder: int("display_order_prs").default(0).notNull(),
  createdAt: bigint("created_at_prs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_prs_report").on(t.reportId),
  index("idx_prs_order").on(t.displayOrder),
]);
export type PublicReportSectionRow = typeof publicReportSections.$inferSelect;

export const publicReportExports = mysqlTable("public_report_exports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id_pre").notNull(),
  format: varchar("format_pre", { length: 32 }).notNull(),
  filePath: text("file_path_pre"),
  generatedAt: bigint("generated_at_pre", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  generatedBy: varchar("generated_by_pre", { length: 128 }),
}, (t) => [
  index("idx_pre_report").on(t.reportId),
]);
export type PublicReportExportRow = typeof publicReportExports.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — EVIDENCE PUBLISHING & DOSSIER ENGINE
// ═══════════════════════════════════════════════════════════════════

export const dossierPackages = mysqlTable("dossier_packages", {
  id: int("id").autoincrement().primaryKey(),
  dossierType: varchar("dossier_type", { length: 64 }).notNull(),
  title: varchar("title_dp", { length: 512 }).notNull(),
  patternId: int("pattern_id_dp"),
  entityId: int("entity_id_dp"),
  jurisdiction: varchar("jurisdiction_dp", { length: 256 }),
  audienceType: varchar("audience_type_dp", { length: 64 }).notNull(),
  status: varchar("status_dp", { length: 32 }).default("draft").notNull(),
  summary: text("summary_dp"),
  createdAt: bigint("created_at_dp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdBy: varchar("created_by_dp", { length: 128 }),
  updatedAt: bigint("updated_at_dp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_dp_type").on(t.dossierType),
  index("idx_dp_pattern").on(t.patternId),
  index("idx_dp_entity").on(t.entityId),
  index("idx_dp_status").on(t.status),
  index("idx_dp_audience").on(t.audienceType),
]);
export type DossierPackageRow = typeof dossierPackages.$inferSelect;

export const dossierSections = mysqlTable("dossier_sections", {
  id: int("id").autoincrement().primaryKey(),
  dossierId: int("dossier_id_ds").notNull(),
  sectionType: varchar("section_type_ds", { length: 64 }).notNull(),
  heading: varchar("heading_ds", { length: 256 }).notNull(),
  content: text("content_ds"),
  displayOrder: int("display_order_ds").default(0).notNull(),
  sourceRefs: json("source_refs_ds").$type<string[]>(),
  createdAt: bigint("created_at_ds", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ds_dossier").on(t.dossierId),
  index("idx_ds_order").on(t.displayOrder),
]);
export type DossierSectionRow = typeof dossierSections.$inferSelect;

export const dossierExports = mysqlTable("dossier_exports", {
  id: int("id").autoincrement().primaryKey(),
  dossierId: int("dossier_id_de").notNull(),
  format: varchar("format_de", { length: 32 }).notNull(),
  filePath: text("file_path_de"),
  generatedAt: bigint("generated_at_de", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  generatedBy: varchar("generated_by_de", { length: 128 }),
}, (t) => [
  index("idx_de_dossier").on(t.dossierId),
]);
export type DossierExportRow = typeof dossierExports.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — EXTERNAL COLLABORATION & SECURE SHARING ENGINE
// ═══════════════════════════════════════════════════════════════════

export const externalPartners = mysqlTable("external_partners", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name_ep", { length: 256 }).notNull(),
  organization: varchar("organization_ep", { length: 256 }),
  partnerType: varchar("partner_type", { length: 64 }).notNull(),
  email: varchar("email_ep", { length: 256 }),
  jurisdiction: varchar("jurisdiction_ep", { length: 256 }),
  verificationStatus: varchar("verification_status", { length: 32 }).default("pending").notNull(),
  trustScore: int("trust_score_ep").default(50).notNull(),
  notes: text("notes_ep"),
  createdAt: bigint("created_at_ep", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ep_type").on(t.partnerType),
  index("idx_ep_status").on(t.verificationStatus),
  index("idx_ep_org").on(t.organization),
]);
export type ExternalPartnerRow = typeof externalPartners.$inferSelect;

export const dossierShares = mysqlTable("dossier_shares", {
  id: int("id").autoincrement().primaryKey(),
  dossierId: int("dossier_id_dsh").notNull(),
  partnerId: int("partner_id_dsh").notNull(),
  shareToken: varchar("share_token", { length: 128 }).notNull(),
  accessLevel: varchar("access_level", { length: 32 }).default("view_only").notNull(),
  expiresAt: bigint("expires_at_dsh", { mode: "number" }),
  viewCount: int("view_count").default(0).notNull(),
  downloadCount: int("download_count").default(0).notNull(),
  createdAt: bigint("created_at_dsh", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  revoked: boolean("revoked").default(false).notNull(),
}, (t) => [
  index("idx_dsh_dossier").on(t.dossierId),
  index("idx_dsh_partner").on(t.partnerId),
  index("idx_dsh_token").on(t.shareToken),
]);
export type DossierShareRow = typeof dossierShares.$inferSelect;

export const shareAccessLogs = mysqlTable("share_access_logs", {
  id: int("id").autoincrement().primaryKey(),
  shareId: int("share_id_sal").notNull(),
  partnerId: int("partner_id_sal"),
  action: varchar("action_sal", { length: 32 }).notNull(),
  timestamp: bigint("timestamp_sal", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent_sal"),
}, (t) => [
  index("idx_sal_share").on(t.shareId),
  index("idx_sal_partner").on(t.partnerId),
  index("idx_sal_action").on(t.action),
]);
export type ShareAccessLogRow = typeof shareAccessLogs.$inferSelect;

export const externalComments = mysqlTable("external_comments", {
  id: int("id").autoincrement().primaryKey(),
  shareId: int("share_id_ec").notNull(),
  partnerId: int("partner_id_ec").notNull(),
  sectionId: int("section_id_ec"),
  commentText: text("comment_text_ec").notNull(),
  createdAt: bigint("created_at_ec", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ec_share").on(t.shareId),
  index("idx_ec_partner").on(t.partnerId),
]);
export type ExternalCommentRow = typeof externalComments.$inferSelect;

export const dossierRedactions = mysqlTable("dossier_redactions", {
  id: int("id").autoincrement().primaryKey(),
  dossierId: int("dossier_id_dr").notNull(),
  sectionId: int("section_id_dr"),
  redactedText: text("redacted_text_dr").notNull(),
  reason: varchar("reason_dr", { length: 256 }),
  createdBy: varchar("created_by_dr", { length: 128 }),
  createdAt: bigint("created_at_dr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_dr_dossier").on(t.dossierId),
]);
export type DossierRedactionRow = typeof dossierRedactions.$inferSelect;


// ─── Session 74: Entity Transparency Layer ───────────────────────────
export const patternEntitySummary = mysqlTable("pattern_entity_summary", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id_pes").notNull(),
  entityName: varchar("entity_name_pes", { length: 512 }).notNull(),
  entityType: varchar("entity_type_pes", { length: 128 }),
  complaintCount: int("complaint_count_pes").default(0),
  lawsuitCount: int("lawsuit_count_pes").default(0),
  enforcementActions: int("enforcement_actions_pes").default(0),
  patternInvolvementCount: int("pattern_involvement_count_pes").default(0),
  confidenceScore: int("confidence_score_pes").default(0),
  createdAt: bigint("created_at_pes", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_pes", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pes_pattern").on(t.patternId),
  index("idx_pes_entity").on(t.entityName),
]);
export type PatternEntitySummaryRow = typeof patternEntitySummary.$inferSelect;

export const patternResponsibleAgencies = mysqlTable("pattern_responsible_agencies", {
  id: int("id").autoincrement().primaryKey(),
  patternId: int("pattern_id_pra").notNull(),
  agencyName: varchar("agency_name_pra", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_pra", { length: 256 }),
  role: varchar("role_pra", { length: 128 }),
  complaintsReceived: int("complaints_received_pra").default(0),
  investigationsOpened: int("investigations_opened_pra").default(0),
  penaltiesIssued: int("penalties_issued_pra").default(0),
  createdAt: bigint("created_at_pra", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_pra", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pra_pattern").on(t.patternId),
  index("idx_pra_agency").on(t.agencyName),
]);
export type PatternResponsibleAgencyRow = typeof patternResponsibleAgencies.$inferSelect;

// ─── Session 74: Entity Evidence Threshold System ────────────────────
export const entityEvidenceScores = mysqlTable("entity_evidence_scores", {
  id: int("id").autoincrement().primaryKey(),
  entityName: varchar("entity_name_ees", { length: 512 }).notNull(),
  patternId: int("pattern_id_ees"),
  signalCount: int("signal_count_ees").default(0),
  complaintCount: int("complaint_count_ees").default(0),
  lawsuitCount: int("lawsuit_count_ees").default(0),
  enforcementCount: int("enforcement_count_ees").default(0),
  streamCount: int("stream_count_ees").default(0),
  geographicSpread: int("geographic_spread_ees").default(0),
  confidenceScore: int("confidence_score_ees").default(0),
  visibilityStatus: varchar("visibility_status_ees", { length: 64 }).default("provisional"),
  createdAt: bigint("created_at_ees", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_ees", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ees_entity").on(t.entityName),
  index("idx_ees_pattern").on(t.patternId),
  index("idx_ees_visibility").on(t.visibilityStatus),
]);
export type EntityEvidenceScoreRow = typeof entityEvidenceScores.$inferSelect;

// ─── Session 74: Systemic Risk Forecast Engine ───────────────────────
export const systemicRiskForecasts = mysqlTable("systemic_risk_forecasts", {
  id: int("id").autoincrement().primaryKey(),
  forecastScope: varchar("forecast_scope_srf", { length: 64 }).notNull(),
  scopeId: int("scope_id_srf"),
  scopeName: varchar("scope_name_srf", { length: 512 }).notNull(),
  scopeType: varchar("scope_type_srf", { length: 128 }),
  jurisdiction: varchar("jurisdiction_srf", { length: 256 }),
  forecastWindowDays: int("forecast_window_days_srf").notNull(),
  riskScore: int("risk_score_srf").default(0),
  riskLevel: varchar("risk_level_srf", { length: 64 }).default("low"),
  forecastType: varchar("forecast_type_srf", { length: 128 }),
  scenarioLabel: varchar("scenario_label_srf", { length: 128 }),
  primaryDrivers: json("primary_drivers_srf"),
  confidenceScore: int("confidence_score_srf").default(0),
  predictedEscalationDate: bigint("predicted_escalation_date_srf", { mode: "number" }),
  createdAt: bigint("created_at_srf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_srf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_srf_scope").on(t.forecastScope, t.scopeId),
  index("idx_srf_risk").on(t.riskLevel),
  index("idx_srf_window").on(t.forecastWindowDays),
]);
export type SystemicRiskForecastRow = typeof systemicRiskForecasts.$inferSelect;

export const forecastInputs = mysqlTable("forecast_inputs", {
  id: int("id").autoincrement().primaryKey(),
  forecastId: int("forecast_id_fi").notNull(),
  inputType: varchar("input_type_fi", { length: 128 }).notNull(),
  inputName: varchar("input_name_fi", { length: 256 }),
  inputValue: float("input_value_fi").default(0),
  weight: float("weight_fi").default(0),
  createdAt: bigint("created_at_fi", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_fi_forecast").on(t.forecastId),
]);
export type ForecastInputRow = typeof forecastInputs.$inferSelect;

// ─── Session 74: Public Alerting & Subscription Engine ───────────────
export const alertSubscriptions = mysqlTable("alert_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id_as", { length: 128 }).notNull(),
  subscriptionType: varchar("subscription_type_as", { length: 64 }).notNull(),
  targetScope: varchar("target_scope_as", { length: 128 }),
  targetId: int("target_id_as"),
  jurisdiction: varchar("jurisdiction_as", { length: 256 }),
  industry: varchar("industry_as", { length: 256 }),
  claimType: varchar("claim_type_as", { length: 256 }),
  riskThreshold: varchar("risk_threshold_as", { length: 64 }).default("high"),
  alertFrequency: varchar("alert_frequency_as", { length: 64 }).default("immediate"),
  isPaused: tinyint("is_paused_as").default(0),
  notificationChannels: json("notification_channels_as"),
  createdAt: bigint("created_at_as", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_as", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_as_user").on(t.userId),
  index("idx_as_type").on(t.subscriptionType),
]);
export type AlertSubscriptionRow = typeof alertSubscriptions.$inferSelect;

export const alertEvents = mysqlTable("alert_events", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscription_id_ae"),
  alertType: varchar("alert_type_ae", { length: 128 }).notNull(),
  triggerSource: varchar("trigger_source_ae", { length: 128 }),
  triggerId: int("trigger_id_ae"),
  riskScore: int("risk_score_ae"),
  riskLevel: varchar("risk_level_ae", { length: 64 }),
  severity: varchar("severity_ae", { length: 64 }).default("info"),
  message: text("message_ae"),
  metadata: json("metadata_ae"),
  createdAt: bigint("created_at_ae", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  sentAt: bigint("sent_at_ae", { mode: "number" }),
}, (t) => [
  index("idx_ae_sub").on(t.subscriptionId),
  index("idx_ae_type").on(t.alertType),
  index("idx_ae_severity").on(t.severity),
]);
export type AlertEventRow = typeof alertEvents.$inferSelect;

export const alertDeliveryLog = mysqlTable("alert_delivery_log", {
  id: int("id").autoincrement().primaryKey(),
  alertId: int("alert_id_adl").notNull(),
  channel: varchar("channel_adl", { length: 64 }).notNull(),
  recipient: varchar("recipient_adl", { length: 256 }),
  status: varchar("status_adl", { length: 64 }).default("pending"),
  errorMessage: text("error_message_adl"),
  sentAt: bigint("sent_at_adl", { mode: "number" }),
}, (t) => [
  index("idx_adl_alert").on(t.alertId),
]);
export type AlertDeliveryLogRow = typeof alertDeliveryLog.$inferSelect;

// ─── Session 74: Global Systemic Intelligence Map ────────────────────
export const systemMapNodes = mysqlTable("system_map_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeType: varchar("node_type_smn", { length: 64 }).notNull(),
  nodeName: varchar("node_name_smn", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_smn", { length: 256 }),
  industry: varchar("industry_smn", { length: 256 }),
  riskScore: int("risk_score_smn").default(0),
  pressureIndex: int("pressure_index_smn").default(0),
  patternCount: int("pattern_count_smn").default(0),
  trendClassification: varchar("trend_classification_smn", { length: 64 }),
  activeInterventions: int("active_interventions_smn").default(0),
  policyImpactScore: int("policy_impact_score_smn").default(0),
  failureProbability: int("failure_probability_smn").default(0),
  createdAt: bigint("created_at_smn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_smn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_smn_type").on(t.nodeType),
  index("idx_smn_risk").on(t.riskScore),
  index("idx_smn_name").on(t.nodeName),
]);
export type SystemMapNodeRow = typeof systemMapNodes.$inferSelect;

export const systemMapEdges = mysqlTable("system_map_edges", {
  id: int("id").autoincrement().primaryKey(),
  sourceNode: int("source_node_sme").notNull(),
  targetNode: int("target_node_sme").notNull(),
  relationshipType: varchar("relationship_type_sme", { length: 128 }).notNull(),
  relationshipStrength: int("relationship_strength_sme").default(50),
  evidenceCount: int("evidence_count_sme").default(0),
  createdAt: bigint("created_at_sme", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sme_source").on(t.sourceNode),
  index("idx_sme_target").on(t.targetNode),
  index("idx_sme_type").on(t.relationshipType),
]);
export type SystemMapEdgeRow = typeof systemMapEdges.$inferSelect;

export const mapAnnotations = mysqlTable("map_annotations", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: int("node_id_ma").notNull(),
  analyst: varchar("analyst_ma", { length: 256 }),
  note: text("note_ma").notNull(),
  createdAt: bigint("created_at_ma", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ma_node").on(t.nodeId),
]);
export type MapAnnotationRow = typeof mapAnnotations.$inferSelect;

// ─── Session 74: Institutional Failure Prediction Engine ─────────────
export const institutionRiskProfiles = mysqlTable("institution_risk_profiles", {
  id: int("id").autoincrement().primaryKey(),
  institutionId: int("institution_id_irp").notNull(),
  complaintVolume: int("complaint_volume_irp").default(0),
  litigationVolume: int("litigation_volume_irp").default(0),
  regulatoryActions: int("regulatory_actions_irp").default(0),
  enforcementActions: int("enforcement_actions_irp").default(0),
  appealReversalRate: float("appeal_reversal_rate_irp").default(0),
  processingDelayIndex: float("processing_delay_index_irp").default(0),
  policyShockScore: int("policy_shock_score_irp").default(0),
  riskScore: int("risk_score_irp").default(0),
  riskClassification: varchar("risk_classification_irp", { length: 64 }).default("stable"),
  failureProbability: int("failure_probability_irp").default(0),
  estimatedFailureWindow: int("estimated_failure_window_irp"),
  lastUpdated: bigint("last_updated_irp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_irp_institution").on(t.institutionId),
  index("idx_irp_risk").on(t.riskClassification),
]);
export type InstitutionRiskProfileRow = typeof institutionRiskProfiles.$inferSelect;

export const institutionPatternLinks = mysqlTable("institution_pattern_links", {
  id: int("id").autoincrement().primaryKey(),
  institutionId: int("institution_id_ipl").notNull(),
  patternId: int("pattern_id_ipl").notNull(),
  confidenceScore: int("confidence_score_ipl").default(0),
  createdAt: bigint("created_at_ipl", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ipl_institution").on(t.institutionId),
  index("idx_ipl_pattern").on(t.patternId),
]);
export type InstitutionPatternLinkRow = typeof institutionPatternLinks.$inferSelect;

export const institutionTimeline = mysqlTable("institution_timeline", {
  id: int("id").autoincrement().primaryKey(),
  institutionId: int("institution_id_it").notNull(),
  eventType: varchar("event_type_it", { length: 128 }).notNull(),
  timestamp: bigint("timestamp_it", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  impactScore: int("impact_score_it").default(0),
  metadata: json("metadata_it"),
}, (t) => [
  index("idx_it_institution").on(t.institutionId),
  index("idx_it_type").on(t.eventType),
]);
export type InstitutionTimelineRow = typeof institutionTimeline.$inferSelect;

export const institutionAnnotations = mysqlTable("institution_annotations", {
  id: int("id").autoincrement().primaryKey(),
  institutionId: int("institution_id_ia").notNull(),
  analyst: varchar("analyst_ia", { length: 256 }),
  note: text("note_ia").notNull(),
  createdAt: bigint("created_at_ia", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ia_institution").on(t.institutionId),
]);
export type InstitutionAnnotationRow = typeof institutionAnnotations.$inferSelect;


// ─── Investigative Query Engine ─────────────────────────────────────────
export const investigativeQueries = mysqlTable("investigative_queries", {
  id: int("id").autoincrement().primaryKey(),
  queryText: text("query_text").notNull(),
  parsedQuery: json("parsed_query").$type<Record<string, unknown>>(),
  userId: varchar("user_id_iq", { length: 256 }),
  resultCount: int("result_count_iq").default(0),
  status: varchar("status_iq", { length: 32 }).default("pending").notNull(),
  createdAt: bigint("created_at_iq", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_iq_user").on(t.userId),
  index("idx_iq_status").on(t.status),
]);
export type InvestigativeQueryRow = typeof investigativeQueries.$inferSelect;

export const investigativeResults = mysqlTable("investigative_results", {
  id: int("id").autoincrement().primaryKey(),
  queryId: int("query_id_ir").notNull(),
  entityName: varchar("entity_name_ir", { length: 512 }).notNull(),
  entityType: varchar("entity_type_ir", { length: 128 }),
  signalCount: int("signal_count_ir").default(0),
  complaintCount: int("complaint_count_ir").default(0),
  lawsuitCount: int("lawsuit_count_ir").default(0),
  enforcementCount: int("enforcement_count_ir").default(0),
  streamCount: int("stream_count_ir").default(0),
  confidenceScore: int("confidence_score_ir").default(0),
  jurisdictions: json("jurisdictions_ir").$type<string[]>(),
  sourceStreams: json("source_streams_ir").$type<string[]>(),
  rank: int("rank_ir").default(0),
  safeLanguageSummary: text("safe_language_summary_ir"),
}, (t) => [
  index("idx_ir_query").on(t.queryId),
  index("idx_ir_entity").on(t.entityName),
]);
export type InvestigativeResultRow = typeof investigativeResults.$inferSelect;


// ─── Session 76: Luminari Independence Kit ───

// Feature 1: Export Spine Engine
export const exportSpineRuns = mysqlTable("export_spine_runs", {
  id: int("id").autoincrement().primaryKey(),
  exportType: mysqlEnum("export_type_esr", ["full", "schema", "config", "deployment"]).notNull(),
  bundleName: varchar("bundle_name_esr", { length: 256 }).notNull(),
  status: mysqlEnum("status_esr", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  createdAt: bigint("created_at_esr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completed_at_esr", { mode: "number" }),
  createdBy: varchar("created_by_esr", { length: 256 }),
  filePath: varchar("file_path_esr", { length: 512 }),
  fileUrl: varchar("file_url_esr", { length: 1024 }),
  bundleSize: bigint("bundle_size_esr", { mode: "number" }),
  bundleManifestJson: json("bundle_manifest_json_esr").$type<{
    bundleName: string;
    bundleType: string;
    createdAt: number;
    appVersion: string;
    includedDirectories: string[];
    includedTables: string[];
    includedConfigs: string[];
    checksum: string;
  }>(),
  errorMessage: text("error_message_esr"),
}, (t) => [
  index("idx_esr_type").on(t.exportType),
  index("idx_esr_status").on(t.status),
  index("idx_esr_created").on(t.createdAt),
]);
export type ExportSpineRun = typeof exportSpineRuns.$inferSelect;

// Feature 2: Restore Spine Engine
export const restoreSpineRuns = mysqlTable("restore_spine_runs", {
  id: int("id").autoincrement().primaryKey(),
  bundleName: varchar("bundle_name_rsr", { length: 256 }).notNull(),
  restoreType: mysqlEnum("restore_type_rsr", ["full", "schema", "config", "deployment"]).notNull(),
  status: mysqlEnum("status_rsr", ["pending", "validating", "restoring", "completed", "failed", "rolled_back"]).default("pending").notNull(),
  startedAt: bigint("started_at_rsr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completed_at_rsr", { mode: "number" }),
  restoredTables: json("restored_tables_rsr").$type<string[]>(),
  restoredEngines: json("restored_engines_rsr").$type<string[]>(),
  restoredStreams: json("restored_streams_rsr").$type<string[]>(),
  errors: json("errors_rsr").$type<string[]>(),
  executedBy: varchar("executed_by_rsr", { length: 256 }),
  riskLevel: mysqlEnum("risk_level_rsr", ["low", "medium", "high", "critical"]).default("medium"),
  manifestChecksum: varchar("manifest_checksum_rsr", { length: 128 }),
  validationResult: json("validation_result_rsr").$type<{
    checksumValid: boolean;
    schemaCompatible: boolean;
    migrationCompatible: boolean;
    warnings: string[];
  }>(),
}, (t) => [
  index("idx_rsr_type").on(t.restoreType),
  index("idx_rsr_status").on(t.status),
]);
export type RestoreSpineRun = typeof restoreSpineRuns.$inferSelect;

// Feature 3: Admin Sovereign Control — Change Log
export const adminChangeLog = mysqlTable("admin_change_log", {
  id: int("id").autoincrement().primaryKey(),
  adminId: varchar("admin_id_acl", { length: 256 }).notNull(),
  adminName: varchar("admin_name_acl", { length: 256 }),
  actionType: mysqlEnum("action_type_acl", [
    "engine_add", "engine_remove", "engine_reorder", "engine_toggle",
    "stream_add", "stream_edit", "stream_disable",
    "signal_weight_change",
    "schema_edit", "migration_run", "migration_rollback",
    "config_change", "system_setting",
    "checkpoint_reset", "engine_patch", "stream_patch", "schema_patch", "patch_rollback", "force_reingestion",
  ]).notNull(),
  targetSystem: varchar("target_system_acl", { length: 128 }).notNull(),
  targetId: varchar("target_id_acl", { length: 256 }),
  previousState: json("previous_state_acl"),
  newState: json("new_state_acl"),
  description: text("description_acl"),
  timestamp: bigint("timestamp_acl", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  rollbackAvailable: boolean("rollback_available_acl").default(true),
  rolledBack: boolean("rolled_back_acl").default(false),
  rollbackData: json("rollback_data_acl"),
}, (t) => [
  index("idx_acl_admin").on(t.adminId),
  index("idx_acl_action").on(t.actionType),
  index("idx_acl_target").on(t.targetSystem),
  index("idx_acl_time").on(t.timestamp),
]);
export type AdminChangeLogRow = typeof adminChangeLog.$inferSelect;

// Feature 3: Admin Sovereign Control — Engine Registry
export const engineRegistry = mysqlTable("engine_registry", {
  id: int("id").autoincrement().primaryKey(),
  engineId: varchar("engine_id_er", { length: 128 }).notNull().unique(),
  engineName: varchar("engine_name_er", { length: 256 }).notNull(),
  description: text("description_er"),
  category: varchar("category_er", { length: 128 }),
  enabled: boolean("enabled_er").default(true).notNull(),
  sortOrder: int("sort_order_er").default(0).notNull(),
  configJson: json("config_json_er").$type<Record<string, any>>(),
  version: varchar("version_er", { length: 32 }),
  createdAt: bigint("created_at_er", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_er", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_er2_category").on(t.category),
  index("idx_er2_enabled").on(t.enabled),
  index("idx_er2_sort").on(t.sortOrder),
]);
export type EngineRegistryRow = typeof engineRegistry.$inferSelect;

// Feature 4: Data Stream Registry
export const dataStreamRegistry = mysqlTable("data_stream_registry", {
  id: int("id").autoincrement().primaryKey(),
  streamId: varchar("stream_id_dsr", { length: 128 }).notNull().unique(),
  streamName: varchar("stream_name_dsr", { length: 256 }).notNull(),
  streamType: mysqlEnum("stream_type_dsr", [
    "government_complaints", "court_filings", "regulatory_enforcement",
    "public_records", "media_reports", "civil_society_reports", "verified_user_reports",
  ]).notNull(),
  sourceUrl: varchar("source_url_dsr", { length: 512 }),
  updateFrequency: mysqlEnum("update_freq_dsr", ["realtime", "hourly", "daily", "weekly", "monthly", "manual"]).default("daily").notNull(),
  signalWeight: int("signal_weight_dsr").default(100).notNull(),
  confidenceMultiplier: int("confidence_multiplier_dsr").default(100).notNull(),
  enabled: boolean("enabled_dsr").default(true).notNull(),
  description: text("description_dsr"),
  fieldMapping: json("field_mapping_dsr").$type<Record<string, string>>(),
  recordsIngested: int("records_ingested_dsr").default(0).notNull(),
  signalsGenerated: int("signals_generated_dsr").default(0).notNull(),
  lastIngestedAt: bigint("last_ingested_at_dsr", { mode: "number" }),
  // Columns added during unification (Session 77)
  source: varchar("source_dsr", { length: 128 }).default("socrata"),
  apiUrl: varchar("api_url_dsr", { length: 512 }),
  jurisdiction: varchar("jurisdiction_dsr", { length: 128 }),
  domain: varchar("domain_dsr", { length: 128 }),
  cronExpression: varchar("cron_expression_dsr", { length: 64 }),
  // Session 80: Failure tracking & self-healing
  lastRunStatus: varchar("last_run_status_dsr", { length: 64 }),
  lastSuccessAt: bigint("last_success_at_dsr", { mode: "number" }),
  lastFailureAt: bigint("last_failure_at_dsr", { mode: "number" }),
  lastErrorType: varchar("last_error_type_dsr", { length: 64 }),
  lastErrorMessage: text("last_error_message_dsr"),
  lastHttpStatus: int("last_http_status_dsr"),
  failureCount: int("failure_count_dsr").default(0).notNull(),
  consecutiveFailures: int("consecutive_failures_dsr").default(0).notNull(),
  retryAfterAt: bigint("retry_after_at_dsr", { mode: "number" }),
  autoDisabled: boolean("auto_disabled_dsr").default(false).notNull(),
  disabledReason: varchar("disabled_reason_dsr", { length: 256 }),
  lastRecordsIngested: int("last_records_ingested_dsr").default(0).notNull(),
  lastSignalsGenerated: int("last_signals_generated_dsr").default(0).notNull(),
  postProcessingEngineName: varchar("post_processing_engine_name_dsr", { length: 128 }).default("signal-detection-engine"),
  parserMode: varchar("parser_mode_dsr", { length: 64 }).default("auto"),
  createdAt: bigint("created_at_dsr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_dsr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_dsr_type").on(t.streamType),
  index("idx_dsr_enabled").on(t.enabled),
  index("idx_dsr_source").on(t.source),
  index("idx_dsr_jurisdiction").on(t.jurisdiction),
  index("idx_dsr_domain").on(t.domain),
]);
export type DataStreamRegistryRow = typeof dataStreamRegistry.$inferSelect;

// Feature 5: Intervention Timeline Engine
export const patternTimelineEvents = mysqlTable("pattern_timeline_events", {
  id: int("id").autoincrement().primaryKey(),
  patternId: varchar("pattern_id_pte", { length: 128 }).notNull(),
  eventType: mysqlEnum("event_type_pte", [
    "pattern_detected", "strategy_generated", "intervention_started",
    "intervention_completed", "outcome_recorded", "trend_shift", "policy_change",
  ]).notNull(),
  eventSource: varchar("event_source_pte", { length: 256 }),
  title: varchar("title_pte", { length: 512 }).notNull(),
  description: text("description_pte"),
  impactScore: int("impact_score_pte").default(0),
  metadata: json("metadata_pte").$type<Record<string, any>>(),
  timestamp: bigint("timestamp_pte", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pte_pattern").on(t.patternId),
  index("idx_pte_type").on(t.eventType),
  index("idx_pte_time").on(t.timestamp),
]);
export type PatternTimelineEventRow = typeof patternTimelineEvents.$inferSelect;

// Feature 6: System Copilot (Sunam)
export const copilotConversations = mysqlTable("copilot_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id_cc", { length: 256 }).notNull(),
  title: varchar("title_cc", { length: 512 }),
  status: mysqlEnum("status_cc", ["active", "archived"]).default("active").notNull(),
  createdAt: bigint("created_at_cc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_cc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cc_user").on(t.userId),
  index("idx_cc_status").on(t.status),
]);
export type CopilotConversationRow = typeof copilotConversations.$inferSelect;

export const copilotMessages = mysqlTable("copilot_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id_cm").notNull(),
  role: mysqlEnum("role_cm", ["user", "assistant", "system"]).notNull(),
  content: text("content_cm").notNull(),
  artifactId: int("artifact_id_cm"),
  createdAt: bigint("created_at_cm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cm_conv").on(t.conversationId),
]);
export type CopilotMessageRow = typeof copilotMessages.$inferSelect;

export const copilotArtifacts = mysqlTable("copilot_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id_ca").notNull(),
  artifactType: mysqlEnum("artifact_type_ca", ["sql", "engine", "config", "stream", "rule"]).notNull(),
  title: varchar("title_ca", { length: 512 }).notNull(),
  content: text("content_ca").notNull(),
  status: mysqlEnum("status_ca", ["draft", "pending_approval", "approved", "executed", "rejected", "rolled_back"]).default("draft").notNull(),
  rollbackContent: text("rollback_content_ca"),
  createdAt: bigint("created_at_ca", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ca_conv").on(t.conversationId),
  index("idx_ca_status").on(t.status),
]);
export type CopilotArtifactRow = typeof copilotArtifacts.$inferSelect;

export const copilotImpactAnalyses = mysqlTable("copilot_impact_analyses", {
  id: int("id").autoincrement().primaryKey(),
  artifactId: int("artifact_id_cia").notNull(),
  affectedTables: json("affected_tables_cia").$type<string[]>(),
  affectedEngines: json("affected_engines_cia").$type<string[]>(),
  affectedStreams: json("affected_streams_cia").$type<string[]>(),
  riskLevel: mysqlEnum("risk_level_cia", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  rollbackComplexity: mysqlEnum("rollback_complexity_cia", ["simple", "moderate", "complex"]).default("simple").notNull(),
  summary: text("summary_cia"),
  createdAt: bigint("created_at_cia", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cia_artifact").on(t.artifactId),
]);
export type CopilotImpactAnalysisRow = typeof copilotImpactAnalyses.$inferSelect;

export const copilotExecutions = mysqlTable("copilot_executions", {
  id: int("id").autoincrement().primaryKey(),
  artifactId: int("artifact_id_ce").notNull(),
  executedBy: varchar("executed_by_ce", { length: 256 }).notNull(),
  status: mysqlEnum("status_ce", ["success", "failed", "rolled_back"]).notNull(),
  resultSummary: text("result_summary_ce"),
  errorMessage: text("error_message_ce"),
  executedAt: bigint("executed_at_ce", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ce_artifact").on(t.artifactId),
  index("idx_ce_status").on(t.status),
]);
export type CopilotExecutionRow = typeof copilotExecutions.$inferSelect;

export const copilotSystemContext = mysqlTable("copilot_system_context", {
  id: int("id").autoincrement().primaryKey(),
  contextType: mysqlEnum("context_type_csc", ["schema", "engine", "stream", "config", "signal"]).notNull(),
  contextKey: varchar("context_key_csc", { length: 256 }).notNull(),
  contextValue: text("context_value_csc").notNull(),
  updatedAt: bigint("updated_at_csc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_csc_type").on(t.contextType),
  index("idx_csc_key").on(t.contextKey),
]);
export type CopilotSystemContextRow = typeof copilotSystemContext.$inferSelect;


// ─── Signal Extraction Layer: one normalized record per document ───
export const signalExtractions = mysqlTable("signal_extractions", {
  id: int("id").autoincrement().primaryKey(),
  docId: int("doc_id_se").notNull(),
  caseId: int("case_id_se").notNull(),

  // Entities
  entitiesPeople: text("entities_people_se"),       // JSON array of strings
  entitiesCompanies: text("entities_companies_se"),  // JSON array of strings
  entitiesAgencies: text("entities_agencies_se"),    // JSON array of strings

  // Complaint
  complaintType: varchar("complaint_type_se", { length: 256 }),
  complaintDescription: text("complaint_description_se"),
  complaintCategory: mysqlEnum("complaint_category_se", ["financial", "medical", "housing", "legal", "other"]).default("other"),
  complaintRawCategory: text("complaint_raw_category_se"),

  // Location
  locationCity: varchar("location_city_se", { length: 256 }),
  locationCounty: varchar("location_county_se", { length: 256 }),
  locationState: varchar("location_state_se", { length: 10 }),

  // Timeline
  eventDate: varchar("event_date_se", { length: 32 }),   // ISO 8601 or null
  filedDate: varchar("filed_date_se", { length: 32 }),    // ISO 8601 or null

  // Signals
  fingerprint: varchar("fingerprint_se", { length: 128 }).notNull(),
  keywords: text("keywords_se"),  // JSON array of strings

  // Source
  sourceId: varchar("source_id_se", { length: 256 }),
  dataset: varchar("dataset_se", { length: 256 }),

  // Impact (new)
  impactVictimCount: int("impact_victim_count_se"),
  impactAmount: varchar("impact_amount_se", { length: 64 }),
  impactScope: mysqlEnum("impact_scope_se", ["individual", "local", "regional", "statewide", "national"]),
  impactAmountsFound: text("impact_amounts_found_se"),  // JSON array of numbers

  // Legal (new)
  legalStatutes: text("legal_statutes_se"),        // JSON array of strings
  legalViolations: text("legal_violations_se"),     // JSON array of strings
  legalRegulatoryRefs: text("legal_regulatory_refs_se"), // JSON array of strings

  // Involvement (new)
  involvementComplainants: text("involvement_complainants_se"),  // JSON array of strings
  involvementRespondents: text("involvement_respondents_se"),    // JSON array of strings
  involvementWitnesses: text("involvement_witnesses_se"),        // JSON array of strings
  involvementAgencies: text("involvement_agencies_se"),          // JSON array of strings

  // Severity (new) — score is integer 1-10 or null
  severityScore: int("severity_score_se"),
  severityVictimCountUsed: int("severity_victim_count_used_se"),
  severityAmountUsed: varchar("severity_amount_used_se", { length: 64 }),
  severityCategoryWeight: int("severity_category_weight_se"),

  // Evidence (new) — max 3 verbatim quotes, max 200 chars each
  evidenceQuotes: text("evidence_quotes_se"),  // JSON array of strings

  // Metadata
  extractedAt: bigint("extracted_at_se", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_se_doc").on(t.docId),
  index("idx_se_case").on(t.caseId),
  index("idx_se_fingerprint").on(t.fingerprint),
  index("idx_se_category").on(t.complaintCategory),
  index("idx_se_state").on(t.locationState),
  index("idx_se_severity").on(t.severityScore),
  index("idx_se_scope").on(t.impactScope),
]);
export type SignalExtraction = typeof signalExtractions.$inferSelect;
export type InsertSignalExtraction = typeof signalExtractions.$inferInsert;

// ─── Extraction Staging: signals that fail Sunam gate threshold (admin-visible only) ───
export const extractionStaging = mysqlTable("extraction_staging", {
  id: int("id").autoincrement().primaryKey(),
  // Signal data (mirrors live_signals fields)
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  datasetId: varchar("dataset_id", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  domain: varchar("domain", { length: 128 }),
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low"]).notNull().default("medium"),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation"),
  patternSummary: text("pattern_summary"),
  supportingStatistics: json("supporting_statistics"),
  rawConfidenceScore: decimal("raw_confidence_score", { precision: 10, scale: 4 }),
  signalFingerprint: varchar("signal_fingerprint", { length: 128 }),
  entityType: mysqlEnum("entity_type", ["company", "person", "agency", "organization", "unknown"]),
  canonicalEntityName: varchar("canonical_entity_name", { length: 256 }),
  entityRole: varchar("entity_role", { length: 128 }),
  // Source tracking
  liveSignalId: int("live_signal_id"),
  ingestRunId: int("ingest_run_id"),
  // Sunam gate scoring
  sunamScore: decimal("sunam_score", { precision: 10, scale: 4 }).notNull(),
  sunamThreshold: decimal("sunam_threshold", { precision: 10, scale: 4 }).notNull(),
  scoreBreakdown: json("score_breakdown").notNull(),
  // Gate decision
  gateDecision: mysqlEnum("gate_decision", ["staged", "promoted", "rejected", "expired"]).notNull().default("staged"),
  gateReason: text("gate_reason"),
  // Admin review
  reviewedBy: varchar("reviewed_by", { length: 256 }),
  reviewedAt: bigint("reviewed_at", { mode: "number" }),
  reviewNotes: text("review_notes"),
  // Timestamps
  stagedAt: bigint("staged_at", { mode: "number" }).notNull(),
  promotedAt: bigint("promoted_at", { mode: "number" }),
  promotedSignalId: varchar("promoted_signal_id", { length: 64 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => [
  index("idx_es_decision").on(t.gateDecision),
  index("idx_es_dataset").on(t.datasetId),
  index("idx_es_score").on(t.sunamScore),
  index("idx_es_staged").on(t.stagedAt),
  index("idx_es_fingerprint").on(t.signalFingerprint),
]);
export type ExtractionStaging = typeof extractionStaging.$inferSelect;
export type InsertExtractionStaging = typeof extractionStaging.$inferInsert;

// ─── Sunam Gate Log: full audit trail of every gate decision ───
export const sunamGateLog = mysqlTable("sunam_gate_log", {
  id: int("id").autoincrement().primaryKey(),
  // Signal reference
  liveSignalId: int("live_signal_id"),
  signalFingerprint: varchar("signal_fingerprint", { length: 128 }),
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  datasetId: varchar("dataset_id", { length: 128 }).notNull(),
  // Scoring
  sunamScore: decimal("sunam_score", { precision: 10, scale: 4 }).notNull(),
  thresholdUsed: decimal("threshold_used", { precision: 10, scale: 4 }).notNull(),
  scoreBreakdown: json("score_breakdown").notNull(),
  // Decision
  decision: mysqlEnum("decision", ["approve", "reject", "manual_promote", "manual_reject", "expire"]).notNull(),
  decisionReason: text("decision_reason"),
  // Destination
  promotedSignalId: varchar("promoted_signal_id", { length: 64 }),
  stagingId: int("staging_id"),
  // Actor (null = automated, non-null = admin action)
  actor: varchar("actor", { length: 256 }),
  // Timestamps
  decidedAt: bigint("decided_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [
  index("idx_tgl_decision").on(t.decision),
  index("idx_tgl_fingerprint").on(t.signalFingerprint),
  index("idx_tgl_decided").on(t.decidedAt),
  index("idx_tgl_dataset").on(t.datasetId),
]);
export type SunamGateLog = typeof sunamGateLog.$inferSelect;

// ─── Sunam Thresholds: admin-configurable scoring weights and pass thresholds ───
export const sunamThresholds = mysqlTable("sunam_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  thresholdName: varchar("threshold_name", { length: 128 }).notNull().unique(),
  description: text("description"),
  // Scoring weights (sum to 1.0)
  weightConfidence: decimal("weight_confidence", { precision: 5, scale: 4 }).notNull().default("0.3000"),
  weightEvidenceStrength: decimal("weight_evidence_strength", { precision: 5, scale: 4 }).notNull().default("0.2500"),
  weightCorroboration: decimal("weight_corroboration", { precision: 5, scale: 4 }).notNull().default("0.2000"),
  weightTemporalDensity: decimal("weight_temporal_density", { precision: 5, scale: 4 }).notNull().default("0.1500"),
  weightGeographicScope: decimal("weight_geographic_scope", { precision: 5, scale: 4 }).notNull().default("0.1000"),
  // Pass threshold
  passThreshold: decimal("pass_threshold", { precision: 10, scale: 4 }).notNull().default("0.5000"),
  // Applies to
  appliesToSignalType: varchar("applies_to_signal_type", { length: 128 }),
  appliesToDataset: varchar("applies_to_dataset", { length: 128 }),
  // Status
  isActive: tinyint("is_active").notNull().default(1),
  // Audit
  createdBy: varchar("created_by", { length: 256 }),
  updatedBy: varchar("updated_by", { length: 256 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => [
  index("idx_tt_active").on(t.isActive),
  index("idx_tt_signal_type").on(t.appliesToSignalType),
]);
export type SunamThreshold = typeof sunamThresholds.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE LOGGING SYSTEM (Constitutional Enforcement Layer)
// ═══════════════════════════════════════════════════════════════════════════════
// Non-negotiable rules:
// 1. No UPDATE or DELETE on governance_log — append-only
// 2. No governed write without a log entry in the same transaction
// 3. If log write fails → entire operation fails
// 4. All events require meaningful rationale
// 5. Hash chain must be deterministic and verifiable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Governance Event Types — every type of system change that must be logged
 */
export const GOVERNANCE_EVENT_TYPES = [
  // Structural changes
  "gap_standard_version",       // Gap Standard version change
  "constitution_version",       // Constitution version change
  "signal_taxonomy_update",     // Signal taxonomy modification
  // Control changes
  "threshold_update",           // Any threshold value change (Sunam, escalation, pattern, etc.)
  "confidence_logic_change",    // Confidence model or weighting change
  "category_reclassification",  // Gap or signal category change
  // Runtime overrides
  "signal_suppression",         // Signal suppressed or removed
  "signal_restoration",         // Suppressed signal restored
  "action_reassignment",        // Action routing changed
  "gap_reclassification",       // Gap type/severity changed
  // Engine changes
  "engine_activation",          // Engine enabled
  "engine_deactivation",        // Engine disabled
  "engine_config_change",       // Engine configuration modified
  // Data governance
  "data_stream_activation",     // Data stream enabled
  "data_stream_deactivation",   // Data stream disabled
  "data_stream_created",        // New data stream registered
  "data_stream_deleted",        // Data stream removed
  "data_stream_config_changed", // Data stream configuration modified
  "population_rule_change",     // Population engine rule modified
  // Strategy changes
  "strategy_path_updated",      // Strategy path status changed
  // Pattern governance
  "pattern_candidate_status_changed", // Pattern candidate promoted/rejected/dormant
  "pattern_strategy_boost",     // Pattern analysis updated strategy path confidence
] as const;

export type GovernanceEventType = typeof GOVERNANCE_EVENT_TYPES[number];

/**
 * Governance Log — append-only, immutable, hash-chained
 * 
 * Every governed system change MUST have a corresponding entry.
 * No entry may be updated or deleted.
 * Each entry's hash links to the previous entry, forming a verifiable chain.
 */
export const governanceLog = mysqlTable("governance_log", {
  id: int("id").autoincrement().primaryKey(),
  seqNo: bigint("seq_no", { mode: "number" }).notNull().unique(),
  
  // Event classification
  eventType: varchar("event_type", { length: 64 }).notNull(),
  component: varchar("component", { length: 128 }).notNull(),     // e.g., "sunam_thresholds", "escalation_thresholds", "pattern_decay_rules"
  scope: varchar("scope", { length: 256 }),                        // e.g., "signal_type:wage_theft", "pattern_type:entity_recurrence"
  
  // Before/after state (canonical JSON)
  previousState: mediumtext("previous_state"),                     // canonical JSON of previous state (null for creation)
  newState: mediumtext("new_state").notNull(),                     // canonical JSON of new state
  
  // Rationale (required, enforced — no empty strings)
  rationale: text("rationale").notNull(),
  
  // Actor (hashed for privacy, traceable for audit)
  actorHash: varchar("actor_hash", { length: 64 }).notNull(),     // SHA-256 of actor identity
  actorRole: varchar("actor_role", { length: 32 }).notNull(),     // "admin", "system", "engine"
  
  // Hash chain
  previousHash: varchar("previous_hash", { length: 64 }).notNull(), // SHA-256 of previous entry (genesis = "0".repeat(64))
  entryHash: varchar("entry_hash", { length: 64 }).notNull(),       // SHA-256 of this entry's canonical content + previous_hash
  
  // Timestamp
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_gov_log_event_type").on(table.eventType),
  index("idx_gov_log_component").on(table.component),
  index("idx_gov_log_created").on(table.createdAt),
  index("idx_gov_log_actor").on(table.actorHash),
  index("idx_gov_log_seq").on(table.seqNo),
]);

export type GovernanceLogEntry = typeof governanceLog.$inferSelect;
export type InsertGovernanceLogEntry = typeof governanceLog.$inferInsert;

/**
 * Governance Snapshots — periodic cryptographic signing of the log chain
 * 
 * A background process periodically computes a hash of the entire chain
 * up to a certain sequence number and signs it with a system private key.
 * External parties can verify the chain by recomputing and comparing.
 */
export const governanceSnapshots = mysqlTable("governance_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  
  // Snapshot scope
  snapshotAt: bigint("snapshot_at", { mode: "number" }).notNull(),
  upToSeqNo: bigint("up_to_seq_no", { mode: "number" }).notNull(),
  
  // Chain verification
  hashChainRoot: varchar("hash_chain_root", { length: 128 }).notNull(), // hash of the chain up to seq_no
  entryCount: int("entry_count").notNull(),                              // total entries in snapshot
  
  // Cryptographic signature
  signature: text("signature").notNull(),                                // detached Ed25519 signature
  signedBy: varchar("signed_by", { length: 64 }).notNull(),             // key identifier / fingerprint
  signatureAlgorithm: varchar("signature_algorithm", { length: 32 }).notNull().default("Ed25519"),
  
  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_gov_snap_seq").on(table.upToSeqNo),
  index("idx_gov_snap_created").on(table.createdAt),
]);

export type GovernanceSnapshot = typeof governanceSnapshots.$inferSelect;
export type InsertGovernanceSnapshot = typeof governanceSnapshots.$inferInsert;

/**
 * Session Log — Continuous execution loop between Tsunam and Manus
 * 
 * Every session:
 * - Starts from a verified governance state (governance_anchor)
 * - Records all actions taken
 * - Captures resulting governance entries as a seq_no range
 * - Produces a structured handoff for the next session
 * 
 * Enables traceability: session → action → governance log entry → verification
 */
export const sessionLog = mysqlTable("session_log", {
  id: int("id").autoincrement().primaryKey(),
  
  // Session identity
  sessionId: varchar("session_id", { length: 36 }).notNull().unique(), // UUID
  
  // Timing
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }), // null if still running
  
  // Actor type
  actorType: varchar("actor_type", { length: 20 }).notNull(), // "tsunam" | "manus"
  
  // Governance anchor — the verified seq_no this session started from
  governanceAnchor: int("governance_anchor").notNull(), // last_verified_seq_no at session start
  
  // Actions and results
  actionsTaken: json("actions_taken").$type<Array<{
    action: string;
    input: Record<string, unknown>;
    timestamp: number;
  }>>().notNull().default([]),
  
  results: json("results").$type<Record<string, unknown>>().notNull().default({}),
  
  // Governance entries produced by this session
  // Range: [start_seq_no, end_seq_no] inclusive
  // Enables verification: all entries in this range were created by this session
  governanceEntriesStart: int("governance_entries_start"), // null if no entries created
  governanceEntriesEnd: int("governance_entries_end"),     // null if no entries created
  
  // Next actions for the following session
  nextActions: json("next_actions").$type<Array<{
    action: string;
    description: string;
    inputs?: Record<string, unknown>;
  }>>().notNull().default([]),
  
  // State snapshot at end of session
  stateSnapshot: json("state_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  
  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_session_id").on(table.sessionId),
  index("idx_session_actor").on(table.actorType),
  index("idx_session_anchor").on(table.governanceAnchor),
  index("idx_session_created").on(table.createdAt),
  index("idx_session_gov_range").on(table.governanceEntriesStart, table.governanceEntriesEnd),
]);

export type SessionLog = typeof sessionLog.$inferSelect;
export type InsertSessionLog = typeof sessionLog.$inferInsert;

/**
 * Handoff types for session communication
 */
export type TsunamHandoff = {
  sessionId: string;
  actionsTaken: Array<{
    action: string;
    input: Record<string, unknown>;
    timestamp: number;
  }>;
  results: Record<string, unknown>;
  governanceEntries: [number, number] | null; // [start_seq_no, end_seq_no] or null if no entries
  state: Record<string, unknown>;
  nextActions: Array<{
    action: string;
    description: string;
    inputs?: Record<string, unknown>;
  }>;
};

export type ManusHandoff = {
  sessionId: string;
  objective: string;
  scope: string[];
  constraints: Record<string, unknown>;
  executionSteps: Array<{
    step: number;
    action: string;
    inputs: Record<string, unknown>;
    expectedOutcome: string;
  }>;
  successCriteria: string[];
};


// ─── Chain Verification Log: audit trail of governance chain verification runs ───
export const chainVerificationLog = mysqlTable("chain_verification_log", {
  id: int("id").autoincrement().primaryKey(),
  runAt: bigint("run_at", { mode: "number" }).notNull(),
  valid: boolean("valid").notNull(),
  totalEntries: int("total_entries").notNull(),
  lastValidSeqNo: int("last_valid_seq_no").notNull(),
  breakPoint: json("break_point").$type<{
    seqNo: number;
    expectedHash: string;
    actualHash: string;
    reason: string;
  } | null>().default(null),
  durationMs: int("duration_ms").notNull(),
}, (table) => [
  index("idx_verification_run_at").on(table.runAt),
  index("idx_verification_valid").on(table.valid),
]);

export type ChainVerificationLog = typeof chainVerificationLog.$inferSelect;
export type InsertChainVerificationLog = typeof chainVerificationLog.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM CONTROL REFERENCES (Architecture & Governance)
// ═══════════════════════════════════════════════════════════════════════════════
// Control references define system behavior and prevent architectural drift.
// These are NOT documentation — they are binding references for system design.
// ═══════════════════════════════════════════════════════════════════════════════

export const systemReferences = mysqlTable("system_references", {
  id: int("id").autoincrement().primaryKey(),
  
  // Reference identity
  slug: varchar("slug", { length: 256 }).notNull().unique(), // e.g., "signal-flow-engine-1.0"
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 128 }).notNull(), // e.g., "architecture", "governance", "control"
  subcategory: varchar("subcategory", { length: 128 }), // e.g., "signal-systems", "data-flow"
  
  // Content
  htmlContent: mediumtext("html_content").notNull(), // Full HTML rendering
  plainTextSummary: text("plain_text_summary"), // Plain text summary for search/display
  
  // Purpose and scope
  purpose: text("purpose"), // Why this reference exists
  scope: text("scope"), // What this reference governs
  applicability: text("applicability"), // When/where this applies
  
  // Governance
  version: varchar("version", { length: 32 }).notNull().default("1.0"),
  status: mysqlEnum("status", ["active", "archived", "deprecated"]).default("active").notNull(),
  requiresApprovalForChange: tinyint("requires_approval_for_change").notNull().default(1),
  
  // Audit
  createdBy: varchar("created_by", { length: 256 }).notNull(), // admin ID or system
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedBy: varchar("updated_by", { length: 256 }),
  updatedAt: bigint("updated_at", { mode: "number" }),
  
  // Linked governance entry (if this reference was changed via governance log)
  linkedGovernanceEntryId: int("linked_governance_entry_id"),
}, (table) => [
  index("idx_ref_slug").on(table.slug),
  index("idx_ref_category").on(table.category),
  index("idx_ref_subcategory").on(table.subcategory),
  index("idx_ref_status").on(table.status),
  index("idx_ref_created").on(table.createdAt),
]);

export type SystemReference = typeof systemReferences.$inferSelect;
export type InsertSystemReference = typeof systemReferences.$inferInsert;

// ─── Reference Change History: track all modifications to control references ───
export const referenceChangeHistory = mysqlTable("reference_change_history", {
  id: int("id").autoincrement().primaryKey(),
  
  // Reference being changed
  referenceId: int("reference_id").notNull(),
  
  // Change details
  changeType: varchar("change_type", { length: 32 }).notNull(), // "created", "updated", "archived", "restored"
  previousContent: mediumtext("previous_content"), // null for creation
  newContent: mediumtext("new_content").notNull(),
  
  // Rationale
  rationale: text("rationale").notNull(),
  
  // Actor
  changedBy: varchar("changed_by", { length: 256 }).notNull(),
  
  // Governance link
  governanceEntryId: int("governance_entry_id"), // Link to governance_log if change was governed
  
  // Timestamp
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ref_history_ref").on(table.referenceId),
  index("idx_ref_history_type").on(table.changeType),
  index("idx_ref_history_created").on(table.createdAt),
]);

export type ReferenceChangeHistory = typeof referenceChangeHistory.$inferSelect;
export type InsertReferenceChangeHistory = typeof referenceChangeHistory.$inferInsert;

// ─── Pattern Outputs: clustered signal patterns ───
export const patternOutputs = mysqlTable("pattern_outputs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Cluster identification
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Pattern composition
  signalCount: int("signal_count").notNull(),
  signalTypes: json("signal_types").notNull().$type<string[]>(),
  
  // Severity assessment
  severity: mysqlEnum("severity", ["low", "medium", "high"]).notNull(),
  
  // Quarantine
  isQuarantined: tinyint("is_quarantined").notNull().default(0),
  quarantineReason: varchar("quarantine_reason", { length: 100 }),

  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_pattern_cluster").on(table.clusterId),
  index("idx_pattern_severity").on(table.severity),
  index("idx_pattern_created").on(table.createdAt),
]);

export type PatternOutput = typeof patternOutputs.$inferSelect;
export type InsertPatternOutput = typeof patternOutputs.$inferInsert;

// ─── Strategy Outputs: generated strategies from patterns ───
export const strategyOutputs = mysqlTable("strategy_outputs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Link to pattern cluster
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Strategy definition
  strategyType: mysqlEnum("strategy_type", ["escalate", "monitor", "log"]).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  priority: int("priority").notNull(),
  
  // Quarantine
  isQuarantined: tinyint("is_quarantined").notNull().default(0),
  quarantineReason: varchar("quarantine_reason", { length: 100 }),

  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_strategy_cluster").on(table.clusterId),
  index("idx_strategy_type").on(table.strategyType),
  index("idx_strategy_priority").on(table.priority),
  index("idx_strategy_created").on(table.createdAt),
]);

export type StrategyOutput = typeof strategyOutputs.$inferSelect;
export type InsertStrategyOutput = typeof strategyOutputs.$inferInsert;

// ─── Procedural Outputs: generated procedures from strategies ───
export const proceduralOutputs = mysqlTable("procedural_outputs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Link to strategy cluster
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Procedure definition
  procedureType: mysqlEnum("procedure_type", ["alert", "track", "record"]).notNull(),
  steps: json("steps").notNull().$type<string[]>(),
  
  // Quarantine
  isQuarantined: tinyint("is_quarantined").notNull().default(0),
  quarantineReason: varchar("quarantine_reason", { length: 100 }),

  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_procedural_cluster").on(table.clusterId),
  index("idx_procedural_type").on(table.procedureType),
  index("idx_procedural_created").on(table.createdAt),
]);

export type ProceduralOutput = typeof proceduralOutputs.$inferSelect;
export type InsertProceduralOutput = typeof proceduralOutputs.$inferInsert;

// ─── Activation Outputs: triggerable activation records ───
export const activationOutputs = mysqlTable("activation_outputs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Link to procedural cluster
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Activation definition
  procedureType: mysqlEnum("procedure_type", ["alert", "track", "record"]).notNull(),
  steps: json("steps").notNull().$type<string[]>(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed"]).default("pending").notNull(),

  // Quarantine
  isQuarantined: tinyint("is_quarantined").notNull().default(0),
  quarantineReason: varchar("quarantine_reason", { length: 100 }),
  
  // Metadata
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_activation_cluster").on(table.clusterId),
  index("idx_activation_status").on(table.status),
  index("idx_activation_created").on(table.createdAt),
]);

export type ActivationOutput = typeof activationOutputs.$inferSelect;
export type InsertActivationOutput = typeof activationOutputs.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// ─── LEGAL REGISTRY TABLES (PHASE 2: Forms, Agencies, Escalation Paths) ───
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Forms Registry ───
// Centralized registry of all complaint forms, applications, and legal documents
export const formsRegistry = mysqlTable("forms_registry", {
  id: varchar("id", { length: 128 }).primaryKey(),
  formName: varchar("formName", { length: 256 }).notNull(),
  agencyId: varchar("agencyId", { length: 128 }).notNull(),
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
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
  url: text("url").notNull(),
  accessMethods: json("accessMethods").notNull().$type<("web" | "phone" | "mail" | "walk_in" | "email")[]>(),
  filingDeadline: text("filingDeadline"),
  requiredFields: json("requiredFields").$type<string[]>(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  lastVerified: varchar("lastVerified", { length: 10 }).notNull(),
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
export const agenciesRegistry = mysqlTable("agencies_registry", {
  id: varchar("id", { length: 128 }).primaryKey(),
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
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
  website: text("website"),
  contactMethods: json("contactMethods").notNull().$type<{
    phone?: string;
    web?: string;
    mail?: string;
    email?: string;
    walk_in?: string;
  }>(),
  officialStatus: mysqlEnum("officialStatus", ["active", "inactive", "merged", "unknown"]).default("active").notNull(),
  notes: text("notes"),
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
export const escalationRegistry = mysqlTable("escalation_registry", {
  id: varchar("id", { length: 128 }).primaryKey(),
  fromAgencyId: varchar("fromAgencyId", { length: 128 }).notNull(),
  toAgencyId: varchar("toAgencyId", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
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
  triggerCondition: text("triggerCondition").notNull(),
  pathwayDescription: text("pathwayDescription").notNull(),
  timeline: text("timeline"),
  simultaneousFiling: boolean("simultaneousFiling").default(false),
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

// ─── Mental Health Resources (MH Registry) ───
export const mentalHealthResources = mysqlTable("mental_health_resources", {
  id: varchar("id", { length: 128 }).primaryKey(),
  resourceName: varchar("resourceName", { length: 256 }).notNull(),
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
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
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
  populationServed: json("populationServed").$type<string[]>(),
  servicesProvided: json("servicesProvided").$type<string[]>(),
  eligibility: text("eligibility"),
  cost: text("cost"),
  languages: json("languages").$type<string[]>(),
  sourceUrl: text("sourceUrl"),
  lastVerified: varchar("lastVerified", { length: 10 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_mh_type").on(table.resourceType),
  index("idx_mh_jurisdiction").on(table.jurisdiction),
]);

export type MentalHealthResources = typeof mentalHealthResources.$inferSelect;
export type InsertMentalHealthResources = typeof mentalHealthResources.$inferInsert;

// ─── Business Analytics: Baseline metrics for anomaly detection ───
export const businessBaselines = mysqlTable("business_baselines", {
  id: int("id").autoincrement().primaryKey(),
  entityType: mysqlEnum("entity_type", ["product", "expense_category"]).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  avgAmount: decimal("avg_amount", { precision: 10, scale: 2 }).notNull(),
  stddevAmount: decimal("stddev_amount", { precision: 10, scale: 2 }),
  sampleCount: int("sample_count").notNull(),
  lastUpdated: bigint("last_updated", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_entity_type_id").on(table.entityType, table.entityId),
  index("idx_entity_type").on(table.entityType),
]);

export type BusinessBaseline = typeof businessBaselines.$inferSelect;
export type InsertBusinessBaseline = typeof businessBaselines.$inferInsert;


// ═══════════════════════════════════════════════════════════════════
// ─── LUMINARI REGISTRY: Canonical Jurisdiction + Program Registry ─
// ═══════════════════════════════════════════════════════════════════

export const registryJurisdictions = mysqlTable("registry_jurisdictions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: text("name"),
  abbreviation: text("abbreviation"),
  fips: text("fips"),
  type: text("type_rj"),
  population: text("population_rj"),
  medicaidStatus: text("medicaid_status"),
  minimumWage: text("minimum_wage"),
  uiMax: text("ui_max"),
  wageSol: text("wage_sol"),
  civilRightsSol: text("civil_rights_sol"),
  createdAt: bigint("created_at_rj", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});
export type RegistryJurisdiction = typeof registryJurisdictions.$inferSelect;
export type InsertRegistryJurisdiction = typeof registryJurisdictions.$inferInsert;

export const registryPolicyAlerts = mysqlTable("registry_policy_alerts", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rpa", { length: 128 }).notNull(),
  severity: text("severity_rpa"),
  title: text("title_rpa"),
  description: text("description_rpa"),
  createdAt: bigint("created_at_rpa", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rpa_jurisdiction").on(table.jurisdictionId),
]);
export type RegistryPolicyAlert = typeof registryPolicyAlerts.$inferSelect;
export type InsertRegistryPolicyAlert = typeof registryPolicyAlerts.$inferInsert;

export const registryPrograms = mysqlTable("registry_programs", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rp", { length: 128 }).notNull(),
  category: text("category_rp"),
  name: text("name_rp"),
  agency: text("agency_rp"),
  eligibility: text("eligibility_rp"),
  contact: text("contact_rp"),
  website: text("website_rp"),
  applyNotes: text("apply_notes_rp"),
  fingerprint: varchar("fingerprint_rp", { length: 128 }),
  createdAt: bigint("created_at_rp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rp_jurisdiction").on(table.jurisdictionId),
  index("idx_rp_fingerprint").on(table.fingerprint),
]);
export type RegistryProgram = typeof registryPrograms.$inferSelect;
export type InsertRegistryProgram = typeof registryPrograms.$inferInsert;

export const registryWorkflows = mysqlTable("registry_workflows", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rw", { length: 128 }).notNull(),
  workflowType: text("workflow_type_rw"),
  primaryStatutes: text("primary_statutes_rw"),
  steps: json("steps_rw").$type<any[]>(),
  deadlines: text("deadlines_rw"),
  escalationPaths: text("escalation_paths_rw"),
  createdAt: bigint("created_at_rw", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rw_jurisdiction").on(table.jurisdictionId),
]);
export type RegistryWorkflow = typeof registryWorkflows.$inferSelect;
export type InsertRegistryWorkflow = typeof registryWorkflows.$inferInsert;

export const registryOversightBodies = mysqlTable("registry_oversight_bodies", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rob", { length: 128 }).notNull(),
  agencyName: text("agency_name_rob"),
  function: text("function_rob"),
  statuteOfLimitations: text("statute_of_limitations_rob"),
  contact: text("contact_rob"),
  pathway: text("pathway_rob"),
  escalation: text("escalation_rob"),
  createdAt: bigint("created_at_rob", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rob_jurisdiction").on(table.jurisdictionId),
]);
export type RegistryOversightBody = typeof registryOversightBodies.$inferSelect;
export type InsertRegistryOversightBody = typeof registryOversightBodies.$inferInsert;

export const registrySourceTraceability = mysqlTable("registry_source_traceability", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rst", { length: 128 }).notNull(),
  sourceDocuments: json("source_documents_rst").$type<string[]>(),
  sourceVariants: json("source_variants_rst").$type<string[]>(),
  notesOnMerge: text("notes_on_merge_rst"),
  conflicts: json("conflicts_rst").$type<any[]>(),
  createdAt: bigint("created_at_rst", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rst_jurisdiction").on(table.jurisdictionId),
]);
export type RegistrySourceTraceability = typeof registrySourceTraceability.$inferSelect;
export type InsertRegistrySourceTraceability = typeof registrySourceTraceability.$inferInsert;

export const registrySignals = mysqlTable("registry_signals", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rs", { length: 128 }).notNull(),
  category: text("category_rs"),
  signalType: text("signal_type_rs"),
  severity: text("severity_rs"),
  sourceReference: text("source_reference_rs"),
  fingerprint: varchar("fingerprint_rs", { length: 128 }),
  createdAt: bigint("created_at_rs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rs_jurisdiction").on(table.jurisdictionId),
  index("idx_rs_signal_type").on(table.signalType),
  index("idx_rs_fingerprint").on(table.fingerprint),
]);
export type RegistrySignal = typeof registrySignals.$inferSelect;
export type InsertRegistrySignal = typeof registrySignals.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// METADATA CONDUIT — Structural metadata layer for governance + traceability
// ═══════════════════════════════════════════════════════════════════════════

// ─── Table Registry: every table in the system, tracked ───
export const tableRegistry = mysqlTable("table_registry", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("tableName", { length: 128 }).notNull().unique(),
  category: varchar("category", { length: 64 }).notNull(), // e.g. "core", "engine", "registry", "backbone", "conduit"
  description: text("description"),
  rowCount: int("rowCount").default(0),
  columnCount: int("columnCount").default(0),
  lastScannedAt: bigint("lastScannedAt", { mode: "number" }),
  status: varchar("status", { length: 32 }).default("active"), // active, deprecated, empty
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_tr_category").on(table.category),
  index("idx_tr_status").on(table.status),
]);
export type TableRegistry = typeof tableRegistry.$inferSelect;
export type InsertTableRegistry = typeof tableRegistry.$inferInsert;

// ─── Field Dictionary: every column in every table ───
export const fieldDictionary = mysqlTable("field_dictionary", {
  id: int("id").autoincrement().primaryKey(),
  tableId: int("table_id").notNull(),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  fieldType: varchar("fieldType", { length: 64 }).notNull(),
  isNullable: tinyint("isNullable").default(1),
  isPrimaryKey: tinyint("isPrimaryKey").default(0),
  isIndexed: tinyint("isIndexed").default(0),
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_fd_table").on(table.tableId),
]);
export type FieldDictionary = typeof fieldDictionary.$inferSelect;
export type InsertFieldDictionary = typeof fieldDictionary.$inferInsert;

// ─── Relation Catalog: foreign key and logical relationships between tables ───
export const relationCatalog = mysqlTable("relation_catalog", {
  id: int("id").autoincrement().primaryKey(),
  sourceTableId: int("source_table_id").notNull(),
  sourceField: varchar("source_field", { length: 128 }).notNull(),
  targetTableId: int("target_table_id").notNull(),
  targetField: varchar("target_field", { length: 128 }).notNull(),
  relationType: varchar("relation_type", { length: 32 }).notNull(), // "fk", "logical", "backbone"
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rc_source").on(table.sourceTableId),
  index("idx_rc_target").on(table.targetTableId),
]);
export type RelationCatalog = typeof relationCatalog.$inferSelect;
export type InsertRelationCatalog = typeof relationCatalog.$inferInsert;

// ─── Pipeline Map: registered data pipelines and their stages ───
export const pipelineMap = mysqlTable("pipeline_map", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: varchar("pipeline_id", { length: 128 }).notNull().unique(),
  pipelineName: varchar("pipeline_name", { length: 256 }).notNull(),
  stages: json("stages"), // ordered array of stage descriptors
  inputTables: json("input_tables"), // string[]
  outputTables: json("output_tables"), // string[]
  engineId: varchar("engine_id", { length: 128 }),
  status: varchar("status", { length: 32 }).default("active"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pm_engine").on(table.engineId),
  index("idx_pm_status").on(table.status),
]);
export type PipelineMap = typeof pipelineMap.$inferSelect;
export type InsertPipelineMap = typeof pipelineMap.$inferInsert;

// ─── Transform Profiles: data transformation rules applied by engines ───
export const transformProfiles = mysqlTable("transform_profiles", {
  id: int("id").autoincrement().primaryKey(),
  profileName: varchar("profile_name", { length: 256 }).notNull(),
  engineId: varchar("engine_id", { length: 128 }),
  pipelineId: varchar("pipeline_id", { length: 128 }),
  inputSchema: json("input_schema"), // field descriptors
  outputSchema: json("output_schema"), // field descriptors
  transformRules: json("transform_rules"), // transformation logic descriptors
  version: varchar("version", { length: 32 }).default("1.0.0"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_tp_engine").on(table.engineId),
  index("idx_tp_pipeline").on(table.pipelineId),
]);
export type TransformProfile = typeof transformProfiles.$inferSelect;
export type InsertTransformProfile = typeof transformProfiles.$inferInsert;

// ─── Conduit Events: governance event log for all pipeline/engine activity ───
export const conduitEvents = mysqlTable("conduit_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(), // ENGINE_RUN, ALPHA_EXPORT, SCHEMA_SCAN, DRIFT_DETECTED, SNAPSHOT_BOUND
  pipelineId: varchar("pipeline_id", { length: 128 }),
  engineId: varchar("engine_id", { length: 128 }),
  runId: varchar("run_id", { length: 128 }),
  snapshotId: int("snapshot_id"),
  metadata: json("metadata"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ce_type").on(table.eventType),
  index("idx_ce_pipeline").on(table.pipelineId),
  index("idx_ce_engine").on(table.engineId),
  index("idx_ce_snapshot").on(table.snapshotId),
]);
export type ConduitEvent = typeof conduitEvents.$inferSelect;
export type InsertConduitEvent = typeof conduitEvents.$inferInsert;

// ─── Alpha Lake Exports: governed output terminal ───
export const alphaLakeExports = mysqlTable("alpha_lake_exports", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshot_id").notNull(),
  exportType: varchar("export_type", { length: 64 }).notNull(), // "full", "partial", "delta"
  engineRunIds: json("engine_run_ids"), // string[] of run_ids included
  outputPayload: json("output_payload"), // assembled document
  status: varchar("status", { length: 32 }).default("completed"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ale_snapshot").on(table.snapshotId),
  index("idx_ale_type").on(table.exportType),
]);
export type AlphaLakeExport = typeof alphaLakeExports.$inferSelect;
export type InsertAlphaLakeExport = typeof alphaLakeExports.$inferInsert;


// ─── Enforcement Action Paths: structured filing paths per claim type ───
// Bridges the gap between intake (claim identification) and action (filing)
export const enforcementActionPaths = mysqlTable("enforcement_action_paths", {
  id: int("id").autoincrement().primaryKey(),
  // Which pipeline/claim type this path applies to
  pipelineType: varchar("pipelineType", { length: 128 }).notNull(),
  // Human-readable claim label (e.g., "Housing Benefits Denial")
  claimLabel: varchar("claimLabel", { length: 256 }).notNull(),
  // Jurisdiction: "federal", state code, or "all"
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull().default("federal"),
  // Priority order when multiple paths exist for same pipelineType
  priority: int("priority").notNull().default(1),
  // ─── Agency Info ───
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  agencyAcronym: varchar("agencyAcronym", { length: 32 }),
  agencyDescription: text("agencyDescription"),
  agencyPhone: varchar("agencyPhone", { length: 64 }),
  agencyWebsite: text("agencyWebsite"),
  agencyEmail: varchar("agencyEmail", { length: 256 }),
  agencyAddress: text("agencyAddress"),
  // ─── Filing Info ───
  formName: varchar("formName", { length: 256 }),
  formNumber: varchar("formNumber", { length: 64 }),
  formUrl: text("formUrl"),
  formDescription: text("formDescription"),
  // ─── Submission Method ───
  submissionMethods: json("submissionMethods").$type<Array<{
    method: "online" | "phone" | "mail" | "email" | "in_person";
    details: string;
    url?: string;
    preferred?: boolean;
  }>>(),
  // ─── Timeline ───
  filingDeadlineDays: int("filingDeadlineDays"),
  filingDeadlineDescription: text("filingDeadlineDescription"),
  expectedResponseDays: int("expectedResponseDays"),
  expectedResponseDescription: text("expectedResponseDescription"),
  investigationTimelineDays: int("investigationTimelineDays"),
  investigationTimelineDescription: text("investigationTimelineDescription"),
  // ─── Steps ───
  steps: json("steps").$type<Array<{
    order: number;
    title: string;
    description: string;
    actionType: "prepare" | "file" | "wait" | "respond" | "escalate";
    tips?: string[];
  }>>(),
  // ─── Escalation ───
  escalationPaths: json("escalationPaths").$type<Array<{
    condition: string;
    action: string;
    agencyName?: string;
    contactInfo?: string;
    deadline?: string;
  }>>(),
  // ─── Legal References ───
  primaryStatuteCitation: varchar("primaryStatuteCitation", { length: 256 }),
  primaryStatuteTitle: varchar("primaryStatuteTitle", { length: 512 }),
  relatedStatutes: json("relatedStatutes").$type<Array<{
    citation: string;
    title: string;
    relevance: string;
  }>>(),
  // ─── What to Expect ───
  possibleOutcomes: json("possibleOutcomes").$type<Array<{
    outcome: string;
    description: string;
    likelihood?: "common" | "possible" | "rare";
  }>>(),
  // ─── Practical Tips ───
  documentsNeeded: json("documentsNeeded").$type<string[]>(),
  commonMistakes: json("commonMistakes").$type<string[]>(),
  practicalTips: json("practicalTips").$type<string[]>(),
  // ─── Metadata ───
  isActive: boolean("isActive").notNull().default(true),
  lastVerifiedAt: bigint("lastVerifiedAt", { mode: "number" }),
  dataSource: varchar("dataSource", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_eap_pipeline").on(table.pipelineType),
  index("idx_eap_jurisdiction").on(table.jurisdiction),
  index("idx_eap_active").on(table.isActive),
]);
export type EnforcementActionPath = typeof enforcementActionPaths.$inferSelect;
export type InsertEnforcementActionPath = typeof enforcementActionPaths.$inferInsert;


// ─── Unified Resources: single normalized table for all support resources ───
// No soul left behind — every resource in one queryable surface
export const unifiedResources = mysqlTable("unified_resources", {
  id: int("id").autoincrement().primaryKey(),
  // ─── Identity ───
  sourceTable: varchar("sourceTable", { length: 64 }).notNull(), // registry_programs, enforcement_action_paths, legal_enforcement_records
  sourceId: varchar("sourceId", { length: 256 }).notNull(), // original row ID
  name: varchar("name", { length: 512 }).notNull(),
  description: text("description"),
  // ─── Resource Classification ───
  resourceType: varchar("resourceType", { length: 64 }).notNull(), // government_program, nonprofit, legal_aid, enforcement_path, hotline, online_tool, enforcement_record, grant
  // ─── Tagging: Domain + Need ───
  domain: varchar("domain", { length: 64 }).notNull(), // housing, employment, benefits, healthcare, family, etc.
  needTypes: json("needTypes").$type<string[]>().notNull(), // rent_assistance, legal_representation, filing_help, food, utilities, etc.
  urgencyLevel: varchar("urgencyLevel", { length: 16 }).notNull().default("standard"), // crisis, urgent, standard, informational
  // ─── Location / Jurisdiction ───
  jurisdictionId: varchar("jurisdictionId", { length: 64 }), // j_alaska, j_federal, etc.
  jurisdictionType: varchar("jurisdictionType", { length: 16 }).notNull().default("federal"), // federal, state, tribal, county, city
  stateCode: varchar("stateCode", { length: 8 }), // AL, AK, etc. — null for federal
  // ─── Contact Info ───
  phone: varchar("phone", { length: 128 }),
  website: text("website"),
  email: varchar("email", { length: 256 }),
  address: text("address"),
  // ─── Eligibility ───
  hardEligibility: json("hardEligibility").$type<Array<{
    gate: string; // jurisdiction, income_threshold, citizenship, age, disability_status
    operator: "eq" | "in" | "lt" | "gt" | "exists";
    value: string | string[] | number;
    description: string;
  }>>(),
  softSignals: json("softSignals").$type<Array<{
    signal: string; // domain_match, need_overlap, population_served, program_type
    weight: number; // 0.0 - 1.0
    matchValues: string[];
    description: string;
  }>>(),
  // ─── Pipeline Mapping ───
  matchingPipelineTypes: json("matchingPipelineTypes").$type<string[]>().notNull(), // which intake pipeline types this resource matches
  // ─── Freshness & Verification ───
  lastVerifiedAt: bigint("lastVerifiedAt", { mode: "number" }),
  isActive: boolean("isActive").notNull().default(true),
  verificationStatus: varchar("verificationStatus", { length: 16 }).notNull().default("unverified"), // verified | unverified | flagged
  flaggedReason: text("flaggedReason"),
  verifiedBy: varchar("verifiedBy", { length: 256 }),
  // ─── Match Explanation ───
  matchExplanationTemplate: text("matchExplanationTemplate"), // "Matched because: {reasons}"
  // ─── Metadata ───
  category: varchar("category", { length: 64 }), // original category from source
  agency: varchar("agency", { length: 256 }),
  eligibilityNotes: text("eligibilityNotes"),
  applyNotes: text("applyNotes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ur_domain").on(table.domain),
  index("idx_ur_resource_type").on(table.resourceType),
  index("idx_ur_jurisdiction_type").on(table.jurisdictionType),
  index("idx_ur_state_code").on(table.stateCode),
  index("idx_ur_urgency").on(table.urgencyLevel),
  index("idx_ur_active").on(table.isActive),
  index("idx_ur_verification_status").on(table.verificationStatus),
  index("idx_ur_last_verified").on(table.lastVerifiedAt),
  index("idx_ur_source").on(table.sourceTable, table.sourceId),
]);
export type UnifiedResource = typeof unifiedResources.$inferSelect;
export type InsertUnifiedResource = typeof unifiedResources.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL SPINE — Implementation Package (Proof Stream Prep)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SIGNAL FLOW LOGS (L7): System Visibility — READ-ONLY ───
// Records the path each signal takes through the system.
// This table is APPEND-ONLY. No updates. No deletes. No upstream writes.
export const signalFlowLogs = mysqlTable("signal_flow_logs", {
  id: int("id").autoincrement().primaryKey(),
  signalId: varchar("signal_id_sfl", { length: 64 }).notNull(), // FK to detected_signals.signal_id
  vectorPath: varchar("vector_path", { length: 512 }).notNull(), // e.g. "ingested_records → live_signals → sunam_gate → detected_signals"
  flowDensity: decimal("flow_density", { precision: 8, scale: 4 }).notNull(), // signal strength at this point
  visibilityMetadata: json("visibility_metadata").$type<{
    sourceTable: string;
    sourceId: string;
    gateDecision?: string;
    engineId?: string;
    runId?: string;
    timestamp: number;
  }>().notNull(),
  processedAt: bigint("processed_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sfl_signal").on(table.signalId),
  index("idx_sfl_vector").on(table.vectorPath),
  index("idx_sfl_processed").on(table.processedAt),
]);
export type SignalFlowLog = typeof signalFlowLogs.$inferSelect;
export type InsertSignalFlowLog = typeof signalFlowLogs.$inferInsert;

// ─── WORLD NODES (L10): Sovereign Domain — Metadata Carrier ───
// Each world_node carries the L10 metadata contract.
// active_remedy = true AND valid metadata required for use as remedy target.
export const worldNodes = mysqlTable("world_nodes", {
  id: int("id").autoincrement().primaryKey(),
  biomeType: varchar("biome_type", { length: 64 }).notNull(), // jurisdiction | agency | program | community | institution
  nodeName: varchar("node_name_wn", { length: 512 }).notNull(),
  // Coordinates: stored as lat/lng since MySQL POINT requires spatial index
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  // L10 Metadata Contract — the node carries this
  metadataL10: json("metadata_l10").$type<{
    access_protocol: string;
    capacity_status: "AVAILABLE" | "LIMITED" | "FULL";
    resource_links: string[];
    valid_for: string[]; // must map to real ontology/registry term keys
  }>().notNull(),
  activeRemedy: boolean("active_remedy").notNull().default(false),
  lastVerifiedAt: bigint("last_verified_at_wn", { mode: "number" }).notNull(),
  // Governance
  createdAt: bigint("created_at_wn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_wn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_wn_biome").on(table.biomeType),
  index("idx_wn_name").on(table.nodeName),
  index("idx_wn_active").on(table.activeRemedy),
  index("idx_wn_verified").on(table.lastVerifiedAt),
]);
export type WorldNode = typeof worldNodes.$inferSelect;
export type InsertWorldNode = typeof worldNodes.$inferInsert;


// ─── Claim Validation Rules ───────────────────────────────────────────────────
// Jurisdiction-specific validation logic for each claim element
// Loaded from team JSON: 67 records across 7 claim types, 50-state + CA/TX/NY overrides
export const claimValidationRules = mysqlTable("claim_validation_rules", {
  id: int("id").primaryKey().autoincrement(),
  jurisdiction: varchar("jurisdiction", { length: 10 }).notNull(),
  claimType: varchar("claim_type", { length: 64 }).notNull(),
  elementName: varchar("element_name", { length: 128 }).notNull(),
  requiredEvidenceTypes: json("required_evidence_types").$type<string[]>().notNull(),
  validationLogic: text("validation_logic").notNull(),
  createdAt: bigint("created_at_cvr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_cvr_jurisdiction").on(table.jurisdiction),
  index("idx_cvr_claim_type").on(table.claimType),
  index("idx_cvr_element").on(table.elementName),
  uniqueIndex("idx_cvr_unique").on(table.jurisdiction, table.claimType, table.elementName),
]);
export type ClaimValidationRule = typeof claimValidationRules.$inferSelect;
export type InsertClaimValidationRule = typeof claimValidationRules.$inferInsert;

// ─── Remedy Feasibility Rules ─────────────────────────────────────────────────
// Per-jurisdiction strategy feasibility: cost, time, prerequisites, risk flags
// Loaded from team JSON: 56 records (agency_complaint strategy, all 50 states + DC + territories)
export const remedyFeasibilityRules = mysqlTable("remedy_feasibility_rules", {
  id: int("id").primaryKey().autoincrement(),
  jurisdiction: varchar("jurisdiction", { length: 10 }).notNull(),
  strategyType: varchar("strategy_type", { length: 64 }).notNull(),
  costRange: varchar("cost_range", { length: 64 }).notNull(),
  timeEstimate: varchar("time_estimate", { length: 128 }).notNull(),
  prerequisites: json("prerequisites").$type<string[]>().notNull(),
  riskFlags: json("risk_flags").$type<string[]>().notNull(),
  createdAt: bigint("created_at_rfr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rfr_jurisdiction").on(table.jurisdiction),
  index("idx_rfr_strategy").on(table.strategyType),
  uniqueIndex("idx_rfr_unique").on(table.jurisdiction, table.strategyType),
]);
export type RemedyFeasibilityRule = typeof remedyFeasibilityRules.$inferSelect;
export type InsertRemedyFeasibilityRule = typeof remedyFeasibilityRules.$inferInsert;

// ─── Case State ───────────────────────────────────────────────────────────────
// The commitment layer — everything committed to a case lands here
// Control Room reads from this table exclusively
export const caseState = mysqlTable("case_state", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("case_id").notNull(),
  userId: int("user_id").notNull(),
  proceduralPathId: int("procedural_path_id"),
  proceduralPathLabel: varchar("procedural_path_label", { length: 256 }),
  remedyStrategyId: int("remedy_strategy_id"),
  remedyStrategyLabel: varchar("remedy_strategy_label", { length: 256 }),
  claimType: varchar("claim_type_cs", { length: 64 }),
  jurisdiction: varchar("jurisdiction_cs", { length: 64 }),
  committedFindingIds: json("committed_finding_ids").$type<number[]>().notNull().default([]),
  committedBarrierIds: json("committed_barrier_ids").$type<number[]>().notNull().default([]),
  committedBenefitIds: json("committed_benefit_ids").$type<number[]>().notNull().default([]),
  committedSignalIds: json("committed_signal_ids").$type<number[]>().notNull().default([]),
  committedStatuteIds: json("committed_statute_ids").$type<number[]>().notNull().default([]),
  committedFoiaIds: json("committed_foia_ids").$type<number[]>().notNull().default([]),
  committedFilingIds: json("committed_filing_ids").$type<number[]>().notNull().default([]),
  completenessScore: int("completeness_score").notNull().default(0),
  completenessBreakdown: json("completeness_breakdown").$type<{ missing: string[]; present: string[]; score: number }>(),
  computedDeadlines: json("computed_deadlines").$type<Array<{ label: string; date: string; daysRemaining: number; critical: boolean }>>(),
  nextActions: json("next_actions").$type<Array<{ label: string; type: string; priority: number; targetPage?: string }>>(),
  createdAt: bigint("created_at_cs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_cs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_case_state_case").on(table.caseId),
  index("idx_case_state_user").on(table.userId),
]);
export type CaseState = typeof caseState.$inferSelect;
export type InsertCaseState = typeof caseState.$inferInsert;

// ─── Case Flags ───────────────────────────────────────────────────────────────
// System-generated and user-generated flags on a case
export const caseFlags = mysqlTable("case_flags", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("case_id").notNull(),
  userId: int("user_id").notNull(),
  type: mysqlEnum("flag_type", ["system", "user"]).notNull().default("user"),
  location: varchar("location", { length: 128 }).notNull(),
  targetId: int("target_id"),
  targetType: varchar("target_type", { length: 64 }),
  message: text("message").notNull(),
  status: mysqlEnum("flag_status", ["open", "resolved"]).notNull().default("open"),
  areaName: varchar("area_name", { length: 256 }),
  state: varchar("state_code", { length: 10 }),
  lat: double("lat"),
  lng: double("lng"),
  createdAt: bigint("created_at_cf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  resolvedAt: bigint("resolved_at_cf", { mode: "number" }),
}, (table) => [
  index("idx_case_flags_case").on(table.caseId),
  index("idx_case_flags_type").on(table.type),
  index("idx_case_flags_status").on(table.status),
  index("idx_case_flags_location").on(table.location),
]);
export type CaseFlag = typeof caseFlags.$inferSelect;
export type InsertCaseFlag = typeof caseFlags.$inferInsert;

// ─── FOIA Tracker ─────────────────────────────────────────────────────────────
// Full FOIA request lifecycle: draft → sent → response_received → attached_to_case
export const foiaTrackerRequests = mysqlTable("foia_tracker_requests", {
  id: int("id").primaryKey().autoincrement(),
  caseId: int("case_id"),
  userId: int("user_id").notNull(),
  agencyName: varchar("agency_name", { length: 256 }).notNull(),
  agencyAddress: text("agency_address"),
  agencyEmail: varchar("agency_email", { length: 256 }),
  requestSubject: varchar("request_subject", { length: 512 }).notNull(),
  requestBody: text("request_body").notNull(),
  requestedRecords: text("requested_records"),
  status: mysqlEnum("foia_status", ["draft", "sent", "acknowledged", "response_received", "appealed", "closed"]).notNull().default("draft"),
  sentAt: bigint("sent_at", { mode: "number" }),
  sentMethod: mysqlEnum("sent_method", ["email", "portal", "mail", "fax"]),
  sentTo: varchar("sent_to", { length: 512 }),
  acknowledgedAt: bigint("acknowledged_at", { mode: "number" }),
  responseReceivedAt: bigint("response_received_at", { mode: "number" }),
  responseNotes: text("response_notes"),
  responseDocumentUrl: varchar("response_document_url", { length: 1024 }),
  statutoryDeadlineDays: int("statutory_deadline_days").default(20),
  deadlineDate: bigint("deadline_date", { mode: "number" }),
  attachedToCaseAt: bigint("attached_to_case_at", { mode: "number" }),
  generatedLetterUrl: varchar("generated_letter_url", { length: 1024 }),
  createdAt: bigint("created_at_ftr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_ftr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_foia_tracker_case").on(table.caseId),
  index("idx_foia_tracker_user").on(table.userId),
  index("idx_foia_tracker_status").on(table.status),
]);
export type FoiaTrackerRequest = typeof foiaTrackerRequests.$inferSelect;
export type InsertFoiaTrackerRequest = typeof foiaTrackerRequests.$inferInsert;
