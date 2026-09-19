import { refresh_foia_gov_agency_components, resolve_foia_gov_api_key } from "./foia-gov-refresh";

const DAY_MS = 24 * 60 * 60 * 1000;
let refresh_timer: NodeJS.Timeout | null = null;
let refresh_in_flight: Promise<void> | null = null;

function enabled(): boolean {
  const flag = process.env.FOIA_GOV_REFRESH_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return Boolean(resolve_foia_gov_api_key());
}

async function run_once(): Promise<void> {
  if (refresh_in_flight) return refresh_in_flight;
  refresh_in_flight = refresh_foia_gov_agency_components()
    .then(result => {
      console.log("[FoiaGovRefresh] completed", {
        component_count: result.component_count,
        inserted: result.inserted,
        updated: result.updated,
        rejected: result.rejected,
        pull_run_id: result.pull_run_id,
      });
    })
    .catch(error => {
      console.error("[FoiaGovRefresh] failed", {
        error_code: error instanceof Error ? error.message : "unknown",
      });
    })
    .finally(() => {
      refresh_in_flight = null;
    });
  return refresh_in_flight;
}

export function start_foia_gov_refresh_worker(): boolean {
  if (!enabled()) {
    console.log("[FoiaGovRefresh] disabled", {
      credential_configured: Boolean(resolve_foia_gov_api_key()),
    });
    return false;
  }
  void run_once();
  refresh_timer = setInterval(() => void run_once(), DAY_MS);
  console.log("[FoiaGovRefresh] scheduled", { cadence_hours: 24 });
  return true;
}

export async function stop_foia_gov_refresh_worker(): Promise<void> {
  if (refresh_timer) {
    clearInterval(refresh_timer);
    refresh_timer = null;
  }
  await refresh_in_flight;
}
