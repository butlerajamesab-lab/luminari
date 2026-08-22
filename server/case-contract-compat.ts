import { getPool } from "./db-legacy";
import type { NarrativeSourceMap } from "../drizzle/schema";

/**
 * Case contract compatibility
 *
 * Lighthouse still exposes a legacy integer case workspace while newer case
 * event/intake substrates are UUID-addressed. The Universal Intake Spine owns
 * the explicit bridge between those identities in public.case_identity_bridge.
 * These helpers use the live snake_case database contract directly rather than
 * asking Drizzle to compare incompatible integer/UUID case keys.
 */

type case_narrative_compat = {
  id: number;
  caseId: number;
  userId: number;
  content: string;
  sourceMap: NarrativeSourceMap;
  timelineItemCount: number;
  snapshotId: number | null;
  generatedAt: number;
  updatedAt: number;
};

type timeline_item_compat = {
  type: "event" | "quote" | "claim" | "finding" | "foia_request";
  id: number | string;
  date: string | null;
  datePrecision: string | null;
  sortKey: number;
  label: string;
  description: string | null;
  documentId: number | null;
  documentName: string | null;
  page: number | null;
  entityNames: string[];
  evidentiaryWeight: string | null;
};

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function as_item_id(value: unknown): number | string {
  const rendered = String(value ?? "");
  return /^\d+$/.test(rendered) ? Number(rendered) : rendered;
}

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

function map_case_narrative(row: any): case_narrative_compat | null {
  if (!row) return null;
  const generated_at = as_number(row.generated_at);
  return {
    id: as_number(row.id),
    caseId: as_number(row.case_id),
    userId: as_number(row.user_id),
    content: String(row.content ?? ""),
    sourceMap: Array.isArray(row.source_map) ? row.source_map : [],
    timelineItemCount: as_number(row.timeline_item_count),
    snapshotId: row.snapshot_id === null || row.snapshot_id === undefined
      ? null
      : as_number(row.snapshot_id),
    generatedAt: generated_at,
    // The live legacy table has no separate updated_at column. Returning the
    // persisted generation timestamp preserves the actual stored time instead
    // of fabricating a second timestamp.
    updatedAt: generated_at,
  };
}

export async function createCase(
  userId: number,
  name: string,
  description?: string,
  domain?: string,
  container?: string,
  pipelineType?: string,
): Promise<number> {
  const now = Date.now();
  const normalized_domain = domain ? domain.toLowerCase().trim() : null;
  const result = await getPool().query<{ id: number }>(
    `insert into public.cases
      (user_id, name, description, status, domain, container, pipeline_type, created_at, updated_at)
     values ($1,$2,$3,'active',$4,$5,$6,$7,$8)
     returning id`,
    [
      userId,
      name,
      description ?? null,
      normalized_domain,
      container ?? null,
      pipelineType ?? null,
      now,
      now,
    ],
  );
  const id = Number(result.rows[0]?.id ?? 0);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("case_not_persisted");
  return id;
}

export async function getCaseStats(caseId: number) {
  const result = await getPool().query(
    `with bridge as (
       select case_uuid
         from public.case_identity_bridge
        where legacy_case_id = $1
        limit 1
     ), document_status as (
       select coalesce(status, 'unknown') as status, count(*)::int as count
         from public.documents
        where case_id = $1
        group by coalesce(status, 'unknown')
     )
     select
       (select count(*)::int from public.documents where case_id = $1) as documents,
       (select count(*)::int from public.entities where case_id = $1) as entities,
       (select count(*)::int from public.quotes where case_id = $1) as quotes,
       (select count(*)::int from public.claims where case_id = $1) as claims,
       (select count(*)::int from public.findings where case_id = $1) as findings,
       (select count(*)::int
          from public.events e
          join bridge b on b.case_uuid = e.case_id) as events,
       (select count(*)::int from public.relationships where case_id = $1) as relationships,
       (select count(*)::int from public.signal_flags where case_id = $1) as signal_flags,
       coalesce((select jsonb_object_agg(status, count order by status) from document_status), '{}'::jsonb)
         as document_status`,
    [caseId],
  );
  const row = result.rows[0] ?? {};
  return {
    documents: as_number(row.documents),
    entities: as_number(row.entities),
    quotes: as_number(row.quotes),
    claims: as_number(row.claims),
    findings: as_number(row.findings),
    events: as_number(row.events),
    relationships: as_number(row.relationships),
    signalFlags: as_number(row.signal_flags),
    documentStatus: row.document_status && typeof row.document_status === "object"
      ? row.document_status
      : {},
  };
}

export async function getCaseNarrative(caseId: number): Promise<case_narrative_compat | null> {
  const result = await getPool().query(
    `select id, case_id, user_id, content, source_map, timeline_item_count,
            snapshot_id, generated_at
       from public.case_narratives
      where case_id = $1
      order by generated_at desc, id desc
      limit 1`,
    [caseId],
  );
  return map_case_narrative(result.rows[0]);
}

