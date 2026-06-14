import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../_core/env";
import { getMasterList, getSessionList, type LegiScanMasterBill } from "../services/legiscan";

const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

export const docketRouter = Router();

type DocketStateCacheRow = {
  id?: string;
  state: string;
  session_id: number;
  session_title: string | null;
  bills: LegiScanMasterBill[];
  bill_count: number;
  fetched_at: string;
  source: string;
};

const normalizeStateCode = (state: unknown): string => {
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

const isFresh = (fetchedAt: string): boolean => {
  const fetchedMs = new Date(fetchedAt).getTime();

  if (!Number.isFinite(fetchedMs)) {
    return false;
  }

  return Date.now() - fetchedMs < CACHE_TTL_MS;
};

const pickActiveSession = async (state: string) => {
  const sessions = await getSessionList(state);

  const current = sessions
    .filter(session => !session.prior)
    .sort((a, b) => {
      const aYear = a.year_end ?? a.year_start ?? 0;
      const bYear = b.year_end ?? b.year_start ?? 0;
      return bYear - aYear;
    })[0];

  return current ?? sessions[0];
};

docketRouter.get("/state", async (req, res) => {
  try {
    const state = normalizeStateCode(req.query.state);
    const db = supabase();

    const { data: cached, error: cacheError } = await db
      .from("docket_bill_state_cache")
      .select("*")
      .eq("state", state)
      .maybeSingle<DocketStateCacheRow>();

    if (cacheError) {
      throw cacheError;
    }

    if (cached && isFresh(cached.fetched_at)) {
      return res.json({
        ok: true,
        source: "cache",
        state,
        sessionId: cached.session_id,
        sessionTitle: cached.session_title,
        billCount: cached.bill_count,
        fetchedAt: cached.fetched_at,
        bills: cached.bills,
      });
    }

    const session = await pickActiveSession(state);

    if (!session?.session_id) {
      return res.status(404).json({
        ok: false,
        state,
        message: `No LegiScan sessions found for ${state}`,
      });
    }

    const bills = await getMasterList(session.session_id);
    const row: DocketStateCacheRow = {
      state,
      session_id: session.session_id,
      session_title: session.session_title ?? session.session_name ?? session.name ?? null,
      bills,
      bill_count: bills.length,
      fetched_at: new Date().toISOString(),
      source: "legiscan.getMasterList",
    };

    const { error: upsertError } = await db
      .from("docket_bill_state_cache")
      .upsert(row, { onConflict: "state" });

    if (upsertError) {
      throw upsertError;
    }

    return res.json({
      ok: true,
      source: cached ? "legiscan_refresh_stale_cache" : "legiscan_refresh_empty_cache",
      state,
      sessionId: row.session_id,
      sessionTitle: row.session_title,
      billCount: row.bill_count,
      fetchedAt: row.fetched_at,
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
