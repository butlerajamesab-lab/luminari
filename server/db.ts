import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import { users, type User } from "../drizzle/schema";

let sqlClient: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let warningIssued = false;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url && !warningIssued) {
    console.warn("[DB] No Postgres connection string configured. Set DATABASE_URL for Supabase Postgres.");
    warningIssued = true;
  }
  return url || "postgresql://invalid:invalid@localhost:5432/invalid";
}

export function getSqlClient(): postgres.Sql {
  if (!sqlClient) {
    sqlClient = postgres(getDatabaseUrl(), {
      max: Number(process.env.DB_POOL_MAX || 10),
      idle_timeout: Number(process.env.DB_IDLE_TIMEOUT || 20),
      connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT || 10),
      prepare: false,
      ssl: process.env.DATABASE_SSL === "false" ? false : "require",
    });
  }
  return sqlClient;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlClient(), { schema });
  }
  return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    const instance = getDb() as any;
    const value = instance[prop as keyof typeof instance];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function verifyConnection() {
  await getSqlClient()`select 1`;
  console.log("[DB] Successfully connected to Supabase PostgreSQL database.");
}

export async function closeDb() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbInstance = null;
  }
}

export async function getUserByOpenId(_openId: string): Promise<User | null> {
  return null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await getDb().select().from(users).where(eq(users.email, email));
  return row ?? null;
}

export async function upsertUser(data: {
  id?: string;
  email: string;
  fullName?: string | null;
  role?: string | null;
}) {
  const values = {
    ...(data.id ? { id: data.id } : {}),
    email: data.email,
    fullName: data.fullName ?? null,
    role: data.role ?? "analyst",
    updatedAt: new Date(),
  };

  const [row] = await getDb()
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.email,
      set: {
        fullName: values.fullName,
        role: values.role,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export { schema };
