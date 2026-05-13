import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

// ─── GitHub OAuth Types ─────────────────────────────────────────────────────
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUserInfo {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

class SDKServer {
  constructor() {
    if (!ENV.githubClientId) {
      console.error("[OAuth] GITHUB_OAUTH_CLIENT_ID is not configured!");
    }
    if (!ENV.githubClientSecret) {
      console.error("[OAuth] GITHUB_OAUTH_CLIENT_SECRET is not configured!");
    }
    console.log("[OAuth] GitHub OAuth initialized. Client ID:", ENV.githubClientId ? ENV.githubClientId.slice(0, 8) + "..." : "(missing)");
  }

  /** Exchange GitHub authorization code for access token */
  async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const { data } = await axios.post<GitHubTokenResponse>(
      "https://github.com/login/oauth/access_token",
      {
        client_id: ENV.githubClientId,
        client_secret: ENV.githubClientSecret,
        code,
      },
      {
        headers: { Accept: "application/json" },
        timeout: AXIOS_TIMEOUT_MS,
      }
    );
    if (!data.access_token) {
      throw new Error("GitHub token exchange failed: " + JSON.stringify(data));
    }
    return data;
  }

  /** Fetch GitHub user info using an access token */
  async getUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    const { data } = await axios.get<GitHubUserInfo>(
      "https://api.github.com/user",
      {
        headers: {
          Authorization: "Bearer " + accessToken,
          Accept: "application/vnd.github+json",
        },
        timeout: AXIOS_TIMEOUT_MS,
      }
    );
    if (!data.email) {
      try {
        const { data: emails } = await axios.get<Array<{ email: string; primary: boolean; verified: boolean }>>(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: "Bearer " + accessToken,
              Accept: "application/vnd.github+json",
            },
            timeout: AXIOS_TIMEOUT_MS,
          }
        );
        const primary = emails.find(e => e.primary && e.verified);
        if (primary) data.email = primary.email;
      } catch { /* email scope may not be granted */ }
    }
    return data;
  }

  // ─── Session Management ─────────────────────────────────────────────────

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      { openId, appId: ENV.appId, name: options.name || "" },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    console.log("[OPENID MAPPING] session.openId:", sessionUserId);

    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    if (user) {
      console.log("[OPENID MAPPING] Found user:", user.id, user.openId, user.email);
    } else {
      console.log("[OPENID MAPPING] User NOT found for openId:", sessionUserId);
    }

    if (!user) {
      throw ForbiddenError("User not found — please log in via GitHub");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
    return user;
  }
}

export const sdk = new SDKServer();
