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
 * the Stripe webhook (signature-verified on its own), the agent entrance
 * (token-verified on its own), and the tRPC session lookup (auth.me) plus
 * logout, so the sign-in page can work. The entrance procedures
 * (entrance.getMine/setMine/searchAgencies) are open on the same standing as
 * auth.bootstrap: each is authenticatedProcedure, so a signed-in user of any
 * role can complete their entrance while the fortification is on, and a
 * signed-out caller is still refused by tRPC itself.
 * Turning the env off restores the previous behavior exactly.
 */
const OPEN_PATHS = new Set([
  "/api/health",
  "/api/runtime-build",
  "/api/stripe/webhook",
]);
const OPEN_PREFIXES = ["/api/invites/", "/api/oauth/", "/api/agents/"];
// Invite onboarding needs these before the invite grants a role:
// InviteLanding validates the token, bootstrap creates the signed-in profile.
const OPEN_TRPC_PROCEDURES = new Set([
  "auth.me",
  "auth.logout",
  "auth.bootstrap",
  "invites.validate",
  "entrance.getMine",
  "entrance.setMine",
  "entrance.searchAgencies",
]);
// is_open_path classifies on the normalized (lowercased) path, the same
// shape Express dispatches on, so membership is checked case-insensitively.
const OPEN_TRPC_PROCEDURES_LOWER = new Set(
  [...OPEN_TRPC_PROCEDURES].map(name => name.toLowerCase()),
);

export function invite_only_enabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.LIGHTHOUSE_INVITE_ONLY === "true";
}

export function invite_only_roles(environment: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = environment.LIGHTHOUSE_INVITE_ONLY_ROLES?.trim() || "admin";
  return new Set(raw.split(",").map(role => role.trim()).filter(Boolean));
}

/** tRPC procedure names in a (possibly batched) /api/trpc/<a,b,c> path. */
export function trpc_procedures(pathname: string): string[] {
  const path = normalize_path(pathname);
  const rest = path.slice("/api/trpc/".length);
  if (!path.startsWith("/api/trpc/") || !rest) return [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return ["<malformed>"]; // never matches the open list, so it stays gated
  }
  return decoded.split(",").map(name => name.trim()).filter(Boolean);
}

/**
 * Express routing is case-insensitive and tolerant of repeated slashes, so
 * classify on the same shape it dispatches on (/API//trpc reaches /api/trpc).
 */
export function normalize_path(pathname: string): string {
  return pathname.replace(/\/{2,}/g, "/").toLowerCase();
}

export function is_open_path(raw_pathname: string): boolean {
  const pathname = normalize_path(raw_pathname);
  if (!pathname.startsWith("/api/") && pathname !== "/api") return true; // the SPA shell itself; data comes only through /api
  if (OPEN_PATHS.has(pathname)) return true;
  if (OPEN_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  const procedures = trpc_procedures(pathname);
  return procedures.length > 0 && procedures.every(name => OPEN_TRPC_PROCEDURES_LOWER.has(name));
}

export const invite_only_gate: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!invite_only_enabled()) return next();
  const pathname = req.originalUrl.split("?", 1)[0];
  try {
    if (is_open_path(pathname)) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
