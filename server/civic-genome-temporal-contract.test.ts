import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260901065442_civic_genome_event_time_chronology_v2.sql",
  ),
  "utf8",
);
const verification = readFileSync(
  join(
    root,
    "supabase",
    "verification",
    "20260901065442_civic_genome_event_time_chronology_v2.verify.sql",
  ),
  "utf8",
);
const projection = readFileSync(
  join(root, "server", "civic-genome-projection.ts"),
  "utf8",
);
const resolution = readFileSync(
  join(root, "server", "civic-genome-family-resolution.ts"),
  "utf8",
);
const exportRoute = readFileSync(
  join(root, "server", "routes", "civic-genome-export-router.ts"),
  "utf8",
);
const humanReport = readFileSync(
  join(root, "server", "civic-genome-human-report.ts"),
  "utf8",
);

describe("Civic Genome event-time chronology v2", () => {
  it("separates legal, effective, observation, and processing clocks", () => {
    expect(migration).toContain("valid_at timestamptz not null");
    expect(migration).toContain("effective_at timestamptz");
    expect(migration).toContain("observed_at timestamptz not null");
    expect(migration).toContain("'chronology_basis', 'source_event_time'");
    expect(migration).toContain("civic_genome_family_momentum_event_time_v2");
    expect(migration).toContain("p_observed_as_of timestamptz default now()");
  });

  it("makes source lifecycle and reconciliation receipts append-only", () => {
    expect(migration).toContain("civic_genome_lifecycle_event_v2_append_only");
    expect(migration).toContain(
      "civic_genome_lifecycle_event_v2_reject_truncate",
    );
    expect(migration).toContain(
      "civic_genome_temporal_reconciliation_append_only",
    );
    expect(migration).toContain("on conflict (source_event_key) do nothing");
    expect(verification).toContain(
      "exact lifecycle replay duplicated append-only history",
    );
    expect(verification).toContain("lifecycle history mutation was accepted");
  });

  it("stops producing mutable receipt-day momentum as canonical history", () => {
    expect(projection).not.toContain(
      "insert into public.family_momentum_snapshot",
    );
    expect(resolution).not.toContain(
      "insert into public.family_momentum_snapshot",
    );
    expect(migration).toContain("Legacy v1 receipt-time status snapshots");
  });

  it("preserves legacy evidence while exporting event-time chronology as canonical", () => {
    expect(exportRoute).toContain("bill_temporal_facts: temporal_facts");
    expect(exportRoute).toContain("legacy_projection_events: legacy_events");
    expect(exportRoute).toContain(
      "legacy_observation_snapshots: legacy_momentum",
    );
    expect(exportRoute).toContain('chronology_basis: "legacy_mixed_time"');
    expect(exportRoute).toContain(
      'chronology_basis: "observation_time_legacy"',
    );
  });

  it("labels legal, observation, and extraction dates explicitly in human reports", () => {
    expect(humanReport).toContain("Legal event time");
    expect(humanReport).toContain("Observed by Lighthouse");
    expect(humanReport).toContain("Run dates below are processing receipts");
    expect(humanReport).toContain("Last legislative action");
    expect(humanReport).toContain("Effective");
    expect(humanReport).toContain("Last observed");
  });
});
