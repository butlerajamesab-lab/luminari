import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { createGitHubOAuthService } from "./github-oauth";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Validation routes bypass - for /intake and /case/:id testing
  app.get("/api/validation-session", async (req: Request, res: Response) => {
    if (process.env.TEMP_AUTH_BYPASS !== "true") {
      res.status(403).json({ error: "Validation bypass not enabled" });
      return;
    }

    try {
      // Create a temporary validation session token
      const validationToken = await sdk.createSessionToken("validation-user-001", {
        name: "Validation User",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, validationToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, message: "Validation session created" });
    } catch (error) {
      console.error("[OAuth] Validation session creation failed", error);
      res.status(500).json({ error: "Failed to create validation session" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const error = getQueryParam(req, "error");
    const errorDescription = getQueryParam(req, "error_description");

    // Handle GitHub OAuth errors
    if (error) {
      console.error("[GitHub OAuth] Authorization error:", error, errorDescription);
      res.status(400).json({ error: `GitHub OAuth error: ${error}`, description: errorDescription });
      return;
    }

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    try {
      // Get the redirect URI from the request
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/oauth/callback`;

      // Initialize GitHub OAuth service
      const githubOAuth = createGitHubOAuthService(redirectUri);

      // Authenticate with GitHub
      const userInfo = await githubOAuth.authenticate(code);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from GitHub user info" });
        return;
      }

      // Upsert user into database
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? null,
        lastSignedIn: new Date(),
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || userInfo.login || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log("[GitHub OAuth] Successfully authenticated user:", userInfo.login);
      res.redirect(302, "/");
    } catch (error) {
      console.error("[GitHub OAuth] Callback failed", error);
      res.status(500).json({ error: "GitHub OAuth callback failed", details: String(error) });
    }
  });
}
