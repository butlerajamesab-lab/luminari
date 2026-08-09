import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("runtime router/live schema compatibility", () => {
  const enforcement_router = read_repo_file(
    "./routers/enforcement-intelligence.ts",
  );
  const architecture_router = read_repo_file("./routers/architecture-map.ts");

  it("derives agency choices from exact agency_forms columns", () => {
    const reader = enforcement_router.slice(
      enforcement_router.indexOf("listAgencies: publicProcedure"),
      enforcement_router.indexOf(
        "// ═════════════════════════════════════════",
        enforcement_router.indexOf("listAgencies: publicProcedure"),
      ),
    );

    expect(reader).toContain("from public.agency_forms");
    expect(reader).toContain("agency_short");
    expect(reader).toContain("min(agency) as agency_name");
    expect(reader).toContain("agencyName: String(row.agency_name)");
    expect(reader).toContain("agencyShort: String(row.agency_short)");
    expect(reader).not.toContain('ORDER BY "agencyName"');
  });

  it("reads barriers and weak joints only through their live snake-case columns", () => {
    const reader = enforcement_router.slice(
      enforcement_router.indexOf("listAllBarriers: publicProcedure"),
    );

    expect(reader).toContain("from public.litigation_barriers");
    expect(reader).toContain("leading_authorities");
    expect(reader).toContain("possible_workarounds");
    expect(reader).toContain("from public.legal_weak_joints");
    expect(reader).toContain("severity_level");
    expect(reader).toContain("severity_rationale");
    expect(reader).toContain("mapLitigationBarrier");
    expect(reader).toContain("mapLegalWeakJoint");
    expect(reader).not.toContain("divergenceDescription");
    expect(reader).not.toContain("whatLawRequires");
    expect(reader).not.toContain("statuteCitation");
  });

  it("projects proof frameworks from live snake-case storage into camel DTOs", () => {
    expect(architecture_router).toContain("from public.proof_frameworks");
    expect(architecture_router).toContain("claim_type");
    expect(architecture_router).toContain("elements_of_proof");
    expect(architecture_router).toContain("burden_of_proof");
    expect(architecture_router).toContain("required_causation");
    expect(architecture_router).toContain("typical_evidence");
    expect(architecture_router).toContain("common_defenses");
    expect(architecture_router).toContain("claimType: String(row.claim_type");
    expect(architecture_router).toContain(
      "elementsOfProof: parseProofList(row.elements_of_proof)",
    );
    expect(architecture_router).toContain(
      "typicalEvidence: parseProofList(row.typical_evidence)",
    );
    expect(architecture_router).toContain(
      "commonDefenses: parseProofList(row.common_defenses)",
    );
  });
});
