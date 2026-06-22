import { getPool } from "../db";
import { dedupeUserLookup, getCachedUser, setCachedUser } from "./user-cache";

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

function mapUser(row: any): RuntimeUser | null {
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

function cacheUser(user: RuntimeUser | null) {
  setCachedUser([user?.email, user?.open_id], user);
}

export async function getUserByEmailSnake(email: string): Promise<RuntimeUser | null> {
  const normalized = email.trim().toLowerCase();
  const cached = getCachedUser(normalized);
  if (cached) return cached;

  try {
    return await dedupeUserLookup(normalized, async () => {
      const result = await getPool().query(`${USER_SELECT} where lower(email) = $1 limit 1`, [normalized]);
      const user = mapUser(result.rows[0]);
      setCachedUser([normalized, user?.open_id], user);
      return user;
    });
  } catch (error) {
    const stale = getCachedUser(normalized, true);
    if (stale) {
      console.warn("[CONTEXT] Using stale cached user after DB lookup failure", error instanceof Error ? error.message : String(error));
      return stale;
    }
    throw error;
  }
}

export async function getUserByOpenIdSnake(openId: string): Promise<RuntimeUser | null> {
  const cached = getCachedUser(openId);
  if (cached) return cached;

  try {
    return await dedupeUserLookup(openId, async () => {
      const result = await getPool().query(`${USER_SELECT} where open_id = $1 limit 1`, [openId]);
      const user = mapUser(result.rows[0]);
      cacheUser(user);
      return user;
    });
  } catch (error) {
    const stale = getCachedUser(openId, true);
    if (stale) {
      console.warn("[CONTEXT] Using stale cached user after DB lookup failure", error instanceof Error ? error.message : String(error));
      return stale;
    }
    throw error;
  }
}
