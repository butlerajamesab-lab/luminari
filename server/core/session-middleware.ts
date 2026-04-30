import type { Request, Response, NextFunction } from "express";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./sdk";

/**
 * Session Middleware
 * 
 * Reads the session cookie, verifies it, and populates req.session
 * This runs BEFORE tRPC context creation to ensure proper user identification
 */

export function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract session cookie using the correct cookie name
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);

  if (!sessionCookie) {
    (req as any).session = null;
    next();
    return;
  }

  // Verify session token (async operation)
  sdk.verifySession(sessionCookie)
    .then((session) => {
      if (!session) {
        console.log("[SessionMiddleware] Session verification failed");
        (req as any).session = null;
        next();
        return;
      }

      // Populate req.session with verified data
      (req as any).session = {
        openId: session.openId,
        appId: session.appId,
        name: session.name,
        user: {
          email: null, // Will be populated by context.ts
        },
      };

      console.log("[SessionMiddleware] Session verified:", {
        openId: session.openId,
        name: session.name,
      });

      next();
    })
    .catch((error) => {
      console.error("[SessionMiddleware] Error:", error);
      (req as any).session = null;
      next();
    });
}

/**
 * Parse cookies from header
 */
function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.split("=");
    if (name && value) {
      cookies.set(name.trim(), decodeURIComponent(value.trim()));
    }
  });

  return cookies;
}
