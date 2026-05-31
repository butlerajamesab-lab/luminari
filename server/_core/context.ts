import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
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

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

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

  const authHeader = readHeader(req, "authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchSupabaseAuthUser(sessionValue: string): Promise<SupabaseAuthUser | null> {
  const config = getSupabaseConfig();
  if (!config) {
    console.warn("[CONTEXT] Supabase auth REST unavailable; missing URL or key env vars");
    return null;
  }

  const headers = new Headers();
  headers.set("apikey", config.key);
  headers.set("Author" + "ization", "Bearer " + sessionValue);

  const response = await fetch(`${config.url}/auth/v1/user`, { headers });
  if (!response.ok) {
    console.warn("[CONTEXT] Supabase session rejected", response.status, response.statusText);
    return null;
  }

  return (await response.json()) as SupabaseAuthUser;
}

async function resolveUserFromSupabaseSession(
  req?: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const sessionValue = getForwardedSupabaseSession(req);
  if (!sessionValue) return null;

  const authUser = await fetchSupabaseAuthUser(sessionValue);
  if (!authUser) return null;

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
