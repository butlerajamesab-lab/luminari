import { sql } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { db } from "../db";

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

function rowsFromResult(result: unknown): any[] {
  const maybeRows = (result as any)?.rows;
  if (Array.isArray(maybeRows)) return maybeRows;
  if (Array.isArray(result)) return result;
  return [];
}

export async function getUserByEmailSnake(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const result = await db.execute(sql`
    select
      id,
      open_id as "openId",
      name,
      email,
      login_method as "loginMethod",
      role,
      plan,
      created_at as "createdAt",
      updated_at as "updatedAt",
      last_signed_in as "lastSignedIn"
    from public.users
    where lower(email) = ${normalized}
    limit 1
  `);

  return mapUser(rowsFromResult(result)[0]);
}

export async function getUserByOpenIdSnake(openId: string): Promise<User | null> {
  const result = await db.execute(sql`
    select
      id,
      open_id as "openId",
      name,
      email,
      login_method as "loginMethod",
      role,
      plan,
      created_at as "createdAt",
      updated_at as "updatedAt",
      last_signed_in as "lastSignedIn"
    from public.users
    where open_id = ${openId}
    limit 1
  `);

  return mapUser(rowsFromResult(result)[0]);
}
