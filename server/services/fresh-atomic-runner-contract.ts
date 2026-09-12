import { createHash as create_hash } from "node:crypto";
import { background_feature_enabled } from "../runtime-role";

export type atomic_run_binding = { expected_run_id: string; allowed_artifact_keys: string[] };

export function normalize_atomic_run_binding(binding: atomic_run_binding): atomic_run_binding {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(binding.expected_run_id)
    || !Array.isArray(binding.allowed_artifact_keys) || !binding.allowed_artifact_keys.length
    || binding.allowed_artifact_keys.length > 500
    || binding.allowed_artifact_keys.some(key => typeof key !== "string" || !key.startsWith("Batch/")
      || key.length > 1000 || key.split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error("atomic_runner_invalid_binding");
  }
  const allowed_artifact_keys = [...new Set(binding.allowed_artifact_keys)].sort();
  if (allowed_artifact_keys.length !== binding.allowed_artifact_keys.length) throw new Error("atomic_runner_invalid_binding");
  return { expected_run_id: binding.expected_run_id.toLowerCase(), allowed_artifact_keys };
}


export type atomic_runner_configuration = atomic_run_binding & {
  batch_size: number; max_batches: number; max_duration_ms: number;
};

export function read_atomic_runner_configuration(environment: NodeJS.ProcessEnv = process.env): atomic_runner_configuration {
  if (environment.NODE_ENV !== "production"
    || !background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED", environment)) {
    throw new Error("atomic_runner_explicit_worker_grant_required");
  }
  let allowed_artifact_keys: string[];
  try { allowed_artifact_keys = JSON.parse(environment.FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS ?? ""); }
  catch { throw new Error("atomic_runner_invalid_binding"); }
  const binding = normalize_atomic_run_binding({
    expected_run_id: environment.FRESH_ATOMIC_EXPECTED_RUN_ID ?? "", allowed_artifact_keys,
  });
  const bounded_integer = (name: string, default_value: number, maximum: number) => {
    const raw_value = environment[name];
    if (raw_value !== undefined && !/^[0-9]+$/.test(raw_value)) throw new Error("atomic_runner_invalid_budget");
    const value = raw_value === undefined ? default_value : Number(raw_value);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error("atomic_runner_invalid_budget");
    return value;
  };
  return { ...binding,
    batch_size: bounded_integer("FRESH_ATOMIC_BATCH_SIZE", 1, 8),
    max_batches: bounded_integer("FRESH_ATOMIC_MAX_BATCHES", 1, 100),
    max_duration_ms: bounded_integer("FRESH_ATOMIC_MAX_SECONDS", 120, 900) * 1000,
  };
}

const safe_statuses = new Set(["completed", "completed_with_failures", "yielded",
  "waiting_for_active_artifacts", "time_budget_exhausted", "stopped", "failed"]);
const safe_error_codes = new Set(["atomic_runner_explicit_worker_grant_required", "atomic_runner_invalid_binding",
  "atomic_runner_invalid_budget", "atomic_expected_run_unavailable", "atomic_expected_scope_mismatch",
  "atomic_expected_source_unavailable", "atomic_runner_child_failed"]);

export function atomic_runner_error_code(error: unknown): string {
  return error instanceof Error && safe_error_codes.has(error.message) ? error.message : "atomic_runner_failed";
}

export function atomic_runner_receipt(configuration: atomic_runner_configuration,
  result: { status?: unknown; processed?: unknown; error_code?: unknown }, elapsed_ms: number) {
  return {
    contract: "bounded_atomic_runner_v1",
    run_id: configuration.expected_run_id,
    scope_sha256: create_hash("sha256").update(JSON.stringify(configuration.allowed_artifact_keys)).digest("hex"),
    allowed_artifact_count: configuration.allowed_artifact_keys.length,
    status: typeof result.status === "string" && safe_statuses.has(result.status) ? result.status : "failed",
    processed: Number.isSafeInteger(result.processed) && Number(result.processed) >= 0
      ? Number(result.processed) : null,
    elapsed_ms: Math.max(0, Math.floor(elapsed_ms)),
    ...(typeof result.error_code === "string" ? { error_code: safe_error_codes.has(result.error_code)
      ? result.error_code : "atomic_runner_failed" } : {}),
    publication_state: "governed_non_public",
  };
}
