import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_sibling(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("Atlas stream bridge contract", () => {
  const adapter_source = read_sibling("../atlas-stream-adapter.ts");
  const scheduler_source = read_sibling("../scheduler.ts");

  it("preserves Atlas stream and event identities", () => {
    expect(adapter_source).toContain('.from("streams")');
    expect(adapter_source).toContain('.from("signal_events")');
    expect(adapter_source).toContain(
      'ON CONFLICT (stream_id, "offset") DO UPDATE SET',
    );
    expect(adapter_source).toContain("ATLAS_BRIDGE_CURSOR_NAME");
    expect(adapter_source).toContain("current_offset");
  });

  it("uses the existing cross-project Atlas credentials", () => {
    expect(adapter_source).toContain("ATLAS_SUPABASE_URL");
    expect(adapter_source).toContain("ATLAS_SUPABASE_SERVICE_ROLE_KEY");
    expect(adapter_source).toContain("ATLAS_SUPABASE_ANON_KEY");
  });

  it("creates PostgreSQL run identities without MySQL-only calls", () => {
    expect(adapter_source).toContain(".returning({ id: ingestRuns.id })");
    expect(adapter_source).not.toContain("$returningId");
    expect(adapter_source).not.toContain("onDuplicateKeyUpdate");
  });

  it("routes only explicitly declared adapter families", () => {
    expect(scheduler_source).toContain('adapterSource === "atlas_stream"');
    expect(scheduler_source).toContain("ingest_atlas_stream");
    expect(scheduler_source).toContain('adapterSource === "socrata"');
    expect(scheduler_source).toContain("Unsupported ingestion source");
    expect(scheduler_source).not.toContain(
      'const adapterSource = streamConfig?.source ?? "socrata"',
    );
  });

  it("does not run Lighthouse signal detection over Atlas-owned signals", () => {
    expect(scheduler_source).toContain(
      'if (adapterSource !== "atlas_stream")',
    );
    expect(scheduler_source).toContain(
      'postProcessingEngine = "atlas-stream-bridge"',
    );
  });

  it("contains no destructive synchronization operations", () => {
    expect(adapter_source).not.toMatch(/\bDELETE\b/i);
    expect(adapter_source).not.toMatch(/\bTRUNCATE\b/i);
    expect(adapter_source).not.toMatch(/\bDROP\b/i);
  });
});
