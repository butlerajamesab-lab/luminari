import { GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON } from "../civic-genome-rosetta-publication-quarantine";
import { Router } from "express";
import {
  get_bill,
  get_master_list,
  get_session_list,
  LEGISCAN_ROLLOUT_STATES,
  type legiscan_bill_detail,
  type legiscan_master_bill,
  type legiscan_session,
} from "../services/legiscan";
import {
  pick_preferred_legiscan_session,
} from "../docket-session";
import {
  project_docket_state_cache_to_civic_genome_serialized,
  type civic_genome_projection_result,
} from "../civic-genome-projection";
import { query_with_diagnostics } from "../db";
import { accept_docket_bill_detail } from "../docket-bill-detail-acceptance";
import {
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "../runtime-role";

const cache_ttl_ms = 24 * 60 * 60 * 1000;
const bill_detail_cache_ttl_ms = 24 * 60 * 60 * 1000;
const current_bill_window_limit = 100;
const warm_state_delay_ms = 750;
const warm_next_batch_default_limit = 5;
const warm_next_batch_max_limit = 10;
const request_refresh_failure_cooldown_ms = 5 * 60 * 1000;

export const docket_router = Router();
const state_refresh_in_flight = new Map<string, Promise<docket_state_refresh_result>>();
const state_refresh_retry_after = new Map<string, number>();

type docket_state_cache_row = {
  id?: string;
  state: string;
  session_id: number;
  session_title: string | null;
  sessions: legiscan_session[];
  bills: legiscan_master_bill[];
  bill_count: number;
  fetched_at: string;
  source: string;
};

type docket_state_cache_database_row = Omit<docket_state_cache_row, "fetched_at"> & {
  fetched_at: string | Date;
};

type docket_bill_detail_cache_row = {
  bill_id: number;
  bill: legiscan_bill_detail;
  fetched_at: string;
  source: string;
};

type docket_bill_detail_cache_database_row = Omit<docket_bill_detail_cache_row, "fetched_at"> & {
  fetched_at: string | Date;
};

type civic_genome_projection_status =
  | {
      ok: true;
      projected: true;
      source: civic_genome_projection_result["source"];
      states_scanned: number;
      bills_seen: number;
      inserted_count: number;
      updated_count: number;
      unchanged_count: number;
      event_count: number;
      family_count: number;
    }
  | {
      ok: false;
      projected: false;
      error: string;
    }
  | {
      ok: true;
      projected: false;
      reason:
        | "cache_fresh_no_projection"
        | "request_scoped_cache_refresh_only"
        | "cache_stale_refreshing"
        | "cache_stale_worker_paused"
        | "cache_stale_request_refresh_failed";
    };

type docket_state_refresh_result = {
  source: string;
  row: docket_state_cache_row;
  civic_genome_projection: civic_genome_projection_status;
};

type docket_warm_state_result = {
  state: string;
  ok: boolean;
  bill_count: number;
  source: string;
  fetched_at: string | null;
  civic_genome_projection?: civic_genome_projection_status;
  error?: string;
};

type docket_search_database_row = {
  bill_id: number;
  state: string;
  bill_number: string;
  title: string;
  url: string | null;
  status: string | null;
  status_date: string | null;
  last_action: string | null;
  last_action_date: string | null;
  effective_date: string | null;
  session_title: string | null;
  session_id?: number | null;
  session_is_current?: boolean | null;
  current_session_fetched_at?: string | Date | null;
  fetched_at: string | Date;
  corpus_source: "detail_cache" | "state_cache";
  match_rank: number;
};

type docket_search_result = {
  state: string;
  session_title: string | null;
  fetched_at: string;
  corpus_source: "detail_cache" | "state_cache";
  bill: legiscan_master_bill & {
    effective_date?: string;
    source_url?: string;
    radar?: Record<string, unknown>;
  };
};

type docket_radar_database_row = {
  source_bill_id: number;
  velocity_score: string | number | null;
  events_14d: string | number | null;
  amended_7d: string | number | null;
  next_event_date: string | Date | null;
  next_event_class: string | null;
  next_event_description: string | null;
  trait_class: string | null;
  base_count: string | number | null;
  latest_count: string | number | null;
  delta: string | number | null;
  base_has_trait_coverage: boolean | null;
  latest_has_trait_coverage: boolean | null;
};

const unavailable_radar = () => ({
  available: false,
  velocity_score: 0,
  events_14d: 0,
  amended_7d: 0,
  next_event_date: null,
  next_event_class: null,
  next_event_description: null,
  drift: [],
  drift_coverage: false,
  structural_state: "quarantined",
  structural_reason: GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON,
});

const finite_number = (value: string | number | null): number => {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
};

const enrich_bills_with_radar = async (
  bills: legiscan_master_bill[],
): Promise<Array<legiscan_master_bill & { radar: Record<string, unknown> }>> => {
  const bill_ids = bills.map(bill => bill.bill_id).filter(Number.isSafeInteger);
  if (bill_ids.length === 0) return [];

  let result;
  try {
    // Preserve source velocity/calendar while structural interpretation is unavailable.
    // NULL comparison counts and explicit quarantine do not claim zero drift.
    result = await query_with_diagnostics<docket_radar_database_row>(
    `with requested(source_bill_id) as (
       select unnest($1::integer[])
     )
     select requested.source_bill_id,
            velocity.velocity_score, velocity.events_14d, velocity.amended_7d,
            next_event.next_event_date, next_event.next_event_class,
            next_event.next_event_description,
            null::text as trait_class,
            null::bigint as base_count, null::bigint as latest_count,
            null::bigint as delta,
            false as base_has_trait_coverage, false as latest_has_trait_coverage
       from requested
       left join (select * from public.docket_bill_velocity
                  where source_bill_id = any($1::integer[])) velocity
         on velocity.source_bill_id = requested.source_bill_id
       left join (select * from public.docket_bill_next_floor_event
                  where bill_id = any($1::integer[])) next_event
         on next_event.bill_id = requested.source_bill_id`,
    [bill_ids],
    {
      label: "docket_radar_state_projection",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
    );
  } catch (error) {
    console.error("[DocketRadar] enrichment_unavailable", { error: serialize_error(error) });
    return bills.map(bill => ({ ...bill, radar: unavailable_radar() }));
  }

  const radar_by_bill = new Map<number, {
    velocity_score: number;
    events_14d: number;
    amended_7d: number;
    next_event_date: string | null;
    next_event_class: string | null;
    next_event_description: string | null;
    drift: Array<{ trait_class: string; base_count: number; latest_count: number; delta: number }>;
    drift_coverage: boolean;
    available: boolean;
    structural_state: "quarantined";
    structural_reason: string;
  }>();

  for (const row of result.rows) {
    const existing = radar_by_bill.get(row.source_bill_id) ?? {
      velocity_score: finite_number(row.velocity_score),
      events_14d: finite_number(row.events_14d),
      amended_7d: finite_number(row.amended_7d),
      next_event_date: row.next_event_date instanceof Date
        ? row.next_event_date.toISOString().slice(0, 10)
        : row.next_event_date,
      next_event_class: row.next_event_class,
      next_event_description: row.next_event_description,
      drift: [],
      drift_coverage: false,
      available: true,
      structural_state: "quarantined" as const,
      structural_reason: GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON,
    };
    radar_by_bill.set(row.source_bill_id, existing);
  }

  return bills.map(bill => ({
    ...bill,
    radar: radar_by_bill.get(bill.bill_id) ?? unavailable_radar(),
  }));
};

const normalize_state_code = (state: unknown): string => {
  if (typeof state !== "string") {
    throw new Error("Missing required query parameter: state");
  }

  const normalized = state.trim().toUpperCase();

  if (!LEGISCAN_ROLLOUT_STATES.includes(normalized as (typeof LEGISCAN_ROLLOUT_STATES)[number])) {
    throw new Error(`Invalid state code: ${state}`);
  }

  return normalized;
};

const normalize_search_limit = (value: unknown): number => {
  const parsed = value == null ? 25 : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("invalid_docket_search_limit");
  }
  return Math.min(parsed, 50);
};

const normalize_search_query = (value: unknown): {
  query: string;
  normalized_number: string;
} => {
  if (typeof value !== "string") {
    throw new Error("missing_docket_search_query");
  }
  const query = value.trim();
  if (query.length < 2 || query.length > 160) {
    throw new Error("invalid_docket_search_query");
  }
  return {
    query,
    normalized_number: query.toUpperCase().replace(/[^A-Z0-9]/g, ""),
  };
};

const normalize_optional_state_code = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  return normalize_state_code(value);
};

