import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as db from "../db";
import { eq, sql } from "drizzle-orm";
import { users } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isSystem?: boolean; // System context for internal processing (ingestion, extraction, pattern detection)
  isInspectionMode?: boolean; // Temporary read/inspection surface for Render preview
};

let supabaseAuthClient: SupabaseClient | null = null;

function getSupabaseAuthClient(): SupabaseClient | null {
  if (supabaseAuthClient) return supabaseAuthClient;

  const url =
    process.env.LIGHTHOUSE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key =
    process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  supabaseAuthClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAuthClient;
}

function isLighthouseInspectionMode(req?: CreateExpressContextOptions["req"]): boolean {
  const headerFlag = req?.headers?.["x-lighthouse-inspection-mode"];
  return (
    process.env.LIGHTHOUSE_INSPECTION_MODE === "true" ||
    process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true" ||
    headerFlag === "true" ||
    headerFlag === "1"
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

function readHeader(req: CreateExpressContextOptions["req"] | undefined, name: string): string | null {
  const value = req?.headers?.[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? String(first) : null;
}

function getForwardedSupabaseSession(req?: CreateExpressContextOptions["req"]): string | null {
  const lighthouseHeader = readHeader(req, "x-lighthouse-supabase-session");
  if (lighthouseHeader?.trim()) return lighthouseHeader.trim();

  const authorizationHeader = readHeader(req, "authorization");
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveUserFromSupabaseSession(
  req?: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const sessionValue = getForwardedSupabaseSession(req);
  if (!sessionValue) return null;

  const supabase = getSupabaseAuthClient();
  if (!supabase) {
    console.warn("[CONTEXT] Supabase auth client unavailable; missing URL or key env vars");
    return null;
  }

  const { data, error } = await supabase.auth.getUser(sessionValue);
  if (error || !data.user) {
    console.warn("[CONTEXT] Supabase session rejected", error?.message ?? "unknown_error");
    return null;
  }

  const authUser = data.user;
  const authEmail = authUser.email?.trim().toLowerCase();
  let dbUser: User | null = null;

  if (authEmail) {
    const [row] = await db.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${authEmail}`);
    dbUser = row ?? null;
  }

  if (!dbUser && authUser.id) {
    const [row] = await db.db
      .select()
      .from(users)
      .where(eq(users.openId, authUser.id));
    dbUser = row ?? null;
  }

  return dbUser;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const isInspectionMode = isLighthouseInspectionMode(opts.req);

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

  // Try to resolve user from session or Supabase frontend session.
  try {
    let dbUser: User | null = null;

    // Strategy 1: Look up by openId from Express session (legacy/admin path)
    if (session?.openId) {
      dbUser = await db.getUserByOpenId(session.openId);
    }

    // Strategy 2: Look up by email from Express session
    if (!dbUser && session?.user?.email) {
      const sessionEmail = String(session.user.email).trim().toLowerCase();
      const [row] = await db.db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${sessionEmail}`);
      dbUser = row ?? null;
    }

    // Strategy 3: Supabase frontend auth session forwarded by tRPC client
    if (!dbUser) {
      dbUser = await resolveUserFromSupabaseSession(opts.req);
    }

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
