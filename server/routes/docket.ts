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
  project_docket_cache_to_civic_genome,
  type civic_genome_projection_result,
} from "../civic-genome-projection";
import { query_with_diagnostics } from "../db";
import {
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "../runtime-role";
import { docket_request_scoped_refresh_allowed } from "../docket-request-refresh-policy";

const cache_ttl_ms = 8 * 60 * 60 * 1000;
const bill_detail_cache_ttl_ms = 24 * 60 * 60 * 1000;
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

const upsert_state_cache = async (row: docket_state_cache_row): Promise<void> => {
  await query_with_diagnostics(
    `insert into public.docket_bill_state_cache (
       state, session_id, session_title, bills, bill_count, fetched_at, source
     ) values ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, $7)
     on conflict (state) do update set
       session_id = excluded.session_id,
       session_title = excluded.session_title,
       bills = excluded.bills,
       bill_count = excluded.bill_count,
       fetched_at = excluded.fetched_at,
       source = excluded.source,
       updated_at = now()`,
    [row.state, row.session_id, row.session_title, JSON.stringify(row.bills), row.bill_count, row.fetched_at, row.source],
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

  return Date.now() - fetched_ms < ttl_ms;
};

const pick_active_session = async (state: string) => {
  const sessions = await get_session_list(state);

  const current = sessions
    .filter(session => !session.prior)
    .sort((a, b) => {
      const a_year = a.year_end ?? a.year_start ?? 0;
      const b_year = b.year_end ?? b.year_start ?? 0;
      return b_year - a_year;
    })[0];

  return current ?? sessions[0];
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
  try {
    const projection = await project_docket_cache_to_civic_genome({ state_code: state });
    return summarize_civic_genome_projection(projection);
  } catch (error) {
    return {
      ok: false,
      projected: false,
      error: serialize_error(error),
    };
  }
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
      civic_genome_projection: {
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

  const bills = await get_master_list(session.session_id);
  const row: docket_state_cache_row = {
    state,
    session_id: session.session_id,
    session_title: session.session_title ?? session.session_name ?? session.name ?? null,
    bills,
    bill_count: bills.length,
    fetched_at: new Date().toISOString(),
    source: "legiscan_get_master_list",
  };

  await upsert_state_cache(row);
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

const request_refresh_attempt_allowed = (state: string): boolean =>
  docket_request_scoped_refresh_allowed(state) && retry_after_iso(state) === null;

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
    note: "configured_for_50_states_plus_dc; additional_legiscan_jurisdictions_are_not_enabled_until_verified",
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
    const refreshed = await refresh_state_cache(state);

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
        const refreshed = await refresh_state_cache(state);
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

docket_router.get("/state", async (req, res) => {
  try {
    const state = normalize_state_code(req.query.state);
    const cached = await read_state_cache(state);

    if (cached) {
      const fresh = is_fresh(cached.fetched_at);
      if (!fresh && request_refresh_attempt_allowed(state)) {
        try {
          const refreshed = await get_or_start_state_refresh(state, "request_scoped");
          return res.json({
            ok: true,
            source: refreshed.source,
            refresh_mode: "request_scoped",
            state,
            session_id: refreshed.row.session_id,
            session_title: refreshed.row.session_title,
            bill_count: refreshed.row.bill_count,
            fetched_at: refreshed.row.fetched_at,
            civic_genome_projection: refreshed.civic_genome_projection,
            bills: refreshed.row.bills,
          });
        } catch {
          const stale_reason = "cache_stale_request_refresh_failed";
          return res.json({
            ok: true,
            source: stale_reason,
            state,
            session_id: cached.session_id,
            session_title: cached.session_title,
            bill_count: cached.bill_count,
            fetched_at: cached.fetched_at,
            refresh_retry_after: retry_after_iso(state),
            civic_genome_projection: {
              ok: true,
              projected: false,
              reason: stale_reason,
            },
            bills: cached.bills,
          });
        }
      }
      if (!fresh) schedule_state_refresh(state);
      const stale_reason = background_workers_allowed()
        ? "cache_stale_refreshing"
        : "cache_stale_worker_paused";

      return res.json({
        ok: true,
        source: fresh ? "cache" : stale_reason,
        state,
        session_id: cached.session_id,
        session_title: cached.session_title,
        bill_count: cached.bill_count,
        fetched_at: cached.fetched_at,
        civic_genome_projection: {
          ok: true,
          projected: false,
          reason: fresh ? "cache_fresh_no_projection" : stale_reason,
        },
        bills: cached.bills,
      });
    }

    if (!background_workers_allowed() && !request_refresh_attempt_allowed(state)) {
      return res.status(503).json({
        ok: false,
        error: "background_runtime_required",
        message: "No cached Docket state is available while refresh work is paused.",
        refresh_retry_after: retry_after_iso(state),
        runtime_role: resolve_lighthouse_runtime_role(),
      });
    }

    // No cached source exists. The first acquisition must still retrieve the
    // official provider list; subsequent reads become cache-first immediately.
    const refresh_mode = background_workers_allowed() ? "worker" : "request_scoped";
    const refreshed = background_workers_allowed()
      ? await refresh_state_cache(state)
      : await get_or_start_state_refresh(state, "request_scoped");
    return res.json({
      ok: true,
      source: refreshed.source,
      refresh_mode,
      state,
      session_id: refreshed.row.session_id,
      session_title: refreshed.row.session_title,
      bill_count: refreshed.row.bill_count,
      fetched_at: refreshed.row.fetched_at,
      civic_genome_projection: refreshed.civic_genome_projection,
      bills: refreshed.row.bills,
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
        bill: cached.bill,
      });
    }

    if (cached && !background_workers_allowed()) {
      return res.json({
        ok: true,
        source: "cache_stale_worker_paused",
        bill_id,
        fetched_at: cached.fetched_at,
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
      bill,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: serialize_error(error),
    });
  }
});
