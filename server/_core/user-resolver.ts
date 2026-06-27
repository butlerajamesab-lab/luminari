import { query_with_diagnostics } from "../db";
import {
  dedupe_user_lookup,
  get_cached_user,
  set_cached_user,
} from "./user-cache";

export type RuntimeUser = {
  id: number;
  open_id: string | null;
  name: string | null;
  email: string | null;
  login_method: string | null;
  role: string;
  plan: string;
  created_at: number;
  updated_at: number;
  last_signed_in: number;
};

function map_user(row: any): RuntimeUser | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    open_id: row.open_id ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    login_method: row.login_method ?? null,
    role: row.role ?? "user",
    plan: row.plan ?? "free",
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
    last_signed_in: Number(row.last_signed_in ?? 0),
  };
}

const USER_SELECT = `select id, open_id, name, email, login_method, role, plan, created_at, updated_at, last_signed_in from public.users`;

function read_positive_integer_env(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Profile lookup is part of the request-context critical path. Its pool wait
// budget must therefore align with the context DB phase budget (default 1000ms)
// instead of a hidden 250ms micro-timeout that can fail while the outer request
// still has ample time remaining.
export const PROFILE_POOL_ACQUIRE_TIMEOUT_MS = read_positive_integer_env(
  "CONTEXT_PROFILE_POOL_ACQUIRE_TIMEOUT_MS",
  1000,
);
export const PROFILE_QUERY_TIMEOUT_MS = read_positive_integer_env(
  "CONTEXT_PROFILE_QUERY_TIMEOUT_MS",
  750,
);

async function query_user_profile(
  label: string,
  text: string,
  values: unknown[],
) {
  return query_with_diagnostics(text, values, {
    label,
    pool_acquire_timeout_ms: PROFILE_POOL_ACQUIRE_TIMEOUT_MS,
    query_timeout_ms: PROFILE_QUERY_TIMEOUT_MS,
  });
}

function cache_user(user: RuntimeUser | null) {
  set_cached_user([user?.email, user?.open_id], user);
}

export async function get_user_by_email_snake(
  email: string,
): Promise<RuntimeUser | null> {
  const normalized = email.trim().toLowerCase();
  const cached = get_cached_user(normalized);
  if (cached) return cached;

  try {
    return await dedupe_user_lookup(normalized, async () => {
      const result = await query_user_profile(
        "profile_email_lookup",
        `${USER_SELECT} where lower(email) = $1 limit 1`,
        [normalized],
      );
      const user = map_user(result.rows[0]);
      set_cached_user([normalized, user?.open_id], user);
      return user;
    });
  } catch (error) {
    const stale = get_cached_user(normalized, true);
    if (stale) {
      console.warn(
        "[CONTEXT] Using stale cached user after DB lookup failure",
        error instanceof Error ? error.message : String(error),
      );
      return stale;
    }
    throw error;
  }
}

export async function get_user_by_open_id_snake(
  open_id: string,
): Promise<RuntimeUser | null> {
  const cached = get_cached_user(open_id);
  if (cached) return cached;

  try {
    return await dedupe_user_lookup(open_id, async () => {
      const result = await query_user_profile(
        "profile_open_id_lookup",
        `${USER_SELECT} where open_id = $1 limit 1`,
        [open_id],
      );
      const user = map_user(result.rows[0]);
      cache_user(user);
      return user;
    });
  } catch (error) {
    const stale = get_cached_user(open_id, true);
    if (stale) {
      console.warn(
        "[CONTEXT] Using stale cached user after DB lookup failure",
        error instanceof Error ? error.message : String(error),
      );
      return stale;
    }
    throw error;
  }
}
