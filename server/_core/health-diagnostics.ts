import type { Response } from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { classify_db_error, get_pool_runtime_configuration, query_with_diagnostics } from "../db";

export const SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";
const CACHE_TTL_MS = 60_000;
const DIAGNOSTIC_POOL_ACQUIRE_TIMEOUT_MS = 750;
const DIAGNOSTIC_QUERY_TIMEOUT_MS = 4_000;

type DiagnosticError = { code: string; message: string };
type InventoryRow = Record<string, unknown>;
export type DatabaseDiagnosticResponse = {
  ok: boolean;
  runtime: "active";
  database: "connected" | "unreachable" | "pool_saturated";
  database_status: "database_connected" | "application_pool_saturated" | "database_unreachable";
  application_pool_saturated: boolean;
  database_url: "configured" | "missing";
  database_version: string | null;
  supabase_project: string;
  public_tables: number | null;
  pool: ReturnType<typeof get_pool_runtime_configuration> & { acquisition_latency_ms: number | null; recent_timeout_count: number };
  auth_profile_resolution: "configured";
  current_deployment_commit: string | null;
  db_diagnostic: {
    tables: { total: number | null; inventory?: InventoryRow[] };
    views: { total: number | null; inventory?: InventoryRow[] };
    foreign_keys: { total: number | null; inventory?: InventoryRow[] };
    routes: { frontend: string[]; backend: string[] };
    errors: DiagnosticError[];
    generated_at: string | null;
    age_ms: number | null;
    stale: boolean;
    refreshing: boolean;
    last_refresh_error: DiagnosticError | null;
  };
  error?: DiagnosticError;
  timestamp: string;
};

type DeepSnapshot = {
  generated_at: string;
  tables: InventoryRow[];
  views: InventoryRow[];
  foreign_keys: InventoryRow[];
  routes: { frontend: string[]; backend: string[] };
};

let last_successful_snapshot: DeepSnapshot | null = null;
let last_refresh_error: DiagnosticError | null = null;
let refresh_promise: Promise<DeepSnapshot> | null = null;
let recent_pool_timeout_count = 0;

export function livenessPayload() {
  return { ok: true, runtime: "active", service: "luminari", supabase_project: SUPABASE_PROJECT, timestamp: new Date().toISOString() } as const;
}

function sanitizeError(error: unknown): DiagnosticError {
  const raw_message = error instanceof Error ? error.message : String(error);
  const message = raw_message.replace(/password=[^\s&]+/g, "password=***").slice(0, 500);
  const code = classify_db_error(error) === "pool_acquire_timeout" ? "application_pool_saturated" : "database_unreachable";
  return { code, message };
}

