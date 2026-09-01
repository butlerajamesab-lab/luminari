import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { classify_db_error } from "../db";
import {
  get_user_by_email_snake,
  get_user_by_open_id_snake,
  type RuntimeUser,
} from "./user-resolver";

export type AuthStatus =
  | "unauthenticated"
  | "authenticated_profile_resolved"
  | "authenticated_profile_unresolved";

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
};

type ExpressContextInput = Pick<CreateExpressContextOptions, "req" | "res">;

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

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS = readPositiveIntegerEnv("CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS", 2500);
const CONTEXT_SLOW_USER_LOOKUP_LOG_MS = readPositiveIntegerEnv("CONTEXT_SLOW_USER_LOOKUP_LOG_MS", 250);
const SENSITIVE_AUTH_LOG_KEY = /(^|_)(email|user_id|open_id|cache_key|session|token|authorization|apikey|api_key|secret|password)(_|$)/i;
const EMAIL_LOG_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_LOG_VALUE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function withAbortableTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
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

function redactSensitiveLogText(value: string): string {
  return value
    .replace(EMAIL_LOG_VALUE, "[redacted_email]")
    .replace(UUID_LOG_VALUE, "[redacted_uuid]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&](?:token|apikey|api_key|secret|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(password=)[^\s&]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function sanitizeAuthLogValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_AUTH_LOG_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") return redactSensitiveLogText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeAuthLogValue(item));
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveLogText(value.message),
    };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeAuthLogValue(nestedValue, nestedKey),
      ])
    );
  }
  return value;
}

function sanitizeAuthLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  return sanitizeAuthLogValue(details) as Record<string, unknown>;
}

function createUnauthenticatedAuth(): ContextAuth {
  return { auth_status: "unauthenticated", supabase_user_id: null, supabase_email: null, profile_resolution_status: "not_attempted", profile_resolution_error: null };
}

function createAuthenticatedUnresolvedAuth(authUser: SupabaseAuthUser): ContextAuth {
  return {
    auth_status: "authenticated_profile_unresolved",
    supabase_user_id: authUser.id?.trim() || null,
    supabase_email: authUser.email?.trim().toLowerCase() || null,
    profile_resolution_status: "not_attempted",
    profile_resolution_error: null,
  };
}

function createResolvedAuth(user: RuntimeUser): ContextAuth {
  return {
    auth_status: "authenticated_profile_resolved",
    supabase_user_id: user.open_id,
    supabase_email: user.email?.trim().toLowerCase() || null,
    profile_resolution_status: "resolved",
    profile_resolution_error: null,
  };
}

function logContextAuthEvent(event: string, details: Record<string, unknown>): void {
  console.warn("[CONTEXT] auth_context_event", sanitizeAuthLogDetails({ event, ...details }));
}

