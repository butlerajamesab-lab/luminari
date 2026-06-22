import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { get_master_list, get_session_list } from "../server/services/legiscan.ts";

const supabase_url = process.env.LIGHTHOUSE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase_key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const route_base_url = process.env.DOCKET_SMOKE_BASE_URL;

const has_legiscan_key = Boolean(process.env.LEGISCAN_API_KEY);
console.log(`legiscan_api_key_detected=${has_legiscan_key ? "yes" : "no"}`);

if (!has_legiscan_key) {
  throw new Error("legiscan_api_key_required_for_docket_wa_smoke_test");
}

const sessions = await get_session_list("WA");
if (!Array.isArray(sessions) || sessions.length === 0) {
  throw new Error("wa_get_session_list_returned_no_sessions");
}
console.log(`wa_get_session_list_ok sessions=${sessions.length}`);

const active_session = sessions
  .filter(session => !session.prior)
  .sort((a, b) => (b.year_end ?? b.year_start ?? 0) - (a.year_end ?? a.year_start ?? 0))[0] ?? sessions[0];

if (!active_session?.session_id) {
  throw new Error("no_active_wa_session_id_found");
}
console.log(`wa_active_session_id=${active_session.session_id}`);

const bills = await get_master_list(active_session.session_id);
if (!Array.isArray(bills)) {
  throw new Error("wa_get_master_list_did_not_return_array");
}
console.log(`wa_get_master_list_ok normalized_bills=${bills.length}`);

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
    source: "legiscan.get_master_list",
  };
  const { error: write_error } = await supabase.from("docket_bill_state_cache").upsert(row, { onConflict: "state" });
  if (write_error) throw write_error;
  const { data, error: read_error } = await supabase.from("docket_bill_state_cache").select("state,session_id,bill_count,fetched_at").eq("state", "WA").maybeSingle();
  if (read_error) throw read_error;
  if (!data) throw new Error("supabase_cache_read_returned_no_wa_row_after_upsert");
  console.log(`supabase_cache_read_write_ok bills=${data.bill_count}`);
} else {
  console.log("supabase_cache_read_write_skipped_supabase_service_env_not_configured");
}

if (route_base_url) {
  const response = await fetch(`${route_base_url.replace(/\/$/, "")}/api/docket/state?state=WA`);
  if (!response.ok) {
    throw new Error(`api_docket_state_wa_failed_http_${response.status}`);
  }
  const payload = await response.json();
  if (!payload.ok || payload.state !== "WA" || !Array.isArray(payload.bills)) {
    throw new Error("api_docket_state_wa_returned_invalid_payload");
  }
  console.log(`api_docket_state_wa_ok bills=${payload.bill_count} source=${payload.source}`);
} else {
  console.log("api_docket_state_wa_skipped_set_docket_smoke_base_url_to_test_running_server");
}
