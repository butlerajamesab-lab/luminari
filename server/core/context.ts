import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isSystem?: boolean; // System context for internal processing (ingestion, extraction, pattern detection)
};

const USER_LOOKUP_TIMEOUT_MS = 1250;
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

function logContextUserLookupError(error: unknown): void {
  const now = Date.now();
  const detail = error instanceof Error ? error.message : String(error);

  if (now - lastContextUserLookupErrorLogAt >= CONTEXT_ERROR_LOG_THROTTLE_MS) {
    const suppressedSuffix = suppressedContextUserLookupErrors > 0
      ? ` (${suppressedContextUserLookupErrors} similar user lookup errors suppressed in the last ${CONTEXT_ERROR_LOG_THROTTLE_MS / 1000}s)`
      : "";
    console.error(`[CONTEXT] Error during user lookup:${suppressedSuffix}`, detail);
    lastContextUserLookupErrorLogAt = now;
    suppressedContextUserLookupErrors = 0;
    return;
  }

  suppressedContextUserLookupErrors += 1;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Get session from request (populated by sessionMiddleware)
  const session = (opts.req as any).session;

  // Try to resolve user from session, but do not let DB pool pressure stall every request.
  try {
    user = await withTimeout((async () => {
      let dbUser: User | null = null;

      // Strategy 1: Look up by openId from session (primary path)
      if (session?.openId) {
        dbUser = await db.getUserByOpenId(session.openId);
      }

      // Strategy 2: Look up by email if available
      if (!dbUser && session?.user?.email) {
        const [row] = await db.db.select().from(users).where(eq(users.email, session.user.email));
        dbUser = row ?? null;
      }

      // No fallback — if no session, user stays null (unauthenticated)
      return dbUser;
    })(), USER_LOOKUP_TIMEOUT_MS, "tRPC context user lookup");
  } catch (error) {
    logContextUserLookupError(error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isSystem: false,
  };
}
