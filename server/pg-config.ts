import { Pool, type PoolConfig } from "pg";

const FAST_FAIL_CONNECTION_STRING = "postgresql://x:x@127.0.0.1:1/x";

let missingDatabaseUrlWarningIssued = false;

type DatabasePoolOptions = {
  label?: string;
  connectionTimeoutMillis?: number;
  max?: number;
};

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
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

  const config: PoolConfig = {
    connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10000,
    ssl: { rejectUnauthorized: false },
  };

  if (options.max !== undefined) {
    config.max = options.max;
  }

  const pool = new Pool(config);
  pool.on("error", (err) => {
    console.error(`[${label}] Unexpected PostgreSQL pool error:`, err);
  });
  console.log(`[${label}] PostgreSQL pool initialized via DATABASE_URL with SSL. Host: ${getDatabaseHostLabel(connectionString)}`);
  return pool;
}
