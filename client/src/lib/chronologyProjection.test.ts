import { describe, expect, it } from "vitest";
import {
  humanize_chronology_value,
  project_legacy_event_to_chronology,
  source_message_time_label,
  sort_chronology_records,
} from "./chronologyProjection";

describe("project_legacy_event_to_chronology", () => {
  it("projects current event output without upgrading fact status", () => {
    const record = project_legacy_event_to_chronology({
      id: 7,
      title: "Facility visit",
      description: "Janine visited after work.",
      dateOccurred: "2026-07-01",
      eventType: "visit",
      documentId: 42,
    });

    expect(record.chronology_event_id).toBe("legacy-event-7");
    expect(record.observed_event).toBe("Facility visit — Janine visited after work.");
    expect(record.source_references).toEqual(["document:42", "legacy_event:7"]);
    expect(record.source_confidence_level).toBe("reported");
    expect(record.fact_status).toBe("reported");
  });

  it("supports snake_case event input at the boundary", () => {
    const record = project_legacy_event_to_chronology({
      id: "event-8",
      title: "Court papers received",
      date_occurred: "2026-07-02",
      event_type: "court_filing",
      document_id: "petition",
    });

    expect(record.event_date).toBe("2026-07-02");
    expect(record.event_type).toBe("court_filing");
    expect(record.source_references).toEqual([
      "document:petition",
      "legacy_event:event-8",
    ]);
  });

  it("uses the versioned projection identity for intake chronology variants", () => {
    const record = project_legacy_event_to_chronology({
      id: "event-shared@variant-a",
      title: "Resident 12 fell",
      projection_source: "universal_intake_spine",
      canonical_event_id: "event-shared",
      canonical_projection_variant_id: "event-shared@variant-a",
      canonical_verification_status: "document_stated",
      canonical_source_artifact_key: "artifact-shared",
    });

    expect(record.chronology_event_id).toBe("event-shared@variant-a");
    expect(record.source_references).toContain(
      "intake_event:event-shared@variant-a",
    );
  });

  it("retains source-local clock provenance without upgrading the date to an exact instant", () => {
    const localTime = {
      source_message_local_time: "2026-01-05T23:59:42",
      source_message_timezone: "unknown" as const,
      source_message_timestamp_text: "Jan 5, 2026 11:59:42 PM",
    };
    const record = project_legacy_event_to_chronology({
      id: "html-event", title: "I visited the facility.", documentId: 42,
      dateOccurred: "2026-01-05", projection_source: "universal_intake_spine",
      canonical_date_precision: "exact", canonical_verification_status: "document_stated", ...localTime,
    });
    expect(record).toMatchObject({ ...localTime, event_date: "2026-01-05", event_date_precision: "exact_date", fact_status: "document_stated" });
    expect(source_message_time_label(record)).toBe("Source time: Jan 5, 2026 11:59:42 PM · timezone not recorded");
    expect(source_message_time_label({ source_message_local_time: "2026-01-05T23:59:42", source_message_timezone: "unknown" })).toBe("Source time: 2026-01-05 23:59:42 · timezone not recorded");
  });

  it("leaves existing XML-style chronology shapes unchanged when local provenance is absent", () => {
    const record = project_legacy_event_to_chronology({ id: "xml-event", title: "A visit", projection_source: "universal_intake_spine" });
    for (const field of ["source_message_local_time", "source_message_timezone", "source_message_timestamp_text"]) expect(record).not.toHaveProperty(field);
    expect(source_message_time_label(record)).toBeNull();
  });
});

describe("sort_chronology_records", () => {
  it("sorts dated records first and preserves unknown dates", () => {
    const later = project_legacy_event_to_chronology({
      id: 2,
      title: "Later",
      dateOccurred: "2026-07-03",
    });
    const unknown = project_legacy_event_to_chronology({
      id: 3,
      title: "Unknown",
    });
    const earlier = project_legacy_event_to_chronology({
      id: 1,
      title: "Earlier",
      dateOccurred: "2026-07-01",
    });

    expect(sort_chronology_records([later, unknown, earlier]).map(record => record.chronology_event_id)).toEqual([
      "legacy-event-1",
      "legacy-event-2",
      "legacy-event-3",
    ]);
  });
});

describe("humanize_chronology_value", () => {
  it("formats owned enum values for display", () => {
    expect(humanize_chronology_value("primary_document_confirmed")).toBe("Primary Document Confirmed");
  });
});
