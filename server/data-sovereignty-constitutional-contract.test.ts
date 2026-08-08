import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Luminari data sovereignty constitutional contract", () => {
  it("preserves temporary custody, complete export, complete deletion, and non-reconstructive retention", () => {
    const contract = source(
      "docs/constitutional/LUMINARI_DATA_SOVEREIGNTY_CONTRACT_v1.md"
    );

    expect(contract).toContain(
      "Luminari holds user information in temporary custody, never ownership."
    );
    expect(contract).toContain(
      "every original source object unchanged"
    );
    expect(contract).toContain(
      "Deletion is a cross-platform governed operation, not a row delete."
    );
    expect(contract).toContain(
      "non-reconstructive generalized patterns and successful route structures"
    );
    expect(contract).toContain(
      "Tribe-controlled material may not be promoted"
    );
    expect(contract).toContain(
      "No platform is complete until this drill passes."
    );
  });

  it("keeps the inventory audit explicitly read-only and exposes the known Intake Spine deletion boundary", () => {
    const audit = source(
      "supabase/verification/20260808_data_sovereignty_inventory_audit.sql"
    );
    const contract = source(
      "docs/constitutional/LUMINARI_DATA_SOVEREIGNTY_CONTRACT_v1.md"
    );

    expect(audit).toContain("set local transaction_read_only = on;");
    expect(audit).toContain("storage_objects_table_exists");
    expect(audit).toContain("public.case_intake_links");
    expect(audit).toContain("public.intake_artifacts");
    expect(audit).toContain("public.intake_layer_runs");
    expect(audit.trimEnd()).toMatch(/rollback;$/);

    expect(contract).toContain(
      "deleting a legacy `cases` row cascades into `case_identity_bridge` and `case_intake_links` only"
    );
    expect(contract).toContain(
      "Database cascades also do not delete private Storage objects."
    );
  });
});
