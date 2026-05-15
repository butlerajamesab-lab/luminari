/**
 * CDA v1.0-PATCH3 — Claim Denial Analysis Module Schema
 *
 * Sealed subsystem. These tables implement S1–S8 from the CDA Model Layer Spec
 * plus a cda_runs table for orchestration. All tables are prefixed with `cda_`
 * to isolate the module namespace from the existing forensic engine schema.
 *
 * Every derived row stores source_quote_id references for audit chain enforcement.
 * No field exists that cannot be traced to a quote_id or [user-entered] label.
 */

import {
  int, mysqlEnum, mysqlTable, text, mediumtext, varchar, bigint,
  json, index, decimal, boolean,
} from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════════════════════════════════════
// CDA Run Table — Orchestration envelope
// ═══════════════════════════════════════════════════════════════════════

export const cdaRuns = mysqlTable("cda_runs", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 32 }).notNull().default("CDA"),
  specVersion: varchar("specVersion", { length: 32 }).notNull().default("1.0-PATCH3"),
  status: varchar("status", { length: 64 }).default("created").notNull(),
  // Input document references (foreign keys to the main documents table)
  policyDocId: int("policyDocId"),       // I1
  denialDocId: int("denialDocId"),       // I2
  claimSummaryDocId: int("claimSummaryDocId"), // I3
  // End condition
  endConditionMet: boolean("endConditionMet").default(false).notNull(),
  unmetCriteria: json("unmetCriteria"),  // string[] of unmet criterion descriptions
  // Failure flags active for this run
  activeFailureFlags: json("activeFailureFlags"), // string[] e.g. ["F1", "F2"]
  // Timestamps
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  errorMessage: text("errorMessage"),
}, (table) => [
  index("idx_cda_runs_case").on(table.caseId),
  index("idx_cda_runs_status").on(table.status),
]);

export type CdaRun = typeof cdaRuns.$inferSelect;
export type InsertCdaRun = typeof cdaRuns.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// S1: Document Index
// ═══════════════════════════════════════════════════════════════════════

export const cdaDocuments = mysqlTable("cda_documents", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  docType: mysqlEnum("docType", [
    "policy", "denial", "claim_summary", "eob", "invoice",
    "correspondence", "adjuster_notes", "supporting_material", "other",
  ]).notNull(),
  receivedDate: varchar("receivedDate", { length: 32 }),  // ISO-8601 or null
  fileName: varchar("fileName", { length: 512 }).notNull(),
  source: mysqlEnum("source", ["insured", "insurer", "third_party", "unknown"]).default("unknown").notNull(),
  pageCount: int("pageCount").default(0).notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),  // SHA-256
  // Link to main documents table for content access
  sourceDocumentId: int("sourceDocumentId"),
  classificationRule: text("classificationRule"),  // T1 audit: which rule triggered
}, (table) => [
  index("idx_cda_docs_run").on(table.runId),
  index("idx_cda_docs_type").on(table.docType),
]);

export type CdaDocument = typeof cdaDocuments.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S2: Quote Ledger
// ═══════════════════════════════════════════════════════════════════════

export const QUOTE_CATEGORY_TAGS = [
  "policy_clause", "denial_reason", "denial_supporting_fact",
  "claim_fact", "date_reference", "amount_reference", "party_reference",
  "declarations_field", "commitment", "representation", "other",
] as const;

export const EXTRACTION_METHODS = ["manual", "ocr", "digital_text"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const cdaQuotes = mysqlTable("cda_quotes", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  docId: int("docId").notNull(),  // FK → cda_documents.id
  page: int("page"),  // ≥1 or null
  locationHint: text("locationHint"),  // section heading, paragraph number
  quoteText: text("quoteText").notNull(),  // verbatim, no paraphrasing
  categoryTag: mysqlEnum("categoryTag", [
    "policy_clause", "denial_reason", "denial_supporting_fact",
    "claim_fact", "date_reference", "amount_reference", "party_reference",
    "declarations_field", "commitment", "representation", "other",
  ]).notNull(),
  extractionMethod: mysqlEnum("extractionMethod", ["manual", "ocr", "digital_text"]).default("digital_text").notNull(),
  confidence: mysqlEnum("confidence", ["high", "medium", "low"]).default("high").notNull(),
  // Information layer classification (L1-L4)
  infoLayer: mysqlEnum("infoLayer", ["L1", "L2", "L3", "L4"]).default("L1").notNull(),
}, (table) => [
  index("idx_cda_quotes_run").on(table.runId),
  index("idx_cda_quotes_doc").on(table.docId),
  index("idx_cda_quotes_tag").on(table.categoryTag),
]);

export type CdaQuote = typeof cdaQuotes.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S3: Claim Ledger (single row per run)
// ═══════════════════════════════════════════════════════════════════════

