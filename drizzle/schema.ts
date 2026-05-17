import { sql } from "drizzle-orm";
import { pgTable, pgEnum, serial, bigserial, uuid, varchar, text, integer, bigint, boolean, jsonb, numeric, timestamp, date, doublePrecision, real, smallint, char, index, uniqueIndex } from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Auto-generated Drizzle schema for the Luminari Lighthouse Supabase Postgres DB.
// Source of truth: lighthouse_schema_grouped.json (116 Postgres tables).
// Legacy MySQL-only tables from the prior schema are retained as pgTable definitions
// so existing imports continue to compile and future migrations can create them.
// -----------------------------------------------------------------------------

export const runStatusEnum = pgEnum("run_status_enum", ["pending", "running", "completed", "failed", "cancelled"]);
export const signalSeverityEnum = pgEnum("signal_severity_enum", ["low", "medium", "high", "critical"]);
export const entryChannelEnum = pgEnum("entry_channel_enum", ["guided_intake", "map_intake", "api", "upload", "manual", "atlas"]);
export const targetDomainEnum = pgEnum("target_domain_enum", ["case_truth", "civic_resources", "legal_signals", "judicial_signals", "resource_signals"]);
export const evidenceStrengthEnum = pgEnum("evidence_strength_enum", ["weak", "medium", "strong"]);
export const artifactTypeEnum = pgEnum("artifact_type_enum", ["pdf", "docx", "json", "csv", "zip", "html", "markdown", "text"]);
export const confidenceLabelEnum = pgEnum("confidence_label_enum", ["low", "medium", "high"]);
export const recordStatusEnum = pgEnum("record_status_enum", ["received", "normalized", "processed", "failed", "rejected"]);

// ─── Users (auth - framework managed) ───


// ─── Corpus Snapshots: versioned corpus states per case (Gate 6) ───


// ─── Cases: isolated investigation workspaces ───
// Statement origin classification — determines evidentiary weight
export const STATEMENT_ORIGINS = ["sworn_testimony", "court_filing", "discovery_disclosure", "media_report", "internal_memo", "informal_communication", "unknown"] as const;
export const FINDING_ELIGIBLE_ORIGINS = ["sworn_testimony", "court_filing", "discovery_disclosure"] as const;
export type StatementOrigin = typeof STATEMENT_ORIGINS[number];


// ─── Luminari Cases: user-owned case data for Action Engine ───


// ─── Luminari Case Notes: user-owned notes ───


// ─── Luminari Case Events: action tracking ───


// ─── Luminari Case Actions: user actions taken ───


// ─── Documents: source evidence files ───


// ─── Quotes: the evidence spine — exact text excerpts with locations ───


// ─── Entities: people, organizations, locations ───


// ─── Entity Roles: what role an entity plays in a specific document ───


// ─── Relationships: connections between entities with evidence ───


// ─── Relationship Evidence: quotes that support a relationship ───


// ─── Claims: factual assertions derived from quotes ───


// ─── Findings: patterns/conclusions across multiple claims ───


// ─── Events: structured event objects from documents ───


// ─── Signal Flags: boolean indicators for key patterns ───


// ─── Document Correlations: cross-document links ───


// ─── Presentations: courtroom presentation builder ───


// ─── Presentation Slides ───


// ─── Entity Merge Suggestions: reviewable deduplication proposals ───


// ─── Audit Trail: immutable log with hash chain ───


// ─── Chat Messages: Ask the Evidence ───


// ─── Upload Sessions: persistent upload tracking (survives navigation) ───


// ─── Provenance Audit Logs: immutable record of provenance decisions ───


// ─── Batch Rerun Runs: tracks batch provenance re-run operations ───


// ─── Provenance Alert Events ───


// ─── Case Collaborators: per-case read-only or write access for authorized users ───
export const COLLABORATOR_ACCESS_LEVELS = ["READ_ONLY", "WRITE"] as const;
export type CollaboratorAccessLevel = typeof COLLABORATOR_ACCESS_LEVELS[number];


// ─── Phase-2: Read-Only Projection Layer ───

/**
 * Phase-2 Runs: derived analysis runs that consume sealed snapshots.
 * Each run is bound to a single sealed snapshot and produces derived artifacts.
 * Phase-2 never mutates Phase-1 tables.
 */


/**
 * Phase-2 Evidence Requirements: derived artifacts identifying evidentiary gaps
 * or requirements surfaced by projection analysis.
 */


/**
 * Phase-2 Structured Notes: derived artifacts containing structured analytical notes
 * produced by projection analysis.
 */


// ─── Document Checklist Items: per-case checklist tracking ───


// ─── User Feedback: Clippy-style help assistant submissions ───


// ─── Pipeline Analytics: track pipeline usage events ───


// ─── Share Links: time-limited read-only case sharing for advocates ───


// ─── Notifications ───


// ─── Admin Invite Links (targetRole, targetPlan, inviteStatus) ───


// ─── Invite Redemptions (tracks who used which invite) ───


// ─── Missing Records (FOIA gap detection — records the engine expects but didn't find) ───


// ─── FOIA Statutes: public records laws by jurisdiction ───


// ─── FOIA Agencies: agency registry ───


// ─── FOIA Record Types: canonical record definitions ───


// ─── FOIA Agency Records: junction mapping records → agencies → statutes ───


// ─── FOIA Requests: system-generated records request drafts ───


// ─── Case Narratives: Statement of Facts generated from evidence timeline ───


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


// ─── Patterns: unique cross-case pattern instances with deterministic signatures ───


// ─── Pattern Occurrences: where a pattern appears (case + evidence reference) ───


// ─── Benefit Applications: track user's benefit application status ───


// ─── Lighthouse: Community Hub Tables ───

// Suggestions — community-submitted ideas for the board


// Suggestion votes — track who voted to prevent duplicates


// Spotlight — admin-curated featured content that rotates


// Job Board — vetted job postings, apprenticeships, workforce programs


// Community Board — help wanted/offered, skill shares, resource sharing


// ─── Civic Map: Geocode Cache ───
// Caches address → lat/lng lookups to avoid repeated geocoding API calls.
// Key is a normalized address string; coordinates are stored as decimal degrees.


// ─── Civic Map: Events / Workshops ───
// Lighthouse events (workshops, trainings, community gatherings) with location data.


// ─── Map-Based Intake Sessions ───
// Stores intake sessions initialized from the Civic Map.
// Contains geographic context, nearby resources, pattern signals, and suggested pipelines.


// ═══════════════════════════════════════════════════════════════════════
// DOCKET ROOM — Structural legislative analysis module
// Principle: Reveal structure. Interpret nothing. Judge nothing.
// ═══════════════════════════════════════════════════════════════════════

// ─── Docket Entries: the law or proposal being analyzed ───


// ─── Docket Actors: sponsors, committees, agencies, lobbyists (Section 2) ───


// ─── Docket Impacts: populations, industries, agencies affected (Section 3) ───


// ─── Docket Sources: primary source ledger (Section 7) ───


// ─── Docket Submissions: user-submitted law requests ───


// ─── LumenSend: Document Generation & Delivery ───


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


// ─── Legal Library: Statute Clause X-Ray ───


// ─── Legal Library: Case Law ───


// ─── Legal Library: Enforcement Records ───


// ─── Legal Library: Weak Joints (where law and practice diverge) ───


// ─── Legal Library: Systemic Contradictions (the meta-argument) ───


// ─── Pipeline Intake Enrichments: investigation patterns, red flags, cross-pipeline links ───


// ─── Agency Performance Metrics: yearly performance data for enforcement agencies ───


// ─── Doctrine Registry: named legal doctrines with primary cases and domains ───


// ─── Agency Authority Map: enforcement pathways per statute/agency pair ───


// ─── Doctrine Graph Edges: relationship layer connecting statutes, cases, doctrines, weak joints, agencies ───


// ─── Litigation Barriers: doctrines/procedures that block claims before merits review ───


// ─── Evidence Sources: real-world proof sources for weak joints and contradictions ───


// ─── Pipeline Intelligence Map: connects investigation pipelines to their legal stack ───


// ─── Signal Registry: detection patterns for investigative signals ───


// ─── Timeline Rules: normalization patterns for temporal references ───


// ─── Timeline Signals: higher-level timing signals emitted after normalization ───


// ─── Contradiction Templates: structured contradiction detection patterns ───


// ─── Narrative Templates: output generation templates for different audiences ───


// ─── Workflow Definitions: orchestration workflows for document analysis pipelines ───


// ─── Agency Case Prioritization: models how agencies prioritize cases after intake ───


// ─── Agency Resource Capacity: models agency enforcement bandwidth and constraints ───


// ─── Agency Intake Decision Rules ───


// ─── Inter-Agency Referral Network ───


// ─── Agency Coordination Matrix ───


// ─── Federal Enforcement Priority Index ───


// ─── Historical Enforcement Trends ───


// ─── Agency Forms Directory ───


// ─── Regulatory Guidance Repository ───


// ─── Enforcement Penalties ───


// ─── Enforcement Viability Rules ───


// ─── Proof Framework Library ───


// ─── Claim Element Matrix ───


// ─── Investigation Guidance ───


// ─── Filing Generator ───


// ═══════════════════════════════════════════════════════════════════════════
// PROCEDURAL ENGINE — Steps 1-3: Jurisdiction, Timeline Law, Workflows
// ═══════════════════════════════════════════════════════════════════════════

// ─── Jurisdiction Hierarchy: federal → state → county → city ───


// ─── Node Timeline: temporal state of legal nodes ───


// ─── Timeline Events: legal events that affect the state of law ───


// ─── Timeline Edges: relationships between legal nodes over time ───


// ─── Workflow Master: complete procedural workflows ───


// ─── Workflow Steps: ordered steps within a workflow ───


// ─── Evidence Profiles: required evidence per issue type ───


// ─── Escalation Routes: escalation paths from workflows ───


// ═══════════════════════════════════════════════════════════════════════════
// CLAIM VIABILITY ENGINE — Pipeline Tables (Teams 1-3 Brief)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Deadline Rules: computable deadline logic for workflows ───


// ─── Weak Joint Triggers: conditions that activate weak joint detection ───


// ─── Weak Joint Hits: per-case detection of weak joint vulnerabilities ───


// ─── Fact Claims: per-case extracted factual assertions ───


// ─── Case Fact Patterns: structured fact patterns extracted from documents ───


// ─── Claim Detection Rules: rules matching fact patterns to claim types ───


// ─── Claim Detection Results: per-case claim detection output ───


// ─── Evidence Records: per-case evidence tracking with reliability scoring ───


// ─── Element Strength: per-case evaluation of claim elements ───


// ─── Contradiction Scores: per-case contradiction detection results ───


// ─── Claim Viability: per-case viability assessment output ───


// ============================================================
// STRATEGY ENGINE (10 tables)
// Consumes viability pipeline output, computes optimal legal strategies
// ============================================================


// ============================================================
// CASE ASSEMBLY GENERATOR (13 tables)
// Generates actual legal documents from strategy engine output
// ============================================================


// ============================================================
// PATTERN AGGREGATION ENGINE (13 tables)
// Cross-case pattern detection for systemic violations
// Feeds back into Strategy Engine via strategy_paths.pattern* fields
// ============================================================


// ============================================================
// ENGINE RUNS ORCHESTRATION (1 table)
// Tracks end-to-end pipeline execution across all engines
// ============================================================


// ─── Legislator Contacts: elected officials and their contact info ───


// ─── Advocacy Organizations: nonprofits, legal aid, community orgs ───


// ─── Court Directory: filing information for courts and tribunals ───


// ─── Intake Document Templates: fillable templates for pro se filings ───


// ─── Evidence Items: user-submitted evidence artifacts (State Graph layer) ───
export const EVIDENCE_TYPES = [
  "email", "text_message", "letter", "notice", "policy_document",
  "medical_record", "photo", "timeline_entry", "witness_statement",
  "call_log", "contract", "receipt", "government_form", "court_filing",
  "audio_recording", "video_recording", "screenshot", "other",
] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];


// ─── Evidence → Proof Element Links: maps evidence to proof framework elements ───


// ─── Evidence → Event Links: connects evidence to events it proves ───


// ─── Evidence Graph Edges: typed relationships between evidence/events and claims/barriers/agencies ───


// ═══════════════════════════════════════════════════════════════════════
// LIVE DATA INGESTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════

// ─── Dataset Registry: metadata for each connected data source ───


// ─── Ingested Records: normalized rows from external data sources ───


// ─── Ingest Runs: audit log for each ingestion execution ───


// ─── Live Signals: signals detected from ingested live data ───


// ─── Raw Live Signals: simple streaming table for ingested data ───


// ─── Interpretation Layers: dataset-specific interpretive context ───

// T1. Category Interpretations — maps raw dataset categories to plain-language explanations


// T2. Harm / Transparency Risk Mapping — maps categories to harm domains with detection indicators


// T3. Timeline / Resolution Expectations — expected processing or filing timelines


// T4. Entity Signal Rules — thresholds for detecting repeat entity patterns


// T5. Geographic Signal Rules — thresholds for geographic cluster detection


// T6. Status Interpretations — maps record statuses to meanings and signal interpretations


// T7. Signal Explanation Templates — parameterized templates for generating signal explanations


// T8. Jurisdiction Scope Guidance — classification rules for signal scope (local/regional/statewide/national)


// ─── Knowledge Backbone Tables ──────────────────────────────────


// ─── Signal Governance Tables ───────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════
// REMEDY PATH ENGINE
// ═══════════════════════════════════════════════════════════════════════

// ─── Remedy Paths: generated remedy strategies for a case ───


// ─── Remedy Steps: ordered steps within a remedy path ───


// ─── Remedy Documentation Requirements: what documents are needed for each step ───


// ─── Paperwork Templates: reusable document templates for the paperwork engine ───


// ─── Generated Documents: documents produced by the paperwork engine ───


// ─── Pattern Registry Engine ───


// ─── Trend & Pressure Engine ─────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════
// SYSTEMIC STRATEGY PATHFINDING ENGINE
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// OUTCOME & FEEDBACK ENGINE
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════
// Session 49 — Intervention Network + Policy Impact Tables
// ═══════════════════════════════════════════════════════════════════════


// ─── Session 51: Remedy Templates & Settlement Calculator Module ───


// ─── Knowledge Freshness Monitoring ───


// ─── Knowledge Coverage Metrics (Gap Analysis) ───


// ─── Entity Aliases: canonical name mapping for entity deduplication ───


// ─── Engine 1: Systemic Harm Index ───


// ─── Engine 2: Litigation Correlation ───


// ─── Engine 3: Systemic Risk Forecast ───


// ─── Engine 4: Global Systemic Harm Map ───


// ─── Engine 5: Problem Interpreter / Front Door ───


// ─── Engine 6: Case Link / Shareable Case ───


// ─── Engine 7: Attorney Match ───


// ═══════════════════════════════════════════════════════════════════════
// CASE → PATTERN BRIDGE
// ═══════════════════════════════════════════════════════════════════════

// ─── Case Signals: signals extracted from individual case data ───


// ─── Pattern Candidates: potential systemic patterns awaiting confirmation ───


// ─── Case Pattern Links: which cases contribute to which patterns ───


// ── Lobbying Activity (Session 69) ──────────────────────────────────


// ── Federal Litigation Cases (Session 69) ───────────────────────────


// ── Administrative Decisions (Session 69) ───────────────────────────


// ── Verified Reports (Session 69) ───────────────────────────────────


// ── Cross-Stream Correlations (Session 69) ──────────────────────────


// ── Civil Society / Advocacy Reports (Session 70) ─────────────────────


// ═══════════════════════════════════════════════════════════════════════
// TIME-TRAVEL ANALYSIS ENGINE (Session 71)
// Historical replay, counterfactual analysis, algorithm comparison
// ═══════════════════════════════════════════════════════════════════════

// ─── Data Snapshots: reference points for historical datasets ───


// ─── Time-Travel Runs: each replay/comparison/counterfactual execution ───


// ─── Historical Signals: mirrors live_signals, isolated from production ───


// ─── Historical Patterns: mirrors pattern_registry, isolated from production ───


// ─── Historical Trends: mirrors trend_pressure_metrics, isolated ───


// ─── Counterfactual Parameters: "what if" scenario configuration ───


// ═══════════════════════════════════════════════════════════════
// SESSION 72 — ENTITY INTELLIGENCE + INSTITUTIONAL ACCOUNTABILITY
//             + REGULATORY CAPTURE + CRISIS PREDICTION + DATA STREAMS
// ═══════════════════════════════════════════════════════════════

// ─── Entity Registry: structured entity profiles ───


// ─── Entity Relationships: connections between entities ───


// ─── Institution Registry: regulators, agencies, oversight bodies ───


// ─── Pattern-Institution Links: maps patterns to responsible institutions ───


// ─── Institution Activity: tracked actions by institutions ───


// ─── Regulatory Capture Patterns: detected capture risk patterns ───


// ─── Regulatory Capture Signals: individual capture indicators ───


// ─── Regulatory Capture Metrics: computed ratios and scores ───


// ─── Crisis Predictions: forecasted systemic crises ───


// ─── Regulatory Enforcement Actions: FTC, FCC, CFPB, SEC, DOL, AG ───


// ─── Litigation Cases: court filings, class actions, settlements ───


// ─── Administrative Decisions (Session 72): already defined above at line ~5420 ───
// Using the original table definition; this duplicate has been removed.

// ─── Investigative Reports: media investigations ───


// ─── Oversight Reports: IG, GAO, audit reports ───


// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — SYSTEMIC SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — PUBLIC TRANSPARENCY LAYER
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — EVIDENCE PUBLISHING & DOSSIER ENGINE
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// SESSION 73 — EXTERNAL COLLABORATION & SECURE SHARING ENGINE
// ═══════════════════════════════════════════════════════════════════


// ─── Session 74: Entity Transparency Layer ───────────────────────────


// ─── Session 74: Entity Evidence Threshold System ────────────────────


// ─── Session 74: Systemic Risk Forecast Engine ───────────────────────


// ─── Session 74: Public Alerting & Subscription Engine ───────────────


// ─── Session 74: Global Systemic Intelligence Map ────────────────────


// ─── Session 74: Institutional Failure Prediction Engine ─────────────


// ─── Investigative Query Engine ─────────────────────────────────────────


// ─── Session 76: Luminari Independence Kit ───

// Feature 1: Export Spine Engine


// Feature 2: Restore Spine Engine


// Feature 3: Admin Sovereign Control — Change Log


// Feature 3: Admin Sovereign Control — Engine Registry


// Feature 4: Data Stream Registry


// Feature 5: Intervention Timeline Engine


// Feature 6: System Copilot (Sunam)


// ─── Signal Extraction Layer: one normalized record per document ───


// ─── Extraction Staging: signals that fail Sunam gate threshold (admin-visible only) ───


// ─── Sunam Gate Log: full audit trail of every gate decision ───


// ─── Sunam Thresholds: admin-configurable scoring weights and pass thresholds ───


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


/**
 * Governance Snapshots — periodic cryptographic signing of the log chain
 * 
 * A background process periodically computes a hash of the entire chain
 * up to a certain sequence number and signs it with a system private key.
 * External parties can verify the chain by recomputing and comparing.
 */


/**
 * Session Log — Continuous execution loop between Tsunam and Luminari
 * 
 * Every session:
 * - Starts from a verified governance state (governance_anchor)
 * - Records all actions taken
 * - Captures resulting governance entries as a seq_no range
 * - Produces a structured handoff for the next session
 * 
 * Enables traceability: session → action → governance log entry → verification
 */


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

export type LuminariHandoff = {
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


// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM CONTROL REFERENCES (Architecture & Governance)
// ═══════════════════════════════════════════════════════════════════════════════
// Control references define system behavior and prevent architectural drift.
// These are NOT documentation — they are binding references for system design.
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Reference Change History: track all modifications to control references ───


// ─── Pattern Outputs: clustered signal patterns ───


// ─── Strategy Outputs: generated strategies from patterns ───


// ─── Procedural Outputs: generated procedures from strategies ───


// ─── Activation Outputs: triggerable activation records ───


// ═══════════════════════════════════════════════════════════════════════════════
// ─── LEGAL REGISTRY TABLES (PHASE 2: Forms, Agencies, Escalation Paths) ───
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Forms Registry ───
// Centralized registry of all complaint forms, applications, and legal documents


// ─── Agencies Registry ───


// ─── Escalation Registry ───


// ─── Mental Health Resources (MH Registry) ───


// ─── Business Analytics: Baseline metrics for anomaly detection ───


// ═══════════════════════════════════════════════════════════════════
// ─── LUMINARI REGISTRY: Canonical Jurisdiction + Program Registry ─
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// METADATA CONDUIT — Structural metadata layer for governance + traceability
// ═══════════════════════════════════════════════════════════════════════════

// ─── Table Registry: every table in the system, tracked ───


// ─── Field Dictionary: every column in every table ───


// ─── Relation Catalog: foreign key and logical relationships between tables ───


// ─── Pipeline Map: registered data pipelines and their stages ───


// ─── Transform Profiles: data transformation rules applied by engines ───


// ─── Conduit Events: governance event log for all pipeline/engine activity ───


// ─── Alpha Lake Exports: governed output terminal ───


// ─── Enforcement Action Paths: structured filing paths per claim type ───
// Bridges the gap between intake (claim identification) and action (filing)


// ─── Unified Resources: single normalized table for all support resources ───
// No soul left behind — every resource in one queryable surface


// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL SPINE — Implementation Package (Proof Stream Prep)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SIGNAL FLOW LOGS (L7): System Visibility — READ-ONLY ───
// Records the path each signal takes through the system.
// This table is APPEND-ONLY. No updates. No deletes. No upstream writes.


// ─── WORLD NODES (L10): Sovereign Domain — Metadata Carrier ───
// Each world_node carries the L10 metadata contract.
// active_remedy = true AND valid metadata required for use as remedy target.


// ─── Claim Validation Rules ───────────────────────────────────────────────────
// Jurisdiction-specific validation logic for each claim element
// Loaded from team JSON: 67 records across 7 claim types, 50-state + CA/TX/NY overrides


// ─── Remedy Feasibility Rules ─────────────────────────────────────────────────
// Per-jurisdiction strategy feasibility: cost, time, prerequisites, risk flags
// Loaded from team JSON: 56 records (agency_complaint strategy, all 50 states + DC + territories)


// ─── Case State ───────────────────────────────────────────────────────────────
// The commitment layer — everything committed to a case lands here
// Control Room reads from this table exclusively


// ─── Case Flags ───────────────────────────────────────────────────────────────
// System-generated and user-generated flags on a case


// ─── FOIA Tracker ─────────────────────────────────────────────────────────────
// Full FOIA request lifecycle: draft → sent → response_received → attached_to_case

// ─── Lighthouse Postgres tables (source of truth) ───

export const actionSteps = pgTable("action_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyPathId: uuid("strategy_path_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  actionText: text("action_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ActionSteps = typeof actionSteps.$inferSelect;
export type InsertActionSteps = typeof actionSteps.$inferInsert;

export const advocacyCoalitionNetwork = pgTable("advocacy_coalition_network", {
  id: uuid("id").defaultRandom().primaryKey(),
  networkId: text("network_id"),
  networkName: text("network_name"),
  domain: text("domain"),
  jurisdiction: text("jurisdiction"),
  description: text("description"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AdvocacyCoalitionNetwork = typeof advocacyCoalitionNetwork.$inferSelect;
export type InsertAdvocacyCoalitionNetwork = typeof advocacyCoalitionNetwork.$inferInsert;

export const agenciesRegistry = pgTable("agencies_registry", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyName: text("agency_name").notNull(),
  jurisdiction: text("jurisdiction"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AgenciesRegistry = typeof agenciesRegistry.$inferSelect;
export type InsertAgenciesRegistry = typeof agenciesRegistry.$inferInsert;

export const apiPullRun = pgTable("api_pull_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull(),
  runKey: text("run_key").notNull(),
  connectorVersion: text("connector_version").notNull(),
  parserVersion: text("parser_version").notNull(),
  normalizationVersion: text("normalization_version").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status"),
  requestUrl: text("request_url").notNull(),
  requestMethod: text("request_method").default(sql`'GET'::text`),
  requestParams: jsonb("request_params").default(sql`'{}'::jsonb`),
  requestHeadersSafe: jsonb("request_headers_safe").default(sql`'{}'::jsonb`),
  responseStatus: integer("response_status"),
  responseContentType: text("response_content_type"),
  responseRecordCount: integer("response_record_count"),
  recordsInserted: integer("records_inserted").default(sql`0`),
  recordsUpdated: integer("records_updated").default(sql`0`),
  recordsRejected: integer("records_rejected").default(sql`0`),
  sourceSnapshotHash: text("source_snapshot_hash"),
  responseBodyHash: text("response_body_hash"),
  errorMessage: text("error_message"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ApiPullRun = typeof apiPullRun.$inferSelect;
export type InsertApiPullRun = typeof apiPullRun.$inferInsert;

export const apiSourceRegistry = pgTable("api_source_registry", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceKey: text("source_key").notNull(),
  sourceName: text("source_name").notNull(),
  sourceOwner: text("source_owner"),
  sourceType: text("source_type").notNull(),
  baseUrl: text("base_url").notNull(),
  documentationUrl: text("documentation_url"),
  jurisdictionScope: text("jurisdiction_scope"),
  geographicScope: text("geographic_scope"),
  domain: text("domain").notNull(),
  authType: text("auth_type"),
  requiresSecret: boolean("requires_secret").default(sql`false`),
  secretName: text("secret_name"),
  rateLimitNotes: text("rate_limit_notes"),
  termsUrl: text("terms_url"),
  license: text("license"),
  freshnessExpectation: text("freshness_expectation"),
  isActive: boolean("is_active").default(sql`true`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type ApiSourceRegistry = typeof apiSourceRegistry.$inferSelect;
export type InsertApiSourceRegistry = typeof apiSourceRegistry.$inferInsert;

export const atlasLighthouseJudicialSignalBridgeV1 = pgTable("atlas_lighthouse_judicial_signal_bridge_v1", {
  bridgeRecordId: uuid("bridge_record_id").defaultRandom().notNull(),
  atlasSignalId: bigint("atlas_signal_id", { mode: "number" }).notNull(),
  signalType: text("signal_type").notNull(),
  sourceSystem: text("source_system").default(sql`'atlas'::text`).notNull(),
  bridgeVersion: text("bridge_version").default(sql`'atlas_lighthouse_judicial_bridge_v1'::text`).notNull(),
  sourceConnectorId: uuid("source_connector_id").notNull(),
  rawRecordId: uuid("raw_record_id").notNull(),
  caseLawId: uuid("case_law_id").notNull(),
  entityIds: text("entity_ids").array(),
  jurisdictionRawValue: text("jurisdiction_raw_value"),
  jurisdictionId: text("jurisdiction_id"),
  sourceUrl: text("source_url").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }).defaultNow().notNull(),
  confidenceScore: numeric("confidence_score"),
  severity: text("severity"),
  signalStatus: text("signal_status").notNull(),
  ruleId: text("rule_id").notNull(),
  ruleVersion: text("rule_version").notNull(),
  generationMethod: text("generation_method").notNull(),
  recordOrigin: text("record_origin").notNull(),
  verificationStatus: text("verification_status").notNull(),
  evidencePayload: jsonb("evidence_payload").notNull(),
  provenanceMetadata: jsonb("provenance_metadata").notNull(),
  atlasMetadataJson: jsonb("atlas_metadata_json").notNull(),
  atlasSignalDedupKey: text("atlas_signal_dedup_key"),
  sourceView: text("source_view").notNull(),
  bridgeMetadata: jsonb("bridge_metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AtlasLighthouseJudicialSignalBridgeV1 = typeof atlasLighthouseJudicialSignalBridgeV1.$inferSelect;
export type InsertAtlasLighthouseJudicialSignalBridgeV1 = typeof atlasLighthouseJudicialSignalBridgeV1.$inferInsert;

export const atlasLighthouseLegalBridgeV1 = pgTable("atlas_lighthouse_legal_bridge_v1", {
  id: uuid("id").defaultRandom().primaryKey(),
  bridgeRunId: text("bridge_run_id").notNull(),
  sourceProject: text("source_project").notNull(),
  targetProject: text("target_project").notNull(),
  sourceTable: text("source_table").notNull(),
  targetTable: text("target_table").notNull(),
  atlasRecordId: text("atlas_record_id").notNull(),
  lighthouseRecordId: uuid("lighthouse_record_id"),
  sourceExternalId: text("source_external_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceRecordHash: text("source_record_hash").notNull(),
  targetRecordHash: text("target_record_hash"),
  bridgeRecordHash: text("bridge_record_hash").notNull(),
  bridgeMetadata: jsonb("bridge_metadata").default(sql`'{}'::jsonb`).notNull(),
  verificationStatus: text("verification_status").default(sql`'pending'::text`).notNull(),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AtlasLighthouseLegalBridgeV1 = typeof atlasLighthouseLegalBridgeV1.$inferSelect;
export type InsertAtlasLighthouseLegalBridgeV1 = typeof atlasLighthouseLegalBridgeV1.$inferInsert;

export const atlasLighthouseResourceBridgeV1 = pgTable("atlas_lighthouse_resource_bridge_v1", {
  bridgeRecordId: uuid("bridge_record_id").defaultRandom().notNull(),
  atlasResourceId: uuid("atlas_resource_id").notNull(),
  name: text("name"),
  resourceType: text("resource_type"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  phone: text("phone"),
  url: text("url"),
  lat: numeric("lat"),
  lon: numeric("lon"),
  sourceTable: text("source_table"),
  sourceId: text("source_id"),
  extraJson: jsonb("extra_json"),
  bridgeVersion: text("bridge_version").default(sql`'atlas_lighthouse_resource_bridge_v1'::text`),
  bridgeMetadata: jsonb("bridge_metadata"),
  verificationStatus: text("verification_status").default(sql`'verified'::text`),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type AtlasLighthouseResourceBridgeV1 = typeof atlasLighthouseResourceBridgeV1.$inferSelect;
export type InsertAtlasLighthouseResourceBridgeV1 = typeof atlasLighthouseResourceBridgeV1.$inferInsert;

export const atlasLighthouseSignalBridgeV1 = pgTable("atlas_lighthouse_signal_bridge_v1", {
  bridgeRecordId: uuid("bridge_record_id").defaultRandom().notNull(),
  atlasSignalId: bigint("atlas_signal_id", { mode: "number" }).notNull(),
  signalType: text("signal_type").notNull(),
  sourceSystem: text("source_system").default(sql`'atlas'::text`).notNull(),
  bridgeVersion: text("bridge_version").default(sql`'atlas_lighthouse_bridge_v1'::text`).notNull(),
  sourceConnectorId: uuid("source_connector_id").notNull(),
  rawRecordId: uuid("raw_record_id").notNull(),
  statuteId: uuid("statute_id").notNull(),
  entityIds: text("entity_ids").array(),
  jurisdictionRawValue: text("jurisdiction_raw_value"),
  jurisdictionId: text("jurisdiction_id"),
  sourceUrl: text("source_url").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }).defaultNow().notNull(),
  confidenceScore: numeric("confidence_score"),
  severity: text("severity"),
  signalStatus: text("signal_status").notNull(),
  ruleId: text("rule_id").notNull(),
  ruleVersion: text("rule_version").notNull(),
  generationMethod: text("generation_method").notNull(),
  recordOrigin: text("record_origin").notNull(),
  verificationStatus: text("verification_status").notNull(),
  evidencePayload: jsonb("evidence_payload").default(sql`'{}'::jsonb`).notNull(),
  provenanceMetadata: jsonb("provenance_metadata").default(sql`'{}'::jsonb`).notNull(),
  atlasMetadataJson: jsonb("atlas_metadata_json").default(sql`'{}'::jsonb`).notNull(),
  atlasSignalDedupKey: text("atlas_signal_dedup_key"),
  sourceView: text("source_view").default(sql`'public.v_civic_map_signals_production'::text`).notNull(),
  bridgeMetadata: jsonb("bridge_metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AtlasLighthouseSignalBridgeV1 = typeof atlasLighthouseSignalBridgeV1.$inferSelect;
export type InsertAtlasLighthouseSignalBridgeV1 = typeof atlasLighthouseSignalBridgeV1.$inferInsert;

export const backboneDiffLogs = pgTable("backbone_diff_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  backboneUpdateRunId: uuid("backbone_update_run_id").notNull(),
  objectType: text("object_type").notNull(),
  objectRef: text("object_ref").notNull(),
  diffPayload: jsonb("diff_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BackboneDiffLogs = typeof backboneDiffLogs.$inferSelect;
export type InsertBackboneDiffLogs = typeof backboneDiffLogs.$inferInsert;

export const backboneUpdateRuns = pgTable("backbone_update_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryRunId: uuid("entry_run_id"),
  status: runStatusEnum("status").default(sql`'pending'::run_status_enum`).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  summary: jsonb("summary").default(sql`'{}'::jsonb`).notNull(),
});

export type BackboneUpdateRuns = typeof backboneUpdateRuns.$inferSelect;
export type InsertBackboneUpdateRuns = typeof backboneUpdateRuns.$inferInsert;

export const barrierDecisionTree = pgTable("barrier_decision_tree", {
  id: uuid("id").defaultRandom().primaryKey(),
  barrierCategory: text("barrier_category"),
  barrierName: text("barrier_name"),
  jurisdiction: text("jurisdiction"),
  decisionLogic: text("decision_logic"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BarrierDecisionTree = typeof barrierDecisionTree.$inferSelect;
export type InsertBarrierDecisionTree = typeof barrierDecisionTree.$inferInsert;

export const burdenOfProofRules = pgTable("burden_of_proof_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimType: text("claim_type").notNull(),
  ruleText: text("rule_text").notNull(),
  jurisdiction: text("jurisdiction"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BurdenOfProofRules = typeof burdenOfProofRules.$inferSelect;
export type InsertBurdenOfProofRules = typeof burdenOfProofRules.$inferInsert;

export const caseExitGuarantees = pgTable("case_exit_guarantees", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id"),
  guaranteeType: text("guarantee_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CaseExitGuarantees = typeof caseExitGuarantees.$inferSelect;
export type InsertCaseExitGuarantees = typeof caseExitGuarantees.$inferInsert;

export const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseNumber: text("case_number"),
  title: text("title"),
  description: text("description"),
  caseType: text("case_type"),
  jurisdiction: text("jurisdiction"),
  domain: text("domain"),
  status: text("status").default(sql`'active'::text`).notNull(),
  priorityLevel: text("priority_level"),
  ownerRef: text("owner_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Case = typeof cases.$inferSelect;

export const cdaAnalysisRuns = pgTable("cda_analysis_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id"),
  snapshotId: uuid("snapshot_id"),
  status: runStatusEnum("status").default(sql`'pending'::run_status_enum`).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  summary: jsonb("summary").default(sql`'{}'::jsonb`).notNull(),
});

export type CdaAnalysisRuns = typeof cdaAnalysisRuns.$inferSelect;
export type InsertCdaAnalysisRuns = typeof cdaAnalysisRuns.$inferInsert;

export const cdaAnomalies = pgTable("cda_anomalies", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  description: text("description"),
  severity: signalSeverityEnum("severity").default(sql`'medium'::signal_severity_enum`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaAnomalies = typeof cdaAnomalies.$inferSelect;
export type InsertCdaAnomalies = typeof cdaAnomalies.$inferInsert;

export const cdaCorrelations = pgTable("cda_correlations", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  correlationType: text("correlation_type").notNull(),
  description: text("description"),
  strength: numeric("strength"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaCorrelations = typeof cdaCorrelations.$inferSelect;
export type InsertCdaCorrelations = typeof cdaCorrelations.$inferInsert;

export const cdaFeatures = pgTable("cda_features", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  featureName: text("feature_name").notNull(),
  featureValue: jsonb("feature_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaFeatures = typeof cdaFeatures.$inferSelect;
export type InsertCdaFeatures = typeof cdaFeatures.$inferInsert;

export const cdaInfluencePaths = pgTable("cda_influence_paths", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  pathDescription: text("path_description").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaInfluencePaths = typeof cdaInfluencePaths.$inferSelect;
export type InsertCdaInfluencePaths = typeof cdaInfluencePaths.$inferInsert;

export const cdaStructuralBreaks = pgTable("cda_structural_breaks", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  breakType: text("break_type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaStructuralBreaks = typeof cdaStructuralBreaks.$inferSelect;
export type InsertCdaStructuralBreaks = typeof cdaStructuralBreaks.$inferInsert;

export const cdaVectors = pgTable("cda_vectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  cdaAnalysisRunId: uuid("cda_analysis_run_id").notNull(),
  vectorType: text("vector_type").notNull(),
  vectorPayload: jsonb("vector_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CdaVectors = typeof cdaVectors.$inferSelect;
export type InsertCdaVectors = typeof cdaVectors.$inferInsert;

export const civilGideonDirectory = pgTable("civil_gideon_directory", {
  id: uuid("id").defaultRandom().primaryKey(),
  directoryId: text("directory_id"),
  resourceName: text("resource_name"),
  jurisdiction: text("jurisdiction"),
  resourceType: text("resource_type"),
  serviceArea: text("service_area"),
  description: text("description"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CivilGideonDirectory = typeof civilGideonDirectory.$inferSelect;
export type InsertCivilGideonDirectory = typeof civilGideonDirectory.$inferInsert;

export const claimElementMatrix = pgTable("claim_element_matrix", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimType: text("claim_type").notNull(),
  elementName: text("element_name").notNull(),
  burdenStandard: text("burden_standard"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimElement = typeof claimElementMatrix.$inferSelect;
export type InsertClaimElement = typeof claimElementMatrix.$inferInsert;

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  claimText: text("claim_text").notNull(),
  claimType: text("claim_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Claim = typeof claims.$inferSelect;

export const coalitionIntelligence = pgTable("coalition_intelligence", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: text("campaign_id"),
  campaignName: text("campaign_name"),
  statusStage: text("status_stage"),
  primarySponsor: text("primary_sponsor"),
  demand: text("demand"),
  legislativeVehicle: text("legislative_vehicle"),
  targetPassage: text("target_passage"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CoalitionIntelligence = typeof coalitionIntelligence.$inferSelect;
export type InsertCoalitionIntelligence = typeof coalitionIntelligence.$inferInsert;

export const contradictionRecords = pgTable("contradiction_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ContradictionRecords = typeof contradictionRecords.$inferSelect;
export type InsertContradictionRecords = typeof contradictionRecords.$inferInsert;

export const coordinationData = pgTable("coordination_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  coordinationSummary: text("coordination_summary"),
  systemsInvolved: jsonb("systems_involved").default(sql`'[]'::jsonb`).notNull(),
  handoffs: jsonb("handoffs").default(sql`'[]'::jsonb`).notNull(),
  deadlocks: jsonb("deadlocks").default(sql`'[]'::jsonb`).notNull(),
  blockingEntities: jsonb("blocking_entities").default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CoordinationData = typeof coordinationData.$inferSelect;
export type InsertCoordinationData = typeof coordinationData.$inferInsert;

export const correlationMatches = pgTable("correlation_matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  relatedCaseRef: text("related_case_ref"),
  matchDescription: text("match_description"),
  confidenceScore: numeric("confidence_score"),
  sharedPatterns: jsonb("shared_patterns").default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CorrelationMatches = typeof correlationMatches.$inferSelect;
export type InsertCorrelationMatches = typeof correlationMatches.$inferInsert;

export const criticalFilesVerification = pgTable("critical_files_verification", {
  fileName: text("file_name"),
  fileType: text("file_type"),
  isCritical: boolean("is_critical"),
  artifactStatus: text("artifact_status"),
  verificationSource: text("verification_source"),
  verificationState: text("verification_state"),
});

export type CriticalFilesVerification = typeof criticalFilesVerification.$inferSelect;
export type InsertCriticalFilesVerification = typeof criticalFilesVerification.$inferInsert;

export const crossStreamCorrelations = pgTable("cross_stream_correlations", {
  id: uuid("id").defaultRandom().primaryKey(),
  correlationKey: text("correlation_key"),
  description: text("description"),
  correlationStrength: numeric("correlation_strength"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CrossStreamCorrelation = typeof crossStreamCorrelations.$inferSelect;

export const cursors = pgTable("cursors", {
  cursorId: text("cursor_id").notNull(),
  streamId: text("stream_id").notNull(),
  name: text("name").notNull(),
  currentOffset: bigint("current_offset", { mode: "number" }).default(sql`0`).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Cursors = typeof cursors.$inferSelect;
export type InsertCursors = typeof cursors.$inferInsert;

export const damagesMatrix = pgTable("damages_matrix", {
  id: uuid("id").defaultRandom().primaryKey(),
  matrixId: text("matrix_id"),
  claimType: text("claim_type"),
  jurisdiction: text("jurisdiction"),
  violationDescription: text("violation_description"),
  damagesRange: text("damages_range"),
  typicalAward: text("typical_award"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DamagesMatrix = typeof damagesMatrix.$inferSelect;
export type InsertDamagesMatrix = typeof damagesMatrix.$inferInsert;

export const databaseFingerprintLog = pgTable("database_fingerprint_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  fingerprintLabel: text("fingerprint_label").notNull(),
  fingerprintValue: text("fingerprint_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DatabaseFingerprintLog = typeof databaseFingerprintLog.$inferSelect;
export type InsertDatabaseFingerprintLog = typeof databaseFingerprintLog.$inferInsert;

export const deadlines = pgTable("deadlines", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  strategyPathId: uuid("strategy_path_id"),
  deadlineLabel: text("deadline_label").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Deadlines = typeof deadlines.$inferSelect;
export type InsertDeadlines = typeof deadlines.$inferInsert;

export const deliverableFiles = pgTable("deliverable_files", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  packageKey: text("package_key"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileSizeKb: numeric("file_size_kb"),
  filePath: text("file_path"),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }).defaultNow(),
  version: text("version"),
  status: text("status"),
  contentHash: text("content_hash"),
  isCritical: boolean("is_critical").default(sql`false`),
  description: text("description"),
  purpose: text("purpose"),
  artifactStatus: text("artifact_status").default(sql`'declared'::text`),
  verificationSource: text("verification_source"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export type DeliverableFiles = typeof deliverableFiles.$inferSelect;
export type InsertDeliverableFiles = typeof deliverableFiles.$inferInsert;

export const detectedSignals = pgTable("detected_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  findingId: uuid("finding_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  signalType: text("signal_type").notNull(),
  signalDescription: text("signal_description"),
  severity: signalSeverityEnum("severity").default(sql`'medium'::signal_severity_enum`).notNull(),
  confidenceScore: numeric("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DetectedSignals = typeof detectedSignals.$inferSelect;
export type InsertDetectedSignals = typeof detectedSignals.$inferInsert;

export const detectedSignalsV2 = pgTable("detected_signals_v2", {
  id: uuid("id").defaultRandom().primaryKey(),
  signalType: text("signal_type").notNull(),
  signalDescription: text("signal_description").notNull(),
  severity: text("severity"),
  confidenceScore: numeric("confidence_score"),
  status: text("status").default(sql`'detected'::text`),
  geographyType: text("geography_type"),
  city: text("city"),
  county: text("county"),
  state: text("state"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  sourceSystem: text("source_system"),
  originType: text("origin_type"),
  sourceId: uuid("source_id"),
  pullRunId: uuid("pull_run_id"),
  rawRecordId: uuid("raw_record_id"),
  normalizedResourceId: uuid("normalized_resource_id"),
  resourceBridgeId: uuid("resource_bridge_id"),
  signalBridgeId: uuid("signal_bridge_id"),
  legalBridgeId: uuid("legal_bridge_id"),
  signalRuleId: text("signal_rule_id"),
  signalRuleVersion: text("signal_rule_version"),
  signalGenerationRunId: uuid("signal_generation_run_id"),
  sourceSnapshotHash: text("source_snapshot_hash"),
  rawPayloadHash: text("raw_payload_hash"),
  signalFingerprint: text("signal_fingerprint").notNull(),
  signalHash: text("signal_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type DetectedSignalsV2 = typeof detectedSignalsV2.$inferSelect;
export type InsertDetectedSignalsV2 = typeof detectedSignalsV2.$inferInsert;

export const determinismChecks = pgTable("determinism_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  pipelineRunId: uuid("pipeline_run_id"),
  snapshotId: uuid("snapshot_id"),
  checkName: text("check_name").notNull(),
  checkResult: text("check_result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DeterminismChecks = typeof determinismChecks.$inferSelect;
export type InsertDeterminismChecks = typeof determinismChecks.$inferInsert;

export const doctrineRegistry = pgTable("doctrine_registry", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctrineName: text("doctrine_name").notNull(),
  jurisdiction: text("jurisdiction"),
  doctrineText: text("doctrine_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DoctrineRegistryEntry = typeof doctrineRegistry.$inferSelect;
export type InsertDoctrineRegistryEntry = typeof doctrineRegistry.$inferInsert;

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  normalizedRecordId: uuid("normalized_record_id"),
  documentType: text("document_type"),
  title: text("title"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  storagePath: text("storage_path"),
  sourceHash: text("source_hash"),
  rawText: text("raw_text"),
  extractedText: text("extracted_text"),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;

export const eligibilityHints = pgTable("eligibility_hints", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id"),
  programName: text("program_name").notNull(),
  reason: text("reason"),
  confidenceScore: numeric("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EligibilityHints = typeof eligibilityHints.$inferSelect;
export type InsertEligibilityHints = typeof eligibilityHints.$inferInsert;

export const enforcementPathwayModels = pgTable("enforcement_pathway_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  pathwayId: text("pathway_id"),
  pathwayName: text("pathway_name"),
  jurisdiction: text("jurisdiction"),
  domain: text("domain"),
  description: text("description"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EnforcementPathwayModels = typeof enforcementPathwayModels.$inferSelect;
export type InsertEnforcementPathwayModels = typeof enforcementPathwayModels.$inferInsert;

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  normalizedRecordId: uuid("normalized_record_id"),
  entityType: text("entity_type"),
  entityName: text("entity_name").notNull(),
  attributes: jsonb("attributes").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Entity = typeof entities.$inferSelect;

export const entryRuns = pgTable("entry_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id"),
  entryChannel: entryChannelEnum("entry_channel").notNull(),
  targetDomain: targetDomainEnum("target_domain").default(sql`'case_truth'::target_domain_enum`).notNull(),
  status: runStatusEnum("status").default(sql`'pending'::run_status_enum`).notNull(),
  sourceLabel: text("source_label"),
  sourceRef: text("source_ref"),
  sourceSystem: text("source_system"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  idempotencyKey: text("idempotency_key"),
});

export type EntryRuns = typeof entryRuns.$inferSelect;
export type InsertEntryRuns = typeof entryRuns.$inferInsert;

export const escalationRegistry = pgTable("escalation_registry", {
  id: uuid("id").defaultRandom().primaryKey(),
  escalationName: text("escalation_name").notNull(),
  jurisdiction: text("jurisdiction"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EscalationRegistry = typeof escalationRegistry.$inferSelect;
export type InsertEscalationRegistry = typeof escalationRegistry.$inferInsert;

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  normalizedRecordId: uuid("normalized_record_id"),
  eventType: text("event_type"),
  eventDate: timestamp("event_date", { withTimezone: true }),
  description: text("description"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  normalizedRecordId: uuid("normalized_record_id"),
  documentId: uuid("document_id"),
  evidenceType: text("evidence_type").notNull(),
  label: text("label"),
  contentRef: text("content_ref"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type InsertEvidenceItem = typeof evidenceItems.$inferInsert;

export const evidenceToElementLinks = pgTable("evidence_to_element_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  claimElementMatrixId: uuid("claim_element_matrix_id").notNull(),
  evidenceItemId: uuid("evidence_item_id"),
  documentId: uuid("document_id"),
  strength: evidenceStrengthEnum("strength"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EvidenceToElementLinks = typeof evidenceToElementLinks.$inferSelect;
export type InsertEvidenceToElementLinks = typeof evidenceToElementLinks.$inferInsert;

export const expansionPacks = pgTable("expansion_packs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  packageKey: text("package_key"),
  packName: text("pack_name").notNull(),
  packCode: text("pack_code"),
  description: text("description"),
  inOptionB: boolean("in_option_b").default(sql`false`),
  inOptionC: boolean("in_option_c").default(sql`true`),
  dependencies: text("dependencies"),
  fileId: bigint("file_id", { mode: "number" }),
});

export type ExpansionPacks = typeof expansionPacks.$inferSelect;
export type InsertExpansionPacks = typeof expansionPacks.$inferInsert;

export const exportArtifacts = pgTable("export_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  exportRunId: uuid("export_run_id").notNull(),
  artifactLabel: text("artifact_label"),
  artifactPath: text("artifact_path").notNull(),
  artifactHash: text("artifact_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ExportArtifacts = typeof exportArtifacts.$inferSelect;
export type InsertExportArtifacts = typeof exportArtifacts.$inferInsert;

export const exportRuns = pgTable("export_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  artifactType: artifactTypeEnum("artifact_type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: runStatusEnum("status").default(sql`'pending'::run_status_enum`).notNull(),
  outputManifest: jsonb("output_manifest").default(sql`'{}'::jsonb`).notNull(),
});

export type ExportRuns = typeof exportRuns.$inferSelect;
export type InsertExportRuns = typeof exportRuns.$inferInsert;

export const failureModes = pgTable("failure_modes", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  modeType: text("mode_type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FailureModes = typeof failureModes.$inferSelect;
export type InsertFailureModes = typeof failureModes.$inferInsert;

export const fileCategories = pgTable("file_categories", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fileId: bigint("file_id", { mode: "number" }),
  category: text("category"),
  subcategory: text("subcategory"),
  sequenceOrder: integer("sequence_order"),
});

export type FileCategories = typeof fileCategories.$inferSelect;
export type InsertFileCategories = typeof fileCategories.$inferInsert;

export const filingTemplates = pgTable("filing_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: text("template_id"),
  templateName: text("template_name"),
  templateType: text("template_type"),
  issuingAgency: text("issuing_agency"),
  jurisdiction: text("jurisdiction"),
  templateText: text("template_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FilingTemplates = typeof filingTemplates.$inferSelect;
export type InsertFilingTemplates = typeof filingTemplates.$inferInsert;

export const findings = pgTable("findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  claimId: uuid("claim_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  findingText: text("finding_text").notNull(),
  confidenceScore: numeric("confidence_score"),
  confidenceLabel: confidenceLabelEnum("confidence_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Finding = typeof findings.$inferSelect;

export const formsRegistry = pgTable("forms_registry", {
  id: uuid("id").defaultRandom().primaryKey(),
  formName: text("form_name").notNull(),
  issuingAgency: text("issuing_agency"),
  jurisdiction: text("jurisdiction"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FormsRegistry = typeof formsRegistry.$inferSelect;
export type InsertFormsRegistry = typeof formsRegistry.$inferInsert;

export const gapRecords = pgTable("gap_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  gapType: text("gap_type").notNull(),
  requiredItem: text("required_item"),
  whyRequired: text("why_required"),
  howToObtain: text("how_to_obtain"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GapRecords = typeof gapRecords.$inferSelect;
export type InsertGapRecords = typeof gapRecords.$inferInsert;

export const ingestedRecords = pgTable("ingested_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryRunId: uuid("entry_run_id").notNull(),
  caseId: uuid("case_id"),
  recordKey: text("record_key"),
  rawPayload: jsonb("raw_payload").notNull(),
  sourceHash: text("source_hash"),
  sourceSystem: text("source_system"),
  status: recordStatusEnum("status").default(sql`'received'::record_status_enum`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IngestedRecord = typeof ingestedRecords.$inferSelect;
export type InsertIngestedRecord = typeof ingestedRecords.$inferInsert;

export const intakeRecords = pgTable("intake_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryRunId: uuid("entry_run_id").notNull(),
  caseId: uuid("case_id"),
  recordKey: text("record_key"),
  rawPayload: jsonb("raw_payload").notNull(),
  sourceHash: text("source_hash"),
  status: recordStatusEnum("status").default(sql`'received'::record_status_enum`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IntakeRecords = typeof intakeRecords.$inferSelect;
export type InsertIntakeRecords = typeof intakeRecords.$inferInsert;

export const intakeRoutingLogic = pgTable("intake_routing_logic", {
  id: uuid("id").defaultRandom().primaryKey(),
  routingId: text("routing_id"),
  routingName: text("routing_name"),
  jurisdiction: text("jurisdiction"),
  domain: text("domain"),
  routingLogic: text("routing_logic"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IntakeRoutingLogic = typeof intakeRoutingLogic.$inferSelect;
export type InsertIntakeRoutingLogic = typeof intakeRoutingLogic.$inferInsert;

export const investigativeJobs = pgTable("investigative_jobs", {
  jobId: text("job_id").notNull(),
  jobType: text("job_type").notNull(),
  streamId: text("stream_id"),
  cursorId: text("cursor_id"),
  status: text("status").notNull(),
  params: jsonb("params").default(sql`'{}'::jsonb`).notNull(),
  result: jsonb("result").default(sql`'{}'::jsonb`).notNull(),
  error: text("error"),
  functionId: text("function_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type InvestigativeJobs = typeof investigativeJobs.$inferSelect;
export type InsertInvestigativeJobs = typeof investigativeJobs.$inferInsert;

export const legalCaseLaw = pgTable("legal_case_law", {
  id: uuid("id").defaultRandom().primaryKey(),
  citation: text("citation").notNull(),
  jurisdiction: text("jurisdiction"),
  title: text("title"),
  opinionText: text("opinion_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LegalCaseLaw = typeof legalCaseLaw.$inferSelect;
export type InsertLegalCaseLaw = typeof legalCaseLaw.$inferInsert;

export const legalDefinitions = pgTable("legal_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  definedTerm: text("defined_term").notNull(),
  definitionText: text("definition_text").notNull(),
  jurisdiction: text("jurisdiction"),
  sourceRef: text("source_ref"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LegalDefinitions = typeof legalDefinitions.$inferSelect;
export type InsertLegalDefinitions = typeof legalDefinitions.$inferInsert;

export const legalEnforcementRecords = pgTable("legal_enforcement_records", {
  id: serial("id").primaryKey(),
  jurisdiction: text("jurisdiction"),
  agencyName: text("agencyName"),
  complaintType: text("complaintType"),
  domains: text("domains"),
  statutoryRequirement: text("statutoryRequirement"),
  statuteCitation: text("statuteCitation"),
  outcome: text("outcome"),
  requiredResponseDays: text("requiredResponseDays"),
  observedResponseDays: text("observedResponseDays"),
  patternDescription: text("patternDescription"),
  dataSource: text("dataSource"),
  periodStart: text("periodStart"),
  periodEnd: text("periodEnd"),
  addedBy: text("addedBy"),
  createdAt: bigint("createdAt", { mode: "number" }),
  updatedAt: bigint("updatedAt", { mode: "number" }),
});

export type LegalEnforcementRecord = typeof legalEnforcementRecords.$inferSelect;
export type InsertLegalEnforcementRecord = typeof legalEnforcementRecords.$inferInsert;

export const legalStatuteKeyText = pgTable("legal_statute_key_text", {
  id: uuid("id").defaultRandom().primaryKey(),
  citation: text("citation"),
  jurisdiction: text("jurisdiction"),
  shortTitle: text("short_title"),
  practicalNote: text("practical_note"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LegalStatuteKeyText = typeof legalStatuteKeyText.$inferSelect;
export type InsertLegalStatuteKeyText = typeof legalStatuteKeyText.$inferInsert;

export const legalStatutes = pgTable("legal_statutes", {
  id: uuid("id").defaultRandom().primaryKey(),
  citation: text("citation").notNull(),
  jurisdiction: text("jurisdiction"),
  title: text("title"),
  statuteText: text("statute_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LegalStatute = typeof legalStatutes.$inferSelect;
export type InsertLegalStatute = typeof legalStatutes.$inferInsert;

export const legalWeakJoints = pgTable("legal_weak_joints", {
  id: uuid("id").defaultRandom().primaryKey(),
  weakJointId: text("weak_joint_id"),
  title: text("title"),
  description: text("description"),
  severityLevel: text("severity_level"),
  severityRationale: text("severity_rationale"),
  reformStatus: text("reform_status"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LegalWeakJoint = typeof legalWeakJoints.$inferSelect;
export type InsertLegalWeakJoint = typeof legalWeakJoints.$inferInsert;

export const liveStreamEvents = pgTable("live_stream_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  streamSourceId: uuid("stream_source_id").notNull(),
  eventKey: text("event_key"),
  rawPayload: jsonb("raw_payload").notNull(),
  sourceHash: text("source_hash"),
  eventTime: timestamp("event_time", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LiveStreamEvents = typeof liveStreamEvents.$inferSelect;
export type InsertLiveStreamEvents = typeof liveStreamEvents.$inferInsert;

export const liveStreamSources = pgTable("live_stream_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(),
  sourceConfig: jsonb("source_config").default(sql`'{}'::jsonb`).notNull(),
  isActive: boolean("is_active").default(sql`true`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LiveStreamSources = typeof liveStreamSources.$inferSelect;
export type InsertLiveStreamSources = typeof liveStreamSources.$inferInsert;

export const machineOutputs = pgTable("machine_outputs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  machineKey: text("machine_key"),
  outputKey: text("output_key").notNull(),
  outputName: text("output_name"),
  outputType: text("output_type"),
  layerClassification: text("layer_classification"),
  description: text("description"),
});

export type MachineOutputs = typeof machineOutputs.$inferSelect;
export type InsertMachineOutputs = typeof machineOutputs.$inferInsert;

export const machineVerificationRequirements = pgTable("machine_verification_requirements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  machineKey: text("machine_key"),
  requirementKey: text("requirement_key").notNull(),
  requirementDescription: text("requirement_description"),
  status: text("status").default(sql`'pending'::text`),
  proofSource: text("proof_source"),
});

export type MachineVerificationRequirements = typeof machineVerificationRequirements.$inferSelect;
export type InsertMachineVerificationRequirements = typeof machineVerificationRequirements.$inferInsert;

export const metadataMachines = pgTable("metadata_machines", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  machineKey: text("machine_key").notNull(),
  displayName: text("display_name").notNull(),
  packageKey: text("package_key"),
  canonicalPlatform: text("canonical_platform"),
  classification: text("classification"),
  canonicalRole: text("canonical_role"),
  lineageStatus: text("lineage_status"),
  implementationStatus: text("implementation_status"),
  verificationBoundary: text("verification_boundary"),
  metadataStatus: text("metadata_status").default(sql`'metadata_wrapped'::text`),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type MetadataMachines = typeof metadataMachines.$inferSelect;
export type InsertMetadataMachines = typeof metadataMachines.$inferInsert;

export const nationalResources = pgTable("national_resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  resourceId: text("resource_id"),
  resourceName: text("resource_name"),
  resourceType: text("resource_type"),
  jurisdiction: text("jurisdiction"),
  serviceCategory: text("service_category"),
  phone: text("phone"),
  website: text("website"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NationalResources = typeof nationalResources.$inferSelect;
export type InsertNationalResources = typeof nationalResources.$inferInsert;

export const normalizedCivicResource = pgTable("normalized_civic_resource", {
  id: uuid("id").defaultRandom().primaryKey(),
  rawRecordId: uuid("raw_record_id"),
  sourceId: uuid("source_id").notNull(),
  pullRunId: uuid("pull_run_id").notNull(),
  resourceType: text("resource_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  organizationName: text("organization_name"),
  agencyName: text("agency_name"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  county: text("county"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default(sql`'US'::text`),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  geocodePrecision: text("geocode_precision"),
  phone: text("phone"),
  email: text("email"),
  websiteUrl: text("website_url"),
  serviceCategories: text("service_categories").array().default(sql`'{}'::text[]`),
  eligibilitySummary: text("eligibility_summary"),
  hours: jsonb("hours").default(sql`'{}'::jsonb`),
  languages: text("languages").array().default(sql`'{}'::text[]`),
  accessibilityFeatures: text("accessibility_features").array().default(sql`'{}'::text[]`),
  normalizedPayload: jsonb("normalized_payload").default(sql`'{}'::jsonb`),
  normalizationConfidence: numeric("normalization_confidence"),
  normalizationNotes: text("normalization_notes"),
  sourceSnapshotHash: text("source_snapshot_hash"),
  rawPayloadHash: text("raw_payload_hash").notNull(),
  normalizedRecordHash: text("normalized_record_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type NormalizedCivicResource = typeof normalizedCivicResource.$inferSelect;
export type InsertNormalizedCivicResource = typeof normalizedCivicResource.$inferInsert;

export const normalizedRecords = pgTable("normalized_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceRecordId: uuid("source_record_id").notNull(),
  entryRunId: uuid("entry_run_id").notNull(),
  caseId: uuid("case_id"),
  targetDomain: targetDomainEnum("target_domain").default(sql`'case_truth'::target_domain_enum`).notNull(),
  recordType: text("record_type").notNull(),
  schemaName: text("schema_name"),
  schemaVersion: text("schema_version"),
  normalizedPayload: jsonb("normalized_payload").notNull(),
  normalizedHash: text("normalized_hash").notNull(),
  status: recordStatusEnum("status").default(sql`'normalized'::record_status_enum`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NormalizedRecords = typeof normalizedRecords.$inferSelect;
export type InsertNormalizedRecords = typeof normalizedRecords.$inferInsert;

export const packageClassification = pgTable("package_classification", {
  packageKey: text("package_key"),
  artifactStatus: text("artifact_status"),
  fileCount: bigint("file_count", { mode: "number" }),
  totalSizeKb: numeric("total_size_kb"),
});

export type PackageClassification = typeof packageClassification.$inferSelect;
export type InsertPackageClassification = typeof packageClassification.$inferInsert;

export const packageRegistry = pgTable("package_registry", {
  packageKey: text("package_key").notNull(),
  packageName: text("package_name").notNull(),
  canonicalPlatform: text("canonical_platform"),
  classification: text("classification"),
  canonicalRole: text("canonical_role"),
  packageStatus: text("package_status").default(sql`'declared'::text`),
  verificationStatus: text("verification_status").default(sql`'metadata_wrapped'::text`),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type PackageRegistry = typeof packageRegistry.$inferSelect;
export type InsertPackageRegistry = typeof packageRegistry.$inferInsert;

export const patternLinks = pgTable("pattern_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  patternId: uuid("pattern_id").notNull(),
  signalId: uuid("signal_id").notNull(),
});

export type PatternLinks = typeof patternLinks.$inferSelect;
export type InsertPatternLinks = typeof patternLinks.$inferInsert;

export const patternScope = pgTable("pattern_scope", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  patternId: uuid("pattern_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  geographicScope: jsonb("geographic_scope").default(sql`'[]'::jsonb`).notNull(),
  temporalScope: jsonb("temporal_scope").default(sql`'{}'::jsonb`).notNull(),
  populationScope: jsonb("population_scope").default(sql`'{}'::jsonb`).notNull(),
  institutionalScope: jsonb("institutional_scope").default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PatternScope = typeof patternScope.$inferSelect;
export type InsertPatternScope = typeof patternScope.$inferInsert;

export const patterns = pgTable("patterns", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  patternType: text("pattern_type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Pattern = typeof patterns.$inferSelect;
export type InsertPattern = typeof patterns.$inferInsert;

export const pipelineAuditLogs = pgTable("pipeline_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pipelineRunId: uuid("pipeline_run_id"),
  caseId: uuid("case_id"),
  snapshotId: uuid("snapshot_id"),
  eventType: text("event_type").notNull(),
  eventPayload: jsonb("event_payload").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PipelineAuditLogs = typeof pipelineAuditLogs.$inferSelect;
export type InsertPipelineAuditLogs = typeof pipelineAuditLogs.$inferInsert;

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  status: runStatusEnum("status").default(sql`'pending'::run_status_enum`).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  rulesetVersion: text("ruleset_version"),
  errorMessage: text("error_message"),
});

export type PipelineRuns = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRuns = typeof pipelineRuns.$inferInsert;

export const primePatterns = pgTable("prime_patterns", {
  patternId: text("pattern_id").notNull(),
  patternType: text("pattern_type").notNull(),
  module: text("module").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  streamId: text("stream_id"),
  jobId: text("job_id"),
  confidence: numeric("confidence").default(sql`0`).notNull(),
  severity: text("severity").default(sql`'info'::text`).notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  summary: text("summary").notNull(),
  evidence: jsonb("evidence").default(sql`'{}'::jsonb`).notNull(),
  payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PrimePatterns = typeof primePatterns.$inferSelect;
export type InsertPrimePatterns = typeof primePatterns.$inferInsert;

export const proceduralOutputs = pgTable("procedural_outputs", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id").notNull(),
  outputType: text("output_type").notNull(),
  outputText: text("output_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProceduralOutput = typeof proceduralOutputs.$inferSelect;
export type InsertProceduralOutput = typeof proceduralOutputs.$inferInsert;

export const quotes = pgTable("quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  documentId: uuid("document_id"),
  normalizedRecordId: uuid("normalized_record_id"),
  quoteText: text("quote_text").notNull(),
  anchorRef: text("anchor_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Quote = typeof quotes.$inferSelect;

export const rawApiRecord = pgTable("raw_api_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull(),
  pullRunId: uuid("pull_run_id").notNull(),
  externalRecordId: text("external_record_id"),
  externalRecordUrl: text("external_record_url"),
  sourceTableOrEndpoint: text("source_table_or_endpoint"),
  sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  rawPayload: jsonb("raw_payload").notNull(),
  rawPayloadHash: text("raw_payload_hash").notNull(),
  recordFingerprint: text("record_fingerprint").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow(),
  retrievalMethod: text("retrieval_method").default(sql`'api_pull'::text`),
  provenanceStatus: text("provenance_status").default(sql`'raw_pulled'::text`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type RawApiRecord = typeof rawApiRecord.$inferSelect;
export type InsertRawApiRecord = typeof rawApiRecord.$inferInsert;

export const recoveryProjections = pgTable("recovery_projections", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectionId: text("projection_id"),
  claimType: text("claim_type"),
  jurisdiction: text("jurisdiction"),
  remedyType: text("remedy_type"),
  baseEstimate: text("base_estimate"),
  timeline: text("timeline"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RecoveryProjections = typeof recoveryProjections.$inferSelect;
export type InsertRecoveryProjections = typeof recoveryProjections.$inferInsert;

export const reformPackages = pgTable("reform_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageId: text("package_id"),
  title: text("title"),
  domain: text("domain"),
  patternDetected: text("pattern_detected"),
  executiveSummary: text("executive_summary"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ReformPackages = typeof reformPackages.$inferSelect;
export type InsertReformPackages = typeof reformPackages.$inferInsert;

export const remedyTemplates = pgTable("remedy_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: text("template_id"),
  templateName: text("template_name"),
  templateType: text("template_type"),
  claimType: text("claim_type"),
  jurisdiction: text("jurisdiction"),
  templateText: text("template_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RemedyTemplates = typeof remedyTemplates.$inferSelect;
export type InsertRemedyTemplates = typeof remedyTemplates.$inferInsert;

export const riskScores = pgTable("risk_scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  riskType: text("risk_type").notNull(),
  riskScore: numeric("risk_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RiskScores = typeof riskScores.$inferSelect;
export type InsertRiskScores = typeof riskScores.$inferInsert;

export const settlementFormulas = pgTable("settlement_formulas", {
  id: uuid("id").defaultRandom().primaryKey(),
  formulaId: text("formula_id"),
  claimType: text("claim_type"),
  damageType: text("damage_type"),
  jurisdiction: text("jurisdiction"),
  formulaText: text("formula_text"),
  sourceLaw: text("source_law"),
  statuteSection: text("statute_section"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SettlementFormulas = typeof settlementFormulas.$inferSelect;
export type InsertSettlementFormulas = typeof settlementFormulas.$inferInsert;

export const signalClusterLinks = pgTable("signal_cluster_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  signalClusterId: uuid("signal_cluster_id").notNull(),
  streamSignalFlagId: uuid("stream_signal_flag_id"),
  detectedSignalId: uuid("detected_signal_id"),
});

export type SignalClusterLinks = typeof signalClusterLinks.$inferSelect;
export type InsertSignalClusterLinks = typeof signalClusterLinks.$inferInsert;

export const signalClusters = pgTable("signal_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  clusterType: text("cluster_type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SignalClusters = typeof signalClusters.$inferSelect;
export type InsertSignalClusters = typeof signalClusters.$inferInsert;

export const signalEvents = pgTable("signal_events", {
  streamId: text("stream_id").notNull(),
  offset: bigint("offset", { mode: "number" }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  signalType: text("signal_type").notNull(),
  spacetime: jsonb("spacetime").notNull(),
  provenance: jsonb("provenance").notNull(),
  payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
  sourceId: text("source_id").notNull(),
  jurisdictionId: text("jurisdiction_id").notNull(),
  moduleHint: text("module_hint").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SignalEvents = typeof signalEvents.$inferSelect;
export type InsertSignalEvents = typeof signalEvents.$inferInsert;

export const signalSourceLink = pgTable("signal_source_link", {
  id: uuid("id").defaultRandom().primaryKey(),
  signalId: uuid("signal_id").notNull(),
  signalTable: text("signal_table").notNull(),
  rawRecordId: uuid("raw_record_id"),
  normalizedResourceId: uuid("normalized_resource_id"),
  resourceBridgeId: uuid("resource_bridge_id"),
  signalBridgeId: uuid("signal_bridge_id"),
  legalBridgeId: uuid("legal_bridge_id"),
  sourceId: uuid("source_id"),
  pullRunId: uuid("pull_run_id"),
  signalGenerationRunId: uuid("signal_generation_run_id"),
  signalRuleId: text("signal_rule_id").notNull(),
  signalRuleVersion: text("signal_rule_version").notNull(),
  sourceSystem: text("source_system"),
  originType: text("origin_type"),
  evidenceBasis: text("evidence_basis"),
  confidenceScore: numeric("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SignalSourceLink = typeof signalSourceLink.$inferSelect;
export type InsertSignalSourceLink = typeof signalSourceLink.$inferInsert;

export const snapshotIntegrityChecks = pgTable("snapshot_integrity_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").notNull(),
  checkName: text("check_name").notNull(),
  checkResult: text("check_result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SnapshotIntegrityChecks = typeof snapshotIntegrityChecks.$inferSelect;
export type InsertSnapshotIntegrityChecks = typeof snapshotIntegrityChecks.$inferInsert;

export const snapshots = pgTable("snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  entryRunId: uuid("entry_run_id"),
  snapshotHash: text("snapshot_hash").notNull(),
  status: text("status").default(sql`'open'::text`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sealedAt: timestamp("sealed_at", { withTimezone: true }),
});

export type Snapshots = typeof snapshots.$inferSelect;
export type InsertSnapshots = typeof snapshots.$inferInsert;

export const sourceRecords = pgTable("source_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryChannel: entryChannelEnum("entry_channel").notNull(),
  targetDomain: targetDomainEnum("target_domain").default(sql`'case_truth'::target_domain_enum`).notNull(),
  entryRunId: uuid("entry_run_id").notNull(),
  caseId: uuid("case_id"),
  intakeRecordId: uuid("intake_record_id"),
  ingestedRecordId: uuid("ingested_record_id"),
  sourcePayload: jsonb("source_payload").notNull(),
  sourcePayloadHash: text("source_payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SourceRecords = typeof sourceRecords.$inferSelect;
export type InsertSourceRecords = typeof sourceRecords.$inferInsert;

export const stateLaborBoardPathways = pgTable("state_labor_board_pathways", {
  id: uuid("id").defaultRandom().primaryKey(),
  pathwayId: text("pathway_id"),
  state: text("state"),
  agencyName: text("agency_name"),
  jurisdiction: text("jurisdiction"),
  filingUrl: text("filing_url"),
  phone: text("phone"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StateLaborBoardPathways = typeof stateLaborBoardPathways.$inferSelect;
export type InsertStateLaborBoardPathways = typeof stateLaborBoardPathways.$inferInsert;

export const strategyPaths = pgTable("strategy_paths", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  pipelineRunId: uuid("pipeline_run_id"),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StrategyPath = typeof strategyPaths.$inferSelect;
export type InsertStrategyPath = typeof strategyPaths.$inferInsert;

export const streamSignalFlags = pgTable("stream_signal_flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  liveStreamEventId: uuid("live_stream_event_id").notNull(),
  signalType: text("signal_type").notNull(),
  signalDescription: text("signal_description"),
  severity: signalSeverityEnum("severity").default(sql`'medium'::signal_severity_enum`).notNull(),
  confidenceScore: numeric("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StreamSignalFlags = typeof streamSignalFlags.$inferSelect;
export type InsertStreamSignalFlags = typeof streamSignalFlags.$inferInsert;

export const streams = pgTable("streams", {
  streamId: text("stream_id").notNull(),
  sourceId: text("source_id").notNull(),
  jurisdictionId: text("jurisdiction_id").notNull(),
  moduleHint: text("module_hint").notNull(),
  throughputProfile: text("throughput_profile").notNull(),
  safetyProfile: text("safety_profile").notNull(),
  governanceContractId: text("governance_contract_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Streams = typeof streams.$inferSelect;
export type InsertStreams = typeof streams.$inferInsert;

export const systemHealthLogs = pgTable("system_health_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  componentName: text("component_name").notNull(),
  status: text("status").notNull(),
  details: jsonb("details").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SystemHealthLogs = typeof systemHealthLogs.$inferSelect;
export type InsertSystemHealthLogs = typeof systemHealthLogs.$inferInsert;

export const unverifiedFiles = pgTable("unverified_files", {
  fileName: text("file_name"),
  fileType: text("file_type"),
  artifactStatus: text("artifact_status"),
  verificationSource: text("verification_source"),
  flag: text("flag"),
});

export type UnverifiedFiles = typeof unverifiedFiles.$inferSelect;
export type InsertUnverifiedFiles = typeof unverifiedFiles.$inferInsert;

export const vApiPullProvenanceSummary = pgTable("v_api_pull_provenance_summary", {
  sourceId: uuid("source_id"),
  sourceKey: text("source_key"),
  sourceName: text("source_name"),
  sourceType: text("source_type"),
  domain: text("domain"),
  jurisdictionScope: text("jurisdiction_scope"),
  geographicScope: text("geographic_scope"),
  isActive: boolean("is_active"),
  totalPullRuns: bigint("total_pull_runs", { mode: "number" }),
  successRuns: bigint("success_runs", { mode: "number" }),
  failedRuns: bigint("failed_runs", { mode: "number" }),
  totalRawRecords: bigint("total_raw_records", { mode: "number" }),
  normalizedRecords: bigint("normalized_records", { mode: "number" }),
  rejectedRecords: bigint("rejected_records", { mode: "number" }),
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  lastRecordAt: timestamp("last_record_at", { withTimezone: true }),
});

export type VApiPullProvenanceSummary = typeof vApiPullProvenanceSummary.$inferSelect;
export type InsertVApiPullProvenanceSummary = typeof vApiPullProvenanceSummary.$inferInsert;

export const vAtlasLighthouseBridgeV1Verified = pgTable("v_atlas_lighthouse_bridge_v1_verified", {
  bridgeRecordId: uuid("bridge_record_id"),
  atlasSignalId: bigint("atlas_signal_id", { mode: "number" }),
  signalType: text("signal_type"),
  sourceSystem: text("source_system"),
  bridgeVersion: text("bridge_version"),
  sourceConnectorId: uuid("source_connector_id"),
  rawRecordId: uuid("raw_record_id"),
  statuteId: uuid("statute_id"),
  entityIds: text("entity_ids").array(),
  jurisdictionRawValue: text("jurisdiction_raw_value"),
  jurisdictionId: text("jurisdiction_id"),
  sourceUrl: text("source_url"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }),
  confidenceScore: numeric("confidence_score"),
  severity: text("severity"),
  signalStatus: text("signal_status"),
  ruleId: text("rule_id"),
  ruleVersion: text("rule_version"),
  generationMethod: text("generation_method"),
  recordOrigin: text("record_origin"),
  verificationStatus: text("verification_status"),
  evidencePayload: jsonb("evidence_payload"),
  provenanceMetadata: jsonb("provenance_metadata"),
  atlasMetadataJson: jsonb("atlas_metadata_json"),
  atlasSignalDedupKey: text("atlas_signal_dedup_key"),
  sourceView: text("source_view"),
  bridgeMetadata: jsonb("bridge_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type VAtlasLighthouseBridgeV1Verified = typeof vAtlasLighthouseBridgeV1Verified.$inferSelect;
export type InsertVAtlasLighthouseBridgeV1Verified = typeof vAtlasLighthouseBridgeV1Verified.$inferInsert;

export const vAtlasLighthouseJudicialBridgeV1Verified = pgTable("v_atlas_lighthouse_judicial_bridge_v1_verified", {
  bridgeRecordId: uuid("bridge_record_id"),
  atlasSignalId: bigint("atlas_signal_id", { mode: "number" }),
  signalType: text("signal_type"),
  sourceSystem: text("source_system"),
  bridgeVersion: text("bridge_version"),
  sourceConnectorId: uuid("source_connector_id"),
  rawRecordId: uuid("raw_record_id"),
  caseLawId: uuid("case_law_id"),
  entityIds: text("entity_ids").array(),
  jurisdictionRawValue: text("jurisdiction_raw_value"),
  jurisdictionId: text("jurisdiction_id"),
  sourceUrl: text("source_url"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }),
  confidenceScore: numeric("confidence_score"),
  severity: text("severity"),
  signalStatus: text("signal_status"),
  ruleId: text("rule_id"),
  ruleVersion: text("rule_version"),
  generationMethod: text("generation_method"),
  recordOrigin: text("record_origin"),
  verificationStatus: text("verification_status"),
  evidencePayload: jsonb("evidence_payload"),
  provenanceMetadata: jsonb("provenance_metadata"),
  atlasMetadataJson: jsonb("atlas_metadata_json"),
  atlasSignalDedupKey: text("atlas_signal_dedup_key"),
  sourceView: text("source_view"),
  bridgeMetadata: jsonb("bridge_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type VAtlasLighthouseJudicialBridgeV1Verified = typeof vAtlasLighthouseJudicialBridgeV1Verified.$inferSelect;
export type InsertVAtlasLighthouseJudicialBridgeV1Verified = typeof vAtlasLighthouseJudicialBridgeV1Verified.$inferInsert;

export const vLighthouseAtlasChainDisplay = pgTable("v_lighthouse_atlas_chain_display", {
  atlasNumber: integer("atlas_number"),
  caseNumber: text("case_number"),
  caseId: uuid("case_id"),
  caseTitle: text("case_title"),
  caseDescription: text("case_description"),
  sourceJurisdictionRaw: text("source_jurisdiction_raw"),
  displayJurisdiction: text("display_jurisdiction"),
  jurisdictionStatus: text("jurisdiction_status"),
  domain: text("domain"),
  caseStatus: text("case_status"),
  snapshotId: uuid("snapshot_id"),
  snapshotHash: text("snapshot_hash"),
  pipelineRunId: uuid("pipeline_run_id"),
  pipelineStatus: runStatusEnum("pipeline_status"),
  claimId: uuid("claim_id"),
  claimText: text("claim_text"),
  findingId: uuid("finding_id"),
  findingText: text("finding_text"),
  detectedSignalId: uuid("detected_signal_id"),
  signalType: text("signal_type"),
  signalDescription: text("signal_description"),
  severity: signalSeverityEnum("severity"),
  confidenceScore: numeric("confidence_score"),
  caseCreatedAt: timestamp("case_created_at", { withTimezone: true }),
  detectedSignalCreatedAt: timestamp("detected_signal_created_at", { withTimezone: true }),
  strictChainVerified: boolean("strict_chain_verified"),
  provenanceSourceSummary: jsonb("provenance_source_summary"),
});

export type VLighthouseAtlasChainDisplay = typeof vLighthouseAtlasChainDisplay.$inferSelect;
export type InsertVLighthouseAtlasChainDisplay = typeof vLighthouseAtlasChainDisplay.$inferInsert;

export const vLighthouseNativeSignals = pgTable("v_lighthouse_native_signals", {
  signalId: uuid("signal_id"),
  signalType: text("signal_type"),
  signalDescription: text("signal_description"),
  severity: text("severity"),
  confidenceScore: numeric("confidence_score"),
  originType: text("origin_type"),
  sourceSystem: text("source_system"),
  state: text("state"),
  county: text("county"),
  city: text("city"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  signalFingerprint: text("signal_fingerprint"),
  signalHash: text("signal_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});

export type VLighthouseNativeSignals = typeof vLighthouseNativeSignals.$inferSelect;
export type InsertVLighthouseNativeSignals = typeof vLighthouseNativeSignals.$inferInsert;

export const vLighthouseVerifiedLegalSignalsV1 = pgTable("v_lighthouse_verified_legal_signals_v1", {
  signalFamily: text("signal_family"),
  bridgeRecordId: uuid("bridge_record_id"),
  atlasSignalId: bigint("atlas_signal_id", { mode: "number" }),
  signalType: text("signal_type"),
  sourceSystem: text("source_system"),
  bridgeVersion: text("bridge_version"),
  sourceConnectorId: uuid("source_connector_id"),
  rawRecordId: uuid("raw_record_id"),
  statuteId: uuid("statute_id"),
  caseLawId: uuid("case_law_id"),
  entityIds: text("entity_ids").array(),
  jurisdictionRawValue: text("jurisdiction_raw_value"),
  jurisdictionId: text("jurisdiction_id"),
  sourceUrl: text("source_url"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  bridgedAt: timestamp("bridged_at", { withTimezone: true }),
  confidenceScore: numeric("confidence_score"),
  severity: text("severity"),
  signalStatus: text("signal_status"),
  ruleId: text("rule_id"),
  ruleVersion: text("rule_version"),
  generationMethod: text("generation_method"),
  recordOrigin: text("record_origin"),
  verificationStatus: text("verification_status"),
  evidencePayload: jsonb("evidence_payload"),
  provenanceMetadata: jsonb("provenance_metadata"),
  atlasMetadataJson: jsonb("atlas_metadata_json"),
  atlasSignalDedupKey: text("atlas_signal_dedup_key"),
  sourceView: text("source_view"),
  bridgeMetadata: jsonb("bridge_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type VLighthouseVerifiedLegalSignalsV1 = typeof vLighthouseVerifiedLegalSignalsV1.$inferSelect;
export type InsertVLighthouseVerifiedLegalSignalsV1 = typeof vLighthouseVerifiedLegalSignalsV1.$inferInsert;

export const vUnprovenAtlasSignalClaims = pgTable("v_unproven_atlas_signal_claims", {
  signalId: uuid("signal_id"),
  signalType: text("signal_type"),
  signalDescription: text("signal_description"),
  severity: text("severity"),
  confidenceScore: numeric("confidence_score"),
  originType: text("origin_type"),
  sourceSystem: text("source_system"),
  state: text("state"),
  county: text("county"),
  city: text("city"),
  signalFingerprint: text("signal_fingerprint"),
  signalHash: text("signal_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  resourceBridgeId: uuid("resource_bridge_id"),
  signalBridgeId: uuid("signal_bridge_id"),
  legalBridgeId: uuid("legal_bridge_id"),
});

export type VUnprovenAtlasSignalClaims = typeof vUnprovenAtlasSignalClaims.$inferSelect;
export type InsertVUnprovenAtlasSignalClaims = typeof vUnprovenAtlasSignalClaims.$inferInsert;

export const verificationAudit = pgTable("verification_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fileId: bigint("file_id", { mode: "number" }),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  verificationSource: text("verification_source"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow(),
  notes: text("notes"),
});

export type VerificationAudit = typeof verificationAudit.$inferSelect;
export type InsertVerificationAudit = typeof verificationAudit.$inferInsert;

export const verificationCompleteness = pgTable("verification_completeness", {
  percentAccountedFor: numeric("percent_accounted_for"),
  accountedFiles: bigint("accounted_files", { mode: "number" }),
  totalFiles: bigint("total_files", { mode: "number" }),
});

export type VerificationCompleteness = typeof verificationCompleteness.$inferSelect;
export type InsertVerificationCompleteness = typeof verificationCompleteness.$inferInsert;

export const verificationStatusSummary = pgTable("verification_status_summary", {
  artifactStatus: text("artifact_status"),
  fileCount: bigint("file_count", { mode: "number" }),
  files: text("files"),
});

export type VerificationStatusSummary = typeof verificationStatusSummary.$inferSelect;
export type InsertVerificationStatusSummary = typeof verificationStatusSummary.$inferInsert;

export const workflowSteps = pgTable("workflow_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: text("workflow_id"),
  stepOrder: text("step_order"),
  title: text("title"),
  stepType: text("step_type"),
  decisionLogic: text("decision_logic"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkflowStepRecord = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

// ─── Legacy Luminari tables not present in Lighthouse schema yet ───

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: pgEnum("users_role_enum", ["user", "admin"])("role").default("user").notNull(),
  plan: pgEnum("users_plan_enum", ["free", "advocacy", "family_advocacy", "analyst", "professional", "enterprise"])("plan").default("free").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  lastSignedIn: bigint("lastSignedIn", { mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const corpusSnapshots = pgTable("corpus_snapshots", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  version: integer("version").notNull(),
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  documentIds: jsonb("documentIds").notNull().$type<number[]>(),
  documentHashes: jsonb("documentHashes").notNull().$type<Record<string, string>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  sealedAt: bigint("sealedAt", { mode: "number" }),
  status: pgEnum("corpus_snapshots_snapshot_status_enum", ["open", "sealed"])("snapshotStatus").default("open").notNull(),
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

export const luminariCases = pgTable("luminari_cases", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  jurisdictionId: integer("jurisdictionId").notNull(), // FK to luminari_registry.jurisdictions
  category: varchar("category", { length: 64 }).notNull(), // housing, employment, benefits, healthcare, disability, other
  selectedWorkflowId: integer("selectedWorkflowId").notNull(), // FK to luminari_registry.layer2_workflows
  status: pgEnum("luminari_cases_status_enum", ["active", "completed", "archived"])("status").default("active").notNull(),
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

export const luminariCaseNotes = pgTable("luminari_case_notes", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_notes_case").on(table.caseId),
]);

export type LuminariCaseNote = typeof luminariCaseNotes.$inferSelect;
export type InsertLuminariCaseNote = typeof luminariCaseNotes.$inferInsert;

export const luminariCaseEvents = pgTable("luminari_case_events", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // step_completed, action_recorded, note_added, status_changed
  eventData: jsonb("eventData").notNull().$type<Record<string, any>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_events_case").on(table.caseId),
  index("idx_case_events_type").on(table.eventType),
]);

export type LuminariCaseEvent = typeof luminariCaseEvents.$inferSelect;
export type InsertLuminariCaseEvent = typeof luminariCaseEvents.$inferInsert;

export const luminariCaseActions = pgTable("luminari_case_actions", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  actionType: varchar("actionType", { length: 64 }).notNull(), // step_completed, contact_made, document_filed, etc.
  metadata: jsonb("metadata").notNull().$type<Record<string, any>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_case_actions_case").on(table.caseId),
  index("idx_case_actions_type").on(table.actionType),
]);

export type LuminariCaseAction = typeof luminariCaseActions.$inferSelect;
export type InsertLuminariCaseAction = typeof luminariCaseActions.$inferInsert;

export const entityRoles = pgTable("entity_roles", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull(),
  documentId: integer("documentId").notNull(),
  role: varchar("role", { length: 128 }).notNull(), // Defendant, Victim-Witness, Caseworker, Judge, etc.
  quoteId: integer("quoteId"), // evidence for this role assignment
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
}, (table) => [
  index("idx_er_entity").on(table.entityId),
  index("idx_er_doc").on(table.documentId),
]);

export type EntityRole = typeof entityRoles.$inferSelect;

export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  sourceEntityId: integer("sourceEntityId").notNull(),
  targetEntityId: integer("targetEntityId").notNull(),
  relationshipType: varchar("relationshipType", { length: 128 }).notNull(),
  description: text("description"), // plain-language description
  evidenceCount: integer("evidenceCount").default(0),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: integer("snapshotId").notNull(),
}, (table) => [
  index("idx_rels_case").on(table.caseId),
  index("idx_rels_source").on(table.sourceEntityId),
  index("idx_rels_target").on(table.targetEntityId),
  index("idx_rels_lane").on(table.laneId),
  index("idx_rels_snapshot").on(table.snapshotId),
]);

export type Relationship = typeof relationships.$inferSelect;

export const relationshipEvidence = pgTable("relationship_evidence", {
  id: serial("id").primaryKey(),
  relationshipId: integer("relationshipId").notNull(),
  quoteId: integer("quoteId").notNull(),
  explanation: text("explanation"), // how this quote supports the relationship
}, (table) => [
  index("idx_re_rel").on(table.relationshipId),
  index("idx_re_quote").on(table.quoteId),
]);

export type RelationshipEvidence = typeof relationshipEvidence.$inferSelect;

export const signalFlags = pgTable("signal_flags", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  documentId: integer("documentId").notNull(),
  flagType: varchar("flagType", { length: 64 }).notNull(),
  description: text("description"),
  quoteId: integer("quoteId"),
  // Engine version stamping (Gate 4)
  engineVersion: varchar("engineVersion", { length: 256 }).notNull(),
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: integer("snapshotId").notNull(),
  // Sunam gate status (Signal Flow Engine)
  sunamStatus: pgEnum("signal_flags_sunam_status_enum", ["pending", "approved", "rejected", "deferred"])("sunamStatus").default("pending").notNull(),
  // Confidence score from gate decision
  confidenceScore: numeric("confidenceScore", { precision: 5, scale: 2 }).default("0"),
}, (table) => [
  index("idx_flags_case").on(table.caseId),
  index("idx_flags_doc").on(table.documentId),
  index("idx_flags_lane").on(table.laneId),
  index("idx_flags_snapshot").on(table.snapshotId),
]);

export type SignalFlag = typeof signalFlags.$inferSelect;

export const documentCorrelations = pgTable("document_correlations", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  sourceDocumentId: integer("sourceDocumentId").notNull(),
  targetDocumentId: integer("targetDocumentId").notNull(),
  correlationType: varchar("correlationType", { length: 128 }).notNull(),
  description: text("description"),
  sharedIdentifiers: jsonb("sharedIdentifiers"), // string[]
  // Lane ID denormalization (Gate 5)
  laneId: varchar("laneId", { length: 256 }).notNull(),
  // Snapshot versioning (Gate 6)
  snapshotId: integer("snapshotId").notNull(),
}, (table) => [
  index("idx_corr_case").on(table.caseId),
  index("idx_corr_source").on(table.sourceDocumentId),
  index("idx_corr_target").on(table.targetDocumentId),
  index("idx_corr_lane").on(table.laneId),
  index("idx_corr_snapshot").on(table.snapshotId),
]);

export type DocumentCorrelation = typeof documentCorrelations.$inferSelect;

export const presentations = pgTable("presentations", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  snapshotId: integer("snapshotId"),
  slideCount: integer("slideCount").notNull().default(0),
  theme: varchar("theme", { length: 64 }).notNull().default("courtroom"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pres_case").on(table.caseId),
]);

export type Presentation = typeof presentations.$inferSelect;

export const presentationSlides = pgTable("presentation_slides", {
  id: serial("id").primaryKey(),
  presentationId: integer("presentationId").notNull(),
  orderIndex: integer("orderIndex").notNull(),
  slideType: varchar("slideType", { length: 64 }).notNull(), // title, finding, evidence_quote, timeline, entity_map, summary, custom
  title: varchar("title", { length: 512 }),
  content: text("content"), // markdown
  sourceCitations: jsonb("sourceCitations"), // { documentId, documentName, page, quote, claimId }[]
  notes: text("notes"), // speaker notes
  layout: varchar("layout", { length: 64 }).notNull().default("default"), // default, split, full_quote, evidence_grid
  metadata: jsonb("metadata"), // { findingId, entityIds, eventIds, correlationId, significance }
}, (table) => [
  index("idx_slides_pres").on(table.presentationId),
]);

export type PresentationSlide = typeof presentationSlides.$inferSelect;

export const entityMergeSuggestions = pgTable("entity_merge_suggestions", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  sourceEntityId: integer("sourceEntityId").notNull(), // entity to be merged (absorbed)
  targetEntityId: integer("targetEntityId").notNull(), // surviving entity
  confidence: doublePrecision("confidence").notNull(), // 0.0 - 1.0
  reason: text("reason").notNull(), // explanation of why these are likely duplicates
  status: pgEnum("entity_merge_suggestions_merge_status_enum", ["pending", "approved", "rejected"])("mergeStatus").default("pending").notNull(),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  reviewedBy: integer("reviewedBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_merge_case").on(table.caseId),
  index("idx_merge_source").on(table.sourceEntityId),
  index("idx_merge_target").on(table.targetEntityId),
  index("idx_merge_status").on(table.status),
]);

export type EntityMergeSuggestion = typeof entityMergeSuggestions.$inferSelect;

export const auditTrail = pgTable("audit_trail", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId"),
  userId: integer("userId"),
  action: varchar("action", { length: 128 }).notNull(), // upload, extract, analyze, export, view, edit, delete
  targetType: varchar("targetType", { length: 64 }), // document, entity, finding, presentation, export
  targetId: integer("targetId"),
  details: jsonb("details"),
  hash: varchar("hash", { length: 64 }).notNull(), // SHA-256 of this entry + previous hash
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_audit_case").on(table.caseId),
  index("idx_audit_action").on(table.action),
]);

export type AuditTrailEntry = typeof auditTrail.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  role: pgEnum("chat_messages_chat_role_enum", ["user", "assistant"])("chatRole").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations"), // { documentId, page, quote }[]
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_chat_case").on(table.caseId),
]);

export type ChatMessage = typeof chatMessages.$inferSelect;

export const uploadSessions = pgTable("upload_sessions", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  totalFiles: integer("totalFiles").notNull().default(0),
  completedFiles: integer("completedFiles").notNull().default(0),
  failedFiles: integer("failedFiles").notNull().default(0),
  duplicateFiles: integer("duplicateFiles").notNull().default(0),
  status: pgEnum("upload_sessions_session_status_enum", ["uploading", "processing", "complete", "failed", "expired"])("sessionStatus").default("uploading").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_upload_session_user").on(table.userId),
  index("idx_upload_session_case").on(table.caseId),
  index("idx_upload_session_status").on(table.status),
]);

export type UploadSession = typeof uploadSessions.$inferSelect;

export const provenanceAuditLogs = pgTable("provenance_audit_logs", {
  id: serial("id").primaryKey(),
  findingId: integer("findingId").notNull(),
  userId: integer("userId").notNull(),
  actionType: pgEnum("provenance_audit_logs_action_type_enum", ["re_run_matching", "mark_synthesis", "flag_for_review", "batch_rerun"])("actionType").notNull(),
  reason: text("reason"), // mandatory for mark_synthesis
  previousStatus: varchar("previousStatus", { length: 64 }).notNull(),
  newStatus: varchar("newStatus", { length: 64 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(), // action-specific details (match results, etc.)
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_prov_audit_finding").on(table.findingId),
  index("idx_prov_audit_user").on(table.userId),
  index("idx_prov_audit_action").on(table.actionType),
]);

export type ProvenanceAuditLog = typeof provenanceAuditLogs.$inferSelect;

export const batchRerunRuns = pgTable("batch_rerun_runs", {
  id: serial("id").primaryKey(),
  startedBy: integer("startedBy").notNull(), // userId
  status: pgEnum("batch_rerun_runs_status_enum", ["running", "completed", "aborted", "error"])("status").default("running").notNull(),
  totalFindings: integer("totalFindings").default(0).notNull(),
  processedCount: integer("processedCount").default(0).notNull(),
  resolvedCount: integer("resolvedCount").default(0).notNull(), // newly linked
  errorCount: integer("errorCount").default(0).notNull(),
  stillUnsupported: integer("stillUnsupported").default(0).notNull(),
  lastProcessedFindingId: integer("lastProcessedFindingId"), // for resume
  fallbackUsageCount: integer("fallbackUsageCount").default(0).notNull(),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  abortedAt: bigint("abortedAt", { mode: "number" }),
  runtimeMs: bigint("runtimeMs", { mode: "number" }),
}, (table) => [
  index("idx_batch_rerun_status").on(table.status),
  index("idx_batch_rerun_user").on(table.startedBy),
]);

export type BatchRerunRun = typeof batchRerunRuns.$inferSelect;

export const provenanceAlertEvents = pgTable("provenance_alert_events", {
  id: serial("id").primaryKey(),
  alertType: pgEnum("provenance_alert_events_alert_type_enum", ["PROVENANCE_DRIFT", "PROVENANCE_COVERAGE_DROP"])("alert_type").notNull(),
  metrics: jsonb("metrics").$type<{
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

export const caseCollaborators = pgTable("case_collaborators", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  accessLevel: pgEnum("case_collaborators_access_level_enum", ["READ_ONLY", "WRITE"])("accessLevel").default("READ_ONLY").notNull(),
  grantedBy: integer("grantedBy").notNull(),
  grantedAt: bigint("grantedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_collab_case_user").on(table.caseId, table.userId),
  index("idx_collab_user").on(table.userId),
  index("idx_collab_case").on(table.caseId),
]);

export type CaseCollaborator = typeof caseCollaborators.$inferSelect;

export const phase2Runs = pgTable("phase2_runs", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  snapshotId: integer("snapshotId").notNull(),
  engineVersionReference: varchar("engineVersionReference", { length: 256 }).notNull(),
  status: pgEnum("phase2_runs_phase2_status_enum", ["open", "complete", "error"])("phase2Status").default("open").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2runs_case").on(table.caseId),
  index("idx_p2runs_snapshot").on(table.snapshotId),
  index("idx_p2runs_status").on(table.status),
]);

export type Phase2Run = typeof phase2Runs.$inferSelect;

export const phase2EvidenceRequirements = pgTable("phase2_evidence_requirements", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  snapshotId: integer("snapshotId").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2er_run").on(table.runId),
  index("idx_p2er_snapshot").on(table.snapshotId),
]);

export type Phase2EvidenceRequirement = typeof phase2EvidenceRequirements.$inferSelect;

export const phase2StructuredNotes = pgTable("phase2_structured_notes", {
  id: serial("id").primaryKey(),
  runId: integer("runId").notNull(),
  snapshotId: integer("snapshotId").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  /** ISO 8601 temporal anchors extracted from snapshot date fields. Sorted ascending, deduplicated. */
  temporalAnchors: jsonb("temporalAnchors").$type<string[]>().default([]),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_p2sn_run").on(table.runId),
  index("idx_p2sn_snapshot").on(table.snapshotId),
]);

export type Phase2StructuredNote = typeof phase2StructuredNotes.$inferSelect;

export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  label: varchar("label", { length: 512 }).notNull(),
  description: text("description"),
  priority: pgEnum("checklist_items_priority_enum", ["critical", "important", "helpful"])("priority").default("important").notNull(),
  checked: boolean("checked").default(false).notNull(),
  checkedAt: bigint("checkedAt", { mode: "number" }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_checklist_case").on(table.caseId),
]);

export type ChecklistItem = typeof checklistItems.$inferSelect;

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  caseId: integer("caseId"),
  feedbackType: pgEnum("user_feedback_feedback_type_enum", ["suggestion", "question", "bug_report", "praise", "other"])("feedbackType").default("suggestion").notNull(),
  message: text("message").notNull(),
  currentPage: varchar("currentPage", { length: 256 }),
  pipelineType: varchar("pipelineType", { length: 64 }),
  status: pgEnum("user_feedback_feedback_status_enum", ["new", "reviewed", "resolved"])("feedbackStatus").default("new").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_feedback_user").on(table.userId),
  index("idx_feedback_status").on(table.status),
]);

export type UserFeedback = typeof userFeedback.$inferSelect;

export const pipelineEvents = pgTable("pipeline_events", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  pipelineType: varchar("pipelineType", { length: 64 }).notNull(),
  eventType: pgEnum("pipeline_events_event_type_enum", ["intake_start", "intake_complete", "direct_create", "document_uploaded", "extraction_complete", "analysis_started", "analysis_complete", "findings_generated", "export_created", "case_completed", "guided_intake_complete", "guided_to_conversation"])("eventType").default("direct_create").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // geographic scope for map clustering
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pe_pipeline").on(table.pipelineType),
  index("idx_pe_event").on(table.eventType),
  index("idx_pe_created").on(table.createdAt),
  index("idx_pe_state").on(table.stateCode),
]);

export type PipelineEvent = typeof pipelineEvents.$inferSelect;

export const shareLinks = pgTable("share_links", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  createdBy: integer("createdBy").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 256 }), // e.g., "For my attorney", "Legal aid review"
  permissions: pgEnum("share_links_permissions_enum", ["read_only", "read_export"])("permissions").default("read_only").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  revokedAt: bigint("revokedAt", { mode: "number" }),
  lastAccessedAt: bigint("lastAccessedAt", { mode: "number" }),
  accessCount: integer("accessCount").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_share_token").on(table.token),
  index("idx_share_case").on(table.caseId),
  index("idx_share_created_by").on(table.createdBy),
  index("idx_share_expires").on(table.expiresAt),
]);

export type ShareLink = typeof shareLinks.$inferSelect;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // share_accessed, extraction_complete, new_findings, case_status, feedback_response, share_expiring
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(), // caseId, documentId, shareLinkId, etc.
  linkUrl: varchar("linkUrl", { length: 500 }), // in-app URL to navigate to
  readAt: bigint("readAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_notif_user").on(table.userId),
  index("idx_notif_user_read").on(table.userId, table.readAt),
  index("idx_notif_created").on(table.createdAt),
]);

export type Notification = typeof notifications.$inferSelect;

export const adminInvites = pgTable("admin_invites", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  createdBy: integer("createdBy").notNull(),
  targetRole: pgEnum("admin_invites_target_role_enum", ["user", "admin"])("targetRole").default("admin").notNull(),
  targetPlan: pgEnum("admin_invites_target_plan_enum", ["free", "advocacy", "family_advocacy", "analyst", "professional", "enterprise"])("targetPlan").default("advocacy").notNull(),
  label: varchar("label", { length: 256 }),
  maxUses: integer("maxUses").default(1).notNull(),
  useCount: integer("useCount").default(0).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  inviteStatus: pgEnum("admin_invites_invite_status_enum", ["active", "expired", "revoked", "exhausted"])("inviteStatus").default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_invite_token").on(table.token),
  index("idx_invite_created_by").on(table.createdBy),
  index("idx_invite_status").on(table.inviteStatus),
  index("idx_invite_expires").on(table.expiresAt),
]);

export type AdminInvite = typeof adminInvites.$inferSelect;

export const inviteRedemptions = pgTable("invite_redemptions", {
  id: serial("id").primaryKey(),
  inviteId: integer("inviteId").notNull(),
  userId: integer("userId").notNull(),
  redeemedAt: bigint("redeemedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_redemption_invite").on(table.inviteId),
  index("idx_redemption_user").on(table.userId),
]);

export type InviteRedemption = typeof inviteRedemptions.$inferSelect;

export const missingRecords = pgTable("missing_records", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  label: varchar("label", { length: 256 }).notNull(),
  description: text("description").notNull(),
  legalBasis: text("legalBasis"),
  severity: pgEnum("missing_records_severity_enum", ["critical", "important", "helpful"])("severity").notNull(),
  agencyType: varchar("agencyType", { length: 256 }),
  foiaEligible: boolean("foiaEligible").default(false).notNull(),
  status: pgEnum("missing_records_missing_record_status_enum", ["detected", "acknowledged", "requested", "received", "not_applicable"])("missingRecordStatus").default("detected").notNull(),
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

export const foiaStatutes = pgTable("foia_statutes", {
  id: serial("id").primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  lawName: varchar("lawName", { length: 256 }).notNull(),
  statuteReference: varchar("statuteReference", { length: 256 }).notNull(),
  responseDeadlineDays: integer("responseDeadlineDays"),
  appealDeadlineDays: integer("appealDeadlineDays"),
  feeWaiverAvailable: boolean("feeWaiverAvailable").default(false).notNull(),
  expeditedProcessingAvailable: boolean("expeditedProcessingAvailable").default(false).notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_statutes_state").on(table.stateCode),
]);

export type FoiaStatute = typeof foiaStatutes.$inferSelect;
export type InsertFoiaStatute = typeof foiaStatutes.$inferInsert;

export const foiaAgencies = pgTable("foia_agencies", {
  id: serial("id").primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  jurisdictionLevel: pgEnum("foia_agencies_jurisdiction_level_enum", ["federal", "state", "county", "municipal", "court"])("jurisdictionLevel").notNull(),
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  agencyComponent: varchar("agencyComponent", { length: 256 }),
  portalUrl: text("portalUrl"),
  email: varchar("email", { length: 320 }),
  mailingAddress: text("mailingAddress"),
  submissionMethods: pgEnum("foia_agencies_submission_methods_enum", ["portal", "email", "mail", "mixed"])("submissionMethods").default("mixed").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_agencies_state").on(table.stateCode),
  index("idx_foia_agencies_jurisdiction").on(table.jurisdictionLevel),
]);

export type FoiaAgency = typeof foiaAgencies.$inferSelect;
export type InsertFoiaAgency = typeof foiaAgencies.$inferInsert;

export const foiaRecordTypes = pgTable("foia_record_types", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  recordDescription: text("recordDescription").notNull(),
  typicalKeywords: jsonb("typicalKeywords").$type<string[]>(),
  retentionNotes: text("retentionNotes"),
}, (table) => [
  index("idx_foia_record_types_domain").on(table.domain),
  uniqueIndex("idx_foia_record_types_unique").on(table.domain, table.recordType),
]);

export type FoiaRecordType = typeof foiaRecordTypes.$inferSelect;
export type InsertFoiaRecordType = typeof foiaRecordTypes.$inferInsert;

export const foiaAgencyRecords = pgTable("foia_agency_records", {
  id: serial("id").primaryKey(),
  agencyId: integer("agencyId").notNull(),
  recordTypeId: integer("recordTypeId").notNull(),
  statuteId: integer("statuteId").notNull(),
  confidence: pgEnum("foia_agency_records_confidence_enum", ["high", "medium", "low"])("confidence").default("medium").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_foia_agency_records_agency").on(table.agencyId),
  index("idx_foia_agency_records_record").on(table.recordTypeId),
  index("idx_foia_agency_records_statute").on(table.statuteId),
]);

export type FoiaAgencyRecord = typeof foiaAgencyRecords.$inferSelect;
export type InsertFoiaAgencyRecord = typeof foiaAgencyRecords.$inferInsert;

export const foiaRequests = pgTable("foia_requests", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  missingRecordId: integer("missingRecordId").notNull(), // FK → missing_records.id
  agencyId: integer("agencyId"), // FK → foia_agencies.id (null if no AKB match)
  statuteId: integer("statuteId"), // FK → foia_statutes.id (null if no AKB match)
  // Request metadata
  domain: varchar("domain", { length: 64 }).notNull(),
  recordType: varchar("recordType", { length: 128 }).notNull(),
  stateCode: varchar("stateCode", { length: 8 }).default("WA").notNull(),
  // Request fingerprint — deterministic hash for cross-request analytics
  requestFingerprint: varchar("requestFingerprint", { length: 128 }).notNull(),
  // Letter content
  letterContent: text("letterContent").notNull(),
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
  status: pgEnum("foia_requests_foia_request_status_enum", [
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
  ])("foiaRequestStatus").default("draft").notNull(),
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

export const caseNarratives = pgTable("case_narratives", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  content: text("content").notNull(), // Markdown narrative
  // Source map: JSON array mapping paragraph indices to source evidence
  // Each entry: { paragraphIndex, sources: [{ type, id, label, documentId?, page?, date? }] }
  sourceMap: jsonb("sourceMap").$type<NarrativeSourceMap>().notNull(),
  // Timeline item count at generation time (for staleness detection)
  timelineItemCount: integer("timelineItemCount").notNull(),
  // Snapshot ID at generation time (optional future compatibility)
  snapshotId: integer("snapshotId"),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_narrative_case").on(table.caseId), // Only one active narrative per case
  index("idx_narrative_user").on(table.userId),
]);

export type CaseNarrative = typeof caseNarratives.$inferSelect;
export type InsertCaseNarrative = typeof caseNarratives.$inferInsert;

export const patternTypes = pgTable("pattern_types", {
  id: serial("id").primaryKey(),
  patternType: varchar("patternType", { length: 128 }).notNull().unique(),
  description: text("description").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type PatternType = typeof patternTypes.$inferSelect;
export type InsertPatternType = typeof patternTypes.$inferInsert;

export const patternOccurrences = pgTable("pattern_occurrences", {
  id: serial("id").primaryKey(),
  patternId: integer("patternId").notNull(), // FK → patterns.id
  caseId: integer("caseId").notNull(),
  entityId: integer("entityId"), // optional: entity involved
  agencyId: integer("agencyId"), // optional: agency involved
  evidenceReferenceId: integer("evidenceReferenceId").notNull(), // ID of the evidence item (entity, claim, foia_request, etc.)
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

export const benefitApplications = pgTable("benefit_applications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // FK → users.id
  caseId: integer("caseId"), // optional FK → cases.id (if linked to a case)
  programId: varchar("programId", { length: 128 }).notNull(), // matches BenefitProgram.id
  programName: varchar("programName", { length: 256 }).notNull(), // human-readable name at time of creation
  status: pgEnum("benefit_applications_benefit_app_status_enum", [
    "not_started",    // User bookmarked the program but hasn't applied
    "gathering_docs", // Actively collecting required documents
    "applied",        // Application submitted
    "waiting",        // Waiting for a decision
    "approved",       // Application approved
    "denied",         // Application denied
    "appealing",      // Appealing a denial
    "expired",        // Application or benefit expired
  ])("benefitAppStatus").default("not_started").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // state if localized
  appliedAt: bigint("appliedAt", { mode: "number" }), // when they submitted
  decisionAt: bigint("decisionAt", { mode: "number" }), // when decision came
  nextDeadline: bigint("nextDeadline", { mode: "number" }), // upcoming deadline
  deadlineLabel: varchar("deadlineLabel", { length: 256 }), // e.g. "Appeal deadline", "Recertification due"
  notes: text("notes"), // user's personal notes
  denialReason: text("denialReason"), // if denied, why
  applicationUrl: text("applicationUrl"), // link to the application portal
  confirmationNumber: varchar("confirmationNumber", { length: 128 }), // application confirmation/reference number
  documentsNeeded: jsonb("documentsNeeded").$type<string[]>(), // list of documents still needed
  documentsSubmitted: jsonb("documentsSubmitted").$type<string[]>(), // list of documents already submitted
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

export const lighthouseSuggestions = pgTable("lighthouse_suggestions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // FK → users.id
  content: text("content").notNull(),
  status: pgEnum("lighthouse_suggestions_suggestion_status_enum", ["pending", "reviewed", "accepted", "implemented", "declined"])("suggestionStatus").default("pending").notNull(),
  votes: integer("votes").default(0).notNull(),
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

export const lighthouseSuggestionVotes = pgTable("lighthouse_suggestion_votes", {
  id: serial("id").primaryKey(),
  suggestionId: integer("suggestionId").notNull(), // FK → lighthouse_suggestions.id
  userId: integer("userId").notNull(), // FK → users.id
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_lh_vote_unique").on(table.suggestionId, table.userId),
]);

export const lighthouseSpotlight = pgTable("lighthouse_spotlight", {
  id: serial("id").primaryKey(),
  eyebrow: varchar("eyebrow", { length: 64 }).notNull(), // e.g., "THIS MONTH'S FOCUS"
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  color: varchar("color", { length: 32 }).default("#d4a017").notNull(), // hex color for theming
  cta: varchar("cta", { length: 64 }).default("Learn More").notNull(), // call-to-action text
  href: text("href"), // optional link
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  startDate: bigint("startDate", { mode: "number" }), // optional scheduling
  endDate: bigint("endDate", { mode: "number" }),
  lat: doublePrecision("lat"), // geocoded latitude
  lng: doublePrecision("lng"), // geocoded longitude
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_lh_spotlight_active").on(table.active),
  index("idx_lh_spotlight_order").on(table.sortOrder),
]);

export type LighthouseSpotlight = typeof lighthouseSpotlight.$inferSelect;
export type InsertLighthouseSpotlight = typeof lighthouseSpotlight.$inferInsert;

export const lighthouseJobs = pgTable("lighthouse_jobs", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  organization: varchar("organization", { length: 256 }).notNull(),
  description: text("description").notNull(),
  jobType: pgEnum("lighthouse_jobs_job_type_enum", ["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"])("jobType").notNull(),
  category: pgEnum("lighthouse_jobs_job_category_enum", ["trades", "healthcare", "social_services", "legal", "education", "technology", "general"])("jobCategory").default("general").notNull(),
  location: varchar("location", { length: 256 }), // city/region
  stateCode: varchar("stateCode", { length: 2 }), // state abbreviation
  remote: boolean("remote").default(false).notNull(),
  url: text("url"), // external application link
  contactInfo: text("contactInfo"), // how to apply if no URL
  requirements: text("requirements"), // qualifications
  compensation: varchar("compensation", { length: 128 }), // e.g., "$18-22/hr", "Free training"
  lat: doublePrecision("lat"), // geocoded latitude
  lng: doublePrecision("lng"), // geocoded longitude
  postedBy: integer("postedBy").notNull(), // FK → users.id (admin who posted)
  status: pgEnum("lighthouse_jobs_job_status_enum", ["active", "filled", "expired", "draft"])("jobStatus").default("active").notNull(),
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

export const lighthousePosts = pgTable("lighthouse_posts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // FK → users.id
  category: pgEnum("lighthouse_posts_post_category_enum", ["ask_help", "offer_help", "skill_share", "resource_share", "general"])("postCategory").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  stateCode: varchar("stateCode", { length: 2 }), // optional geographic scope
  location: varchar("location", { length: 256 }), // city/region
  lat: doublePrecision("lat"), // geocoded latitude
  lng: doublePrecision("lng"), // geocoded longitude
  status: pgEnum("lighthouse_posts_post_status_enum", ["active", "resolved", "expired", "flagged", "removed"])("postStatus").default("active").notNull(),
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

export const geocodeCache = pgTable("geocode_cache", {
  id: serial("id").primaryKey(),
  addressKey: varchar("addressKey", { length: 512 }).notNull().unique(), // normalized input
  formattedAddress: varchar("formattedAddress", { length: 512 }), // Google's canonical form
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  placeId: varchar("placeId", { length: 256 }), // Google place_id for dedup
  source: pgEnum("geocode_cache_geocode_source_enum", ["google", "manual", "registry"])("geocodeSource").default("google").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_gc_address").on(table.addressKey),
  index("idx_gc_place").on(table.placeId),
]);

export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type InsertGeocodeCache = typeof geocodeCache.$inferInsert;

export const lighthouseEvents = pgTable("lighthouse_events", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  eventType: pgEnum("lighthouse_events_event_type_enum", ["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"])("eventType").default("workshop").notNull(),
  organization: varchar("organization", { length: 256 }),
  stateCode: varchar("stateCode", { length: 2 }),
  location: varchar("location", { length: 256 }), // human-readable address
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  url: text("url"), // registration or info link
  contactInfo: text("contactInfo"),
  startsAt: bigint("startsAt", { mode: "number" }).notNull(), // event start time
  endsAt: bigint("endsAt", { mode: "number" }), // event end time
  recurring: boolean("recurring").default(false).notNull(),
  postedBy: integer("postedBy").notNull(), // FK → users.id
  status: pgEnum("lighthouse_events_event_status_enum", ["upcoming", "active", "completed", "cancelled"])("eventStatus").default("upcoming").notNull(),
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

export const mapIntakeSessions = pgTable("map_intake_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  /** Session status: active → completed (case created) or expired (abandoned) */
  status: pgEnum("map_intake_sessions_map_intake_status_enum", ["active", "completed", "expired"])("mapIntakeStatus").default("active").notNull(),
  /** Coordinates the user clicked on the map */
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  /** Detected state code from coordinates */
  detectedState: varchar("detectedState", { length: 2 }),
  /** Detected city/region from coordinates */
  detectedRegion: varchar("detectedRegion", { length: 128 }),
  /** Nearby resources (programs, oversight, tribal) — JSON array of resource summaries */
  nearbyResources: jsonb("nearbyResources").$type<Array<{
    id: string;
    name: string;
    type: string;
    category?: string;
    phone?: string;
    website?: string;
    distanceKm: number;
  }>>(),
  /** Nearby pattern signals — aggregated, no individual case data */
  patternSignals: jsonb("patternSignals").$type<Array<{
    pipeline: string;
    count: number;
  }>>(),
  /** Suggested pipelines from geographic + signal analysis */
  suggestedPipelines: jsonb("suggestedPipelines").$type<Array<{
    pipeline_id: string;
    label: string;
    confidence: number;
    confidence_label: "high" | "medium" | "low";
    match_reasons: string[];
  }>>(),
  /** Pre-populated programs for intake navigator */
  nearestPrograms: jsonb("nearestPrograms").$type<Array<{
    id: string;
    name: string;
    category?: string;
    phone?: string;
    website?: string;
  }>>(),
  /** Pre-populated oversight bodies for intake navigator */
  nearestOversight: jsonb("nearestOversight").$type<Array<{
    id: string;
    name: string;
    agency?: string;
    phone?: string;
    website?: string;
  }>>(),
  /** If the user completed intake, the resulting case ID */
  caseId: integer("caseId"),
  /** Search radius used (km) */
  radiusKm: integer("radiusKm").default(50).notNull(),
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

export const docketEntries = pgTable("docket_entries", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 256 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  shortTitle: varchar("shortTitle", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(), // "federal", "washington", "seattle"
  jurisdictionLevel: pgEnum("docket_entries_jurisdiction_level_enum", ["federal", "state", "county", "city", "tribal"])("jurisdictionLevel").notNull(),
  lawType: pgEnum("docket_entries_law_type_enum", ["statute", "ordinance", "regulation", "executive_order", "ballot_measure", "proposed_bill", "constitutional_amendment"])("lawType").notNull(),
  status: pgEnum("docket_entries_docket_status_enum", ["enacted", "proposed", "repealed", "amended", "under_review"])("docketStatus").notNull(),
  dateIntroduced: varchar("dateIntroduced", { length: 32 }),
  dateEnacted: varchar("dateEnacted", { length: 32 }),
  dateEffective: varchar("dateEffective", { length: 32 }),
  // Plain-language summary (Section 1)
  summary: text("summary"),
  keyChanges: jsonb("keyChanges").$type<string[]>(),
  // Implementation Dock (Section 4)
  implementationAgencies: jsonb("implementationAgencies").$type<string[]>(),
  adminSteps: jsonb("adminSteps").$type<string[]>(),
  complianceObligations: jsonb("complianceObligations").$type<string[]>(),
  rolloutTimeline: jsonb("rolloutTimeline").$type<string[]>(),
  // Loophole Lantern (Section 5)
  structuralExemptions: jsonb("structuralExemptions").$type<string[]>(),
  enforcementGaps: jsonb("enforcementGaps").$type<string[]>(),
  reportingGaps: jsonb("reportingGaps").$type<string[]>(),
  delegatedAuthority: jsonb("delegatedAuthority").$type<string[]>(),
  // Comparative Bay (Section 6)
  similarLaws: jsonb("similarLaws").$type<{ jurisdiction: string; title: string; note: string }[]>(),
  historicalPrecedents: jsonb("historicalPrecedents").$type<{ title: string; year: string; note: string }[]>(),
  implementationVariations: jsonb("implementationVariations").$type<string[]>(),
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

export const docketActors = pgTable("docket_actors", {
  id: serial("id").primaryKey(),
  docketId: integer("docketId").notNull(),
  actorName: varchar("actorName", { length: 512 }).notNull(),
  actorType: pgEnum("docket_actors_actor_type_enum", [
    "sponsor", "cosponsor", "committee", "implementing_agency",
    "regulatory_body", "lobbyist_org", "advocacy_group", "opposition_group",
    "executive_signatory", "judicial_body"
  ])("actorType").notNull(),
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

export const docketImpacts = pgTable("docket_impacts", {
  id: serial("id").primaryKey(),
  docketId: integer("docketId").notNull(),
  impactCategory: pgEnum("docket_impacts_impact_category_enum", [
    "population", "industry", "government_agency", "geographic"
  ])("impactCategory").notNull(),
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

export const docketSources = pgTable("docket_sources", {
  id: serial("id").primaryKey(),
  docketId: integer("docketId").notNull(),
  sourceType: pgEnum("docket_sources_source_type_enum", [
    "legislation_text", "committee_report", "agency_rule", "court_decision",
    "federal_register", "congressional_record", "state_legislature",
    "executive_order", "press_release", "government_report", "other"
  ])("sourceType").notNull(),
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

export const docketSubmissions = pgTable("docket_submissions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  userName: varchar("userName", { length: 256 }),
  userEmail: varchar("userEmail", { length: 320 }),
  lawTitle: varchar("lawTitle", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  jurisdictionLevel: pgEnum("docket_submissions_submission_jurisdiction_level_enum", ["federal", "state", "county", "city", "tribal"])("submissionJurisdictionLevel").notNull(),
  referenceUrl: varchar("referenceUrl", { length: 1024 }),
  fileUrl: varchar("fileUrl", { length: 1024 }), // S3 URL for uploaded document
  fileName: varchar("fileName", { length: 512 }), // original file name
  notes: text("notes"), // why this law matters / context
  status: pgEnum("docket_submissions_submission_status_enum", ["pending", "in_review", "published", "rejected"])("submissionStatus").default("pending").notNull(),
  adminNotes: text("adminNotes"),
  docketEntryId: integer("docketEntryId"), // linked docket entry once published
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_submission_user").on(table.userId),
  index("idx_submission_status").on(table.status),
]);

export type DocketSubmission = typeof docketSubmissions.$inferSelect;
export type InsertDocketSubmission = typeof docketSubmissions.$inferInsert;

export const lumensendTemplates = pgTable("lumensend_templates", {
  id: serial("id").primaryKey(),
  documentType: pgEnum("lumensend_templates_document_type_enum", [
    "appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"
  ])("documentType").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  subjectTemplate: text("subjectTemplate").notNull(),
  bodyTemplate: text("bodyTemplate").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type LumensendTemplate = typeof lumensendTemplates.$inferSelect;
export type InsertLumensendTemplate = typeof lumensendTemplates.$inferInsert;

export const lumensendDrafts = pgTable("lumensend_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  caseId: integer("caseId"),
  documentType: pgEnum("lumensend_drafts_draft_document_type_enum", [
    "appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"
  ])("draftDocumentType").notNull(),
  templateId: integer("templateId"),
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
  contextType: pgEnum("lumensend_drafts_context_type_enum", [
    "registry_program", "oversight_body", "cda_denial", "case_repair", "docket_entry", "manual"
  ])("contextType").default("manual").notNull(),
  contextId: varchar("contextId", { length: 256 }),
  contextLabel: text("contextLabel"),
  // State & jurisdiction
  jurisdiction: varchar("draftJurisdiction", { length: 64 }),
  // Status
  status: pgEnum("lumensend_drafts_draft_status_enum", ["draft", "ready", "sent", "printed", "copied"])("draftStatus").default("draft").notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
  sentMethod: pgEnum("lumensend_drafts_sent_method_enum", ["email", "print", "copy"])("sentMethod"),
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

export const legalStatuteClauses = pgTable("legal_statute_clauses", {
  id: serial("id").primaryKey(),
  // FK to legal_statutes
  statuteId: integer("statuteId").notNull(),
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
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_statute_clauses_statute").on(table.statuteId),
]);

export type LegalStatuteClause = typeof legalStatuteClauses.$inferSelect;
export type InsertLegalStatuteClause = typeof legalStatuteClauses.$inferInsert;

export const legalContradictions = pgTable("legal_contradictions", {
  id: serial("id").primaryKey(),
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
  domains: jsonb("domains").notNull().$type<LegalDomain[]>(),
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

export const pipelineIntakeEnrichments = pgTable("pipeline_intake_enrichments", {
  id: serial("id").primaryKey(),
  pipelineId: varchar("pipelineId", { length: 128 }).notNull(),
  investigationPatterns: jsonb("investigationPatterns").$type<string[]>(),
  redFlags: jsonb("redFlags").$type<string[]>(),
  crossPipelineLinks: jsonb("crossPipelineLinks").$type<Array<{ pipeline: string; reason: string }>>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_pie_pipeline").on(table.pipelineId),
]);

export type PipelineIntakeEnrichment = typeof pipelineIntakeEnrichments.$inferSelect;
export type InsertPipelineIntakeEnrichment = typeof pipelineIntakeEnrichments.$inferInsert;

export const agencyPerformanceMetrics = pgTable("agency_performance_metrics", {
  id: serial("id").primaryKey(),
  agencyName: varchar("agencyName", { length: 256 }).notNull(),
  agencyAbbreviation: varchar("agencyAbbreviation", { length: 32 }),
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull().default("federal"),
  statutoryAuthority: varchar("statutoryAuthority", { length: 512 }),
  fiscalYear: integer("fiscalYear").notNull(),
  chargesFiled: integer("chargesFiled"),
  chargesResolved: integer("chargesResolved"),
  backlog: integer("backlog"),
  avgProcessingDays: integer("avgProcessingDays"),
  statutoryDeadlineDays: integer("statutoryDeadlineDays"),
  gapDays: integer("gapDays"),
  causeFindings: integer("causeFindings"),
  causePercentage: numeric("causePercentage", { precision: 5, scale: 2 }),
  conciliationSuccessRate: numeric("conciliationSuccessRate", { precision: 5, scale: 2 }),
  noReasonableCause: integer("noReasonableCause"),
  noReasonableCausePercentage: numeric("noReasonableCausePercentage", { precision: 5, scale: 2 }),
  administrativeClosure: integer("administrativeClosure"),
  administrativeClosurePercentage: numeric("administrativeClosurePercentage", { precision: 5, scale: 2 }),
  rightToSueIssued: integer("rightToSueIssued"),
  rightToSuePercentage: numeric("rightToSuePercentage", { precision: 5, scale: 2 }),
  monetaryRelief: bigint("monetaryRelief", { mode: "number" }),
  sourceUrls: jsonb("sourceUrls").$type<string[]>(),
  dataConfidence: varchar("dataConfidence", { length: 1 }).default("B"),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_apm_agency_year").on(table.agencyName, table.fiscalYear),
]);

export type AgencyPerformanceMetric = typeof agencyPerformanceMetrics.$inferSelect;
export type InsertAgencyPerformanceMetric = typeof agencyPerformanceMetrics.$inferInsert;

export const agencyAuthorityMap = pgTable("agency_authority_map", {
  id: serial("id").primaryKey(),
  statute: varchar("statute", { length: 512 }).notNull(),
  agency: varchar("agency", { length: 512 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 64 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  complaintTypes: jsonb("complaintTypes").notNull().$type<string[]>(),
  statutoryAuthority: jsonb("statutoryAuthority").notNull().$type<string[]>(),
  responseTimelineDays: integer("responseTimelineDays"),
  complaintPathway: text("complaintPathway"),
  commonOutcomes: jsonb("commonOutcomes").notNull().$type<string[]>(),
  linkedWeakJoints: jsonb("linkedWeakJoints").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_aam_statute_agency").on(table.statute, table.agencyShort),
]);

export type AgencyAuthorityMapEntry = typeof agencyAuthorityMap.$inferSelect;
export type InsertAgencyAuthorityMapEntry = typeof agencyAuthorityMap.$inferInsert;

export const doctrineGraphEdges = pgTable("doctrine_graph_edges", {
  id: serial("id").primaryKey(),
  fromType: pgEnum("doctrine_graph_edges_from_type_enum", ["statute", "case", "doctrine", "weak_joint", "agency", "domain"])("fromType").notNull(),
  fromId: varchar("fromId", { length: 512 }).notNull(),
  edgeType: pgEnum("doctrine_graph_edges_edge_type_enum", ["interpreted_by", "creates", "triggers", "fails_at", "enforced_by", "routes_to", "associated_with", "blocks", "supports"])("edgeType").notNull(),
  toType: pgEnum("doctrine_graph_edges_to_type_enum", ["statute", "case", "doctrine", "weak_joint", "agency", "domain"])("toType").notNull(),
  toId: varchar("toId", { length: 512 }).notNull(),
  strength: pgEnum("doctrine_graph_edges_strength_enum", ["strong", "moderate", "contextual"])("strength").default("moderate").notNull(),
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

export const litigationBarriers = pgTable("litigation_barriers", {
  id: serial("id").primaryKey(),
  barrierId: varchar("barrierId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  barrierType: pgEnum("litigation_barriers_barrier_type_enum", ["jurisdictional", "immunity", "procedural", "timing", "evidentiary", "contractual"])("barrierType").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  description: text("description").notNull(),
  leadingAuthorities: jsonb("leadingAuthorities").$type<string[]>(),
  whatItBlocks: text("whatItBlocks").notNull(),
  commonTriggerPatterns: jsonb("commonTriggerPatterns").$type<string[]>(),
  usualOutcome: jsonb("usualOutcome").$type<string[]>(),
  severity: pgEnum("litigation_barriers_severity_enum", ["critical", "high", "medium", "low"])("severity").default("high").notNull(),
  linkedWeakJoints: jsonb("linkedWeakJoints").$type<string[]>(),
  possibleWorkarounds: jsonb("possibleWorkarounds").$type<string[]>(),
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

export const evidenceSources = pgTable("evidence_sources", {
  id: serial("id").primaryKey(),
  sourceId: varchar("sourceId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  sourceType: pgEnum("evidence_sources_source_type_enum", ["audit", "inspector_general", "court_record", "lawsuit", "foia_log", "journalism", "academic_study", "consent_decree", "agency_report"])("sourceType").notNull(),
  producingEntity: varchar("producingEntity", { length: 512 }).notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  typicalContent: jsonb("typicalContent").$type<string[]>(),
  usefulness: pgEnum("evidence_sources_usefulness_enum", ["high", "moderate", "contextual"])("usefulness").default("high").notNull(),
  linkedWeakJoints: jsonb("linkedWeakJoints").$type<string[]>(),
  linkedContradictionTemplates: jsonb("linkedContradictionTemplates").$type<string[]>(),
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

export const pipelineIntelligenceMap = pgTable("pipeline_intelligence_map", {
  id: serial("id").primaryKey(),
  pipelineId: varchar("pipelineId", { length: 64 }).notNull().unique(),
  pipelineName: varchar("pipelineName", { length: 256 }).notNull(),
  primaryDoctrines: jsonb("primaryDoctrines").$type<string[]>(),
  keyStatutes: jsonb("keyStatutes").$type<string[]>(),
  leadingCases: jsonb("leadingCases").$type<string[]>(),
  frequentWeakJoints: jsonb("frequentWeakJoints").$type<string[]>(),
  litigationBarriers: jsonb("litigationBarriers").$type<string[]>(),
  enforcementAgencies: jsonb("enforcementAgencies").$type<string[]>(),
  contradictionTemplates: jsonb("contradictionTemplates").$type<string[]>(),
  evidenceSources: jsonb("evidenceSources").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type PipelineIntelligence = typeof pipelineIntelligenceMap.$inferSelect;
export type InsertPipelineIntelligence = typeof pipelineIntelligenceMap.$inferInsert;

export const signalRegistry = pgTable("signal_registry", {
  id: serial("id").primaryKey(),
  signalType: varchar("signalType", { length: 128 }).notNull().unique(),
  domain: varchar("domain", { length: 128 }).notNull(),
  triggerPatterns: jsonb("triggerPatterns").$type<string[]>().notNull(),
  linkedDoctrine: jsonb("linkedDoctrine").$type<string[]>(),
  linkedWeakJoints: jsonb("linkedWeakJoints").$type<string[]>(),
  linkedContradictionTemplates: jsonb("linkedContradictionTemplates").$type<string[]>(),
  severity: pgEnum("signal_registry_severity_enum", ["critical", "high", "medium", "low"])("severity").default("high").notNull(),
  explanation: text("explanation").notNull(),
  recommendedNextSteps: jsonb("recommendedNextSteps").$type<string[]>(),
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

export const timelineRules = pgTable("timeline_rules", {
  id: serial("id").primaryKey(),
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

export const timelineSignals = pgTable("timeline_signals", {
  id: serial("id").primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull().unique(),
  domain: varchar("domain", { length: 128 }).notNull(),
  legalMeaning: text("legalMeaning").notNull(),
  linkedDoctrine: jsonb("linkedDoctrine").$type<string[]>(),
  linkedWeakJoints: jsonb("linkedWeakJoints").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ts_domain").on(table.domain),
]);

export type TimelineSignal = typeof timelineSignals.$inferSelect;
export type InsertTimelineSignal = typeof timelineSignals.$inferInsert;

export const contradictionTemplates = pgTable("contradiction_templates", {
  id: serial("id").primaryKey(),
  templateId: varchar("templateId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  linkedDoctrine: varchar("linkedDoctrine", { length: 256 }),
  linkedStatute: jsonb("linkedStatute").$type<string[]>(),
  linkedCases: jsonb("linkedCases").$type<string[]>(),
  linkedWeakJoint: varchar("linkedWeakJoint", { length: 64 }),
  legalRequirement: text("legalRequirement").notNull(),
  typicalAgencyClaim: text("typicalAgencyClaim").notNull(),
  evidenceIndicators: jsonb("evidenceIndicators").$type<string[]>(),
  contradictionLogic: text("contradictionLogic").notNull(),
  severity: pgEnum("contradiction_templates_ct_severity_enum", ["critical", "high", "medium", "low"])("ct_severity").notNull(),
  investigationPathways: jsonb("investigationPathways").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ct_domain").on(table.domain),
  index("idx_ct_severity").on(table.severity),
]);

export type ContradictionTemplate = typeof contradictionTemplates.$inferSelect;
export type InsertContradictionTemplate = typeof contradictionTemplates.$inferInsert;

export const narrativeTemplates = pgTable("narrative_templates", {
  id: serial("id").primaryKey(),
  templateId: varchar("templateId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  audience: pgEnum("narrative_templates_nt_audience_enum", ["investigator", "advocate", "legal", "executive"])("nt_audience").notNull(),
  structure: jsonb("structure").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_nt_audience").on(table.audience),
]);

export type NarrativeTemplate = typeof narrativeTemplates.$inferSelect;
export type InsertNarrativeTemplate = typeof narrativeTemplates.$inferInsert;

export const workflowDefinitions = pgTable("workflow_definitions", {
  id: serial("id").primaryKey(),
  workflowId: varchar("workflowId", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  trigger: pgEnum("workflow_definitions_wf_trigger_enum", ["document_upload", "batch_ingest", "manual_review", "api_call"])("wf_trigger").notNull(),
  steps: jsonb("steps").$type<Array<{
    stepId: string;
    stepType: string;
    input: string[];
    output: string[];
    failureMode: string;
    notes: string;
  }>>(),
  escalationRules: jsonb("escalationRules").$type<string[]>(),
  exportModes: jsonb("exportModes").$type<string[]>(),
  addedBy: varchar("addedBy", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type InsertWorkflowDefinition = typeof workflowDefinitions.$inferInsert;

export const agencyCasePrioritization = pgTable("agency_case_prioritization", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  priorityFactor: text("priorityFactor").notNull(),
  priorityLevel: pgEnum("agency_case_prioritization_priority_level_enum", ["critical", "high", "medium", "low"])("priorityLevel").notNull(),
  impactWeight: pgEnum("agency_case_prioritization_impact_weight_enum", ["very_high", "high", "moderate", "low"])("impactWeight").notNull(),
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

export const agencyResourceCapacity = pgTable("agency_resource_capacity", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  regionalOffice: varchar("regionalOffice", { length: 256 }),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  investigatorCount: varchar("investigatorCount", { length: 128 }),
  annualCaseLoad: varchar("annualCaseLoad", { length: 128 }),
  caseBacklog: varchar("caseBacklog", { length: 64 }),
  enforcementBudget: varchar("enforcementBudget", { length: 128 }),
  resourcePressureLevel: pgEnum("agency_resource_capacity_resource_pressure_level_enum", ["low", "medium", "medium-high", "high", "critical"])("resourcePressureLevel").notNull(),
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

export const agencyIntakeRules = pgTable("agency_intake_rules", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  minimumIntakeElements: jsonb("minimumIntakeElements").$type<string[]>(),
  automaticRejectionConditions: jsonb("automaticRejectionConditions").$type<string[]>(),
  priorityInvestigationTriggers: jsonb("priorityInvestigationTriggers").$type<string[]>(),
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

export const interagencyReferrals = pgTable("interagency_referrals", {
  id: serial("id").primaryKey(),
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

export const agencyCoordinationMatrix = pgTable("agency_coordination_matrix", {
  id: serial("id").primaryKey(),
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

export const enforcementPriorityIndex = pgTable("enforcement_priority_index", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  priorityIssue: text("priorityIssue").notNull(),
  priorityLevel: varchar("priorityLevel", { length: 64 }).notNull(),
  policySource: varchar("policySource", { length: 512 }).notNull(),
  policyYear: integer("policyYear").notNull(),
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

export const enforcementTrends = pgTable("enforcement_trends", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  year: integer("year").notNull(),
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

export const agencyForms = pgTable("agency_forms", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  formName: varchar("formName", { length: 512 }).notNull(),
  formNumber: varchar("formNumber", { length: 128 }),
  purpose: text("purpose").notNull(),
  requiredFields: jsonb("requiredFields").$type<string[]>(),
  supportingDocuments: jsonb("supportingDocuments").$type<string[]>(),
  submissionMethods: jsonb("submissionMethods").$type<string[]>(),
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

export const regulatoryGuidance = pgTable("regulatory_guidance", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  documentTitle: varchar("documentTitle", { length: 512 }).notNull(),
  issueArea: varchar("issueArea", { length: 256 }).notNull(),
  authorityBasis: varchar("authorityBasis", { length: 512 }),
  guidanceType: varchar("guidanceType", { length: 128 }).notNull(),
  keyRules: jsonb("keyRules").$type<string[]>(),
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

export const enforcementPenalties = pgTable("enforcement_penalties", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  violationType: varchar("violationType", { length: 256 }).notNull(),
  statutoryMaxPenalty: varchar("statutoryMaxPenalty", { length: 256 }),
  averagePenalty: varchar("averagePenalty", { length: 256 }),
  typicalSettlementRange: varchar("typicalSettlementRange", { length: 256 }),
  additionalRemedies: jsonb("additionalRemedies").$type<string[]>(),
  notableCases: jsonb("notableCases").$type<string[]>(),
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

export const enforcementViabilityRules = pgTable("enforcement_viability_rules", {
  id: serial("id").primaryKey(),
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

export const proofFrameworks = pgTable("proof_frameworks", {
  id: serial("id").primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  elementsOfProof: jsonb("elementsOfProof").$type<string[]>().notNull(),
  burdenOfProof: text("burdenOfProof").notNull(),
  standardOfReview: varchar("standardOfReview", { length: 128 }),
  requiredCausation: varchar("requiredCausation", { length: 256 }),
  typicalEvidence: jsonb("typicalEvidence").$type<string[]>(),
  commonDefenses: jsonb("commonDefenses").$type<string[]>(),
  keyPrecedents: jsonb("keyPrecedents").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_pf_claim").on(table.claimType),
  index("idx_pf_domain").on(table.domain),
]);

export type ProofFramework = typeof proofFrameworks.$inferSelect;
export type InsertProofFramework = typeof proofFrameworks.$inferInsert;

export const investigationGuidance = pgTable("investigation_guidance", {
  id: serial("id").primaryKey(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  investigationFocus: text("investigationFocus").notNull(),
  typicalQuestions: jsonb("typicalQuestions").$type<string[]>().notNull(),
  criticalEvidence: jsonb("criticalEvidence").$type<string[]>().notNull(),
  secondaryEvidence: jsonb("secondaryEvidence").$type<string[]>(),
  commonMistakes: jsonb("commonMistakes").$type<string[]>().notNull(),
  recommendedPreparation: jsonb("recommendedPreparation").$type<string[]>().notNull(),
  investigationStages: jsonb("investigationStages").$type<string[]>(),
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

export const filingGenerator = pgTable("filing_generator", {
  id: serial("id").primaryKey(),
  claimType: varchar("claimType", { length: 256 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  agency: varchar("agency", { length: 256 }).notNull(),
  agencyShort: varchar("agencyShort", { length: 32 }).notNull(),
  formName: varchar("formName", { length: 256 }).notNull(),
  formNumber: varchar("formNumber", { length: 64 }),
  filingLink: text("filingLink"),
  filingDeadline: varchar("filingDeadline", { length: 256 }),
  requiredFields: jsonb("requiredFields").$type<string[]>().notNull(),
  requiredEvidence: jsonb("requiredEvidence").$type<string[]>().notNull(),
  recommendedAttachments: jsonb("recommendedAttachments").$type<string[]>(),
  submissionMethods: jsonb("submissionMethods").$type<string[]>().notNull(),
  expectedTimeline: varchar("expectedTimeline", { length: 256 }),
  intakeWarnings: jsonb("intakeWarnings").$type<string[]>(),
  priorityFlags: jsonb("priorityFlags").$type<string[]>(),
  nextSteps: jsonb("nextSteps").$type<string[]>(),
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

export const jurisdictionHierarchy = pgTable("jurisdiction_hierarchy", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  type: pgEnum("jurisdiction_hierarchy_jurisdiction_type_enum", ["federal", "state", "county", "city", "tribal", "territory"])("jurisdictionType").notNull(),
  parentId: integer("parentId"),
  level: integer("level").notNull(),
  abbreviation: varchar("abbreviation", { length: 16 }),
  fipsCode: varchar("fipsCode", { length: 16 }),
  preemptionRules: jsonb("preemptionRules").$type<Array<{ rule: string; scope: string; authority: string }>>(),
  overrideRules: jsonb("overrideRules").$type<Array<{ rule: string; condition: string }>>(),
  agencies: jsonb("agencies").$type<string[]>(),
  keyStatutes: jsonb("keyStatutes").$type<string[]>(),
  filingVenues: jsonb("filingVenues").$type<string[]>(),
  notes: text("notes"),
  status: pgEnum("jurisdiction_hierarchy_jurisdiction_status_enum", ["active", "inactive", "pending"])("jurisdictionStatus").default("active").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_jh_type").on(table.type),
  index("idx_jh_parent").on(table.parentId),
  index("idx_jh_level").on(table.level),
]);

export type JurisdictionHierarchyRecord = typeof jurisdictionHierarchy.$inferSelect;
export type InsertJurisdictionHierarchy = typeof jurisdictionHierarchy.$inferInsert;

export const nodeTimeline = pgTable("node_timeline", {
  id: serial("id").primaryKey(),
  nodeId: varchar("nodeId", { length: 256 }).notNull(),
  nodeType: pgEnum("node_timeline_node_timeline_type_enum", ["doctrine", "statute", "regulation", "case_law", "agency_guidance", "executive_order"])("nodeTimelineType").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  effectiveDate: bigint("effectiveDate", { mode: "number" }).notNull(),
  amendedDate: bigint("amendedDate", { mode: "number" }),
  repealedDate: bigint("repealedDate", { mode: "number" }),
  supersededBy: varchar("supersededBy", { length: 256 }),
  precedentStrength: pgEnum("node_timeline_precedent_strength_enum", ["binding", "persuasive", "advisory", "superseded", "overturned"])("precedentStrength").default("persuasive"),
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

export const timelineEvents = pgTable("timeline_events", {
  id: serial("id").primaryKey(),
  eventType: pgEnum("timeline_events_timeline_event_type_enum", ["court_decision", "statute_enactment", "statute_amendment", "regulation_change", "agency_guidance", "doctrine_shift", "executive_order", "legislative_action"])("timelineEventType").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  date: bigint("date", { mode: "number" }).notNull(),
  sourceDocument: text("sourceDocument"),
  citation: varchar("citation", { length: 512 }),
  affectedNodes: jsonb("affectedNodes").$type<string[]>(),
  impactType: pgEnum("timeline_events_timeline_impact_type_enum", ["creates", "amends", "supersedes", "repeals", "expands", "narrows", "clarifies", "overturns"])("timelineImpactType").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  domain: varchar("domain", { length: 256 }),
  significance: text("significance"),
  status: pgEnum("timeline_events_timeline_event_status_enum", ["active", "superseded", "repealed"])("timelineEventStatus").default("active"),
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

export const timelineEdges = pgTable("timeline_edges", {
  id: serial("id").primaryKey(),
  sourceNode: varchar("sourceNode", { length: 256 }).notNull(),
  targetNode: varchar("targetNode", { length: 256 }).notNull(),
  relationshipType: pgEnum("timeline_edges_timeline_rel_type_enum", ["supersedes", "amends", "overturns", "interprets", "limits", "expands", "narrows", "clarifies", "codifies", "implements"])("timelineRelType").notNull(),
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

export const workflowMaster = pgTable("workflow_master", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  domain: varchar("domain", { length: 256 }).notNull(),
  issueTypes: jsonb("issueTypes").$type<string[]>().notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }).notNull(),
  triggerConditions: jsonb("triggerConditions").$type<string[]>(),
  primaryAgency: varchar("primaryAgency", { length: 256 }).notNull(),
  entryForms: jsonb("entryForms").$type<string[]>(),
  initialDeadlineRule: text("initialDeadlineRule"),
  evidenceProfileId: integer("evidenceProfileId"),
  appealChain: jsonb("appealChain").$type<Array<{ step: string; agency: string; deadline?: string }>>(),
  weakJointIds: jsonb("weakJointIds").$type<number[]>(),
  estimatedDuration: varchar("estimatedDuration", { length: 256 }),
  successRate: varchar("successRate", { length: 256 }),
  remedies: jsonb("remedies").$type<string[]>(),
  status: pgEnum("workflow_master_workflow_status_enum", ["draft", "active", "deprecated", "archived"])("workflowStatus").default("active").notNull(),
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

export const evidenceProfiles = pgTable("evidence_profiles", {
  id: serial("id").primaryKey(),
  issueType: varchar("issueType", { length: 256 }).notNull(),
  domain: varchar("domain", { length: 256 }),
  requiredMinimum: jsonb("requiredMinimum").$type<string[]>().notNull(),
  recommended: jsonb("recommended").$type<string[]>(),
  highValue: jsonb("highValue").$type<string[]>(),
  commonFailureModes: jsonb("commonFailureModes").$type<string[]>(),
  preservationNotes: text("preservationNotes"),
  spoliationRisks: jsonb("spoliationRisks").$type<string[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ep_issue").on(table.issueType),
]);

export type EvidenceProfileRecord = typeof evidenceProfiles.$inferSelect;
export type InsertEvidenceProfile = typeof evidenceProfiles.$inferInsert;

export const escalationRoutes = pgTable("escalation_routes", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull(),
  title: varchar("title", { length: 512 }),
  triggerConditions: jsonb("triggerConditions").$type<string[]>().notNull(),
  routes: jsonb("routes").$type<Array<{ target: string; method: string; deadline?: string; notes?: string }>>().notNull(),
  priority: pgEnum("escalation_routes_escalation_priority_enum", ["low", "medium", "high", "critical"])("escalationPriority").default("medium").notNull(),
  preservationRequirements: jsonb("preservationRequirements").$type<string[]>(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_er_workflow").on(table.workflowId),
  index("idx_er_priority").on(table.priority),
]);

export type EscalationRouteRecord = typeof escalationRoutes.$inferSelect;
export type InsertEscalationRoute = typeof escalationRoutes.$inferInsert;

export const deadlineRules = pgTable("deadline_rules", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
  triggerEvent: varchar("triggerEvent", { length: 256 }).notNull(),
  deadlineType: pgEnum("deadline_rules_deadline_type_enum", ["filing", "response", "appeal", "discovery", "administrative_exhaustion", "tolling_expiry", "statute_of_limitations"])("deadlineType").notNull(),
  timeLimitDays: integer("timeLimitDays"),
  extendedLimitDays: integer("extendedLimitDays"),
  extendedCondition: text("extendedCondition"),
  tollingPossible: boolean("tollingPossible").default(false).notNull(),
  tollingConditions: jsonb("tollingConditions").$type<string[]>(),
  warningThresholdDays: integer("warningThresholdDays").default(30),
  criticalThresholdDays: integer("criticalThresholdDays").default(7),
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

export const weakJointTriggers = pgTable("weak_joint_triggers", {
  id: serial("id").primaryKey(),
  weakJointId: integer("weakJointId").notNull(),
  triggerName: varchar("triggerName", { length: 256 }).notNull(),
  triggerCondition: text("triggerCondition").notNull(),
  severityWeight: numeric("severityWeight", { precision: 3, scale: 2 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_wjt_weak_joint").on(table.weakJointId),
]);

export type WeakJointTrigger = typeof weakJointTriggers.$inferSelect;
export type InsertWeakJointTrigger = typeof weakJointTriggers.$inferInsert;

export const weakJointHits = pgTable("weak_joint_hits", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  weakJointId: integer("weakJointId").notNull(),
  triggerId: integer("triggerId").notNull(),
  hitStrength: numeric("hitStrength", { precision: 3, scale: 2 }).notNull(),
  supportingFactPatterns: jsonb("supportingFactPatterns").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_wjh_case").on(table.caseId),
  index("idx_wjh_weak_joint").on(table.weakJointId),
]);

export type WeakJointHit = typeof weakJointHits.$inferSelect;
export type InsertWeakJointHit = typeof weakJointHits.$inferInsert;

export const factClaims = pgTable("fact_claims", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  sourceType: varchar("sourceType", { length: 64 }).notNull(),
  sourceReference: varchar("sourceReference", { length: 256 }),
  actor: varchar("actor", { length: 256 }),
  factType: varchar("factType", { length: 128 }).notNull(),
  factValue: text("factValue").notNull(),
  relatedEvent: varchar("relatedEvent", { length: 256 }),
  eventDate: bigint("eventDate", { mode: "number" }),
  confidenceScore: numeric("confidenceScore", { precision: 3, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_fc_case").on(table.caseId),
  index("idx_fc_fact_type").on(table.factType),
]);

export type FactClaim = typeof factClaims.$inferSelect;
export type InsertFactClaim = typeof factClaims.$inferInsert;

export const caseFactPatterns = pgTable("case_fact_patterns", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  factText: text("factText").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cfp_case").on(table.caseId),
  index("idx_cfp_category").on(table.pipelineCategory),
]);

export type CaseFactPattern = typeof caseFactPatterns.$inferSelect;
export type InsertCaseFactPattern = typeof caseFactPatterns.$inferInsert;

export const claimDetectionRules = pgTable("claim_detection_rules", {
  id: serial("id").primaryKey(),
  pipelineCategory: varchar("pipelineCategory", { length: 128 }).notNull(),
  triggerPhrase: text("triggerPhrase").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  weight: numeric("weight", { precision: 3, scale: 2 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cdr_category").on(table.pipelineCategory),
  index("idx_cdr_claim_type").on(table.claimType),
]);

export type ClaimDetectionRule = typeof claimDetectionRules.$inferSelect;
export type InsertClaimDetectionRule = typeof claimDetectionRules.$inferInsert;

export const claimDetectionResults = pgTable("claim_detection_results", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  confidenceScore: numeric("confidenceScore", { precision: 3, scale: 2 }).notNull(),
  matchedRules: jsonb("matchedRules").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cdres_case").on(table.caseId),
  index("idx_cdres_claim_type").on(table.claimType),
]);

export type ClaimDetectionResult = typeof claimDetectionResults.$inferSelect;
export type InsertClaimDetectionResult = typeof claimDetectionResults.$inferInsert;

export const evidenceRecords = pgTable("evidence_records", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  evidenceType: varchar("evidenceType", { length: 128 }).notNull(),
  source: varchar("source", { length: 256 }),
  dateCreated: bigint("dateCreated", { mode: "number" }),
  relatedClaim: varchar("relatedClaim", { length: 128 }),
  relatedElement: varchar("relatedElement", { length: 256 }),
  reliabilityClass: pgEnum("evidence_records_reliability_class_enum", ["primary", "secondary", "tertiary", "hearsay", "circumstantial"])("reliabilityClass").default("secondary"),
  confidenceScore: numeric("confidenceScore", { precision: 3, scale: 2 }),
  documentReference: varchar("documentReference", { length: 256 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_evrec_case").on(table.caseId),
  index("idx_evrec_type").on(table.evidenceType),
  index("idx_evrec_claim").on(table.relatedClaim),
]);

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRecords.$inferInsert;

export const elementStrength = pgTable("element_strength", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  supportingEvidence: jsonb("supportingEvidence").$type<number[]>(),
  strengthScore: numeric("strengthScore", { precision: 3, scale: 2 }).notNull(),
  confidenceLevel: pgEnum("element_strength_confidence_level_enum", ["high", "medium", "low", "insufficient"])("confidenceLevel").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_es_case").on(table.caseId),
  index("idx_es_claim_type").on(table.claimType),
]);

export type ElementStrengthRecord = typeof elementStrength.$inferSelect;
export type InsertElementStrength = typeof elementStrength.$inferInsert;

export const contradictionScores = pgTable("contradiction_scores", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  contradictionType: varchar("contradictionType", { length: 128 }).notNull(),
  severityScore: numeric("severityScore", { precision: 3, scale: 2 }).notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  factClaimA: integer("factClaimA"),
  factClaimB: integer("factClaimB"),
  evidenceReferences: jsonb("evidenceReferences").$type<number[]>(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cs_case").on(table.caseId),
  index("idx_cs_type").on(table.contradictionType),
]);

export type ContradictionScoreRecord = typeof contradictionScores.$inferSelect;
export type InsertContradictionScore = typeof contradictionScores.$inferInsert;

export const claimViability = pgTable("claim_viability", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  elementsSatisfied: jsonb("elementsSatisfied").$type<string[]>(),
  elementsMissing: jsonb("elementsMissing").$type<string[]>(),
  confidenceScore: numeric("confidenceScore", { precision: 3, scale: 2 }).notNull(),
  solStatus: pgEnum("claim_viability_sol_status_enum", ["valid", "warning", "expired", "unknown"])("solStatus").default("unknown").notNull(),
  solDaysRemaining: integer("solDaysRemaining"),
  evidenceSufficiency: pgEnum("claim_viability_evidence_sufficiency_enum", ["strong", "moderate", "weak", "insufficient"])("evidenceSufficiency").default("insufficient").notNull(),
  recommendedEvidence: jsonb("recommendedEvidence").$type<string[]>(),
  recommendedAction: text("recommendedAction"),
  agencyRouting: varchar("agencyRouting", { length: 256 }),
  contradictionCount: integer("contradictionCount").default(0),
  weakJointCount: integer("weakJointCount").default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cv_case").on(table.caseId),
  index("idx_cv_claim_type").on(table.claimType),
  index("idx_cv_sol_status").on(table.solStatus),
]);

export type ClaimViabilityRecord = typeof claimViability.$inferSelect;
export type InsertClaimViability = typeof claimViability.$inferInsert;

export const strategyMatterProfile = pgTable("strategy_matter_profile", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  domain: varchar("domain", { length: 128 }),
  incidentDate: varchar("incidentDate", { length: 64 }),
  filingDeadline: varchar("filingDeadline", { length: 64 }),
  opposingParties: jsonb("opposingParties"),
  keyFacts: jsonb("keyFacts"),
  riskFactors: jsonb("riskFactors"),
  statusSummary: text("statusSummary"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_smp_case").on(table.caseId),
]);

export type StrategyMatterProfile = typeof strategyMatterProfile.$inferSelect;
export type InsertStrategyMatterProfile = typeof strategyMatterProfile.$inferInsert;

export const strategyFactMatrix = pgTable("strategy_fact_matrix", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  matterProfileId: integer("matterProfileId").notNull(),
  factClaimId: integer("factClaimId"),
  factText: text("factText").notNull(),
  factType: varchar("factType", { length: 64 }),
  actor: varchar("actor", { length: 256 }),
  dateOccurred: varchar("dateOccurred", { length: 64 }),
  sourceQuoteId: integer("sourceQuoteId"),
  sourceDocumentId: integer("sourceDocumentId"),
  relevanceScore: numeric("relevanceScore", { precision: 5, scale: 2 }),
  disputeStatus: pgEnum("strategy_fact_matrix_dispute_status_enum", ["undisputed", "disputed", "unknown"])("disputeStatus").default("unknown"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sfm_case").on(table.caseId),
  index("idx_sfm_profile").on(table.matterProfileId),
]);

export type StrategyFactMatrix = typeof strategyFactMatrix.$inferSelect;
export type InsertStrategyFactMatrix = typeof strategyFactMatrix.$inferInsert;

export const strategyClaimCatalog = pgTable("strategy_claim_catalog", {
  id: serial("id").primaryKey(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  statuteCitation: varchar("statuteCitation", { length: 256 }),
  elementsRequired: jsonb("elementsRequired"),
  standardOfProof: varchar("standardOfProof", { length: 128 }),
  typicalForum: varchar("typicalForum", { length: 128 }),
  solYears: integer("solYears"),
  damagesAvailable: jsonb("damagesAvailable"),
  defenses: jsonb("defenses"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_scc_type").on(table.claimType),
  index("idx_scc_jurisdiction").on(table.jurisdiction),
]);

export type StrategyClaimCatalog = typeof strategyClaimCatalog.$inferSelect;
export type InsertStrategyClaimCatalog = typeof strategyClaimCatalog.$inferInsert;

export const strategyClaimCandidates = pgTable("strategy_claim_candidates", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  matterProfileId: integer("matterProfileId").notNull(),
  catalogId: integer("catalogId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  viabilityScore: numeric("viabilityScore", { precision: 5, scale: 2 }),
  elementsSatisfied: jsonb("elementsSatisfied"),
  elementsMissing: jsonb("elementsMissing"),
  supportingFactIds: jsonb("supportingFactIds"),
  solStatus: pgEnum("strategy_claim_candidates_candidate_sol_status_enum", ["within", "expiring_soon", "expired", "tolled", "unknown"])("candidateSolStatus").default("unknown"),
  solDaysRemaining: integer("solDaysRemaining"),
  recommendation: pgEnum("strategy_claim_candidates_recommendation_enum", ["pursue", "investigate_further", "weak", "barred"])("recommendation").default("investigate_further"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_scand_case").on(table.caseId),
  index("idx_scand_profile").on(table.matterProfileId),
  index("idx_scand_type").on(table.claimType),
]);

export type StrategyClaimCandidate = typeof strategyClaimCandidates.$inferSelect;
export type InsertStrategyClaimCandidate = typeof strategyClaimCandidates.$inferInsert;

export const strategyViabilityAssessment = pgTable("strategy_viability_assessment", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  matterProfileId: integer("matterProfileId").notNull(),
  candidateId: integer("candidateId").notNull(),
  overallScore: numeric("overallScore", { precision: 5, scale: 2 }),
  elementScore: numeric("elementScore", { precision: 5, scale: 2 }),
  evidenceScore: numeric("evidenceScore", { precision: 5, scale: 2 }),
  contradictionPenalty: numeric("contradictionPenalty", { precision: 5, scale: 2 }),
  weakJointPenalty: numeric("weakJointPenalty", { precision: 5, scale: 2 }),
  solScore: numeric("solScore", { precision: 5, scale: 2 }),
  patternBonus: numeric("patternBonus", { precision: 5, scale: 2 }),
  assessmentDetails: jsonb("assessmentDetails"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sva_case").on(table.caseId),
  index("idx_sva_candidate").on(table.candidateId),
]);

export type StrategyViabilityAssessment = typeof strategyViabilityAssessment.$inferSelect;
export type InsertStrategyViabilityAssessment = typeof strategyViabilityAssessment.$inferInsert;

export const strategyDeadlineEngine = pgTable("strategy_deadline_engine", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  matterProfileId: integer("matterProfileId").notNull(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  deadlineType: varchar("deadlineType", { length: 128 }),
  triggerEvent: varchar("triggerEvent", { length: 256 }),
  triggerDate: varchar("triggerDate", { length: 64 }),
  deadlineDate: varchar("deadlineDate", { length: 64 }),
  daysRemaining: integer("daysRemaining"),
  tollingApplied: boolean("tollingApplied").default(false),
  tollingReason: text("tollingReason"),
  deadlineStatus: pgEnum("strategy_deadline_engine_deadline_status_enum", ["active", "expired", "tolled", "waived"])("deadlineStatus").default("active"),
  sourceRuleId: integer("sourceRuleId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sde_case").on(table.caseId),
  index("idx_sde_claim").on(table.claimType),
  index("idx_sde_status").on(table.deadlineStatus),
]);

export type StrategyDeadlineEngine = typeof strategyDeadlineEngine.$inferSelect;
export type InsertStrategyDeadlineEngine = typeof strategyDeadlineEngine.$inferInsert;

export const strategyForumRules = pgTable("strategy_forum_rules", {
  id: serial("id").primaryKey(),
  forumName: varchar("forumName", { length: 256 }).notNull(),
  forumType: pgEnum("strategy_forum_rules_forum_type_enum", ["federal_court", "state_court", "administrative_agency", "tribal_court", "arbitration", "mediation"])("forumType"),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  claimTypesAccepted: jsonb("claimTypesAccepted"),
  filingRequirements: jsonb("filingRequirements"),
  typicalTimeline: varchar("typicalTimeline", { length: 128 }),
  costEstimate: varchar("costEstimate", { length: 128 }),
  advantageFactors: jsonb("advantageFactors"),
  disadvantageFactors: jsonb("disadvantageFactors"),
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

export const strategyElementFactLinks = pgTable("strategy_element_fact_links", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  candidateId: integer("candidateId").notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  factMatrixId: integer("factMatrixId"),
  quoteId: integer("quoteId"),
  linkStrength: pgEnum("strategy_element_fact_links_link_strength_enum", ["strong", "moderate", "weak", "absent"])("linkStrength").default("absent"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_sefl_case").on(table.caseId),
  index("idx_sefl_candidate").on(table.candidateId),
]);

export type StrategyElementFactLink = typeof strategyElementFactLinks.$inferSelect;
export type InsertStrategyElementFactLink = typeof strategyElementFactLinks.$inferInsert;

export const strategyMissingEvidenceTasks = pgTable("strategy_missing_evidence_tasks", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  candidateId: integer("candidateId").notNull(),
  element: varchar("element", { length: 256 }).notNull(),
  currentStrength: pgEnum("strategy_missing_evidence_tasks_current_strength_enum", ["strong", "moderate", "weak", "absent"])("currentStrength").default("absent"),
  suggestedEvidenceType: varchar("suggestedEvidenceType", { length: 256 }),
  suggestedSource: varchar("suggestedSource", { length: 256 }),
  taskPriority: pgEnum("strategy_missing_evidence_tasks_task_priority_enum", ["critical", "high", "medium", "low"])("taskPriority").default("medium"),
  taskStatus: pgEnum("strategy_missing_evidence_tasks_task_status_enum", ["open", "in_progress", "obtained", "unavailable"])("taskStatus").default("open"),
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

export const assemblyDocumentTemplates = pgTable("assembly_document_templates", {
  id: serial("id").primaryKey(),
  templateName: varchar("templateName", { length: 256 }).notNull(),
  documentType: varchar("documentType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  forumType: varchar("forumType", { length: 128 }),
  claimTypes: jsonb("claimTypes"),
  templateStructure: jsonb("templateStructure"),
  requiredSections: jsonb("requiredSections"),
  optionalSections: jsonb("optionalSections"),
  formattingRules: jsonb("formattingRules"),
  legalCitations: jsonb("legalCitations"),
  version: varchar("version", { length: 32 }).default("1.0"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_adt_type").on(table.documentType),
  index("idx_adt_jurisdiction").on(table.jurisdiction),
]);

export type AssemblyDocumentTemplate = typeof assemblyDocumentTemplates.$inferSelect;
export type InsertAssemblyDocumentTemplate = typeof assemblyDocumentTemplates.$inferInsert;

export const assemblySectionLibrary = pgTable("assembly_section_library", {
  id: serial("id").primaryKey(),
  sectionName: varchar("sectionName", { length: 256 }).notNull(),
  sectionType: varchar("sectionType", { length: 128 }).notNull(),
  templateId: integer("templateId"),
  orderIndex: integer("orderIndex").default(0),
  contentTemplate: text("contentTemplate"),
  placeholders: jsonb("placeholders"),
  conditionalRules: jsonb("conditionalRules"),
  legalStandards: jsonb("legalStandards"),
  exampleContent: text("exampleContent"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_asl_type").on(table.sectionType),
  index("idx_asl_template").on(table.templateId),
]);

export type AssemblySectionLibrary = typeof assemblySectionLibrary.$inferSelect;
export type InsertAssemblySectionLibrary = typeof assemblySectionLibrary.$inferInsert;

export const assemblyExhibitIndex = pgTable("assembly_exhibit_index", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  exhibitLabel: varchar("exhibitLabel", { length: 64 }).notNull(),
  exhibitTitle: varchar("exhibitTitle", { length: 512 }).notNull(),
  documentId: integer("documentId"),
  quoteIds: jsonb("quoteIds"),
  description: text("description"),
  relevantClaims: jsonb("relevantClaims"),
  relevantElements: jsonb("relevantElements"),
  orderIndex: integer("orderIndex").default(0),
  exhibitStatus: pgEnum("assembly_exhibit_index_exhibit_status_enum", ["draft", "included", "excluded", "pending_review"])("exhibitStatus").default("draft"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aei_case").on(table.caseId),
  index("idx_aei_packet").on(table.packetId),
  index("idx_aei_status").on(table.exhibitStatus),
]);

export type AssemblyExhibitIndex = typeof assemblyExhibitIndex.$inferSelect;
export type InsertAssemblyExhibitIndex = typeof assemblyExhibitIndex.$inferInsert;

export const assemblyFilingPackets = pgTable("assembly_filing_packets", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  strategyPathId: integer("strategyPathId"),
  packetName: varchar("packetName", { length: 256 }).notNull(),
  packetType: varchar("packetType", { length: 128 }).notNull(),
  forum: varchar("forum", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  claimTypes: jsonb("claimTypes"),
  generatedDocumentIds: jsonb("generatedDocumentIds"),
  exhibitIds: jsonb("exhibitIds"),
  filingDeadline: varchar("filingDeadline", { length: 64 }),
  packetStatus: pgEnum("assembly_filing_packets_packet_status_enum", ["draft", "in_progress", "review", "finalized", "filed"])("packetStatus").default("draft"),
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

export const assemblyGeneratedSections = pgTable("assembly_generated_sections", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId").notNull(),
  sectionLibraryId: integer("sectionLibraryId"),
  sectionName: varchar("sectionName", { length: 256 }).notNull(),
  orderIndex: integer("orderIndex").default(0),
  generatedContent: text("generatedContent"),
  placeholderValues: jsonb("placeholderValues"),
  citationsUsed: jsonb("citationsUsed"),
  factsReferenced: jsonb("factsReferenced"),
  exhibitsReferenced: jsonb("exhibitsReferenced"),
  sectionStatus: pgEnum("assembly_generated_sections_section_status_enum", ["generated", "reviewed", "approved", "needs_revision"])("sectionStatus").default("generated"),
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

export const assemblyCitationIndex = pgTable("assembly_citation_index", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  citationType: varchar("citationType", { length: 64 }).notNull(),
  citationText: text("citationText").notNull(),
  bluebookFormat: text("bluebookFormat"),
  sourceStatuteId: integer("sourceStatuteId"),
  sourceCaseLawId: integer("sourceCaseLawId"),
  sourceDoctrineId: integer("sourceDoctrineId"),
  relevantClaims: jsonb("relevantClaims"),
  sectionIds: jsonb("sectionIds"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aci_case").on(table.caseId),
  index("idx_aci_packet").on(table.packetId),
  index("idx_aci_type").on(table.citationType),
]);

export type AssemblyCitationIndex = typeof assemblyCitationIndex.$inferSelect;
export type InsertAssemblyCitationIndex = typeof assemblyCitationIndex.$inferInsert;

export const assemblyFactNarrativeBlocks = pgTable("assembly_fact_narrative_blocks", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  blockType: varchar("blockType", { length: 64 }).notNull(),
  orderIndex: integer("orderIndex").default(0),
  narrativeText: text("narrativeText"),
  factMatrixIds: jsonb("factMatrixIds"),
  quoteIds: jsonb("quoteIds"),
  exhibitRefs: jsonb("exhibitRefs"),
  timelinePosition: varchar("timelinePosition", { length: 64 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_afnb_case").on(table.caseId),
  index("idx_afnb_packet").on(table.packetId),
]);

export type AssemblyFactNarrativeBlock = typeof assemblyFactNarrativeBlocks.$inferSelect;
export type InsertAssemblyFactNarrativeBlock = typeof assemblyFactNarrativeBlocks.$inferInsert;

export const assemblyLegalArgumentBlocks = pgTable("assembly_legal_argument_blocks", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  argumentHeading: varchar("argumentHeading", { length: 512 }),
  orderIndex: integer("orderIndex").default(0),
  argumentText: text("argumentText"),
  supportingCitations: jsonb("supportingCitations"),
  supportingFacts: jsonb("supportingFacts"),
  elementsCovered: jsonb("elementsCovered"),
  counterarguments: jsonb("counterarguments"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_alab_case").on(table.caseId),
  index("idx_alab_packet").on(table.packetId),
  index("idx_alab_claim").on(table.claimType),
]);

export type AssemblyLegalArgumentBlock = typeof assemblyLegalArgumentBlocks.$inferSelect;
export type InsertAssemblyLegalArgumentBlock = typeof assemblyLegalArgumentBlocks.$inferInsert;

export const assemblyReliefRequests = pgTable("assembly_relief_requests", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  reliefType: varchar("reliefType", { length: 128 }).notNull(),
  reliefDescription: text("reliefDescription"),
  legalBasis: text("legalBasis"),
  estimatedValue: varchar("estimatedValue", { length: 128 }),
  claimTypes: jsonb("claimTypes"),
  orderIndex: integer("orderIndex").default(0),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_arr_case").on(table.caseId),
  index("idx_arr_packet").on(table.packetId),
]);

export type AssemblyReliefRequest = typeof assemblyReliefRequests.$inferSelect;
export type InsertAssemblyReliefRequest = typeof assemblyReliefRequests.$inferInsert;

export const assemblyPartyDesignations = pgTable("assembly_party_designations", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  partyRole: varchar("partyRole", { length: 128 }).notNull(),
  partyName: varchar("partyName", { length: 512 }).notNull(),
  entityId: integer("entityId"),
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

export const assemblyComplianceChecklist = pgTable("assembly_compliance_checklist", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId"),
  checkItem: varchar("checkItem", { length: 512 }).notNull(),
  category: varchar("category", { length: 128 }),
  checkStatus: pgEnum("assembly_compliance_checklist_check_status_enum", ["pending", "passed", "failed", "waived"])("checkStatus").default("pending"),
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

export const assemblyVersionHistory = pgTable("assembly_version_history", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId").notNull(),
  versionNumber: integer("versionNumber").notNull(),
  changeType: varchar("changeType", { length: 64 }),
  changeSummary: text("changeSummary"),
  changedBy: varchar("changedBy", { length: 256 }),
  previousContent: jsonb("previousContent"),
  newContent: jsonb("newContent"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_avh_case").on(table.caseId),
  index("idx_avh_packet").on(table.packetId),
]);

export type AssemblyVersionHistory = typeof assemblyVersionHistory.$inferSelect;
export type InsertAssemblyVersionHistory = typeof assemblyVersionHistory.$inferInsert;

export const assemblyOutputRegistry = pgTable("assembly_output_registry", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  packetId: integer("packetId").notNull(),
  outputFormat: varchar("outputFormat", { length: 64 }).notNull(),
  outputUrl: text("outputUrl"),
  outputKey: varchar("outputKey", { length: 512 }),
  fileSize: integer("fileSize"),
  generatedAt: bigint("generatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  sha256Hash: varchar("sha256Hash", { length: 64 }),
  outputStatus: pgEnum("assembly_output_registry_output_status_enum", ["generating", "ready", "error"])("outputStatus").default("generating"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_aor_case").on(table.caseId),
  index("idx_aor_packet").on(table.packetId),
  index("idx_aor_status").on(table.outputStatus),
]);

export type AssemblyOutputRegistry = typeof assemblyOutputRegistry.$inferSelect;
export type InsertAssemblyOutputRegistry = typeof assemblyOutputRegistry.$inferInsert;

export const patternEntityClusters = pgTable("pattern_entity_clusters", {
  id: serial("id").primaryKey(),
  entityName: varchar("entityName", { length: 512 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  aliases: jsonb("aliases"),
  caseIds: jsonb("caseIds"),
  caseCount: integer("caseCount").default(0),
  firstSeen: bigint("firstSeen", { mode: "number" }),
  lastSeen: bigint("lastSeen", { mode: "number" }),
  jurisdictions: jsonb("jurisdictions"),
  claimTypes: jsonb("claimTypes"),
  riskScore: numeric("riskScore", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pec_name").on(table.entityName),
  index("idx_pec_type").on(table.entityType),
]);

export type PatternEntityCluster = typeof patternEntityClusters.$inferSelect;
export type InsertPatternEntityCluster = typeof patternEntityClusters.$inferInsert;

export const patternConductClusters = pgTable("pattern_conduct_clusters", {
  id: serial("id").primaryKey(),
  conductType: varchar("conductType", { length: 256 }).notNull(),
  conductCategory: varchar("conductCategory", { length: 128 }),
  description: text("description"),
  caseIds: jsonb("caseIds"),
  caseCount: integer("caseCount").default(0),
  entityClusterIds: jsonb("entityClusterIds"),
  commonElements: jsonb("commonElements"),
  frequencyScore: numeric("frequencyScore", { precision: 5, scale: 2 }),
  severityScore: numeric("severityScore", { precision: 5, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pcc_type").on(table.conductType),
  index("idx_pcc_category").on(table.conductCategory),
]);

export type PatternConductCluster = typeof patternConductClusters.$inferSelect;
export type InsertPatternConductCluster = typeof patternConductClusters.$inferInsert;

export const patternOutcomeAnalytics = pgTable("pattern_outcome_analytics", {
  id: serial("id").primaryKey(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  forum: varchar("forum", { length: 256 }),
  totalCases: integer("totalCases").default(0),
  winRate: numeric("winRate", { precision: 5, scale: 2 }),
  settlementRate: numeric("settlementRate", { precision: 5, scale: 2 }),
  avgSettlementAmount: numeric("avgSettlementAmount", { precision: 12, scale: 2 }),
  avgTimeToResolution: varchar("avgTimeToResolution", { length: 64 }),
  medianDamagesAwarded: numeric("medianDamagesAwarded", { precision: 12, scale: 2 }),
  keyFactors: jsonb("keyFactors"),
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

export const patternOutcomeDivergence = pgTable("pattern_outcome_divergence", {
  id: serial("id").primaryKey(),
  claimType: varchar("claimType", { length: 128 }).notNull(),
  jurisdictionA: varchar("jurisdictionA", { length: 128 }).notNull(),
  jurisdictionB: varchar("jurisdictionB", { length: 128 }).notNull(),
  metricName: varchar("metricName", { length: 128 }).notNull(),
  valueA: numeric("valueA", { precision: 10, scale: 2 }),
  valueB: numeric("valueB", { precision: 10, scale: 2 }),
  divergenceScore: numeric("divergenceScore", { precision: 5, scale: 2 }),
  explanation: text("explanation"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pod_claim").on(table.claimType),
  index("idx_pod_jA").on(table.jurisdictionA),
  index("idx_pod_jB").on(table.jurisdictionB),
]);

export type PatternOutcomeDivergence = typeof patternOutcomeDivergence.$inferSelect;
export type InsertPatternOutcomeDivergence = typeof patternOutcomeDivergence.$inferInsert;

export const patternSystemicInferences = pgTable("pattern_systemic_inferences", {
  id: serial("id").primaryKey(),
  inferenceType: varchar("inferenceType", { length: 128 }).notNull(),
  description: text("description").notNull(),
  entityClusterIds: jsonb("entityClusterIds"),
  conductClusterIds: jsonb("conductClusterIds"),
  supportingCaseIds: jsonb("supportingCaseIds"),
  evidenceStrength: pgEnum("pattern_systemic_inferences_evidence_strength_enum", ["strong", "moderate", "preliminary"])("evidenceStrength").default("preliminary"),
  confidenceScore: numeric("confidenceScore", { precision: 5, scale: 2 }),
  legalImplications: text("legalImplications"),
  recommendedActions: jsonb("recommendedActions"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_psi_type").on(table.inferenceType),
  index("idx_psi_strength").on(table.evidenceStrength),
]);

export type PatternSystemicInference = typeof patternSystemicInferences.$inferSelect;
export type InsertPatternSystemicInference = typeof patternSystemicInferences.$inferInsert;

export const patternTemporalTrends = pgTable("pattern_temporal_trends", {
  id: serial("id").primaryKey(),
  trendType: varchar("trendType", { length: 128 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  periodStart: varchar("periodStart", { length: 32 }),
  periodEnd: varchar("periodEnd", { length: 32 }),
  metricName: varchar("metricName", { length: 128 }).notNull(),
  metricValue: numeric("metricValue", { precision: 10, scale: 2 }),
  previousValue: numeric("previousValue", { precision: 10, scale: 2 }),
  changePercent: numeric("changePercent", { precision: 7, scale: 2 }),
  trendDirection: pgEnum("pattern_temporal_trends_trend_direction_enum", ["increasing", "decreasing", "stable"])("trendDirection").default("stable"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ptt_type").on(table.trendType),
  index("idx_ptt_claim").on(table.claimType),
]);

export type PatternTemporalTrend = typeof patternTemporalTrends.$inferSelect;
export type InsertPatternTemporalTrend = typeof patternTemporalTrends.$inferInsert;

export const patternGeographicHotspots = pgTable("pattern_geographic_hotspots", {
  id: serial("id").primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  region: varchar("region", { length: 128 }),
  claimType: varchar("claimType", { length: 128 }),
  caseCount: integer("caseCount").default(0),
  densityScore: numeric("densityScore", { precision: 5, scale: 2 }),
  topEntities: jsonb("topEntities"),
  topConductTypes: jsonb("topConductTypes"),
  periodCovered: varchar("periodCovered", { length: 64 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pgh_jurisdiction").on(table.jurisdiction),
  index("idx_pgh_claim").on(table.claimType),
]);

export type PatternGeographicHotspot = typeof patternGeographicHotspots.$inferSelect;
export type InsertPatternGeographicHotspot = typeof patternGeographicHotspots.$inferInsert;

export const patternIndustryProfiles = pgTable("pattern_industry_profiles", {
  id: serial("id").primaryKey(),
  industryName: varchar("industryName", { length: 256 }).notNull(),
  naicsCode: varchar("naicsCode", { length: 16 }),
  commonClaimTypes: jsonb("commonClaimTypes"),
  commonViolations: jsonb("commonViolations"),
  avgCaseCount: integer("avgCaseCount").default(0),
  riskLevel: pgEnum("pattern_industry_profiles_risk_level_enum", ["high", "medium", "low"])("riskLevel").default("medium"),
  regulatoryFocus: jsonb("regulatoryFocus"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pip_name").on(table.industryName),
  index("idx_pip_risk").on(table.riskLevel),
]);

export type PatternIndustryProfile = typeof patternIndustryProfiles.$inferSelect;
export type InsertPatternIndustryProfile = typeof patternIndustryProfiles.$inferInsert;

export const patternEvidenceCorrelations = pgTable("pattern_evidence_correlations", {
  id: serial("id").primaryKey(),
  evidenceType: varchar("evidenceType", { length: 128 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  correlationStrength: numeric("correlationStrength", { precision: 5, scale: 2 }),
  outcomeImpact: pgEnum("pattern_evidence_correlations_outcome_impact_enum", ["strongly_positive", "positive", "neutral", "negative", "strongly_negative"])("outcomeImpact").default("neutral"),
  sampleSize: integer("sampleSize").default(0),
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pecorr_evidence").on(table.evidenceType),
  index("idx_pecorr_claim").on(table.claimType),
]);

export type PatternEvidenceCorrelation = typeof patternEvidenceCorrelations.$inferSelect;
export type InsertPatternEvidenceCorrelation = typeof patternEvidenceCorrelations.$inferInsert;

export const patternDefenseStrategies = pgTable("pattern_defense_strategies", {
  id: serial("id").primaryKey(),
  defenseName: varchar("defenseName", { length: 256 }).notNull(),
  claimType: varchar("claimType", { length: 128 }),
  frequencyObserved: integer("frequencyObserved").default(0),
  successRate: numeric("successRate", { precision: 5, scale: 2 }),
  counterStrategies: jsonb("counterStrategies"),
  vulnerabilities: jsonb("vulnerabilities"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pds_name").on(table.defenseName),
  index("idx_pds_claim").on(table.claimType),
]);

export type PatternDefenseStrategy = typeof patternDefenseStrategies.$inferSelect;
export type InsertPatternDefenseStrategy = typeof patternDefenseStrategies.$inferInsert;

export const patternCaseLinks = pgTable("pattern_case_links", {
  id: serial("id").primaryKey(),
  caseIdA: integer("caseIdA").notNull(),
  caseIdB: integer("caseIdB").notNull(),
  linkType: varchar("linkType", { length: 128 }).notNull(),
  sharedEntityClusterIds: jsonb("sharedEntityClusterIds"),
  sharedConductClusterIds: jsonb("sharedConductClusterIds"),
  similarityScore: numeric("similarityScore", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pcl_caseA").on(table.caseIdA),
  index("idx_pcl_caseB").on(table.caseIdB),
  index("idx_pcl_type").on(table.linkType),
]);

export type PatternCaseLink = typeof patternCaseLinks.$inferSelect;
export type InsertPatternCaseLink = typeof patternCaseLinks.$inferInsert;

export const patternAggregationRuns = pgTable("pattern_aggregation_runs", {
  id: serial("id").primaryKey(),
  runType: varchar("runType", { length: 64 }).notNull(),
  caseIdsAnalyzed: jsonb("caseIdsAnalyzed"),
  totalCasesProcessed: integer("totalCasesProcessed").default(0),
  entityClustersFound: integer("entityClustersFound").default(0),
  conductClustersFound: integer("conductClustersFound").default(0),
  systemicInferencesGenerated: integer("systemicInferencesGenerated").default(0),
  runStatus: pgEnum("pattern_aggregation_runs_run_status_enum", ["running", "completed", "failed"])("runStatus").default("running"),
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

export const patternFeedbackLoop = pgTable("pattern_feedback_loop", {
  id: serial("id").primaryKey(),
  strategyPathId: integer("strategyPathId").notNull(),
  entityClusterId: integer("entityClusterId"),
  conductClusterId: integer("conductClusterId"),
  outcomeAnalyticsId: integer("outcomeAnalyticsId"),
  systemicInferenceId: integer("systemicInferenceId"),
  feedbackType: varchar("feedbackType", { length: 64 }).notNull(),
  adjustmentApplied: text("adjustmentApplied"),
  confidenceDelta: numeric("confidenceDelta", { precision: 5, scale: 2 }),
  appliedAt: bigint("appliedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pfl_strategy").on(table.strategyPathId),
  index("idx_pfl_entity").on(table.entityClusterId),
  index("idx_pfl_type").on(table.feedbackType),
]);

export type PatternFeedbackLoop = typeof patternFeedbackLoop.$inferSelect;
export type InsertPatternFeedbackLoop = typeof patternFeedbackLoop.$inferInsert;

export const engineRuns = pgTable("engine_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 128 }),
  caseId: integer("caseId").notNull(),
  engineId: varchar("engine_id", { length: 128 }),
  userId: integer("userId"),
  runType: pgEnum("engine_runs_engine_run_type_enum", ["full_pipeline", "viability_only", "strategy_only", "assembly_only", "pattern_only"])("engineRunType").default("full_pipeline"),
  runStatus: pgEnum("engine_runs_engine_run_status_enum", ["pending", "running", "success", "failed", "unknown", "superseded"])("engineRunStatus").default("pending"),
  status: varchar("status", { length: 32 }).default("pending"),
  currentStage: varchar("currentStage", { length: 64 }),
  stageResults: jsonb("stageResults"),
  outputRefs: jsonb("output_refs"),
  snapshotId: integer("snapshot_id"),
  viabilityRunId: integer("viabilityRunId"),
  strategyMatterProfileId: integer("strategyMatterProfileId"),
  assemblyPacketId: integer("assemblyPacketId"),
  patternAggregationRunId: integer("patternAggregationRunId"),
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

export const legislatorContacts = pgTable("legislator_contacts", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 256 }).notNull(),
  title: varchar("title", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  chamber: pgEnum("legislator_contacts_chamber_enum", ["federal_senate", "federal_house", "state_senate", "state_house", "state_assembly", "city_council", "county_commission", "other"])("chamber").notNull(),
  party: varchar("party", { length: 64 }),
  district: varchar("district", { length: 128 }),
  state: varchar("state", { length: 64 }),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 64 }),
  officeAddress: text("office_address"),
  website: varchar("website", { length: 512 }),
  committees: jsonb("committees").$type<string[]>(),
  domains: jsonb("domains").$type<string[]>(),
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

export const advocacyOrganizations = pgTable("advocacy_organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  orgType: pgEnum("advocacy_organizations_org_type_enum", ["legal_aid", "nonprofit", "community_org", "union", "bar_association", "government_program", "advocacy_group", "research_institute", "other"])("org_type").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  state: varchar("state", { length: 64 }),
  domains: jsonb("domains").$type<string[]>(),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 64 }),
  website: varchar("website", { length: 512 }),
  address: text("address"),
  description: text("description"),
  servicesOffered: jsonb("services_offered").$type<string[]>(),
  eligibilityCriteria: text("eligibility_criteria"),
  languages: jsonb("languages").$type<string[]>(),
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

export const courtDirectory = pgTable("court_directory", {
  id: serial("id").primaryKey(),
  courtId: varchar("court_id", { length: 32 }).notNull().unique(),
  courtName: varchar("court_name", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }).notNull(),
  courtType: pgEnum("court_directory_court_type_enum", [
    "Appellate", "State Supreme Court", "Administrative Tribunal",
    "Federal District", "State Trial", "Bankruptcy", "Tax", "Military", "Tribal"
  ])("court_type").notNull(),
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

export const intakeDocumentTemplates = pgTable("intake_document_templates", {
  id: serial("id").primaryKey(),
  templateId: varchar("template_id", { length: 32 }).notNull().unique(),
  templateName: varchar("template_name", { length: 512 }).notNull(),
  purpose: text("purpose"),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  requiredFields: jsonb("required_fields").$type<string[]>(),
  templateText: text("template_text").notNull(),
  attachmentsRequired: text("attachments_required"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_idt_jurisdiction").on(table.jurisdiction),
]);

export type IntakeDocumentTemplate = typeof intakeDocumentTemplates.$inferSelect;
export type InsertIntakeDocumentTemplate = typeof intakeDocumentTemplates.$inferInsert;

export const evidenceProofLinks = pgTable("evidence_proof_links", {
  id: serial("id").primaryKey(),
  evidenceId: integer("evidenceId").notNull(),
  frameworkId: integer("frameworkId").notNull(),
  elementNumber: integer("elementNumber").notNull(), // 1-indexed element in proof framework
  relationshipStrength: numeric("relationshipStrength", { precision: 3, scale: 2 }), // 0.00-1.00
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_epl_evidence").on(table.evidenceId),
  index("idx_epl_framework").on(table.frameworkId),
  index("idx_epl_element").on(table.frameworkId, table.elementNumber),
]);

export type EvidenceProofLink = typeof evidenceProofLinks.$inferSelect;
export type InsertEvidenceProofLink = typeof evidenceProofLinks.$inferInsert;

export const evidenceEventLinks = pgTable("evidence_event_links", {
  id: serial("id").primaryKey(),
  evidenceId: integer("evidenceId").notNull(),
  eventId: integer("eventId").notNull(),
  relationship: varchar("relationship", { length: 64 }).notNull(), // proves, corroborates, contradicts, references
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_eel_evidence").on(table.evidenceId),
  index("idx_eel_event").on(table.eventId),
]);

export type EvidenceEventLink = typeof evidenceEventLinks.$inferSelect;
export type InsertEvidenceEventLink = typeof evidenceEventLinks.$inferInsert;

export const evidenceGraphEdges = pgTable("evidence_graph_edges", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  fromType: pgEnum("evidence_graph_edges_from_type_eg_enum", ["evidence", "event"])("fromType_eg").notNull(),
  fromId: integer("fromId").notNull(),
  edgeType: pgEnum("evidence_graph_edges_edge_type_eg_enum", ["proves", "supports", "triggers", "involves", "corroborates", "contradicts"])("edgeType_eg").notNull(),
  toType: pgEnum("evidence_graph_edges_to_type_eg_enum", ["event", "claim", "barrier", "agency", "proof_element"])("toType_eg").notNull(),
  toId: varchar("toId_eg", { length: 256 }).notNull(), // claim type string, barrier ID, agency name, or proof element ref
  strength: pgEnum("evidence_graph_edges_strength_eg_enum", ["strong", "moderate", "weak"])("strength_eg").default("moderate").notNull(),
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

export const datasetRegistry = pgTable("dataset_registry", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 64 }).notNull().unique(),
  datasetName: varchar("datasetName", { length: 256 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(), // socrata, courtlistener, data_gov, csv
  apiUrl: varchar("apiUrl", { length: 512 }).notNull(),
  updateFrequency: pgEnum("dataset_registry_update_frequency_enum", ["hourly", "daily", "weekly", "monthly", "manual"])("updateFrequency").default("daily").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  domain: varchar("domain_dr", { length: 128 }).notNull(),
  description: text("description_dr"),
  fieldMapping: jsonb("fieldMapping").$type<Record<string, string>>(), // maps source fields to normalized fields
  enabled: boolean("enabled").default(true).notNull(),
  lastIngestedAt: bigint("lastIngestedAt", { mode: "number" }),
  totalRecordsIngested: integer("totalRecordsIngested").default(0).notNull(),
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

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId_run", { length: 64 }).notNull(),
  startTime: bigint("startTime", { mode: "number" }).notNull(),
  endTime: bigint("endTime", { mode: "number" }),
  recordsProcessed: integer("recordsProcessed").default(0).notNull(),
  recordsInserted: integer("recordsInserted").default(0).notNull(),
  recordsUpdated: integer("recordsUpdated").default(0).notNull(),
  signalsGenerated: integer("signalsGenerated").default(0).notNull(),
  status: pgEnum("ingest_runs_ingest_status_enum", ["running", "completed", "failed", "cancelled", "api_unavailable", "partial"])("ingestStatus").default("running").notNull(),
  errors: jsonb("errors_run").$type<string[]>(),
  summary: text("summary_run"),
  // Session 80: Structured diagnostics
  errorClassification: varchar("error_classification_run", { length: 64 }),
  httpStatus: integer("http_status_run"),
  contentType: varchar("content_type_run", { length: 128 }),
  endpointAttempted: varchar("endpoint_attempted_run", { length: 512 }),
  adapterUsed: varchar("adapter_used_run", { length: 64 }),
  bodyPreview: text("body_preview_run"),
  parseFailureReason: text("parse_failure_reason_run"),
  retryCount: integer("retry_count_run").default(0).notNull(),
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

export const liveSignals = pgTable("live_signals", {
  id: serial("id").primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull(),
  datasetId: varchar("datasetId", { length: 64 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
  domain: varchar("domain", { length: 128 }).notNull(),
  severity: pgEnum("live_signals_severity_enum", ["critical", "high", "medium", "low"])("severity").default("high").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation").notNull(),
  patternSummary: text("patternSummary").notNull(),
  supportingStatistics: jsonb("supportingStatistics").$type<{
    recordsAnalyzed: number;
    patternCount: number;
    percentageAffected: number;
    timeRange: { from: number; to: number };
    jurisdictionsAffected: string[];
    dataSource: string;
    additionalMetrics?: Record<string, number | string>;
  }>().notNull(),
  confidenceScore: numeric("confidenceScore", { precision: 5, scale: 4 }).notNull(),
  detectedAt: bigint("detectedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  ingestRunId: integer("ingestRunId"),
  // Link to existing signal registry if this matches a known pattern
  signalRegistryId: integer("signalRegistryId"),
  // Deduplication: hash of signal type + dataset + jurisdiction + time window
  signalFingerprint: varchar("signalFingerprint", { length: 64 }).notNull(),
  supersededBy: integer("supersededBy"), // if a newer signal replaces this one
  active: boolean("active").default(true).notNull(),
  // Entity classification fields (Session 65)
  entityType: pgEnum("live_signals_entity_type_ls_enum", [
    "corporation", "organization", "government_agency", "nonprofit",
    "landlord_entity", "contractor_business", "financial_institution",
    "telecom_company", "media_company", "individual_person", "unknown"
  ])("entity_type_ls"),
  entityConfidenceScore: numeric("entity_confidence_score_ls", { precision: 5, scale: 4 }),
  canonicalEntityName: varchar("canonical_entity_name", { length: 512 }),
  entityAliasesJson: jsonb("entity_aliases_json").$type<string[]>(),
  entityRole: varchar("entity_role", { length: 64 }),
  roleConfidence: numeric("role_confidence", { precision: 5, scale: 4 }),
  // ─── Gating fields (Live Signals System Phase 2) ───
  // effectType: behavioral effect on downstream consumers
  effectType: pgEnum("live_signals_effect_type_ls_enum", [
    "RESOURCE_STALE",
    "PATH_INVALID",
    "DEADLINE_APPROACHING",
    "POLICY_CHANGE",
    "STREAM_ANOMALY",
    "ENTITY_RISK",
  ])("effect_type_ls"),
  // targetTable: which table the signal applies to
  targetTable: varchar("target_table_ls", { length: 64 }),
  // targetId: the specific row ID in targetTable
  targetId: integer("target_id_ls"),
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

export const rawLiveSignals = pgTable("raw_live_signals", {
  id: serial("id").primaryKey(),
  signalType: varchar("signalType", { length: 256 }).notNull(),
  sourceId: varchar("sourceId", { length: 512 }).notNull().unique(),
  value: text("value").notNull(),
  numericValue: numeric("numericValue", { precision: 10, scale: 2 }),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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

export const interpCategoryInterpretations = pgTable("interp_category_interpretations", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),   // e.g. "gpri-47xz" or "j78t-andi"
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  plainLanguageExplanation: text("plainLanguageExplanation").notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),         // e.g. "campaign_finance", "financial_harm"
  relatedLaws: jsonb("relatedLaws").$type<string[]>(),
  relatedAgencies: jsonb("relatedAgencies").$type<string[]>(),
}, (table) => [
  index("idx_ici_dataset").on(table.datasetId),
  index("idx_ici_domain").on(table.domain),
]);

export type InterpCategoryInterpretation = typeof interpCategoryInterpretations.$inferSelect;
export type InsertInterpCategoryInterpretation = typeof interpCategoryInterpretations.$inferInsert;

export const interpHarmMappings = pgTable("interp_harm_mappings", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  riskType: varchar("riskType", { length: 100 }).notNull(),     // e.g. "undisclosed_political_funding", "financial_harm"
  riskDescription: text("riskDescription").notNull(),
  detectionIndicators: jsonb("detectionIndicators").$type<string[]>(),
  severityBase: varchar("severityBase", { length: 50 }).notNull(),
}, (table) => [
  index("idx_ihm_dataset").on(table.datasetId),
  index("idx_ihm_risk").on(table.riskType),
]);

export type InterpHarmMapping = typeof interpHarmMappings.$inferSelect;
export type InsertInterpHarmMapping = typeof interpHarmMappings.$inferInsert;

export const interpTimelineExpectations = pgTable("interp_timeline_expectations", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  frequency: varchar("frequency", { length: 100 }),             // e.g. "weekly during session", "monthly"
  expectedMinDays: integer("expectedMinDays").notNull(),
  expectedMaxDays: integer("expectedMaxDays").notNull(),
  sourceReference: varchar("sourceReference", { length: 255 }),
  notes: text("notes"),
  electionCycleMultiplier: doublePrecision("electionCycleMultiplier"),   // PDC-specific: multiplier during election cycles
}, (table) => [
  index("idx_ite_dataset").on(table.datasetId),
]);

export type InterpTimelineExpectation = typeof interpTimelineExpectations.$inferSelect;
export type InsertInterpTimelineExpectation = typeof interpTimelineExpectations.$inferInsert;

export const interpEntitySignalRules = pgTable("interp_entity_signal_rules", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  thresholdCount: integer("thresholdCount").notNull(),
  timeWindowDays: integer("timeWindowDays").notNull(),
  severity: varchar("severity", { length: 50 }).notNull(),
  description: text("description").notNull(),
  actionRecommendation: text("actionRecommendation"),
}, (table) => [
  index("idx_iesr_dataset").on(table.datasetId),
  index("idx_iesr_signal").on(table.signalType),
]);

export type InterpEntitySignalRule = typeof interpEntitySignalRules.$inferSelect;
export type InsertInterpEntitySignalRule = typeof interpEntitySignalRules.$inferInsert;

export const interpGeographicSignalRules = pgTable("interp_geographic_signal_rules", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  geographicScope: varchar("geographicScope", { length: 50 }).notNull(),
  thresholdCount: integer("thresholdCount").notNull(),
  thresholdPercentage: doublePrecision("thresholdPercentage"),           // PDC-specific: percentage thresholds
  timeWindowDays: integer("timeWindowDays"),                        // PDC-specific
  description: text("description").notNull(),
  baselineComparison: varchar("baselineComparison", { length: 100 }),
}, (table) => [
  index("idx_igsr_dataset").on(table.datasetId),
  index("idx_igsr_signal").on(table.signalType),
]);

export type InterpGeographicSignalRule = typeof interpGeographicSignalRules.$inferSelect;
export type InsertInterpGeographicSignalRule = typeof interpGeographicSignalRules.$inferInsert;

export const interpStatusInterpretations = pgTable("interp_status_interpretations", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  status: varchar("status", { length: 255 }).notNull(),
  meaning: text("meaning").notNull(),
  transparencyImplication: text("transparencyImplication"),     // PDC-specific
  signalInterpretation: text("signalInterpretation").notNull(),
  warningThresholdPercentage: integer("warningThresholdPercentage"),
}, (table) => [
  index("idx_isi_dataset").on(table.datasetId),
]);

export type InterpStatusInterpretation = typeof interpStatusInterpretations.$inferSelect;
export type InsertInterpStatusInterpretation = typeof interpStatusInterpretations.$inferInsert;

export const interpSignalTemplates = pgTable("interp_signal_templates", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  signalType: varchar("signalType", { length: 100 }).notNull(),
  templateText: text("templateText").notNull(),
  severityLevel: varchar("severityLevel", { length: 50 }).notNull(),
  exampleUse: text("exampleUse"),
  dataContextRequired: jsonb("dataContextRequired").$type<string[]>(),
}, (table) => [
  index("idx_ist_dataset").on(table.datasetId),
  index("idx_ist_signal").on(table.signalType),
]);

export type InterpSignalTemplate = typeof interpSignalTemplates.$inferSelect;
export type InsertInterpSignalTemplate = typeof interpSignalTemplates.$inferInsert;

export const interpJurisdictionGuidance = pgTable("interp_jurisdiction_guidance", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 20 }).notNull(),
  scopeName: varchar("scopeName", { length: 50 }).notNull(),
  description: text("description").notNull(),
  detectionCriteria: text("detectionCriteria").notNull(),
  examples: jsonb("examples").$type<string[]>(),
  signalImplications: text("signalImplications"),
}, (table) => [
  index("idx_ijg_dataset").on(table.datasetId),
  index("idx_ijg_scope").on(table.scopeName),
]);

export type InterpJurisdictionGuidance = typeof interpJurisdictionGuidance.$inferSelect;
export type InsertInterpJurisdictionGuidance = typeof interpJurisdictionGuidance.$inferInsert;

export const knowledgeModules = pgTable("knowledge_modules", {
  id: serial("id").primaryKey(),
  moduleType: varchar("moduleType", { length: 50 }).notNull(),
  moduleName: varchar("moduleName", { length: 200 }).notNull(),
  description: text("description").notNull(),
  sourceFile: varchar("sourceFile", { length: 200 }),
  totalEntries: integer("totalEntries").notNull().default(0),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  loadedAt: bigint("loadedAt", { mode: "number" }).notNull(),
  isActive: smallint("isActive").notNull().default(1),
});

export const knowledgeEntries = pgTable("knowledge_entries", {
  id: serial("id").primaryKey(),
  moduleId: integer("moduleId").notNull(),
  entryId: varchar("entryId", { length: 200 }).notNull(),
  entryName: varchar("entryName", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }),
  severity: varchar("severity", { length: 20 }),
  domain: varchar("domain", { length: 100 }),
  payload: jsonb("payload").notNull(),
  tags: jsonb("tags"),
  crossRefModules: jsonb("crossRefModules"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const knowledgeCrossRefs = pgTable("knowledge_cross_refs", {
  id: serial("id").primaryKey(),
  sourceModuleId: integer("sourceModuleId").notNull(),
  sourceEntryId: varchar("sourceEntryId", { length: 200 }).notNull(),
  targetModuleId: integer("targetModuleId").notNull(),
  targetEntryId: varchar("targetEntryId", { length: 200 }),
  targetTable: varchar("targetTable", { length: 100 }),
  relationship: varchar("relationship", { length: 100 }).notNull(),
  notes: text("notes"),
});

export const signalExplanationsExtended = pgTable("signal_explanations_extended", {
  id: serial("id").primaryKey(),
  templateId: varchar("templateId", { length: 50 }).notNull(),
  signalType: varchar("signalType", { length: 50 }).notNull(),
  datasetId: varchar("datasetId", { length: 50 }),
  templateText: text("templateText").notNull(),
  requiredFields: jsonb("requiredFields"),
  confidenceRequired: integer("confidenceRequired").notNull().default(0),
  verificationMethod: varchar("verificationMethod", { length: 100 }),
  falsePositiveRisks: jsonb("falsePositiveRisks"),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const confidenceFactors = pgTable("confidence_factors", {
  id: serial("id").primaryKey(),
  factorName: varchar("factorName", { length: 100 }).notNull(),
  weight: varchar("weight", { length: 10 }).notNull(),
  description: text("description").notNull(),
  scoringRules: jsonb("scoringRules").notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
});

export const datasetProvenance = pgTable("dataset_provenance", {
  id: serial("id").primaryKey(),
  datasetId: varchar("datasetId", { length: 50 }).notNull(),
  sourceName: varchar("sourceName", { length: 200 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 500 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  domain: varchar("domain", { length: 100 }),
  updateFrequency: varchar("updateFrequency", { length: 50 }),
  lastFetched: bigint("lastFetched", { mode: "number" }),
  recordCount: integer("recordCount").default(0),
  qualityScore: integer("qualityScore"),
  notes: text("notes"),
});

export const signalGenerationLog = pgTable("signal_generation_log", {
  id: serial("id").primaryKey(),
  signalId: varchar("signalId", { length: 50 }).notNull(),
  stepName: varchar("stepName", { length: 100 }).notNull(),
  templateUsed: varchar("templateUsed", { length: 50 }),
  parameters: jsonb("parameters"),
  verificationResult: varchar("verificationResult", { length: 50 }),
  factorBreakdown: jsonb("factorBreakdown"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const escalationThresholds = pgTable("escalation_thresholds", {
  id: serial("id").primaryKey(),
  tierName: varchar("tierName", { length: 50 }).notNull(),
  minScore: integer("minScore").notNull(),
  maxScore: integer("maxScore").notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  notifyRoles: jsonb("notifyRoles"),
  autoEscalate: smallint("autoEscalate").notNull().default(0),
});

export const remedyPaths = pgTable("remedy_paths", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  pathType: varchar("pathType", { length: 64 }).notNull(), // administrative, judicial, legislative, informal, hybrid
  viability: varchar("viability", { length: 32 }).notNull(), // strong, moderate, weak, uncertain
  estimatedTimeline: varchar("estimatedTimeline", { length: 128 }),
  estimatedCost: varchar("estimatedCost", { length: 128 }),
  riskLevel: varchar("riskLevel", { length: 32 }), // low, medium, high
  prerequisites: jsonb("prerequisites").$type<string[]>(),
  relatedClaimTypes: jsonb("relatedClaimTypes").$type<string[]>(),
  generatedBy: varchar("generatedBy", { length: 32 }).default("llm").notNull(), // llm, manual, template
  status: pgEnum("remedy_paths_remedy_status_enum", ["draft", "active", "completed", "abandoned"])("remedyStatus").default("draft").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  // ─── Canonical Spine (Implementation Package) ───
  signalId: varchar("signal_id_rp", { length: 64 }), // FK to detected_signals.signal_id
  routeDirection: varchar("route_direction", { length: 16 }), // UPWARD | LATERAL
  targetNodeId: integer("target_node_id"), // FK to world_nodes.id
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

export const remedySteps = pgTable("remedy_steps", {
  id: serial("id").primaryKey(),
  pathId: integer("pathId").notNull(),
  stepOrder: integer("stepOrder").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  actionType: varchar("actionType", { length: 64 }).notNull(), // file_document, gather_evidence, contact_agency, attend_hearing, submit_form, wait, review
  deadline: bigint("deadline", { mode: "number" }),
  estimatedDuration: varchar("estimatedDuration", { length: 64 }),
  status: pgEnum("remedy_steps_step_status_enum", ["pending", "in_progress", "completed", "skipped", "blocked"])("stepStatus").default("pending").notNull(),
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

export const remedyDocRequirements = pgTable("remedy_doc_requirements", {
  id: serial("id").primaryKey(),
  stepId: integer("stepId").notNull(),
  documentType: varchar("documentType", { length: 128 }).notNull(),
  description: text("description"),
  required: smallint("required").notNull().default(1),
  fulfilled: smallint("fulfilled").notNull().default(0),
  fulfilledByDocId: integer("fulfilledByDocId"), // links to documents table
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rdr_step").on(table.stepId),
]);

export type RemedyDocRequirement = typeof remedyDocRequirements.$inferSelect;
export type InsertRemedyDocRequirement = typeof remedyDocRequirements.$inferInsert;

export const paperworkTemplates = pgTable("paperwork_templates", {
  id: serial("id").primaryKey(),
  templateType: varchar("templateType", { length: 64 }).notNull(), // appeal_letter, complaint_filing, foia_request, record_request, grievance, cease_desist
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  templateBody: text("templateBody").notNull(), // Markdown template with {{placeholders}}
  requiredFields: jsonb("requiredFields").$type<string[]>(), // field names needed to fill template
  applicableClaimTypes: jsonb("applicableClaimTypes").$type<string[]>(),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_pt_type").on(table.templateType),
]);

export type PaperworkTemplate = typeof paperworkTemplates.$inferSelect;
export type InsertPaperworkTemplate = typeof paperworkTemplates.$inferInsert;

export const generatedDocuments = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  userId: integer("userId").notNull(),
  templateId: integer("templateId"),
  remedyStepId: integer("remedyStepId"), // links to remedy step if generated as part of a remedy path
  documentType: varchar("documentType", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content").notNull(), // Generated markdown content
  status: pgEnum("generated_documents_gen_doc_status_enum", ["draft", "review", "finalized", "sent", "archived"])("genDocStatus").default("draft").notNull(),
  recipientName: varchar("recipientName", { length: 256 }),
  recipientAddress: text("recipientAddress"),
  sentAt: bigint("sentAt", { mode: "number" }),
  fileUrl: text("fileUrl"), // S3 URL if exported
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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

export const patternRegistry = pgTable("pattern_registry", {
  id: serial("id").primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull().unique(),
  patternName: varchar("pattern_name", { length: 255 }).notNull(),
  patternDescription: text("pattern_description"),
  patternType: varchar("pattern_type", { length: 100 }),
  signalType: varchar("signal_type", { length: 100 }),
  triggerThreshold: integer("trigger_threshold"),
  confidenceThreshold: integer("confidence_threshold"),
  confidenceScore: integer("confidence_score").default(0),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 50 }),
  firstDetected: bigint("first_detected", { mode: "number" }),
  lastConfirmed: bigint("last_confirmed", { mode: "number" }),
  lastUpdated: bigint("last_updated", { mode: "number" }),
  signalCount: integer("signal_count").default(0),
  uniqueEntitiesCount: integer("unique_entities_count").default(0),
  geographicSpread: integer("geographic_spread").default(0),
  timeSpanDays: integer("time_span_days").default(0),
  decayStatus: varchar("decay_status", { length: 50 }).default("active"),
  decayReason: text("decay_reason"),
  relatedLaws: jsonb("related_laws").$type<string[]>(),
  relatedAgencies: jsonb("related_agencies").$type<string[]>(),
  harmDomains: jsonb("harm_domains").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }),
}, (t) => [
  index("idx_pr_type").on(t.patternType),
  index("idx_pr_status").on(t.decayStatus),
  index("idx_pr_confirmed").on(t.lastConfirmed),
]);

export const patternSignalLinks = pgTable("pattern_signal_links", {
  id: serial("id").primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  signalId: varchar("signal_id", { length: 100 }),
  signalType: varchar("signal_type", { length: 100 }),
  confidenceAtLink: integer("confidence_at_link"),
  contributingFactor: numeric("contributing_factor", { precision: 5, scale: 2 }),
  linkedAt: bigint("linked_at", { mode: "number" }),
  datasetId: varchar("dataset_id", { length: 50 }),
  sourceRecordIds: jsonb("source_record_ids").$type<string[]>(),
}, (t) => [
  index("idx_psl_pattern_drz").on(t.patternId),
  index("idx_psl_signal_drz").on(t.signalId),
  uniqueIndex("uq_pattern_signal_drz").on(t.patternId, t.signalId),
]);

export const patternMetadata = pgTable("pattern_metadata", {
  id: serial("id").primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  metadataType: varchar("metadata_type", { length: 100 }),
  metadataKey: varchar("metadata_key", { length: 255 }),
  metadataValue: text("metadata_value"),
  confidenceScore: integer("confidence_score"),
  source: varchar("source", { length: 255 }),
  verified: smallint("verified").default(0),
  createdAt: bigint("created_at", { mode: "number" }),
}, (t) => [
  index("idx_pm_pattern_drz").on(t.patternId),
]);

export const patternEvolution = pgTable("pattern_evolution", {
  id: serial("id").primaryKey(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }),
  signalCount: integer("signal_count"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  geographicSpread: integer("geographic_spread"),
  status: varchar("status", { length: 50 }),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }),
}, (t) => [
  index("idx_pe_pattern_drz").on(t.patternId),
]);

export const patternRelationships = pgTable("pattern_relationships", {
  id: serial("id").primaryKey(),
  sourcePatternId: char("source_pattern_id", { length: 36 }).notNull(),
  targetPatternId: char("target_pattern_id", { length: 36 }).notNull(),
  relationshipType: varchar("relationship_type", { length: 100 }),
  confidenceScore: integer("confidence_score"),
  discoveredAt: bigint("discovered_at", { mode: "number" }),
  lastObserved: bigint("last_observed", { mode: "number" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  index("idx_prel_source").on(t.sourcePatternId),
  index("idx_prel_target").on(t.targetPatternId),
]);

export const patternConfidenceFactors = pgTable("pattern_confidence_factors", {
  id: serial("id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }),
  factorName: varchar("factor_name", { length: 100 }),
  weight: integer("weight"),
  description: text("description"),
  calculationMethod: text("calculation_method"),
});

export const patternDecayRules = pgTable("pattern_decay_rules", {
  id: serial("id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }),
  dormantAfterDays: integer("dormant_after_days"),
  archiveAfterDays: integer("archive_after_days"),
  reactivationThreshold: integer("reactivation_threshold"),
  description: text("description"),
});

export const patternCreationThresholds = pgTable("pattern_creation_thresholds", {
  id: serial("id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  signalType: varchar("signal_type", { length: 100 }).notNull(),
  triggerThreshold: integer("trigger_threshold").notNull(),
  confidenceThreshold: integer("confidence_threshold").notNull(),
  timeWindowDays: integer("time_window_days").notNull(),
  description: text("description"),
});

export const trendRegistry = pgTable("trend_registry", {
  trendId: char("trend_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  trendClassification: varchar("trend_classification", { length: 50 }).default("emerging"),
  momentumDirection: varchar("momentum_direction", { length: 20 }).default("plateau"),
  pressureIndex: integer("pressure_index").default(0),
  currentSignalCount: integer("current_signal_count").default(0),
  currentConfidenceScore: numeric("current_confidence_score", { precision: 5, scale: 2 }).default("0"),
  currentGeographicSpread: integer("current_geographic_spread").default(0),
  currentTimeSpanDays: integer("current_time_span_days").default(0),
  growthRate7d: numeric("growth_rate_7d", { precision: 8, scale: 2 }).default("0"),
  growthRate30d: numeric("growth_rate_30d", { precision: 8, scale: 2 }).default("0"),
  growthRate90d: numeric("growth_rate_90d", { precision: 8, scale: 2 }).default("0"),
  accelerationRate: numeric("acceleration_rate", { precision: 8, scale: 2 }).default("0"),
  momentumScore: integer("momentum_score").default(0),
  geographicExpansionRate: numeric("geographic_expansion_rate", { precision: 8, scale: 2 }).default("0"),
  newRegionsCount: integer("new_regions_count").default(0),
  regionConcentrationIndex: numeric("region_concentration_index", { precision: 5, scale: 2 }).default("0"),
  signalDensity: numeric("signal_density", { precision: 8, scale: 2 }).default("0"),
  densityTrend: varchar("density_trend", { length: 20 }).default("stable"),
  forecast30dSignalCount: integer("forecast_30d_signal_count").default(0),
  forecastConfidence: numeric("forecast_confidence", { precision: 5, scale: 2 }).default("0"),
  projectedPeakDate: date("projected_peak_date"),
  pressureFactors: jsonb("pressure_factors"),
  lastCalculated: timestamp("last_calculated").defaultNow(),
  validUntil: timestamp("valid_until"),
  isCurrent: boolean("is_current").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trendSnapshots = pgTable("trend_snapshots", {
  snapshotId: char("snapshot_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  snapshotDate: date("snapshot_date"),
  signalCount: integer("signal_count").default(0),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).default("0"),
  geographicSpread: integer("geographic_spread").default(0),
  timeSpanDays: integer("time_span_days").default(0),
  growthRateSinceLast: numeric("growth_rate_since_last", { precision: 8, scale: 2 }).default("0"),
  momentumAtSnapshot: varchar("momentum_at_snapshot", { length: 20 }),
  pressureAtSnapshot: integer("pressure_at_snapshot").default(0),
  snapshotData: jsonb("snapshot_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendPressureMetrics = pgTable("trend_pressure_metrics", {
  metricId: char("metric_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  snapshotDate: date("snapshot_date"),
  volumePressure: integer("volume_pressure").default(0),
  velocityPressure: integer("velocity_pressure").default(0),
  geographicPressure: integer("geographic_pressure").default(0),
  severityPressure: integer("severity_pressure").default(0),
  entityPressure: integer("entity_pressure").default(0),
  temporalPressure: integer("temporal_pressure").default(0),
  pressureIndex: integer("pressure_index").default(0),
  criticalThresholdCrossed: boolean("critical_threshold_crossed").default(false),
  warningThresholdCrossed: boolean("warning_threshold_crossed").default(false),
  alertTriggered: boolean("alert_triggered").default(false),
  alertLevel: varchar("alert_level", { length: 50 }).default("info"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendForecasts = pgTable("trend_forecasts", {
  forecastId: char("forecast_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  forecastDate: date("forecast_date"),
  forecastHorizonDays: integer("forecast_horizon_days").default(30),
  predictedSignalCount: jsonb("predicted_signal_count"),
  predictedConfidence: jsonb("predicted_confidence"),
  predictedGeographicSpread: jsonb("predicted_geographic_spread"),
  lowerBound: jsonb("lower_bound"),
  upperBound: jsonb("upper_bound"),
  modelUsed: varchar("model_used", { length: 100 }).default("linear_regression"),
  rSquared: numeric("r_squared", { precision: 5, scale: 4 }).default("0"),
  forecastAccuracy: numeric("forecast_accuracy", { precision: 5, scale: 2 }).default("0"),
  predictedPeakDate: date("predicted_peak_date"),
  predictedInflectionPoints: jsonb("predicted_inflection_points"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendInterventionImpacts = pgTable("trend_intervention_impacts", {
  impactId: char("impact_id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patternId: char("pattern_id", { length: 36 }),
  interventionId: char("intervention_id", { length: 36 }),
  interventionDate: date("intervention_date"),
  preTrendClassification: varchar("pre_trend_classification", { length: 50 }),
  preGrowthRate: numeric("pre_growth_rate", { precision: 8, scale: 2 }),
  prePressureIndex: integer("pre_pressure_index"),
  postTrendClassification: varchar("post_trend_classification", { length: 50 }),
  postGrowthRate: numeric("post_growth_rate", { precision: 8, scale: 2 }),
  postPressureIndex: integer("post_pressure_index"),
  growthRateChange: numeric("growth_rate_change", { precision: 8, scale: 2 }),
  pressureReduction: integer("pressure_reduction"),
  daysToImpact: integer("days_to_impact"),
  impactDurationDays: integer("impact_duration_days"),
  sustainedImpact: boolean("sustained_impact").default(false),
  confidenceOfImpact: numeric("confidence_of_impact", { precision: 5, scale: 2 }),
  confoundingFactors: jsonb("confounding_factors"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendAlertRules = pgTable("trend_alert_rules", {
  ruleId: serial("rule_id").primaryKey(),
  ruleName: varchar("rule_name", { length: 255 }),
  conditionType: varchar("condition_type", { length: 100 }),
  thresholdValue: numeric("threshold_value", { precision: 10, scale: 2 }),
  thresholdDirection: varchar("threshold_direction", { length: 20 }),
  timeWindowDays: integer("time_window_days"),
  alertSeverity: varchar("alert_severity", { length: 50 }),
  notificationChannels: jsonb("notification_channels"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
});

export const systemicStrategyRegistry = pgTable("strategy_registry", {
  strategyId: char("strategy_id", { length: 36 }).primaryKey(),
  strategyName: varchar("strategy_name", { length: 255 }),
  strategyType: varchar("strategy_type", { length: 100 }),
  strategyDescription: text("strategy_description"),
  applicablePatternTypes: jsonb("applicable_pattern_types"),
  applicableHarmDomains: jsonb("applicable_harm_domains"),
  minimumPressureIndex: integer("minimum_pressure_index"),
  maximumPressureIndex: integer("maximum_pressure_index"),
  jurisdictionRequirements: jsonb("jurisdiction_requirements"),
  legalAuthority: jsonb("legal_authority"),
  primaryLaws: jsonb("primary_laws"),
  secondaryLaws: jsonb("secondary_laws"),
  leadAgency: varchar("lead_agency", { length: 255 }),
  supportingAgencies: jsonb("supporting_agencies"),
  agencyContactTemplates: jsonb("agency_contact_templates"),
  baseCostEstimate: numeric("base_cost_estimate", { precision: 12, scale: 2 }),
  costPerEntity: numeric("cost_per_entity", { precision: 10, scale: 2 }),
  costPerGeographicUnit: numeric("cost_per_geographic_unit", { precision: 10, scale: 2 }),
  baseDurationDays: integer("base_duration_days"),
  durationPerEntity: integer("duration_per_entity"),
  staffingRequirements: jsonb("staffing_requirements"),
  historicalSuccessRate: numeric("historical_success_rate", { precision: 5, scale: 2 }),
  avgImpactScore: integer("avg_impact_score"),
  confidenceInSuccess: numeric("confidence_in_success", { precision: 5, scale: 2 }),
  lastUpdatedFromOutcomes: date("last_updated_from_outcomes"),
  createdBy: varchar("created_by", { length: 255 }),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  supersededBy: char("superseded_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const strategySelectionRules = pgTable("strategy_selection_rules", {
  ruleId: serial("rule_id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }),
  trendClassification: varchar("trend_classification", { length: 50 }),
  minPressureIndex: integer("min_pressure_index"),
  recommendedStrategyId: char("recommended_strategy_id", { length: 36 }),
  recommendedStrategyName: varchar("recommended_strategy_name", { length: 255 }),
  priorityRank: integer("priority_rank"),
  ruleDescription: text("rule_description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sysStrategyPaths = pgTable("sys_strategy_paths", {
  pathId: char("path_id", { length: 36 }).primaryKey(),
  strategyId: char("strategy_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  pathName: varchar("path_name", { length: 255 }),
  pathDescription: text("path_description"),
  trendClassificationAtCreation: varchar("trend_classification_at_creation", { length: 50 }),
  pressureIndexAtCreation: integer("pressure_index_at_creation"),
  signalCountAtCreation: integer("signal_count_at_creation"),
  geographicScopeAtCreation: jsonb("geographic_scope_at_creation"),
  estimatedDurationDays: integer("estimated_duration_days"),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
  estimatedImpactScore: integer("estimated_impact_score"),
  successProbability: numeric("success_probability", { precision: 5, scale: 2 }),
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

export const sysStrategySteps = pgTable("strategy_steps", {
  stepId: char("step_id", { length: 36 }).primaryKey(),
  pathId: char("path_id", { length: 36 }).notNull(),
  stepNumber: integer("step_number").notNull(),
  stepName: varchar("step_name", { length: 255 }),
  stepDescription: text("step_description"),
  stepType: varchar("step_type", { length: 100 }),
  responsibleParty: varchar("responsible_party", { length: 255 }),
  dependencies: jsonb("dependencies"),
  estimatedDurationDays: integer("estimated_duration_days"),
  actualDurationDays: integer("actual_duration_days"),
  documentationRequired: jsonb("documentation_required"),
  evidenceRequired: jsonb("evidence_required"),
  legalAuthorityReference: text("legal_authority_reference"),
  stepStatus: varchar("step_status", { length: 50 }).default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  blockedReason: text("blocked_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const strategySuccessRates = pgTable("strategy_success_rates", {
  rateId: serial("rate_id").primaryKey(),
  strategyId: char("strategy_id", { length: 36 }),
  patternType: varchar("pattern_type", { length: 100 }),
  pressureRangeMin: integer("pressure_range_min"),
  pressureRangeMax: integer("pressure_range_max"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  totalAttempts: integer("total_attempts").default(0),
  successfulOutcomes: integer("successful_outcomes").default(0),
  partialOutcomes: integer("partial_outcomes").default(0),
  failedOutcomes: integer("failed_outcomes").default(0),
  avgDurationDays: integer("avg_duration_days"),
  avgCost: numeric("avg_cost", { precision: 12, scale: 2 }),
  avgImpactScore: integer("avg_impact_score"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const outcomeRegistry = pgTable("outcome_registry", {
  outcomeId: char("outcome_id", { length: 36 }).primaryKey(),
  pathId: char("path_id", { length: 36 }),
  strategyId: char("strategy_id", { length: 36 }),
  patternId: char("pattern_id", { length: 36 }),
  outcomeStatus: varchar("outcome_status", { length: 50 }),
  outcomeDescription: text("outcome_description"),
  interventionStartDate: timestamp("intervention_start_date"),
  interventionEndDate: timestamp("intervention_end_date"),
  signalsBefore: integer("signals_before"),
  signalsAfter: integer("signals_after"),
  signalReductionPct: numeric("signal_reduction_pct", { precision: 5, scale: 2 }),
  pressureBefore: integer("pressure_before"),
  pressureAfter: integer("pressure_after"),
  pressureReductionPct: numeric("pressure_reduction_pct", { precision: 5, scale: 2 }),
  trendBefore: varchar("trend_before", { length: 50 }),
  trendAfter: varchar("trend_after", { length: 50 }),
  entitiesAffected: integer("entities_affected"),
  geographicAreasAffected: integer("geographic_areas_affected"),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
  costPerSignalReduced: numeric("cost_per_signal_reduced", { precision: 10, scale: 2 }),
  overallEffectivenessScore: integer("overall_effectiveness_score"),
  lessonsLearned: text("lessons_learned"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const outcomeMetrics = pgTable("outcome_metrics", {
  metricId: serial("metric_id").primaryKey(),
  outcomeId: char("outcome_id", { length: 36 }),
  metricName: varchar("metric_name", { length: 255 }),
  metricCategory: varchar("metric_category", { length: 100 }),
  valueBefore: numeric("value_before", { precision: 12, scale: 4 }),
  valueAfter: numeric("value_after", { precision: 12, scale: 4 }),
  changePct: numeric("change_pct", { precision: 8, scale: 4 }),
  measurementDate: timestamp("measurement_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const strategyEffectiveness = pgTable("strategy_effectiveness", {
  effectivenessId: serial("effectiveness_id").primaryKey(),
  strategyId: char("strategy_id", { length: 36 }),
  patternType: varchar("pattern_type", { length: 100 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  totalDeployments: integer("total_deployments").default(0),
  successfulDeployments: integer("successful_deployments").default(0),
  avgSignalReductionPct: numeric("avg_signal_reduction_pct", { precision: 5, scale: 2 }),
  avgPressureReductionPct: numeric("avg_pressure_reduction_pct", { precision: 5, scale: 2 }),
  avgEffectivenessScore: integer("avg_effectiveness_score"),
  avgCost: numeric("avg_cost", { precision: 12, scale: 2 }),
  avgDurationDays: integer("avg_duration_days"),
  bestOutcomeId: char("best_outcome_id", { length: 36 }),
  worstOutcomeId: char("worst_outcome_id", { length: 36 }),
  lastCalculated: timestamp("last_calculated").defaultNow(),
});

export const interventionEndpoints = pgTable("intervention_endpoints", {
  endpointId: char("endpoint_id", { length: 36 }).primaryKey(),
  agencyName: varchar("agency_name", { length: 255 }).notNull(),
  agencyAbbreviation: varchar("agency_abbreviation", { length: 50 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 100 }).notNull(),
  interventionType: varchar("intervention_type", { length: 100 }).notNull(),
  contactMethod: varchar("contact_method", { length: 100 }),
  contactDetails: text("contact_details"),
  submissionFormat: varchar("submission_format", { length: 100 }),
  requiredDocuments: jsonb("required_documents"),
  escalationLevel: integer("escalation_level").default(1),
  websiteUrl: varchar("website_url", { length: 500 }),
  responseSla: integer("response_sla_days"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const patternInterventionRoutes = pgTable("pattern_intervention_routes", {
  routeId: serial("route_id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  harmDomain: varchar("harm_domain", { length: 100 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 100 }),
  recommendedEndpointIds: jsonb("recommended_endpoint_ids").notNull(),
  priorityOrder: integer("priority_order").default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interventionEscalationRules = pgTable("intervention_escalation_rules", {
  ruleId: serial("rule_id").primaryKey(),
  patternType: varchar("pattern_type", { length: 100 }).notNull(),
  harmDomain: varchar("harm_domain", { length: 100 }),
  signalThreshold: integer("signal_threshold").default(5),
  pressureThreshold: integer("pressure_threshold").default(50),
  confidenceThreshold: numeric("confidence_threshold", { precision: 5, scale: 2 }),
  recommendedEndpoint: char("recommended_endpoint", { length: 36 }),
  recommendedStrategy: char("recommended_strategy", { length: 36 }),
  escalationAction: varchar("escalation_action", { length: 100 }),
  autoEscalate: boolean("auto_escalate").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interventionSubmissions = pgTable("intervention_submissions", {
  submissionId: char("submission_id", { length: 36 }).primaryKey(),
  endpointId: char("endpoint_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }),
  strategyId: char("strategy_id", { length: 36 }),
  pathId: char("path_id", { length: 36 }),
  caseId: integer("case_id"),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionDescription: text("action_description"),
  evidenceBundle: jsonb("evidence_bundle"),
  documentsSent: jsonb("documents_sent"),
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

export const policyEvents = pgTable("policy_events", {
  policyId: char("policy_id", { length: 36 }).primaryKey(),
  policyName: varchar("policy_name", { length: 500 }).notNull(),
  policyType: varchar("policy_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  effectiveDate: date("effective_date"),
  enactedDate: date("enacted_date"),
  affectedDomains: jsonb("affected_domains"),
  relatedLaws: jsonb("related_laws"),
  description: text("description"),
  sourceUrl: varchar("source_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const policyPatternImpacts = pgTable("policy_pattern_impacts", {
  impactId: serial("impact_id").primaryKey(),
  policyId: char("policy_id", { length: 36 }).notNull(),
  patternId: char("pattern_id", { length: 36 }).notNull(),
  baselineSignalRate: numeric("baseline_signal_rate", { precision: 10, scale: 2 }),
  postPolicySignalRate: numeric("post_policy_signal_rate", { precision: 10, scale: 2 }),
  impactPercentage: numeric("impact_percentage", { precision: 8, scale: 2 }),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  measurementWindowDays: integer("measurement_window_days").default(90),
  measurementStart: date("measurement_start"),
  measurementEnd: date("measurement_end"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const templateJurisdictionMap = pgTable("template_jurisdiction_map", {
  mapId: varchar("map_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),
});

export const settlementCalculations = pgTable("settlement_calculations", {
  calcId: varchar("calc_id", { length: 36 }).primaryKey(),
  caseId: integer("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  formulaId: varchar("formula_id", { length: 36 }),
  inputVariables: jsonb("input_variables").$type<Record<string, number>>(),
  calculatedAmount: numeric("calculated_amount", { precision: 14, scale: 2 }),
  confidenceLevel: varchar("confidence_level", { length: 20 }),
  breakdownJson: jsonb("breakdown_json").$type<Record<string, any>>(),
  calculatedBy: integer("calculated_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const generatedRemedyDocs = pgTable("generated_remedy_docs", {
  docId: varchar("doc_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  caseId: integer("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  strategyPathId: varchar("strategy_path_id", { length: 36 }),
  filledContent: text("filled_content"),
  placeholderValues: jsonb("placeholder_values").$type<Record<string, string>>(),
  status: varchar("status", { length: 30 }).default("draft"),
  generatedBy: integer("generated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const docGenerationQueue = pgTable("doc_generation_queue", {
  queueId: varchar("queue_id", { length: 36 }).primaryKey(),
  caseId: integer("case_id"),
  patternId: varchar("pattern_id", { length: 36 }),
  templateId: varchar("template_id", { length: 36 }),
  strategyPathId: varchar("strategy_path_id", { length: 36 }),
  priority: integer("priority").default(5),
  status: varchar("status", { length: 30 }).default("pending"),
  requestedBy: integer("requested_by"),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const remedyOutcomeTracking = pgTable("remedy_outcome_tracking", {
  trackingId: varchar("tracking_id", { length: 36 }).primaryKey(),
  docId: varchar("doc_id", { length: 36 }).notNull(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  caseId: integer("case_id"),
  outcomeStatus: varchar("outcome_status", { length: 30 }).default("pending"),
  settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }),
  responseReceived: boolean("response_received").default(false),
  daysToResolution: integer("days_to_resolution"),
  effectivenessScore: numeric("effectiveness_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const formulaVersionHistory = pgTable("formula_version_history", {
  versionId: varchar("version_id", { length: 36 }).primaryKey(),
  formulaId: varchar("formula_id", { length: 36 }).notNull(),
  previousExpression: text("previous_expression"),
  newExpression: text("new_expression"),
  changeReason: text("change_reason"),
  changedBy: integer("changed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const templateEffectiveness = pgTable("template_effectiveness", {
  effectivenessId: varchar("effectiveness_id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  totalUsed: integer("total_used").default(0),
  successfulOutcomes: integer("successful_outcomes").default(0),
  avgSettlementAmount: numeric("avg_settlement_amount", { precision: 14, scale: 2 }),
  avgDaysToResolution: integer("avg_days_to_resolution"),
  effectivenessRating: numeric("effectiveness_rating", { precision: 5, scale: 2 }),
  lastCalculated: timestamp("last_calculated"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jurisdictionRules = pgTable("jurisdiction_rules", {
  ruleId: varchar("rule_id", { length: 36 }).primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 50 }).notNull(),
  claimType: varchar("claim_type", { length: 100 }).notNull(),
  statuteOfLimitations: integer("statute_of_limitations"),
  filingRequirements: jsonb("filing_requirements").$type<string[]>(),
  mandatoryNotice: boolean("mandatory_notice").default(false),
  noticePeriodDays: integer("notice_period_days"),
  adminExhaustionRequired: boolean("admin_exhaustion_required").default(false),
  adminAgency: varchar("admin_agency", { length: 256 }),
  maxDamages: numeric("max_damages", { precision: 14, scale: 2 }),
  trebleDamagesAvailable: boolean("treble_damages_available").default(false),
  attorneyFeesRecoverable: boolean("attorney_fees_recoverable").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calculationAuditLog = pgTable("calculation_audit_log", {
  logId: varchar("log_id", { length: 36 }).primaryKey(),
  calcId: varchar("calc_id", { length: 36 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  userId: integer("user_id"),
  previousValues: jsonb("previous_values").$type<Record<string, any>>(),
  newValues: jsonb("new_values").$type<Record<string, any>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const knowledgeFreshness = pgTable("knowledge_freshness", {
  id: serial("id").primaryKey(),
  tableName: varchar("table_name", { length: 128 }).notNull().unique(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  lastUpdate: bigint("last_update", { mode: "number" }),
  recordCount: integer("record_count").default(0).notNull(),
  freshnessScore: integer("freshness_score").default(100).notNull(), // 0-100
  staleFlag: boolean("stale_flag").default(false).notNull(),
  staleDays: integer("stale_days").default(180).notNull(), // configurable per table
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

export const knowledgeCoverageMetrics = pgTable("knowledge_coverage_metrics", {
  id: serial("id").primaryKey(),
  jurisdiction: varchar("jurisdiction_kcm", { length: 128 }).notNull(),
  claimType: varchar("claim_type_kcm", { length: 128 }).notNull(),
  statuteCount: integer("statute_count").default(0).notNull(),
  caseLawCount: integer("case_law_count").default(0).notNull(),
  agencyCount: integer("agency_count").default(0).notNull(),
  proceduralCount: integer("procedural_count").default(0).notNull(),
  evidenceProfilesCount: integer("evidence_profiles_count").default(0).notNull(),
  advocacyTargetsCount: integer("advocacy_targets_count").default(0).notNull(),
  remedyTemplatesCount: integer("remedy_templates_count").default(0).notNull(),
  deadlineRulesCount: integer("deadline_rules_count").default(0).notNull(),
  coverageScore: integer("coverage_score").default(0).notNull(), // 0-100 weighted
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

export const entityAliases = pgTable("entity_aliases", {
  id: serial("id").primaryKey(),
  canonicalName: varchar("canonical_name", { length: 512 }).notNull(),
  aliasName: varchar("alias_name", { length: 512 }).notNull(),
  entityType: pgEnum("entity_aliases_entity_type_ea_enum", [
    "corporation", "organization", "government_agency", "nonprofit",
    "landlord_entity", "contractor_business", "financial_institution",
    "telecom_company", "media_company", "individual_person", "unknown"
  ])("entity_type_ea").default("unknown").notNull(),
  confidence: numeric("confidence_ea", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  source: varchar("source_ea", { length: 64 }).default("heuristic").notNull(), // heuristic, manual, llm
  createdAt: bigint("created_at_ea", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_ea_alias_unique").on(table.aliasName),
  index("idx_ea_canonical").on(table.canonicalName),
  index("idx_ea_entity_type").on(table.entityType),
]);

export type EntityAlias = typeof entityAliases.$inferSelect;
export type InsertEntityAlias = typeof entityAliases.$inferInsert;

export const harmIndexEntities = pgTable("harm_index_entities", {
  id: serial("id").primaryKey(),
  entityName: varchar("entity_name", { length: 500 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).default("unknown"),
  industrySector: varchar("industry_sector", { length: 200 }),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  firstDetected: bigint("first_detected", { mode: "number" }),
  lastUpdated: bigint("last_updated", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmIndexScores = pgTable("harm_index_scores", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  complaintCount: integer("complaint_count").default(0),
  litigationCount: integer("litigation_count").default(0),
  enforcementCount: integer("enforcement_count").default(0),
  geographicSpread: numeric("geographic_spread", { precision: 5, scale: 2 }).default("0"),
  severityScore: numeric("severity_score", { precision: 5, scale: 2 }).default("0"),
  patternAcceleration: numeric("pattern_acceleration", { precision: 5, scale: 2 }).default("0"),
  systemicHarmScore: numeric("systemic_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskClassification: varchar("risk_classification", { length: 50 }).default("Low Risk"),
  calculatedAt: bigint("calculated_at", { mode: "number" }).notNull(),
});

export const harmIndexHistory = pgTable("harm_index_history", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  systemicHarmScore: numeric("systemic_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskClassification: varchar("risk_classification", { length: 50 }),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

export const litigationRegistry = pgTable("litigation_registry", {
  id: serial("id").primaryKey(),
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
  settlementAmount: numeric("settlement_amount", { precision: 15, scale: 2 }),
  sourceUrl: text("source_url"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const entityLitigationLinks = pgTable("entity_litigation_links", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  litigationId: integer("litigation_id").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0"),
  linkReason: text("link_reason"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const riskForecasts = pgTable("risk_forecasts", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id"),
  forecastDate: bigint("forecast_date", { mode: "number" }).notNull(),
  forecastHorizonDays: integer("forecast_horizon_days").default(30),
  predictedSignalGrowth: numeric("predicted_signal_growth", { precision: 5, scale: 2 }).default("0"),
  predictedPressureIndex: numeric("predicted_pressure_index", { precision: 5, scale: 2 }).default("0"),
  predictedGeographicSpread: numeric("predicted_geographic_spread", { precision: 5, scale: 2 }).default("0"),
  predictedEntityCount: integer("predicted_entity_count").default(0),
  riskForecastScore: numeric("risk_forecast_score", { precision: 5, scale: 2 }).default("0"),
  confidenceLevel: numeric("confidence_level", { precision: 5, scale: 4 }).default("0"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const riskForecastHistory = pgTable("risk_forecast_history", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id"),
  forecastDate: bigint("forecast_date", { mode: "number" }),
  predictedScore: numeric("predicted_score", { precision: 5, scale: 2 }).default("0"),
  actualScore: numeric("actual_score", { precision: 5, scale: 2 }),
  accuracyPercent: numeric("accuracy_percent", { precision: 5, scale: 2 }),
  evaluatedAt: bigint("evaluated_at", { mode: "number" }),
});

export const entityRiskProjection = pgTable("entity_risk_projection", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id"),
  entityName: varchar("entity_name", { length: 500 }),
  industrySector: varchar("industry_sector", { length: 200 }),
  currentHarmScore: numeric("current_harm_score", { precision: 5, scale: 2 }).default("0"),
  predictedHarmScore: numeric("predicted_harm_score", { precision: 5, scale: 2 }).default("0"),
  riskCategory: varchar("risk_category", { length: 50 }).default("Stable"),
  projectionHorizonDays: integer("projection_horizon_days").default(30),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmMapNodes = pgTable("harm_map_nodes", {
  id: serial("id").primaryKey(),
  nodeType: varchar("node_type", { length: 50 }).notNull(),
  nodeLabel: varchar("node_label", { length: 500 }).notNull(),
  entityId: integer("entity_id"),
  patternId: integer("pattern_id"),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  industrySector: varchar("industry_sector", { length: 200 }),
  harmScore: numeric("harm_score", { precision: 5, scale: 2 }).default("0"),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("active"),
  metadata: jsonb("metadata"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmMapEdges = pgTable("harm_map_edges", {
  id: serial("id").primaryKey(),
  sourceNodeId: integer("source_node_id").notNull(),
  targetNodeId: integer("target_node_id").notNull(),
  relationshipType: varchar("relationship_type", { length: 100 }).notNull(),
  strengthScore: numeric("strength_score", { precision: 5, scale: 2 }).default("0"),
  evidenceCount: integer("evidence_count").default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const harmMapSnapshots = pgTable("harm_map_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }).notNull(),
  nodeCount: integer("node_count").default(0),
  edgeCount: integer("edge_count").default(0),
  topRiskSectors: jsonb("top_risk_sectors"),
  topHarmEntities: jsonb("top_harm_entities"),
  summary: text("summary"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const problemIntakeSessions = pgTable("problem_intake_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  rawStory: text("raw_story").notNull(),
  jurisdictionGuess: varchar("jurisdiction_guess", { length: 200 }),
  claimCandidates: jsonb("claim_candidates"),
  selectedClaim: varchar("selected_claim", { length: 200 }),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0"),
  status: varchar("status", { length: 50 }).default("started"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const interpreterClaimMatches = pgTable("interpreter_claim_matches", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0"),
  reasoningSummary: text("reasoning_summary"),
  supportingKeywords: jsonb("supporting_keywords"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const interpreterQuestionFlow = pgTable("interpreter_question_flow", {
  id: serial("id").primaryKey(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type", { length: 50 }).default("text"),
  answerOptions: jsonb("answer_options"),
  weight: numeric("weight", { precision: 3, scale: 2 }).default("1.00"),
  nextQuestionMap: jsonb("next_question_map"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const interpreterEvidenceGuidance = pgTable("interpreter_evidence_guidance", {
  id: serial("id").primaryKey(),
  claimType: varchar("claim_type", { length: 200 }).notNull(),
  evidenceType: varchar("evidence_type", { length: 200 }).notNull(),
  priority: integer("priority").default(1),
  guidanceText: text("guidance_text"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const shareableCaseLinks = pgTable("shareable_case_links", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  generatedBy: integer("generated_by"),
  accessLevel: varchar("access_level", { length: 50 }).default("summary"),
  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
  viewCount: integer("view_count").default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastViewedAt: bigint("last_viewed_at", { mode: "number" }),
});

export const shareableCaseViews = pgTable("shareable_case_views", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull(),
  viewerIp: varchar("viewer_ip", { length: 100 }),
  viewerUserAgent: text("viewer_user_agent"),
  viewerType: varchar("viewer_type", { length: 50 }).default("unknown"),
  viewedAt: bigint("viewed_at", { mode: "number" }).notNull(),
});

export const caseSharePermissions = pgTable("case_share_permissions", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  allowEvidence: boolean("allow_evidence").default(false),
  allowNames: boolean("allow_names").default(true),
  allowFinancials: boolean("allow_financials").default(false),
  allowDocuments: boolean("allow_documents").default(false),
  allowPatternLinks: boolean("allow_pattern_links").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const attorneyRegistry = pgTable("attorney_registry", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  firmName: varchar("firm_name", { length: 500 }),
  barNumber: varchar("bar_number", { length: 100 }),
  jurisdiction: varchar("jurisdiction", { length: 200 }),
  practiceAreas: jsonb("practice_areas"),
  yearsExperience: integer("years_experience").default(0),
  acceptsContingency: boolean("accepts_contingency").default(false),
  acceptsProBono: boolean("accepts_pro_bono").default(false),
  acceptsNewClients: boolean("accepts_new_clients").default(true),
  contactEmail: varchar("contact_email", { length: 300 }),
  website: varchar("website", { length: 500 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const attorneyCaseMatch = pgTable("attorney_case_match", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  attorneyId: integer("attorney_id").notNull(),
  matchScore: numeric("match_score", { precision: 5, scale: 2 }).default("0"),
  practiceMatchScore: numeric("practice_match_score", { precision: 5, scale: 2 }).default("0"),
  jurisdictionMatchScore: numeric("jurisdiction_match_score", { precision: 5, scale: 2 }).default("0"),
  damagesMatchScore: numeric("damages_match_score", { precision: 5, scale: 2 }).default("0"),
  patternMatchScore: numeric("pattern_match_score", { precision: 5, scale: 2 }).default("0"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const attorneyOutcomes = pgTable("attorney_outcomes", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  attorneyId: integer("attorney_id").notNull(),
  contactMade: boolean("contact_made").default(false),
  representationAccepted: boolean("representation_accepted").default(false),
  representationDeclined: boolean("representation_declined").default(false),
  caseResult: varchar("case_result", { length: 200 }),
  settlementAmount: numeric("settlement_amount", { precision: 15, scale: 2 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const caseSignals = pgTable("case_signals", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  userId: integer("user_id").notNull(),
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  entityName: varchar("entity_name", { length: 512 }),
  entityType: varchar("entity_type", { length: 64 }),
  claimType: varchar("claim_type", { length: 128 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }),
  domain: varchar("domain", { length: 128 }),
  severity: varchar("severity", { length: 20 }).default("medium").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  evidenceStrength: numeric("evidence_strength", { precision: 5, scale: 4 }).default("0.0000"),
  entityRepetition: integer("entity_repetition").default(0),
  geographicSpread: integer("geographic_spread").default(0),
  timeClustering: numeric("time_clustering", { precision: 5, scale: 4 }).default("0.0000"),
  damagesTotal: numeric("damages_total", { precision: 15, scale: 2 }).default("0.00"),
  sourceClaimIds: jsonb("source_claim_ids").$type<number[]>(),
  sourceEntityIds: jsonb("source_entity_ids").$type<number[]>(),
  sourceFindingIds: jsonb("source_finding_ids").$type<number[]>(),
  sourceSignalFlagIds: jsonb("source_signal_flag_ids").$type<number[]>(),
  patternCandidateId: integer("pattern_candidate_id"),
  detectedSignalId: integer("detected_signal_id"),
  active: smallint("active").default(1).notNull(),
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

export const patternCandidates = pgTable("pattern_candidates", {
  id: serial("id").primaryKey(),
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
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0.5000").notNull(),
  signalCount: integer("signal_count").default(0).notNull(),
  caseCount: integer("case_count").default(0).notNull(),
  uniqueUsers: integer("unique_users").default(0).notNull(),
  evidenceStrength: numeric("evidence_strength", { precision: 5, scale: 4 }).default("0.0000"),
  geographicSpread: integer("geographic_spread").default(0),
  timeSpanDays: integer("time_span_days").default(0),
  firstSignalAt: bigint("first_signal_at", { mode: "number" }),
  lastSignalAt: bigint("last_signal_at", { mode: "number" }),
  promotedPatternId: char("promoted_pattern_id", { length: 36 }),
  promotionThreshold: integer("promotion_threshold").default(3).notNull(),
  confirmationThreshold: integer("confirmation_threshold").default(5).notNull(),
  timeWindowDays: integer("time_window_days").default(90).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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

export const casePatternLinks = pgTable("case_pattern_links", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  patternCandidateId: integer("pattern_candidate_id"),
  patternRegistryId: char("pattern_registry_id", { length: 36 }),
  caseSignalId: integer("case_signal_id"),
  contributionType: varchar("contribution_type", { length: 64 }).default("supporting").notNull(),
  linkedAt: bigint("linked_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_cpl_case").on(table.caseId),
  index("idx_cpl_candidate").on(table.patternCandidateId),
  index("idx_cpl_pattern").on(table.patternRegistryId),
]);

export type CasePatternLink = typeof casePatternLinks.$inferSelect;
export type InsertCasePatternLink = typeof casePatternLinks.$inferInsert;

export const lobbyingActivity = pgTable("lobbying_activity", {
  id: serial("id").primaryKey(),
  lobbyistName: varchar("lobbyist_name", { length: 500 }),
  lobbyingFirm: varchar("lobbying_firm", { length: 500 }),
  clientName: varchar("client_name", { length: 500 }).notNull(),
  industry: varchar("industry", { length: 255 }),
  policyArea: varchar("policy_area", { length: 500 }),
  lobbyingAmount: numeric("lobbying_amount", { precision: 15, scale: 2 }),
  reportingPeriod: varchar("reporting_period", { length: 50 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  legislatorsContacted: text("legislators_contacted"),
  sourceUrl: text("source_url"),
  streamSource: varchar("stream_source", { length: 100 }).default("lobbying_disclosure"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LobbyingActivity = typeof lobbyingActivity.$inferSelect;

export const federalLitigationCases = pgTable("federal_litigation_cases", {
  id: serial("id").primaryKey(),
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

export const administrativeDecisions = pgTable("administrative_decisions", {
  id: serial("id").primaryKey(),
  decisionId: varchar("decision_id", { length: 255 }),
  agency: varchar("agency", { length: 500 }).notNull(),
  program: varchar("program", { length: 255 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  claimType: varchar("claim_type", { length: 255 }),
  decisionDate: date("decision_date"),
  initialOutcome: varchar("initial_outcome", { length: 100 }),
  appealOutcome: varchar("appeal_outcome", { length: 100 }),
  processingTimeDays: integer("processing_time_days"),
  hearingRequested: boolean("hearing_requested").default(false),
  reversal: boolean("reversal").default(false),
  entityOrAgency: varchar("entity_or_agency", { length: 500 }),
  sourceUrl: text("source_url"),
  streamSource: varchar("stream_source", { length: 100 }).default("administrative_decision"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdministrativeDecision = typeof administrativeDecisions.$inferSelect;

export const verifiedReports = pgTable("verified_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 255 }).unique(),
  reporterType: varchar("reporter_type", { length: 100 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  industry: varchar("industry", { length: 255 }),
  entityNamed: varchar("entity_named", { length: 500 }),
  claimType: varchar("claim_type", { length: 255 }),
  evidenceCount: integer("evidence_count").default(0),
  verificationStatus: varchar("verification_status", { length: 50 }).default("unverified"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).default("0"),
  narrative: text("narrative"),
  submittedBy: integer("submitted_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type VerifiedReport = typeof verifiedReports.$inferSelect;

export const advocacyReports = pgTable("advocacy_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 255 }).unique(),
  organizationName: varchar("organization_name", { length: 500 }).notNull(),
  organizationType: varchar("organization_type", { length: 100 }),
  reportTitle: varchar("report_title", { length: 500 }).notNull(),
  reportType: pgEnum("advocacy_reports_report_type_ar_enum", [
    "policy_brief", "investigative_report", "public_comment",
    "testimony", "amicus_brief", "community_survey",
    "impact_assessment", "regulatory_petition", "enforcement_complaint",
    "annual_report", "press_release", "coalition_letter", "other"
  ])("report_type_ar").default("other"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  policyArea: varchar("policy_area", { length: 255 }),
  industry: varchar("industry", { length: 255 }),
  entityNamed: varchar("entity_named", { length: 500 }),
  claimType: varchar("claim_type", { length: 255 }),
  harmType: varchar("harm_type", { length: 255 }),
  affectedPopulation: varchar("affected_population", { length: 500 }),
  estimatedAffectedCount: integer("estimated_affected_count"),
  keyFindings: text("key_findings"),
  recommendedActions: text("recommended_actions"),
  sourceUrl: text("source_url"),
  publishDate: date("publish_date"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).default("0"),
  verificationStatus: varchar("verification_status", { length: 50 }).default("unverified"),
  linkedSignalIds: jsonb("linked_signal_ids").$type<number[]>(),
  linkedPatternIds: jsonb("linked_pattern_ids").$type<number[]>(),
  tags: jsonb("tags").$type<string[]>(),
  submittedBy: integer("submitted_by"),
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

export const dataSnapshots = pgTable("data_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: bigint("snapshot_date", { mode: "number" }).notNull(),
  sourceTable: varchar("source_table", { length: 128 }).notNull(),
  recordCount: integer("record_count").notNull().default(0),
  snapshotMetadata: jsonb("snapshot_metadata").$type<{
    datasetIds?: string[];
    jurisdictions?: string[];
    dateRange?: { from: number; to: number };
    signalCount?: number;
    patternCount?: number;
    description?: string;
  }>(),
  status: pgEnum("data_snapshots_snapshot_status_enum", ["pending", "complete", "failed"])("snapshot_status").default("complete").notNull(),
  createdAt: bigint("created_at_ds", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdBy: integer("created_by_ds"),
}, (t) => [
  index("idx_ds_date").on(t.snapshotDate),
  index("idx_ds_source").on(t.sourceTable),
  index("idx_ds_status").on(t.status),
]);

export type DataSnapshot = typeof dataSnapshots.$inferSelect;
export type InsertDataSnapshot = typeof dataSnapshots.$inferInsert;

export const timeTravelRuns = pgTable("time_travel_runs", {
  id: serial("id").primaryKey(),
  runId: char("run_id", { length: 36 }).notNull().unique().$defaultFn(() => crypto.randomUUID()),
  snapshotId: integer("snapshot_id"),
  algorithmVersion: varchar("algorithm_version", { length: 128 }).notNull().default("current"),
  runType: pgEnum("time_travel_runs_run_type_enum", [
    "historical_replay", "counterfactual_replay",
    "algorithm_comparison", "early_warning_test"
  ])("run_type").notNull(),
  startDate: bigint("start_date_ttr", { mode: "number" }),
  endDate: bigint("end_date_ttr", { mode: "number" }),
  status: pgEnum("time_travel_runs_run_status_enum", ["pending", "running", "completed", "failed", "cancelled"])("run_status").default("pending").notNull(),
  patternsDetected: integer("patterns_detected").default(0),
  signalsDetected: integer("signals_detected").default(0),
  notes: text("notes_ttr"),
  // For algorithm comparison: the second algorithm version
  comparisonAlgorithmVersion: varchar("comparison_algorithm_version", { length: 128 }),
  // Summary results
  summary: jsonb("summary").$type<{
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
  createdBy: integer("created_by_ttr"),
}, (t) => [
  index("idx_ttr_run_id").on(t.runId),
  index("idx_ttr_snapshot").on(t.snapshotId),
  index("idx_ttr_type").on(t.runType),
  index("idx_ttr_status").on(t.status),
  index("idx_ttr_created").on(t.createdAt),
]);

export type TimeTravelRun = typeof timeTravelRuns.$inferSelect;
export type InsertTimeTravelRun = typeof timeTravelRuns.$inferInsert;

export const historicalSignals = pgTable("historical_signals", {
  id: serial("id").primaryKey(),
  runId: integer("run_id_hs").notNull(),
  sourceRecordId: varchar("source_record_id", { length: 128 }),
  signalType: varchar("signal_type_hs", { length: 256 }).notNull(),
  entityName: varchar("entity_name_hs", { length: 512 }),
  entityType: varchar("entity_type_hs", { length: 128 }),
  datasetId: varchar("dataset_id_hs", { length: 64 }),
  jurisdiction: varchar("jurisdiction_hs", { length: 128 }),
  domain: varchar("domain_hs", { length: 128 }),
  severity: pgEnum("historical_signals_severity_hs_enum", ["critical", "high", "medium", "low"])("severity_hs").default("medium").notNull(),
  title: varchar("title_hs", { length: 512 }).notNull(),
  explanation: text("explanation_hs"),
  confidenceScore: numeric("confidence_score_hs", { precision: 5, scale: 4 }).notNull(),
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

export const historicalPatterns = pgTable("historical_patterns", {
  id: serial("id").primaryKey(),
  runId: integer("run_id_hp").notNull(),
  patternType: varchar("pattern_type_hp", { length: 128 }).notNull(),
  patternName: varchar("pattern_name_hp", { length: 255 }),
  entityName: varchar("entity_name_hp", { length: 512 }),
  jurisdiction: varchar("jurisdiction_hp", { length: 128 }),
  patternConfidence: numeric("pattern_confidence_hp", { precision: 5, scale: 4 }).notNull(),
  signalCount: integer("signal_count_hp").default(0),
  firstDetectedAt: bigint("first_detected_at_hp", { mode: "number" }),
  lastConfirmedAt: bigint("last_confirmed_at_hp", { mode: "number" }),
  algorithmVersion: varchar("algorithm_version_hp", { length: 128 }),
  contributingSignals: jsonb("contributing_signals_hp").$type<number[]>(),
  metadata: jsonb("metadata_hp").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at_hp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_hp_run").on(t.runId),
  index("idx_hp_type").on(t.patternType),
  index("idx_hp_entity").on(t.entityName),
  index("idx_hp_first_detected").on(t.firstDetectedAt),
]);

export type HistoricalPattern = typeof historicalPatterns.$inferSelect;

export const historicalTrends = pgTable("historical_trends", {
  id: serial("id").primaryKey(),
  runId: integer("run_id_ht").notNull(),
  patternId: integer("pattern_id_ht"),
  momentumScore: integer("momentum_score_ht").default(0),
  pressureIndex: integer("pressure_index_ht").default(0),
  trendClassification: varchar("trend_classification_ht", { length: 64 }),
  volumePressure: integer("volume_pressure_ht").default(0),
  velocityPressure: integer("velocity_pressure_ht").default(0),
  geographicPressure: integer("geographic_pressure_ht").default(0),
  severityPressure: integer("severity_pressure_ht").default(0),
  algorithmVersion: varchar("algorithm_version_ht", { length: 128 }),
  createdAt: bigint("created_at_ht", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ht_run").on(t.runId),
  index("idx_ht_pattern").on(t.patternId),
  index("idx_ht_classification").on(t.trendClassification),
]);

export type HistoricalTrend = typeof historicalTrends.$inferSelect;

export const counterfactualParameters = pgTable("counterfactual_parameters", {
  id: serial("id").primaryKey(),
  runId: integer("run_id_cf").notNull(),
  parameterName: varchar("parameter_name", { length: 255 }).notNull(),
  parameterValue: text("parameter_value").notNull(),
  parameterType: pgEnum("counterfactual_parameters_parameter_type_enum", [
    "weight_override", "filter_toggle", "threshold_change",
    "stream_inclusion", "date_shift", "entity_filter"
  ])("parameter_type").default("weight_override").notNull(),
  description: text("description_cf"),
  createdAt: bigint("created_at_cf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cf_run").on(t.runId),
  index("idx_cf_name").on(t.parameterName),
]);

export type CounterfactualParameter = typeof counterfactualParameters.$inferSelect;

export const entityRegistry = pgTable("entity_registry", {
  id: serial("id").primaryKey(),
  entityName: varchar("entity_name", { length: 512 }).notNull(),
  canonicalName: varchar("canonical_name", { length: 512 }).notNull(),
  entityType: pgEnum("entity_registry_entity_type_enum", [
    "person", "attorney", "law_firm", "corporation", "business",
    "government_agency", "nonprofit", "individual_litigant", "organization", "unknown"
  ])("entity_type").default("unknown").notNull(),
  industry: varchar("industry", { length: 256 }),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  aliases: jsonb("aliases").$type<string[]>(),
  corporateParent: varchar("corporate_parent", { length: 512 }),
  confidenceScore: integer("confidence_score").default(0).notNull(),
  complaintCount: integer("complaint_count").default(0).notNull(),
  litigationCount: integer("litigation_count").default(0).notNull(),
  enforcementCount: integer("enforcement_count").default(0).notNull(),
  patternCount: integer("pattern_count").default(0).notNull(),
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

export const entityRelationships = pgTable("entity_relationships", {
  id: serial("id").primaryKey(),
  entityIdA: integer("entity_id_a").notNull(),
  entityIdB: integer("entity_id_b").notNull(),
  relationshipType: pgEnum("entity_relationships_relationship_type_enum", [
    "subsidiary", "parent_company", "legal_representation",
    "regulatory_target", "corporate_affiliation", "ownership",
    "co_defendant", "opposing_party"
  ])("relationship_type").notNull(),
  confidenceScore: integer("confidence_score").default(50).notNull(),
  evidenceSource: varchar("evidence_source", { length: 256 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_er_entity_a").on(t.entityIdA),
  index("idx_er_entity_b").on(t.entityIdB),
  index("idx_er_type").on(t.relationshipType),
]);

export type EntityRelationshipRow = typeof entityRelationships.$inferSelect;

export const institutionRegistry = pgTable("institution_registry", {
  id: serial("id").primaryKey(),
  institutionName: varchar("institution_name", { length: 512 }).notNull(),
  institutionType: pgEnum("institution_registry_institution_type_enum", [
    "regulator", "enforcement_agency", "oversight_body",
    "legislative_committee", "inspector_general",
    "licensing_board", "administrative_court"
  ])("institution_type").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  industryScope: varchar("industry_scope", { length: 256 }),
  oversightAuthority: text("oversight_authority"),
  enforcementPowerLevel: pgEnum("institution_registry_enforcement_power_level_enum", [
    "full", "limited", "advisory", "none"
  ])("enforcement_power_level").default("limited").notNull(),
  parentInstitution: varchar("parent_institution", { length: 512 }),
  sourceUrl: text("source_url"),
  accountabilityScore: integer("accountability_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_inst_name").on(t.institutionName),
  index("idx_inst_type").on(t.institutionType),
  index("idx_inst_jurisdiction").on(t.jurisdiction),
  index("idx_inst_industry").on(t.industryScope),
]);

export type InstitutionRegistryRow = typeof institutionRegistry.$inferSelect;

export const patternInstitutionLinks = pgTable("pattern_institution_links", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id").notNull(),
  institutionId: integer("institution_id").notNull(),
  responsibilityType: pgEnum("pattern_institution_links_responsibility_type_enum", [
    "primary_regulator", "secondary_regulator",
    "enforcement_authority", "oversight_authority", "legislative_oversight"
  ])("responsibility_type").notNull(),
  responseStatus: pgEnum("pattern_institution_links_response_status_enum", [
    "unknown", "monitoring", "investigating", "enforcing", "policy_action", "inactive"
  ])("response_status").default("unknown").notNull(),
  responseDate: bigint("response_date", { mode: "number" }),
  confidenceScore: integer("confidence_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pil_pattern").on(t.patternId),
  index("idx_pil_institution").on(t.institutionId),
]);

export type PatternInstitutionLinkRow = typeof patternInstitutionLinks.$inferSelect;

export const institutionActivity = pgTable("institution_activity", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull(),
  activityType: pgEnum("institution_activity_activity_type_enum", [
    "investigation_opened", "enforcement_action", "hearing_announced",
    "regulation_proposed", "policy_change", "public_statement"
  ])("activity_type").notNull(),
  patternId: integer("pattern_id"),
  entityName: varchar("entity_name", { length: 512 }),
  actionDescription: text("action_description"),
  actionDate: bigint("action_date", { mode: "number" }),
  sourceStream: varchar("source_stream", { length: 128 }),
  confidenceScore: integer("confidence_score").default(50).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ia_institution").on(t.institutionId),
  index("idx_ia_pattern").on(t.patternId),
  index("idx_ia_type").on(t.activityType),
]);

export type InstitutionActivityRow = typeof institutionActivity.$inferSelect;

export const regulatoryCapturePatterns = pgTable("regulatory_capture_patterns", {
  id: serial("id").primaryKey(),
  industry: varchar("industry", { length: 256 }).notNull(),
  regulatedEntity: varchar("regulated_entity", { length: 512 }),
  regulatoryAgency: varchar("regulatory_agency", { length: 512 }),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  captureRiskScore: integer("capture_risk_score").default(0).notNull(),
  complaintVolume: integer("complaint_volume").default(0).notNull(),
  enforcementActions: integer("enforcement_actions").default(0).notNull(),
  lobbyingSpend: integer("lobbying_spend").default(0).notNull(),
  campaignContributions: integer("campaign_contributions").default(0).notNull(),
  policyChanges: integer("policy_changes").default(0).notNull(),
  patternStatus: pgEnum("regulatory_capture_patterns_pattern_status_enum", [
    "candidate", "monitoring", "high_risk", "confirmed_pattern", "resolved"
  ])("pattern_status").default("candidate").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcp_industry").on(t.industry),
  index("idx_rcp_agency").on(t.regulatoryAgency),
  index("idx_rcp_status").on(t.patternStatus),
  index("idx_rcp_risk").on(t.captureRiskScore),
]);

export type RegulatoryCapturePatternRow = typeof regulatoryCapturePatterns.$inferSelect;

export const regulatoryCaptureSignals = pgTable("regulatory_capture_signals", {
  id: serial("id").primaryKey(),
  capturePatternId: integer("capture_pattern_id").notNull(),
  signalType: pgEnum("regulatory_capture_signals_signal_type_rcs_enum", [
    "complaint_spike", "enforcement_silence", "lobbying_pressure",
    "campaign_finance_spike", "policy_change", "litigation_cluster", "whistleblower_report"
  ])("signal_type_rcs").notNull(),
  entity: varchar("entity_rcs", { length: 512 }),
  agency: varchar("agency_rcs", { length: 512 }),
  industry: varchar("industry_rcs", { length: 256 }),
  sourceStream: varchar("source_stream_rcs", { length: 128 }),
  confidenceScore: integer("confidence_score_rcs").default(50).notNull(),
  evidenceReference: text("evidence_reference_rcs"),
  createdAt: bigint("created_at_rcs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcsi_pattern").on(t.capturePatternId),
  index("idx_rcsi_type").on(t.signalType),
]);

export type RegulatoryCaptureSignalRow = typeof regulatoryCaptureSignals.$inferSelect;

export const regulatoryCaptureMetrics = pgTable("regulatory_capture_metrics", {
  id: serial("id").primaryKey(),
  capturePatternId: integer("capture_pattern_id_rcm").notNull(),
  complaintEnforcementRatio: numeric("complaint_enforcement_ratio", { precision: 10, scale: 2 }),
  lobbyingToEnforcementRatio: numeric("lobbying_to_enforcement_ratio", { precision: 10, scale: 2 }),
  campaignToPolicyRatio: numeric("campaign_to_policy_ratio", { precision: 10, scale: 2 }),
  regulatoryDelayDays: integer("regulatory_delay_days"),
  industryPenetrationScore: integer("industry_penetration_score"),
  computedRiskScore: integer("computed_risk_score").default(0).notNull(),
  calculatedAt: bigint("calculated_at_rcm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_rcm_pattern").on(t.capturePatternId),
]);

export type RegulatoryCaptureMetricRow = typeof regulatoryCaptureMetrics.$inferSelect;

export const crisisPredictions = pgTable("crisis_predictions", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id_cp"),
  industry: varchar("industry_cp", { length: 256 }),
  jurisdiction: varchar("jurisdiction_cp", { length: 256 }),
  entityName: varchar("entity_name_cp", { length: 512 }),
  predictionType: pgEnum("crisis_predictions_prediction_type_enum", [
    "industry_crisis", "institutional_failure",
    "enforcement_collapse", "policy_shockwave"
  ])("prediction_type").notNull(),
  crisisProbability: integer("crisis_probability").default(0).notNull(),
  estimatedEscalationDate: bigint("estimated_escalation_date", { mode: "number" }),
  predictionConfidence: integer("prediction_confidence").default(0).notNull(),
  riskLevel: pgEnum("crisis_predictions_risk_level_cp_enum", [
    "low", "moderate", "high", "critical"
  ])("risk_level_cp").default("low").notNull(),
  triggerFactors: jsonb("trigger_factors").$type<string[]>(),
  createdAt: bigint("created_at_cp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cp_pattern").on(t.patternId),
  index("idx_cp_type").on(t.predictionType),
  index("idx_cp_risk").on(t.riskLevel),
  index("idx_cp_probability").on(t.crisisProbability),
]);

export type CrisisPredictionRow = typeof crisisPredictions.$inferSelect;

export const regulatoryEnforcementActions = pgTable("regulatory_enforcement_actions", {
  id: serial("id").primaryKey(),
  agencyName: varchar("agency_name_rea", { length: 256 }).notNull(),
  entityName: varchar("entity_name_rea", { length: 512 }).notNull(),
  industry: varchar("industry_rea", { length: 256 }),
  jurisdiction: varchar("jurisdiction_rea", { length: 256 }),
  violationType: varchar("violation_type", { length: 256 }),
  penaltyAmount: integer("penalty_amount"),
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

export const litigationCases = pgTable("litigation_cases", {
  id: serial("id").primaryKey(),
  courtName: varchar("court_name", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_lc", { length: 256 }),
  filingDate: bigint("filing_date", { mode: "number" }),
  caseType: varchar("case_type", { length: 128 }),
  claimType: varchar("claim_type_lc", { length: 256 }),
  plaintiffName: varchar("plaintiff_name", { length: 512 }),
  defendantName: varchar("defendant_name", { length: 512 }),
  lawFirm: varchar("law_firm", { length: 512 }),
  judge: varchar("judge_name", { length: 256 }),
  caseStatus: pgEnum("litigation_cases_case_status_enum", [
    "filed", "pending", "discovery", "trial", "settled", "dismissed", "appealed"
  ])("case_status").default("filed").notNull(),
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

export const investigativeReports = pgTable("investigative_reports", {
  id: serial("id").primaryKey(),
  publicationName: varchar("publication_name", { length: 256 }).notNull(),
  reportTitle: varchar("report_title_ir", { length: 512 }).notNull(),
  issueArea: varchar("issue_area_ir", { length: 256 }),
  entitiesNamed: jsonb("entities_named_ir").$type<string[]>(),
  jurisdiction: varchar("jurisdiction_ir", { length: 256 }),
  summary: text("summary_ir"),
  sourceUrl: text("source_url_ir"),
  publicationDate: bigint("publication_date_ir", { mode: "number" }),
  credibilityScore: integer("credibility_score_ir").default(70).notNull(),
  createdAt: bigint("created_at_ir", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ir_publication").on(t.publicationName),
  index("idx_ir_issue").on(t.issueArea),
]);

export type InvestigativeReportRow = typeof investigativeReports.$inferSelect;

export const oversightReports = pgTable("oversight_reports", {
  id: serial("id").primaryKey(),
  oversightBody: varchar("oversight_body", { length: 256 }).notNull(),
  reportTitle: varchar("report_title_or", { length: 512 }).notNull(),
  issueArea: varchar("issue_area_or", { length: 256 }),
  agencyReviewed: varchar("agency_reviewed", { length: 256 }),
  jurisdiction: varchar("jurisdiction_or", { length: 256 }),
  findingsSummary: text("findings_summary"),
  sourceUrl: text("source_url_or"),
  publicationDate: bigint("publication_date_or", { mode: "number" }),
  credibilityScore: integer("credibility_score_or").default(80).notNull(),
  createdAt: bigint("created_at_or", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_or_body").on(t.oversightBody),
  index("idx_or_agency").on(t.agencyReviewed),
  index("idx_or_issue").on(t.issueArea),
]);

export type OversightReportRow = typeof oversightReports.$inferSelect;

export const simulationRuns = pgTable("simulation_runs", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id"),
  simulationType: varchar("simulation_type", { length: 64 }).notNull(),
  scenarioName: varchar("scenario_name", { length: 256 }).notNull(),
  inputParameters: jsonb("input_parameters").$type<Record<string, unknown>>(),
  predictedOutcome: text("predicted_outcome"),
  predictedPressureChange: numeric("predicted_pressure_change", { precision: 8, scale: 2 }),
  predictedSignalChange: numeric("predicted_signal_change", { precision: 8, scale: 2 }),
  predictedTimelineChange: varchar("predicted_timeline_change", { length: 128 }),
  confidenceScore: integer("confidence_score").default(50).notNull(),
  status: varchar("status_sim", { length: 32 }).default("completed").notNull(),
  createdAt: bigint("created_at_sim", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  createdBy: varchar("created_by_sim", { length: 128 }),
}, (t) => [
  index("idx_sim_pattern").on(t.patternId),
  index("idx_sim_type").on(t.simulationType),
  index("idx_sim_status").on(t.status),
]);

export type SimulationRunRow = typeof simulationRuns.$inferSelect;

export const simulationAssumptions = pgTable("simulation_assumptions", {
  id: serial("id").primaryKey(),
  simulationId: integer("simulation_id").notNull(),
  parameterName: varchar("parameter_name", { length: 128 }).notNull(),
  parameterValue: varchar("parameter_value", { length: 256 }).notNull(),
  rationale: text("rationale"),
  createdAt: bigint("created_at_sa", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sa_sim").on(t.simulationId),
]);

export type SimulationAssumptionRow = typeof simulationAssumptions.$inferSelect;

export const simulationResults = pgTable("simulation_results", {
  id: serial("id").primaryKey(),
  simulationId: integer("simulation_id_sr").notNull(),
  patternId: integer("pattern_id_sr"),
  metricName: varchar("metric_name", { length: 128 }).notNull(),
  baselineValue: numeric("baseline_value", { precision: 12, scale: 4 }),
  projectedValue: numeric("projected_value", { precision: 12, scale: 4 }),
  deltaValue: numeric("delta_value", { precision: 12, scale: 4 }),
  impactLevel: varchar("impact_level", { length: 32 }),
  createdAt: bigint("created_at_sr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sr_sim").on(t.simulationId),
  index("idx_sr_metric").on(t.metricName),
]);

export type SimulationResultRow = typeof simulationResults.$inferSelect;

export const publicReports = pgTable("public_reports", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type_pr", { length: 64 }).notNull(),
  title: varchar("title_pr", { length: 512 }).notNull(),
  summary: text("summary_pr"),
  patternId: integer("pattern_id_pr"),
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

export const publicReportSections = pgTable("public_report_sections", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id_prs").notNull(),
  sectionType: varchar("section_type_prs", { length: 64 }).notNull(),
  heading: varchar("heading_prs", { length: 256 }).notNull(),
  content: text("content_prs"),
  displayOrder: integer("display_order_prs").default(0).notNull(),
  createdAt: bigint("created_at_prs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_prs_report").on(t.reportId),
  index("idx_prs_order").on(t.displayOrder),
]);

export type PublicReportSectionRow = typeof publicReportSections.$inferSelect;

export const publicReportExports = pgTable("public_report_exports", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id_pre").notNull(),
  format: varchar("format_pre", { length: 32 }).notNull(),
  filePath: text("file_path_pre"),
  generatedAt: bigint("generated_at_pre", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  generatedBy: varchar("generated_by_pre", { length: 128 }),
}, (t) => [
  index("idx_pre_report").on(t.reportId),
]);

export type PublicReportExportRow = typeof publicReportExports.$inferSelect;

export const dossierPackages = pgTable("dossier_packages", {
  id: serial("id").primaryKey(),
  dossierType: varchar("dossier_type", { length: 64 }).notNull(),
  title: varchar("title_dp", { length: 512 }).notNull(),
  patternId: integer("pattern_id_dp"),
  entityId: integer("entity_id_dp"),
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

export const dossierSections = pgTable("dossier_sections", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id_ds").notNull(),
  sectionType: varchar("section_type_ds", { length: 64 }).notNull(),
  heading: varchar("heading_ds", { length: 256 }).notNull(),
  content: text("content_ds"),
  displayOrder: integer("display_order_ds").default(0).notNull(),
  sourceRefs: jsonb("source_refs_ds").$type<string[]>(),
  createdAt: bigint("created_at_ds", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ds_dossier").on(t.dossierId),
  index("idx_ds_order").on(t.displayOrder),
]);

export type DossierSectionRow = typeof dossierSections.$inferSelect;

export const dossierExports = pgTable("dossier_exports", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id_de").notNull(),
  format: varchar("format_de", { length: 32 }).notNull(),
  filePath: text("file_path_de"),
  generatedAt: bigint("generated_at_de", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  generatedBy: varchar("generated_by_de", { length: 128 }),
}, (t) => [
  index("idx_de_dossier").on(t.dossierId),
]);

export type DossierExportRow = typeof dossierExports.$inferSelect;

export const externalPartners = pgTable("external_partners", {
  id: serial("id").primaryKey(),
  name: varchar("name_ep", { length: 256 }).notNull(),
  organization: varchar("organization_ep", { length: 256 }),
  partnerType: varchar("partner_type", { length: 64 }).notNull(),
  email: varchar("email_ep", { length: 256 }),
  jurisdiction: varchar("jurisdiction_ep", { length: 256 }),
  verificationStatus: varchar("verification_status", { length: 32 }).default("pending").notNull(),
  trustScore: integer("trust_score_ep").default(50).notNull(),
  notes: text("notes_ep"),
  createdAt: bigint("created_at_ep", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ep_type").on(t.partnerType),
  index("idx_ep_status").on(t.verificationStatus),
  index("idx_ep_org").on(t.organization),
]);

export type ExternalPartnerRow = typeof externalPartners.$inferSelect;

export const dossierShares = pgTable("dossier_shares", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id_dsh").notNull(),
  partnerId: integer("partner_id_dsh").notNull(),
  shareToken: varchar("share_token", { length: 128 }).notNull(),
  accessLevel: varchar("access_level", { length: 32 }).default("view_only").notNull(),
  expiresAt: bigint("expires_at_dsh", { mode: "number" }),
  viewCount: integer("view_count").default(0).notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  createdAt: bigint("created_at_dsh", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  revoked: boolean("revoked").default(false).notNull(),
}, (t) => [
  index("idx_dsh_dossier").on(t.dossierId),
  index("idx_dsh_partner").on(t.partnerId),
  index("idx_dsh_token").on(t.shareToken),
]);

export type DossierShareRow = typeof dossierShares.$inferSelect;

export const shareAccessLogs = pgTable("share_access_logs", {
  id: serial("id").primaryKey(),
  shareId: integer("share_id_sal").notNull(),
  partnerId: integer("partner_id_sal"),
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

export const externalComments = pgTable("external_comments", {
  id: serial("id").primaryKey(),
  shareId: integer("share_id_ec").notNull(),
  partnerId: integer("partner_id_ec").notNull(),
  sectionId: integer("section_id_ec"),
  commentText: text("comment_text_ec").notNull(),
  createdAt: bigint("created_at_ec", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ec_share").on(t.shareId),
  index("idx_ec_partner").on(t.partnerId),
]);

export type ExternalCommentRow = typeof externalComments.$inferSelect;

export const dossierRedactions = pgTable("dossier_redactions", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id_dr").notNull(),
  sectionId: integer("section_id_dr"),
  redactedText: text("redacted_text_dr").notNull(),
  reason: varchar("reason_dr", { length: 256 }),
  createdBy: varchar("created_by_dr", { length: 128 }),
  createdAt: bigint("created_at_dr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_dr_dossier").on(t.dossierId),
]);

export type DossierRedactionRow = typeof dossierRedactions.$inferSelect;

export const patternEntitySummary = pgTable("pattern_entity_summary", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id_pes").notNull(),
  entityName: varchar("entity_name_pes", { length: 512 }).notNull(),
  entityType: varchar("entity_type_pes", { length: 128 }),
  complaintCount: integer("complaint_count_pes").default(0),
  lawsuitCount: integer("lawsuit_count_pes").default(0),
  enforcementActions: integer("enforcement_actions_pes").default(0),
  patternInvolvementCount: integer("pattern_involvement_count_pes").default(0),
  confidenceScore: integer("confidence_score_pes").default(0),
  createdAt: bigint("created_at_pes", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_pes", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pes_pattern").on(t.patternId),
  index("idx_pes_entity").on(t.entityName),
]);

export type PatternEntitySummaryRow = typeof patternEntitySummary.$inferSelect;

export const patternResponsibleAgencies = pgTable("pattern_responsible_agencies", {
  id: serial("id").primaryKey(),
  patternId: integer("pattern_id_pra").notNull(),
  agencyName: varchar("agency_name_pra", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_pra", { length: 256 }),
  role: varchar("role_pra", { length: 128 }),
  complaintsReceived: integer("complaints_received_pra").default(0),
  investigationsOpened: integer("investigations_opened_pra").default(0),
  penaltiesIssued: integer("penalties_issued_pra").default(0),
  createdAt: bigint("created_at_pra", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_pra", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pra_pattern").on(t.patternId),
  index("idx_pra_agency").on(t.agencyName),
]);

export type PatternResponsibleAgencyRow = typeof patternResponsibleAgencies.$inferSelect;

export const entityEvidenceScores = pgTable("entity_evidence_scores", {
  id: serial("id").primaryKey(),
  entityName: varchar("entity_name_ees", { length: 512 }).notNull(),
  patternId: integer("pattern_id_ees"),
  signalCount: integer("signal_count_ees").default(0),
  complaintCount: integer("complaint_count_ees").default(0),
  lawsuitCount: integer("lawsuit_count_ees").default(0),
  enforcementCount: integer("enforcement_count_ees").default(0),
  streamCount: integer("stream_count_ees").default(0),
  geographicSpread: integer("geographic_spread_ees").default(0),
  confidenceScore: integer("confidence_score_ees").default(0),
  visibilityStatus: varchar("visibility_status_ees", { length: 64 }).default("provisional"),
  createdAt: bigint("created_at_ees", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_ees", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ees_entity").on(t.entityName),
  index("idx_ees_pattern").on(t.patternId),
  index("idx_ees_visibility").on(t.visibilityStatus),
]);

export type EntityEvidenceScoreRow = typeof entityEvidenceScores.$inferSelect;

export const systemicRiskForecasts = pgTable("systemic_risk_forecasts", {
  id: serial("id").primaryKey(),
  forecastScope: varchar("forecast_scope_srf", { length: 64 }).notNull(),
  scopeId: integer("scope_id_srf"),
  scopeName: varchar("scope_name_srf", { length: 512 }).notNull(),
  scopeType: varchar("scope_type_srf", { length: 128 }),
  jurisdiction: varchar("jurisdiction_srf", { length: 256 }),
  forecastWindowDays: integer("forecast_window_days_srf").notNull(),
  riskScore: integer("risk_score_srf").default(0),
  riskLevel: varchar("risk_level_srf", { length: 64 }).default("low"),
  forecastType: varchar("forecast_type_srf", { length: 128 }),
  scenarioLabel: varchar("scenario_label_srf", { length: 128 }),
  primaryDrivers: jsonb("primary_drivers_srf"),
  confidenceScore: integer("confidence_score_srf").default(0),
  predictedEscalationDate: bigint("predicted_escalation_date_srf", { mode: "number" }),
  createdAt: bigint("created_at_srf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_srf", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_srf_scope").on(t.forecastScope, t.scopeId),
  index("idx_srf_risk").on(t.riskLevel),
  index("idx_srf_window").on(t.forecastWindowDays),
]);

export type SystemicRiskForecastRow = typeof systemicRiskForecasts.$inferSelect;

export const forecastInputs = pgTable("forecast_inputs", {
  id: serial("id").primaryKey(),
  forecastId: integer("forecast_id_fi").notNull(),
  inputType: varchar("input_type_fi", { length: 128 }).notNull(),
  inputName: varchar("input_name_fi", { length: 256 }),
  inputValue: real("input_value_fi").default(0),
  weight: real("weight_fi").default(0),
  createdAt: bigint("created_at_fi", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_fi_forecast").on(t.forecastId),
]);

export type ForecastInputRow = typeof forecastInputs.$inferSelect;

export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id_as", { length: 128 }).notNull(),
  subscriptionType: varchar("subscription_type_as", { length: 64 }).notNull(),
  targetScope: varchar("target_scope_as", { length: 128 }),
  targetId: integer("target_id_as"),
  jurisdiction: varchar("jurisdiction_as", { length: 256 }),
  industry: varchar("industry_as", { length: 256 }),
  claimType: varchar("claim_type_as", { length: 256 }),
  riskThreshold: varchar("risk_threshold_as", { length: 64 }).default("high"),
  alertFrequency: varchar("alert_frequency_as", { length: 64 }).default("immediate"),
  isPaused: smallint("is_paused_as").default(0),
  notificationChannels: jsonb("notification_channels_as"),
  createdAt: bigint("created_at_as", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_as", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_as_user").on(t.userId),
  index("idx_as_type").on(t.subscriptionType),
]);

export type AlertSubscriptionRow = typeof alertSubscriptions.$inferSelect;

export const alertEvents = pgTable("alert_events", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id_ae"),
  alertType: varchar("alert_type_ae", { length: 128 }).notNull(),
  triggerSource: varchar("trigger_source_ae", { length: 128 }),
  triggerId: integer("trigger_id_ae"),
  riskScore: integer("risk_score_ae"),
  riskLevel: varchar("risk_level_ae", { length: 64 }),
  severity: varchar("severity_ae", { length: 64 }).default("info"),
  message: text("message_ae"),
  metadata: jsonb("metadata_ae"),
  createdAt: bigint("created_at_ae", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  sentAt: bigint("sent_at_ae", { mode: "number" }),
}, (t) => [
  index("idx_ae_sub").on(t.subscriptionId),
  index("idx_ae_type").on(t.alertType),
  index("idx_ae_severity").on(t.severity),
]);

export type AlertEventRow = typeof alertEvents.$inferSelect;

export const alertDeliveryLog = pgTable("alert_delivery_log", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id_adl").notNull(),
  channel: varchar("channel_adl", { length: 64 }).notNull(),
  recipient: varchar("recipient_adl", { length: 256 }),
  status: varchar("status_adl", { length: 64 }).default("pending"),
  errorMessage: text("error_message_adl"),
  sentAt: bigint("sent_at_adl", { mode: "number" }),
}, (t) => [
  index("idx_adl_alert").on(t.alertId),
]);

export type AlertDeliveryLogRow = typeof alertDeliveryLog.$inferSelect;

export const systemMapNodes = pgTable("system_map_nodes", {
  id: serial("id").primaryKey(),
  nodeType: varchar("node_type_smn", { length: 64 }).notNull(),
  nodeName: varchar("node_name_smn", { length: 512 }).notNull(),
  jurisdiction: varchar("jurisdiction_smn", { length: 256 }),
  industry: varchar("industry_smn", { length: 256 }),
  riskScore: integer("risk_score_smn").default(0),
  pressureIndex: integer("pressure_index_smn").default(0),
  patternCount: integer("pattern_count_smn").default(0),
  trendClassification: varchar("trend_classification_smn", { length: 64 }),
  activeInterventions: integer("active_interventions_smn").default(0),
  policyImpactScore: integer("policy_impact_score_smn").default(0),
  failureProbability: integer("failure_probability_smn").default(0),
  createdAt: bigint("created_at_smn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_smn", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_smn_type").on(t.nodeType),
  index("idx_smn_risk").on(t.riskScore),
  index("idx_smn_name").on(t.nodeName),
]);

export type SystemMapNodeRow = typeof systemMapNodes.$inferSelect;

export const systemMapEdges = pgTable("system_map_edges", {
  id: serial("id").primaryKey(),
  sourceNode: integer("source_node_sme").notNull(),
  targetNode: integer("target_node_sme").notNull(),
  relationshipType: varchar("relationship_type_sme", { length: 128 }).notNull(),
  relationshipStrength: integer("relationship_strength_sme").default(50),
  evidenceCount: integer("evidence_count_sme").default(0),
  createdAt: bigint("created_at_sme", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_sme_source").on(t.sourceNode),
  index("idx_sme_target").on(t.targetNode),
  index("idx_sme_type").on(t.relationshipType),
]);

export type SystemMapEdgeRow = typeof systemMapEdges.$inferSelect;

export const mapAnnotations = pgTable("map_annotations", {
  id: serial("id").primaryKey(),
  nodeId: integer("node_id_ma").notNull(),
  analyst: varchar("analyst_ma", { length: 256 }),
  note: text("note_ma").notNull(),
  createdAt: bigint("created_at_ma", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ma_node").on(t.nodeId),
]);

export type MapAnnotationRow = typeof mapAnnotations.$inferSelect;

export const institutionRiskProfiles = pgTable("institution_risk_profiles", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id_irp").notNull(),
  complaintVolume: integer("complaint_volume_irp").default(0),
  litigationVolume: integer("litigation_volume_irp").default(0),
  regulatoryActions: integer("regulatory_actions_irp").default(0),
  enforcementActions: integer("enforcement_actions_irp").default(0),
  appealReversalRate: real("appeal_reversal_rate_irp").default(0),
  processingDelayIndex: real("processing_delay_index_irp").default(0),
  policyShockScore: integer("policy_shock_score_irp").default(0),
  riskScore: integer("risk_score_irp").default(0),
  riskClassification: varchar("risk_classification_irp", { length: 64 }).default("stable"),
  failureProbability: integer("failure_probability_irp").default(0),
  estimatedFailureWindow: integer("estimated_failure_window_irp"),
  lastUpdated: bigint("last_updated_irp", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_irp_institution").on(t.institutionId),
  index("idx_irp_risk").on(t.riskClassification),
]);

export type InstitutionRiskProfileRow = typeof institutionRiskProfiles.$inferSelect;

export const institutionPatternLinks = pgTable("institution_pattern_links", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id_ipl").notNull(),
  patternId: integer("pattern_id_ipl").notNull(),
  confidenceScore: integer("confidence_score_ipl").default(0),
  createdAt: bigint("created_at_ipl", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ipl_institution").on(t.institutionId),
  index("idx_ipl_pattern").on(t.patternId),
]);

export type InstitutionPatternLinkRow = typeof institutionPatternLinks.$inferSelect;

export const institutionTimeline = pgTable("institution_timeline", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id_it").notNull(),
  eventType: varchar("event_type_it", { length: 128 }).notNull(),
  timestamp: bigint("timestamp_it", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  impactScore: integer("impact_score_it").default(0),
  metadata: jsonb("metadata_it"),
}, (t) => [
  index("idx_it_institution").on(t.institutionId),
  index("idx_it_type").on(t.eventType),
]);

export type InstitutionTimelineRow = typeof institutionTimeline.$inferSelect;

export const institutionAnnotations = pgTable("institution_annotations", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id_ia").notNull(),
  analyst: varchar("analyst_ia", { length: 256 }),
  note: text("note_ia").notNull(),
  createdAt: bigint("created_at_ia", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ia_institution").on(t.institutionId),
]);

export type InstitutionAnnotationRow = typeof institutionAnnotations.$inferSelect;

export const investigativeQueries = pgTable("investigative_queries", {
  id: serial("id").primaryKey(),
  queryText: text("query_text").notNull(),
  parsedQuery: jsonb("parsed_query").$type<Record<string, unknown>>(),
  userId: varchar("user_id_iq", { length: 256 }),
  resultCount: integer("result_count_iq").default(0),
  status: varchar("status_iq", { length: 32 }).default("pending").notNull(),
  createdAt: bigint("created_at_iq", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_iq_user").on(t.userId),
  index("idx_iq_status").on(t.status),
]);

export type InvestigativeQueryRow = typeof investigativeQueries.$inferSelect;

export const investigativeResults = pgTable("investigative_results", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id_ir").notNull(),
  entityName: varchar("entity_name_ir", { length: 512 }).notNull(),
  entityType: varchar("entity_type_ir", { length: 128 }),
  signalCount: integer("signal_count_ir").default(0),
  complaintCount: integer("complaint_count_ir").default(0),
  lawsuitCount: integer("lawsuit_count_ir").default(0),
  enforcementCount: integer("enforcement_count_ir").default(0),
  streamCount: integer("stream_count_ir").default(0),
  confidenceScore: integer("confidence_score_ir").default(0),
  jurisdictions: jsonb("jurisdictions_ir").$type<string[]>(),
  sourceStreams: jsonb("source_streams_ir").$type<string[]>(),
  rank: integer("rank_ir").default(0),
  safeLanguageSummary: text("safe_language_summary_ir"),
}, (t) => [
  index("idx_ir_query").on(t.queryId),
  index("idx_ir_entity").on(t.entityName),
]);

export type InvestigativeResultRow = typeof investigativeResults.$inferSelect;

export const exportSpineRuns = pgTable("export_spine_runs", {
  id: serial("id").primaryKey(),
  exportType: pgEnum("export_spine_runs_export_type_esr_enum", ["full", "schema", "config", "deployment"])("export_type_esr").notNull(),
  bundleName: varchar("bundle_name_esr", { length: 256 }).notNull(),
  status: pgEnum("export_spine_runs_status_esr_enum", ["pending", "running", "completed", "failed"])("status_esr").default("pending").notNull(),
  createdAt: bigint("created_at_esr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completed_at_esr", { mode: "number" }),
  createdBy: varchar("created_by_esr", { length: 256 }),
  filePath: varchar("file_path_esr", { length: 512 }),
  fileUrl: varchar("file_url_esr", { length: 1024 }),
  bundleSize: bigint("bundle_size_esr", { mode: "number" }),
  bundleManifestJson: jsonb("bundle_manifest_json_esr").$type<{
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

export const restoreSpineRuns = pgTable("restore_spine_runs", {
  id: serial("id").primaryKey(),
  bundleName: varchar("bundle_name_rsr", { length: 256 }).notNull(),
  restoreType: pgEnum("restore_spine_runs_restore_type_rsr_enum", ["full", "schema", "config", "deployment"])("restore_type_rsr").notNull(),
  status: pgEnum("restore_spine_runs_status_rsr_enum", ["pending", "validating", "restoring", "completed", "failed", "rolled_back"])("status_rsr").default("pending").notNull(),
  startedAt: bigint("started_at_rsr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  completedAt: bigint("completed_at_rsr", { mode: "number" }),
  restoredTables: jsonb("restored_tables_rsr").$type<string[]>(),
  restoredEngines: jsonb("restored_engines_rsr").$type<string[]>(),
  restoredStreams: jsonb("restored_streams_rsr").$type<string[]>(),
  errors: jsonb("errors_rsr").$type<string[]>(),
  executedBy: varchar("executed_by_rsr", { length: 256 }),
  riskLevel: pgEnum("restore_spine_runs_risk_level_rsr_enum", ["low", "medium", "high", "critical"])("risk_level_rsr").default("medium"),
  manifestChecksum: varchar("manifest_checksum_rsr", { length: 128 }),
  validationResult: jsonb("validation_result_rsr").$type<{
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

export const adminChangeLog = pgTable("admin_change_log", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id_acl", { length: 256 }).notNull(),
  adminName: varchar("admin_name_acl", { length: 256 }),
  actionType: pgEnum("admin_change_log_action_type_acl_enum", [
    "engine_add", "engine_remove", "engine_reorder", "engine_toggle",
    "stream_add", "stream_edit", "stream_disable",
    "signal_weight_change",
    "schema_edit", "migration_run", "migration_rollback",
    "config_change", "system_setting",
    "checkpoint_reset", "engine_patch", "stream_patch", "schema_patch", "patch_rollback", "force_reingestion",
  ])("action_type_acl").notNull(),
  targetSystem: varchar("target_system_acl", { length: 128 }).notNull(),
  targetId: varchar("target_id_acl", { length: 256 }),
  previousState: jsonb("previous_state_acl"),
  newState: jsonb("new_state_acl"),
  description: text("description_acl"),
  timestamp: bigint("timestamp_acl", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  rollbackAvailable: boolean("rollback_available_acl").default(true),
  rolledBack: boolean("rolled_back_acl").default(false),
  rollbackData: jsonb("rollback_data_acl"),
}, (t) => [
  index("idx_acl_admin").on(t.adminId),
  index("idx_acl_action").on(t.actionType),
  index("idx_acl_target").on(t.targetSystem),
  index("idx_acl_time").on(t.timestamp),
]);

export type AdminChangeLogRow = typeof adminChangeLog.$inferSelect;

export const engineRegistry = pgTable("engine_registry", {
  id: serial("id").primaryKey(),
  engineId: varchar("engine_id_er", { length: 128 }).notNull().unique(),
  engineName: varchar("engine_name_er", { length: 256 }).notNull(),
  description: text("description_er"),
  category: varchar("category_er", { length: 128 }),
  enabled: boolean("enabled_er").default(true).notNull(),
  sortOrder: integer("sort_order_er").default(0).notNull(),
  configJson: jsonb("config_json_er").$type<Record<string, any>>(),
  version: varchar("version_er", { length: 32 }),
  createdAt: bigint("created_at_er", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_er", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_er2_category").on(t.category),
  index("idx_er2_enabled").on(t.enabled),
  index("idx_er2_sort").on(t.sortOrder),
]);

export type EngineRegistryRow = typeof engineRegistry.$inferSelect;

export const dataStreamRegistry = pgTable("data_stream_registry", {
  id: serial("id").primaryKey(),
  streamId: varchar("stream_id_dsr", { length: 128 }).notNull().unique(),
  streamName: varchar("stream_name_dsr", { length: 256 }).notNull(),
  streamType: pgEnum("data_stream_registry_stream_type_dsr_enum", [
    "government_complaints", "court_filings", "regulatory_enforcement",
    "public_records", "media_reports", "civil_society_reports", "verified_user_reports",
  ])("stream_type_dsr").notNull(),
  sourceUrl: varchar("source_url_dsr", { length: 512 }),
  updateFrequency: pgEnum("data_stream_registry_update_freq_dsr_enum", ["realtime", "hourly", "daily", "weekly", "monthly", "manual"])("update_freq_dsr").default("daily").notNull(),
  signalWeight: integer("signal_weight_dsr").default(100).notNull(),
  confidenceMultiplier: integer("confidence_multiplier_dsr").default(100).notNull(),
  enabled: boolean("enabled_dsr").default(true).notNull(),
  description: text("description_dsr"),
  fieldMapping: jsonb("field_mapping_dsr").$type<Record<string, string>>(),
  recordsIngested: integer("records_ingested_dsr").default(0).notNull(),
  signalsGenerated: integer("signals_generated_dsr").default(0).notNull(),
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
  lastHttpStatus: integer("last_http_status_dsr"),
  failureCount: integer("failure_count_dsr").default(0).notNull(),
  consecutiveFailures: integer("consecutive_failures_dsr").default(0).notNull(),
  retryAfterAt: bigint("retry_after_at_dsr", { mode: "number" }),
  autoDisabled: boolean("auto_disabled_dsr").default(false).notNull(),
  disabledReason: varchar("disabled_reason_dsr", { length: 256 }),
  lastRecordsIngested: integer("last_records_ingested_dsr").default(0).notNull(),
  lastSignalsGenerated: integer("last_signals_generated_dsr").default(0).notNull(),
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

export const patternTimelineEvents = pgTable("pattern_timeline_events", {
  id: serial("id").primaryKey(),
  patternId: varchar("pattern_id_pte", { length: 128 }).notNull(),
  eventType: pgEnum("pattern_timeline_events_event_type_pte_enum", [
    "pattern_detected", "strategy_generated", "intervention_started",
    "intervention_completed", "outcome_recorded", "trend_shift", "policy_change",
  ])("event_type_pte").notNull(),
  eventSource: varchar("event_source_pte", { length: 256 }),
  title: varchar("title_pte", { length: 512 }).notNull(),
  description: text("description_pte"),
  impactScore: integer("impact_score_pte").default(0),
  metadata: jsonb("metadata_pte").$type<Record<string, any>>(),
  timestamp: bigint("timestamp_pte", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_pte_pattern").on(t.patternId),
  index("idx_pte_type").on(t.eventType),
  index("idx_pte_time").on(t.timestamp),
]);

export type PatternTimelineEventRow = typeof patternTimelineEvents.$inferSelect;

export const copilotConversations = pgTable("copilot_conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id_cc", { length: 256 }).notNull(),
  title: varchar("title_cc", { length: 512 }),
  status: pgEnum("copilot_conversations_status_cc_enum", ["active", "archived"])("status_cc").default("active").notNull(),
  createdAt: bigint("created_at_cc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_cc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cc_user").on(t.userId),
  index("idx_cc_status").on(t.status),
]);

export type CopilotConversationRow = typeof copilotConversations.$inferSelect;

export const copilotMessages = pgTable("copilot_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id_cm").notNull(),
  role: pgEnum("copilot_messages_role_cm_enum", ["user", "assistant", "system"])("role_cm").notNull(),
  content: text("content_cm").notNull(),
  artifactId: integer("artifact_id_cm"),
  createdAt: bigint("created_at_cm", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cm_conv").on(t.conversationId),
]);

export type CopilotMessageRow = typeof copilotMessages.$inferSelect;

export const copilotArtifacts = pgTable("copilot_artifacts", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id_ca").notNull(),
  artifactType: pgEnum("copilot_artifacts_artifact_type_ca_enum", ["sql", "engine", "config", "stream", "rule"])("artifact_type_ca").notNull(),
  title: varchar("title_ca", { length: 512 }).notNull(),
  content: text("content_ca").notNull(),
  status: pgEnum("copilot_artifacts_status_ca_enum", ["draft", "pending_approval", "approved", "executed", "rejected", "rolled_back"])("status_ca").default("draft").notNull(),
  rollbackContent: text("rollback_content_ca"),
  createdAt: bigint("created_at_ca", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ca_conv").on(t.conversationId),
  index("idx_ca_status").on(t.status),
]);

export type CopilotArtifactRow = typeof copilotArtifacts.$inferSelect;

export const copilotImpactAnalyses = pgTable("copilot_impact_analyses", {
  id: serial("id").primaryKey(),
  artifactId: integer("artifact_id_cia").notNull(),
  affectedTables: jsonb("affected_tables_cia").$type<string[]>(),
  affectedEngines: jsonb("affected_engines_cia").$type<string[]>(),
  affectedStreams: jsonb("affected_streams_cia").$type<string[]>(),
  riskLevel: pgEnum("copilot_impact_analyses_risk_level_cia_enum", ["low", "medium", "high", "critical"])("risk_level_cia").default("medium").notNull(),
  rollbackComplexity: pgEnum("copilot_impact_analyses_rollback_complexity_cia_enum", ["simple", "moderate", "complex"])("rollback_complexity_cia").default("simple").notNull(),
  summary: text("summary_cia"),
  createdAt: bigint("created_at_cia", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_cia_artifact").on(t.artifactId),
]);

export type CopilotImpactAnalysisRow = typeof copilotImpactAnalyses.$inferSelect;

export const copilotExecutions = pgTable("copilot_executions", {
  id: serial("id").primaryKey(),
  artifactId: integer("artifact_id_ce").notNull(),
  executedBy: varchar("executed_by_ce", { length: 256 }).notNull(),
  status: pgEnum("copilot_executions_status_ce_enum", ["success", "failed", "rolled_back"])("status_ce").notNull(),
  resultSummary: text("result_summary_ce"),
  errorMessage: text("error_message_ce"),
  executedAt: bigint("executed_at_ce", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_ce_artifact").on(t.artifactId),
  index("idx_ce_status").on(t.status),
]);

export type CopilotExecutionRow = typeof copilotExecutions.$inferSelect;

export const copilotSystemContext = pgTable("copilot_system_context", {
  id: serial("id").primaryKey(),
  contextType: pgEnum("copilot_system_context_context_type_csc_enum", ["schema", "engine", "stream", "config", "signal"])("context_type_csc").notNull(),
  contextKey: varchar("context_key_csc", { length: 256 }).notNull(),
  contextValue: text("context_value_csc").notNull(),
  updatedAt: bigint("updated_at_csc", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (t) => [
  index("idx_csc_type").on(t.contextType),
  index("idx_csc_key").on(t.contextKey),
]);

export type CopilotSystemContextRow = typeof copilotSystemContext.$inferSelect;

export const signalExtractions = pgTable("signal_extractions", {
  id: serial("id").primaryKey(),
  docId: integer("doc_id_se").notNull(),
  caseId: integer("case_id_se").notNull(),

  // Entities
  entitiesPeople: text("entities_people_se"),       // JSON array of strings
  entitiesCompanies: text("entities_companies_se"),  // JSON array of strings
  entitiesAgencies: text("entities_agencies_se"),    // JSON array of strings

  // Complaint
  complaintType: varchar("complaint_type_se", { length: 256 }),
  complaintDescription: text("complaint_description_se"),
  complaintCategory: pgEnum("signal_extractions_complaint_category_se_enum", ["financial", "medical", "housing", "legal", "other"])("complaint_category_se").default("other"),
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
  impactVictimCount: integer("impact_victim_count_se"),
  impactAmount: varchar("impact_amount_se", { length: 64 }),
  impactScope: pgEnum("signal_extractions_impact_scope_se_enum", ["individual", "local", "regional", "statewide", "national"])("impact_scope_se"),
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
  severityScore: integer("severity_score_se"),
  severityVictimCountUsed: integer("severity_victim_count_used_se"),
  severityAmountUsed: varchar("severity_amount_used_se", { length: 64 }),
  severityCategoryWeight: integer("severity_category_weight_se"),

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

export const extractionStaging = pgTable("extraction_staging", {
  id: serial("id").primaryKey(),
  // Signal data (mirrors live_signals fields)
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  datasetId: varchar("dataset_id", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 256 }),
  domain: varchar("domain", { length: 128 }),
  severity: pgEnum("extraction_staging_severity_enum", ["critical", "high", "medium", "low"])("severity").notNull().default("medium"),
  title: varchar("title", { length: 512 }).notNull(),
  explanation: text("explanation"),
  patternSummary: text("pattern_summary"),
  supportingStatistics: jsonb("supporting_statistics"),
  rawConfidenceScore: numeric("raw_confidence_score", { precision: 10, scale: 4 }),
  signalFingerprint: varchar("signal_fingerprint", { length: 128 }),
  entityType: pgEnum("extraction_staging_entity_type_enum", ["company", "person", "agency", "organization", "unknown"])("entity_type"),
  canonicalEntityName: varchar("canonical_entity_name", { length: 256 }),
  entityRole: varchar("entity_role", { length: 128 }),
  // Source tracking
  liveSignalId: integer("live_signal_id"),
  ingestRunId: integer("ingest_run_id"),
  // Sunam gate scoring
  sunamScore: numeric("sunam_score", { precision: 10, scale: 4 }).notNull(),
  sunamThreshold: numeric("sunam_threshold", { precision: 10, scale: 4 }).notNull(),
  scoreBreakdown: jsonb("score_breakdown").notNull(),
  // Gate decision
  gateDecision: pgEnum("extraction_staging_gate_decision_enum", ["staged", "promoted", "rejected", "expired"])("gate_decision").notNull().default("staged"),
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

export const sunamGateLog = pgTable("sunam_gate_log", {
  id: serial("id").primaryKey(),
  // Signal reference
  liveSignalId: integer("live_signal_id"),
  signalFingerprint: varchar("signal_fingerprint", { length: 128 }),
  signalType: varchar("signal_type", { length: 128 }).notNull(),
  datasetId: varchar("dataset_id", { length: 128 }).notNull(),
  // Scoring
  sunamScore: numeric("sunam_score", { precision: 10, scale: 4 }).notNull(),
  thresholdUsed: numeric("threshold_used", { precision: 10, scale: 4 }).notNull(),
  scoreBreakdown: jsonb("score_breakdown").notNull(),
  // Decision
  decision: pgEnum("sunam_gate_log_decision_enum", ["approve", "reject", "manual_promote", "manual_reject", "expire"])("decision").notNull(),
  decisionReason: text("decision_reason"),
  // Destination
  promotedSignalId: varchar("promoted_signal_id", { length: 64 }),
  stagingId: integer("staging_id"),
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

export const sunamThresholds = pgTable("sunam_thresholds", {
  id: serial("id").primaryKey(),
  thresholdName: varchar("threshold_name", { length: 128 }).notNull().unique(),
  description: text("description"),
  // Scoring weights (sum to 1.0)
  weightConfidence: numeric("weight_confidence", { precision: 5, scale: 4 }).notNull().default("0.3000"),
  weightEvidenceStrength: numeric("weight_evidence_strength", { precision: 5, scale: 4 }).notNull().default("0.2500"),
  weightCorroboration: numeric("weight_corroboration", { precision: 5, scale: 4 }).notNull().default("0.2000"),
  weightTemporalDensity: numeric("weight_temporal_density", { precision: 5, scale: 4 }).notNull().default("0.1500"),
  weightGeographicScope: numeric("weight_geographic_scope", { precision: 5, scale: 4 }).notNull().default("0.1000"),
  // Pass threshold
  passThreshold: numeric("pass_threshold", { precision: 10, scale: 4 }).notNull().default("0.5000"),
  // Applies to
  appliesToSignalType: varchar("applies_to_signal_type", { length: 128 }),
  appliesToDataset: varchar("applies_to_dataset", { length: 128 }),
  // Status
  isActive: smallint("is_active").notNull().default(1),
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

export const governanceLog = pgTable("governance_log", {
  id: serial("id").primaryKey(),
  seqNo: bigint("seq_no", { mode: "number" }).notNull().unique(),
  
  // Event classification
  eventType: varchar("event_type", { length: 64 }).notNull(),
  component: varchar("component", { length: 128 }).notNull(),     // e.g., "sunam_thresholds", "escalation_thresholds", "pattern_decay_rules"
  scope: varchar("scope", { length: 256 }),                        // e.g., "signal_type:wage_theft", "pattern_type:entity_recurrence"
  
  // Before/after state (canonical JSON)
  previousState: text("previous_state"),                     // canonical JSON of previous state (null for creation)
  newState: text("new_state").notNull(),                     // canonical JSON of new state
  
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

export const governanceSnapshots = pgTable("governance_snapshots", {
  id: serial("id").primaryKey(),
  
  // Snapshot scope
  snapshotAt: bigint("snapshot_at", { mode: "number" }).notNull(),
  upToSeqNo: bigint("up_to_seq_no", { mode: "number" }).notNull(),
  
  // Chain verification
  hashChainRoot: varchar("hash_chain_root", { length: 128 }).notNull(), // hash of the chain up to seq_no
  entryCount: integer("entry_count").notNull(),                              // total entries in snapshot
  
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

export const sessionLog = pgTable("session_log", {
  id: serial("id").primaryKey(),
  
  // Session identity
  sessionId: varchar("session_id", { length: 36 }).notNull().unique(), // UUID
  
  // Timing
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }), // null if still running
  
  // Actor type
  actorType: varchar("actor_type", { length: 20 }).notNull(), // "tsunam" | "luminari"
  
  // Governance anchor — the verified seq_no this session started from
  governanceAnchor: integer("governance_anchor").notNull(), // last_verified_seq_no at session start
  
  // Actions and results
  actionsTaken: jsonb("actions_taken").$type<Array<{
    action: string;
    input: Record<string, unknown>;
    timestamp: number;
  }>>().notNull().default([]),
  
  results: jsonb("results").$type<Record<string, unknown>>().notNull().default({}),
  
  // Governance entries produced by this session
  // Range: [start_seq_no, end_seq_no] inclusive
  // Enables verification: all entries in this range were created by this session
  governanceEntriesStart: integer("governance_entries_start"), // null if no entries created
  governanceEntriesEnd: integer("governance_entries_end"),     // null if no entries created
  
  // Next actions for the following session
  nextActions: jsonb("next_actions").$type<Array<{
    action: string;
    description: string;
    inputs?: Record<string, unknown>;
  }>>().notNull().default([]),
  
  // State snapshot at end of session
  stateSnapshot: jsonb("state_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  
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

export const chainVerificationLog = pgTable("chain_verification_log", {
  id: serial("id").primaryKey(),
  runAt: bigint("run_at", { mode: "number" }).notNull(),
  valid: boolean("valid").notNull(),
  totalEntries: integer("total_entries").notNull(),
  lastValidSeqNo: integer("last_valid_seq_no").notNull(),
  breakPoint: jsonb("break_point").$type<{
    seqNo: number;
    expectedHash: string;
    actualHash: string;
    reason: string;
  } | null>().default(null),
  durationMs: integer("duration_ms").notNull(),
}, (table) => [
  index("idx_verification_run_at").on(table.runAt),
  index("idx_verification_valid").on(table.valid),
]);

export type ChainVerificationLog = typeof chainVerificationLog.$inferSelect;
export type InsertChainVerificationLog = typeof chainVerificationLog.$inferInsert;

export const systemReferences = pgTable("system_references", {
  id: serial("id").primaryKey(),
  
  // Reference identity
  slug: varchar("slug", { length: 256 }).notNull().unique(), // e.g., "signal-flow-engine-1.0"
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 128 }).notNull(), // e.g., "architecture", "governance", "control"
  subcategory: varchar("subcategory", { length: 128 }), // e.g., "signal-systems", "data-flow"
  
  // Content
  htmlContent: text("html_content").notNull(), // Full HTML rendering
  plainTextSummary: text("plain_text_summary"), // Plain text summary for search/display
  
  // Purpose and scope
  purpose: text("purpose"), // Why this reference exists
  scope: text("scope"), // What this reference governs
  applicability: text("applicability"), // When/where this applies
  
  // Governance
  version: varchar("version", { length: 32 }).notNull().default("1.0"),
  status: pgEnum("system_references_status_enum", ["active", "archived", "deprecated"])("status").default("active").notNull(),
  requiresApprovalForChange: smallint("requires_approval_for_change").notNull().default(1),
  
  // Audit
  createdBy: varchar("created_by", { length: 256 }).notNull(), // admin ID or system
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedBy: varchar("updated_by", { length: 256 }),
  updatedAt: bigint("updated_at", { mode: "number" }),
  
  // Linked governance entry (if this reference was changed via governance log)
  linkedGovernanceEntryId: integer("linked_governance_entry_id"),
}, (table) => [
  index("idx_ref_slug").on(table.slug),
  index("idx_ref_category").on(table.category),
  index("idx_ref_subcategory").on(table.subcategory),
  index("idx_ref_status").on(table.status),
  index("idx_ref_created").on(table.createdAt),
]);

export type SystemReference = typeof systemReferences.$inferSelect;
export type InsertSystemReference = typeof systemReferences.$inferInsert;

export const referenceChangeHistory = pgTable("reference_change_history", {
  id: serial("id").primaryKey(),
  
  // Reference being changed
  referenceId: integer("reference_id").notNull(),
  
  // Change details
  changeType: varchar("change_type", { length: 32 }).notNull(), // "created", "updated", "archived", "restored"
  previousContent: text("previous_content"), // null for creation
  newContent: text("new_content").notNull(),
  
  // Rationale
  rationale: text("rationale").notNull(),
  
  // Actor
  changedBy: varchar("changed_by", { length: 256 }).notNull(),
  
  // Governance link
  governanceEntryId: integer("governance_entry_id"), // Link to governance_log if change was governed
  
  // Timestamp
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_ref_history_ref").on(table.referenceId),
  index("idx_ref_history_type").on(table.changeType),
  index("idx_ref_history_created").on(table.createdAt),
]);

export type ReferenceChangeHistory = typeof referenceChangeHistory.$inferSelect;
export type InsertReferenceChangeHistory = typeof referenceChangeHistory.$inferInsert;

export const patternOutputs = pgTable("pattern_outputs", {
  id: serial("id").primaryKey(),
  
  // Cluster identification
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Pattern composition
  signalCount: integer("signal_count").notNull(),
  signalTypes: jsonb("signal_types").notNull().$type<string[]>(),
  
  // Severity assessment
  severity: pgEnum("pattern_outputs_severity_enum", ["low", "medium", "high"])("severity").notNull(),
  
  // Quarantine
  isQuarantined: smallint("is_quarantined").notNull().default(0),
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

export const strategyOutputs = pgTable("strategy_outputs", {
  id: serial("id").primaryKey(),
  
  // Link to pattern cluster
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Strategy definition
  strategyType: pgEnum("strategy_outputs_strategy_type_enum", ["escalate", "monitor", "log"])("strategy_type").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  priority: integer("priority").notNull(),
  
  // Quarantine
  isQuarantined: smallint("is_quarantined").notNull().default(0),
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

export const activationOutputs = pgTable("activation_outputs", {
  id: serial("id").primaryKey(),
  
  // Link to procedural cluster
  clusterId: varchar("cluster_id", { length: 255 }).notNull(),
  
  // Activation definition
  procedureType: pgEnum("activation_outputs_procedure_type_enum", ["alert", "track", "record"])("procedure_type").notNull(),
  steps: jsonb("steps").notNull().$type<string[]>(),
  status: pgEnum("activation_outputs_status_enum", ["pending", "in_progress", "completed"])("status").default("pending").notNull(),

  // Quarantine
  isQuarantined: smallint("is_quarantined").notNull().default(0),
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

export const mentalHealthResources = pgTable("mental_health_resources", {
  id: varchar("id", { length: 128 }).primaryKey(),
  resourceName: varchar("resourceName", { length: 256 }).notNull(),
  resourceType: pgEnum("mental_health_resources_resource_type_enum", [
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
  ])("resourceType").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).notNull(),
  website: text("website"),
  contactMethods: jsonb("contactMethods").notNull().$type<{
    phone?: string;
    text?: string;
    chat?: string;
    web?: string;
    walk_in?: string;
    email?: string;
  }>(),
  availability: jsonb("availability").$type<{
    hours?: string;
    is24_7?: boolean;
  }>(),
  populationServed: jsonb("populationServed").$type<string[]>(),
  servicesProvided: jsonb("servicesProvided").$type<string[]>(),
  eligibility: text("eligibility"),
  cost: text("cost"),
  languages: jsonb("languages").$type<string[]>(),
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

export const businessBaselines = pgTable("business_baselines", {
  id: serial("id").primaryKey(),
  entityType: pgEnum("business_baselines_entity_type_enum", ["product", "expense_category"])("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  avgAmount: numeric("avg_amount", { precision: 10, scale: 2 }).notNull(),
  stddevAmount: numeric("stddev_amount", { precision: 10, scale: 2 }),
  sampleCount: integer("sample_count").notNull(),
  lastUpdated: bigint("last_updated", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_entity_type_id").on(table.entityType, table.entityId),
  index("idx_entity_type").on(table.entityType),
]);

export type BusinessBaseline = typeof businessBaselines.$inferSelect;
export type InsertBusinessBaseline = typeof businessBaselines.$inferInsert;

export const registryJurisdictions = pgTable("registry_jurisdictions", {
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

export const registryPolicyAlerts = pgTable("registry_policy_alerts", {
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

export const registryPrograms = pgTable("registry_programs", {
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

export const registryWorkflows = pgTable("registry_workflows", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rw", { length: 128 }).notNull(),
  workflowType: text("workflow_type_rw"),
  primaryStatutes: text("primary_statutes_rw"),
  steps: jsonb("steps_rw").$type<any[]>(),
  deadlines: text("deadlines_rw"),
  escalationPaths: text("escalation_paths_rw"),
  createdAt: bigint("created_at_rw", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rw_jurisdiction").on(table.jurisdictionId),
]);

export type RegistryWorkflow = typeof registryWorkflows.$inferSelect;
export type InsertRegistryWorkflow = typeof registryWorkflows.$inferInsert;

export const registryOversightBodies = pgTable("registry_oversight_bodies", {
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

export const registrySourceTraceability = pgTable("registry_source_traceability", {
  id: varchar("id", { length: 128 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id_rst", { length: 128 }).notNull(),
  sourceDocuments: jsonb("source_documents_rst").$type<string[]>(),
  sourceVariants: jsonb("source_variants_rst").$type<string[]>(),
  notesOnMerge: text("notes_on_merge_rst"),
  conflicts: jsonb("conflicts_rst").$type<any[]>(),
  createdAt: bigint("created_at_rst", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rst_jurisdiction").on(table.jurisdictionId),
]);

export type RegistrySourceTraceability = typeof registrySourceTraceability.$inferSelect;
export type InsertRegistrySourceTraceability = typeof registrySourceTraceability.$inferInsert;

export const registrySignals = pgTable("registry_signals", {
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

export const tableRegistry = pgTable("table_registry", {
  id: serial("id").primaryKey(),
  tableName: varchar("tableName", { length: 128 }).notNull().unique(),
  category: varchar("category", { length: 64 }).notNull(), // e.g. "core", "engine", "registry", "backbone", "conduit"
  description: text("description"),
  rowCount: integer("rowCount").default(0),
  columnCount: integer("columnCount").default(0),
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

export const fieldDictionary = pgTable("field_dictionary", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull(),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  fieldType: varchar("fieldType", { length: 64 }).notNull(),
  isNullable: smallint("isNullable").default(1),
  isPrimaryKey: smallint("isPrimaryKey").default(0),
  isIndexed: smallint("isIndexed").default(0),
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_fd_table").on(table.tableId),
]);

export type FieldDictionary = typeof fieldDictionary.$inferSelect;
export type InsertFieldDictionary = typeof fieldDictionary.$inferInsert;

export const relationCatalog = pgTable("relation_catalog", {
  id: serial("id").primaryKey(),
  sourceTableId: integer("source_table_id").notNull(),
  sourceField: varchar("source_field", { length: 128 }).notNull(),
  targetTableId: integer("target_table_id").notNull(),
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

export const pipelineMap = pgTable("pipeline_map", {
  id: serial("id").primaryKey(),
  pipelineId: varchar("pipeline_id", { length: 128 }).notNull().unique(),
  pipelineName: varchar("pipeline_name", { length: 256 }).notNull(),
  stages: jsonb("stages"), // ordered array of stage descriptors
  inputTables: jsonb("input_tables"), // string[]
  outputTables: jsonb("output_tables"), // string[]
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

export const transformProfiles = pgTable("transform_profiles", {
  id: serial("id").primaryKey(),
  profileName: varchar("profile_name", { length: 256 }).notNull(),
  engineId: varchar("engine_id", { length: 128 }),
  pipelineId: varchar("pipeline_id", { length: 128 }),
  inputSchema: jsonb("input_schema"), // field descriptors
  outputSchema: jsonb("output_schema"), // field descriptors
  transformRules: jsonb("transform_rules"), // transformation logic descriptors
  version: varchar("version", { length: 32 }).default("1.0.0"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_tp_engine").on(table.engineId),
  index("idx_tp_pipeline").on(table.pipelineId),
]);

export type TransformProfile = typeof transformProfiles.$inferSelect;
export type InsertTransformProfile = typeof transformProfiles.$inferInsert;

export const conduitEvents = pgTable("conduit_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(), // ENGINE_RUN, ALPHA_EXPORT, SCHEMA_SCAN, DRIFT_DETECTED, SNAPSHOT_BOUND
  pipelineId: varchar("pipeline_id", { length: 128 }),
  engineId: varchar("engine_id", { length: 128 }),
  runId: varchar("run_id", { length: 128 }),
  snapshotId: integer("snapshot_id"),
  metadata: jsonb("metadata"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ce_type").on(table.eventType),
  index("idx_ce_pipeline").on(table.pipelineId),
  index("idx_ce_engine").on(table.engineId),
  index("idx_ce_snapshot").on(table.snapshotId),
]);

export type ConduitEvent = typeof conduitEvents.$inferSelect;
export type InsertConduitEvent = typeof conduitEvents.$inferInsert;

export const alphaLakeExports = pgTable("alpha_lake_exports", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull(),
  exportType: varchar("export_type", { length: 64 }).notNull(), // "full", "partial", "delta"
  engineRunIds: jsonb("engine_run_ids"), // string[] of run_ids included
  outputPayload: jsonb("output_payload"), // assembled document
  status: varchar("status", { length: 32 }).default("completed"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_ale_snapshot").on(table.snapshotId),
  index("idx_ale_type").on(table.exportType),
]);

export type AlphaLakeExport = typeof alphaLakeExports.$inferSelect;
export type InsertAlphaLakeExport = typeof alphaLakeExports.$inferInsert;

export const enforcementActionPaths = pgTable("enforcement_action_paths", {
  id: serial("id").primaryKey(),
  // Which pipeline/claim type this path applies to
  pipelineType: varchar("pipelineType", { length: 128 }).notNull(),
  // Human-readable claim label (e.g., "Housing Benefits Denial")
  claimLabel: varchar("claimLabel", { length: 256 }).notNull(),
  // Jurisdiction: "federal", state code, or "all"
  jurisdiction: varchar("jurisdiction", { length: 16 }).notNull().default("federal"),
  // Priority order when multiple paths exist for same pipelineType
  priority: integer("priority").notNull().default(1),
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
  submissionMethods: jsonb("submissionMethods").$type<Array<{
    method: "online" | "phone" | "mail" | "email" | "in_person";
    details: string;
    url?: string;
    preferred?: boolean;
  }>>(),
  // ─── Timeline ───
  filingDeadlineDays: integer("filingDeadlineDays"),
  filingDeadlineDescription: text("filingDeadlineDescription"),
  expectedResponseDays: integer("expectedResponseDays"),
  expectedResponseDescription: text("expectedResponseDescription"),
  investigationTimelineDays: integer("investigationTimelineDays"),
  investigationTimelineDescription: text("investigationTimelineDescription"),
  // ─── Steps ───
  steps: jsonb("steps").$type<Array<{
    order: number;
    title: string;
    description: string;
    actionType: "prepare" | "file" | "wait" | "respond" | "escalate";
    tips?: string[];
  }>>(),
  // ─── Escalation ───
  escalationPaths: jsonb("escalationPaths").$type<Array<{
    condition: string;
    action: string;
    agencyName?: string;
    contactInfo?: string;
    deadline?: string;
  }>>(),
  // ─── Legal References ───
  primaryStatuteCitation: varchar("primaryStatuteCitation", { length: 256 }),
  primaryStatuteTitle: varchar("primaryStatuteTitle", { length: 512 }),
  relatedStatutes: jsonb("relatedStatutes").$type<Array<{
    citation: string;
    title: string;
    relevance: string;
  }>>(),
  // ─── What to Expect ───
  possibleOutcomes: jsonb("possibleOutcomes").$type<Array<{
    outcome: string;
    description: string;
    likelihood?: "common" | "possible" | "rare";
  }>>(),
  // ─── Practical Tips ───
  documentsNeeded: jsonb("documentsNeeded").$type<string[]>(),
  commonMistakes: jsonb("commonMistakes").$type<string[]>(),
  practicalTips: jsonb("practicalTips").$type<string[]>(),
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

export const unifiedResources = pgTable("unified_resources", {
  id: serial("id").primaryKey(),
  // ─── Identity ───
  sourceTable: varchar("sourceTable", { length: 64 }).notNull(), // registry_programs, enforcement_action_paths, legal_enforcement_records
  sourceId: varchar("sourceId", { length: 256 }).notNull(), // original row ID
  name: varchar("name", { length: 512 }).notNull(),
  description: text("description"),
  // ─── Resource Classification ───
  resourceType: varchar("resourceType", { length: 64 }).notNull(), // government_program, nonprofit, legal_aid, enforcement_path, hotline, online_tool, enforcement_record, grant
  // ─── Tagging: Domain + Need ───
  domain: varchar("domain", { length: 64 }).notNull(), // housing, employment, benefits, healthcare, family, etc.
  needTypes: jsonb("needTypes").$type<string[]>().notNull(), // rent_assistance, legal_representation, filing_help, food, utilities, etc.
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
  hardEligibility: jsonb("hardEligibility").$type<Array<{
    gate: string; // jurisdiction, income_threshold, citizenship, age, disability_status
    operator: "eq" | "in" | "lt" | "gt" | "exists";
    value: string | string[] | number;
    description: string;
  }>>(),
  softSignals: jsonb("softSignals").$type<Array<{
    signal: string; // domain_match, need_overlap, population_served, program_type
    weight: number; // 0.0 - 1.0
    matchValues: string[];
    description: string;
  }>>(),
  // ─── Pipeline Mapping ───
  matchingPipelineTypes: jsonb("matchingPipelineTypes").$type<string[]>().notNull(), // which intake pipeline types this resource matches
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

export const signalFlowLogs = pgTable("signal_flow_logs", {
  id: serial("id").primaryKey(),
  signalId: varchar("signal_id_sfl", { length: 64 }).notNull(), // FK to detected_signals.signal_id
  vectorPath: varchar("vector_path", { length: 512 }).notNull(), // e.g. "ingested_records → live_signals → sunam_gate → detected_signals"
  flowDensity: numeric("flow_density", { precision: 8, scale: 4 }).notNull(), // signal strength at this point
  visibilityMetadata: jsonb("visibility_metadata").$type<{
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

export const worldNodes = pgTable("world_nodes", {
  id: serial("id").primaryKey(),
  biomeType: varchar("biome_type", { length: 64 }).notNull(), // jurisdiction | agency | program | community | institution
  nodeName: varchar("node_name_wn", { length: 512 }).notNull(),
  // Coordinates: stored as lat/lng since MySQL POINT requires spatial index
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  // L10 Metadata Contract — the node carries this
  metadataL10: jsonb("metadata_l10").$type<{
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

export const claimValidationRules = pgTable("claim_validation_rules", {
  id: serial("id").primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 10 }).notNull(),
  claimType: varchar("claim_type", { length: 64 }).notNull(),
  elementName: varchar("element_name", { length: 128 }).notNull(),
  requiredEvidenceTypes: jsonb("required_evidence_types").$type<string[]>().notNull(),
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

export const remedyFeasibilityRules = pgTable("remedy_feasibility_rules", {
  id: serial("id").primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 10 }).notNull(),
  strategyType: varchar("strategy_type", { length: 64 }).notNull(),
  costRange: varchar("cost_range", { length: 64 }).notNull(),
  timeEstimate: varchar("time_estimate", { length: 128 }).notNull(),
  prerequisites: jsonb("prerequisites").$type<string[]>().notNull(),
  riskFlags: jsonb("risk_flags").$type<string[]>().notNull(),
  createdAt: bigint("created_at_rfr", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  index("idx_rfr_jurisdiction").on(table.jurisdiction),
  index("idx_rfr_strategy").on(table.strategyType),
  uniqueIndex("idx_rfr_unique").on(table.jurisdiction, table.strategyType),
]);

export type RemedyFeasibilityRule = typeof remedyFeasibilityRules.$inferSelect;
export type InsertRemedyFeasibilityRule = typeof remedyFeasibilityRules.$inferInsert;

export const caseState = pgTable("case_state", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  userId: integer("user_id").notNull(),
  proceduralPathId: integer("procedural_path_id"),
  proceduralPathLabel: varchar("procedural_path_label", { length: 256 }),
  remedyStrategyId: integer("remedy_strategy_id"),
  remedyStrategyLabel: varchar("remedy_strategy_label", { length: 256 }),
  claimType: varchar("claim_type_cs", { length: 64 }),
  jurisdiction: varchar("jurisdiction_cs", { length: 64 }),
  committedFindingIds: jsonb("committed_finding_ids").$type<number[]>().notNull().default([]),
  committedBarrierIds: jsonb("committed_barrier_ids").$type<number[]>().notNull().default([]),
  committedBenefitIds: jsonb("committed_benefit_ids").$type<number[]>().notNull().default([]),
  committedSignalIds: jsonb("committed_signal_ids").$type<number[]>().notNull().default([]),
  committedStatuteIds: jsonb("committed_statute_ids").$type<number[]>().notNull().default([]),
  committedFoiaIds: jsonb("committed_foia_ids").$type<number[]>().notNull().default([]),
  committedFilingIds: jsonb("committed_filing_ids").$type<number[]>().notNull().default([]),
  completenessScore: integer("completeness_score").notNull().default(0),
  completenessBreakdown: jsonb("completeness_breakdown").$type<{ missing: string[]; present: string[]; score: number }>(),
  computedDeadlines: jsonb("computed_deadlines").$type<Array<{ label: string; date: string; daysRemaining: number; critical: boolean }>>(),
  nextActions: jsonb("next_actions").$type<Array<{ label: string; type: string; priority: number; targetPage?: string }>>(),
  createdAt: bigint("created_at_cs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: bigint("updated_at_cs", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
}, (table) => [
  uniqueIndex("idx_case_state_case").on(table.caseId),
  index("idx_case_state_user").on(table.userId),
]);

export type CaseState = typeof caseState.$inferSelect;
export type InsertCaseState = typeof caseState.$inferInsert;

export const caseFlags = pgTable("case_flags", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  userId: integer("user_id").notNull(),
  type: pgEnum("case_flags_flag_type_enum", ["system", "user"])("flag_type").notNull().default("user"),
  location: varchar("location", { length: 128 }).notNull(),
  targetId: integer("target_id"),
  targetType: varchar("target_type", { length: 64 }),
  message: text("message").notNull(),
  status: pgEnum("case_flags_flag_status_enum", ["open", "resolved"])("flag_status").notNull().default("open"),
  areaName: varchar("area_name", { length: 256 }),
  state: varchar("state_code", { length: 10 }),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
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

export const foiaTrackerRequests = pgTable("foia_tracker_requests", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id"),
  userId: integer("user_id").notNull(),
  agencyName: varchar("agency_name", { length: 256 }).notNull(),
  agencyAddress: text("agency_address"),
  agencyEmail: varchar("agency_email", { length: 256 }),
  requestSubject: varchar("request_subject", { length: 512 }).notNull(),
  requestBody: text("request_body").notNull(),
  requestedRecords: text("requested_records"),
  status: pgEnum("foia_tracker_requests_foia_status_enum", ["draft", "sent", "acknowledged", "response_received", "appealed", "closed"])("foia_status").notNull().default("draft"),
  sentAt: bigint("sent_at", { mode: "number" }),
  sentMethod: pgEnum("foia_tracker_requests_sent_method_enum", ["email", "portal", "mail", "fax"])("sent_method"),
  sentTo: varchar("sent_to", { length: 512 }),
  acknowledgedAt: bigint("acknowledged_at", { mode: "number" }),
  responseReceivedAt: bigint("response_received_at", { mode: "number" }),
  responseNotes: text("response_notes"),
  responseDocumentUrl: varchar("response_document_url", { length: 1024 }),
  statutoryDeadlineDays: integer("statutory_deadline_days").default(20),
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
