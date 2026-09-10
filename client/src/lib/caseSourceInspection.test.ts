import { describe, expect, it } from "vitest";
import { filter_source_events, inspect_document_pair, project_source_events, source_document_id, source_document_options } from "./caseSourceInspection";

const events = project_source_events([
  { id: "one", title: "Ada visited the facility.", dateOccurred: "2026-03-04", documentId: 12, documentFilename: "message.xml", projection_source: "universal_intake_spine", canonical_verification_status: "document_stated", canonical_source_artifact_key: "artifact-message", canonical_source_span_offset: 0, canonical_event_scope: "case_specific", canonical_actor: "Ada" },
  { id: "two", title: "Staff AB recorded a visit.", dateOccurred: "2026-03-04", documentId: 15, documentFilename: "survey.pdf", projection_source: "universal_intake_spine", canonical_verification_status: "document_stated", canonical_source_artifact_key: "artifact-survey", canonical_source_span_offset: 200, canonical_event_scope: "facility_wide" },
  { id: "three", title: "An unrelated statement.", documentId: 19, projection_source: "universal_intake_spine", canonical_verification_status: "unresolved" },
]);

describe("source inspection", () => {
  it("keeps exact document/source/offset/status while filtering scope, text and document", () => {
    const result = filter_source_events(events, { document_id: "12", scope: "case_specific", query: "ADA", status: "document_stated" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ document_filename: "message.xml", actor: "Ada", fact_status: "document_stated", source_confidence_level: "source_bound" });
    expect(result[0].source_references).toContain("source_offset:0");
    expect(filter_source_events(events, { document_id: "12", scope: "facility_wide" })).toEqual([]);
  });

  it("compares separate source lists without turning a common date into corroboration", () => {
    const pair = inspect_document_pair(events, 12, 15);
    expect(pair.source_events.map(event => event.document_id)).toEqual(["12"]);
    expect(pair.target_events.map(event => event.document_id)).toEqual(["15"]);
    expect(pair.verification_state).toBe("unverified_candidate");
    expect([...pair.source_events, ...pair.target_events].map(event => event.fact_status)).toEqual(["document_stated", "document_stated"]);
    expect(inspect_document_pair(events, null, "not-a-document").source_events).toEqual([]);
  });

  it("keeps uploaded documents with zero extracted events selectable", () => {
    const options = source_document_options(events, [{ id: 21, filename: "letter.docx" }, { id: 12, filename: "preserved-message.xml" }]);
    expect(options.find(option => option.id === "21")).toEqual({ id: "21", filename: "letter.docx", event_count: 0 });
    expect(options.find(option => option.id === "12")).toEqual({ id: "12", filename: "preserved-message.xml", event_count: 1 });
    expect(filter_source_events(events, { document_id: "21" })).toEqual([]);
  });

  it("does not convert missing scope/status into case-specific or corroborated evidence", () => {
    expect(events.find(event => event.document_id === "19")).toMatchObject({ event_scope: "unknown", fact_status: "unresolved" });
    for (const value of [0, -1, "NaN", "1/../../admin", Number.MAX_SAFE_INTEGER + 1]) expect(source_document_id(value)).toBeNull();
  });
});
