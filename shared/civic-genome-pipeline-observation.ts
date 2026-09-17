/** Read-model presentation only. None of these observations authorizes execution or publication. */
export type CivicGenomePipelineObservation = {
  contract_state: string;
  source_document_id: number | null;
  extraction_run_id: number | null;
  run_status: string | null;
  current_version_type: string | null;
  published_source_document_id: number | null;
  published_version_type: string | null;
  queue_state?: string | null;
  queue_last_failure_class?: string | null;
  queue_attempt_count?: number | null;
  queue_next_attempt_at?: string | null;
  queue_locked_at?: string | null;
};

export function isCurrentResultHold(observation: Pick<CivicGenomePipelineObservation, "queue_state" | "queue_last_failure_class">): boolean {
  return observation.queue_state === "degraded"
    && observation.queue_last_failure_class === "awaiting_current_result";
}

export function describeUnobservedCurrentResult(observation: Pick<CivicGenomePipelineObservation,
  "source_document_id" | "queue_state" | "queue_last_failure_class">): string {
  if (isCurrentResultHold(observation)) {
    return observation.source_document_id != null
      ? "The exact source is preserved. This job is held awaiting a current Rosetta result; the hold is not evidence of active decomposition."
      : "This job is held awaiting a current Rosetta result, but its exact source binding was not observed. Source reconciliation is required.";
  }
  return observation.source_document_id != null
    ? "The exact source is preserved, but no current Rosetta decomposition result was observed. Active execution is not established by source acquisition."
    : "No exact Rosetta source binding was observed for the selected Docket version. This does not establish that the source bytes are absent elsewhere.";
}

export function pipelinePublicationPresentation(observation: CivicGenomePipelineObservation): { value: string; detail: string } {
  if (observation.contract_state === "assembled") {
    return { value: "Published", detail: "Current snapshot decomposed and verified" };
  }
  if (observation.published_source_document_id != null) {
    const same_source = observation.published_source_document_id === observation.source_document_id;
    return {
      value: same_source ? "Saved snapshot available" : "Prior snapshot available",
      detail: same_source
        ? `Saved publication · document ${observation.published_source_document_id}. The current result could not be confirmed as assembled.`
        : `Latest verified ${observation.published_version_type ?? "prior"} snapshot · document ${observation.published_source_document_id}. This is not a current-version result.`,
    };
  }
  if (observation.contract_state === "contract_error") {
    return { value: "Status unavailable", detail: "The current result could not be read. No publication is inferred." };
  }
  if (observation.contract_state === "blocked") {
    return { value: "Blocked", detail: "No current publishable result has been established." };
  }
  if (isCurrentResultHold(observation) || observation.contract_state === "awaiting_current_result") {
    if (observation.extraction_run_id != null && observation.run_status?.toLowerCase() === "completed") {
      return { value: "Held — reconciliation needed", detail: "A completed extraction is reported, but the queue hold remains. This does not establish governed publication." };
    }
    return { value: "Held — awaiting result", detail: "Source acquisition is not decomposition or publication. The current-result hold must be reconciled before processing can continue." };
  }
  if (observation.contract_state === "ready_for_assembly") {
    return { value: "Not yet published", detail: "A decomposition result is available; governed assembly and publication are separate steps." };
  }
  return {
    value: "Not yet published",
    detail: observation.source_document_id != null
      ? "The source is preserved. No current published result was observed."
      : "The exact source binding and current published result have not been observed.",
  };
}

export function pipelineExtractionPresentation(observation: CivicGenomePipelineObservation): { value: string; detail: string } {
  // A read error takes precedence over queue metadata or a previously recorded run ID.
  if (observation.contract_state === "contract_error") {
    return { value: "Status unavailable", detail: "The current Rosetta result could not be read." };
  }
  if (observation.extraction_run_id != null && observation.run_status != null) {
    const state = observation.run_status.toLowerCase();
    return {
      value: state === "completed" ? "Decomposition complete"
        : state === "in_progress" || state === "running" ? "Run reports in progress"
          : state === "failed" ? "Decomposition failed" : observation.run_status,
      detail: `run ${observation.extraction_run_id} · reported run state, not a worker heartbeat`,
    };
  }
  if (isCurrentResultHold(observation) || observation.contract_state === "awaiting_current_result") {
    return { value: "Held — awaiting result", detail: "No active decomposition is established by this hold." };
  }
  return {
    value: "No result observed",
    detail: observation.source_document_id != null
      ? "Source preserved; a source ID does not prove parser execution."
      : "No current extraction receipt was observed.",
  };
}
