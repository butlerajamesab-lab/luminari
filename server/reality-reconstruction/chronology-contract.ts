import { z } from "zod";

/**
 * Reality Reconstruction — chronology contract
 *
 * This module defines the strict factual chronology boundary without creating
 * persistence, routes, migrations, or a competing timeline system.
 *
 * Chronology records preserve what the source says and how the source is known.
 * They do not contain legal conclusions, motive findings, or unsourced causation.
 */

export const chronology_date_precision_values = [
  "exact_time",
  "exact_date",
  "month",
  "year",
  "date_range",
  "approximate",
  "unknown",
] as const;

export const chronology_source_confidence_values = [
  "unknown",
  "reported",
  "direct_observation",
  "contemporaneous_record",
  "independently_corroborated",
  "primary_document_confirmed",
] as const;

export const chronology_fact_status_values = [
  "reported",
  "corroborated",
  "confirmed",
  "disputed",
  "superseded",
  "unknown",
] as const;

export const chronology_created_from_path_values = [
  "guided_intake",
  "system_ingested",
  "upload",
  "manual",
  "api",
  "legacy_event_adapter",
] as const;

const non_empty_string = z.string().trim().min(1);
const identifier_string = z.union([z.string().trim().min(1), z.number().int().nonnegative()]);

export const chronology_record_schema = z.object({
  chronology_event_id: non_empty_string,
  case_id: identifier_string,
  event_date: z.string().trim().min(1).nullable(),
  event_date_precision: z.enum(chronology_date_precision_values),
  source_date: z.string().trim().min(1).nullable(),
  observed_event: non_empty_string,
  people_involved: z.array(non_empty_string).default([]),
  entity_ids: z.array(identifier_string).default([]),
  source_references: z.array(non_empty_string).min(1),
  evidence_item_ids: z.array(identifier_string).default([]),
  why_it_matters: z.string().trim().nullable(),
  immediate_consequence: z.string().trim().nullable(),
  outstanding_follow_up: z.string().trim().nullable(),
  source_confidence_level: z.enum(chronology_source_confidence_values),
  fact_status: z.enum(chronology_fact_status_values),
  created_from_path: z.enum(chronology_created_from_path_values),
  normalization_version: non_empty_string,
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
}).superRefine((record, context) => {
  if (record.fact_status === "confirmed" && record.source_confidence_level === "unknown") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source_confidence_level"],
      message: "confirmed chronology records cannot use unknown source confidence",
    });
  }

  if (record.fact_status === "confirmed" && record.source_references.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source_references"],
      message: "confirmed chronology records require at least one source reference",
    });
  }

  if (record.event_date === null && record.event_date_precision !== "unknown") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["event_date_precision"],
      message: "records without an event date must use unknown date precision",
    });
  }
});

export type chronology_record = z.infer<typeof chronology_record_schema>;
export type chronology_case_id = chronology_record["case_id"];
export type chronology_identifier = string | number;

export interface legacy_event_record {
  id: chronology_identifier;
  case_id?: chronology_case_id;
  caseId?: chronology_case_id;
  title: string;
  description?: string | null;
  date_occurred?: string | null;
  dateOccurred?: string | null;
  event_type?: string | null;
  eventType?: string | null;
  location?: string | null;
  document_id?: chronology_identifier | null;
  documentId?: chronology_identifier | null;
  source_reference?: string | null;
  sourceReference?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

export interface legacy_event_adapter_options {
  case_id?: chronology_case_id;
  normalization_version?: string;
  now?: string;
}

function require_case_id(
  event: legacy_event_record,
  options: legacy_event_adapter_options,
): chronology_case_id {
  const case_id = options.case_id ?? event.case_id ?? event.caseId;
  if (case_id === undefined || case_id === null || String(case_id).trim().length === 0) {
    throw new Error("legacy event cannot be adapted without case_id");
  }
  return case_id;
}

function build_source_references(event: legacy_event_record): string[] {
  const references = new Set<string>();
  const explicit_source_reference = event.source_reference ?? event.sourceReference;
  const document_id = event.document_id ?? event.documentId;

  if (explicit_source_reference?.trim()) references.add(explicit_source_reference.trim());
  if (document_id !== undefined && document_id !== null) references.add(`document:${document_id}`);

  // The legacy event row remains a source reference even when no document link exists.
  references.add(`legacy_event:${event.id}`);
  return [...references];
}

function build_observed_event(event: legacy_event_record): string {
  const title = event.title.trim();
  const description = event.description?.trim();
  if (!description) return title;
  return `${title} — ${description}`;
}

/**
 * Compatibility adapter from the existing generic event model into the strict
 * chronology read contract.
 *
 * It never upgrades a legacy row to confirmed fact. Legacy rows enter as
 * reported unless a later reconstruction process links corroborating sources.
 */
export function adapt_legacy_event_to_chronology(
  event: legacy_event_record,
  options: legacy_event_adapter_options = {},
): chronology_record {
  const now = options.now ?? new Date().toISOString();
  const event_date = event.date_occurred ?? event.dateOccurred ?? null;
  const created_at = event.created_at ?? event.createdAt ?? now;
  const updated_at = event.updated_at ?? event.updatedAt ?? created_at;
  const case_id = require_case_id(event, options);

  return chronology_record_schema.parse({
    chronology_event_id: `legacy-event-${event.id}`,
    case_id,
    event_date,
    event_date_precision: event_date ? "exact_date" : "unknown",
    source_date: event_date,
    observed_event: build_observed_event(event),
    people_involved: [],
    entity_ids: [],
    source_references: build_source_references(event),
    evidence_item_ids: [],
    why_it_matters: null,
    immediate_consequence: null,
    outstanding_follow_up: null,
    source_confidence_level: "reported",
    fact_status: "reported",
    created_from_path: "legacy_event_adapter",
    normalization_version: options.normalization_version ?? "chronology_contract_v1",
    created_at,
    updated_at,
  });
}

export function parse_chronology_record(value: unknown): chronology_record {
  return chronology_record_schema.parse(value);
}

export function safe_parse_chronology_record(value: unknown) {
  return chronology_record_schema.safeParse(value);
}
