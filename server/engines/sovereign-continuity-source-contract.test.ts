import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const sunam_executor = read("./sunam-executor.ts");
const admin_control = read("./admin-sovereign-control.ts");
const executor_service = read("./executor-service.ts");
const root_router = read("../routers.ts");
const governance_dashboard = read("../../client/src/pages/GovernanceDashboard.tsx");
const verify_page = read("../../client/src/pages/Verify.tsx");
const governance_log = read("../governance-log.ts");
const snapshot_migration = read(
  "../../supabase/migrations/20260727120500_governance_snapshots.sql",
);

describe("Sovereign Continuity source contract", () => {
  it("routes every admin receipt through the PostgreSQL ledger adapter", () => {
    expect(sunam_executor).toContain("write_admin_change_log");
    expect(admin_control).toContain("write_admin_change_log");
    expect(executor_service).toContain("write_admin_change_log");
    expect(sunam_executor).not.toContain("db.insert(adminChangeLog)");
    expect(admin_control).not.toContain("db.insert(adminChangeLog)");
    expect(executor_service).not.toContain("db.insert(adminChangeLog)");
  });

  it("contains no MySQL schema inspection drift", () => {
    expect(admin_control).toContain("list_sovereign_tables");
    expect(admin_control).toContain("inspect_sovereign_table");
    expect(admin_control).not.toContain("DESCRIBE `");
    expect(admin_control).not.toContain("FROM `");
    expect(admin_control).not.toContain("result[0] as unknown as any[]");
  });

  it("preserves legacy governance while mounting constitutional governance separately", () => {
    expect(root_router).toContain("constitutionalGovernanceRouter");
    expect(root_router).toContain(
      "constitutionalGovernance: constitutionalGovernanceRouter",
    );
    expect(root_router).toContain("governance: governanceRouter");
    expect(governance_dashboard).toContain("trpc.constitutionalGovernance");
    expect(verify_page).toContain("trpc.constitutionalGovernance");
    expect(governance_dashboard).not.toContain("trpc.governance.");
    expect(verify_page).not.toContain("trpc.governance.");
  });

  it("creates and returns PostgreSQL governance snapshot receipts", () => {
    expect(snapshot_migration).toContain(
      "create table if not exists public.governance_snapshots",
    );
    expect(governance_log).toContain(
      ".returning({ id: governanceSnapshots.id })",
    );
    expect(governance_log).not.toContain("result.insertId");
  });
});
