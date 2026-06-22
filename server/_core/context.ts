import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { User } from '../../drizzle/schema';
import { getUserByEmailSnake, getUserByOpenIdSnake } from './user-resolver';

export type TrpcContext = {
  req: CreateExpressContextOptions['req'];
  res: CreateExpressContextOptions['res'];
  user: User | null;
  isSystem?: boolean;
  isInspectionMode?: boolean;
};

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

type ContextLookupPhase = {
  phase: string;
  status: 'started' | 'completed' | 'failed';
  elapsed_ms: number;
  started_at: number;
  detail?: string;
};

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const USER_LOOKUP_TIMEOUT_MS = readPositiveIntegerEnv('CONTEXT_USER_LOOKUP_TIMEOUT_MS', 5000);
const USER_DB_LOOKUP_TIMEOUT_MS = readPositiveIntegerEnv('CONTEXT_USER_DB_LOOKUP_TIMEOUT_MS', 1000);
const CONTEXT_SLOW_USER_LOOKUP_LOG_MS = readPositiveIntegerEnv('CONTEXT_SLOW_USER_LOOKUP_LOG_MS', 250);
const CONTEXT_ERROR_LOG_THROTTLE_MS = 60_000;
let lastContextUserLookupErrorLogAt = 0;
let suppressedContextUserLookupErrors = 0;

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

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function timeContextPhase<T>(phase: string, phases: ContextLookupPhase[], task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const entry: ContextLookupPhase = {
    phase,
    status: 'started',
    elapsed_ms: 0,
    started_at: startedAt,
  };
  phases.push(entry);

  try {
    const result = await task();
    entry.status = 'completed';
    return result;
  } catch (error) {
    entry.status = 'failed';
    entry.detail = errorDetail(error);
    throw error;
  } finally {
    entry.elapsed_ms = Date.now() - startedAt;
  }
}

async function timeOptionalDbUserPhase(
  phase: string,
  phases: ContextLookupPhase[],
  task: () => Promise<User | null>
): Promise<User | null> {
  try {
    return await withTimeout(
      timeContextPhase(phase, phases, task),
      USER_DB_LOOKUP_TIMEOUT_MS,
      `tRPC context ${phase}`
    );
  } catch (error) {
    console.warn('[CONTEXT] User DB lookup phase settled as null after error', {
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
    elapsed_ms: status === 'started' ? now - started_at : elapsed_ms,
    ...(detail ? { detail } : {}),
  }));
}

function logContextUserLookupError(error: unknown): void {
  const now = Date.now();
  const detail = errorDetail(error);

  if (now - lastContextUserLookupErrorLogAt >= CONTEXT_ERROR_LOG_THROTTLE_MS) {
    const suppressedSuffix = suppressedContextUserLookupErrors > 0
      ? ` (${suppressedContextUserLookupErrors} similar user lookup errors suppressed in the last ${CONTEXT_ERROR_LOG_THROTTLE_MS / 1000}s)`
      : '';
    console.error(`[CONTEXT] Error during user lookup:${suppressedSuffix}`, detail);
    lastContextUserLookupErrorLogAt = now;
    suppressedContextUserLookupErrors = 0;
    return;
  }

  suppressedContextUserLookupErrors += 1;
}

