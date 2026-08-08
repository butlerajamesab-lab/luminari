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
  | "source_bound"
  | "direct_observation"
  | "contemporaneous_record"
  | "independently_corroborated"
  | "primary_document_confirmed";

export type chronology_fact_status =
  | "reported"
  | "user_reported"
  | "document_stated"
  | "supported_by_one_source"
  | "supported_by_multiple_sources"
  | "corroborated"
  | "confirmed"
  | "contradicted"
  | "disputed"
  | "incomplete"
  | "unresolved"
  | "referenced_missing"
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
  projection_source?: string | null;
  canonical_event_id?: string | null;
  canonical_date_precision?: "exact" | "month" | "year" | "unknown" | null;
  canonical_verification_status?: string | null;
  canonical_source_artifact_key?: string | null;
  canonical_source_span_offset?: number | null;
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

const INTAKE_FACT_STATUSES = new Set<chronology_fact_status>([
  "user_reported",
  "document_stated",
  "supported_by_one_source",
  "supported_by_multiple_sources",
  "contradicted",
  "disputed",
  "incomplete",
  "unresolved",
  "referenced_missing",
]);

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

function project_intake_event_to_chronology(
  event: legacy_timeline_event,
): chronology_timeline_record {
  const event_date = event.dateOccurred ?? event.date_occurred ?? null;
  const precision: chronology_date_precision = event.canonical_date_precision === "exact"
    ? "exact_date"
    : event.canonical_date_precision ?? "unknown";
  const status = event.canonical_verification_status as chronology_fact_status | null | undefined;
  const fact_status = status && INTAKE_FACT_STATUSES.has(status) ? status : "unresolved";
  const source_references = new Set<string>();
  const document_id = event.documentId ?? event.document_id;
  if (document_id !== undefined && document_id !== null) {
    source_references.add(`document:${document_id}`);
  }
  if (event.canonical_source_artifact_key) {
    source_references.add(`artifact:${event.canonical_source_artifact_key}`);
  }
  if (event.canonical_source_span_offset !== undefined && event.canonical_source_span_offset !== null) {
    source_references.add(`source_offset:${event.canonical_source_span_offset}`);
  }
  source_references.add(`intake_event:${event.canonical_event_id ?? event.id}`);

  return {
    chronology_event_id: event.canonical_event_id ?? String(event.id),
    event_date,
    event_date_precision: precision,
    observed_event: build_observed_event(event),
    event_type: event.eventType ?? event.event_type ?? "source_document_event",
    location: event.location ?? null,
    source_references: [...source_references],
    source_confidence_level: "source_bound",
    fact_status,
  };
}

/**
 * Read-only compatibility projection for both case-runtime generations.
 *
 * Sealed Universal Intake Spine chronology output keeps its exact source-bound
 * verification status. Older legacy events remain reported rather than being
 * silently upgraded by the presentation layer.
 */
export function project_legacy_event_to_chronology(
  event: legacy_timeline_event,
): chronology_timeline_record {
  if (event.projection_source === "universal_intake_spine") {
    return project_intake_event_to_chronology(event);
  }

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
