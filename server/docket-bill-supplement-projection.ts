import { query_with_diagnostics } from "./db";

/**
 * Docket Room actor layer, step 3: project each bill's official supplements
 * (analyses, fiscal notes, veto letters, ...) from the stored provider detail.
 * Reads only the cached snapshot (no provider calls). LegiScan's "0000-00-00"
 * placeholder becomes no date. An older snapshot never overwrites a newer one.
 */
export const DOCKET_BILL_SUPPLEMENT_PROJECTION_SQL = `
  insert into public.docket_bill_supplement_v1 as existing (
    supplement_id, source_bill_id, state_code, supplement_type,
    supplement_type_id, title, description, supplement_date, mime,
    legiscan_url, state_link, supplement_hash, supplement_size,
    docket_fetched_at, docket_source
  )
  select (supplement->>'supplement_id')::bigint,
         cache.bill_id,
         nullif(cache.bill->>'state', ''),
         nullif(supplement->>'type', ''),
         nullif(supplement->>'type_id', '')::integer,
         nullif(supplement->>'title', ''),
         nullif(supplement->>'description', ''),
         case when coalesce(supplement->>'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
               and supplement->>'date' <> '0000-00-00'
              then (supplement->>'date')::date end,
         nullif(supplement->>'mime', ''),
         nullif(supplement->>'url', ''),
         nullif(supplement->>'state_link', ''),
         nullif(supplement->>'supplement_hash', ''),
         nullif(nullif(supplement->>'supplement_size', '')::bigint, 0),
         cache.fetched_at,
         cache.source
    from public.docket_bill_detail_cache cache
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cache.bill->'supplements') = 'array'
           then cache.bill->'supplements' else '[]'::jsonb end
    ) as supplement
   where cache.bill_id = $1::integer
     and coalesce(supplement->>'supplement_id', '') ~ '^[1-9][0-9]*$'
  on conflict (supplement_id) do update
     set source_bill_id = excluded.source_bill_id,
         state_code = excluded.state_code,
         supplement_type = excluded.supplement_type,
         supplement_type_id = excluded.supplement_type_id,
         title = excluded.title,
         description = excluded.description,
         supplement_date = excluded.supplement_date,
         mime = excluded.mime,
         legiscan_url = excluded.legiscan_url,
         state_link = excluded.state_link,
         supplement_hash = excluded.supplement_hash,
         supplement_size = excluded.supplement_size,
         docket_fetched_at = excluded.docket_fetched_at,
         docket_source = excluded.docket_source,
         recorded_at = now()
   where excluded.docket_fetched_at >= existing.docket_fetched_at
  returning supplement_id`;

export function docket_bill_supplement_projection_enabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.DOCKET_BILL_SUPPLEMENT_PROJECTION_ENABLED === "true";
}

/** Best effort: a failure is logged and never fails the caller's job. */
export async function project_docket_bill_supplements(source_bill_id: number): Promise<number> {
  if (!docket_bill_supplement_projection_enabled()) return 0;
  try {
    const result = await query_with_diagnostics<{ supplement_id: string }>(
      DOCKET_BILL_SUPPLEMENT_PROJECTION_SQL,
      [source_bill_id],
      {
        label: "docket_bill_supplement_projection",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: 5_000,
      },
    );
    return result.rows.length;
  } catch (error) {
    console.error("[DocketBillSupplementProjection] failed", {
      source_bill_id,
      error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return 0;
  }
}