export const cdaClaimLedger = mysqlTable("cda_claim_ledger", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  // Canonical entities E1-E7
  claimId: varchar("claimId", { length: 256 }),          // E1
  policyNumber: varchar("policyNumber", { length: 256 }), // E2
  insuredName: varchar("insuredName", { length: 512 }),    // E3
  insurerName: varchar("insurerName", { length: 512 }),    // E4
  lossDate: varchar("lossDate", { length: 64 }),           // E5 ISO-8601
  denialDate: varchar("denialDate", { length: 64 }),       // E6 ISO-8601
  coverageTypes: json("coverageTypes"),                    // E7 string[] or null
  // Claim details
  claimedItems: text("claimedItems"),
  claimedAmount: decimal("claimedAmount", { precision: 12, scale: 2 }),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }),
  communicationChannels: json("communicationChannels"),     // string[]
  // Audit chain
  sourceQuotes: json("sourceQuotes"),  // { field: string, quoteId: number, label?: string }[]
  // Info layer for format-inferred fields
  formatInferredFields: json("formatInferredFields"),  // string[] of field names inferred from format
}, (table) => [
  index("idx_cda_claim_run").on(table.runId),
]);

export type CdaClaimLedger = typeof cdaClaimLedger.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S4: Denial Reason Ledger
// ═══════════════════════════════════════════════════════════════════════

export const NORMALIZED_REASON_CODES = [
  "exclusion_applies", "condition_not_met", "coverage_not_in_effect",
  "policy_lapsed", "late_filing", "insufficient_documentation",
  "pre_existing_condition", "not_covered_peril", "liability_disputed",
  "amount_disputed", "duplicate_claim", "misrepresentation_alleged",
  "cooperation_clause", "other",
] as const;

export type NormalizedReasonCode = typeof NORMALIZED_REASON_CODES[number];

export const cdaDenialReasons = mysqlTable("cda_denial_reasons", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  claimId: varchar("claimId", { length: 256 }),  // FK → S3.claimId
  reasonTextVerbatim: mediumtext("reasonTextVerbatim").notNull(),
  normalizedReasonCode: mysqlEnum("normalizedReasonCode", [
    "exclusion_applies", "condition_not_met", "coverage_not_in_effect",
    "medical_necessity_denied",
    "policy_lapsed", "late_filing", "insufficient_documentation",
    "pre_existing_condition", "not_covered_peril", "liability_disputed",
    "amount_disputed", "duplicate_claim", "misrepresentation_alleged",
    "cooperation_clause", "other",
  ]).notNull(),
  citedPolicyRefsVerbatim: mediumtext("citedPolicyRefsVerbatim"),
  citedFactsVerbatim: mediumtext("citedFactsVerbatim"),
  sourceQuoteIds: json("sourceQuoteIds"),  // number[]
  infoLayer: mysqlEnum("reasonInfoLayer", ["L1", "L2"]).default("L1").notNull(),
}, (table) => [
  index("idx_cda_reasons_run").on(table.runId),
  index("idx_cda_reasons_code").on(table.normalizedReasonCode),
]);

export type CdaDenialReason = typeof cdaDenialReasons.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S5: Policy Clause Ledger
// ═══════════════════════════════════════════════════════════════════════

export const CLAUSE_TYPES = [
  "coverage_grant", "exclusion", "condition", "definition",
  "limitation", "endorsement", "rider", "other",
] as const;

export type ClauseType = typeof CLAUSE_TYPES[number];

export const cdaPolicyClauses = mysqlTable("cda_policy_clauses", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  clauseTextVerbatim: text("clauseTextVerbatim").notNull(),
  sectionHeading: varchar("sectionHeading", { length: 512 }),
  clauseType: mysqlEnum("clauseType", [
    "coverage_grant", "exclusion", "condition", "definition",
    "limitation", "endorsement", "rider", "other",
  ]).notNull(),
  definedTerms: json("definedTerms"),  // string[]
  effectiveScopeNote: text("effectiveScopeNote"),
  sourceQuoteIds: json("sourceQuoteIds"),  // number[]
  infoLayer: mysqlEnum("clauseInfoLayer", ["L1", "L2"]).default("L1").notNull(),
}, (table) => [
  index("idx_cda_clauses_run").on(table.runId),
  index("idx_cda_clauses_type").on(table.clauseType),
]);

export type CdaPolicyClause = typeof cdaPolicyClauses.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S6: Comparison Matrix
// ═══════════════════════════════════════════════════════════════════════

export const LINKING_BASES = [
  "explicit_citation", "verbatim_language_overlap",
  "defined_term_overlap", "heading_overlap", "none",
] as const;

export const MATCH_TYPES = [
  "supported", "partially_supported", "unsupported",
  "ambiguous", "not_assessable",
] as const;

export const MISMATCH_TYPES = [
  "reason_contradicts_clause", "reason_misquotes_clause",
  "reason_cites_inapplicable_clause", "clause_supports_coverage",
  "no_clause_found", "insufficient_reason_detail", "null",
] as const;

