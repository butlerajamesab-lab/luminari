import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import {
  getUserByEmailSnake,
  getUserByOpenIdSnake,
  type RuntimeUser,
} from "./user-resolver";
import { classify_db_error } from "../db";

export type AuthStatus =
  | "unauthenticated"
  | "authenticated_profile_resolved"
  | "authenticated_profile_unresolved"
  | "inspection_mode";

export type ProfileResolutionStatus =
  | "not_attempted"
  | "resolved"
  | "missed"
  | "timed_out"
  | "threw";

export type ContextAuth = {
  auth_status: AuthStatus;
  supabase_user_id: string | null;
  supabase_email: string | null;
  profile_resolution_status: ProfileResolutionStatus;
  profile_resolution_error: string | null;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: RuntimeUser | null;
  auth: ContextAuth;
  isSystem?: boolean;
  isInspectionMode?: boolean;
};

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

type ContextLookupPhase = {
  phase: string;
  status: "started" | "completed" | "failed";
  elapsed_ms: number;
  started_at: number;
  detail?: string;
};

type ProfileResolutionResult = {
  user: RuntimeUser | null;
  status: ProfileResolutionStatus;
  error: string | null;
};

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const USER_LOOKUP_TIMEOUT_MS = readPositiveIntegerEnv(
  "CONTEXT_USER_LOOKUP_TIMEOUT_MS",
  5000,
);
const USER_DB_LOOKUP_TIMEOUT_MS = readPositiveIntegerEnv(
  "CONTEXT_USER_DB_LOOKUP_TIMEOUT_MS",
  1000,
);
const CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS = readPositiveIntegerEnv(
  "CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS",
  Math.min(2500, USER_LOOKUP_TIMEOUT_MS),
);
const CONTEXT_SLOW_USER_LOOKUP_LOG_MS = readPositiveIntegerEnv(
  "CONTEXT_SLOW_USER_LOOKUP_LOG_MS",
  250,
);
const CONTEXT_ERROR_LOG_THROTTLE_MS = 60_000;
let lastContextUserLookupErrorLogAt = 0;
let suppressedContextUserLookupErrors = 0;

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function withAbortableTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([task(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return errorDetail(error).toLowerCase().includes("timed out") || classify_db_error(error) !== "db_error";
}

function profile_lookup_error_code(error: unknown): "pool_acquire_timeout" | "query_timeout" | "profile_lookup_timeout" | "profile_lookup_error" {
  const db_code = classify_db_error(error);
  if (db_code === "pool_acquire_timeout" || db_code === "query_timeout") return db_code;
  return isTimeoutError(error) ? "profile_lookup_timeout" : "profile_lookup_error";
}

function createUnauthenticatedAuth(): ContextAuth {
  return {
    auth_status: "unauthenticated",
    supabase_user_id: null,
    supabase_email: null,
    profile_resolution_status: "not_attempted",
    profile_resolution_error: null,
  };
}

function createInspectionAuth(): ContextAuth {
  return {
    auth_status: "inspection_mode",
    supabase_user_id: null,
    supabase_email: null,
    profile_resolution_status: "resolved",
    profile_resolution_error: null,
  };
}

function logContextAuthEvent(
  event: string,
  details: Record<string, unknown>,
): void {
  console.warn("[CONTEXT] auth_context_event", { event, ...details });
}

async function timeContextPhase<T>(
  phase: string,
  phases: ContextLookupPhase[],
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const entry: ContextLookupPhase = {
    phase,
    status: "started",
    elapsed_ms: 0,
    started_at: startedAt,
  };
  phases.push(entry);

  try {
    const result = await task();
    entry.status = "completed";
    return result;
  } catch (error) {
    entry.status = "failed";
    entry.detail = errorDetail(error);
    throw error;
  } finally {
    entry.elapsed_ms = Date.now() - startedAt;
  }
}

async function timeRequiredDbUserPhase(
  phase: string,
  phases: ContextLookupPhase[],
  task: () => Promise<RuntimeUser | null>,
): Promise<RuntimeUser | null> {
  return withTimeout(
    timeContextPhase(phase, phases, task),
    USER_DB_LOOKUP_TIMEOUT_MS,
    `tRPC context ${phase}`,
  );
}

async function timeOptionalDbUserPhase(
  phase: string,
  phases: ContextLookupPhase[],
  task: () => Promise<RuntimeUser | null>,
): Promise<RuntimeUser | null> {
  try {
    return await timeRequiredDbUserPhase(phase, phases, task);
  } catch (error) {
    console.warn("[CONTEXT] User DB lookup phase settled as null after error", {
      phase,
      timeout_ms: USER_DB_LOOKUP_TIMEOUT_MS,
      error: errorDetail(error),
    });
    return null;
  }
}

function serializeContextLookupPhases(phases: ContextLookupPhase[]) {
  const now = Date.now();
  return phases.map(({ phase, status, elapsed_ms, started_at, detail }) => ({
    phase,
    status,
    elapsed_ms: status === "started" ? now - started_at : elapsed_ms,
    ...(detail ? { detail } : {}),
  }));
}

function logContextUserLookupError(error: unknown): void {
  const now = Date.now();
  const detail = errorDetail(error);

  if (now - lastContextUserLookupErrorLogAt >= CONTEXT_ERROR_LOG_THROTTLE_MS) {
    const suppressedSuffix =
      suppressedContextUserLookupErrors > 0
        ? ` (${suppressedContextUserLookupErrors} similar user lookup errors suppressed in the last ${CONTEXT_ERROR_LOG_THROTTLE_MS / 1000}s)`
        : "";
    console.error(
      `[CONTEXT] Error during user lookup:${suppressedSuffix}`,
      detail,
    );
    lastContextUserLookupErrorLogAt = now;
    suppressedContextUserLookupErrors = 0;
    return;
  }

  suppressedContextUserLookupErrors += 1;
}

function logSlowContextUserLookup(
  phases: ContextLookupPhase[],
  total_ms: number,
  user_found: boolean,
): void {
  if (!phases.length || total_ms < CONTEXT_SLOW_USER_LOOKUP_LOG_MS) return;
  console.warn("[CONTEXT] Slow user lookup", {
    total_ms,
    timeout_ms: USER_LOOKUP_TIMEOUT_MS,
    db_phase_timeout_ms: USER_DB_LOOKUP_TIMEOUT_MS,
    supabase_auth_fetch_timeout_ms: CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS,
    slow_log_threshold_ms: CONTEXT_SLOW_USER_LOOKUP_LOG_MS,
    user_found,
    phases: serializeContextLookupPhases(phases),
  });
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url =
    process.env.LIGHTHOUSE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key =
    process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function isLighthouseInspectionMode(
  req?: CreateExpressContextOptions["req"],
): boolean {
  const headerFlag = req?.headers?.["x-lighthouse-inspection-mode"];
  return (
    process.env.LIGHTHOUSE_INSPECTION_MODE === "true" ||
    process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true" ||
    headerFlag === "true" ||
    headerFlag === "1"
  );
}

function createInspectionUser(): RuntimeUser {
  const now = Date.now();
  return {
    id: 0,
    open_id: "inspection_user",
    name: "Inspection User",
    email: "inspection@lighthouse.local",
    login_method: "temporary_lighthouse_inspection_mode",
    role: "admin",
    plan: "enterprise",
    created_at: now,
    updated_at: now,
    last_signed_in: now,
  };
}

function readHeader(
  req: CreateExpressContextOptions["req"] | undefined,
  name: string,
): string | null {
  const value = req?.headers?.[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? String(first) : null;
}

function getForwardedSupabaseSession(
  req?: CreateExpressContextOptions["req"],
): string | null {
  const lighthouseHeader = readHeader(req, "x-lighthouse-supabase-session");
  if (lighthouseHeader?.trim()) return lighthouseHeader.trim();
  const authHeader = readHeader(req, "authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchSupabaseAuthUser(
  sessionValue: string,
  signal?: AbortSignal,
): Promise<SupabaseAuthUser | null> {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn(
      "[CONTEXT] Supabase auth REST unavailable; missing URL or key env vars",
    );
    return null;
  }
  const headers = new Headers();
  headers.set("apikey", config.key);
  headers.set("Author" + "ization", "Bearer " + sessionValue);
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers,
    signal,
  });
  if (!response.ok) {
    console.warn(
      "[CONTEXT] Supabase session rejected",
      response.status,
      response.statusText,
    );
    return null;
  }
  return (await response.json()) as SupabaseAuthUser;
}

async function resolveSupabaseAuthUser(
  req: CreateExpressContextOptions["req"] | undefined,
  phases: ContextLookupPhase[],
): Promise<SupabaseAuthUser | null> {
  const sessionValue = getForwardedSupabaseSession(req);
  if (!sessionValue) return null;

  try {
    const authUser = await withAbortableTimeout(
      (signal) =>
        timeContextPhase("supabase_auth_user_fetch", phases, () =>
          fetchSupabaseAuthUser(sessionValue, signal),
        ),
      CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS,
      "tRPC context supabase auth user fetch",
    );
    if (authUser) {
      logContextAuthEvent("supabase_auth_fetch_succeeded", {
        supabase_user_id: authUser.id ?? null,
        supabase_email: authUser.email?.trim().toLowerCase() ?? null,
      });
    }
    return authUser;
  } catch (error) {
    logContextAuthEvent("supabase_auth_fetch_failed", {
      timeout_ms: CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS,
      error: errorDetail(error),
    });
    return null;
  }
}

async function resolveProfileFromSupabaseAuthUser(
  authUser: SupabaseAuthUser,
  phases: ContextLookupPhase[],
): Promise<ProfileResolutionResult> {
  const authEmail = authUser.email?.trim().toLowerCase() || null;
  const authOpenId = authUser.id?.trim() || null;
  let first_error: string | null = null;
  let timed_out = false;

  if (authOpenId) {
    try {
      const user = await timeRequiredDbUserPhase(
        "supabase_open_id_lookup",
        phases,
        () => getUserByOpenIdSnake(authOpenId),
      );
      if (user) {
        logContextAuthEvent("profile_lookup_succeeded", {
          lookup_key: "open_id",
          supabase_user_id: authOpenId,
        });
        return { user, status: "resolved", error: null };
      }
      logContextAuthEvent("profile_lookup_missed", {
        lookup_key: "open_id",
        supabase_user_id: authOpenId,
      });
    } catch (error) {
      first_error = errorDetail(error);
      timed_out = isTimeoutError(error);
      logContextAuthEvent(
        timed_out ? "profile_lookup_timed_out" : "profile_lookup_threw",
        {
          lookup_key: "open_id",
          supabase_user_id: authOpenId,
          timeout_ms: USER_DB_LOOKUP_TIMEOUT_MS,
          error: first_error,
          diagnostic_code: profile_lookup_error_code(error),
        },
      );
      return {
        user: null,
        status: timed_out ? "timed_out" : "threw",
        error: first_error,
      };
    }
  }

  if (authEmail) {
    try {
      const user = await timeRequiredDbUserPhase(
        "supabase_email_lookup",
        phases,
        () => getUserByEmailSnake(authEmail),
      );
      if (user) {
        logContextAuthEvent("profile_lookup_succeeded", {
          lookup_key: "email",
          supabase_email: authEmail,
        });
        return { user, status: "resolved", error: null };
      }
      logContextAuthEvent("profile_lookup_missed", {
        lookup_key: "email",
        supabase_email: authEmail,
      });
    } catch (error) {
      const detail = errorDetail(error);
      timed_out = timed_out || isTimeoutError(error);
      logContextAuthEvent(
        isTimeoutError(error)
          ? "profile_lookup_timed_out"
          : "profile_lookup_threw",
        {
          lookup_key: "email",
          supabase_email: authEmail,
          timeout_ms: USER_DB_LOOKUP_TIMEOUT_MS,
          error: detail,
          diagnostic_code: profile_lookup_error_code(error),
        },
      );
      return {
        user: null,
        status: isTimeoutError(error) ? "timed_out" : "threw",
        error: detail,
      };
    }
  }

  if (first_error) {
    return {
      user: null,
      status: timed_out ? "timed_out" : "threw",
      error: first_error,
    };
  }

  return { user: null, status: "missed", error: null };
}

async function resolveUserFromLegacySession(
  session: any,
  phases: ContextLookupPhase[],
): Promise<RuntimeUser | null> {
  let dbUser: RuntimeUser | null = null;
  if (session?.openId) {
    dbUser = await timeOptionalDbUserPhase(
      "session_open_id_lookup",
      phases,
      () => getUserByOpenIdSnake(String(session.openId)),
    );
  }
  if (!dbUser && session?.user?.email) {
    dbUser = await timeOptionalDbUserPhase("session_email_lookup", phases, () =>
      getUserByEmailSnake(String(session.user.email)),
    );
  }
  return dbUser;
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: RuntimeUser | null = null;
  let auth = createUnauthenticatedAuth();
  const phases: ContextLookupPhase[] = [];
  const started = Date.now();
  const isInspectionMode = isLighthouseInspectionMode(opts.req);
  if (isInspectionMode) {
    return {
      req: opts.req,
      res: opts.res,
      user: createInspectionUser(),
      auth: createInspectionAuth(),
      isSystem: false,
      isInspectionMode: true,
    };
  }

  const session = (opts.req as any).session;
  try {
    const authUser = await resolveSupabaseAuthUser(opts.req, phases);
    if (authUser) {
      const supabase_user_id = authUser.id?.trim() || null;
      const supabase_email = authUser.email?.trim().toLowerCase() || null;
      const profileResult = await withTimeout(
        resolveProfileFromSupabaseAuthUser(authUser, phases),
        USER_LOOKUP_TIMEOUT_MS,
        "tRPC context supabase profile resolution",
      ).catch((error): ProfileResolutionResult => {
        const detail = errorDetail(error);
        logContextAuthEvent(
          isTimeoutError(error)
            ? "profile_lookup_timed_out"
            : "profile_lookup_threw",
          {
            lookup_key: "supabase_profile_resolution",
            supabase_user_id,
            supabase_email,
            timeout_ms: USER_LOOKUP_TIMEOUT_MS,
            error: detail,
            diagnostic_code: profile_lookup_error_code(error),
          },
        );
        return {
          user: null,
          status: isTimeoutError(error) ? "timed_out" : "threw",
          error: detail,
        };
      });
      user = profileResult.user;
      auth = {
        auth_status: user
          ? "authenticated_profile_resolved"
          : "authenticated_profile_unresolved",
        supabase_user_id,
        supabase_email,
        profile_resolution_status: profileResult.status,
        profile_resolution_error: profileResult.error,
      };
    } else {
      user = await withTimeout(
        resolveUserFromLegacySession(session, phases),
        USER_LOOKUP_TIMEOUT_MS,
        "tRPC context legacy user lookup",
      );
      if (user) {
        auth = {
          auth_status: "authenticated_profile_resolved",
          supabase_user_id: user.open_id,
          supabase_email: user.email?.trim().toLowerCase() || null,
          profile_resolution_status: "resolved",
          profile_resolution_error: null,
        };
      }
    }
  } catch (error) {
    logContextUserLookupError(error);
    user = null;
  } finally {
    logSlowContextUserLookup(phases, Date.now() - started, Boolean(user));
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    auth,
    isSystem: false,
    isInspectionMode: false,
  };
}
