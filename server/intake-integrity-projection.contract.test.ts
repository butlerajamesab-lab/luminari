import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { derive_raw_artifact_key } from "./engines/intake-spine/layer-2-raw_intake_capture";
import { computeHash } from "./engines/intake-spine/utils";
import {
  INTAKE_CANONICALIZATION_VERSION,
  INTAKE_EXECUTION_CONTRACT_VERSION,
} from "./intake-case-layer-reader";
import { project_intake_integrity_rows } from "./intake-case-integrity-projection";

const here = dirname(fileURLToPath(import.meta.url));
const projection = readFileSync(
  resolve(here, "intake-case-integrity-projection.ts"),
  "utf8",
);
const analyze = readFileSync(resolve(here, "routers/analyze.ts"), "utf8");
const integrity = readFileSync(
  resolve(here, "../client/src/pages/IntegrityDashboard.tsx"),
  "utf8",
);
const control = readFileSync(
  resolve(here, "../client/src/components/lighthouse/IntakeSpineControl.tsx"),
  "utf8",
);

const source_sha256 =
  "06c0f404b018ff4b1a67334ce90ce65eb10d3debdba0576a806ef1fb353a4033";

function live_shaped_preservation_row() {
  const source_artifact_id = "11111111-1111-4111-8111-111111111111";
  const output_artifact_id = "22222222-2222-4222-8222-222222222222";
  const data = {
    artifact_key: derive_raw_artifact_key(source_sha256),
    stored_sha256: source_sha256,
    verified_sha256: source_sha256,
    integrity_status: "preserved" as const,
    verification_timestamp: "2026-08-09T14:11:57.918Z",
  };
  const output_hash = computeHash(data);

  return {
    artifact_id: source_artifact_id,
    intake_session_id: "33333333-3333-4333-8333-333333333333",
    metadata: { legacy_document_id: 42 },
    artifact_key: `sha256:${source_sha256}`,
    filename: "evidence.pdf",
    mime_type: "application/pdf",
    source_sha256,
    source_artifact_status: "registered",
    layer_run_id: "44444444-4444-4444-8444-444444444444",
    source_ref_artifact_key: `sha256:${source_sha256}`,
    source_ref_sha256: source_sha256,
    layer_name: "evidence_preservation",
    layer_version: "2.1.0",
    rule_version: "2.1.0",
    input_hash: "a".repeat(64),
    output_hash,
    output_refs: [{ artifact_id: output_artifact_id }],
    unresolved_dependencies: [],
    receipt: { output_artifact_id },
    receipt_hash: "b".repeat(64),
    canonicalization_version: INTAKE_CANONICALIZATION_VERSION,
    completed_at: "2026-08-09T14:11:57.918Z",
    output_artifact_id,
    output_artifact_type: "intake_layer_output",
    output_artifact_status: "preserved",
    output_metadata: {
      execution_contract_version: INTAKE_EXECUTION_CONTRACT_VERSION,
      canonicalization_version: INTAKE_CANONICALIZATION_VERSION,
      layer_name: "evidence_preservation",
      layer_version: "2.1.0",
      rule_version: "2.1.0",
      output_hash,
      data,
    },
  };
}

function replace_canonical_data(
  row: ReturnType<typeof live_shaped_preservation_row>,
  data: any,
) {
  const output_hash = computeHash(data);
  return {
    ...row,
    output_hash,
    output_metadata: { ...row.output_metadata, output_hash, data },
  };
}

