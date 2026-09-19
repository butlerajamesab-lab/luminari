import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260919043000_official_terminal_source_identity.sql"),
  "utf8",
);

describe("official terminal source identity contract", () => {
  it("keeps provider identity and official terminal identity distinct", () => {
    expect(sql).toContain("source_identity_namespace='provider'");
    expect(sql).toContain("source_identity_namespace='official_terminal'");
    expect(sql).toContain("provider_document_id is null");
    expect(sql).toContain("source_artifact_id is not null");
    expect(sql).toContain("official_text:%s:%s");
  });

  it("registers terminal sources as chaptered text and preserves predecessor lineage", () => {
    expect(sql).toContain("'chaptered'");
    expect(sql).toContain("predecessor_source_document_key");
    expect(sql).toContain("verified_terminal_source");
    expect(sql).toContain("supplements_provider_text_chain");
  });
});
