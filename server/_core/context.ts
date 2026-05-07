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
  isInspectionMode?: boolean; // Temporary read/inspection surface for Render preview
};

function isLighthouseInspectionMode(): boolean {
  return (
    process.env.LIGHTHOUSE_INSPECTION_MODE === "true" ||
    process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true"
  );
}

function createInspectionUser(): User {
  const now = Date.now();
  return {
    id: 0,
    openId: "inspection_user",
    name: "Inspection User",
    email: "inspection@lighthouse.local",
    loginMethod: "temporary_lighthouse_inspection_mode",
    role: "admin",
    plan: "enterprise",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const isInspectionMode = isLighthouseInspectionMode();

  if (isInspectionMode) {
    return {
      req: opts.req,
      res: opts.res,
      user: createInspectionUser(),
      isSystem: false,
      isInspectionMode: true,
    };
  }

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
    isInspectionMode: false,
  };
}
