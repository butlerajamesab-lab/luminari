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
    expect(service).toContain("fresh_duplicate_preserved");
    expect(service).toContain("fresh_derivative_preserved");
    expect(service).toContain("fresh_source_disposition");
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

  it("streams every workbook row through bounded, heartbeat-protected batches", () => {
    expect(service).toContain("forEachXlsxRow");
    expect(service).toContain("insertXlsxCandidates");
    expect(service).toContain("xlsx_streamed_row_preserved_v3");
    expect(service).toContain("workbook_chunks_committed");
    expect(service).toContain("lease_heartbeat_at");
    expect(service).toContain("result_json=result_json||$7::jsonb");
    expect(service).toContain("header_row");
    expect(service).toContain("row_role");
    expect(service).toContain("immutable_workbook_plus_decoded_cells");
    expect(service).toContain("formula");
    expect(service).toContain('candidateType: "workbook_context"');
    expect(service).toContain("bounded_batch_insert: true");
    expect(service).not.toContain("rows.length >= 100_000");
    expect(service).not.toContain("i <= 100_000");
  });

  it("automatically reconciles source and parser changes without an operator button", () => {
    expect(router).toContain("queue_fresh_corpus_rebuild");
    expect(router).toContain("get_fresh_corpus_rebuild_status");
    expect(service).toContain("reconcileFreshCorpusAutomatically");
    expect(service).toContain("source_changes_detected");
    expect(service).toContain("parser_version_changed");
    expect(service).toContain("syncFreshCorpusSourceManifest");
  });

  it("claims artifacts once and refuses to finalize nonterminal receipts", () => {
    expect(service).toContain("if (claim.rowCount === 0) return");
    expect(service).toContain("fresh_corpus_nonterminal_artifacts");
    expect(service).toContain("or r.status='running'");
    expect(service).toContain("nonterminal_count");
    expect(service).toContain("nonterminal_artifact_receipts");
    expect(service).toContain("pg_advisory_xact_lock");
  });

  it("seals identities with bounded set-based writes", () => {
    expect(service).toContain("identityChunkSize = 200");
    expect(service).toContain("evidenceChunkSize = 400");
    expect(service).toContain("identity_groups_committed");
    expect(service).toContain("identity_evidence_committed");
    expect(service).toContain("jsonb_to_recordset($1::jsonb)");
    expect(service).not.toContain("values($1,$2,$3,$4) on conflict do nothing");
  });
});
