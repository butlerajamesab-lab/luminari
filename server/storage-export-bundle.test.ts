import { describe, expect, it } from "vitest";
import { export_bundle_signed_url } from "./storage";

describe("export bundle storage", () => {
  it("only signs keys in the private export bucket, never the case-document bucket", async () => {
    await expect(export_bundle_signed_url("supabase://case-documents/cases/1/documents/a.pdf"))
      .rejects.toThrow("unexpected bucket: case-documents");
    await expect(export_bundle_signed_url("exports/luminari-full-2026-11-25T04-16-54-333Z.json"))
      .rejects.toThrow("Not a Supabase storage key");
  });
});
