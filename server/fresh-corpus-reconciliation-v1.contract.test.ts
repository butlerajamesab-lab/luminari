import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const service = source("server/services/fresh-corpus-reconciliation-v1.ts");
const router = source("server/routers/ingestion-control-router.ts");
const foundation = source("supabase/migrations/20260811204240_fresh_corpus_reconciliation_v1.sql");
const receipts = source("supabase/migrations/20260811204938_fresh_corpus_rebuild_artifact_receipts_v1.sql");

describe("fresh corpus reconciliation v1", () => {
  it("starts from immutable Storage artifacts rather than legacy canonical tables", () => {
    expect(foundation).toContain("luminari_corpus_source_artifact_v1");
    expect(foundation).toContain("State Enriched Registry bucket");
    expect(foundation).toContain("Everything backbone related");
    expect(service).toContain("/storage/v1/object/public/");
    expect(service).not.toContain("registry_entity_extraction_v4");
    expect(service).not.toContain("registry_entity_staging_programs");
    expect(service).not.toContain("normalized_civic_resource");
    expect(service).not.toContain("unified_resources");
  });

  it("keeps typed candidates separate from canonical identities and publication", () => {
    expect(foundation).toContain("luminari_corpus_candidate_v1");
    expect(foundation).toContain("luminari_corpus_identity_v1");
    expect(foundation).toContain("A candidate is not a canonical resource, workflow, finding, signal, or publication");
    expect(service).toContain('candidate_type: "resource"');
    expect(service).toContain('candidate_type: "workflow"');
    expect(service).toContain('candidate_type: "oversight_route"');
    expect(service).toContain('candidate_type: "policy_alert"');
    expect(service).toContain('candidate_type: "legal_authority"');
    expect(service).not.toContain('candidate_type: "atomic_line"');
    expect(service).not.toContain('candidate_type: "document_block"');
  });

  it("preserves exact duplicates and derivative bundles without re-promoting them", () => {
    expect(foundation).toContain("exact_duplicate_of");
    expect(service).toContain("skipped_exact_duplicate");
    expect(service).toContain("preserved_derivative_not_reingested");
    expect(service).toContain("derivative_artifact_not_primitive_source");
  });

  it("fails closed on jurisdiction and strong-identifier collisions", () => {
    expect(service).toContain('state: "conflict"');
    expect(service).toContain('"unresolved_conflict"');
    expect(service).toContain('"identity_conflict"');
    expect(service).toContain("strong_identifier_disagreement");
    expect(service).toContain("jurisdiction_conflict");
  });

  it("has resumable per-artifact receipts for bounded production execution", () => {
    expect(receipts).toContain("luminari_corpus_rebuild_artifact_v1");
    expect(receipts).toContain("attempt_count");
    expect(receipts).toContain("receipt_hash");
    expect(service).toContain("runFreshCorpusRebuildBatch");
    expect(service).toContain("maxBatches ?? 40");
    expect(service).toContain("batchSize ?? 6");
  });

  it("only resumes an explicitly queued production rebuild", () => {
    expect(router).toContain("queue_fresh_corpus_rebuild");
    expect(router).toContain("get_fresh_corpus_rebuild_status");
    expect(router).toContain("resumeFreshCorpusRebuildFromDatabase");
    expect(router).toContain("never creates one implicitly");
    const startupTail = router.slice(router.indexOf("if (process.env.NODE_ENV"));
    expect(startupTail).not.toContain("queueFreshCorpusRebuild(");
  });
});