describe("Universal Intake Spine evidence-integrity projection", () => {
  it("maps the full source SHA-256 identity to the Layer 2 artifact namespace", () => {
    expect(derive_raw_artifact_key(source_sha256)).toBe("art_06c0f404b018");
    expect(() => derive_raw_artifact_key("sha256:06c0f404")).toThrow(
      "layer2_source_sha256_invalid",
    );
  });

  it("accepts the production key namespaces and returns a verified projection", () => {
    const result = project_intake_integrity_rows([
      live_shaped_preservation_row(),
    ]);

    expect(result).toMatchObject({
      projection_state: "verified",
      source_artifact_count: 1,
      projected_artifact_count: 1,
      preserved_count: 1,
      quarantined_count: 0,
      referenced_missing_count: 0,
      unresolved_dependency_count: 0,
    });
    expect(result.artifacts[0]).toMatchObject({
      artifact_key: `sha256:${source_sha256}`,
      source_sha256,
      integrity_status: "preserved",
      verified_sha256: source_sha256,
    });
  });

  it("fails closed when any receipt-bound source or output identity is tampered", () => {
    const row = live_shaped_preservation_row();
    const wrong_sha = "f".repeat(64);
    const tampered = [
      {
        row: replace_canonical_data(row, {
          ...row.output_metadata.data,
          artifact_key: "art_ffffffffffff",
        }),
        message: "points to the wrong source artifact",
      },
      {
        row: { ...row, source_ref_artifact_key: `sha256:${wrong_sha}` },
        message: "source reference differs from source registration",
      },
      {
        row: { ...row, source_ref_sha256: wrong_sha },
        message: "source reference differs from source registration",
      },
      {
        row: replace_canonical_data(row, {
          ...row.output_metadata.data,
          stored_sha256: wrong_sha,
        }),
        message: "stored hash differs from source registration",
      },
      {
        row: replace_canonical_data(row, {
          ...row.output_metadata.data,
          verified_sha256: wrong_sha,
        }),
        message: "verified hash differs from source registration",
      },
      {
        row: { ...row, output_hash: wrong_sha },
        message: "output metadata differs from the sealed execution contract",
      },
    ];

    for (const sample of tampered) {
      expect(() => project_intake_integrity_rows([sample.row])).toThrow(
        sample.message,
      );
    }
  });

  it("does not promote registered evidence without a sealed preservation run", () => {
    const row = live_shaped_preservation_row();
    const result = project_intake_integrity_rows([
      { ...row, layer_run_id: null },
    ]);

    expect(result).toMatchObject({
      projection_state: "not_run",
      source_artifact_count: 1,
      projected_artifact_count: 0,
      preserved_count: 0,
    });
  });

  it("binds every case-linked source artifact instead of treating Layer 3 as a singleton", () => {
    expect(projection).toContain("public.case_identity_bridge");
    expect(projection).toContain("public.case_intake_links");
    expect(projection).toContain("ia.artifact_type = 'source_document'");
    expect(projection).toContain(
      "partition by source_ref.value ->> 'artifact_id'",
    );
    expect(projection).toContain(
      "source_ref.value ->> 'type' = 'source_artifact'",
    );
    expect(projection).toContain(
      "source_ref.value ->> 'artifact_key' as source_ref_artifact_key",
    );
    expect(projection).toContain(
      "source_ref.value ->> 'sha256' as source_ref_sha256",
    );
  });

  it("accepts only sealed current-contract Layer 3 executions", () => {
    expect(projection).toContain("lr.layer_name = 'evidence_preservation'");
    expect(projection).toContain("lr.run_status = 'completed'");
    expect(projection).toContain("lr.is_sealed = true");
    expect(projection).toContain("'execution_contract_version' = $2");
    expect(projection).toContain("lr.canonicalization_version = $3");
  });

  it("fails closed if preserved output identity or deterministic output hash is invalid", () => {
    expect(projection).toContain(
      'row.output_artifact_type !== "intake_layer_output"',
    );
    expect(projection).toContain('row.output_artifact_status !== "preserved"');
    expect(projection).toContain(
      "recomputed_output_hash = computeHash(metadata.data)",
    );
    expect(projection).toContain("recomputed_output_hash !== row.output_hash");
    expect(projection).toMatch(
      /derive_raw_artifact_key\(\s*row\.source_sha256,?\s*\)/,
    );
    expect(projection).toContain(
      "data.artifact_key !== expected_layer_artifact_key",
    );
    expect(projection).not.toContain("data.artifact_key !== row.artifact_key");
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
    expect(integrity).toContain(
      "trpc.analyze.getIntakeIntegrityProjection.useQuery",
    );
    expect(integrity).toContain(
      "Receipt-bound Universal Intake Spine Layer 3 state",
    );
    expect(integrity).toContain("No legacy snapshot state was substituted");
    expect(integrity).not.toContain("snapshotLifecycle");
    expect(control).toContain("INTAKE_STATUS_READ");
    expect(control).toMatch(
      /onClick=\{\(\)\s*=>\s*void\s+status\.refetch\(\)\}/,
    );
    expect(control).toMatch(/No evidence or\s+execution state was changed/);
  });
});
