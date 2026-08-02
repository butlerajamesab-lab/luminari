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
  const client_source = read_sibling("../atlas-bridge-client.ts");
  const run_store_source = read_sibling("../atlas-ingest-run-store.ts");
  const scheduler_source = read_sibling("../scheduler.ts");
  const sequence_migration = read_sibling(
    "../../../supabase/migrations/20260729154229_ingest_runs_sequence_alignment.sql",
  );

  it("preserves Atlas stream and event identities", () => {
    expect(adapter_source).toContain("fetch_atlas_stream_definition");
    expect(adapter_source).toContain("fetch_atlas_signal_events");
    expect(adapter_source).toContain(
      'ON CONFLICT (stream_id, "offset") DO UPDATE SET',
    );
    expect(adapter_source).toContain("ATLAS_BRIDGE_CURSOR_NAME");
    expect(adapter_source).toContain("current_offset");
  });

  it("uses environment configuration first and Lighthouse Vault as fallback", () => {
    expect(client_source).toContain("ATLAS_SUPABASE_URL");
    expect(client_source).toContain("ATLAS_SUPABASE_SERVICE_ROLE_KEY");
    expect(client_source).toContain("ATLAS_SUPABASE_ANON_KEY");
    expect(client_source).toContain("get_atlas_bridge_runtime_config()");
  });

  it("reads Atlas only through native authenticated RPC requests", () => {
    expect(client_source).toContain("/rest/v1/rpc/${rpc_name}");
    expect(client_source).toContain("apikey: client.atlas_supabase_key");
    expect(client_source).toContain(
      "Authorization: `Bearer ${client.atlas_supabase_key}`",
    );
    expect(client_source).not.toContain("createClient");
    expect(client_source).not.toContain("SupabaseClient");
    expect(adapter_source).not.toContain('.from("streams")');
    expect(adapter_source).not.toContain('.from("signal_events")');
  });

  it("writes the ingest ledger through the live snake_case PostgreSQL contract", () => {
    for (const column of [
      "dataset_id_run",
      "start_time",
      "end_time",
      "records_processed",
      "records_inserted",
      "records_updated",
      "signals_generated",
      "ingest_status",
      "endpoint_attempted_run",
      "adapter_used_run",
    ]) {
      expect(run_store_source).toContain(column);
    }
    expect(run_store_source).toContain("returning id");
    expect(run_store_source).not.toContain("datasetId_run");
    expect(run_store_source).not.toContain('"startTime"');
    expect(run_store_source).not.toContain("$returningId");
    expect(adapter_source).toContain("create_atlas_ingest_run");
    expect(adapter_source).toContain("complete_atlas_ingest_run");
    expect(adapter_source).toContain("fail_atlas_ingest_run");
    expect(adapter_source).not.toContain("ingestRuns");
  });

  it("realigns preserved ingest-run identities without destructive DDL", () => {
    expect(sequence_migration).toContain(
      "pg_get_serial_sequence('public.ingest_runs', 'id')",
    );
    expect(sequence_migration).toContain(
      "perform setval(sequence_name::regclass, maximum_id, true)",
    );
    expect(sequence_migration).not.toMatch(/\bdelete\b/i);
    expect(sequence_migration).not.toMatch(/\btruncate\b/i);
    expect(sequence_migration).not.toMatch(/\bdrop\b/i);
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
