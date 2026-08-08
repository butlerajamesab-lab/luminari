import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const projection = readFileSync(resolve(here, "intake-case-integrity-projection.ts"), "utf8");
const analyze = readFileSync(resolve(here, "routers/analyze.ts"), "utf8");
const integrity = readFileSync(resolve(here, "../client/src/pages/IntegrityDashboard.tsx"), "utf8");

describe("Universal Intake Spine evidence-integrity projection", () => {
  it("binds every case-linked source artifact instead of treating Layer 3 as a singleton", () => {
    expect(projection).toContain("public.case_identity_bridge");
    expect(projection).toContain("public.case_intake_links");
    expect(projection).toContain("ia.artifact_type = 'source_document'");
    expect(projection).toContain("partition by source_ref.value ->> 'artifact_id'");
    expect(projection).toContain("source_ref.value ->> 'type' = 'source_artifact'");
  });

  it("accepts only sealed current-contract Layer 3 executions", () => {
    expect(projection).toContain("lr.layer_name = 'evidence_preservation'");
    expect(projection).toContain("lr.run_status = 'completed'");
    expect(projection).toContain("lr.is_sealed = true");
    expect(projection).toContain("'execution_contract_version' = $2");
    expect(projection).toContain("lr.canonicalization_version = $3");
  });

  it("fails closed if preserved output identity or deterministic output hash is invalid", () => {
    expect(projection).toContain('row.output_artifact_type !== "intake_layer_output"');
    expect(projection).toContain('row.output_artifact_status !== "preserved"');
    expect(projection).toContain("recomputed_output_hash = computeHash(metadata.data)");
    expect(projection).toContain("recomputed_output_hash !== row.output_hash");
    expect(projection).toContain("data.artifact_key !== row.artifact_key");
  });

  it("keeps absent, unrun, partial, blocked, and verified states distinct", () => {
    expect(projection).toContain('projection_state = "no_evidence"');
    expect(projection).toContain('projection_state = "not_run"');
    expect(projection).toContain('projection_state = "partial"');
    expect(projection).toContain('projection_state = "blocked"');
    expect(projection).toContain('projection_state = "verified"');
  });

  it("exposes the canonical state without allowing the legacy gate to substitute for it", () => {
    expect(analyze).toContain("getIntakeIntegrityProjection");
    expect(analyze).toContain("read_case_intake_integrity_projection");
    expect(integrity).toContain("trpc.analyze.getIntakeIntegrityProjection.useQuery");
    expect(integrity).toContain("Canonical evidence preservation");
    expect(integrity).toContain("They do not substitute for the receipt-bound Intake Layer 3 result above");
  });
});
