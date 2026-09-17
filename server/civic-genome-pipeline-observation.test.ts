import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describeUnobservedCurrentResult,
  isCurrentResultHold,
  pipelineExtractionPresentation,
  pipelinePublicationPresentation,
  type CivicGenomePipelineObservation,
} from "../shared/civic-genome-pipeline-observation";

const { query, getBill, bySource, byIdentifier } = vi.hoisted(() => ({
  query: vi.fn(), getBill: vi.fn(), bySource: vi.fn(), byIdentifier: vi.fn(),
}));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./civic-genome-source-id", () => ({ get_genome_bill_by_source_id: getBill }));
vi.mock("./civic-genome-rosetta-contract", () => ({
  get_latest_rosetta_law_view_by_source_document: bySource,
  get_latest_rosetta_law_view_by_document_identifier: byIdentifier,
}));
import { get_civic_genome_rosetta_pipeline_status } from "./civic-genome-operating-contracts";

const observation: CivicGenomePipelineObservation = {
  contract_state: "waiting_for_extraction",
  source_document_id: 19607,
  extraction_run_id: null,
  run_status: null,
  current_version_type: "introduced",
  published_source_document_id: null,
  published_version_type: null,
};
const held = {
  ...observation,
  contract_state: "awaiting_current_result",
  queue_state: "degraded",
  queue_last_failure_class: "awaiting_current_result",
  queue_attempt_count: 0,
  queue_next_attempt_at: "infinity",
  queue_locked_at: null,
};

function selectVersion(overrides: Record<string, unknown> = {}) {
  query.mockResolvedValueOnce({ rows: [{
    current_version_type: "introduced",
    current_processing_state: "source_ingested",
    current_source_document_id: 19607,
    published_version_type: null,
    published_processing_state: null,
    published_source_document_id: null,
    published_extraction_run_id: null,
    ...overrides,
  }] });
}

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
  getBill.mockResolvedValue({ genome_bill_id: "11111111-1111-4111-8111-111111111111" });
  bySource.mockResolvedValue(null);
  byIdentifier.mockResolvedValue(null);
});

describe("exact source acquisition is independent of extraction availability", () => {
  it("preserves an acquired source when no extraction exists", async () => {
    selectVersion();
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(bySource).toHaveBeenCalledWith(19607);
    expect(byIdentifier).not.toHaveBeenCalled();
    expect(result.source_document_id).toBe(19607);
    expect(result.extraction_run_id).toBeNull();
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("exact source is preserved");
    expect(result.contract_message).not.toContain("No exact Rosetta source document exists");
  });

  it("preserves source identity when the Rosetta read fails", async () => {
    selectVersion();
    bySource.mockRejectedValue(new Error("temporary_owner_timeout"));
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.source_document_id).toBe(19607);
    expect(result.contract_state).toBe("contract_error");
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("does not mean source absence");
  });

  it("reports an exact current-result hold without inventing an attempt or run", async () => {
    selectVersion({
      queue_state: "degraded", queue_attempt_count: 0,
      queue_last_failure_class: "awaiting_current_result",
      queue_next_attempt_at: "infinity", queue_locked_at: null,
    });
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result).toMatchObject({
      source_document_id: 19607, extraction_run_id: null,
      contract_state: "awaiting_current_result", can_assemble: false,
      queue_state: "degraded", queue_attempt_count: 0,
      queue_last_failure_class: "awaiting_current_result",
      queue_next_attempt_at: "infinity", queue_locked_at: null,
    });
    expect(result.contract_message).toContain("not evidence of active decomposition");
    expect(query.mock.calls[0][0]).toContain("where bill_version_id = current.bill_version_id");
  });

  it("does not turn transport degradation into a current-result hold", async () => {
    selectVersion({ queue_state: "degraded", queue_last_failure_class: "transient" });
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.queue_last_failure_class).toBe("transient");
  });

  it("does not infer global source absence from an unbound version", async () => {
    selectVersion({ current_source_document_id: null, current_processing_state: "registered" });
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.source_document_id).toBeNull();
    expect(bySource).not.toHaveBeenCalled();
    expect(result.contract_message).toContain("does not establish that the source bytes are absent elsewhere");
  });

  it("keeps missing queue evidence unknown rather than reporting zero attempts", async () => {
    selectVersion();
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.queue_state).toBeNull();
    expect(result.queue_attempt_count).toBeNull();
    expect(result.queue_next_attempt_at).toBeNull();
  });

  it("retains both source identities while a different prior publication exists", async () => {
    selectVersion({ published_version_type: "engrossed", published_source_document_id: 44,
      published_processing_state: "verified", published_extraction_run_id: "11" });
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.source_document_id).toBe(19607);
    expect(result.published_source_document_id).toBe(44);
    expect(result.published_extraction_run_id).toBe(11);
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).toContain("remains published separately");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(result.can_assemble).toBe(false);
  });

  it("reports a hold even when a separate older publication is retained", async () => {
    selectVersion({ queue_state: "degraded", queue_last_failure_class: "awaiting_current_result",
      published_version_type: "engrossed", published_source_document_id: 44,
      published_processing_state: "verified", published_extraction_run_id: "11" });
    const result = await get_civic_genome_rosetta_pipeline_status(1939033);
    expect(result.contract_state).toBe("awaiting_current_result");
    expect(result.source_document_id).toBe(19607);
    expect(result.published_source_document_id).toBe(44);
    expect(result.can_assemble).toBe(false);
  });
});

