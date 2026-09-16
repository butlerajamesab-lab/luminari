import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { use_query } = vi.hoisted(() => ({ use_query: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { civicGenome: { get_rosetta_evaluation: { useQuery: use_query } } } }));
import { RosettaEvaluation } from "./RosettaEvaluation";

const current_version = { bill_version_id: "current-version", version_type: "enrolled" };
function render() { return renderToStaticMarkup(<RosettaEvaluation genome_bill_id="genome" current_version={current_version} published_version={null}/>); }
beforeEach(() => { vi.resetAllMocks(); });

describe("Rosetta evaluation reader", () => {
  it("renders the bounded current result with a stable feedback reference", () => {
    use_query.mockReturnValue({ data: { availability: "available", binding: current_version, review_url: "https://example.org/review/source", current_docket_result: {
      status: "complete", docket_source_key: "text:123:456", source_registry_id: "source", source_content_hash: "hash", public_reason: "Current result is assembly-ready.",
      current_result: { extraction_run_id: "9821", engine_version: "2.5.33", admissibility_state: "admissible" },
      validation_summary: { validator_count: 9 }, coverage: { definition: { status: "populated" } },
    } } });
    const html = render();
    expect(use_query.mock.calls[0][0]).toEqual({ genome_bill_id: "genome", bill_version_id: "current-version" });
    expect(html).toContain("Decomposition complete");
    expect(html).toContain("2.5.33");
    expect(html).toContain("Current result is assembly-ready.");
    expect(html).toContain("Rosetta decomposition");
    expect(html).toContain("Read each legislative text version and inspect its own current-engine validation");
    expect(html).toContain("Copy reference for feedback");
    expect(html).toContain("Docket source key: text:123:456");
    expect(html).not.toContain("Attempt:");
  });

  it("does not expose transport diagnostics on read failure", () => {
    use_query.mockReturnValue({ error: new Error("private diagnostic") });
    const html = render();
    expect(html).toContain("bounded status is unknown");
    expect(html).not.toContain("private diagnostic");
  });

  it("does not claim a source binding when it is missing", () => {
    use_query.mockReturnValue({ data: { availability: "binding_missing", review_url: "https://example.org/review", current_docket_result: null } });
    const html = render();
    expect(html).toContain("does not yet have an exact Rosetta document and content-hash binding");
    expect(html).toContain("choose a source explicitly");
    expect(html).not.toContain("Complete");
  });

  it("renders explicit non-assembly current states without fallback detail", () => {
    use_query.mockReturnValue({ data: { availability: "available", binding: current_version, review_url: "https://example.org/review/source", current_docket_result: {
      status: "awaiting_analysis", docket_source_key: "text:123:456", source_registry_id: "source", source_content_hash: "hash", public_reason: "Awaiting current analysis.",
      current_result: null, validation_summary: { validator_count: 0 }, coverage: {},
    } } });
    const html = render();
    expect(html).toContain("Awaiting analysis");
    expect(html).toContain("Awaiting current analysis.");
    expect(html).not.toContain("Attempt:");
    expect(html).not.toContain("candidate analysis");
  });
});


it("keeps every text selectable and exposes the selected version's predecessor", () => {
  use_query.mockReturnValue({ data: { availability: "binding_missing", review_url: "https://example.org/review" } });
  const versions = [1, 2, 3, 4].map(n => ({
    bill_version_id: `v${n}`, version_type: "introduced", provider_sequence: n,
    source_document_key: `text:2034656:${n}`, processing_state: "registered",
    source_url: `https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633${n === 4 ? "rs" : "ih"}.pdf`,
    predecessor_bill_version_id: n > 1 ? `v${n - 1}` : null,
  }));
  const html = renderToStaticMarkup(<RosettaEvaluation genome_bill_id="genome" current_version={versions[3]} published_version={null} source_versions={versions}/>);
  expect((html.match(/<option /g) ?? []).length).toBe(4);
  expect(html).toContain("RS · text 4 · latest full text");
  expect(html).toContain("Preceding text:");
  expect(html).toContain("Read this bill text");
  expect(use_query.mock.calls[0][0]).toEqual({ genome_bill_id: "genome", bill_version_id: "v4" });
});
