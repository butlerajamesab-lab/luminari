import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TYPED_CANDIDATE_TARGETS,
  TYPED_PROVENANCE_EXTRACTOR_VERSION,
  build_typed_provenance_candidate,
  detect_typed_candidate_types,
  extract_typed_values,
} from "../scripts/lib/typed-provenance-candidate-v4.mjs";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const runner = read("../scripts/reconcile-typed-provenance-candidates-v4.mjs");

const sourceInput = {
  source_queue_id: 215,
  source_candidate_id: 136165,
  source_candidate_extraction_version:
    "candidate_field_binding_v3_fragment_classification",
  source_file: "luminari-UTAH-RESOURCE-DIRECTORY-2026.docx",
  storage_path: "luminari-UTAH-RESOURCE-DIRECTORY-2026.docx",
  source_text_hash:
    "dad537e33793502b68050e9b70e1a67f18b7b6e34472d265ff8b54f70d54b00f",
  source_line_start: 3,
  source_line_end: 12,
  jurisdiction: "Utah",
};

describe("typed provenance candidate v4", () => {
  it("combines typed classification with exact source provenance", () => {
    const excerpt =
      "UALD (Utah Antidiscrimination and Labor Division), 160 East 300 South, Salt Lake City UT. Phone 801-530-6801. File within 180 days. Utah Code § 34A-5-101. Website laborcommission.utah.gov.";
    const detected = detect_typed_candidate_types(excerpt);

    expect(detected).toEqual(
      expect.arrayContaining([
        "agency",
        "deadline",
        "statute",
        "contact",
        "resource",
      ]),
    );

    const candidate = build_typed_provenance_candidate({
      ...sourceInput,
      source_excerpt: excerpt,
      candidate_type: "statute",
      detected_candidate_types: detected,
    });

    expect(candidate.extraction_version).toBe(
      TYPED_PROVENANCE_EXTRACTOR_VERSION,
    );
    expect(candidate.promotion_ready.ready).toBe(false);
    expect(candidate.promotion_ready.status).toBe(
      "typed_candidate_pending_verification",
    );
    expect(candidate.promotion_ready.document_family).toBe(
      "general_state_registry",
    );
    expect(candidate.promotion_ready.target_table).toBeNull();
    expect(candidate.promotion_ready.intended_target_table).toBe(
      "legal_statutes",
    );
    expect(candidate.forensic_provenance.source_candidate_id).toBe(136165);
    expect(candidate.forensic_provenance.source_line_start).toBe(3);
    expect(candidate.forensic_provenance.source_line_end).toBe(12);
    expect(candidate.forensic_provenance.source_excerpt).toBe(excerpt);
    expect(candidate.forensic_provenance.canonical_promotion).toBe(false);
    expect(candidate.name).toMatch(/^unresolved_typed_fragment:statute:/);
  });

  it("preserves legal, deadline, contact, and portal values as field metadata", () => {
    const excerpt =
      "Title VII, 42 U.S.C. § 2000e-5. Appeal within 180 days. Phone (801) 530-6801, discrimination@utah.gov, laborcommission.utah.gov.";
    const values = extract_typed_values(excerpt);

    expect(values.phones).toContain("(801) 530-6801");
    expect(values.emails).toContain("discrimination@utah.gov");
    expect(values.urls).toContain("laborcommission.utah.gov");
    expect(values.statutes.join(" ")).toContain("42 U.S.C. § 2000e-5");
    expect(values.deadlines.join(" ")).toMatch(/180 days/i);
  });

  it("recognizes tribal, workflow, court, legal-aid, policy, and benefit classes", () => {
    expect(
      detect_typed_candidate_types(
        "CRITICAL POLICY ALERT: ICWA tribal filing workflow. Contact the Bureau of Indian Affairs, tribal court, and Native American legal aid. Medicaid appeal pathway within 30 days.",
      ),
    ).toEqual(
      expect.arrayContaining([
        "policy_alert",
        "agency",
        "legal_aid",
        "court",
        "tribal_entity",
        "benefit_program",
        "workflow",
        "deadline",
      ]),
    );
  });

  it("is deterministic and type-specific", () => {
    const excerpt = "Utah Code § 34A-5-101. Phone 801-530-6801.";
    const first = build_typed_provenance_candidate({
      ...sourceInput,
      source_excerpt: excerpt,
      candidate_type: "statute",
    });
    const replay = build_typed_provenance_candidate({
      ...sourceInput,
      source_excerpt: excerpt,
      candidate_type: "statute",
    });
    const contact = build_typed_provenance_candidate({
      ...sourceInput,
      source_excerpt: excerpt,
      candidate_type: "contact",
    });

    expect(replay.content_hash).toBe(first.content_hash);
    expect(replay.program_id).toBe(first.program_id);
    expect(contact.content_hash).not.toBe(first.content_hash);
  });

  it("maps each type to an existing declared destination class without enabling writes", () => {
    expect(TYPED_CANDIDATE_TARGETS).toMatchObject({
      policy_alert: { intended_target_table: "registry_policy_alerts" },
      agency: { intended_target_table: "agencies_registry" },
      legal_aid: { intended_target_table: "legal_aid_organizations" },
      court: { intended_target_table: "court_directory" },
      tribal_entity: { intended_target_table: "jurisdiction_hierarchy" },
      benefit_program: { intended_target_table: "registry_programs" },
      workflow: { intended_target_table: "workflow_registry" },
      deadline: { intended_target_table: "registry_deadline_rules" },
      statute: { intended_target_table: "legal_statutes" },
      contact: { intended_target_table: "registry_contacts" },
      resource: { intended_target_table: "luminari_resource_entities" },
    });
  });

  it("keeps apply bounded, explicit, additive, and off by default", () => {
    expect(runner).toContain(
      'process.env.ALLOW_TYPED_PROVENANCE_CANDIDATE_APPLY !== "true"',
    );
    expect(runner).toContain(
      "apply requires at least one explicit --row-id",
    );
    expect(runner).toContain("MAX_APPLY_QUEUE_IDS = 10");
    expect(runner).toContain("where not exists");
    expect(runner).toContain("candidate_field_binding_v3_fragment_classification");
    expect(runner).not.toMatch(/\b(?:delete\s+from|truncate\s+table|drop\s+table|alter\s+table)\b/i);
    expect(runner).not.toContain("promote_registry_entity_candidates_apply");
  });
});