export async function upsertCaseNarrative(data: {
  caseId: number;
  userId: number;
  content: string;
  sourceMap: NarrativeSourceMap;
  timelineItemCount: number;
  snapshotId?: number;
}): Promise<case_narrative_compat> {
  const now = Date.now();
  const result = await getPool().query(
    `insert into public.case_narratives
       (case_id, user_id, content, source_map, timeline_item_count, snapshot_id, generated_at)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7)
     on conflict (case_id) do update set
       user_id = excluded.user_id,
       content = excluded.content,
       source_map = excluded.source_map,
       timeline_item_count = excluded.timeline_item_count,
       snapshot_id = excluded.snapshot_id,
       generated_at = excluded.generated_at
     returning id, case_id, user_id, content, source_map, timeline_item_count,
               snapshot_id, generated_at`,
    [
      data.caseId,
      data.userId,
      data.content,
      JSON.stringify(data.sourceMap ?? []),
      data.timelineItemCount,
      data.snapshotId ?? null,
      now,
    ],
  );
  const mapped = map_case_narrative(result.rows[0]);
  if (!mapped) throw new Error("case_narrative_not_persisted");
  return mapped;
}

/**
 * Assemble the legacy Statement-of-Facts timeline without collapsing UUID
 * event identity into an integer. Event IDs therefore remain UUID strings;
 * integer-domain evidence IDs remain numbers. The JSON source map preserves
 * that exact upstream identity at runtime even while older TypeScript aliases
 * still describe the historical integer-only model.
 */
export async function getCaseTimelineData(caseId: number): Promise<any[]> {
  const result = await getPool().query(
    `with bridge as (
       select case_uuid
         from public.case_identity_bridge
        where legacy_case_id = $1
        limit 1
     )
     select * from (
       select
         'event'::text as item_type,
         e.id::text as item_id,
         e.event_date::text as date_value,
         'exact'::text as date_precision,
         coalesce(nullif(e.event_type, ''), 'Event')::text as label,
         e.description::text as description,
         null::integer as document_id,
         null::text as document_name,
         null::text as page_text,
         null::text as evidentiary_weight
       from public.events e
       join bridge b on b.case_uuid = e.case_id

       union all

       select
         'claim', c.id::text, nullif(c.date_referenced, ''), 'referenced',
         coalesce(nullif(c.claim_text, ''), nullif(c.claim_type, ''), 'Claim'),
         c.claim_text, c.document_id, d.filename, null::text,
         c.evidentiary_weight
       from public.claims c
       left join public.documents d on d.id = c.document_id
       where c.case_id = $1

       union all

       select
         'quote', q.id::text, null::text, 'unknown',
         coalesce(nullif(q.quote_text, ''), 'Quote'),
         q.quote_text, q.document_id, d.filename, q.page_number,
         null::text
       from public.quotes q
       left join public.documents d on d.id = q.document_id
       where q.case_id = $1

       union all

       select
         'finding', f.id::text, null::text, 'unknown',
         coalesce(nullif(f.title, ''), nullif(f.finding_type, ''), 'Finding'),
         f.description, null::integer, null::text, null::text,
         f.finding_evidentiary_weight
       from public.findings f
       where f.case_id = $1

       union all

       select
         'foia_request', fr.id::text,
         case when fr.submitted_at is not null and fr.submitted_at > 0
              then to_timestamp(fr.submitted_at / 1000.0)::text else null end,
         case when fr.submitted_at is not null and fr.submitted_at > 0
              then 'exact' else 'unknown' end,
         coalesce(nullif(fr.record_type, ''), nullif(fr.agency_name, ''), 'Records request'),
         fr.letter_content, null::integer, null::text, null::text, null::text
       from public.foia_requests fr
       where fr.case_id = $1
     ) timeline_rows`,
    [caseId],
  );

  const items: timeline_item_compat[] = result.rows.map((row: any) => {
    const normalized = normalize_date(row.date_value);
    const page_number = row.page_text !== null && /^\d+$/.test(String(row.page_text))
      ? Number(row.page_text)
      : null;
    return {
      type: row.item_type,
      id: as_item_id(row.item_id),
      date: normalized.date,
      datePrecision: row.date_precision ?? null,
      sortKey: normalized.sortKey,
      label: String(row.label ?? row.item_type ?? "Record"),
      description: row.description === null || row.description === undefined
        ? null
        : String(row.description),
      documentId: row.document_id === null || row.document_id === undefined
        ? null
        : as_number(row.document_id),
      documentName: row.document_name === null || row.document_name === undefined
        ? null
        : String(row.document_name),
      page: page_number,
      entityNames: [],
      evidentiaryWeight: row.evidentiary_weight === null || row.evidentiary_weight === undefined
        ? null
        : String(row.evidentiary_weight),
    };
  });

  return items.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    const type_order = ["event", "claim", "quote", "finding", "foia_request"];
    const type_delta = type_order.indexOf(a.type) - type_order.indexOf(b.type);
    if (type_delta !== 0) return type_delta;
    return String(a.id).localeCompare(String(b.id), "en", { numeric: true });
  });
}
