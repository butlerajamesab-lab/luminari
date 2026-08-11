import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createContext, resolve_user_for_procedure } from "./context";

function setPrivateResponseHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Vary", "Authorization, Cookie, x-lighthouse-supabase-session");
}

function classifyAuthGateError(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return typeof error;
}

function isDatabaseDiagnosticRequest(req: Request): boolean {
  return req.path === "/api/db-diagnostic" || req.originalUrl.split("?", 1)[0] === "/api/db-diagnostic";
}

function sendDatabaseDiagnosticAuthFailure(
  res: Response,
  status: 401 | 403 | 503,
  code: "authentication_required" | "administrator_required" | "authentication_temporarily_unavailable"
) {
  return res.status(status).json({
    ok: false,
    database: "unknown",
    database_url: "unknown",
    database_version: null,
    public_tables: null,
    db_diagnostic: {
      tables: { total: null },
      views: { total: null },
      foreign_keys: { total: null },
      errors: [{ code, message: code }],
    },
    supabase_project: "unknown",
    timestamp: new Date().toISOString(),
    error: { code, message: code },
    diagnostic_state: "auth_gate_failed",
  });
}

export const requireExpressAdmin: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  setPrivateResponseHeaders(res);

  try {
    const ctx = await createContext({ req, res });
    const user = await resolve_user_for_procedure(ctx);

    if (!user) {
      if (isDatabaseDiagnosticRequest(req)) {
        return sendDatabaseDiagnosticAuthFailure(res, 401, "authentication_required");
      }
      return res.status(401).json({
        ok: false,
        error: "authentication_required",
      });
    }

    if (user.role !== "admin") {
      if (isDatabaseDiagnosticRequest(req)) {
        return sendDatabaseDiagnosticAuthFailure(res, 403, "administrator_required");
      }
      return res.status(403).json({
        ok: false,
        error: "administrator_required",
      });
    }

    res.locals.runtime_user = user;
    return next();
  } catch (error) {
    console.warn("[SECURITY] express_admin_gate_failed", {
      method: req.method,
      path: req.path,
      error_class: classifyAuthGateError(error),
    });
    if (isDatabaseDiagnosticRequest(req)) {
      return sendDatabaseDiagnosticAuthFailure(res, 503, "authentication_temporarily_unavailable");
    }
    return res.status(503).json({
      ok: false,
      error: "authentication_temporarily_unavailable",
    });
  }
};
