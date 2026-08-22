import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./enforcement-action-paths-live-compat.ts", import.meta.url)),
  "utf8",
);

describe("person-facing reviewed dossier route guard", () => {
  it("requires a verified, non-partial, non-unverified reviewed route", () => {
    expect(source).toContain("like '%verified%'");
    expect(source).toContain("not like '%unverified%'");
    expect(source).toContain("not like '%partial%'");
  });

  it("requires a real access point before creating a person-facing reviewed action path", () => {
    expect(source).toContain("coalesce(filing_or_complaint_url, phone, email, website) is not null");
  });

  it("keeps the existing legacy-first compatibility boundary", () => {
    expect(source).toContain("if (legacy_paths.length > 0) return legacy_paths");
    expect(source).toContain("luminari_reviewed_pipeline_dossier_v1");
  });
});
