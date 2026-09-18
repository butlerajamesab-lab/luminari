import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const { use_query } = vi.hoisted(() => ({ use_query: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { civicGenome: { get_rosetta_evaluation: { useQuery: use_query } } } }));
import { RosettaEvaluation } from "./RosettaEvaluation";

const current_version = { bill_version_id: "current-version", version_type: "enrolled" };
function render() { return renderToStaticMarkup(<RosettaEvaluation genome_bill_id="genome" current_version={current_version} published_version={null}/>); }
const precise = {
  contract: "rosetta-current-source-result-v1",
  state: "complete",
  source_document_key: "text:123:456",
  source_content_hash: "a".repeat(64),
  rosetta_source_document_id: 77,
  rosetta_source_registry_id: "00000000-0000-4000-8000-000000000001",
  source_registry_id: "00000000-0000-4000-8000-000000000001",
  current_engine_id: "rosetta-v3-deterministic-sql-2.5.33",
  current_engine_version: "rosetta-v3-deterministic-sql-2.5.33",
  current_rule_set_version: "rules-2.5.33",
  current_rule_manifest_hash: "b".repeat(64),
  current_manifest_hash: "b".repeat(64),
  current_closure_hash: "c".repeat(64),
  current_configuration_hash: "d".repeat(64),
  stage_id: "00000000-0000-4000-8000-000000000002",
  attempt_id: "00000000-0000-4000-8000-000000000003",
  extraction_run_id: 9821,
  assembly_run_id: null,
  assembly_required: false,
  validation_run_id: null,
  validation_receipt_id: "manifest:9821",
  validation_receipt_hash: "e".repeat(64),
  output_content_hash: "f".repeat(64),
  result_eligible: true,
  failure_class: null,
  failure_code: null,
  failure_stage: null,
  failure_message_safe: null,
  held_reason: null,
  started_at: "2026-09-17T10:00:00Z",
  amendment_readiness: "not_applicable",
  base_source_document_key: null,
  base_source_content_hash: null,
  amendment_attachment_state: null,
  amendment_attachment_receipt_hash: null,
  observed_at: "2026-09-17T10:01:00Z",
  completed_at: "2026-09-17T10:01:00Z",
  receipt_hash: "1".repeat(64),
  automatic_retry: false,
  replay_policy: "explicit_distinct_remediation_only",
} as const;

beforeEach(() => { vi.resetAllMocks(); });

describe("Rosetta evaluation reader", () => {
  it("renders the bounded current result with a stable feedback reference", () => {
    use_query.mockReturnValue({ data: { availability: "available", binding: current_version, review_url: "https://example.org/review/source", current_docket_result: {
      status: "complete", docket_source_key: "text:123:456", source_registry_id: precise.source_registry_id,
      source_content_hash: precise.source_content_hash, public_reason: "Current result is assembly-ready.",
      current_result: { extraction_run_id: "9821", engine_version: "2.5.33", admissibility_state: "admissible" },
      validation_summary: { validator_count: 9 }, coverage: { definition: { status: "populated" } },
      current_source_status: precise,
    } } });
    const html = render();
    expect(use_query.mock.calls[0][0]).toEqual({ genome_bill_id: "genome", bill_version_id: "current-version" });
    expect(html).toContain("Decomposition complete");
    expect(html).toContain("2.5.33");
    expect(html).toContain("Current result is assembly-ready.");
    expect(html).toContain("Rosetta decomposition");
    expect(html).toContain("Source preservation, current admission, processing, and completion are separate states");
    expect(html).toContain("Copy reference for feedback");
    expect(html).toContain("Docket source key: text:123:456");
    expect(html).toContain("Attempt: 00000000-0000-4000-8000-000000000003");
  });

  it("renders not-admitted as preserved-but-not-admitted instead of generic unavailable", () => {
    use_query.mockReturnValue({ data: { availability: "available", binding: current_version, review_url: "https://example.org/review", current_docket_result: {
      status: "unavailable", docket_source_key: "text:123:456", source_registry_id: null,
      source_content_hash: precise.source_content_hash, public_reason: "Unavailable.", current_result: null,
      validation_summary: {}, coverage: {}, current_source_status: {
        ...precise,
        state: "not_admitted",
        rosetta_source_registry_id: null,
        source_registry_id: null,
        current_engine_id: null,
        current_engine_version: null,
        current_rule_set_version: null,
        current_rule_manifest_hash: null,
        current_manifest_hash: null,
        current_closure_hash: null,
        current_configuration_hash: null,
        stage_id: null,
        attempt_id: null,
        extraction_run_id: null,
        validation_receipt_id: null,
        validation_receipt_hash: null,
        output_content_hash: null,
        result_eligible: false,
        started_at: null,
        amendment_readiness: null,
        completed_at: null,
        receipt_hash: null,
      },
    } } });
    const html = render();
    expect(html).toContain("Source preserved · not admitted");
    expect(html).toContain("has not been admitted to the declared current processing route");
    expect(html).toContain("Rosetta source document: 77");
    expect(html).not.toContain(">Unavailable<");
    expect(html).not.toContain("Engine: not ready");
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
    expect(html).not.toContain("candidate analysis");
  });
});

it("keeps every text selectable, uses stored version metadata, and exposes the predecessor", () => {
  use_query.mockReturnValue({ data: { availability: "binding_missing", review_url: "https://example.org/review" } });
  const versions = [
    { bill_version_id: "v1", version_type: "IH", provider_sequence: 1, source_document_key: "text:2034656:1", processing_state: "registered", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633ih.pdf", predecessor_bill_version_id: null },
    { bill_version_id: "v2", version_type: "RH", provider_sequence: 2, source_document_key: "text:2034656:2", processing_state: "registered", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633ih.pdf", predecessor_bill_version_id: "v1" },
    { bill_version_id: "v3", version_type: "EH", provider_sequence: 3, source_document_key: "text:2034656:3", processing_state: "registered", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633rs.pdf", predecessor_bill_version_id: "v2" },
    { bill_version_id: "v4", version_type: "RS", provider_sequence: 4, source_document_key: "text:2034656:4", processing_state: "registered", source_url: "https://example.org/not-a-congress-filename", predecessor_bill_version_id: "v3" },
  ];
  const html = renderToStaticMarkup(<RosettaEvaluation genome_bill_id="genome" current_version={versions[3]} published_version={null} source_versions={versions}/>);
  expect((html.match(/<option /g) ?? []).length).toBe(4);
  expect(html).toContain("RH · text 2");
  expect(html).toContain("RS · text 4 · latest full text");
  expect(html).toContain("Preceding text:");
  expect(html).toContain("Read this bill text");
  expect(use_query.mock.calls[0][0]).toEqual({ genome_bill_id: "genome", bill_version_id: "v4" });
});
