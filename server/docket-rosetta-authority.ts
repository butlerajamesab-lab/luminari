import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

const DOCKET_AUTHORITY_REQUEST_TIMEOUT_MS = 10_000;

type docket_state_epoch = {
  state: string;
  session_id: number;
  cache_fetched_at: string;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

export async function publish_rosetta_docket_state_epoch(
  epoch: docket_state_epoch,
): Promise<void> {
  if (!/^[A-Z]{2}$/.test(epoch.state)) {
    throw new Error("invalid_docket_authority_state");
  }
  if (!Number.isSafeInteger(epoch.session_id) || epoch.session_id <= 0) {
    throw new Error("invalid_docket_authority_session");
  }
  const observed_ms = Date.parse(epoch.cache_fetched_at);
  if (!Number.isFinite(observed_ms)) {
    throw new Error("invalid_docket_authority_cache_fetched_at");
  }

  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key, {
    accept: "application/json",
    "content-type": "application/json",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOCKET_AUTHORITY_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${base_url}/rest/v1/rpc/rosetta_record_docket_state_epoch_v1`,
      {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          p_state: epoch.state,
          p_session_id: epoch.session_id,
          p_cache_fetched_at: epoch.cache_fetched_at,
        }),
      },
    );
    const body = response.status === 204 ? "" : await response.text();
    if (!response.ok) {
      throw new Error(
        `rosetta_docket_state_epoch_failed:${response.status}:${body.slice(0, 500)}`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("rosetta_docket_state_epoch_failed:")
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `rosetta_docket_state_epoch_timeout:${DOCKET_AUTHORITY_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(`rosetta_docket_state_epoch_network_failed:${cause}`);
  } finally {
    clearTimeout(timeout);
  }
}
