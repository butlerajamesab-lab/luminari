import { getCaseTimelineData as get_legacy_case_timeline } from "./case-contract-compat";
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

/**
 * Statement-of-Facts is a consumer of case chronology. Once the sealed Intake
 * chronology has cut over, it replaces only the legacy event slice; claims,
 * quotes, findings, and user actions remain their separately owned records.
 */
export async function getCaseTimelineData(caseId: number): Promise<any[]> {
  const [legacy, events] = await Promise.all([
    get_legacy_case_timeline(caseId),
    listEvents(caseId),
  ]);

  const canonical_events = events.filter(
    (event: any) => event.projection_source === "universal_intake_spine",
  );
  if (canonical_events.length === 0) return legacy;

  const retained = legacy.filter((item: any) => item.type !== "event");
  const projected = canonical_events.map((event: any) => {
    const normalized = normalize_date(event.dateOccurred);
    return {
      type: "event" as const,
      id: event.canonical_event_id ?? event.id,
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
  });

  const type_order = ["event", "claim", "quote", "finding", "foia_request"];
  return [...retained, ...projected].sort((left: any, right: any) => {
    if (left.sortKey !== right.sortKey) return left.sortKey - right.sortKey;
    const type_delta = type_order.indexOf(left.type) - type_order.indexOf(right.type);
    if (type_delta !== 0) return type_delta;
    return String(left.id).localeCompare(String(right.id), "en", { numeric: true });
  });
}
