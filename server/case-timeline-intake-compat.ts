import { listEvents } from "./case-runtime-chronology-compat";

function normalize_date(value: unknown): { date: string | null; sortKey: number } {
  if (value === null || value === undefined || value === "") {
    return { date: null, sortKey: Infinity };
  }
  const rendered = String(value);
  const parsed = Date.parse(rendered);
  return {
    date: rendered,
    sortKey: Number.isFinite(parsed) ? parsed : Infinity,
  };
}

/** Statement-of-Facts consumes only the governed chronology projection. */
export async function getCaseTimelineData(caseId: number): Promise<any[]> {
  const events = await listEvents(caseId);
  return events.map((event: any) => {
    const normalized = normalize_date(event.dateOccurred);
    return {
      type: "event" as const,
      id:
        event.canonical_projection_variant_id ??
        event.canonical_event_id ??
        event.id,
      date: normalized.date,
      datePrecision: event.canonical_date_precision ?? "unknown",
      sortKey: normalized.sortKey,
      label: String(event.title ?? "Source-bound event"),
      description: event.description ?? null,
      documentId: event.documentId ?? null,
      documentName: event.documentFilename ?? null,
      page: null,
      entityNames: event.canonical_actor ? [String(event.canonical_actor)] : [],
      evidentiaryWeight: event.canonical_verification_status ?? null,
      projection_source: "universal_intake_spine",
      canonical_source_artifact_key: event.canonical_source_artifact_key ?? null,
      canonical_source_span_offset: event.canonical_source_span_offset ?? null,
      canonical_output_hashes: event.canonical_output_hashes ?? [],
      canonical_receipt_hashes: event.canonical_receipt_hashes ?? [],
    };
  }).sort((left: any, right: any) =>
    left.sortKey - right.sortKey
    || String(left.id).localeCompare(String(right.id), "en", { numeric: true })
  );
}