describe("evidence-based pipeline presentation", () => {
  it("requires both degraded state and the exact hold class", () => {
    expect(isCurrentResultHold(held)).toBe(true);
    expect(isCurrentResultHold({ ...held, queue_state: "completed" })).toBe(false);
    expect(isCurrentResultHold({ ...held, queue_last_failure_class: "transient" })).toBe(false);
  });
  it("does not claim a missing source has been acquired merely because a hold exists", () => {
    expect(describeUnobservedCurrentResult({ ...held, source_document_id: null })).toContain("binding was not observed");
  });
  it("does not label an acquired but unprocessed source as processing", () => {
    expect(pipelinePublicationPresentation(observation).value).toBe("Not yet published");
    expect(pipelineExtractionPresentation(observation).value).toBe("No result observed");
  });
  it("shows an indefinite zero-attempt hold as held, not running", () => {
    expect(pipelinePublicationPresentation(held).value).toBe("Held — awaiting result");
    expect(pipelineExtractionPresentation(held).value).toBe("Held — awaiting result");
  });
  it("keeps a prior snapshot distinct from the pending current result", () => {
    const prior = pipelinePublicationPresentation({ ...held, published_source_document_id: 44, published_version_type: "engrossed" });
    expect(prior.value).toBe("Prior snapshot available");
    expect(prior.detail).toContain("not a current-version result");
  });
  it("does not turn read failure into a publication or extraction verdict", () => {
    const unavailable = { ...held, contract_state: "contract_error" };
    expect(pipelinePublicationPresentation(unavailable).value).toBe("Status unavailable");
    expect(pipelineExtractionPresentation(unavailable).value).toBe("Status unavailable");
  });
  it("distinguishes decomposition completion from governed publication", () => {
    const ready = { ...observation, contract_state: "ready_for_assembly", extraction_run_id: 22, run_status: "completed" };
    expect(pipelineExtractionPresentation(ready).value).toBe("Decomposition complete");
    expect(pipelinePublicationPresentation(ready).value).toBe("Not yet published");
  });
  it("keeps the assembled result presentation without authorizing assembly itself", () => {
    expect(pipelinePublicationPresentation({ ...observation, contract_state: "assembled" }).value).toBe("Published");
  });
  it("does not treat a stored running state as an independently verified heartbeat", () => {
    const running = pipelineExtractionPresentation({ ...observation, extraction_run_id: 22, run_status: "in_progress" });
    expect(running.value).toBe("Run reports in progress");
    expect(running.detail).toContain("not a worker heartbeat");
  });
  it("binds the actual page to the shared presentation and removes unsupported guarantees", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/CivicGenome.tsx"), "utf8");
    expect(page).toContain("pipelinePublicationPresentation(rosetta_pipeline.data)");
    expect(page).toContain("pipelineExtractionPresentation(rosetta_pipeline.data)");
    expect(page).toContain("queue_attempt_count");
    expect(page).toContain("No automatic retry scheduled");
    expect(page).not.toContain('"Processing"');
    expect(page).not.toContain("No operator action is required");
    expect(page).not.toContain("processing automatically");
    expect(page).not.toContain("Automatic pipeline is resolving this snapshot");
  });
});
