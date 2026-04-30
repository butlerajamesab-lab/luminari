/**
 * Extraction Domain Schema
 * Entities, events, timelines extracted from documents
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const entities = sqliteTable("entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  entity_type: text("entity_type").notNull(), // person, organization, location, agency, statute
  entity_name: text("entity_name").notNull(),
  entity_value: text("entity_value"),
  confidence: real("confidence"),
  first_mentioned_chunk: integer("first_mentioned_chunk"),
  extracted_at: integer("extracted_at").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  event_type: text("event_type").notNull(), // application, denial, appeal, hearing, decision
  event_date: integer("event_date"),
  event_description: text("event_description"),
  related_entities: text("related_entities"), // JSON array of entity ids
  source_chunk: integer("source_chunk"),
  extracted_at: integer("extracted_at").notNull(),
});

export const timelines = sqliteTable("timelines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  timeline_type: text("timeline_type").notNull(), // procedural, statutory, administrative
  event_sequence: text("event_sequence"), // JSON array of events in order
  created_at: integer("created_at").notNull(),
  last_updated: integer("last_updated").notNull(),
});

export const relationships = sqliteTable("relationships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  case_id: integer("case_id").notNull(),
  entity_1_id: integer("entity_1_id"),
  entity_2_id: integer("entity_2_id"),
  relationship_type: text("relationship_type").notNull(), // filed_by, denied_by, appealed_to, represented_by
  relationship_details: text("relationship_details"),
  extracted_at: integer("extracted_at").notNull(),
});
