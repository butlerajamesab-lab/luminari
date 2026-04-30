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

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Get session from request (populated by sessionMiddleware)
  const session = (opts.req as any).session;

  // Try to resolve user from session
  try {
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
    user = dbUser;
  } catch (error) {
    console.error("[CONTEXT] Error during user lookup:", String(error));
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isSystem: false,
  };
}
