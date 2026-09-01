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
const supersessionMigration = [
  "20260901072811_civic_genome_temporal_supersession_v3_foundation.sql",
  "20260901073614_civic_genome_temporal_supersession_v3_batch_scope.sql",
  "20260901074007_civic_genome_temporal_supersession_v3_linear_predecessors.sql",
  "20260901074016_civic_genome_temporal_supersession_v3_backfill_1_of_8.sql",
  "20260901074126_civic_genome_temporal_supersession_v3_backfill_2_of_8.sql",
  "20260901074203_civic_genome_temporal_supersession_v3_backfill_3_of_8.sql",
  "20260901074241_civic_genome_temporal_supersession_v3_backfill_4_of_8.sql",
  "20260901074319_civic_genome_temporal_supersession_v3_backfill_5_of_8.sql",
  "20260901074350_civic_genome_temporal_supersession_v3_backfill_6_of_8.sql",
  "20260901074412_civic_genome_temporal_supersession_v3_backfill_7_of_8.sql",
  "20260901074426_civic_genome_temporal_supersession_v3_backfill_8_of_8.sql",
  "20260901074437_civic_genome_temporal_supersession_v3_handoff.sql",
  "20260901074445_civic_genome_temporal_supersession_v3_activation.sql",
  "20260901075857_civic_genome_temporal_supersession_v3_lint_safe_sync.sql",
  "20260901080637_civic_genome_temporal_supersession_v3_edge_cases.sql",
]
  .map((filename) =>
    readFileSync(join(root, "supabase", "migrations", filename), "utf8"),
  )
  .join("\n");
const supersessionVerification = readFileSync(
  join(
    root,
    "supabase",
    "verification",
    "20260901074445_civic_genome_temporal_supersession_v3.verify.sql",
  ),
  "utf8",
);
const lintSafeSyncMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260901075857_civic_genome_temporal_supersession_v3_lint_safe_sync.sql",
  ),
  "utf8",
);
const edgeCaseMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260901080637_civic_genome_temporal_supersession_v3_edge_cases.sql",
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

  it("supersedes corrected or deleted source actions without erasing history", () => {
    expect(supersessionMigration).toContain(
      "civic_genome_lifecycle_source_revision_v3",
    );
    expect(supersessionMigration).toContain("supersedes_lifecycle_event_id");
    expect(supersessionMigration).toContain("'source_tombstone'");
    expect(supersessionMigration).toContain(
      "v_civic_genome_lifecycle_event_current_v3",
    );
    expect(supersessionMigration).toContain(
      "v_civic_genome_lifecycle_event_history_v3",
    );
    expect(supersessionMigration).toContain("current.source_event_keys");
    expect(supersessionVerification).toContain(
      "superseded effective-date row remained current",
    );
    expect(supersessionVerification).toContain(
      "deleted source action did not receive a tombstone",
    );
    expect(supersessionVerification).toContain(
      "original immutable event was not reactivated by source revision",
    );
    expect(lintSafeSyncMigration).not.toContain(
      "pg_temp.civic_genome_current_history_work_v3",
    );
    expect(lintSafeSyncMigration).toContain("replacement_predecessor");
    expect(edgeCaseMigration).toContain("stable_event");
    expect(edgeCaseMigration).toContain("anchor_segment");
    expect(edgeCaseMigration).toContain(
      "left join public.v_civic_genome_lifecycle_event_current_v3",
    );
    expect(edgeCaseMigration).toContain(
      "alter column current_state_position drop not null",
    );
    expect(supersessionVerification).toContain(
      "ordinal shift linked a correction to the wrong predecessor",
    );
    expect(supersessionVerification).toContain(
      "empty current revision removed the bill facts row",
    );
  });

  it("exports only correction-aware current events while retaining receipts", () => {
    expect(exportRoute).toContain("list_genome_lifecycle_event_history_v3");
    expect(exportRoute).toContain("lifecycle_event_history");
    expect(exportRoute).toContain("lifecycle_supersession_receipts");
    expect(exportRoute).toContain("superseded rows and tombstones");
  });
});
