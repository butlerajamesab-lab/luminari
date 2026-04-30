/**
 * PostgreSQL Connection Pool
 *
 * Runtime-only Supabase Postgres connection. Credentials are read from
 * process.env / .env at server startup and must not be committed.
 */

import { Pool } from "pg";

function buildPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  const sslMode = process.env.PGSSLMODE || "require";
  const ssl = sslMode === "disable" ? false : { rejectUnauthorized: false };

  if (connectionString) {
    return { connectionString, ssl };
  }

  return {
    host: process.env.PGHOST || process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.PGPORT || process.env.DATABASE_PORT || "5432", 10),
    database: process.env.PGDATABASE || process.env.DATABASE_NAME || "postgres",
    user: process.env.PGUSER || process.env.DATABASE_USER || "postgres",
    password: process.env.PGPASSWORD || process.env.DATABASE_PASSWORD || "",
    ssl,
  };
}

const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

export { pool };
