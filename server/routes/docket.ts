import { Router } from "express";
import {
  get_bill,
  get_master_list,
  get_session_list,
  LEGISCAN_ROLLOUT_STATES,
  type legiscan_bill_detail,
  type legiscan_master_bill,
} from "../services/legiscan";
import {
  pick_preferred_legiscan_session,
} from "../docket-session";
import {
  project_docket_state_cache_to_civic_genome_serialized,
  type civic_genome_projection_result,
} from "../civic-genome-projection";
import { query_with_diagnostics } from "../db";
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
    // Bound all aggregation to this page. Joining the global drift view first
    // expands baseline/latest classes across the corpus before filtering bills.
    // Keep its version selection and coverage semantics, including removed classes.
    result = await query_with_diagnostics<docket_radar_database_row>(
    `with requested(source_bill_id) as (
       select unnest($1::integer[])
     ), bill_genome as materialized (
       select distinct on (source_bill_id) source_bill_id, genome_bill_id
       from public.civic_genome_bill_version
       where source_bill_id = any($1::integer[])
       order by source_bill_id, stage_rank desc, provider_sequence desc
     ), scoped_versions as materialized (
       select v.genome_bill_id, v.bill_version_id, v.base_bill_version_id,
              v.document_family, v.stage_rank, v.provider_sequence, v.created_at
       from public.civic_genome_bill_version v
       join (select distinct genome_bill_id from bill_genome) g using (genome_bill_id)
     ), latest as (
       select distinct on (genome_bill_id) genome_bill_id, bill_version_id
       from scoped_versions
       where document_family = 'text'
       order by genome_bill_id, stage_rank desc nulls last, provider_sequence desc nulls last
     ), base as (
       select distinct on (genome_bill_id) genome_bill_id, base_bill_version_id
       from scoped_versions where base_bill_version_id is not null
       order by genome_bill_id, created_at
     ), selected as materialized (
       select l.genome_bill_id, l.bill_version_id as latest_id, b.base_bill_version_id as base_id
       from latest l left join base b using (genome_bill_id)
     ), selected_ids as (
       select latest_id as bill_version_id from selected
       union
       select base_id from selected where base_id is not null
     ), class_counts as materialized (
       select v.bill_version_id, t.trait_class, count(distinct t.trait_id) as n
       from selected_ids i
       join public.civic_genome_bill_version v using (bill_version_id)
       join public.civic_genome_prism_verification_binding b on b.assembly_run_id = v.assembly_run_id
       join public.civic_genome_trait t on t.trait_id = b.trait_id
       group by v.bill_version_id, t.trait_class
     ), covered_classes as (
       select s.genome_bill_id, c.trait_class from selected s
       join class_counts c on c.bill_version_id = s.latest_id
       union
       select s.genome_bill_id, c.trait_class from selected s
       join class_counts c on c.bill_version_id = s.base_id
     ), drift as (
       select s.genome_bill_id, c.trait_class,
              coalesce(cb.n, 0) as base_count, coalesce(cl.n, 0) as latest_count,
              coalesce(cl.n, 0) - coalesce(cb.n, 0) as delta,
              coalesce(bv.processing_state in ('verified', 'verified_with_findings')
                and bv.assembly_run_id is not null and bv.prism_verification_run_id is not null, false)
                as base_has_trait_coverage,
              coalesce(lv.processing_state in ('verified', 'verified_with_findings')
                and lv.assembly_run_id is not null and lv.prism_verification_run_id is not null, false)
                as latest_has_trait_coverage
       from selected s join covered_classes c using (genome_bill_id)
       left join class_counts cb on cb.bill_version_id = s.base_id and cb.trait_class = c.trait_class
       left join class_counts cl on cl.bill_version_id = s.latest_id and cl.trait_class = c.trait_class
       left join public.civic_genome_bill_version bv on bv.bill_version_id = s.base_id
       left join public.civic_genome_bill_version lv on lv.bill_version_id = s.latest_id
     )
     select requested.source_bill_id,
            velocity.velocity_score,
            velocity.events_14d,
            velocity.amended_7d,
            next_event.next_event_date,
            next_event.next_event_class,
            next_event.next_event_description,
            drift.trait_class,
            drift.base_count,
            drift.latest_count,
            drift.delta,
            drift.base_has_trait_coverage
            , drift.latest_has_trait_coverage
       from requested
       left join (select * from public.docket_bill_velocity
                  where source_bill_id = any($1::integer[])) velocity
         on velocity.source_bill_id = requested.source_bill_id
       left join bill_genome
         on bill_genome.source_bill_id = requested.source_bill_id
       left join (select * from public.docket_bill_next_floor_event
                  where bill_id = any($1::integer[])) next_event
         on next_event.bill_id = requested.source_bill_id
       left join drift
         on drift.genome_bill_id = bill_genome.genome_bill_id`,
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
    };
    if (row.trait_class && row.base_has_trait_coverage === true && row.latest_has_trait_coverage === true) {
      existing.drift.push({
        trait_class: row.trait_class,
        base_count: finite_number(row.base_count),
        latest_count: finite_number(row.latest_count),
        delta: finite_number(row.delta),
      });
      existing.drift_coverage = true;
    }
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
  limit: number;
}): Promise<docket_search_result[]> => {
  const result = await query_with_diagnostics<docket_search_database_row>(
    `with detail as materialized (
       select
         cache.bill_id,
         upper(coalesce(cache.bill ->> 'state', '')) as state,
         coalesce(cache.bill ->> 'bill_number', cache.bill ->> 'number', '') as bill_number,
         coalesce(cache.bill ->> 'title', '') as title,
         coalesce(cache.bill ->> 'url', cache.bill ->> 'state_link') as url,
         cache.bill ->> 'status' as status,
         cache.bill ->> 'status_date' as status_date,
         cache.bill ->> 'last_action' as last_action,
         cache.bill ->> 'last_action_date' as last_action_date,
         cache.bill ->> 'effective_date' as effective_date,
         coalesce(
           cache.bill #>> '{session,session_title}',
           cache.bill #>> '{session,session_name}',
           cache.bill ->> 'session_title'
         ) as session_title,
         cache.fetched_at,
         0 as source_priority,
         'detail_cache'::text as corpus_source
       from public.docket_bill_detail_cache cache
     ), snapshots as materialized (
       select
         (item.value ->> 'bill_id')::integer as bill_id,
         cache.state,
         coalesce(item.value ->> 'number', '') as bill_number,
         coalesce(item.value ->> 'title', '') as title,
         coalesce(item.value ->> 'url', item.value ->> 'state_link') as url,
         item.value ->> 'status' as status,
         item.value ->> 'status_date' as status_date,
         item.value ->> 'last_action' as last_action,
         item.value ->> 'last_action_date' as last_action_date,
         null::text as effective_date,
         cache.session_title,
         cache.fetched_at,
         1 as source_priority,
         'state_cache'::text as corpus_source
       from public.docket_bill_state_cache cache
       cross join lateral jsonb_array_elements(cache.bills::jsonb) item(value)
       where (item.value ->> 'bill_id') ~ '^[0-9]+$'
     ), corpus as materialized (
       select distinct on (bill_id)
              bill_id, state, bill_number, title, url, status, status_date,
              last_action, last_action_date, effective_date, session_title,
              fetched_at, corpus_source
       from (
         select * from detail
         union all
         select * from snapshots
       ) combined
       order by bill_id, source_priority, fetched_at desc
     ), matched as (
       select corpus.*,
              case
                when corpus.bill_id::text = $1 then 0
                when regexp_replace(
                  upper(corpus.bill_number),
                  '[^A-Z0-9]',
                  '',
                  'g'
                ) = $2 then 1
                when position(lower($1) in lower(corpus.bill_number)) > 0 then 2
                when position(lower($1) in lower(corpus.title)) > 0 then 3
                when upper(corpus.state) = upper($1) then 4
                else 9
              end as match_rank
       from corpus
       where ($3::text is null or corpus.state = $3)
         and (
           corpus.bill_id::text = $1
           or regexp_replace(
             upper(corpus.bill_number),
             '[^A-Z0-9]',
             '',
             'g'
           ) = $2
           or position(lower($1) in lower(corpus.bill_number)) > 0
           or position(lower($1) in lower(corpus.title)) > 0
           or upper(corpus.state) = upper($1)
         )
     )
     select bill_id, state, bill_number, title, url, status, status_date,
            last_action, last_action_date, effective_date, session_title,
            fetched_at, corpus_source, match_rank
       from matched
      order by match_rank, fetched_at desc, state, bill_number, bill_id
      limit $4`,
    [input.query, input.normalized_number, input.state, input.limit],
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
    `select id, state, session_id, session_title, bills, bill_count, fetched_at, source
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
    `select id, state, session_id, session_title, bills, bill_count, fetched_at, source
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
       state, session_id, session_title, bills, bill_count, fetched_at, source
       ) values ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, $7)
       on conflict (state) do update set
       session_id = excluded.session_id,
       session_title = excluded.session_title,
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
      where $8::boolean
     on conflict (state) do update set
       retry_after = now(),
       last_error_code = excluded.last_error_code,
       updated_at = now()`,
    [row.state, row.session_id, row.session_title, JSON.stringify(row.bills), row.bill_count, row.fetched_at, row.source, projection_required],
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
  await query_with_diagnostics(
    `insert into public.docket_bill_detail_cache (
       bill_id, bill, fetched_at, source
     ) values ($1, $2::jsonb, $3::timestamptz, $4)
     on conflict (bill_id) do update set
       bill = excluded.bill,
       fetched_at = excluded.fetched_at,
       source = excluded.source,
       updated_at = now()`,
    [row.bill_id, JSON.stringify(row.bill), row.fetched_at, row.source],
    {
      label: "docket_bill_detail_cache_upsert",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
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

const pick_active_session = async (state: string) => {
  const sessions = await get_session_list(state);
  return pick_preferred_legiscan_session(sessions);
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

  const session = await pick_active_session(state);

  if (!session?.session_id) {
    throw new Error(`no_legiscan_sessions_found_for_${state}`);
  }

  const bills = (await get_master_list(session.session_id))
    .slice(0, current_bill_window_limit);
  const row: docket_state_cache_row = {
    state,
    session_id: session.session_id,
    session_title: session.session_title ?? session.session_name ?? session.name ?? null,
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

docket_router.get("/search", async (req, res) => {
  try {
    const normalized = normalize_search_query(req.query.q);
    const state = normalize_optional_state_code(req.query.state);
    const limit = normalize_search_limit(req.query.limit);
    const results = await search_docket_corpus({
      ...normalized,
      state,
      limit,
    });

    return res.json({
      ok: true,
      contract: "docket-full-corpus-search-v1",
      source: "preserved_docket_cache",
      query: normalized.query,
      state_scope: state,
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
