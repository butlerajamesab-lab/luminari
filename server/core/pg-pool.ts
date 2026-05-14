/**
 * PostgreSQL Connection Pool
 *
 * Shared Supabase PostgreSQL connection for registry and case services.
 * Render only provides DATABASE_URL, so this helper must not fall back to
 * localhost-style component variables.
 */

import { createDatabasePool } from "../pg-config";

const pool = createDatabasePool({ label: "CorePool", connectionTimeoutMillis: 10000 });

export { pool };
