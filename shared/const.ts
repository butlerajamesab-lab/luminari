export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Engine Version Stamping (Gate 4) ───
// Lighthouse runtime processing is deterministic code + declared rules only.
// Probabilistic/LLM execution is prohibited from canonical runtime paths.
export const ENGINE_VERSION = "LIGHTHOUSE deterministic extraction v1.0.0 | rules=source-bound | probabilistic_runtime=disabled";
export const ENGINE_MODEL_IDENTIFIER = "none";
export const ENGINE_DETERMINISM_PARAMS = {
  mode: "deterministic_rules",
  temperature: 0,
  top_p: 1,
  seed_derivation: "not_applicable_no_probabilistic_model",
} as const;
