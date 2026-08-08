export type chronology_date_precision =
  | "exact_time"
  | "exact_date"
  | "month"
  | "year"
  | "date_range"
  | "approximate"
  | "unknown";

export type chronology_source_confidence =
  | "unknown"
  | "reported"
  | "direct_observation"
  | "contemporaneous_record"
  | "independently_corroborated"
  | "primary_document_confirmed";

export type chronology_fact_status =
  | "reported"
  | "corroborated"
  | "confirmed"
  | "disputed"
  | "superseded"
  | "unknown";

export interface legacy_timeline_event {
  id: string | number;
  title: string;
  description?: string | null;
  dateOccurred?: string | null;
  date_occurred?: string | null;
  eventType?: string | null;
  event_type?: string | null;
  location?: string | null;
  documentId?: string | number | null;
  document_id?: string | number | null;
}

export interface intake_chronology_event {
  event_id: string;
  date: string | null;
  date_precision: "exact" | "month" | "year" | "unknown";
  event_text: string;
  actor: string | null;
  source_artifact_key: string;
  source_span_offset: number;
  verification_status:
    | "user_reported"
    | "document_stated"
    | "supported_by_one_source"
    | "supported_by_multiple_sources"
    | "contradicted"
    | "disputed"
    | "incomplete"
    | "unresolved"
    | "referenced_missing";
}

export interface intake_chronology_projection_context {
  intake_session_id: string;
  receipt_hash: string | null;
  output_hash: string | null;
}

export interface chronology_timeline_record {
  chronology_event_id: string;
  event_date: string | null;
  event_date_precision: chronology_date_precision;
  observed_event: string;
  event_type: string;
  location: string | null;
  source_references: string[];
  source_confidence_level: chronology_source_confidence;
  fact_status: chronology_fact_status;
}

function build_observed_event(event: legacy_timeline_event): string {
  const title = event.title.trim();
  const description = event.description?.trim();
  return description ? `${title} — ${description}` : title;
}

function build_source_references(event: legacy_timeline_event): string[] {
  const document_id = event.documentId ?? event.document_id;
  const source_references = new Set<string>();
  if (document_id !== undefined && document_id !== null) {
    source_references.add(`document:${document_id}`);
  }
  source_references.add(`legacy_event:${event.id}`);
  return [...source_references];
}

/**
 * Read-only compatibility projection for the existing events timeline.
 *
 * Existing events remain persisted exactly where they are. The projection never
 * upgrades an event to confirmed fact; it enters the reconstruction view as a
 * reported event until source-linked chronology persistence is available.
 */
export function project_legacy_event_to_chronology(
  event: legacy_timeline_event,
): chronology_timeline_record {
  const event_date = event.dateOccurred ?? event.date_occurred ?? null;
  return {
    chronology_event_id: `legacy-event-${event.id}`,
    event_date,
    event_date_precision: event_date ? "exact_date" : "unknown",
    observed_event: build_observed_event(event),
    event_type: event.eventType ?? event.event_type ?? "event",
    location: event.location ?? null,
    source_references: build_source_references(event),
    source_confidence_level: "reported",
    fact_status: "reported",
  };
}

function map_intake_date_precision(
  value: intake_chronology_event["date_precision"],
): chronology_date_precision {
  if (value === "exact") return "exact_date";
  return value;
}

function map_intake_fact_status(
  value: intake_chronology_event["verification_status"],
): chronology_fact_status {
  if (value === "supported_by_multiple_sources") return "corroborated";
  if (value === "contradicted" || value === "disputed") return "disputed";
  if (value === "incomplete" || value === "unresolved" || value === "referenced_missing") return "unknown";
  return "reported";
}

function map_intake_source_confidence(
  value: intake_chronology_event["verification_status"],
): chronology_source_confidence {
  if (value === "supported_by_multiple_sources") return "independently_corroborated";
  return "reported";
}

/**
 * Project a sealed Universal Intake Spine chronology event directly into the
 * existing timeline view without rewriting it into public.events.
 */
export function project_intake_event_to_chronology(
  event: intake_chronology_event,
  context: intake_chronology_projection_context,
): chronology_timeline_record {
  const source_references = [
    `intake_session:${context.intake_session_id}`,
    `artifact:${event.source_artifact_key}`,
    `source_offset:${event.source_span_offset}`,
  ];
  if (context.receipt_hash) source_references.push(`receipt:${context.receipt_hash}`);
  if (context.output_hash) source_references.push(`output:${context.output_hash}`);

  return {
    chronology_event_id: `intake-${context.intake_session_id}-${event.event_id}`,
    event_date: event.date,
    event_date_precision: map_intake_date_precision(event.date_precision),
    observed_event: event.event_text,
    event_type: event.verification_status,
    location: null,
    source_references,
    source_confidence_level: map_intake_source_confidence(event.verification_status),
    fact_status: map_intake_fact_status(event.verification_status),
  };
}

export function sort_chronology_records(
  records: chronology_timeline_record[],
): chronology_timeline_record[] {
  return [...records].sort((a, b) => {
    if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date);
    if (a.event_date) return -1;
    if (b.event_date) return 1;
    return a.chronology_event_id.localeCompare(b.chronology_event_id);
  });
}

export function humanize_chronology_value(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}
