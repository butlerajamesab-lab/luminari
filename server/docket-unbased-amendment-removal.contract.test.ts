import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Static source-bound contract only. It is NOT disposable Postgres acceptance,
 * production installation authorization, or certification of the 2,101
 * existing base-linked amendments.
 */
const migration = readFileSync(
  "supabase/migrations/20261105051000_remove_unbased_amendment_derived_records_v1.sql",
  "utf8",
);

describe("Docket unbased amendment removal and readmission prevention", () => {
  it("fails closed on production function lineage drift and count drift", () => {
    expect(migration).toContain("232c19170727b8f24fd5b9bff3da8e40");
    expect(migration).toContain("(n_source=7264 AND n_version=7264");
    expect(migration).toContain("(n_source=0 AND n_version=0");
    expect(migration).toContain("n_structural_bound=2101");
    expect(migration).toContain("n_observations=7438");
    expect(migration).toContain("n_queue=4942");
    expect(migration).toContain("intermediate/partial seeded state");
    expect(migration).toContain("transaction rolled back");
  });

  it("prevents the canonical registration function from recreating unbased amendments", () => {
    expect(migration).toContain("jsonb_array_elements(coalesce(v_bill -> 'amendments', '[]'::jsonb))");
    expect(migration).toContain("candidate.base_source_document_key");
    expect(migration).toContain("and base.document_family = 'text'");
    expect(migration).toContain("document.document_family <> 'amendment'");
    expect(migration).toContain("or version.base_bill_version_id is not null");
    expect(migration).toContain("docket_amendment_requires_attached_text_base_v1");
    expect(migration).toContain("VALIDATE CONSTRAINT docket_amendment_requires_attached_text_base_v1");
  });

  it("deletes derived records and preserves original provider JSON", () => {
    expect(migration).toMatch(/DELETE FROM public\.civic_genome_bill_version v/);
    expect(migration).toMatch(/DELETE FROM public\.docket_bill_source_document d/);
    expect(migration).toContain("FROM _docket_unbased_amendment_targets");
    expect(migration).not.toMatch(/DELETE FROM public\.docket_bill_detail_cache/i);
    expect(migration).not.toMatch(/DELETE FROM public\.docket_legiscan_bulk_member_receipt/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration).not.toMatch(/DELETE FROM public\.civic_genome_bill\s/i);
  });

  it("keeps exact identifiers for later independent Rosetta-source deletion", () => {
    expect(migration).toContain("docket_unbased_amendment_removal_receipt_v1");
    expect(migration).toContain("rosetta_source_document_id");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("WHERE rosetta_source_document_id IS NOT NULL)=3783");
  });
});