export const cdaComparisonMatrix = mysqlTable("cda_comparison_matrix", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  reasonId: int("reasonId").notNull(),  // FK → cda_denial_reasons.id
  clauseId: int("clauseId"),            // FK → cda_policy_clauses.id, nullable
  linkingBasis: mysqlEnum("linkingBasis", [
    "explicit_citation", "verbatim_language_overlap",
    "defined_term_overlap", "heading_overlap", "none",
  ]).notNull(),
  // T7 fields — null until T7 runs
  matchType: mysqlEnum("matchType", [
    "supported", "partially_supported", "unsupported",
    "ambiguous", "not_assessable",
  ]),
  mismatchType: mysqlEnum("mismatchType", [
    "reason_contradicts_clause", "reason_misquotes_clause",
    "reason_cites_inapplicable_clause", "clause_supports_coverage",
    "no_clause_found", "insufficient_reason_detail", "null",
  ]),
  requiredEvidence: text("requiredEvidence"),
  missingEvidence: text("missingEvidence"),
  conflictEvidence: text("conflictEvidence"),
  supportingQuoteIds: json("supportingQuoteIds"),  // number[]
  resolutionMethod: mysqlEnum("resolutionMethod", [
    "deterministic", "llm_assisted", "fallback_ambiguous",
  ]),
  t7TranscriptId: varchar("t7TranscriptId", { length: 64 }),  // links to T7 transcript in run bundle
  notes: text("notes"),  // human-entered, L4
}, (table) => [
  index("idx_cda_matrix_run").on(table.runId),
  index("idx_cda_matrix_reason").on(table.reasonId),
  index("idx_cda_matrix_clause").on(table.clauseId),
  index("idx_cda_matrix_match").on(table.matchType),
]);

export type CdaComparisonRow = typeof cdaComparisonMatrix.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S7: Evidence Gap Register
// ═══════════════════════════════════════════════════════════════════════

export const GAP_TYPES = [
  "missing_document", "missing_entity", "missing_clause",
  "insufficient_reason", "missing_evidence", "illegible_source",
  "ambiguous_language",
] as const;

export const PRIORITY_LEVELS = ["critical", "important", "supplementary"] as const;

export const cdaEvidenceGaps = mysqlTable("cda_evidence_gaps", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  gapType: mysqlEnum("gapType", [
    "missing_document", "missing_entity", "missing_clause",
    "insufficient_reason", "missing_evidence", "illegible_source",
    "ambiguous_language",
  ]).notNull(),
  requiredItem: text("requiredItem").notNull(),
  whyRequired: text("whyRequired").notNull(),
  howToObtain: text("howToObtain"),
  priorityLevel: mysqlEnum("priorityLevel", ["critical", "important", "supplementary"]).notNull(),
  linkedReasonIds: json("linkedReasonIds"),       // number[]
  linkedTransformation: varchar("linkedTransformation", { length: 16 }),  // e.g. "T5", "T6"
  // Failure flag reference
  failureFlag: varchar("failureFlag", { length: 8 }),  // e.g. "F1", "F2", "F3"
}, (table) => [
  index("idx_cda_gaps_run").on(table.runId),
  index("idx_cda_gaps_type").on(table.gapType),
  index("idx_cda_gaps_priority").on(table.priorityLevel),
]);

export type CdaEvidenceGap = typeof cdaEvidenceGaps.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// S8: Contradiction Register
// ═══════════════════════════════════════════════════════════════════════

export const CONFLICT_TYPES = [
  "date_conflict", "amount_conflict", "fact_conflict",
  "coverage_characterization_conflict", "party_identity_conflict", "other",
] as const;

export const cdaContradictions = mysqlTable("cda_contradictions", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  conflictType: mysqlEnum("conflictType", [
    "date_conflict", "amount_conflict", "fact_conflict",
    "coverage_characterization_conflict", "party_identity_conflict", "other",
  ]).notNull(),
  claimReference: text("claimReference"),
  denialReference: text("denialReference"),
  policyReference: text("policyReference"),
  explanation: text("explanation").notNull(),  // factual, no interpretation
  linkedQuoteIds: json("linkedQuoteIds"),  // number[] — minimum 2 from different doc_ids
}, (table) => [
  index("idx_cda_conflicts_run").on(table.runId),
  index("idx_cda_conflicts_type").on(table.conflictType),
]);

export type CdaContradiction = typeof cdaContradictions.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════
// Heading Overlap Mapping Table (PATCH3)
// Deterministic normalized_reason_code → clause_type(s) mapping
// ═══════════════════════════════════════════════════════════════════════

export const HEADING_OVERLAP_MAP: Record<string, string[] | null> = {
  exclusion_applies: ["exclusion"],
  condition_not_met: ["condition"],
  coverage_not_in_effect: ["coverage_grant"],
  medical_necessity_denied: ["coverage_grant", "condition"],
  policy_lapsed: ["coverage_grant"],
  late_filing: ["condition"],
  insufficient_documentation: ["condition"],
  pre_existing_condition: ["exclusion"],
  not_covered_peril: ["coverage_grant"],
  liability_disputed: ["coverage_grant"],
  amount_disputed: ["coverage_grant", "limitation"],
  duplicate_claim: null,  // [no mapping]
  misrepresentation_alleged: ["condition"],
  cooperation_clause: ["condition"],
  other: null,  // [no mapping]
};
