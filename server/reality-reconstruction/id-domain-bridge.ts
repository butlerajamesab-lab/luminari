import { z } from "zod";

/**
 * Reality Reconstruction — identifier domain bridge
 *
 * Live Lighthouse currently contains multiple identifier families:
 * - integer case/document identifiers
 * - UUID event/evidence identifiers
 * - integer global evidence-source identifiers
 *
 * This contract makes those domains explicit. It does not coerce one domain
 * into another and does not create database foreign keys.
 */

export const reconstruction_id_domain_values = [
  "case_integer",
  "document_integer",
  "event_uuid",
  "evidence_item_uuid",
  "evidence_source_integer",
  "normalized_record_uuid",
  "external_reference",
] as const;

export const reconstruction_bridge_relationship_values = [
  "belongs_to_case",
  "derived_from_document",
  "supports_event",
  "references_source",
  "normalized_from_record",
  "corroborates",
  "contradicts",
  "supersedes",
] as const;

export const reconstruction_bridge_status_values = [
  "asserted",
  "verified",
  "disputed",
  "superseded",
] as const;

const integer_identifier = z.number().int().nonnegative();
const uuid_identifier = z.string().uuid();
const external_identifier = z.string().trim().min(1);

export const reconstruction_typed_identifier_schema = z.discriminatedUnion("domain", [
  z.object({ domain: z.literal("case_integer"), value: integer_identifier }),
  z.object({ domain: z.literal("document_integer"), value: integer_identifier }),
  z.object({ domain: z.literal("event_uuid"), value: uuid_identifier }),
  z.object({ domain: z.literal("evidence_item_uuid"), value: uuid_identifier }),
  z.object({ domain: z.literal("evidence_source_integer"), value: integer_identifier }),
  z.object({ domain: z.literal("normalized_record_uuid"), value: uuid_identifier }),
  z.object({ domain: z.literal("external_reference"), value: external_identifier }),
]);

export type reconstruction_typed_identifier = z.infer<typeof reconstruction_typed_identifier_schema>;

export const reconstruction_id_bridge_record_schema = z.object({
  bridge_id: z.string().trim().min(1),
  left_identifier: reconstruction_typed_identifier_schema,
  relationship: z.enum(reconstruction_bridge_relationship_values),
  right_identifier: reconstruction_typed_identifier_schema,
  source_references: z.array(z.string().trim().min(1)).min(1),
  status: z.enum(reconstruction_bridge_status_values),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
}).superRefine((record, context) => {
  if (
    record.left_identifier.domain === record.right_identifier.domain &&
    record.left_identifier.value === record.right_identifier.value &&
    record.relationship !== "supersedes"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["right_identifier"],
      message: "identifier bridges cannot self-link except for explicit supersession records",
    });
  }

  if (
    record.relationship === "belongs_to_case" &&
    record.right_identifier.domain !== "case_integer"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["right_identifier"],
      message: "belongs_to_case must target the integer case domain",
    });
  }

  if (
    record.relationship === "derived_from_document" &&
    record.right_identifier.domain !== "document_integer"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["right_identifier"],
      message: "derived_from_document must target the integer document domain",
    });
  }

  if (
    record.relationship === "references_source" &&
    !["evidence_source_integer", "external_reference"].includes(record.right_identifier.domain)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["right_identifier"],
      message: "references_source must target a registered or external source identity",
    });
  }
});

export type reconstruction_id_bridge_record = z.infer<typeof reconstruction_id_bridge_record_schema>;

export function case_identifier(value: number): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "case_integer", value });
}

export function document_identifier(value: number): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "document_integer", value });
}

export function event_identifier(value: string): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "event_uuid", value });
}

export function evidence_item_identifier(value: string): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "evidence_item_uuid", value });
}

export function evidence_source_identifier(value: number): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "evidence_source_integer", value });
}

export function normalized_record_identifier(value: string): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "normalized_record_uuid", value });
}

export function external_reference_identifier(value: string): reconstruction_typed_identifier {
  return reconstruction_typed_identifier_schema.parse({ domain: "external_reference", value });
}

export function parse_reconstruction_id_bridge_record(value: unknown): reconstruction_id_bridge_record {
  return reconstruction_id_bridge_record_schema.parse(value);
}

export function safe_parse_reconstruction_id_bridge_record(value: unknown) {
  return reconstruction_id_bridge_record_schema.safeParse(value);
}
