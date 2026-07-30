import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const world_index_source = readFileSync(
  fileURLToPath(new URL("./world-index.ts", import.meta.url)),
  "utf8",
);

function source_between(start: string, end: string): string {
  const start_index = world_index_source.indexOf(start);
  const end_index = world_index_source.indexOf(end, start_index);
  expect(start_index).toBeGreaterThanOrEqual(0);
  expect(end_index).toBeGreaterThan(start_index);
  return world_index_source.slice(start_index, end_index);
}

describe("World Index public circulation contract", () => {
  it("admits canonical rows only after their explicit verification gates", () => {
    expect(world_index_source).toContain(
      "where e.promotion_status = 'promoted'",
    );
    expect(world_index_source).toContain(
      "and e.verification_status = 'verified'",
    );
    expect(world_index_source).not.toContain(
      "e.promotion_status in ('review_ready', 'promoted')",
    );

    const agencies = source_between(
      "async function loadAgencies",
      "async function loadWorkflows",
    );
    expect(agencies).toMatch(
      /from oversight_registry\s+where verification_status = 'verified'/,
    );
    expect(agencies).toMatch(
      /from escalation_registry\s+where verification_status = 'verified'/,
    );

    const workflows = source_between(
      "async function loadWorkflows",
      "async function loadSignals",
    );
    expect(workflows).toMatch(
      /from workflow_registry\s+where verification_status = 'verified'/,
    );
  });

  it("uses the current live remedy template column contract", () => {
    expect(world_index_source).toContain("template_body as template_text");
    expect(world_index_source).toContain("null::jsonb as metadata");
    expect(world_index_source).toContain("null::text as source_url");
    expect(world_index_source).not.toMatch(
      /select[^\n]*\btemplate_text\b[^\n]*\bmetadata\b[^\n]*\bsource_url\b/,
    );
  });

  it("circulates verified Atlas bridge signals without raw or case-scoped feeds", () => {
    const signals = source_between(
      "async function loadSignals",
      "async function buildRelationships",
    );

    expect(signals).toContain("from v_lighthouse_verified_legal_signals_v1");
    expect(signals).toContain("verification_status = 'verified'");
    expect(signals).toContain("signal_status = 'active'");
    expect(signals).toContain("generation_method = 'deterministic_rule'");
    expect(signals).toContain("signal_type <> 'stream_health_alert'");
    expect(signals).not.toMatch(/\bfrom detected_signals\b/);
    expect(signals).not.toMatch(/\bfrom signal_events\b/);
    expect(signals).not.toMatch(/\bfrom atlas_lighthouse_signal_bridge_v1\b/);
    expect(signals).not.toMatch(
      /\bfrom atlas_lighthouse_judicial_signal_bridge_v1\b/,
    );
    expect(signals).toMatch(
      /source_table:\s*['"]v_lighthouse_verified_legal_signals_v1['"]/,
    );
  });

  it("uses promoted jurisdiction assertions and verified signal jurisdictions", () => {
    const jurisdictions = source_between(
      "async function loadJurisdictions",
      "async function loadPrograms",
    );

    expect(jurisdictions).toContain("promotion_status = 'promoted'");
    expect(jurisdictions).toContain(
      "from v_lighthouse_verified_legal_signals_v1",
    );
    expect(jurisdictions).not.toContain(
      "select jurisdiction_id as jurisdiction from atlas_lighthouse_signal_bridge_v1",
    );
  });
});
