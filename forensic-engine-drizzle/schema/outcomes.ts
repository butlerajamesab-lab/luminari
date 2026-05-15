/**
 * Outcomes Domain Schema
 * Resolutions, exports, FOIA packets, evidence packets, case bundles
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const case_resolutions = sqliteTable("case_resolutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  resolution_type: text("resolution_type").notNull(), // approved, denied, settled, escalated, closed
  resolution_date: integer("resolution_date"),
  resolution_details: text("resolution_details"),
  remedy_applied: text("remedy_applied"),
  created_at: integer("created_at").notNull(),
});

export const statement_of_facts = sqliteTable("statement_of_facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  statement_text: text("statement_text").notNull(),
  statement_version: integer("statement_version").default(1),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at"),
});

export const foia_packets = sqliteTable("foia_packets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  packet_type: text("packet_type").notNull(), // records_request, appeal_package, complaint_bundle
  packet_content: text("packet_content"), // JSON references to documents and evidence
  generated_at: integer("generated_at").notNull(),
  exported_at: integer("exported_at"),
});

export const evidence_packets = sqliteTable("evidence_packets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  packet_name: text("packet_name"),
  evidence_list: text("evidence_list"), // JSON array of evidence ids
  packet_hash: text("packet_hash"),
  generated_at: integer("generated_at").notNull(),
});

export const case_bundles = sqliteTable("case_bundles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  bundle_type: text("bundle_type").notNull(), // complete, summary, appeal, foia
  bundle_content: text("bundle_content"), // JSON
  created_at: integer("created_at").notNull(),
  exported_at: integer("exported_at"),
});

export const export_history = sqliteTable("export_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  export_type: text("export_type").notNull(), // pdf, json, html, bundle
  export_format: text("export_format"),
  export_path: text("export_path"),
  exported_at: integer("exported_at").notNull(),
  exported_by: text("exported_by"),
});
