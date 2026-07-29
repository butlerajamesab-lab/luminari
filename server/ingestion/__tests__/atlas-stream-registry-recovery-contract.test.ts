import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260729143000_atlas_stream_registry_recovery.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Atlas stream registry recovery migration", () => {
  it("activates only declared Atlas signal-event mirrors", () => {
    expect(migration).toContain("parser_mode_dsr = 'atlas_signal_events'");
    expect(migration).toContain(
      "post_processing_engine_name_dsr = 'atlas_bridge_runtime'",
    );
    expect(migration).toContain("api_url_dsr like '/v1/streams/%/events'");
    expect(migration).toContain("source_dsr = 'atlas_stream'");
  });

  it("verifies exact unique index shapes before stream activation", () => {
    const verification = migration.indexOf("do $atlas_identity_contract$");
    const activation = migration.indexOf("with atlas_runtime_rows as");
    expect(verification).toBeGreaterThan(-1);
    expect(verification).toBeLessThan(activation);
    expect(migration).toContain("index_record.indisunique");
    expect(migration).toContain("index_record.indisvalid");
    expect(migration).toContain("index_record.indisready");
    expect(migration).toContain("index_record.indpred is null");
    expect(migration).toContain("index_record.indexprs is null");
    expect(migration).toContain("index_record.indnatts = index_record.indnkeyatts");
    expect(migration).toContain("array['stream_id']::text[]");
    expect(migration).toContain("array['stream_id', 'offset']::text[]");
    expect(migration).toContain("array['stream_id', 'name']::text[]");
    expect(migration).toContain("raise exception");
  });

  it("preserves the original upstream source before switching adapter family", () => {
    expect(migration).toContain("'Atlas upstream source: ' || runtime.source_dsr");
    expect(migration).toContain("coalesce(source_dsr, '') <> 'atlas_stream'");
  });

  it("clears false failure state without claiming an upstream producer success", () => {
    expect(migration).toContain("last_run_status_dsr = 'atlas_bridge_pending'");
    expect(migration).toContain("auto_disabled_dsr = false");
    expect(migration).toContain("consecutive_failures_dsr = 0");
    expect(migration).not.toContain("upstream_completed");
  });

  it("retires crossed-wire aliases while retaining their audit rows", () => {
    for (const streamId of [
      "ds_courtlistener",
      "ds_dol_wage_hour",
      "ds_eeoc_charges",
      "ds_hud_fheo",
      "ds_nlrb_cases",
      "ds_ssa_disability",
      "seattle_fire_911",
    ]) {
      expect(migration).toContain(`'${streamId}'`);
    }
    expect(migration).toContain("retired_superseded_by_atlas");
  });

  it("contains no destructive data-definition or row-removal operations", () => {
    expect(migration).not.toMatch(/\bdelete\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\b/i);
  });
});
