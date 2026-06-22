import type { Response } from "express";
import { getPool } from "../db";

export const SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";
const CACHE_TTL_MS = 45_000;
let cached_diagnostic: { expires_at: number; payload: DatabaseDiagnosticResponse } | null = null;

type DiagnosticError = { code: string; message: string };
export type DatabaseDiagnosticResponse = {
  ok: boolean;
  runtime: "active";
  database: "connected" | "unreachable";
  database_url: "configured" | "missing";
  database_version: string | null;
  supabase_project: string;
  public_tables: number | null;
  db_diagnostic: {
    tables: { total: number | null };
    views: { total: number | null };
    foreign_keys: { total: number | null };
    errors: DiagnosticError[];
  };
  error?: DiagnosticError;
  timestamp: string;
};

export function livenessPayload() {
  return {
    ok: true,
    runtime: "active",
    service: "luminari",
    supabase_project: SUPABASE_PROJECT,
    timestamp: new Date().toISOString(),
  } as const;
}

function sanitizeError(error: unknown): DiagnosticError {
  const message = error instanceof Error ? error.message : String(error);
  return { code: "database_unreachable", message: message.replace(/password=[^\s&]+/g, "password=***").slice(0, 500) };
}

async function count(sql_text: string): Promise<number> {
  const { rows } = await getPool().query(sql_text);
  return Number(rows[0]?.total ?? 0);
}

async function buildDatabaseDiagnostic(): Promise<DatabaseDiagnosticResponse> {
  const timestamp = new Date().toISOString();
  const database_url = process.env.DATABASE_URL ? "configured" : "missing";

  try {
    const [{ rows: version_rows }, public_tables, public_views, foreign_keys] = await Promise.all([
      getPool().query("select version() as version"),
      count("select count(*)::int as total from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"),
      count("select count(*)::int as total from information_schema.views where table_schema = 'public'"),
      count("select count(*)::int as total from information_schema.table_constraints where table_schema = 'public' and constraint_type = 'FOREIGN KEY'"),
    ]);

    return {
      ok: true,
      runtime: "active",
      database: "connected",
      database_url,
      database_version: String(version_rows[0]?.version ?? "unknown"),
      supabase_project: SUPABASE_PROJECT,
      public_tables,
      db_diagnostic: {
        tables: { total: public_tables },
        views: { total: public_views },
        foreign_keys: { total: foreign_keys },
        errors: [],
      },
      timestamp,
    };
  } catch (error) {
    const diagnostic_error = sanitizeError(error);
    return {
      ok: false,
      runtime: "active",
      database: "unreachable",
      database_url,
      database_version: null,
      supabase_project: SUPABASE_PROJECT,
      public_tables: null,
      db_diagnostic: {
        tables: { total: null },
        views: { total: null },
        foreign_keys: { total: null },
        errors: [diagnostic_error],
      },
      error: diagnostic_error,
      timestamp,
    };
  }
}

export async function getDatabaseDiagnostic(): Promise<DatabaseDiagnosticResponse> {
  const now = Date.now();
  if (cached_diagnostic && cached_diagnostic.expires_at > now) return cached_diagnostic.payload;
  const payload = await buildDatabaseDiagnostic();
  cached_diagnostic = { expires_at: now + CACHE_TTL_MS, payload };
  return payload;
}

export async function sendDatabaseDiagnostic(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const payload = await getDatabaseDiagnostic();
  res.status(payload.ok ? 200 : 503).json(payload);
}
