import "dotenv/config";

const states = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

const args = process.argv.slice(2);
const state_arg = args.find(arg => arg.startsWith("--state="));
const all_mode = args.includes("--all");
const base_url = process.env.DOCKET_SMOKE_BASE_URL || process.env.DOCKET_BASE_URL;
const delay_ms = Number(process.env.DOCKET_WARM_DELAY_MS || 1500);

const print_json = value => console.log(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!base_url) {
  print_json({ ok: false, error: "docket_base_url_required" });
  process.exit(1);
}

if (all_mode && state_arg) {
  print_json({ ok: false, error: "choose_state_or_all_not_both" });
  process.exit(1);
}

if (!all_mode && !state_arg) {
  print_json({ ok: false, error: "state_or_all_required" });
  process.exit(1);
}

const selected_states = all_mode ? states : [state_arg.split("=")[1]?.trim().toUpperCase()].filter(Boolean);
const normalized_base_url = base_url.replace(/\/$/, "");

const warm_state = async state => {
  if (!states.includes(state)) {
    return {
      state,
      ok: false,
      bill_count: null,
      source: null,
      fetched_at: null,
      error: "invalid_state",
    };
  }

  try {
    const response = await fetch(`${normalized_base_url}/api/docket/state?state=${encodeURIComponent(state)}`);
    const payload = await response.json().catch(() => ({
      ok: false,
      message: `api_docket_state_failed_http_${response.status}`,
    }));

    if (!response.ok || !payload.ok) {
      return {
        state,
        ok: false,
        bill_count: null,
        source: payload.source || null,
        fetched_at: payload.fetched_at || null,
        error: payload.message || `api_docket_state_failed_http_${response.status}`,
      };
    }

    return {
      state: payload.state || state,
      ok: true,
      bill_count: payload.bill_count ?? (Array.isArray(payload.bills) ? payload.bills.length : null),
      source: payload.source || null,
      fetched_at: payload.fetched_at || null,
      error: null,
    };
  } catch (error) {
    return {
      state,
      ok: false,
      bill_count: null,
      source: null,
      fetched_at: null,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
};

let has_error = false;

for (const [index, state] of selected_states.entries()) {
  const result = await warm_state(state);
  if (!result.ok) has_error = true;
  print_json(result);

  if (all_mode && index < selected_states.length - 1) {
    await sleep(Number.isFinite(delay_ms) && delay_ms >= 0 ? delay_ms : 1500);
  }
}

process.exit(has_error ? 1 : 0);
