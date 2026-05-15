/**
 * Intake Domain Schema
 * Cases, documents, document versions, chunks, metadata
 */

import { sqliteTable, text, integer, real, blob, primaryKey } from "drizzle-orm/sqlite-core";

export const cases = sqliteTable("cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_number: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  jurisdiction: text("jurisdiction").notNull(),
  status: text("status").notNull().default("open"), // open, closed, escalated
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  snapshot_hash: text("snapshot_hash"),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  document_name: text("document_name").notNull(),
  document_type: text("document_type").notNull(), // pdf, docx, html, text, image
  file_path: text("file_path"),
  file_size: integer("file_size"),
  mime_type: text("mime_type"),
  upload_timestamp: integer("upload_timestamp").notNull(),
  provenance_id: text("provenance_id"),
});

export const document_versions = sqliteTable("document_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  document_id: integer("document_id").notNull(),
  version_number: integer("version_number").notNull(),
  version_hash: text("version_hash").notNull(),
  created_at: integer("created_at").notNull(),
});

export const document_chunks = sqliteTable("document_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  document_id: integer("document_id").notNull(),
  chunk_number: integer("chunk_number").notNull(),
  chunk_text: text("chunk_text").notNull(),
  chunk_type: text("chunk_type"), // paragraph, heading, table, list, quote
  page_number: integer("page_number"),
  char_offset: integer("char_offset"),
  char_length: integer("char_length"),
});

export const document_metadata = sqliteTable("document_metadata", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  document_id: integer("document_id").notNull(),
  metadata_key: text("metadata_key").notNull(),
  metadata_value: text("metadata_value"),
  created_at: integer("created_at").notNull(),
});
