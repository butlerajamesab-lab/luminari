import { describe, expect, it } from "vitest";
import { pipelineExtractionPresentation, pipelinePublicationPresentation, type CivicGenomePipelineObservation } from "../shared/civic-genome-pipeline-observation";

const held: CivicGenomePipelineObservation = {
  contract_state: "awaiting_current_result",
  source_document_id: 19607,
  extraction_run_id: null,
  run_status: null,
  current_version_type: "introduced",
  published_source_document_id: null,
  published_version_type: null,
  queue_state: "degraded",
  queue_last_failure_class: "awaiting_current_result",
};

describe("result arrival does not erase independent queue or publication evidence", () => {
  it("shows an arriving extraction while retaining its unreconciled publication hold", () => {
    const arrived = { ...held, contract_state: "ready_for_assembly", extraction_run_id: 22, run_status: "completed" };
    expect(pipelineExtractionPresentation(arrived).value).toBe("Decomposition complete");
    expect(pipelinePublicationPresentation(arrived).value).toBe("Held — reconciliation needed");
  });

  it("does not let old saved-publication metadata override a current-result read failure", () => {
    const result = pipelinePublicationPresentation({ ...held, contract_state: "contract_error", published_source_document_id: 19607 });
    expect(result.value).toBe("Status unavailable");
    expect(result.detail).toContain("No publication is inferred");
    expect(result.detail).not.toContain("Saved snapshot");
  });

  it("keeps a rejected result blocked when stale hold metadata remains", () => {
    const result = pipelinePublicationPresentation({ ...held, contract_state: "blocked", extraction_run_id: 22, run_status: "completed" });
    expect(result.value).toBe("Blocked");
  });
});
