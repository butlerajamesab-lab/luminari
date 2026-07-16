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
