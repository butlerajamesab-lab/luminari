/**
 * Provenance Domain Schema
 * Source tracking, snapshots, quotes, evidence chains
 */

import { sqliteTable, text, integer, blob, primaryKey } from "drizzle-orm/sqlite-core";

export const corpus_snapshots = sqliteTable("corpus_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  snapshot_hash: text("snapshot_hash").notNull().unique(),
  snapshot_timestamp: integer("snapshot_timestamp").notNull(),
  document_count: integer("document_count").notNull(),
  total_chunks: integer("total_chunks").notNull(),
  metadata: text("metadata"), // JSON
});

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  document_id: integer("document_id").notNull(),
  chunk_id: integer("chunk_id"),
  quote_text: text("quote_text").notNull(),
  quote_start: integer("quote_start"),
  quote_end: integer("quote_end"),
  page_number: integer("page_number"),
  extracted_at: integer("extracted_at").notNull(),
});

export const quote_sources = sqliteTable("quote_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quote_id: integer("quote_id").notNull(),
  source_type: text("source_type").notNull(), // statute, case_law, regulation, agency_guidance
  source_reference: text("source_reference").notNull(),
  authority_level: text("authority_level"), // federal, state, local
  jurisdiction: text("jurisdiction"),
});

export const evidence_chain = sqliteTable("evidence_chain", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  evidence_id: integer("evidence_id"),
  chain_order: integer("chain_order").notNull(),
  evidence_type: text("evidence_type").notNull(), // document, quote, claim, finding
  evidence_reference: text("evidence_reference").notNull(),
  linked_to: integer("linked_to"), // parent evidence id
  created_at: integer("created_at").notNull(),
});

export const provenance_audit = sqliteTable("provenance_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id"),
  document_id: integer("document_id"),
  action: text("action").notNull(), // created, modified, linked, exported
  actor: text("actor"),
  timestamp: integer("timestamp").notNull(),
  details: text("details"), // JSON
});
