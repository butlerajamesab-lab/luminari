import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createContext, resolve_user_for_procedure } from "./context";

/**
 * Invite-only gate for the whole API while Lighthouse is being built.
 *
 * Off unless LIGHTHOUSE_INVITE_ONLY is exactly "true". When on, every /api
 * request needs a signed-in user whose role is in LIGHTHOUSE_INVITE_ONLY_ROLES
 * (comma-separated, default "admin"). Invite redemption sets a user's role, so
 * an invite with a listed target_role is what lets someone in.
 *
 * Left open: liveness checks, the invite redemption route, the OAuth stub,
 * the Stripe webhook (signature-verified on its own), and the tRPC session
 * lookup (auth.me) plus logout, so the sign-in page can work.
 * Turning the env off restores the previous behavior exactly.
 */
const OPEN_PATHS = new Set([
  "/api/health",
  "/api/runtime-build",
  "/api/stripe/webhook",
]);
const OPEN_PREFIXES = ["/api/invites/", "/api/oauth/"];
const OPEN_TRPC_PROCEDURES = new Set(["auth.me", "auth.logout"]);

export function invite_only_enabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.LIGHTHOUSE_INVITE_ONLY === "true";
}

export function invite_only_roles(environment: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = environment.LIGHTHOUSE_INVITE_ONLY_ROLES?.trim() || "admin";
  return new Set(raw.split(",").map(role => role.trim()).filter(Boolean));
}

/** tRPC procedure names in a (possibly batched) /api/trpc/<a,b,c> path. */
export function trpc_procedures(pathname: string): string[] {
  const rest = pathname.slice("/api/trpc/".length);
  if (!pathname.startsWith("/api/trpc/") || !rest) return [];
  return decodeURIComponent(rest).split(",").map(name => name.trim()).filter(Boolean);
}

export function is_open_path(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return true; // the SPA shell itself; data comes only through /api
  if (OPEN_PATHS.has(pathname)) return true;
  if (OPEN_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  const procedures = trpc_procedures(pathname);
  return procedures.length > 0 && procedures.every(name => OPEN_TRPC_PROCEDURES.has(name));
}

export const invite_only_gate: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!invite_only_enabled()) return next();
  const pathname = req.originalUrl.split("?", 1)[0];
  if (is_open_path(pathname)) return next();

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const ctx = await createContext({ req, res } as any);
    const user = await resolve_user_for_procedure(ctx);
    if (!user) return res.status(401).json({ ok: false, error: "invite_only_sign_in_required" });
    if (!invite_only_roles().has(String(user.role))) {
      return res.status(403).json({ ok: false, error: "invite_only_not_invited" });
    }
    return next();
  } catch (error) {
    console.warn("[SECURITY] invite_only_gate_failed", {
      method: req.method,
      path: pathname,
      error_class: error instanceof Error ? error.name.slice(0, 80) : typeof error,
    });
    return res.status(503).json({ ok: false, error: "authentication_temporarily_unavailable" });
  }
};
