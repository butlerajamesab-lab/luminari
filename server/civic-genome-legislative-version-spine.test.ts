import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260805210000_legislative_version_decomposition_spine.sql",
  ),
  "utf8",
);
const auto_registration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260805210100_legislative_version_spine_auto_registration.sql",
  ),
  "utf8",
);

describe("legislative version decomposition spine", () => {
  it("preserves Docket source-document identity and immutable observations", () => {
    expect(migration).toContain("create table if not exists public.docket_bill_source_document");
    expect(migration).toContain("create table if not exists public.docket_bill_source_document_observation");
    expect(migration).toContain("unique (source_document_key, metadata_hash)");
    expect(migration).toContain("latest_metadata jsonb");
    expect(migration).not.toMatch(/truncate\s+public\.docket_bill_source_document/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.docket_bill_source_document/i);
  });

  it("registers provider-declared text and amendment families without choosing one preferred document", () => {
    expect(migration).toContain("jsonb_array_elements(coalesce(v_bill -> 'texts'");
    expect(migration).toContain("jsonb_array_elements(coalesce(v_bill -> 'amendments'");
    expect(migration).toContain("'introduced'");
    expect(migration).toContain("'committee_substitute'");
    expect(migration).toContain("'engrossed'");
    expect(migration).toContain("'enrolled'");
    expect(migration).toContain("'chaptered'");
    expect(migration).toContain("'house_amendment'");
    expect(migration).toContain("'senate_amendment'");
    expect(migration).not.toContain("order by stage_rank desc limit 1");
  });

  it("keeps one bill identity while versioning exact documents", () => {
    expect(migration).toContain("create table if not exists public.civic_genome_bill_version");
    expect(migration).toContain("references public.civic_genome_bill(genome_bill_id)");
    expect(migration).toContain("predecessor_bill_version_id");
    expect(migration).toContain("base_bill_version_id");
    expect(migration).toContain("version_fingerprint");
    expect(migration).toContain("civic_genome_bill_version_predecessor_crosses_bill_identity");
    expect(migration).toContain("civic_genome_bill_version_base_crosses_bill_identity");
  });

  it("queues exact registered documents and binds Prism completion back to that version", () => {
    expect(migration).toContain("create table if not exists public.civic_genome_legislative_version_queue");
    expect(migration).toContain("unique\n    references public.civic_genome_bill_version");
    expect(migration).toContain("record_civic_genome_version_prism_completion");
    expect(migration).toContain("prism_verification_run_id = new.verification_run_id");
    expect(migration).toContain("processing_state = case");
  });

  it("automatically registers only when explicit Docket and Genome identities coexist", () => {
    expect(auto_registration).toContain("after insert or update of bill");
    expect(auto_registration).toContain("after insert or update of structural_dna_json");
    expect(auto_registration).toContain("structural_dna_json ->> 'source_bill_id'");
    expect(auto_registration).toContain("when sqlstate 'P0002' then");
    expect(auto_registration).not.toContain("when no_data_found");
  });
});
