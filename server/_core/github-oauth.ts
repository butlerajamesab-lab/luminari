/**
 * GitHub OAuth Handler
 *
 * Replaces Manus OAuth as the canonical auth layer.
 * Exchanges GitHub auth codes for access tokens,
 * fetches user info from GitHub API, and creates
 * local JWT session tokens.
 */

import axios from "axios";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_USER_EMAIL_URL = "https://api.github.com/user/emails";

export interface GitHubUserInfo {
  openId: string;       // GitHub numeric user ID as string
  name: string;
  email: string | null;
  login: string;        // GitHub username
  avatarUrl: string | null;
  loginMethod: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export class GitHubOAuthService {
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.clientId = process.env.GITHUB_OAUTH_CLIENT_ID ?? "";
    this.clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "";

    if (!this.clientId || !this.clientSecret) {
      console.warn("[GitHub OAuth] WARNING: GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET not configured");
    } else {
      console.log("[GitHub OAuth] Initialized with client ID:", this.clientId.slice(0, 8) + "...");
    }
  }

  /**
   * Build the GitHub OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "user:email read:user");
    url.searchParams.set("state", state);
    return url.toString();
  }

  /**
   * Exchange GitHub authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
    const response = await axios.post<GitHubTokenResponse>(
      GITHUB_TOKEN_URL,
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      },
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.data.access_token) {
      throw new Error("[GitHub OAuth] No access token in response");
    }

    return response.data;
  }

  /**
   * Fetch user info from GitHub API using access token
   */
  async getUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    const [userResponse, emailsResponse] = await Promise.all([
      axios.get(GITHUB_USER_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }),
      axios.get(GITHUB_USER_EMAIL_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }).catch(() => ({ data: [] })),
    ]);

    const user = userResponse.data;

    // Find primary verified email
    let email: string | null = user.email ?? null;
    if (!email && Array.isArray(emailsResponse.data)) {
      const primary = emailsResponse.data.find(
        (e: { primary: boolean; verified: boolean; email: string }) =>
          e.primary && e.verified
      );
      email = primary?.email ?? null;
    }

    return {
      openId: `github:${user.id}`,
      name: user.name || user.login,
      email,
      login: user.login,
      avatarUrl: user.avatar_url ?? null,
      loginMethod: "github",
    };
  }
}

export const githubOAuth = new GitHubOAuthService();
