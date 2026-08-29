export const LIGHTHOUSE_RUNTIME_ROLE_ENV = "LIGHTHOUSE_RUNTIME_ROLE";

export type lighthouse_runtime_role = "web" | "worker";

type runtime_environment = Record<string, string | undefined>;

export type lighthouse_runtime_role_resolution = {
  role: lighthouse_runtime_role;
  configured_value: string | null;
  valid: boolean;
};

/**
 * Resolve the process role fail-closed.
 *
 * The public HTTP service must remain safe when a dashboard variable is
 * missing, misspelled, or drifted. Only the exact value `worker` grants the
 * process permission to start background work; every other value is a web
 * role and therefore HTTP-only.
 */
export function resolve_lighthouse_runtime_role(
  environment: runtime_environment = process.env,
): lighthouse_runtime_role_resolution {
  const configured_value = environment[LIGHTHOUSE_RUNTIME_ROLE_ENV] ?? null;

  if (configured_value === "worker") {
    return { role: "worker", configured_value, valid: true };
  }
  if (configured_value === null || configured_value === "web") {
    return { role: "web", configured_value, valid: true };
  }
  return { role: "web", configured_value, valid: false };
}

export function background_workers_allowed(
  environment: runtime_environment = process.env,
): boolean {
  return resolve_lighthouse_runtime_role(environment).role === "worker";
}

/**
 * Background features require two independent positive grants:
 * 1. the process is explicitly a worker; and
 * 2. the individual feature flag is exactly `true`.
 *
 * This prevents a single stale queue flag from turning the front-door process
 * into a batch worker and keeps future worker services opt-in per workload.
 */
export function background_feature_enabled(
  feature_flag: string,
  environment: runtime_environment = process.env,
): boolean {
  return background_workers_allowed(environment)
    && environment[feature_flag] === "true";
}
