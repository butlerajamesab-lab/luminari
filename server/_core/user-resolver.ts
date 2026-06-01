import type { User } from "../../drizzle/schema";
import { getPool } from "../db";

function mapUser(row: any): User | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    openId: row.openId ?? row.open_id,
    name: row.name ?? null,
    email: row.email ?? null,
    loginMethod: row.loginMethod ?? row.login_method ?? null,
    role: row.role ?? "user",
    plan: row.plan ?? "free",
    createdAt: Number(row.createdAt ?? row.created_at ?? 0),
    updatedAt: Number(row.updatedAt ?? row.updated_at ?? 0),
    lastSignedIn: Number(row.lastSignedIn ?? row.last_signed_in ?? 0),
  } as User;
}

const USER_SELECT = `select id, open_id as "openId", name, email, login_method as "loginMethod", role, plan, created_at as "createdAt", updated_at as "updatedAt", last_signed_in as "lastSignedIn" from public.users`;

export async function getUserByEmailSnake(email: string): Promise<User | null> {
  const result = await getPool().query(`${USER_SELECT} where lower(email) = $1 limit 1`, [email.trim().toLowerCase()]);
  return mapUser(result.rows[0]);
}

export async function getUserByOpenIdSnake(openId: string): Promise<User | null> {
  const result = await getPool().query(`${USER_SELECT} where open_id = $1 limit 1`, [openId]);
  return mapUser(result.rows[0]);
}
