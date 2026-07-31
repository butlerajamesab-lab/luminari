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
      return res.status(401).json({
        ok: false,
        error: "authentication_required",
      });
    }

    if (user.role !== "admin") {
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
    return res.status(503).json({
      ok: false,
      error: "authentication_temporarily_unavailable",
    });
  }
};
