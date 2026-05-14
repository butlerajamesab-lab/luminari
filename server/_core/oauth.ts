import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { githubOAuth } from "./github-oauth";

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

  // GitHub OAuth callback
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    try {
      // Exchange code for GitHub access token
      const tokenResponse = await githubOAuth.exchangeCodeForToken(code);

      // Fetch user info from GitHub API
      const userInfo = await githubOAuth.getUserInfo(tokenResponse.access_token);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from GitHub user info" });
        return;
      }

      // Upsert user in local database
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });

      // Create session JWT
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || userInfo.login,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Decode return path from state if present
      let returnPath = "/";
      if (state) {
        try {
          const decoded = Buffer.from(state, "base64").toString("utf-8");
          // State may be a full redirect URI or just a path
          if (decoded.startsWith("/")) {
            returnPath = decoded;
          } else if (decoded.startsWith("http")) {
            const url = new URL(decoded);
            returnPath = url.pathname + url.search;
          }
        } catch {
          // Ignore malformed state, default to "/"
        }
      }

      res.redirect(302, returnPath);
    } catch (error) {
      console.error("[GitHub OAuth] Callback failed", error);
      res.status(500).json({ error: "GitHub OAuth callback failed" });
    }
  });
}
