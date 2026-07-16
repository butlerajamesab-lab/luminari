import { z } from "zod";

export const reconstruction_source_class_values = [
  "original_document",
  "court_filing",
  "medical_or_facility_record",
  "direct_observation",
  "contemporaneous_communication",
  "witness_statement",
  "later_recollection",
  "third_party_report",
  "derived_calculation",
  "unknown",
] as const;

export const reconstruction_source_verification_values = [
  "unverified",
  "identity_verified",
  "content_verified",
  "independently_corroborated",
  "disputed",
  "superseded",
] as const;

export const reconstruction_source_access_values = [
  "uploaded",
  "linked_document",
  "court_file",
  "facility_record_request",
  "medical_record_request",
  "public_record_request",
  "witness_interview",
  "direct_observation",
  "other",
  "unknown",
] as const;

const identifier = z.union([z.string().trim().min(1), z.number().int().nonnegative()]);
const non_empty_string = z.string().trim().min(1);

export const reconstruction_source_record_schema = z.object({
  source_record_id: non_empty_string,
  case_id: identifier.nullable(),
  source_class: z.enum(reconstruction_source_class_values),
  source_name: non_empty_string,
  producing_entity: z.string().trim().nullable(),
  source_date: z.string().trim().min(1).nullable(),
  received_date: z.string().trim().min(1).nullable(),
  access_method: z.enum(reconstruction_source_access_values),
  verification_status: z.enum(reconstruction_source_verification_values),
  document_id: identifier.nullable(),
  evidence_item_id: identifier.nullable(),
  external_reference: z.string().trim().nullable(),
  content_hash: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
}).superRefine((record, context) => {
  if (
    record.document_id === null &&
    record.evidence_item_id === null &&
    !record.external_reference &&
    record.source_class !== "direct_observation" &&
    record.source_class !== "later_recollection" &&
    record.source_class !== "unknown"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["external_reference"],
      message: "documentary and third-party sources require a document, evidence item, or external reference",
    });
  }

  if (
    record.verification_status === "content_verified" &&
    record.document_id === null &&
    record.evidence_item_id === null &&
    !record.content_hash
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["verification_status"],
      message: "content verification requires a linked record or content hash",
    });
  }
});

export type reconstruction_source_record = z.infer<typeof reconstruction_source_record_schema>;

export interface legacy_evidence_source_row {
  id: number;
  source_id: string;
  name: string;
  producing_entity: string;
  access_method?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
}

export interface source_adapter_options {
  case_id?: string | number | null;
  now?: string;
}

function normalize_access_method(value: string | null | undefined): reconstruction_source_record["access_method"] {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!normalized) return "unknown";
  if (reconstruction_source_access_values.includes(normalized as reconstruction_source_record["access_method"])) {
    return normalized as reconstruction_source_record["access_method"];
  }
  return "other";
}

export function adapt_legacy_evidence_source(
  row: legacy_evidence_source_row,
  options: source_adapter_options = {},
): reconstruction_source_record {
  const created_at = new Date(row.created_at).toISOString();
  const updated_at = new Date(row.updated_at).toISOString();

  return reconstruction_source_record_schema.parse({
    source_record_id: `legacy-evidence-source-${row.id}`,
    case_id: options.case_id ?? null,
    source_class: "unknown",
    source_name: row.name,
    producing_entity: row.producing_entity,
    source_date: null,
    received_date: null,
    access_method: normalize_access_method(row.access_method),
    verification_status: "unverified",
    document_id: null,
    evidence_item_id: null,
    external_reference: row.source_id,
    content_hash: null,
    notes: row.notes ?? null,
    created_at,
    updated_at,
  });
}

export function parse_reconstruction_source_record(value: unknown): reconstruction_source_record {
  return reconstruction_source_record_schema.parse(value);
}

export function safe_parse_reconstruction_source_record(value: unknown) {
  return reconstruction_source_record_schema.safeParse(value);
}