async function walkFiles(dir: string, predicate: (file: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(full, predicate);
      return predicate(full) ? [full] : [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

async function discoverRouteInventory() {
  const [clientFiles, serverFiles] = await Promise.all([
    walkFiles(path.resolve(process.cwd(), "client/src/pages"), (file) => /\.(tsx|ts)$/.test(file)),
    walkFiles(path.resolve(process.cwd(), "server"), (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts")),
  ]);
  const frontend = clientFiles.map((file) => `/${path.basename(file).replace(/\.(tsx|ts)$/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`).sort();
  const backend = new Set<string>();
  await Promise.all(serverFiles.map(async (file) => {
    try {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/(?:app|router|expressRouter)\.(?:get|post|put|patch|delete|all|use)\(\s*["'`]([^"'`]+)["'`]/g)) backend.add(match[1]);
    } catch {}
  }));
  return { frontend, backend: Array.from(backend).sort() };
}

async function buildDeepSnapshot(): Promise<DeepSnapshot> {
  const [tables, views, foreign_keys, routes] = await Promise.all([
    query_with_diagnostics<InventoryRow>(`select table_name, count(column_name)::int as column_count from information_schema.columns where table_schema = 'public' group by table_name order by table_name`, [], { label: "db_diagnostic_tables", pool_acquire_timeout_ms: DIAGNOSTIC_POOL_ACQUIRE_TIMEOUT_MS, query_timeout_ms: DIAGNOSTIC_QUERY_TIMEOUT_MS }).then((r) => r.rows),
    query_with_diagnostics<InventoryRow>(`select table_name as view_name from information_schema.views where table_schema = 'public' order by table_name`, [], { label: "db_diagnostic_views", pool_acquire_timeout_ms: DIAGNOSTIC_POOL_ACQUIRE_TIMEOUT_MS, query_timeout_ms: DIAGNOSTIC_QUERY_TIMEOUT_MS }).then((r) => r.rows),
    query_with_diagnostics<InventoryRow>(`select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY' order by tc.table_name, kcu.column_name`, [], { label: "db_diagnostic_foreign_keys", pool_acquire_timeout_ms: DIAGNOSTIC_POOL_ACQUIRE_TIMEOUT_MS, query_timeout_ms: DIAGNOSTIC_QUERY_TIMEOUT_MS }).then((r) => r.rows),
    discoverRouteInventory(),
  ]);
  return { generated_at: new Date().toISOString(), tables, views, foreign_keys, routes };
}

async function getDeepSnapshot(force = false) {
  const now = Date.now();
  const age_ms = last_successful_snapshot ? now - Date.parse(last_successful_snapshot.generated_at) : null;
  const should_refresh = force || !last_successful_snapshot || age_ms === null || age_ms > CACHE_TTL_MS;
  if (should_refresh && !refresh_promise) {
    refresh_promise = buildDeepSnapshot().then((snapshot) => {
      last_successful_snapshot = snapshot;
      last_refresh_error = null;
      return snapshot;
    }).catch((error) => {
      last_refresh_error = sanitizeError(error);
      if (last_refresh_error.code === "application_pool_saturated") recent_pool_timeout_count++;
      if (last_successful_snapshot) return last_successful_snapshot;
      throw error;
    }).finally(() => { refresh_promise = null; });
  }
  if ((force || !last_successful_snapshot) && refresh_promise) await refresh_promise;
  return { snapshot: last_successful_snapshot, age_ms: last_successful_snapshot ? Date.now() - Date.parse(last_successful_snapshot.generated_at) : null, refreshing: Boolean(refresh_promise), stale: Boolean(last_successful_snapshot && (Date.now() - Date.parse(last_successful_snapshot.generated_at) > CACHE_TTL_MS)), last_refresh_error };
}

async function buildDatabaseDiagnostic(force = false): Promise<DatabaseDiagnosticResponse> {
  const timestamp = new Date().toISOString();
  const database_url = process.env.DATABASE_URL ? "configured" : "missing";
  const pool_base = get_pool_runtime_configuration();
  let database_version: string | null = null;
  let acquisition_latency_ms: number | null = null;
  let status: DatabaseDiagnosticResponse["database_status"] = "database_connected";
  let error: DiagnosticError | undefined;

  try {
    const started = Date.now();
    const { rows } = await query_with_diagnostics<{ version: string }>(`select version() as version`, [], { label: "db_live_health", pool_acquire_timeout_ms: DIAGNOSTIC_POOL_ACQUIRE_TIMEOUT_MS, query_timeout_ms: DIAGNOSTIC_QUERY_TIMEOUT_MS });
    acquisition_latency_ms = Date.now() - started;
    database_version = String(rows[0]?.version ?? "unknown");
  } catch (err) {
    error = sanitizeError(err);
    status = error.code === "application_pool_saturated" ? "application_pool_saturated" : "database_unreachable";
    if (status === "application_pool_saturated") recent_pool_timeout_count++;
  }

  let deep;
  try { deep = await getDeepSnapshot(force); } catch (err) { last_refresh_error = sanitizeError(err); deep = { snapshot: null, age_ms: null, refreshing: false, stale: false, last_refresh_error }; }
  const snapshot = deep.snapshot;
  return {
    ok: status !== "database_unreachable",
    runtime: "active",
    database: status === "database_connected" ? "connected" : status === "application_pool_saturated" ? "pool_saturated" : "unreachable",
    database_status: status,
    application_pool_saturated: status === "application_pool_saturated",
    database_url,
    database_version,
    supabase_project: SUPABASE_PROJECT,
    public_tables: snapshot?.tables.length ?? null,
    pool: { ...pool_base, acquisition_latency_ms, recent_timeout_count: recent_pool_timeout_count },
    auth_profile_resolution: "configured",
    current_deployment_commit: process.env.RENDER_GIT_COMMIT || null,
    db_diagnostic: {
      tables: { total: snapshot?.tables.length ?? null, inventory: snapshot?.tables },
      views: { total: snapshot?.views.length ?? null, inventory: snapshot?.views },
      foreign_keys: { total: snapshot?.foreign_keys.length ?? null, inventory: snapshot?.foreign_keys },
      routes: snapshot?.routes ?? { frontend: [], backend: [] },
      errors: [error, deep.last_refresh_error].filter(Boolean) as DiagnosticError[],
      generated_at: snapshot?.generated_at ?? null,
      age_ms: deep.age_ms,
      stale: deep.stale,
      refreshing: deep.refreshing,
      last_refresh_error: deep.last_refresh_error,
    },
    ...(error ? { error } : {}),
    timestamp,
  };
}

export async function getDatabaseDiagnostic(options: { force?: boolean } = {}): Promise<DatabaseDiagnosticResponse> {
  return buildDatabaseDiagnostic(Boolean(options.force));
}

export async function sendDatabaseDiagnostic(res: Response, force = false) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const payload = await getDatabaseDiagnostic({ force });
  res.status(payload.database_status === "database_unreachable" ? 503 : 200).json(payload);
}

export const __health_diagnostics_test = {
  reset() { last_successful_snapshot = null; last_refresh_error = null; refresh_promise = null; recent_pool_timeout_count = 0; },
};
