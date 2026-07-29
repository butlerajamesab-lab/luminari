import fs from "node:fs";

function replace_once(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch marker: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const scheduler_path = "server/ingestion/scheduler.ts";
let scheduler = fs.readFileSync(scheduler_path, "utf8");
const partial_marker = "    // Step 2: Atlas owns its signal events. Only raw-source adapters run the\n";
const partial_block = `    const atlas_partial_failure = adapterSource === "atlas_stream" && result.recordsProcessed > 0 &&
      result.diagnostics?.outcomeClassification === "partial_failure";
    if (atlas_partial_failure) {
      console.warn(
        \`[Scheduler] Atlas bridge partially synchronized \${datasetId}: \${result.recordsProcessed} committed before failure\`,
      );
      return {
        success: false,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        signalsGenerated: result.signalsGenerated,
        errors: result.errors,
        runId: result.runId,
        diagnostics: result.diagnostics,
      };
    }

`;
if (!scheduler.includes("const atlas_partial_failure =")) {
  scheduler = replace_once(
    scheduler,
    partial_marker,
    partial_block + partial_marker,
    "Atlas partial-result scheduler branch",
  );
}
fs.writeFileSync(scheduler_path, scheduler);

const schema_path = "drizzle/schema.ts";
let schema = fs.readFileSync(schema_path, "utf8");
if (!schema.includes("uniqueIndex, primaryKey } from \"drizzle-orm/pg-core\"")) {
  schema = replace_once(
    schema,
    "char, index, uniqueIndex } from \"drizzle-orm/pg-core\";",
    "char, index, uniqueIndex, primaryKey } from \"drizzle-orm/pg-core\";",
    "primaryKey import",
  );
}

const cursors_before = `export const cursors = pgTable("cursors", {
  cursorId: text("cursor_id").notNull(),
  streamId: text("stream_id").notNull(),
  name: text("name").notNull(),
  currentOffset: bigint("current_offset", { mode: "number" }).default(sql\`0\`).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});`;
const cursors_after = `export const cursors = pgTable("cursors", {
  cursorId: text("cursor_id").primaryKey(),
  streamId: text("stream_id").notNull(),
  name: text("name").notNull(),
  currentOffset: bigint("current_offset", { mode: "number" }).default(sql\`0\`).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  streamNameUnique: uniqueIndex("cursors_stream_id_name_key").on(table.streamId, table.name),
}));`;
if (!schema.includes('uniqueIndex("cursors_stream_id_name_key")')) {
  schema = replace_once(schema, cursors_before, cursors_after, "cursor identities");
}

const events_before = `export const signalEvents = pgTable("signal_events", {
  streamId: text("stream_id").notNull(),
  offset: bigint("offset", { mode: "number" }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  signalType: text("signal_type").notNull(),
  spacetime: jsonb("spacetime").notNull(),
  provenance: jsonb("provenance").notNull(),
  payload: jsonb("payload").default(sql\`'{}'::jsonb\`).notNull(),
  sourceId: text("source_id").notNull(),
  jurisdictionId: text("jurisdiction_id").notNull(),
  moduleHint: text("module_hint").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
});`;
const events_after = `export const signalEvents = pgTable("signal_events", {
  streamId: text("stream_id").notNull(),
  offset: bigint("offset", { mode: "number" }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  signalType: text("signal_type").notNull(),
  spacetime: jsonb("spacetime").notNull(),
  provenance: jsonb("provenance").notNull(),
  payload: jsonb("payload").default(sql\`'{}'::jsonb\`).notNull(),
  sourceId: text("source_id").notNull(),
  jurisdictionId: text("jurisdiction_id").notNull(),
  moduleHint: text("module_hint").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  signalEventsPkey: primaryKey({
    columns: [table.streamId, table.offset],
    name: "signal_events_pkey",
  }),
}));`;
if (!schema.includes('name: "signal_events_pkey"')) {
  schema = replace_once(schema, events_before, events_after, "signal event identity");
}

if (!schema.includes('streamId: text("stream_id").primaryKey()')) {
  schema = replace_once(
    schema,
    `export const streams = pgTable("streams", {
  streamId: text("stream_id").notNull(),`,
    `export const streams = pgTable("streams", {
  streamId: text("stream_id").primaryKey(),`,
    "stream identity",
  );
}
fs.writeFileSync(schema_path, schema);

for (const obsolete of [
  "supabase/migrations/20260729144500_atlas_stream_identity_constraints.sql",
  "server/ingestion/__tests__/atlas-stream-identity-constraints-contract.test.ts",
]) {
  if (fs.existsSync(obsolete)) fs.rmSync(obsolete);
}

for (const temporary of [
  "scripts/apply-atlas-stream-review-fixes.mjs",
  ".github/workflows/atlas-stream-review-fix.yml",
]) {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
