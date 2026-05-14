/**
 * CDA Schema — Claim Denial Analysis
 *
 * UUID-based PostgreSQL schema (forward direction).
 * Matches the cda_runs, cda_documents, cda_quotes, cda_claim_ledger,
 * cda_denial_reasons, cda_policy_clauses, cda_comparison_matrix,
 * cda_evidence_gaps, cda_contradictions tables in Lighthouse Supabase.
 *
 * The older thin analytics tables (cda_analysis_runs, cda_anomalies, etc.)
 * are defined in schema.ts and serve a separate analytics purpose.
 */
import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── S0: CDA Runs ───
export const cdaRuns = pgTable("cda_runs", {
  id:                  uuid("id").defaultRandom().primaryKey(),
  caseId:              uuid("case_id"),
  userId:              integer("user_id"),
  policyDocId:         uuid("policy_doc_id"),
  denialDocId:         uuid("denial_doc_id"),
  claimSummaryDocId:   uuid("claim_summary_doc_id"),
  status:              text("status").notNull().default("created"),
  startedAt:           bigint("started_at", { mode: "number" }).notNull().default(sql`extract(epoch from now())::bigint * 1000`),
  completedAt:         bigint("completed_at", { mode: "number" }),
  endConditionMet:     boolean("end_condition_met"),
  unmetCriteria:       jsonb("unmet_criteria").$type<string[]>(),
  activeFailureFlags:  jsonb("active_failure_flags").$type<string[]>(),
  errorMessage:        text("error_message"),
  specVersion:         text("spec_version"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaRun = typeof cdaRuns.$inferSelect;
export type InsertCdaRun = typeof cdaRuns.$inferInsert;

// ─── S1: CDA Documents ───
export const cdaDocuments = pgTable("cda_documents", {
  id:                 uuid("id").defaultRandom().primaryKey(),
  runId:              uuid("run_id").notNull(),
  docType:            text("doc_type").notNull(),
  receivedDate:       text("received_date"),
  fileName:           text("file_name").notNull(),
  source:             text("source"),
  pageCount:          integer("page_count"),
  hash:               text("hash").notNull(),
  sourceDocumentId:   uuid("source_document_id"),
  classificationRule: text("classification_rule"),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaDocument = typeof cdaDocuments.$inferSelect;
export type InsertCdaDocument = typeof cdaDocuments.$inferInsert;

// ─── S2: CDA Quotes ───
export const cdaQuotes = pgTable("cda_quotes", {
  id:               uuid("id").defaultRandom().primaryKey(),
  runId:            uuid("run_id").notNull(),
  docId:            uuid("doc_id").notNull(),
  page:             integer("page"),
  locationHint:     text("location_hint"),
  quoteText:        text("quote_text").notNull(),
  categoryTag:      text("category_tag").notNull(),
  extractionMethod: text("extraction_method"),
  confidence:       text("confidence"),
  infoLayer:        text("info_layer"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaQuote = typeof cdaQuotes.$inferSelect;
export type InsertCdaQuote = typeof cdaQuotes.$inferInsert;

// ─── S3: CDA Claim Ledger ───
export const cdaClaimLedger = pgTable("cda_claim_ledger", {
  id:                    uuid("id").defaultRandom().primaryKey(),
  runId:                 uuid("run_id").notNull(),
  claimId:               text("claim_id"),
  policyNumber:          text("policy_number"),
  insuredName:           text("insured_name"),
  insurerName:           text("insurer_name"),
  lossDate:              text("loss_date"),
  denialDate:            text("denial_date"),
  coverageTypes:         jsonb("coverage_types").$type<string[]>(),
  claimedItems:          text("claimed_items"),
  claimedAmount:         text("claimed_amount"),
  paidAmount:            text("paid_amount"),
  communicationChannels: jsonb("communication_channels").$type<string[]>(),
  sourceQuotes:          jsonb("source_quotes").$type<Array<{ field: string; quoteId: string; label?: string }>>(),
  formatInferredFields:  jsonb("format_inferred_fields").$type<string[]>(),
  createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaClaimLedger = typeof cdaClaimLedger.$inferSelect;
export type InsertCdaClaimLedger = typeof cdaClaimLedger.$inferInsert;

// ─── S4: CDA Denial Reasons ───
export const cdaDenialReasons = pgTable("cda_denial_reasons", {
  id:                       uuid("id").defaultRandom().primaryKey(),
  runId:                    uuid("run_id").notNull(),
  claimId:                  text("claim_id"),
  reasonTextVerbatim:       text("reason_text_verbatim").notNull(),
  normalizedReasonCode:     text("normalized_reason_code").notNull(),
  citedPolicyRefsVerbatim:  text("cited_policy_refs_verbatim"),
  citedFactsVerbatim:       text("cited_facts_verbatim"),
  sourceQuoteIds:           jsonb("source_quote_ids").$type<string[]>(),
  infoLayer:                text("info_layer"),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaDenialReason = typeof cdaDenialReasons.$inferSelect;
export type InsertCdaDenialReason = typeof cdaDenialReasons.$inferInsert;

// ─── S5: CDA Policy Clauses ───
export const cdaPolicyClauses = pgTable("cda_policy_clauses", {
  id:                  uuid("id").defaultRandom().primaryKey(),
  runId:               uuid("run_id").notNull(),
  clauseTextVerbatim:  text("clause_text_verbatim").notNull(),
  sectionHeading:      text("section_heading"),
  clauseType:          text("clause_type").notNull(),
  definedTerms:        jsonb("defined_terms").$type<string[]>(),
  effectiveScopeNote:  text("effective_scope_note"),
  sourceQuoteIds:      jsonb("source_quote_ids").$type<string[]>(),
  infoLayer:           text("info_layer"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaPolicyClause = typeof cdaPolicyClauses.$inferSelect;
export type InsertCdaPolicyClause = typeof cdaPolicyClauses.$inferInsert;

// ─── S6: CDA Comparison Matrix ───
export const cdaComparisonMatrix = pgTable("cda_comparison_matrix", {
  id:                  uuid("id").defaultRandom().primaryKey(),
  runId:               uuid("run_id").notNull(),
  reasonId:            uuid("reason_id"),
  clauseId:            uuid("clause_id"),
  linkingBasis:        text("linking_basis").notNull(),
  matchType:           text("match_type"),
  mismatchType:        text("mismatch_type"),
  requiredEvidence:    text("required_evidence"),
  missingEvidence:     text("missing_evidence"),
  conflictEvidence:    text("conflict_evidence"),
  supportingQuoteIds:  jsonb("supporting_quote_ids").$type<string[]>(),
  notes:               text("notes"),
  resolutionStatus:    text("resolution_status"),
  resolutionNotes:     text("resolution_notes"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaComparisonRow = typeof cdaComparisonMatrix.$inferSelect;
export type InsertCdaComparisonRow = typeof cdaComparisonMatrix.$inferInsert;

// ─── S7: CDA Evidence Gaps ───
export const cdaEvidenceGaps = pgTable("cda_evidence_gaps", {
  id:               uuid("id").defaultRandom().primaryKey(),
  runId:            uuid("run_id").notNull(),
  gapType:          text("gap_type").notNull(),
  description:      text("description").notNull(),
  linkedReasonIds:  jsonb("linked_reason_ids").$type<string[]>(),
  linkedClauseIds:  jsonb("linked_clause_ids").$type<string[]>(),
  severity:         text("severity"),
  failureFlag:      text("failure_flag"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaEvidenceGap = typeof cdaEvidenceGaps.$inferSelect;
export type InsertCdaEvidenceGap = typeof cdaEvidenceGaps.$inferInsert;

// ─── S8: CDA Contradictions ───
export const cdaContradictions = pgTable("cda_contradictions", {
  id:               uuid("id").defaultRandom().primaryKey(),
  runId:            uuid("run_id").notNull(),
  conflictType:     text("conflict_type").notNull(),
  claimReference:   text("claim_reference"),
  denialReference:  text("denial_reference"),
  policyReference:  text("policy_reference"),
  explanation:      text("explanation").notNull(),
  linkedQuoteIds:   jsonb("linked_quote_ids").$type<string[]>(),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CdaContradiction = typeof cdaContradictions.$inferSelect;
export type InsertCdaContradiction = typeof cdaContradictions.$inferInsert;

// ─── Legacy export (used by cda-patterns.ts) ───
export const HEADING_OVERLAP_MAP: Record<string, string> = {};
