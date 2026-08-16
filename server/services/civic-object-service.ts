import { query_with_diagnostics } from "../db";

export type CivicObjectSearchInput = {
  query?: string | null;
  jurisdiction?: string | null;
  objectClasses?: string[] | null;
  readyOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function getCivicObjectState() {
  const { rows } = await query_with_diagnostics<{ snapshot: Record<string, unknown> }>(
    `select public.get_lighthouse_civic_object_snapshot_v1() as snapshot`,
    [],
    { label: "civic_object_snapshot", query_timeout_ms: 5_000 },
  );

  return rows[0]?.snapshot ?? {};
}

export async function searchCivicObjects(input: CivicObjectSearchInput = {}) {
  const limit = Math.min(200, Math.max(1, Math.floor(Number(input.limit ?? 50))));
  const offset = Math.max(0, Math.floor(Number(input.offset ?? 0)));
  const objectClasses = Array.isArray(input.objectClasses)
    ? input.objectClasses.map((value) => String(value).trim()).filter(Boolean).slice(0, 32)
    : null;

  const { rows } = await query_with_diagnostics<Record<string, unknown>>(
    `select *
       from public.search_lighthouse_civic_objects_v1(
         $1::text,
         $2::text,
         $3::text[],
         $4::boolean,
         $5::integer,
         $6::integer
       )`,
    [
      input.query == null ? null : String(input.query).trim() || null,
      input.jurisdiction == null ? null : String(input.jurisdiction).trim() || null,
      objectClasses,
      Boolean(input.readyOnly ?? false),
      limit,
      offset,
    ],
    { label: "civic_object_search", query_timeout_ms: 5_000 },
  );

  return {
    rows,
    count: rows.length,
    limit,
    offset,
    filters: {
      query: input.query ?? null,
      jurisdiction: input.jurisdiction ?? null,
      object_classes: objectClasses,
      ready_only: Boolean(input.readyOnly ?? false),
    },
  };
}
