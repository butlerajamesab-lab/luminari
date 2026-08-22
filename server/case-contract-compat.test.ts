import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const facade = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const compat = readFileSync(new URL("./case-contract-compat.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260807053653_restore_case_identity_bridge_contract.sql", import.meta.url),
  "utf8",
);
const statusMigration = readFileSync(
  new URL("../supabase/migrations/20260822203000_lighthouse_case_status_canonical_default.sql", import.meta.url),
  "utf8",
);

describe("Lighthouse case identity compatibility", () => {
  it("preserves the legacy helper implementation and overrides only bounded case seams", () => {
    expect(facade).toContain('export * from "./db-legacy"');
    expect(facade).toContain('from "./case-contract-compat"');
    for (const name of [
      "createCase",
      "getCaseStats",
      "getCaseTimelineData",
      "getCaseNarrative",
      "upsertCaseNarrative",
    ]) {
      expect(facade).toContain(name);
    }
  });

  it("uses the explicit Intake Spine case identity bridge for UUID events", () => {
    expect(compat).toContain("public.case_identity_bridge");
    expect(compat).toContain("b.case_uuid = e.case_id");
    expect(compat).not.toContain("e.case_id = $1");
  });

  it("uses the live snake_case narrative contract rather than stale camel physical columns", () => {
    expect(compat).toContain("public.case_narratives");
    expect(compat).toContain("case_id, user_id, content, source_map, timeline_item_count");
    expect(compat).toContain("on conflict (case_id) do update");
    for (const stalePhysicalName of [
      '"caseId"',
      '"userId"',
      '"sourceMap"',
      '"timelineItemCount"',
      '"generatedAt"',
      '"updatedAt"',
    ]) {
      expect(compat).not.toContain(stalePhysicalName);
    }
  });

  it("initializes the canonical case lifecycle state in the case creation transaction", () => {
    expect(compat).toContain("description, status, domain");
    expect(compat).toContain("'active'");
    expect(statusMigration).toContain("alter column status set default 'active'");
    expect(statusMigration).toContain("l.is_primary is true");
    expect(statusMigration).toContain("l.link_type = 'primary_projection'");
  });

  it("backfills current cases and makes the bridge automatic for future cases", () => {
    expect(migration).toContain("insert into public.case_identity_bridge");
    expect(migration).toContain("from public.cases c");
    expect(migration).toContain("trg_cases_ensure_identity_bridge_v1");
    expect(migration).toContain("after insert on public.cases");
    expect(migration).toContain("ux_case_narratives_case_id");
  });
});
