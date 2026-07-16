import { describe, expect, it } from "vitest";
import {
  adapt_legacy_evidence_source,
  reconstruction_source_record_schema,
  safe_parse_reconstruction_source_record,
} from "./source-registry-contract";

const base_record = {
  source_record_id: "J-SRC-0001",
  case_id: 12,
  source_class: "court_filing" as const,
  source_name: "Petition for protection order",
  producing_entity: "King County Superior Court",
  source_date: "2026-07-01",
  received_date: "2026-07-02",
  access_method: "court_file" as const,
  verification_status: "content_verified" as const,
  document_id: 42,
  evidence_item_id: null,
  external_reference: "court-file:petition",
  content_hash: "sha256:abc123",
  notes: null,
  created_at: "2026-07-16T00:00:00.000Z",
  updated_at: "2026-07-16T00:00:00.000Z",
};

describe("reconstruction_source_record_schema", () => {
  it("accepts a source-linked court filing", () => {
    expect(reconstruction_source_record_schema.parse(base_record)).toEqual(base_record);
  });

  it("rejects a documentary source with no record or external reference", () => {
    const result = safe_parse_reconstruction_source_record({
      ...base_record,
      document_id: null,
      content_hash: null,
      external_reference: null,
    });

    expect(result.success).toBe(false);
  });

  it("allows direct observation without a document link", () => {
    const observation = reconstruction_source_record_schema.parse({
      ...base_record,
      source_record_id: "J-SRC-0002",
      source_class: "direct_observation",
      source_name: "Janine direct observation",
      access_method: "direct_observation",
      verification_status: "unverified",
      document_id: null,
      external_reference: null,
      content_hash: null,
    });

    expect(observation.source_class).toBe("direct_observation");
  });
});

describe("adapt_legacy_evidence_source", () => {
  it("preserves the legacy registry identity without inventing source class or verification", () => {
    const adapted = adapt_legacy_evidence_source({
      id: 7,
      source_id: "facility-visitor-log",
      name: "Facility visitor log",
      producing_entity: "Care facility",
      access_method: "record request",
      notes: "Request through facility administration.",
      created_at: 1_752_624_000_000,
      updated_at: 1_752_624_100_000,
    }, { case_id: 12 });

    expect(adapted.source_record_id).toBe("legacy-evidence-source-7");
    expect(adapted.case_id).toBe(12);
    expect(adapted.source_class).toBe("unknown");
    expect(adapted.verification_status).toBe("unverified");
    expect(adapted.external_reference).toBe("facility-visitor-log");
    expect(adapted.access_method).toBe("other");
  });

  it("maps recognized access methods deterministically", () => {
    const adapted = adapt_legacy_evidence_source({
      id: 8,
      source_id: "court-petition",
      name: "Court petition",
      producing_entity: "Court",
      access_method: "court file",
      created_at: 1_752_624_000_000,
      updated_at: 1_752_624_000_000,
    });

    expect(adapted.access_method).toBe("court_file");
  });
});
