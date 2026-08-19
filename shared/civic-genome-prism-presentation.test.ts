import { describe, expect, it } from "vitest";

import { civic_genome_prism_display } from "./civic-genome-prism-presentation";

describe("Civic Genome Prism human presentation", () => {
  it("does not convert a structural source-location mismatch into final-bill language", () => {
    const display = civic_genome_prism_display({
      prism_verification_status: "contradicted",
      prism_contradictions: [{
        check: "declared_section_matches_source",
        finding: "structural_verification_mismatch",
        expected: "not_observed",
        observed: "Document",
      }],
    });

    expect(display).toEqual({
      token: "technical_verification_finding",
      label: "Technical verification finding",
      tone: "finding",
    });
  });

  it("labels an official not-adopted amendment disposition directly", () => {
    const display = civic_genome_prism_display({
      prism_verification_status: "contradicted",
      prism_supported_findings: [{
        check: "amendment_disposition_matches_source",
        finding: "deterministic_check_passed",
        observed: "not_adopted",
        source_disposition: "not_adopted",
      }],
      prism_contradictions: [{
        check: "amendment_disposition_matches_trait",
        finding: "structural_verification_mismatch",
        expected: "not_adopted",
        observed: "pending",
      }],
    });

    expect(display.label).toBe("Amendment not adopted");
    expect(display.token).toBe("amendment_not_adopted");
  });

  it("surfaces disagreement between official amendment source and Docket disposition", () => {
    const display = civic_genome_prism_display({
      prism_verification_status: "contradicted",
      prism_contradictions: [{
        check: "amendment_disposition_matches_source",
        finding: "structural_verification_mismatch",
        expected: "adopted",
        observed: "not_adopted",
      }],
    });

    expect(display.label).toBe("Amendment disposition conflict");
    expect(display.token).toBe("amendment_disposition_conflict");
  });

  it("does not treat absence of a second source as a legislative evidence gap", () => {
    const display = civic_genome_prism_display({
      prism_verification_status: "supported_by_one_source",
      prism_unresolved_conditions: [{
        condition: "independent_authoritative_source_not_supplied",
        scope: "one immutable official Rosetta source snapshot replayed",
      }],
    });

    expect(display.label).toBe("Official legislative source verified");
    expect(display.tone).toBe("supported");
  });
});
