import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const genericReceiptMigration = readFileSync(
  "supabase/migrations/20260807204521_generic_intake_layer_execution_receipts_v2.sql",
  "utf8",
);
const crossRuntimeMigration = readFileSync(
  "supabase/migrations/20260807205321_intake_layer_execution_cross_runtime_proof_v3.sql",
  "utf8",
);
const sealedRunImmutabilityMigration = readFileSync(
  "supabase/migrations/20260809153413_lock_sealed_intake_layer_runs.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/20260807205321_intake_layer_execution_cross_runtime_proof_v3_verify.sql",
  "utf8",
);

describe("Universal Intake Spine generic layer execution receipt contract", () => {
  it("preserves strict source-document receipts while admitting generic layer execution receipts", () => {
    expect(genericReceiptMigration).toContain(
      "receipt_type' = 'layer_execution",
    );
    expect(genericReceiptMigration).toContain(
      "receipt_type' in ('evidence_preservation', 'document_replacement')",
    );
    expect(genericReceiptMigration).toContain(
      "luminari.intake.layer-execution.v1",
    );
    expect(genericReceiptMigration).toContain("rule_manifest_hash");
    expect(genericReceiptMigration).toContain("unresolved_dependencies_hash");
  });

  it("makes PostgreSQL canonical-json.v2 authoritative for persisted execution and output hashes", () => {
    expect(crossRuntimeMigration).toContain(
      "luminari_canonical_json_v2(p_execution_envelope)",
    );
    expect(crossRuntimeMigration).toContain(
      "luminari_canonical_json_v2(coalesce(p_output_data, 'null'::jsonb))",
    );
    expect(crossRuntimeMigration).toContain(
      "cross-runtime execution hash mismatch",
    );
    expect(crossRuntimeMigration).toContain(
      "cross-runtime output hash mismatch",
    );
    expect(crossRuntimeMigration).toContain(
      "luminari.intake.cross-runtime-canonical-proof.v1",
    );
  });

  it("forces runtime callers through v3 rather than bypassing cross-runtime verification", () => {
    expect(crossRuntimeMigration).toContain(
      "revoke all on function public.register_intake_layer_execution_v2",
    );
    expect(crossRuntimeMigration).toContain("from service_role");
    expect(crossRuntimeMigration).toContain(
      "grant execute on function public.register_intake_layer_execution_v3",
    );
    expect(verification).toContain(
      "service_role must not bypass the cross-runtime v3 verifier through v2",
    );
  });

  it("proves database replay idempotence and fail-closed numeric canonicalization", () => {
    expect(verification).toContain("idempotent database replay failed");
    expect(verification).toContain(
      "1e03aed2220164ee94794f8141eaa11abfbfb204e72d2a984e8200b3f6fdbd79",
    );
    expect(verification).toContain(
      "cross-runtime canonical mismatch was not rejected",
    );
  });

  it("source-controls sealed layer-run immutability for replay parity", () => {
    expect(sealedRunImmutabilityMigration).toContain(
      "luminari_reject_sealed_intake_layer_run_mutation",
    );
    expect(sealedRunImmutabilityMigration).toContain("if old.is_sealed then");
    expect(sealedRunImmutabilityMigration).toMatch(
      /before update or delete on public\.intake_layer_runs/i,
    );
    expect(sealedRunImmutabilityMigration).toContain("security invoker");
    expect(sealedRunImmutabilityMigration).toContain("set search_path = ''");
    expect(sealedRunImmutabilityMigration).toContain(
      "supersession requires insertion",
    );
  });
});
