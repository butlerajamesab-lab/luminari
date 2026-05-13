import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // ─── GitHub OAuth: Initiate login ─────────────────────────────────────
  // Redirects the user to GitHub's authorization page.
  app.get("/api/auth/github", (_req: Request, res: Response) => {
    if (!ENV.githubClientId) {
      res.status(500).json({ error: "GITHUB_OAUTH_CLIENT_ID not configured" });
      return;
    }
    const proto = _req.get("x-forwarded-proto") || _req.protocol;
    const redirectUri = `${proto}://${_req.get("host")}/api/oauth/callback`;
    const params = new URLSearchParams({
      client_id: ENV.githubClientId,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
    });
    res.redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // ─── GitHub OAuth: Callback ───────────────────────────────────────────
  // GitHub redirects here with ?code=... after user authorizes.
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    if (!code) {
      res.status(400).json({ error: "Missing authorization code from GitHub" });
      return;
    }
    try {
      // Exchange code for access token
      const tokenResponse = await sdk.exchangeCodeForToken(code);

      // Fetch GitHub user info
      const ghUser = await sdk.getUserInfo(tokenResponse.access_token);

      if (!ghUser.id) {
        res.status(400).json({ error: "GitHub user ID missing" });
        return;
      }

      // Use GitHub numeric ID as the openId (stable, unique)
      const openId = `github-${ghUser.id}`;

      // Upsert user in database
      await db.upsertUser({
        openId,
        name: ghUser.name || ghUser.login,
        email: ghUser.email ?? null,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });

      // Create session JWT and set cookie
      const sessionToken = await sdk.createSessionToken(openId, {
        name: ghUser.name || ghUser.login,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] GitHub callback failed:", error);
      res.status(500).json({ error: "GitHub OAuth callback failed" });
    }
  });

  // ─── Auth status check ────────────────────────────────────────────────
  app.get("/api/auth/status", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ authenticated: true, user: { name: user.name, email: user.email, role: user.role } });
    } catch {
      res.json({ authenticated: false, user: null });
    }
  });

  // ─── Logout ───────────────────────────────────────────────────────────
  app.get("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME);
    res.redirect(302, "/");
  });

  // ─── Legacy: Validation session bypass (kept for testing) ─────────────
  app.get("/api/validation-session", async (req: Request, res: Response) => {
    if (process.env.TEMP_AUTH_BYPASS !== "true") {
      res.status(403).json({ error: "Validation bypass not enabled" });
      return;
    }
    try {
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
}
