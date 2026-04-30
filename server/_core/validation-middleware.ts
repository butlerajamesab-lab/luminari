import type { Request, Response, NextFunction } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";

/**
 * Validation Route Middleware
 * 
 * Intercepts requests to /intake and /case/:id routes and:
 * 1. Creates a validation session token
 * 2. Sets it as a cookie
 * 3. Allows the request to proceed WITHOUT any OAuth checks
 * 
 * This runs BEFORE any other auth middleware.
 */

function isValidationRoute(pathname: string): boolean {
  return pathname.startsWith('/intake') || pathname.startsWith('/case/');
}

export async function validationRouteMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Only apply to validation routes
  if (!isValidationRoute(req.path)) {
    return next();
  }

  // Only apply if bypass is enabled
  if (process.env.TEMP_AUTH_BYPASS !== 'true') {
    return next();
  }

  // Check if user already has a valid session
  const existingCookie = req.cookies?.[COOKIE_NAME];
  if (existingCookie) {
    try {
      const session = await sdk.verifySession(existingCookie);
      if (session) {
        console.log('[Validation] Valid session found, proceeding');
        return next();
      }
    } catch (error) {
      console.log('[Validation] Existing session invalid, creating new one');
    }
  } else {
    console.log('[Validation] No existing session cookie found');
  }

  // Create a new validation session token
  try {
    console.log('[Validation] Creating session for route:', req.path);
    const validationToken = await sdk.createSessionToken('validation-user-001', {
      name: 'Validation User',
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, validationToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    console.log('[Validation] Session cookie set, proceeding to route');
  } catch (error) {
    console.error('[Validation] Failed to create session:', error);
    return res.status(500).json({ error: 'Failed to create validation session' });
  }

  next();
}