const nullable_number = (value: string | null): number | undefined => {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalize_bill_id = (bill_id: unknown): number => {
  if (typeof bill_id !== "string" || !/^\d+$/.test(bill_id)) {
    throw new Error("invalid_bill_id_parameter");
  }

  const normalized = Number(bill_id);

  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error("invalid_bill_id_parameter");
  }

  return normalized;
};

const normalize_fetched_at = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : value;

const search_docket_corpus = async (input: {
  query: string;
  normalized_number: string;
  state: string | null;
  exclude_federal: boolean;
  limit: number;
}): Promise<docket_search_result[]> => {
  const result = await query_with_diagnostics<docket_search_database_row>(
    `with source_matches as (
        select candidates.bill_id,min(candidates.match_rank) as match_rank
        from (
          (select cache.bill_id,0 as match_rank
            from public.docket_bill_detail_cache cache
            where cache.bill_id=$5::integer
              and ($3::text is null or upper(cache.bill->>'state')=$3)
              and (not $6::boolean or upper(coalesce(cache.bill->>'state','')) <> 'US')
            limit $4)
          union all
          (select cache.bill_id,1 as match_rank
            from public.docket_bill_detail_cache cache
            where upper(regexp_replace(
                 upper(coalesce(cache.bill->>'bill_number',cache.bill->>'number','')),
                 '[^A-Z0-9]','','g'
              ))=$2
              and ($3::text is null or upper(cache.bill->>'state')=$3)
              and (not $6::boolean or upper(coalesce(cache.bill->>'state','')) <> 'US')
            limit $4)
          union all
          (select cache.bill_id,2 as match_rank
            from public.docket_bill_detail_cache cache
            where length($1::text)>=3
              and coalesce(cache.bill->>'title','') ilike '%'||$1||'%'
              and ($3::text is null or upper(cache.bill->>'state')=$3)
              and (not $6::boolean or upper(coalesce(cache.bill->>'state','')) <> 'US')
            limit $4)
        ) candidates
        group by candidates.bill_id
      )
      select cache.bill_id,
             upper(coalesce(cache.bill->>'state','')) as state,
             coalesce(cache.bill->>'bill_number',cache.bill->>'number','') as bill_number,
             coalesce(cache.bill->>'title','') as title,
             coalesce(cache.bill->>'url',cache.bill->>'state_link') as url,
             cache.bill->>'status' as status,
             cache.bill->>'status_date' as status_date,
             cache.bill->>'last_action' as last_action,
             cache.bill->>'last_action_date' as last_action_date,
             cache.bill->>'effective_date' as effective_date,
             coalesce(cache.bill #>> '{session,session_title}',
                      cache.bill #>> '{session,session_name}',
                      cache.bill->>'session_title') as session_title,
             cache.fetched_at,
             'detail_cache'::text as corpus_source,
             source_matches.match_rank
      from source_matches
      join public.docket_bill_detail_cache cache on cache.bill_id=source_matches.bill_id
      order by source_matches.match_rank,cache.bill_id
      limit $4`,
    [input.query, input.normalized_number, input.state, input.limit,
     /^\d+$/.test(input.query) && Number.isSafeInteger(Number(input.query))
       ? Number(input.query) : -1, input.exclude_federal],
    {
      label: "docket_full_corpus_search",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  const base_bills = result.rows.map(row => ({
    bill_id: row.bill_id,
    number: row.bill_number || `Bill ${row.bill_id}`,
    title: row.title || undefined,
    url: row.url ?? undefined,
    status: nullable_number(row.status),
    status_date: row.status_date ?? undefined,
    last_action_date: row.last_action_date ?? undefined,
    last_action: row.last_action ?? undefined,
  }));
  const enriched = await enrich_bills_with_radar(base_bills);
  const radar_by_bill = new Map(enriched.map(bill => [bill.bill_id, bill.radar]));

  return result.rows.map(row => ({
    state: row.state,
    session_title: row.session_title,
    fetched_at: normalize_fetched_at(row.fetched_at),
    corpus_source: row.corpus_source,
    bill: {
      bill_id: row.bill_id,
      number: row.bill_number || `Bill ${row.bill_id}`,
      title: row.title || undefined,
      url: row.url ?? undefined,
      source_url: row.url ?? undefined,
      status: nullable_number(row.status),
      status_date: row.status_date ?? undefined,
      last_action_date: row.last_action_date ?? undefined,
      last_action: row.last_action ?? undefined,
      effective_date: row.effective_date ?? undefined,
      radar: radar_by_bill.get(row.bill_id) ?? unavailable_radar(),
    },
  }));
};

const read_state_cache = async (state: string): Promise<docket_state_cache_row | null> => {
  const result = await query_with_diagnostics<docket_state_cache_database_row>(
    `select id, state, session_id, session_title, sessions, bills, bill_count, fetched_at, source
       from public.docket_bill_state_cache
      where state = $1
      limit 1`,
    [state],
    {
      label: "docket_state_cache_read",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = result.rows[0];

  return row ? { ...row, fetched_at: normalize_fetched_at(row.fetched_at) } : null;
};

const read_all_state_cache = async (): Promise<docket_state_cache_row[]> => {
  const result = await query_with_diagnostics<docket_state_cache_database_row>(
    `select id, state, session_id, session_title, sessions, bills, bill_count, fetched_at, source
       from public.docket_bill_state_cache
      where state = any($1::text[])`,
    [LEGISCAN_ROLLOUT_STATES],
    {
      label: "docket_state_cache_status_rows",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  return result.rows.map(row => ({
    ...row,
    fetched_at: normalize_fetched_at(row.fetched_at),
  }));
};

const upsert_state_cache = async (
  row: docket_state_cache_row,
  projection_required: boolean,
): Promise<void> => {
  await query_with_diagnostics(
    `with cache_write as (
       insert into public.docket_bill_state_cache (
       state, session_id, session_title, sessions, bills, bill_count, fetched_at, source
       ) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::timestamptz, $8)
       on conflict (state) do update set
       session_id = excluded.session_id,
       session_title = excluded.session_title,
       sessions = excluded.sessions,
       bills = excluded.bills,
       bill_count = excluded.bill_count,
       fetched_at = excluded.fetched_at,
       source = excluded.source,
       updated_at = now()
       returning state
     )
     insert into public.docket_state_projection_retry
       (state, failure_count, retry_after, last_error_code, updated_at)
     select state, 1, now(), 'request_scoped_cache_refresh_requires_projection', now()
       from cache_write
      where $9::boolean
     on conflict (state) do update set
       retry_after = now(),
       last_error_code = excluded.last_error_code,
       updated_at = now()`,
    [row.state, row.session_id, row.session_title, JSON.stringify(row.sessions), JSON.stringify(row.bills), row.bill_count, row.fetched_at, row.source, projection_required],
    {
      label: "docket_state_cache_upsert",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
};

const read_bill_detail_cache = async (bill_id: number): Promise<docket_bill_detail_cache_row | null> => {
  const result = await query_with_diagnostics<docket_bill_detail_cache_database_row>(
    `select bill_id, bill, fetched_at, source
       from public.docket_bill_detail_cache
      where bill_id = $1
      limit 1`,
    [bill_id],
    {
      label: "docket_bill_detail_cache_read",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = result.rows[0];

  return row ? { ...row, fetched_at: normalize_fetched_at(row.fetched_at) } : null;
};

const upsert_bill_detail_cache = async (row: docket_bill_detail_cache_row): Promise<void> => {
  await accept_docket_bill_detail({ bill_id: row.bill_id, bill: row.bill, source: row.source, label: "docket_bill_detail_cache_upsert" });
};

const is_fresh = (fetched_at: string, ttl_ms = cache_ttl_ms): boolean => {
  const fetched_ms = new Date(fetched_at).getTime();

  if (!Number.isFinite(fetched_ms)) {
    return false;
  }

  const fetched = new Date(fetched_ms);
  const now = new Date();
  if (fetched.getUTCFullYear() !== now.getUTCFullYear()) {
    return false;
  }

  return Date.now() - fetched_ms < ttl_ms;
};

const age_minutes = (fetched_at: string | null): number | null => {
  if (!fetched_at) {
    return null;
  }

  const fetched_ms = new Date(fetched_at).getTime();

  if (!Number.isFinite(fetched_ms)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - fetched_ms) / 60000));
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const normalize_batch_limit = (limit: unknown): number => {
  if (limit === undefined || limit === null) {
    return warm_next_batch_default_limit;
  }

  const normalized = Number(limit);

  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error("invalid_warm_next_batch_limit");
  }

  return Math.min(normalized, warm_next_batch_max_limit);
};

const format_cache_status = (state: string, cached: docket_state_cache_row | null) => ({
  state,
  has_cache: Boolean(cached),
  bill_count: cached?.bill_count ?? 0,
  session_id: cached?.session_id ?? null,
  session_title: cached?.session_title ?? null,
  fetched_at: cached?.fetched_at ?? null,
  age_minutes: age_minutes(cached?.fetched_at ?? null),
  is_fresh: cached ? is_fresh(cached.fetched_at) : false,
});

const summarize_civic_genome_projection = (
  projection: civic_genome_projection_result,
): civic_genome_projection_status => ({
  ok: true,
  projected: true,
  source: projection.source,
  states_scanned: projection.states_scanned,
  bills_seen: projection.bills_seen,
  inserted_count: projection.inserted_count,
  updated_count: projection.updated_count,
  unchanged_count: projection.unchanged_count,
  event_count: projection.event_count,
  family_count: projection.family_count,
});

const project_refreshed_state_to_civic_genome = async (state: string): Promise<civic_genome_projection_status> => {
  const projection = await project_docket_state_cache_to_civic_genome_serialized(state);
  return summarize_civic_genome_projection(projection);
};

const refresh_state_cache = async (
  state: string,
  { project_to_civic_genome = true }: { project_to_civic_genome?: boolean } = {},
): Promise<docket_state_refresh_result> => {
  const cached = await read_state_cache(state);

  if (cached && is_fresh(cached.fetched_at)) {
    return {
      source: "cache",
      row: cached,
      civic_genome_projection: project_to_civic_genome
        ? await project_refreshed_state_to_civic_genome(state)
        : {
            ok: true,
            projected: false,
            reason: "cache_fresh_no_projection",
          },
    };
  }

  const sessions = await get_session_list(state);
  const session = pick_preferred_legiscan_session(sessions);

  if (!session?.session_id) {
    throw new Error(`no_legiscan_sessions_found_for_${state}`);
  }

  const bills = (await get_master_list(session.session_id))
    .slice(0, current_bill_window_limit);
  const row: docket_state_cache_row = {
    state,
    session_id: session.session_id,
    session_title: session.session_title ?? session.session_name ?? session.name ?? null,
    sessions,
    bills,
    bill_count: bills.length,
    fetched_at: new Date().toISOString(),
    source: "legiscan_get_master_list",
  };

  await upsert_state_cache(row, !project_to_civic_genome);
  const civic_genome_projection: civic_genome_projection_status = project_to_civic_genome
    ? await project_refreshed_state_to_civic_genome(state)
    : {
        ok: true,
        projected: false,
        reason: "request_scoped_cache_refresh_only",
      };

  return {
    source: cached ? "legiscan_refresh_stale_cache" : "legiscan_refresh_empty_cache",
    row,
    civic_genome_projection,
  };
};

const serialize_error = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.replace(/key=[^&\s]+/gi, "key=[redacted]");
  }

  return "unknown_docket_room_error";
};

const retry_after_iso = (state: string): string | null => {
  const retry_after = state_refresh_retry_after.get(state);
  return retry_after && retry_after > Date.now()
    ? new Date(retry_after).toISOString()
    : null;
};

const get_or_start_state_refresh = (
  state: string,
  trigger: "background" | "request_scoped",
): Promise<docket_state_refresh_result> => {
  const existing = state_refresh_in_flight.get(state);
  if (existing) return existing;

  const refresh = refresh_state_cache(state, {
    project_to_civic_genome: trigger === "background",
  })
    .then(result => {
      state_refresh_retry_after.delete(state);
      console.log("[Docket] state_refresh_completed", {
        state,
        trigger,
        source: result.source,
        bill_count: result.row.bill_count,
        fetched_at: result.row.fetched_at,
        projection_state: result.civic_genome_projection.projected ? "projected" : "not_projected",
      });
      return result;
    })
    .catch(error => {
      state_refresh_retry_after.set(
        state,
        Date.now() + request_refresh_failure_cooldown_ms,
      );
      console.error("[Docket] state_refresh_failed", {
        state,
        trigger,
        retry_after: retry_after_iso(state),
        error: serialize_error(error),
      });
      throw error;
    })
    .finally(() => {
      if (state_refresh_in_flight.get(state) === refresh) {
        state_refresh_in_flight.delete(state);
      }
    });

  state_refresh_in_flight.set(state, refresh);
  return refresh;
};

export async function wait_for_docket_state_refreshes(): Promise<void> {
  while (state_refresh_in_flight.size > 0) {
    await Promise.allSettled([...state_refresh_in_flight.values()]);
  }
}

const schedule_state_refresh = (state: string): void => {
  if (!background_workers_allowed()) return;
  void get_or_start_state_refresh(state, "background").catch(() => undefined);
};

docket_router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (background_workers_allowed()) return next();

  return res.status(503).json({
    ok: false,
    error: "background_runtime_required",
    message: "Docket refresh operations are disabled on the Lighthouse web service.",
    runtime_role: resolve_lighthouse_runtime_role(),
  });
});

docket_router.get("/jurisdictions", (_req, res) => {
  return res.json({
    ok: true,
    states: LEGISCAN_ROLLOUT_STATES,
    coverage: {
      federal: { available: true, jurisdictions: ["US"] },
      state: { available: true, jurisdictions: LEGISCAN_ROLLOUT_STATES.filter(state => state !== "US") },
      city: { available: true, jurisdictions: ["Seattle, WA"], source: "legistar" },
      county: { available: false, reason: "source_adapter_not_established" },
      tribal: { available: false, reason: "source_adapter_not_established" },
    },
    note: "coverage_is_reported_per_level; unavailable_levels_are_never_implied",
  });
});

docket_router.get("/cache-status", async (_req, res) => {
  try {
    const rows = await read_all_state_cache();
    const rows_by_state = new Map(rows.map(row => [row.state, row]));

    return res.json({
      ok: true,
      status_source: "production_database",
      states: LEGISCAN_ROLLOUT_STATES.map(state => format_cache_status(state, rows_by_state.get(state) ?? null)),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: serialize_error(error),
    });
  }
});

docket_router.post("/warm-state", async (req, res) => {
  try {
    const state = normalize_state_code(req.body?.state);
    const refreshed = await get_or_start_state_refresh(state, "background");

    return res.json({
      ok: true,
      state,
      source: refreshed.source,
      bill_count: refreshed.row.bill_count,
      session_id: refreshed.row.session_id,
      session_title: refreshed.row.session_title,
      fetched_at: refreshed.row.fetched_at,
      civic_genome_projection: refreshed.civic_genome_projection,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: serialize_error(error),
      message: serialize_error(error),
    });
  }
});

docket_router.post("/warm-next-batch", async (req, res) => {
  try {
    const limit = normalize_batch_limit(req.body?.limit);
    const rows = await read_all_state_cache();
    const rows_by_state = new Map(rows.map(row => [row.state, row]));
    const pending_states = LEGISCAN_ROLLOUT_STATES
      .filter(state => {
        const cached = rows_by_state.get(state);
        return !cached || !is_fresh(cached.fetched_at);
      });
    const states_to_warm = pending_states.slice(0, limit);
    const results: docket_warm_state_result[] = [];

    for (const state of states_to_warm) {
      try {
        const refreshed = await get_or_start_state_refresh(state, "background");
        results.push({
          state,
          ok: true,
          bill_count: refreshed.row.bill_count,
          source: refreshed.source,
          fetched_at: refreshed.row.fetched_at,
          civic_genome_projection: refreshed.civic_genome_projection,
        });
      } catch (error) {
        results.push({
          state,
          ok: false,
          bill_count: 0,
          source: "warm_next_batch_error",
          fetched_at: null,
          error: serialize_error(error),
        });
      }

      await sleep(warm_state_delay_ms);
    }

    return res.json({
      ok: true,
      limit,
      warmed_count: results.length,
      remaining_count: Math.max(0, pending_states.length - results.filter(result => result.ok).length),
      results,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: serialize_error(error),
      message: serialize_error(error),
    });
  }
});

// Canonical public Docket surface. Read ONLY the preserved provider corpus.
// Archive ordering and lifecycle metadata come from the preserved source bill,
// not a per-page provider call.
docket_router.get("/archive/sessions", async (req, res) => {
  try {
    const state = normalize_optional_state_code(req.query.state);
    const sql = [
      "select upper(coalesce(cache.bill->>'state','')) as state,",
      "case when cache.bill->>'session_id' ~ '^[0-9]+$' then (cache.bill->>'session_id')::integer end as session_id,",
      "coalesce(cache.bill #>> '{session,session_title}',",
      "         cache.bill #>> '{session,session_name}',",
      "         cache.bill->>'session_title','Session not reported') as session_title,",
      "count(*) as bill_count",
      "from public.docket_bill_detail_cache cache",
      "where cache.bill->>'session_id' ~ '^[0-9]+$'",
      ...(state ? ["and upper(coalesce(cache.bill->>'state',''))=$1"] : []),
      "group by 1,2,3",
      "order by 1,3 desc,2",
    ].join("\n");
    const result = await query_with_diagnostics<{
      state: string;
      session_id: number;
      session_title: string;
      bill_count: string | number;
    }>(
      sql,
      state ? [state] : [],
      {label:"docket_preserved_archive_sessions",query_timeout_ms:10_000}
    );
    return res.json({
      ok:true,contract:"docket-preserved-sessions-v1",
      state_scope:state,
      results:result.rows.map(row=>({
        state:row.state,
        session_id:Number(row.session_id),
        session_title:row.session_title,
        bill_count:Number(row.bill_count)
      }))
    });
  } catch (error) {
    return res.status(500).json({ok:false,message:serialize_error(error)});
  }
});

docket_router.get("/archive", async (req, res) => {
  try {
    const state = normalize_optional_state_code(req.query.state);
    const jurisdiction_scope = req.query.jurisdiction_scope === "state" ? "state" : null;
    const limit = normalize_search_limit(req.query.limit);
    const after_id_raw = req.query.after_id == null || req.query.after_id === ""
      ? null : String(req.query.after_id);
    const after_id = after_id_raw == null ? null : normalize_bill_id(after_id_raw);
    const after_date_raw = req.query.after_date == null ? null : String(req.query.after_date);
    const after_date = after_date_raw ? after_date_raw : null;
    if ((after_id === null) !== (after_date_raw === null)) {
      // An empty date is valid only for the NULL-date tail cursor.
      if (!(after_id !== null && after_date_raw === "")) {
        return res.status(400).json({ok:false,message:"docket_archive_cursor_incomplete"});
      }
    }
    if (after_date && !/^\d{4}-\d{2}-\d{2}$/.test(after_date)) {
      return res.status(400).json({ok:false,message:"docket_archive_cursor_date_invalid"});
    }
    const requested_session_state = normalize_optional_state_code(req.query.session_state);
    const requested_session_id = req.query.session_id == null || req.query.session_id === ""
      ? null : normalize_bill_id(String(req.query.session_id));
    if ((requested_session_state === null) !== (requested_session_id === null)) {
      return res.status(400).json({ok:false,message:"docket_archive_session_filter_incomplete"});
    }
    if (state && requested_session_state && state !== requested_session_state) {
      return res.status(400).json({ok:false,message:"docket_archive_session_state_conflict"});
    }
    const indexes = await query_with_diagnostics<{ready:boolean}>(
      "select to_regclass('public.docket_bill_detail_cache_action_date_public_idx') is not null as ready",
      [],{label:"docket_archive_action_order_index_contract",query_timeout_ms:1000}
    );
    if (!indexes.rows[0]?.ready) {
      return res.status(503).json({ok:false,message:"docket_archive_action_order_index_not_installed"});
    }
    if (state) {
      const state_index = await query_with_diagnostics<{ready:boolean}>(
        "select to_regclass('public.docket_bill_detail_cache_state_action_date_public_idx') is not null as ready",
        [],{label:"docket_archive_state_action_order_index_contract",query_timeout_ms:1000}
      );
      if (!state_index.rows[0]?.ready) {
        return res.status(503).json({ok:false,message:"docket_archive_state_action_order_index_not_installed"});
      }
    }
    if (requested_session_state) {
      const session_index = await query_with_diagnostics<{ready:boolean}>(
        "select to_regclass('public.docket_bill_detail_cache_state_session_action_public_idx') is not null as ready",
        [],{label:"docket_archive_session_action_order_index_contract",query_timeout_ms:1000}
      );
      if (!session_index.rows[0]?.ready) {
        return res.status(503).json({ok:false,message:"docket_archive_session_action_order_index_not_installed"});
      }
    }

    const params: unknown[] = [];
    const where: string[] = [];
    const add_param = (value: unknown): string => {
      params.push(value);
      return "$"+params.length;
    };
    if (state) where.push("upper(coalesce(cache.bill->>'state',''))="+add_param(state));
    if (jurisdiction_scope === "state") where.push("upper(coalesce(cache.bill->>'state','')) <> 'US'");
    if (requested_session_state && requested_session_id !== null) {
      where.push("upper(coalesce(cache.bill->>'state',''))="+add_param(requested_session_state));
      where.push("(cache.bill->>'session_id')="+add_param(String(requested_session_id)));
    }
    const action_date_expr = "public.docket_bill_latest_action_date_v1(cache.bill)";
    if (after_id !== null) {
      const id_param = add_param(after_id);
      if (after_date) {
        const date_param = add_param(after_date);
        where.push(`(${action_date_expr}<${date_param}
          or (${action_date_expr}=${date_param} and cache.bill_id>${id_param})
          or ${action_date_expr} is null)`);
      } else {
        where.push(`(${action_date_expr} is null and cache.bill_id>${id_param})`);
      }
    }
    const limit_param = add_param(limit+1);
    const select = `select cache.bill_id,
            upper(coalesce(cache.bill->>'state','')) as state,
            coalesce(cache.bill->>'bill_number',cache.bill->>'number','') as bill_number,
            coalesce(cache.bill->>'title','') as title,
            coalesce(cache.bill->>'url',cache.bill->>'state_link') as url,
            cache.bill->>'status' as status,
            cache.bill->>'status_date' as status_date,
            coalesce(
              (select history_item->>'action'
                 from jsonb_array_elements(
                   case when jsonb_typeof(cache.bill->'history')='array'
                        then cache.bill->'history' else '[]'::jsonb end
                 ) with ordinality as history(history_item,position)
                where history_item->>'date'=${action_date_expr}
                order by case when history_item->>'importance'='1' then 1 else 0 end desc,
                         position desc
                limit 1),
              cache.bill->>'last_action'
            ) as last_action,
            ${action_date_expr} as last_action_date,
            cache.bill->>'effective_date' as effective_date,
            coalesce(cache.bill #>> '{session,session_title}',
                     cache.bill #>> '{session,session_name}',
                     cache.bill->>'session_title') as session_title,
            case when cache.bill->>'session_id' ~ '^[0-9]+$'
                 then (cache.bill->>'session_id')::integer end as session_id,
            case
              when session_cache.fetched_at < now()-interval '24 hours'
                or cache.bill->>'session_id' !~ '^[0-9]+$'
              then null
              else (
                select case
                  when session_evidence->>'prior' in ('1','true','yes','y') then false
                  when session_evidence->>'prior' in ('0','false','no','n') then true
                  when session_evidence->>'sine_die' in ('1','true','yes','y') then false
                  when session_evidence->>'sine_die' in ('0','false','no','n') then true
                  else null
                end
                from jsonb_array_elements(
                  case when jsonb_typeof(session_cache.sessions)='array'
                       then session_cache.sessions else '[]'::jsonb end
                ) as session_items(session_evidence)
                where session_evidence->>'session_id'=(cache.bill->>'session_id')
                limit 1
              )
            end as session_is_current,
            session_cache.fetched_at as current_session_fetched_at,
            cache.fetched_at,'detail_cache'::text as corpus_source,0 as match_rank
       from public.docket_bill_detail_cache cache
       left join public.docket_bill_state_cache session_cache
         on upper(session_cache.state)=upper(coalesce(cache.bill->>'state',''))
      ${where.length ? "where "+where.join(" and ") : ""}
      order by ${action_date_expr} desc nulls last,cache.bill_id asc
      limit ${limit_param}`;
    const count_query = state
      ? "select (select count(*) from public.docket_bill_detail_cache) as total_preserved,"
        + "(select count(*) from public.docket_bill_detail_cache where upper(bill->>'state')=$1) as state_total"
      : jurisdiction_scope === "state"
        ? "select (select count(*) from public.docket_bill_detail_cache) as total_preserved,"
          + "(select count(*) from public.docket_bill_detail_cache where upper(coalesce(bill->>'state','')) <> 'US') as state_total"
        : "select count(*) as total_preserved,count(*) as state_total from public.docket_bill_detail_cache";
    const [page,count] = await Promise.all([
      query_with_diagnostics<docket_search_database_row>(
        select,params,{label:"docket_preserved_archive_page",query_timeout_ms:10_000}
      ),
      query_with_diagnostics<{total_preserved:string|number;state_total:string|number}>(
        count_query,state?[state]:[],{label:"docket_preserved_archive_count",query_timeout_ms:5_000}
      )
    ]);
    const has_more=page.rows.length>limit;
    const rows=page.rows.slice(0,limit);
    const base_bills=rows.map(row=>({
      bill_id:row.bill_id,
      number:row.bill_number||"Bill "+row.bill_id,
      title:row.title||undefined,
      url:row.url??undefined,
      status:nullable_number(row.status),
      status_date:row.status_date??undefined,
      last_action:row.last_action??undefined,
      last_action_date:row.last_action_date??undefined
    }));
    const enriched=await enrich_bills_with_radar(base_bills);
    const radar=new Map(enriched.map(bill=>[bill.bill_id,bill.radar]));
    const last_row=rows[rows.length-1];
    return res.json({
      ok:true,contract:"docket-preserved-archive-v2",
      source:"public.docket_bill_detail_cache",state_scope:state,jurisdiction_scope,
      session_scope:requested_session_state && requested_session_id !== null
        ? {state:requested_session_state,session_id:requested_session_id} : null,
      total_preserved:Number(count.rows[0]?.total_preserved??0),
      state_total:Number(count.rows[0]?.state_total??0),
      limit,has_more,
      next_cursor:has_more && last_row
        ? {action_date:last_row.last_action_date??null,bill_id:last_row.bill_id}
        : null,
      results:rows.map(row=>({
        state:row.state,session_title:row.session_title,
        session_id:row.session_id,
        session_is_current:row.session_is_current,
        current_session_fetched_at:row.current_session_fetched_at
          ? normalize_fetched_at(row.current_session_fetched_at) : null,
        fetched_at:normalize_fetched_at(row.fetched_at),
        corpus_source:"detail_cache",
        bill:{
          bill_id:row.bill_id,number:row.bill_number||"Bill "+row.bill_id,
          title:row.title||undefined,url:row.url??undefined,
          source_url:row.url??undefined,status:nullable_number(row.status),
          status_date:row.status_date??undefined,last_action:row.last_action??undefined,
          last_action_date:row.last_action_date??undefined,
          effective_date:row.effective_date??undefined,
          radar:radar.get(row.bill_id)??unavailable_radar()
        }
      }))
    });
  } catch (error) {
    return res.status(500).json({ok:false,message:serialize_error(error)});
  }
});

docket_router.get("/search", async (req, res) => {
  try {
    const installed = await query_with_diagnostics<{ ready: boolean }>(
      "select to_regclass('public.docket_bill_detail_cache_normalized_number_public_idx') is not null and to_regclass('public.docket_bill_detail_cache_title_trgm_public_idx') is not null as ready",
      [],
      {label:"docket_public_search_indexes_verified",query_timeout_ms:1000}
    );
    if (!installed.rows[0]?.ready) {
      return res.status(503).json({ok:false,message:"docket_corpus_search_indexes_not_installed"});
    }
    const normalized = normalize_search_query(req.query.q);
    // Public users can type "PA HB1000" rather than a LegiScan source ID.
    // Resolve only explicit two-letter jurisdiction prefixes, never silently
    // infer which legislative session or substitute document they intended.
    const prefix = /^([A-Za-z]{2})\s*[: -]\s*([A-Za-z]{1,4}[ .-]*\d+[A-Za-z]?)$/.exec(normalized.query);
    const prefix_state = prefix ? normalize_optional_state_code(prefix[1]) : null;
    const requested_state = normalize_optional_state_code(req.query.state);
    const state = requested_state ?? prefix_state;
    const jurisdiction_scope = req.query.jurisdiction_scope === "state" ? "state" : null;
    const search_input = prefix ? normalize_search_query(prefix[2]) : normalized;
    const limit = normalize_search_limit(req.query.limit);
    const results = await search_docket_corpus({
      ...search_input,
      state,
      exclude_federal: jurisdiction_scope === "state",
      limit,
    });

    return res.json({
      ok: true,
      contract: "docket-full-corpus-search-v1",
      source: "preserved_docket_cache",
      query: normalized.query,
      state_scope: state,
      jurisdiction_scope,
      result_count: results.length,
      limit,
      results,
      interpretation:
        "Search spans preserved Docket bill-detail records plus cached jurisdiction bill snapshots. Current-session visibility does not determine whether a preserved law is searchable.",
    });
  } catch (error) {
    const message = serialize_error(error);
    const client_error = message.startsWith("invalid_docket_search")
      || message === "missing_docket_search_query"
      || message.startsWith("Invalid state code")
      || message.startsWith("Missing required query parameter");
    return res.status(client_error ? 400 : 500).json({
      ok: false,
      error: message,
      message,
    });
  }
});

docket_router.get("/state", async (req, res) => {
  try {
    const state = normalize_state_code(req.query.state);
    const cached = await read_state_cache(state);

    if (!cached) {
      return res.status(503).json({
        ok: false,
        error: "docket_state_cache_unavailable",
        message: "No cached Docket state is available. Provider acquisition is worker-owned.",
        runtime_role: resolve_lighthouse_runtime_role(),
      });
    }

    const fresh = is_fresh(cached.fetched_at);
    if (!fresh && background_workers_allowed()) {
      schedule_state_refresh(state);
    }
    const stale_reason = background_workers_allowed()
      ? "cache_stale_refreshing"
      : "cache_stale_worker_paused";

    return res.json({
      ok: true,
      source: fresh ? "cache" : stale_reason,
      state,
      session_id: cached.session_id,
      session_title: cached.session_title,
      session_current: null,
      bill_count: cached.bill_count,
      fetched_at: cached.fetched_at,
      refresh_state: fresh
        ? "fresh"
        : stale_reason === "cache_stale_worker_paused"
          ? "refresh_paused"
          : "stale",
      civic_genome_projection: {
        ok: true,
        projected: false,
        reason: fresh ? "cache_fresh_no_projection" : stale_reason,
      },
      bills: await enrich_bills_with_radar(cached.bills),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: serialize_error(error),
    });
  }
});

docket_router.get("/bill/:bill_id", async (req, res) => {
  try {
    const bill_id = normalize_bill_id(req.params.bill_id);
    const cached = await read_bill_detail_cache(bill_id);

    // An archive snapshot is a preserved provider observation, not a live getBill
    // response. Never spend LegiScan credits just because its local import clock ages.
    if (cached && cached.source === "legiscan_bulk_json") {
      return res.json({
        ok: true,
        source: "legiscan_bulk_json_cache",
        bill_id,
        fetched_at: cached.fetched_at,
        refresh_state: "archive_snapshot",
        bill: cached.bill,
      });
    }

    if (cached && is_fresh(cached.fetched_at, bill_detail_cache_ttl_ms)) {
      return res.json({
        ok: true,
        source: "cache",
        bill_id,
        fetched_at: cached.fetched_at,
        refresh_state: "fresh",
        bill: cached.bill,
      });
    }

    if (cached && !background_workers_allowed()) {
      return res.json({
        ok: true,
        source: "cache_stale_worker_paused",
        bill_id,
        fetched_at: cached.fetched_at,
        refresh_state: "refresh_paused",
        bill: cached.bill,
      });
    }

    if (!cached && !background_workers_allowed()) {
      return res.status(503).json({
        ok: false,
        error: "background_runtime_required",
        message: "No cached Docket bill is available while refresh work is paused.",
        runtime_role: resolve_lighthouse_runtime_role(),
      });
    }

    const bill = await get_bill(bill_id);
    const row: docket_bill_detail_cache_row = {
      bill_id,
      bill,
      fetched_at: new Date().toISOString(),
      source: "legiscan_get_bill",
    };

    await upsert_bill_detail_cache(row);

    return res.json({
      ok: true,
      source: cached ? "legiscan_refresh_stale_cache" : "legiscan_refresh_empty_cache",
      bill_id,
      fetched_at: row.fetched_at,
      refresh_state: "fresh",
      bill,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: serialize_error(error),
    });
  }
});
