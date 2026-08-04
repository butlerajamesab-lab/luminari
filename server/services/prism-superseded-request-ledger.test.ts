import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ledger = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260804063920_prism_superseded_request_ledger.sql"),
  "utf8",
);
const rule_upgrade = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260804064053_prism_rule_upgrade_supersession.sql"),
  "utf8",
);
const invariant = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260804065409_prism_supersession_invariant_hardening.sql"),
  "utf8",
);
const source = `${ledger}\n${rule_upgrade}\n${invariant}`;

describe("Prism superseded request ledger", () => {
  it("preserves failed requests and attempt history", () => {
    expect(source).not.toMatch(/\bdelete\s+from\b/i);
    expect(source).not.toMatch(/\btruncate\b/i);
    expect(source).not.toMatch(/\bdrop\s+table\b/i);
    expect(source).toContain("superseded_by_request_id");
    expect(source).toContain("superseded_at");
  });

  it("requires a later completed receipt for the same governed evidence identity", () => {
    for (const predicate of [
      "completed.claim_assertion_id = failed.claim_assertion_id",
      "completed.evidence_document_id = failed.evidence_document_id",
      "completed.evidence_fingerprint = failed.evidence_fingerprint",
      "completed.source_content_hash = failed.source_content_hash",
      "completed.rule_set_id = failed.rule_set_id",
      "completed.bridge_state = 'completed'",
      "receipt.request_id = completed.request_id",
    ]) {
      expect(rule_upgrade).toContain(predicate);
    }
    expect(rule_upgrade).toContain("completed.rule_set_version <> failed.rule_set_version");
    expect(rule_upgrade).toContain("completed.created_at > failed.created_at");
    expect(invariant).toContain("replacement_created_at <= new.created_at");
    expect(invariant).toContain("replacement_state <> 'completed'");
  });

  it("derives supersession chronology from the immutable Prism completion timestamp", () => {
    expect(invariant).toContain("receipt.prism_completion_timestamp");
    expect(invariant).toContain("new.superseded_at := replacement_completion");
    expect(invariant).toContain("set superseded_at = receipt.prism_completion_timestamp");
  });

  it("does not overwrite an existing receipt or non-transient outcome", () => {
    expect(rule_upgrade).toContain("failed.bridge_state = 'degraded'");
    expect(rule_upgrade).toContain("failed.failure_class = 'transient_upstream'");
    expect(rule_upgrade).toContain("not exists");
    expect(rule_upgrade).toContain("lighthouse_prism_verification_receipts failed_receipt");
  });

  it("keeps the status view invoker-owned and browser-closed", () => {
    expect(ledger).toContain("with (security_invoker = true)");
    expect(ledger).toMatch(/revoke all on table public\.v_lighthouse_prism_verification_status\s+from public, anon, authenticated/i);
    expect(ledger).toMatch(/grant select on table public\.v_lighthouse_prism_verification_status\s+to service_role/i);
    expect(ledger).toContain("r.superseded_by_request_id");
    expect(ledger).toContain("r.superseded_at");
    expect(invariant).toMatch(/revoke execute on function public\.enforce_lighthouse_prism_supersession\(\)[\s\S]*from public, anon, authenticated/i);
    expect(invariant).toMatch(/grant execute on function public\.enforce_lighthouse_prism_supersession\(\)[\s\S]*to service_role/i);
  });
});
