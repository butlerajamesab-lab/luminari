import { Pool } from "pg";

const fast_fail_connection_string = "postgresql://x:x@127.0.0.1:1/x";
const stripped_database_url_params = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "pgbouncer",
  "connect_timeout",
];

let missing_database_url_warning_issued = false;

type database_pool_options = {
  label?: string;
  connection_timeout_millis?: number;
  max?: number;
  idle_timeout_millis?: number;
  max_uses?: number;
  keep_alive?: boolean;
};

export function get_database_url(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function sanitize_database_url_for_pg(connection_string: string): string {
  try {
    const url = new URL(connection_string);
    for (const key of stripped_database_url_params) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return connection_string;
  }
}

export function get_database_host_label(connection_string = get_database_url()): string {
  if (!connection_string) return "unconfigured";
  try {
    return new URL(connection_string).hostname;
  } catch {
    return "invalid-url";
  }
}

export function create_database_pool(options: database_pool_options = {}): Pool {
  const label = options.label ?? "DB";
  const connection_string = get_database_url();

  if (!connection_string) {
    if (!missing_database_url_warning_issued) {
      console.warn(`[${label}] DATABASE_URL is not configured; database queries will fail fast until it is set.`);
      missing_database_url_warning_issued = true;
    }
    return new Pool({
      connectionString: fast_fail_connection_string,
      connectionTimeoutMillis: 1000,
    });
  }

  const sanitized_connection_string = sanitize_database_url_for_pg(connection_string);

  // Supabase pooling requirement: DATABASE_URL must point at the transaction
  // pooler on port 6543 (NOT the direct connection on 5432). The transaction
  // pooler does not support session-level prepared statements, so prepared
  // statements must stay disabled. node-postgres only emits a prepared
  // statement when a query is given a `name`; the canonical pool never names
  // queries, and drizzle's node-postgres driver does not prepare unless
  // `.prepare()` is called explicitly — keep it that way (postgres.js
  // equivalent: `postgres(DATABASE_URL, { prepare: false })`).
  const connection_timeout_millis = options.connection_timeout_millis ?? 10000;
  const idle_timeout_millis = options.idle_timeout_millis ?? 30000;
  const max_uses = options.max_uses ?? 7500;
  const keep_alive = options.keep_alive ?? true;

  const pool = new Pool({
    connectionString: sanitized_connection_string,
    connectionTimeoutMillis: connection_timeout_millis,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: idle_timeout_millis,
    maxUses: max_uses,
    keepAlive: keep_alive,
    ...(options.max !== undefined ? { max: options.max } : {}),
  });
  pool.on("error", (err) => {
    console.error(`[${label}] Unexpected PostgreSQL pool error:`, err);
  });
  console.log(`[${label}] PostgreSQL pool initialized via sanitized DATABASE_URL with SSL. Host: ${get_database_host_label(connection_string)}`);
  return pool;
}
