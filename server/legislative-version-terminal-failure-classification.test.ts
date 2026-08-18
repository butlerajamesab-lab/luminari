import { describe, expect, it } from "vitest";

import { classify_legislative_version_failure } from "./civic-genome-legislative-version-queue-worker";

function classify(message: string) {
  return classify_legislative_version_failure({
    error: new Error(message),
    prior_attempt_count: 0,
  });
}

describe("legislative version terminal failure classification", () => {
  it.each([
    "legislative_version_source_empty",
    "legislative_version_source_fetch_failed:404",
    "docket_html_text_incomplete",
    "california_official_pdf_unavailable:text_html__charset_UTF-8",
    "rosetta_completed_run_has_no_operative_or_structural_evidence",
    "legislative_version_rosetta_extraction_failed:400:{code:22000,message:rosetta_v23_amendment_operation_verb_missing}",
  ])("fails closed on deterministic same-input failures: %s", (message) => {
    expect(classify(message)).toMatchObject({
      queue_state: "permanent_failure",
      failure_class: "deterministic_contract",
      terminal: true,
      retry_delay_seconds: 0,
    });
  });

  it.each([
    "legislative_version_rosetta_extraction_timeout:60000",
    "legislative_version_source_fetch_failed:403",
    "legislative_version_source_fetch_failed:500",
    "legislative_version_source_fetch_network_failed:legislature_mi_gov:UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ])("keeps potentially recoverable infrastructure failures retryable: %s", (message) => {
    expect(classify(message)).toMatchObject({
      queue_state: "degraded",
      failure_class: "transient",
      terminal: false,
      retry_delay_seconds: 30,
    });
  });
});
