import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806043309_harden_universal_intake_receipt_v2.sql",
  ),
  "utf8",
);
const verification = readFileSync(
  resolve(
    process.cwd(),
    "supabase/verification/20260806043309_harden_universal_intake_receipt_v2_verify.sql",
  ),
  "utf8",
);

describe("Universal Intake Spine receipt v2 migration", () => {
  it("hashes the complete v2 payload with a database canonicalizer", () => {
    expect(migration).toContain("luminari_canonical_json_v2(value jsonb)");
    expect(migration).toContain("receipt - 'receipt_hash'");
    expect(migration).toContain("intake_layer_runs_v2_receipt_digest_ck");
    expect(migration).toContain("'luminari.intake.canonical-json.v2'");
    expect(migration).toContain("not (receipt ? 'hash_basis')");
    expect(migration).toContain("extensions.digest(");
  });

  it("enforces predecessor existence, one successor, and current-tip insertion", () => {
    expect(migration).toContain(
      "uq_intake_layer_runs_session_receipt_hash",
    );
    expect(migration).toContain(
      "fk_intake_layer_runs_previous_receipt_same_session",
    );
    expect(migration).toContain("ux_intake_layer_runs_one_successor");
    expect(migration).toContain("ux_intake_layer_runs_one_application_root");
    expect(migration).toContain("luminari_enforce_intake_receipt_chain_tip");
    expect(migration).toContain(
      "intake receipt must extend the current session tip",
    );
    expect(migration).toContain(
      "intake receipt canonicalization downgrade rejected",
    );
  });

  it("freezes receipt support records and constrains case/session identity", () => {
    expect(migration).toContain("'source_document'");
    expect(migration).toContain(
      "trg_intake_verification_records_append_only",
    );
    expect(migration).toContain("trg_intake_state_transitions_append_only");
    expect(migration).toContain("ux_case_intake_links_one_primary_case");
    expect(migration).toContain(
      "intake_verification_records_no_new_inference_ck",
    );
  });

  it("ships a read-only verification that checks hashes, forks, ACLs, and primaries", () => {
    expect(verification).toContain("canonical JSON v2 vector mismatch");
    expect(verification).toContain(
      "v2 receipt hashes do not bind their full payload",
    );
    expect(verification).toContain("receipt predecessors are dangling");
    expect(verification).toContain("receipt forks exist");
    expect(verification).toContain("multiple primary intake sessions");
    expect(verification).toContain("PUBLIC can execute");
    expect(verification.trimEnd()).toMatch(/rollback;$/);
  });
});
