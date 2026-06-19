import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../_core/env";
import { getMasterList, getSessionList, type LegiScanMasterBill } from "../services/legiscan";

const cache_ttl_ms = 8 * 60 * 60 * 1000;

export const docket_router = Router();
export const docketRouter = docket_router;

type docket_state_cache_row = {
  id?: string;
  state: string;
  session_id: number;
  session_title: string | null;
  bills: LegiScanMasterBill[];
  bill_count: number;
  fetched_at: string;
  source: string;
};

const normalize_state_code = (state: unknown): string => {
  if (typeof state !== "string") {
    throw new Error("Missing required query parameter: state");
  }

  const normalized = state.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized) && normalized !== "DC") {
    throw new Error(`Invalid state code: ${state}`);
  }

  return normalized;
};

const supabase = () => {
  if (!ENV.lighthouseSupabaseUrl || !ENV.lighthouseSupabaseServiceRoleKey) {
    throw new Error("Supabase is not configured for Docket Room cache access");
  }

  return createClient(ENV.lighthouseSupabaseUrl, ENV.lighthouseSupabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const is_fresh = (fetched_at: string): boolean => {
  const fetched_ms = new Date(fetched_at).getTime();

  if (!Number.isFinite(fetched_ms)) {
    return false;
  }

  return Date.now() - fetched_ms < cache_ttl_ms;
};

const pick_active_session = async (state: string) => {
  const sessions = await getSessionList(state);

  const current = sessions
    .filter(session => !session.prior)
    .sort((a, b) => {
      const a_year = a.year_end ?? a.year_start ?? 0;
      const b_year = b.year_end ?? b.year_start ?? 0;
      return b_year - a_year;
    })[0];

  return current ?? sessions[0];
};

docket_router.get("/state", async (req, res) => {
  try {
    const state = normalize_state_code(req.query.state);
    const db = supabase();

    const { data: cached, error: cache_error } = await db
      .from("docket_bill_state_cache")
      .select("*")
      .eq("state", state)
      .maybeSingle<docket_state_cache_row>();

    if (cache_error) {
      throw cache_error;
    }

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
        message: `No LegiScan sessions found for ${state}`,
      });
    }

    const bills = await getMasterList(session.session_id);
    const row: docket_state_cache_row = {
      state,
      session_id: session.session_id,
      session_title: session.session_title ?? session.session_name ?? session.name ?? null,
      bills,
      bill_count: bills.length,
      fetched_at: new Date().toISOString(),
      source: "legiscan.get_master_list",
    };

    const { error: upsert_error } = await db
      .from("docket_bill_state_cache")
      .upsert(row, { onConflict: "state" });

    if (upsert_error) {
      throw upsert_error;
    }

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
    const message = error instanceof Error ? error.message : "Unknown Docket Room error";
    return res.status(500).json({
      ok: false,
      message,
    });
  }
});
