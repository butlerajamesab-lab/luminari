import { describe, expect, it } from "vitest";
import {
  adapt_legacy_event_to_chronology,
  chronology_record_schema,
  safe_parse_chronology_record,
} from "./chronology-contract";

const base_record = {
  chronology_event_id: "J-CHR-0001",
  case_id: "b4e2c1d0-1234-4abc-8def-000000000001",
  event_date: "2026-07-01",
  event_date_precision: "exact_date" as const,
  source_date: "2026-07-01",
  observed_event: "Janine signed the facility visitor log.",
  people_involved: ["Janine", "Mother"],
  entity_ids: ["person-janine", "person-mother"],
  source_references: ["visitor_log:2026-07-01"],
  evidence_item_ids: [101],
  why_it_matters: "Documents the visit independently of later recollection.",
  immediate_consequence: null,
  outstanding_follow_up: "Request a certified copy of the full visitor log.",
  source_confidence_level: "contemporaneous_record" as const,
  fact_status: "corroborated" as const,
  created_from_path: "manual" as const,
  normalization_version: "chronology_contract_v1",
  created_at: "2026-07-16T00:00:00.000Z",
  updated_at: "2026-07-16T00:00:00.000Z",
};

describe("chronology_record_schema", () => {
  it("accepts a source-grounded chronology record", () => {
    expect(chronology_record_schema.parse(base_record)).toEqual(base_record);
  });

  it("rejects confirmed status with unknown source confidence", () => {
    const result = safe_parse_chronology_record({
      ...base_record,
      fact_status: "confirmed",
      source_confidence_level: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("requires unknown precision when no event date exists", () => {
    const result = safe_parse_chronology_record({
      ...base_record,
      event_date: null,
      event_date_precision: "exact_date",
    });

    expect(result.success).toBe(false);
  });

  it("preserves disputed records instead of rejecting them", () => {
    const disputed = chronology_record_schema.parse({
      ...base_record,
      fact_status: "disputed",
      source_confidence_level: "reported",
      observed_event: "Janine reports that access was denied.",
    });

    expect(disputed.fact_status).toBe("disputed");
  });
});

describe("adapt_legacy_event_to_chronology", () => {
  it("adapts current camelCase event output without upgrading it to confirmed fact", () => {
    const adapted = adapt_legacy_event_to_chronology(
      {
        id: 44,
        caseId: 12,
        title: "Facility visit",
        description: "Janine visited her mother after work.",
        dateOccurred: "2026-06-30",
        eventType: "visit",
        documentId: 77,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      { now: "2026-07-16T00:00:00.000Z" },
    );

    expect(adapted.case_id).toBe(12);
    expect(adapted.chronology_event_id).toBe("legacy-event-44");
    expect(adapted.observed_event).toContain("Facility visit");
    expect(adapted.source_references).toEqual([
      "document:77",
      "legacy_event:44",
    ]);
    expect(adapted.source_confidence_level).toBe("reported");
    expect(adapted.fact_status).toBe("reported");
    expect(adapted.created_from_path).toBe("legacy_event_adapter");
  });

  it("accepts snake_case legacy rows at the compatibility boundary", () => {
    const adapted = adapt_legacy_event_to_chronology({
      id: "event-55",
      case_id: "case-55",
      title: "Court papers received",
      date_occurred: "2026-07-02",
      source_reference: "court_file:petition",
      created_at: "2026-07-02T18:00:00.000Z",
    });

    expect(adapted.case_id).toBe("case-55");
    expect(adapted.source_references).toEqual([
      "court_file:petition",
      "legacy_event:event-55",
    ]);
  });

  it("requires an explicit or legacy case identifier", () => {
    expect(() => adapt_legacy_event_to_chronology({
      id: 99,
      title: "Unscoped event",
    })).toThrow("legacy event cannot be adapted without case_id");
  });
});
