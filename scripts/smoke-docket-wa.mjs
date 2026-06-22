import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { get_master_list, get_session_list } from "../server/services/legiscan.ts";

const supabase_url = process.env.LIGHTHOUSE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase_key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const route_base_url = process.env.DOCKET_SMOKE_BASE_URL;

const has_legiscan_key = Boolean(process.env.LEGISCAN_API_KEY);
console.log(`LEGISCAN_API_KEY detected: ${has_legiscan_key ? "yes" : "no"}`);

if (!has_legiscan_key) {
  throw new Error("LEGISCAN_API_KEY is required for the Docket WA smoke test");
}

const sessions = await get_session_list("WA");
if (!Array.isArray(sessions) || sessions.length === 0) {
  throw new Error("WA getSessionList returned no sessions");
}
console.log(`WA getSessionList: ok (${sessions.length} sessions)`);

const active_session = sessions
  .filter(session => !session.prior)
  .sort((a, b) => (b.year_end ?? b.year_start ?? 0) - (a.year_end ?? a.year_start ?? 0))[0] ?? sessions[0];

if (!active_session?.session_id) {
  throw new Error("No active WA session_id found");
}
console.log(`WA active session_id: ${active_session.session_id}`);

const bills = await get_master_list(active_session.session_id);
if (!Array.isArray(bills)) {
  throw new Error("WA getMasterList did not return an array");
}
console.log(`WA getMasterList: ok (${bills.length} normalized bills)`);

if (supabase_url && supabase_key) {
  const supabase = createClient(supabase_url, supabase_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const row = {
    state: "WA",
    session_id: active_session.session_id,
    session_title: active_session.session_title ?? active_session.session_name ?? active_session.name ?? null,
    bills,
    bill_count: bills.length,
    fetched_at: new Date().toISOString(),
    source: "legiscan.getMasterList",
  };
  const { error: write_error } = await supabase.from("docket_bill_state_cache").upsert(row, { onConflict: "state" });
  if (write_error) throw write_error;
  const { data, error: read_error } = await supabase.from("docket_bill_state_cache").select("state,session_id,bill_count,fetched_at").eq("state", "WA").maybeSingle();
  if (read_error) throw read_error;
  if (!data) throw new Error("Supabase cache read returned no WA row after upsert");
  console.log(`Supabase cache read/write: ok (${data.bill_count} bills)`);
} else {
  console.log("Supabase cache read/write: skipped (Supabase service env not configured)");
}

if (route_base_url) {
  const response = await fetch(`${route_base_url.replace(/\/$/, "")}/api/docket/state?state=WA`);
  if (!response.ok) {
    throw new Error(`/api/docket/state?state=WA failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.ok || payload.state !== "WA" || !Array.isArray(payload.bills)) {
    throw new Error("/api/docket/state?state=WA returned invalid payload");
  }
  console.log(`/api/docket/state?state=WA: ok (${payload.bill_count} bills from ${payload.source})`);
} else {
  console.log("/api/docket/state?state=WA: skipped (set DOCKET_SMOKE_BASE_URL to test a running server)");
}
