import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const replay_source = read_repo_file(
  "../supabase/migrations/20260806042000_signal_architecture_pull_through_v1.sql",
);
const live_receipt = read_repo_file(
  "../supabase/migrations/20260806043149_signal_architecture_pull_through_v1.sql",
);
const parity = read_repo_file("../scripts/audit-supabase-migration-ledger-parity.py");
const production_receipts = read_repo_file(
  "../supabase/verification/production_migration_receipts_20260829.tsv",
);

describe("signal pull-through migration ledger parity", () => {
  it("retains one replayable implementation", () => {
    expect(replay_source).toContain("create table if not exists public.signal_domain3_source_classification_v1");
    expect(replay_source).toContain("get_signal_pull_through_snapshot_v1");
  });

  it("records the API-assigned live version as an explicit no-op receipt", () => {
    expect(live_receipt).toContain("20260806042000_signal_architecture_pull_through_v1.sql");
    expect(live_receipt).toContain("intentional no-op on fresh replay");
    expect(live_receipt).toContain("select 1;");
    expect(live_receipt).not.toMatch(/create\s+(table|or\s+replace\s+view|or\s+replace\s+function)/i);
  });

  it("requires both source and live ledger versions", () => {
    expect(parity).toContain("PRODUCTION_RECEIPTS");
    expect(production_receipts).toContain(
      "20260806042000\tsignal_architecture_pull_through_v1\t",
    );
    expect(production_receipts).toContain(
      "20260806043149\tsignal_architecture_pull_through_v1\t",
    );
  });
});
