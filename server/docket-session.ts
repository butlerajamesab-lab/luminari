import type { legiscan_session } from "./services/legiscan";

const as_bool = (value: unknown): boolean | null => {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y"].includes(normalized)) return true;
    if (["false", "no", "n"].includes(normalized)) return false;
  }
  return null;
};

const session_sort_key = (session: legiscan_session): number =>
  session.year_end ?? session.year_start ?? 0;

export const legiscan_session_is_current = (
  session: legiscan_session | null | undefined,
): boolean | null => {
  if (!session) return null;
  if (as_bool(session.prior) === true) return false;
  if (as_bool(session.sine_die) === true) return false;
  if (as_bool(session.prior) === false) return true;
  if (as_bool(session.sine_die) === false) return true;
  return null;
};

export const pick_preferred_legiscan_session = (
  sessions: legiscan_session[],
): legiscan_session | null => {
  const sorted = [...sessions].sort((a, b) => session_sort_key(b) - session_sort_key(a));
  return (
    sorted.find(session => legiscan_session_is_current(session) === true)
    ?? sorted.find(session => as_bool(session.prior) !== true)
    ?? sorted[0]
    ?? null
  );
};
