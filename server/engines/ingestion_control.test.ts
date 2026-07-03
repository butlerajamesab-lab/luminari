import { describe, expect, it } from "vitest";
import { __testing } from "./ingestion_control";

const row = (text: string, source_name = "luminari-UTAH-RESOURCE-DIRECTORY-2026.docx") => ({ id: 42, source_name, storage_path: `/bucket/${source_name}`, sha256: null, normalized_text: text });

describe("temporary DOCX ingestion conveyor salvage", () => {
  it("Utah filename wins over stray Colorado body mention", () => {
    const candidates = __testing.build_candidates(row("Colorado is mentioned in a note.\n\nUtah Housing Assistance Program\nPhone / Website: (801) 555-1212 https://jobs.utah.gov"));
    expect(candidates[0].payload.final_jurisdiction).toBe("Utah");
    expect(candidates[0].jurisdiction).toBe("Utah");
  });

  it("Information does not become canonical candidate name", () => {
    const candidates = __testing.build_candidates(row("Information\nPhone / Website: (801) 555-1212 example.org"));
    expect(candidates[0].candidate_type).not.toBe("benefit_program");
    expect(String(candidates[0].name)).toMatch(/^review_fragment:/);
  });

  it("Filing / Complaint Portal does not become canonical candidate name", () => {
    const candidates = __testing.build_candidates(row("Filing / Complaint Portal\nWebsite: dlt.ri.gov/tdi", "rhode-island.docx"));
    expect(candidates[0].candidate_type).not.toBe("benefit_program");
    expect(String(candidates[0].name)).toMatch(/^review_fragment:/);
  });

  it("Generic header followed by useful contact data is preserved as context/review, not dropped", () => {
    const candidates = __testing.build_candidates(row("Contact\nPhone / Website: (801) 555-1212 rils.org"));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payload.review_reason).toBe("generic_header_candidate");
  });

  it("Useful candidate after Information still promotes", () => {
    const candidates = __testing.build_candidates(row("Information\nGeneral directory notes.\n\nUtah Food Assistance Program\nEligibility: Utah residents\nWebsite: myRIbenefits.ri.gov"));
    expect(candidates.some((candidate) => candidate.candidate_type === "benefit_program" && candidate.name === "Utah Food Assistance Program")).toBe(true);
  });

  it("Candidate with no useful bound values is held review, not promotable", () => {
    const candidates = __testing.build_candidates(row("Utah Assistance Program\nGeneral words only."));
    expect(candidates[0].candidate_type).toBe("review_fragment");
    expect(candidates[0].payload.review_reason).toBe("missing_useful_bound_fields");
  });

  it("Naked domains extract", () => {
    const extracted = __testing.extract_obvious_values("dlt.ri.gov/tdi rils.org myRIbenefits.ri.gov");
    expect(extracted.urls).toEqual(expect.arrayContaining(["dlt.ri.gov/tdi", "rils.org", "myRIbenefits.ri.gov"]));
  });

  it("Mixed phone/website line fans out correctly", () => {
    const candidates = __testing.build_candidates(row("Utah Assistance Program\nPhone / Website: (801) 555-1212 dlt.ri.gov/tdi"));
    expect(candidates[0].payload.phone).toContain("(801) 555-1212");
    expect(candidates[0].payload.website).toBe("dlt.ri.gov/tdi");
  });

  it("Phone/website leftover text does not pollute phone", () => {
    const candidates = __testing.build_candidates(row("Utah Assistance Program\nPhone / Website: (801) 555-1212 dlt.ri.gov/tdi call before applying"));
    expect(candidates[0].payload.phone).toBe("(801) 555-1212");
    expect(candidates[0].payload.apply_notes).toContain("call before applying");
  });

  it("Thin fragments are preserved as human_review_required rows with provenance", () => {
    const candidates = __testing.build_candidates(row("Utah Assistance Program\nGeneral words only."));
    expect(candidates[0].payload.extraction_status).toBe("human_review_required");
    expect(candidates[0].provenance.source_queue_id).toBe(42);
    expect(candidates[0].provenance.source_excerpt).toContain("General words only");
  });

  it("No global source failure from bad fragments", () => {
    const candidates = __testing.build_candidates(row("Information\nNotes.\n\nUtah Housing Assistance Program\nPhone: (801) 555-1212"));
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.some((candidate) => candidate.candidate_type === "benefit_program")).toBe(true);
  });
});

describe("authoritative DOCX conveyor preservation", () => {
  it("reads bound fields from forensic provenance when normalized DOCX candidates have no payload", () => {
    const row = {
      candidate_type: "resource_block",
      name: "Utah Legal Services",
      source_file: "registry files/utah.docx",
      source_citation: "registry files/utah.docx",
      jurisdiction: "Utah",
      content_hash: "abc123",
      confidence: 0.82,
      promotion_lane: "state_enriched_registry_docx_review",
      document_family: "state_enriched_registry_docx_review",
      forensic_provenance: {
        source_excerpt: "Utah Legal Services | Phone: (801) 555-1212 | Website: utahlegalservices.org | Eligibility: Utah residents",
        phone: "(801) 555-1212",
        website: "utahlegalservices.org",
        eligibility: "Utah residents",
        field_metadata: { description: "Civil legal help" },
      },
    };

    expect(__testing.candidate_payload_text(row, ["phone"])).toBe("(801) 555-1212");
    expect(__testing.candidate_payload_text(row, ["website"])).toBe("utahlegalservices.org");
    expect(__testing.candidate_payload_text(row, ["description"])).toBe("Civil legal help");
    expect(__testing.verify_registry_candidate(row).verified).toBe(true);
  });

  it("keeps resource-like normalized DOCX blocks promotion-eligible without relabeling them as benefit programs", () => {
    expect(__testing.candidate_is_resource_like({ candidate_type: "resource_block" })).toBe(true);
    expect(__testing.candidate_is_resource_like({ candidate_type: "label_value" })).toBe(true);
  });
});