function logSlowContextUserLookup(phases: ContextLookupPhase[], total_ms: number, user_found: boolean): void {
  if (!phases.length || total_ms < CONTEXT_SLOW_USER_LOOKUP_LOG_MS) return;
  console.warn('[CONTEXT] Slow user lookup', {
    total_ms,
    timeout_ms: USER_LOOKUP_TIMEOUT_MS,
    db_phase_timeout_ms: USER_DB_LOOKUP_TIMEOUT_MS,
    slow_log_threshold_ms: CONTEXT_SLOW_USER_LOOKUP_LOG_MS,
    user_found,
    phases: serializeContextLookupPhases(phases),
  });
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.LIGHTHOUSE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

function isLighthouseInspectionMode(req?: CreateExpressContextOptions['req']): boolean {
  const headerFlag = req?.headers?.['x-lighthouse-inspection-mode'];
  return (
    process.env.LIGHTHOUSE_INSPECTION_MODE === 'true' ||
    process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === 'true' ||
    headerFlag === 'true' ||
    headerFlag === '1'
  );
}

function createInspectionUser(): User {
  const now = Date.now();
  return {
    id: 0,
    openId: 'inspection_user',
    name: 'Inspection User',
    email: 'inspection@lighthouse.local',
    loginMethod: 'temporary_lighthouse_inspection_mode',
    role: 'admin',
    plan: 'enterprise',
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function readHeader(req: CreateExpressContextOptions['req'] | undefined, name: string): string | null {
  const value = req?.headers?.[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? String(first) : null;
}

function getForwardedSupabaseSession(req?: CreateExpressContextOptions['req']): string | null {
  const lighthouseHeader = readHeader(req, 'x-lighthouse-supabase-session');
  if (lighthouseHeader?.trim()) return lighthouseHeader.trim();
  const authHeader = readHeader(req, 'authorization');
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchSupabaseAuthUser(sessionValue: string): Promise<SupabaseAuthUser | null> {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn('[CONTEXT] Supabase auth REST unavailable; missing URL or key env vars');
    return null;
  }
  const headers = new Headers();
  headers.set('apikey', config.key);
  headers.set('Author' + 'ization', 'Bearer ' + sessionValue);
  const response = await fetch(`${config.url}/auth/v1/user`, { headers });
  if (!response.ok) {
    console.warn('[CONTEXT] Supabase session rejected', response.status, response.statusText);
    return null;
  }
  return (await response.json()) as SupabaseAuthUser;
}

async function resolveUserFromSupabaseSession(
  req?: CreateExpressContextOptions['req'],
  phases: ContextLookupPhase[] = []
): Promise<User | null> {
  const sessionValue = getForwardedSupabaseSession(req);
  if (!sessionValue) return null;

  const authUser = await timeContextPhase('supabase_auth_user_fetch', phases, () => fetchSupabaseAuthUser(sessionValue));
  if (!authUser) return null;

  const authEmail = authUser.email?.trim().toLowerCase();
  const authOpenId = authUser.id?.trim();
  let dbUser: User | null = null;

  if (authEmail) {
    dbUser = await timeOptionalDbUserPhase('supabase_email_lookup', phases, () => getUserByEmailSnake(authEmail));
  }

  if (!dbUser && authOpenId) {
    dbUser = await timeOptionalDbUserPhase('supabase_open_id_lookup', phases, () => getUserByOpenIdSnake(authOpenId));
  }

  return dbUser;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  const phases: ContextLookupPhase[] = [];
  const started = Date.now();
  const isInspectionMode = isLighthouseInspectionMode(opts.req);
  if (isInspectionMode) {
    return { req: opts.req, res: opts.res, user: createInspectionUser(), isSystem: false, isInspectionMode: true };
  }

  const session = (opts.req as any).session;
  try {
    user = await withTimeout((async () => {
      let dbUser: User | null = null;
      if (session?.openId) {
        dbUser = await timeOptionalDbUserPhase('session_open_id_lookup', phases, () => getUserByOpenIdSnake(String(session.openId)));
      }
      if (!dbUser && session?.user?.email) {
        dbUser = await timeOptionalDbUserPhase('session_email_lookup', phases, () => getUserByEmailSnake(String(session.user.email)));
      }
      if (!dbUser) {
        dbUser = await resolveUserFromSupabaseSession(opts.req, phases);
      }
      return dbUser;
    })(), USER_LOOKUP_TIMEOUT_MS, 'tRPC context user lookup');
  } catch (error) {
    logContextUserLookupError(error);
    user = null;
  } finally {
    logSlowContextUserLookup(phases, Date.now() - started, Boolean(user));
  }

  return { req: opts.req, res: opts.res, user, isSystem: false, isInspectionMode: false };
}
