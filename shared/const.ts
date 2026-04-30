export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Engine Version Stamping (Gate 4) ───
// Increment on ANY change to: extraction logic, model identifier, determinism parameters.
export const ENGINE_VERSION = "READ v4.1.0 | model=gemini-2.5-flash | temp=0";
export const ENGINE_MODEL_IDENTIFIER = "gemini-2.5-flash";
export const ENGINE_DETERMINISM_PARAMS = {
  temperature: 0,
  top_p: 1,
  seed_derivation: "sha256(document_bytes)[0:32] → int32",
} as const;
