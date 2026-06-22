import { Pool, type PoolConfig } from "pg";

const FAST_FAIL_CONNECTION_STRING = "postgresql://x:x@127.0.0.1:1/x";
const STRIPPED_DATABASE_URL_PARAMS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "pgbouncer",
  "connect_timeout",
];

let missingDatabaseUrlWarningIssued = false;

type DatabasePoolOptions = {
  label?: string;
  connectionTimeoutMillis?: number;
  max?: number;
  idleTimeoutMillis?: number;
  maxUses?: number;
  keepAlive?: boolean;
};

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function sanitize_database_url_for_pg(connection_string: string): string {
  try {
    const url = new URL(connection_string);
    for (const key of STRIPPED_DATABASE_URL_PARAMS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return connection_string;
  }
}

export function getDatabaseHostLabel(connectionString = getDatabaseUrl()): string {
  if (!connectionString) return "unconfigured";
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "invalid-url";
  }
}

export function createDatabasePool(options: DatabasePoolOptions = {}): Pool {
  const label = options.label ?? "DB";
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    if (!missingDatabaseUrlWarningIssued) {
      console.warn(`[${label}] DATABASE_URL is not configured; database queries will fail fast until it is set.`);
      missingDatabaseUrlWarningIssued = true;
    }
    return new Pool({
      connectionString: FAST_FAIL_CONNECTION_STRING,
      connectionTimeoutMillis: 1000,
    });
  }

  const sanitized_connection_string = sanitize_database_url_for_pg(connectionString);

  // Supabase pooling requirement: DATABASE_URL must point at the transaction
  // pooler on port 6543 (NOT the direct connection on 5432). The transaction
  // pooler does not support session-level prepared statements, so prepared
  // statements must stay disabled. node-postgres only emits a prepared
  // statement when a query is given a `name`; the canonical pool never names
  // queries, and drizzle's node-postgres driver does not prepare unless
  // `.prepare()` is called explicitly — keep it that way (postgres.js
  // equivalent: `postgres(DATABASE_URL, { prepare: false })`).
  const config: PoolConfig = {
    connectionString: sanitized_connection_string,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10000,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
    maxUses: options.maxUses ?? 7500,
    keepAlive: options.keepAlive ?? true,
  };

  if (options.max !== undefined) {
    config.max = options.max;
  }

  const pool = new Pool(config);
  pool.on("error", (err) => {
    console.error(`[${label}] Unexpected PostgreSQL pool error:`, err);
  });
  console.log(`[${label}] PostgreSQL pool initialized via sanitized DATABASE_URL with SSL. Host: ${getDatabaseHostLabel(connectionString)}`);
  return pool;
}
