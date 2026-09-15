import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { use_query } = vi.hoisted(() => ({ use_query: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { civicGenome: { get_rosetta_evaluation: { useQuery: use_query } } } }));
import { RosettaEvaluation } from "./RosettaEvaluation";

const current_version = { bill_version_id: "current-version", version_type: "enrolled" };
function render() { return renderToStaticMarkup(<RosettaEvaluation genome_bill_id="genome" current_version={current_version} published_version={null}/>); }
beforeEach(() => { vi.resetAllMocks(); });

describe("Rosetta evaluation reader", () => {
  it("renders the saved five-layer candidate and the actual failed status with a stable feedback reference", () => {
    use_query.mockReturnValue({ data: { availability: "available", binding: current_version, review_url: "https://example.org/review/laws/source?attempt_id=attempt", evaluation: {
      status: "failed", observed_at: "2026-09-15T06:00:00Z", source: { document_name: "Example law", source_registry_id: "source", source_content_hash: "hash" },
      selected_attempt: { attempt_id: "attempt", engine_version: "2.5.33" }, failure_class: "final_validation_failed",
      law_view: { objects: [{ layer: "definition", source_object_type: "term_definition", source_object_id: "term-1", source_block_id: "block-1", extraction_run_id: "9821", normalized_value: { defined_term: "Resident", definition_text: "A resident lives in this state." } }], coverage: { definition: { status: "populated" } } },
      validation_results: [{ test_name: "unique_sections", test_result: "fail" }],
    } } });
    const html = render();
    expect(use_query.mock.calls[0][0]).toEqual({ genome_bill_id: "genome", bill_version_id: "current-version" });
    expect(html).toContain("Failed");
    expect(html).toContain("2.5.33");
    expect(html).toContain("final_validation_failed");
    expect(html).toContain("A resident lives in this state.");
    expect(html).toContain("candidate analysis");
    expect(html).toContain("Attempt: attempt");
    expect(html).toContain("Copy reference for feedback");
    expect(html).toContain("Help · What exists?");
    expect(html).toContain("Definitions · What do the words mean?");
  });
  it("does not describe a transport failure as an unprocessed source", () => {
    use_query.mockReturnValue({ error: new Error("private diagnostic") });
    const html = render();
    expect(html).toContain("evaluation status is unknown");
    expect(html).not.toContain("private diagnostic");
    expect(html).not.toContain("Unprocessed");
  });
  it("does not claim a source binding when it is missing", () => {
    use_query.mockReturnValue({ data: { availability: "binding_missing", review_url: "https://example.org/review", evaluation: null } });
    const html = render();
    expect(html).toContain("does not yet have an exact Rosetta document and content-hash binding");
    expect(html).toContain("choose a source explicitly");
    expect(html).not.toContain("Passed");
  });
});
