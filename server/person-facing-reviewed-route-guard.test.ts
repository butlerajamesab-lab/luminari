import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./enforcement-action-paths-live-compat.ts", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260822001325_harden_reviewed_route_user_routable_allowlist_v2.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("person-facing reviewed dossier route guard", () => {
  it("consumes the governed user-routable projection rather than reparsing free-form statuses", () => {
    expect(source).toContain("from public.v_ui_intake_routing_v1");
    expect(source).toContain("and is_user_routable");
    expect(source).not.toContain("like '%verified%'");
    expect(source).not.toContain("not like '%unverified%'");
  });

  it("centralizes positive verification in an explicit fail-closed allowlist", () => {
    expect(migration).toContain("reviewed_route_verification_is_positive_v1");
    expect(migration).toContain("= any (array[");
    expect(migration).toContain("'VERIFIED'");
    expect(migration).toContain("unrecognized_verification_reference_only");
    expect(migration).toContain("and coalesce(r.filing_or_complaint_url,r.phone,r.email,r.website) is not null");
  });

  it("keeps the existing legacy-first compatibility boundary", () => {
    expect(source).toContain("if (legacy_paths.length > 0) return legacy_paths");
    expect(source).toContain("luminari_reviewed_pipeline_dossier_v1");
  });
});
