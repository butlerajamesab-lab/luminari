/**
 * PostgreSQL Connection Pool
 *
 * Re-exports the canonical shared pool from server/db.ts.
 * DO NOT create a separate pool here — see DATABASE_ACCESS_CONSTITUTION.md.
 */

// Re-export the canonical receiver-bound lazy facade so existing imports
// cannot reintroduce a second, unbound Proxy receiver.
export { pool } from "../db";
