import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("Atlas stream PostgreSQL identity contract", () => {
  const schema = read("../../../drizzle/schema.ts");
  const migration = read(
    "../../../supabase/migrations/20260729143000_atlas_stream_registry_recovery.sql",
  );

  it("declares the stream primary identity in Drizzle", () => {
    const streams_start = schema.indexOf('export const streams = pgTable("streams"');
    const streams_end = schema.indexOf("export type Streams", streams_start);
    const definition = schema.slice(streams_start, streams_end);
    expect(definition).toContain('streamId: text("stream_id").primaryKey()');
  });

  it("declares the signal-event composite identity in Drizzle", () => {
    const events_start = schema.indexOf(
      'export const signalEvents = pgTable("signal_events"',
    );
    const events_end = schema.indexOf("export type SignalEvents", events_start);
    const definition = schema.slice(events_start, events_end);
    expect(definition).toContain('name: "signal_events_pkey"');
    expect(definition).toContain("table.streamId");
    expect(definition).toContain("table.offset");
  });

  it("declares the cursor primary and stream-name identities in Drizzle", () => {
    const cursors_start = schema.indexOf('export const cursors = pgTable("cursors"');
    const cursors_end = schema.indexOf("export type Cursors", cursors_start);
    const definition = schema.slice(cursors_start, cursors_end);
    expect(definition).toContain('cursorId: text("cursor_id").primaryKey()');
    expect(definition).toContain('uniqueIndex("cursors_stream_id_name_key")');
    expect(definition).toContain("table.streamId");
    expect(definition).toContain("table.name");
  });

  it("replays all bridge conflict targets without destructive DDL", () => {
    expect(migration).toContain("create unique index if not exists streams_pkey");
    expect(migration).toContain(
      "create unique index if not exists signal_events_pkey",
    );
    expect(migration).toContain(
      "create unique index if not exists cursors_stream_id_name_key",
    );
    expect(migration).not.toMatch(/\bdrop\b/i);
  });
});
