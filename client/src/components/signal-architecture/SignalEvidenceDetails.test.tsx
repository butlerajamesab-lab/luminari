import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalEvidenceDetails } from "./SignalEvidenceDetails";

describe("Readable detection evidence", () => {
  it("shows the actual observation fields, comparison, and saved sample coverage", () => {
    const html = renderToStaticMarkup(<SignalEvidenceDetails artifact={{
      domain_code: "live_data", status: "unresolved", governance_status: "observation_candidate", entity_resolution_status: "unresolved",
      evidence: { supporting_statistics: { pattern_count: 2595, records_analyzed: 100000, jurisdiction_count: 19 } },
      source_observations: { reference_count: 25, invalid_reference_count: 0, truncated: false, observations: [{
        stream_id: "cfpb_complaints", event_offset: "1778372879521173", event_identity_hash: "a".repeat(64),
        resolution: "matched", observed_at: "2026-05-10T00:28:15.973Z", source_id: "cfpb_complaints", jurisdiction_id: "FL",
        payload: { complaint_id: "22042857", issue: "Improper use of your report", response: "In progress", date_received: "2026-05-09" }, spacetime: { region: "FL" },
      }] },
    }} />);
    for (const text of ["22042857", "Improper use of your report", "In progress", "2026-05-09", "Observations analyzed", "100000", "1 of 25", "2,595", "not the complete matching dataset", "does not review or corroborate"]) expect(html).toContain(text);
  });

  it("preserves exact expected and observed text and exposes extraction ambiguity", () => {
    const html = renderToStaticMarkup(<SignalEvidenceDetails artifact={{
      domain_code: "legal_pattern", status: "contradicted",
      evidence: { contradiction_refs: [{ contradiction: { check: "defined_term_bound_to_definition", finding: "structural_verification_mismatch", expected: "D1\uE0001", observed: '"d1.1" means the current version of the structural welding code_steel' } }] },
    }} />);
    expect(html).toContain("D1\uE0001");
    expect(html).toContain("code_steel");
    expect(html).toContain("private-use character");
    expect(html).toContain("does not by itself establish a contradiction in the law");
  });

  it("renders source values as text and withholds mismatched evidence", () => {
    const html = renderToStaticMarkup(<SignalEvidenceDetails artifact={{
      domain_code: "live_data", status: "unresolved", evidence: {},
      source_observations: { reference_count: 2, invalid_reference_count: 0, truncated: false, observations: [
        { stream_id: "public-source", event_offset: "1", event_identity_hash: "a", resolution: "matched", observed_at: null, source_id: null, jurisdiction_id: null, spacetime: null, payload: { description: "<script>unsafe()</script>", source_url: "javascript:alert(1)" } },
        { stream_id: "public-source", event_offset: "2", event_identity_hash: "b", resolution: "hash_mismatch", observed_at: null, source_id: null, jurisdiction_id: null, spacetime: null, payload: { description: "CHANGED CONTENT" } },
      ] },
    }} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("CHANGED CONTENT");
    expect(html).toContain("no longer matches its saved hash");
  });
});
