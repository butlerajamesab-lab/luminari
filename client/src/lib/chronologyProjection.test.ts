import { describe, expect, it } from "vitest";
import {
  humanize_chronology_value,
  project_legacy_event_to_chronology,
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
