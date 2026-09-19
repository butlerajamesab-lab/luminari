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

  it("shows a completed extraction separately from its generation publication hold", () => {
    const publicationHeld = {
      ...held,
      contract_state: "awaiting_publication",
      extraction_run_id: 1014064,
      run_status: "completed",
      queue_last_failure_class: "awaiting_publication",
    };
    expect(pipelineExtractionPresentation(publicationHeld).value).toBe("Decomposition complete");
    expect(pipelinePublicationPresentation(publicationHeld).value).toBe("Awaiting generation publication");
    expect(pipelinePublicationPresentation(publicationHeld).detail).toContain("governed current generation");
  });

  it("does not label a saved publication of the same source as a prior source", () => {
    const result = pipelinePublicationPresentation({ ...held, contract_state: "contract_error", published_source_document_id: 19607 });
    expect(result.value).toBe("Saved snapshot available");
    expect(result.detail).not.toContain("not a current-version result");
  });

  it("keeps a rejected result blocked when stale hold metadata remains", () => {
    const result = pipelinePublicationPresentation({ ...held, contract_state: "blocked", extraction_run_id: 22, run_status: "completed" });
    expect(result.value).toBe("Blocked");
  });
});
