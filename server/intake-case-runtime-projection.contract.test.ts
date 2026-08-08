import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const projection = readFileSync(resolve(here, "intake-case-runtime-projection.ts"), "utf8");
const compatibility = readFileSync(resolve(here, "case-runtime-intake-compat.ts"), "utf8");
const dbFacade = readFileSync(resolve(here, "db.ts"), "utf8");
const graph = readFileSync(resolve(here, "../client/src/pages/NetworkGraph.tsx"), "utf8");

describe("Universal Intake Spine case runtime projection", () => {
  it("binds the legacy case identity to every explicitly linked Intake session", () => {
    expect(projection).toContain("public.case_identity_bridge");
    expect(projection).toContain("public.case_intake_links");
    expect(projection).toContain("cil.case_uuid = cib.case_uuid");
    expect(projection).toContain("cib.legacy_case_id = $1");
  });

  it("accepts only sealed completed layer-execution receipts as canonical projection input", () => {
    expect(projection).toContain("lr.run_status = 'completed'");
    expect(projection).toContain("lr.is_sealed = true");
    expect(projection).toContain('receipt?.receipt_type === "layer_execution"');
    expect(projection).toContain('execution_contract_version === EXECUTION_CONTRACT_VERSION');
    expect(projection).toContain('canonicalization_version === CANONICALIZATION_VERSION');
  });

  it("re-verifies the preserved output artifact and its deterministic output hash before projection", () => {
    expect(projection).toContain('row.output_artifact_type !== "intake_layer_output"');
    expect(projection).toContain('row.output_artifact_status !== "preserved"');
    expect(projection).toContain("recomputed_output_hash = computeHash(metadata.data)");
    expect(projection).toContain("recomputed_output_hash !== row.output_hash");
  });

  it("preserves the migration fallback but never falls through once a canonical layer output exists", () => {
    expect(compatibility).toContain('projection.state === "canonical_projection"');
    expect(compatibility).toContain("return projection.entities.map(externalize_entity)");
    expect(compatibility).toContain("return projection.relationships.map(externalize_relationship)");
    expect(compatibility).toContain("return list_legacy_entities_runtime(caseId)");
    expect(compatibility).toContain("return list_legacy_relationships_runtime(caseId)");
  });

  it("routes entity ownership through the case bridge for projected identities", () => {
    expect(compatibility).toContain("decode_intake_projection_case_id(entityId)");
    expect(compatibility).toContain("await verifyCaseOwnership(case_id, userId)");
    expect(dbFacade).toContain("verifyEntityOwnership");
    expect(dbFacade).toContain('from "./case-runtime-intake-compat"');
  });

  it("keeps Intake-owned projection metadata snake_case at the API boundary", () => {
    expect(compatibility).toContain("canonical_entity_id");
    expect(compatibility).toContain("canonical_relationship_id");
    expect(compatibility).toContain("canonical_receipt_hashes");
    expect(compatibility).toContain("projection_source");
  });

  it("keeps projected graph evidence on the canonical source-span path instead of querying a nonexistent legacy row", () => {
    expect(graph).toContain('relationship?.projection_source !== "universal_intake_spine"');
    expect(graph).toContain("selectedLink.relId > 0");
    expect(graph).toContain("projectedLinkEvidence ?? legacyLinkEvidence");
    expect(graph).not.toContain("identified by AI analysis");
  });
});
