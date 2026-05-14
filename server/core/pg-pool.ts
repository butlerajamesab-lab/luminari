/**
 * PostgreSQL Connection Pool
 *
 * Re-exports the canonical shared pool from server/db.ts.
 * DO NOT create a separate pool here — see DATABASE_ACCESS_CONSTITUTION.md.
 */

import { getPool } from "../db";

// Re-export the canonical pool so existing imports continue to work
const pool = new Proxy({} as any, {
  get: (_target, prop) => (getPool() as any)[prop],
});

export { pool };
