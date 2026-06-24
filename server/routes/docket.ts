import { Router } from "express";
import {
  get_bill,
  get_master_list,
  get_session_list,
  LEGISCAN_ROLLOUT_STATES,
  type legiscan_bill_detail,
  type legiscan_master_bill,
} from "../services/legiscan";

const cache_ttl_ms = 8 * 60 * 60 * 1000;
const bill_detail_cache_ttl_ms = 24 * 60 * 60 * 1000;

export const docket_router = Router();

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

type docket_bill_detail_cache_row = {
  bill_id: number;
  bill: legiscan_bill_detail;
  fetched_at: string;
  source: string;
};

const normalize_state_code = (state: unknown): string => {
  if (typeof state !== "string") {
    throw new Error("Missing required query parameter: state");
  }

  const normalized = state.trim().toUpperCase();

  if (!LEGISCAN_ROLLOUT_STATES.includes(normalized)) {
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

const get_supabase_cache_config = () => {
  const supabase_url = process.env.LIGHTHOUSE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const supabase_service_role_key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabase_url || !supabase_service_role_key) {
    throw new Error("supabase_not_configured_for_docket_room_cache_access");
  }

  return {
    supabase_url: supabase_url.replace(/\/$/, ""),
    supabase_service_role_key,
  };
};

const supabase_cache_headers = (include_body = false): Record<string, string> => {
  const { supabase_service_role_key } = get_supabase_cache_config();
  const headers: Record<string, string> = {
    apikey: supabase_service_role_key,
    authorization: `Bearer ${supabase_service_role_key}`,
  };

  if (include_body) {
    headers["content-type"] = "application/json";
    headers.prefer = "resolution=merge-duplicates,return=minimal";
  }

  return headers;
};

const supabase_cache_url = (path: string, query: Record<string, string>): string => {
  const { supabase_url } = get_supabase_cache_config();
  const search_params = new URLSearchParams(query);

  return `${supabase_url}/rest/v1/${path}?${search_params.toString()}`;
};

const parse_supabase_cache_response = async <row_type>(response: Response): Promise<row_type | null> => {
  if (!response.ok) {
    throw new Error(`supabase_cache_request_failed_http_${response.status}`);
  }

  const rows = (await response.json()) as row_type[];

  return rows[0] ?? null;
};

const read_state_cache = async (state: string): Promise<docket_state_cache_row | null> => {
  const response = await fetch(
    supabase_cache_url("docket_bill_state_cache", {
      state: `eq.${state}`,
      select: "*",
    }),
    {
      method: "GET",
      headers: supabase_cache_headers(),
    },
  );

  return parse_supabase_cache_response<docket_state_cache_row>(response);
};

const upsert_state_cache = async (row: docket_state_cache_row): Promise<void> => {
  const response = await fetch(
    supabase_cache_url("docket_bill_state_cache", {
      on_conflict: "state",
    }),
    {
      method: "POST",
      headers: supabase_cache_headers(true),
      body: JSON.stringify(row),
    },
  );

  if (!response.ok) {
    throw new Error(`supabase_cache_request_failed_http_${response.status}`);
  }
};

const read_bill_detail_cache = async (bill_id: number): Promise<docket_bill_detail_cache_row | null> => {
  const response = await fetch(
    supabase_cache_url("docket_bill_detail_cache", {
      bill_id: `eq.${bill_id}`,
      select: "*",
    }),
    {
      method: "GET",
      headers: supabase_cache_headers(),
    },
  );

  return parse_supabase_cache_response<docket_bill_detail_cache_row>(response);
};

const upsert_bill_detail_cache = async (row: docket_bill_detail_cache_row): Promise<void> => {
  const response = await fetch(
    supabase_cache_url("docket_bill_detail_cache", {
      on_conflict: "bill_id",
    }),
    {
      method: "POST",
      headers: supabase_cache_headers(true),
      body: JSON.stringify(row),
    },
  );

  if (!response.ok) {
    throw new Error(`supabase_cache_request_failed_http_${response.status}`);
  }
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

const serialize_error = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.replace(/key=[^&\s]+/gi, "key=[redacted]");
  }

  return "unknown_docket_room_error";
};

docket_router.get("/jurisdictions", (_req, res) => {
  return res.json({
    ok: true,
    states: LEGISCAN_ROLLOUT_STATES,
    note: "configured_for_50_states_plus_dc; additional_legiscan_jurisdictions_are_not_enabled_until_verified",
  });
});

docket_router.get("/state", async (req, res) => {
  try {
    const state = normalize_state_code(req.query.state);
    const cached = await read_state_cache(state);

    if (cached && is_fresh(cached.fetched_at)) {
      return res.json({
        ok: true,
        source: "cache",
        state,
        session_id: cached.session_id,
        session_title: cached.session_title,
        bill_count: cached.bill_count,
        fetched_at: cached.fetched_at,
        bills: cached.bills,
      });
    }

    const session = await pick_active_session(state);

    if (!session?.session_id) {
      return res.status(404).json({
        ok: false,
        state,
        message: `no_legiscan_sessions_found_for_${state}`,
      });
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

    return res.json({
      ok: true,
      source: cached ? "legiscan_refresh_stale_cache" : "legiscan_refresh_empty_cache",
      state,
      session_id: row.session_id,
      session_title: row.session_title,
      bill_count: row.bill_count,
      fetched_at: row.fetched_at,
      bills: row.bills,
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
