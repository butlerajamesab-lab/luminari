import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260819173000_civic_genome_authoritative_stage_rank_v2.sql"),
  "utf8",
);

describe("Civic Genome authoritative stage rank", () => {
  it("keeps known final states above generic text and amendment artifacts", () => {
    expect(migration).toContain("when 'other_text' then 375");
    expect(migration).toContain("when 'other_amendment' then 375");
    expect(migration).toContain("when 'enrolled' then 400");
    expect(migration).toContain("when 'chaptered' then 500");
    expect(migration).toContain("else 0");
    expect(migration).not.toContain("when 'other_text' then 600");
    expect(migration).not.toContain("else 700");
  });

  it("updates only mutable rank projections and preserves immutable identities", () => {
    expect(migration).toContain("update public.docket_bill_source_document");
    expect(migration).toContain("update public.civic_genome_bill_version");
    expect(migration).not.toContain("version_fingerprint =");
    expect(migration).not.toContain("delete from");
    expect(migration).not.toContain("truncate");
    expect(migration).not.toContain("docket_bill_source_document_observation");
  });
});
