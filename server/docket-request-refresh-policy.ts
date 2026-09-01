import { LEGISCAN_ROLLOUT_STATES } from "./services/legiscan";

type docket_request_refresh_environment = Record<string, string | undefined>;

const configured_refresh_states = (
  environment: docket_request_refresh_environment,
): Set<string> => new Set(
  (environment.DOCKET_REQUEST_SCOPED_REFRESH_STATES ?? "")
    .split(",")
    .map(state => state.trim().toUpperCase())
    .filter(state => LEGISCAN_ROLLOUT_STATES.includes(
      state as (typeof LEGISCAN_ROLLOUT_STATES)[number],
    )),
);

/**
 * Permit bounded, request-scoped cache acquisition only for explicitly named
 * jurisdictions. This is deliberately separate from the background-worker
 * grant: no timer, queue, or unrelated worker is started on the HTTP service.
 */
export function docket_request_scoped_refresh_allowed(
  state: string,
  environment: docket_request_refresh_environment = process.env,
): boolean {
  if (environment.DOCKET_REQUEST_SCOPED_REFRESH_ENABLED !== "true") return false;
  return configured_refresh_states(environment).has(state.trim().toUpperCase());
}
