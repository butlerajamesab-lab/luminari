import {
  project_legacy_event_to_chronology,
  sort_chronology_records,
  type chronology_timeline_record,
  type legacy_timeline_event,
} from "./chronologyProjection";

export type source_event_input = legacy_timeline_event & {
  documentFilename?: string | null;
  canonical_actor?: string | null;
  canonical_event_scope?: "case_specific" | "facility_wide" | null;
};

export type source_event = chronology_timeline_record & {
  document_id: string | null;
  document_filename: string | null;
  actor: string | null;
  event_scope: "case_specific" | "facility_wide" | "unknown";
};

export function source_document_id(value: unknown): string | null {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

/** Presentation only: retain the source's status; document overlap is not corroboration. */
export function project_source_events(events: source_event_input[]): source_event[] {
  const records = events.map(event => ({
    ...project_legacy_event_to_chronology(event),
    document_id: source_document_id(event.documentId ?? event.document_id),
    document_filename: event.documentFilename ?? null,
    actor: event.canonical_actor ?? null,
    event_scope: event.canonical_event_scope ?? "unknown" as const,
  }));
  const order = new Map(sort_chronology_records(records).map((event, index) => [event.chronology_event_id, index]));
  return records.sort((a, b) => order.get(a.chronology_event_id)! - order.get(b.chronology_event_id)!);
}

export function source_document_options(
  events: source_event[],
  documents: Array<{ id: number | string; filename?: string | null }> = [],
): Array<{ id: string; filename: string; event_count: number }> {
  const options = new Map<string, { id: string; filename: string; event_count: number }>();
  for (const document of documents) {
    const id = source_document_id(document.id);
    if (id) options.set(id, { id, filename: document.filename || `Document ${id}`, event_count: 0 });
  }
  for (const event of events) {
    if (!event.document_id) continue;
    const option = options.get(event.document_id) ?? {
      id: event.document_id,
      filename: event.document_filename || `Document ${event.document_id}`,
      event_count: 0,
    };
    option.event_count += 1;
    options.set(option.id, option);
  }
  return [...options.values()].sort((a, b) => a.filename.localeCompare(b.filename) || Number(a.id) - Number(b.id));
}

export function filter_source_events(
  events: source_event[],
  filters: { document_id?: string; query?: string; scope?: string; status?: string },
): source_event[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return events.filter(event =>
    (!filters.document_id || event.document_id === filters.document_id)
    && (!filters.scope || event.event_scope === filters.scope)
    && (!filters.status || event.fact_status === filters.status)
    && (!query || [event.observed_event, event.document_filename, event.actor, event.event_date,
      event.source_message_local_time, event.source_message_timestamp_text]
      .some(value => value?.toLocaleLowerCase().includes(query))),
  );
}

/** These are two source lists, not inferred event pairs or independent verification. */
export function inspect_document_pair(events: source_event[], source: unknown, target: unknown) {
  const source_id = source_document_id(source);
  const target_id = source_document_id(target);
  return {
    source_events: source_id ? filter_source_events(events, { document_id: source_id }) : [],
    target_events: target_id ? filter_source_events(events, { document_id: target_id }) : [],
    verification_state: "unverified_candidate" as const,
  };
}