async function timeContextPhase<T>(phase: string, phases: ContextLookupPhase[], task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const entry: ContextLookupPhase = { phase, status: "started", elapsed_ms: 0, started_at: startedAt };
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

function serializeContextLookupPhases(phases: ContextLookupPhase[]) {
  const now = Date.now();
  return phases.map(({ phase, status, elapsed_ms, started_at, detail }) => ({ phase, status, elapsed_ms: status === "started" ? now - started_at : elapsed_ms, ...(detail ? { detail } : {}) }));
}

function logSlowContextUserLookup(phases: ContextLookupPhase[], total_ms: number): void {
  if (!phases.length || total_ms < CONTEXT_SLOW_USER_LOOKUP_LOG_MS) return;
  console.warn(
    "[CONTEXT] Slow context auth lookup",
    sanitizeAuthLogDetails({
      total_ms,
      supabase_auth_fetch_timeout_ms: CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS,
      slow_log_threshold_ms: CONTEXT_SLOW_USER_LOOKUP_LOG_MS,
      phases: serializeContextLookupPhases(phases),
    })
  );
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.LIGHTHOUSE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function readHeader(req: CreateExpressContextOptions["req"] | undefined, name: string): string | null {
  const value = req?.headers?.[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? String(first) : null;
}

function getForwardedSupabaseSession(req?: CreateExpressContextOptions["req"]): string | null {
  const lighthouseHeader = readHeader(req, "x-lighthouse-supabase-session");
  if (lighthouseHeader?.trim()) return lighthouseHeader.trim();
  const authHeader = readHeader(req, "authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchSupabaseAuthUser(sessionValue: string, signal?: AbortSignal): Promise<SupabaseAuthUser | null> {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn("[CONTEXT] Supabase auth REST unavailable; missing URL or key env vars");
    return null;
  }
  const headers = new Headers();
  headers.set("apikey", config.key);
  headers.set("Authorization", `Bearer ${sessionValue}`);
  const response = await fetch(`${config.url}/auth/v1/user`, { headers, signal });
  if (!response.ok) {
    console.warn("[CONTEXT] Supabase session rejected", response.status, response.statusText);
    return null;
  }
  return (await response.json()) as SupabaseAuthUser;
}

async function resolveSupabaseAuthUser(req: CreateExpressContextOptions["req"] | undefined, phases: ContextLookupPhase[]): Promise<SupabaseAuthUser | null> {
  const sessionValue = getForwardedSupabaseSession(req);
  if (!sessionValue) return null;
  try {
    const authUser = await withAbortableTimeout((signal) => timeContextPhase("supabase_auth_user_fetch", phases, () => fetchSupabaseAuthUser(sessionValue, signal)), CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS, "tRPC context supabase auth user fetch");
    if (authUser) {
      logContextAuthEvent("supabase_auth_fetch_succeeded", { supabase_user_id: authUser.id ?? null, supabase_email: authUser.email?.trim().toLowerCase() ?? null, profile_resolution_status: "not_attempted" });
    }
    return authUser;
  } catch (error) {
    logContextAuthEvent("supabase_auth_fetch_failed", { timeout_ms: CONTEXT_SUPABASE_AUTH_FETCH_TIMEOUT_MS, error: errorDetail(error) });
    return null;
  }
}

async function resolveUserFromLegacySessionWithoutDb(session: any): Promise<{ user: RuntimeUser | null; auth: ContextAuth | null }> {
  if (!session?.user && !session?.openId) return { user: null, auth: null };
  return {
    user: null,
    auth: {
      auth_status: "authenticated_profile_unresolved",
      supabase_user_id: session?.openId ? String(session.openId) : null,
      supabase_email: session?.user?.email ? String(session.user.email).trim().toLowerCase() : null,
      profile_resolution_status: "not_attempted",
      profile_resolution_error: null,
    },
  };
}

async function resolveProfileFromSupabaseAuthUser(
  authUser: SupabaseAuthUser,
  phases: ContextLookupPhase[]
): Promise<{ user: RuntimeUser | null; auth: ContextAuth }> {
  const openId = authUser.id?.trim() || null;
  const email = authUser.email?.trim().toLowerCase() || null;
  try {
    const user = await timeContextPhase("profile_lookup", phases, async () => {
      if (openId) return get_user_by_open_id_snake(openId);
      if (email) return get_user_by_email_snake(email);
      return null;
    });
    if (user) {
      logContextAuthEvent("profile_lookup_succeeded", { supabase_user_id: openId, profile_resolution_status: "resolved" });
      return { user, auth: createResolvedAuth(user) };
    }
    logContextAuthEvent("profile_lookup_missed", { supabase_user_id: openId, supabase_email: email, profile_resolution_status: "missed" });
    return {
      user: null,
      auth: {
        auth_status: "authenticated_profile_unresolved",
        supabase_user_id: openId,
        supabase_email: email,
        profile_resolution_status: "missed",
        profile_resolution_error: null,
      },
    };
  } catch (error) {
    const detail = errorDetail(error);
    const db_class = classify_db_error(error);
    const status: ProfileResolutionStatus = db_class === "pool_acquire_timeout" || db_class === "query_timeout" ? "timed_out" : "threw";
    logContextAuthEvent("profile_lookup_failed", { supabase_user_id: openId, supabase_email: email, profile_resolution_status: status, error: detail });
    return {
      user: null,
      auth: {
        auth_status: "authenticated_profile_unresolved",
        supabase_user_id: openId,
        supabase_email: email,
        profile_resolution_status: status,
        profile_resolution_error: detail,
      },
    };
  }
}

export async function resolve_user_for_procedure(ctx: TrpcContext): Promise<RuntimeUser | null> {
  if (ctx.user) return ctx.user;
  const openId = ctx.auth.supabase_user_id?.trim() || null;
  const email = ctx.auth.supabase_email?.trim().toLowerCase() || null;
  let user: RuntimeUser | null = null;
  if (openId) user = await get_user_by_open_id_snake(openId);
  if (!user && email) user = await get_user_by_email_snake(email);
  if (user) {
    ctx.user = user;
    ctx.auth = createResolvedAuth(user);
  }
  return user;
}

export async function require_resolved_user(ctx: TrpcContext): Promise<RuntimeUser> {
  const user = await resolve_user_for_procedure(ctx);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated profile is required for this operation." });
  return user;
}

export async function createContext(opts: ExpressContextInput): Promise<TrpcContext> {
  let user: RuntimeUser | null = null;
  let auth = createUnauthenticatedAuth();
  const phases: ContextLookupPhase[] = [];
  const started = Date.now();
  try {
    const authUser = await resolveSupabaseAuthUser(opts.req, phases);
    if (authUser) {
      const resolved = await resolveProfileFromSupabaseAuthUser(authUser, phases);
      user = resolved.user;
      auth = resolved.auth;
    } else {
      const legacy = await resolveUserFromLegacySessionWithoutDb((opts.req as any).session);
      if (legacy.auth) auth = legacy.auth;
      user = legacy.user;
    }
  } catch (error) {
    logContextAuthEvent("context_auth_resolution_failed", { error: errorDetail(error) });
    user = null;
  } finally {
    logSlowContextUserLookup(phases, Date.now() - started);
  }
  return { req: opts.req, res: opts.res, user, auth, isSystem: false };
}

export const __testing = {
  resolveProfileFromSupabaseAuthUser,
  sanitizeAuthLogDetails,
};
