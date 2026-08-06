import type { Request, Response } from "express";
import { createContext, require_resolved_user } from "./context";
import type { RuntimeUser } from "./user-resolver";

/**
 * Supabase-aware authentication for non-tRPC Express routes.
 * This intentionally shares the same resolver used by protected procedures,
 * while retaining the legacy-session fallback handled by createContext.
 */
export async function authenticate_request_user(
  req: Request,
  res: Response,
): Promise<RuntimeUser> {
  const context = await createContext({ req, res });
  return require_resolved_user(context);
}

export const authenticateRequestUser = authenticate_request_user;
