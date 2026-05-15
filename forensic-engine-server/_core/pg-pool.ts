/**
 * PostgreSQL Connection Pool
 * 
 * Manages connections to luminari_registry database
 * Used by caseService and registryService
 */

import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432"),
  database: process.env.DATABASE_NAME || "luminari_registry",
  user: process.env.DATABASE_USER || "postgres",
  password: process.env.DATABASE_PASSWORD || "postgres",
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export { pool };
