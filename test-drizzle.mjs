import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const { Pool } = pg;

const legalStatutes = pgTable("legal_statutes", {
  id: uuid("id").defaultRandom().primaryKey(),
  citation: text("citation").notNull(),
  jurisdiction: text("jurisdiction"),
  title: text("title"),
  statuteText: text("statute_text"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const DATABASE_URL = "postgresql://postgres:AtHRJ9O5ninIr0w9@db.wepxlinwbjrkqdzkqpar.supabase.co:5432/postgres";

async function main() {
  console.log("Creating pool...");
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  console.log("Creating Drizzle instance...");
  const db = drizzle(pool);

  console.log("Running Drizzle COUNT query...");
  try {
    const [result] = await db.select({ count: sql`COUNT(*)::int` }).from(legalStatutes);
    console.log("SUCCESS:", result);
  } catch (e) {
    console.error("DRIZZLE ERROR:", e.message);
    console.error("CAUSE:", e.cause?.message);
  }

  console.log("Running raw pool query...");
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT COUNT(*)::int as cnt FROM legal_statutes');
    console.log("RAW SUCCESS:", res.rows[0]);
    client.release();
  } catch (e) {
    console.error("RAW ERROR:", e.message);
  }

  await pool.end();
}

main().catch(console.error);
