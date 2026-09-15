import { describe, expect, it } from "vitest";
import {
  case_identifier,
  document_identifier,
  event_identifier,
  evidence_item_identifier,
  evidence_source_identifier,
  external_reference_identifier,
  reconstruction_id_bridge_record_schema,
  safe_parse_reconstruction_id_bridge_record,
} from "./id-domain-bridge";

const now = "2026-07-16T00:00:00.000Z";

describe("typed identifier helpers", () => {
  it("preserves integer and UUID domains without coercion", () => {
    expect(case_identifier(12)).toEqual({ domain: "case_integer", value: 12 });
    expect(document_identifier(42)).toEqual({ domain: "document_integer", value: 42 });
    expect(event_identifier("550e8400-e29b-41d4-a716-446655440000")).toEqual({
      domain: "event_uuid",
      value: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects a non-UUID event identity", () => {
    expect(() => event_identifier("12")).toThrow();
  });
});

describe("reconstruction_id_bridge_record_schema", () => {
  it("accepts an event-to-integer-case bridge", () => {
    const record = reconstruction_id_bridge_record_schema.parse({
      bridge_id: "bridge-event-case-1",
      left_identifier: event_identifier("550e8400-e29b-41d4-a716-446655440000"),
      relationship: "belongs_to_case",
      right_identifier: case_identifier(12),
      source_references: ["events.metadata:legacy_case_id"],
      status: "asserted",
      created_at: now,
      updated_at: now,
    });

    expect(record.right_identifier.domain).toBe("case_integer");
  });

  it("accepts evidence derived from an integer document", () => {
    const record = reconstruction_id_bridge_record_schema.parse({
      bridge_id: "bridge-evidence-document-1",
      left_identifier: evidence_item_identifier("550e8400-e29b-41d4-a716-446655440001"),
      relationship: "derived_from_document",
      right_identifier: document_identifier(42),
      source_references: ["document_manifest:42"],
      status: "verified",
      created_at: now,
      updated_at: now,
    });

    expect(record.relationship).toBe("derived_from_document");
  });

  it("rejects belongs_to_case when the target is not the integer case domain", () => {
    const result = safe_parse_reconstruction_id_bridge_record({
      bridge_id: "bridge-invalid-case-target",
      left_identifier: event_identifier("550e8400-e29b-41d4-a716-446655440000"),
      relationship: "belongs_to_case",
      right_identifier: external_reference_identifier("case-12"),
      source_references: ["legacy:event"],
      status: "asserted",
      created_at: now,
      updated_at: now,
    });

    expect(result.success).toBe(false);
  });

  it("rejects source references aimed at a case identifier", () => {
    const result = safe_parse_reconstruction_id_bridge_record({
      bridge_id: "bridge-invalid-source-target",
      left_identifier: evidence_item_identifier("550e8400-e29b-41d4-a716-446655440001"),
      relationship: "references_source",
      right_identifier: case_identifier(12),
      source_references: ["legacy:evidence"],
      status: "asserted",
      created_at: now,
      updated_at: now,
    });

    expect(result.success).toBe(false);
  });

  it("accepts references to the existing integer evidence-source registry", () => {
    const record = reconstruction_id_bridge_record_schema.parse({
      bridge_id: "bridge-source-1",
      left_identifier: evidence_item_identifier("550e8400-e29b-41d4-a716-446655440001"),
      relationship: "references_source",
      right_identifier: evidence_source_identifier(7),
      source_references: ["evidence_sources:7"],
      status: "verified",
      created_at: now,
      updated_at: now,
    });

    expect(record.right_identifier.domain).toBe("evidence_source_integer");
  });

  it("rejects accidental self-links", () => {
    const event = event_identifier("550e8400-e29b-41d4-a716-446655440000");
    const result = safe_parse_reconstruction_id_bridge_record({
      bridge_id: "bridge-self",
      left_identifier: event,
      relationship: "corroborates",
      right_identifier: event,
      source_references: ["event:itself"],
      status: "asserted",
      created_at: now,
      updated_at: now,
    });

    expect(result.success).toBe(false);
  });
});
