import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");

const projection = read("intake-case-runtime-projection.ts");
const chronology = read("case-runtime-chronology-compat.ts");
const compatibility = read("case-runtime-intake-compat.ts");
const analyze = read("routers/analyze.ts");
const routers = read("routers.ts");
const graph = read("../client/src/pages/NetworkGraph.tsx");
const documentDetail = read("../client/src/pages/DocumentDetail.tsx");
const statement = read("../client/src/pages/StatementOfFacts.tsx");

describe("governed projection reader surfaces", () => {
  it("binds both legitimate source-document states while excluding blocked states", () => {
    for (const reader of [projection, chronology]) {
      expect(reader).toContain("a.artifact_status in ('registered', 'preserved')");
      expect(reader).not.toContain("a.artifact_status = 'preserved'");
      expect(reader).not.toContain("'referenced_missing', 'registered'");
      expect(reader).not.toContain("'quarantined', 'registered'");
    }
  });

  it("projects receipt-bound entity mentions back to their exact legacy document", () => {
    expect(projection).toContain("get_projected_entity_roles_for_document");
    expect(projection).toContain("binding.document_id !== document_id");
    expect(projection).toContain("canonicalSpanOffset: mention.span_offset");
    expect(compatibility).toContain("getGovernedEntityRolesForDocument");
    expect(routers).toContain("if (governed !== null) return governed");
  });

  it("distinguishes a sealed completed-zero relationship layer from not projected", () => {
    expect(analyze).toContain("getIntakeRelationshipProjection");
    expect(analyze).toContain("unresolved_dependencies: output.unresolved_dependencies");
    expect(graph).toContain('projection_state === "canonical_projection"');
    expect(graph).toContain("Sealed projection found zero explicit relationships");
    expect(graph).toContain("not drawn as connected merely because they appear in the same evidence");
    expect(graph).toContain(".filter((entity) => connectedEntityIds.has(entity.id))");
    expect(graph).toContain(") : !hasRelationships ? (");
    expect(graph).toContain("<ForceGraph2D");
  });

  it("does not fabricate full text when only governed projections were retained", () => {
    expect(documentDetail).toContain("Governed processing completed");
    expect(documentDetail).toContain("not a full-text document projection");
    expect(documentDetail).toContain("No text has been reconstructed or invented here.");
    expect(documentDetail).not.toContain("No text content extracted");
    expect(documentDetail).not.toContain("Run Intake Spine");
  });

  it("labels Statement of Facts as governed chronology and reads the canonical count field", () => {
    expect(statement).toContain("data.total_count");
    expect(statement).not.toContain("data.totalCount");
    expect(statement).toContain("receipt-bound Intake Spine chronology");
    expect(statement).toContain("governed chronology events");
    expect(statement).not.toContain("events, quotes, claims, findings, and FOIA requests");
  });
});
