import { describe, it, expect, beforeAll } from "vitest";
import { createGitHubOAuthService } from "./_core/github-oauth";

describe("GitHub OAuth Service", () => {
  let githubOAuth: ReturnType<typeof createGitHubOAuthService>;

  beforeAll(() => {
    // Verify credentials are available
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "GitHub OAuth credentials not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET."
      );
    }

    githubOAuth = createGitHubOAuthService("https://luminari.onrender.com/api/oauth/callback");
  });

  it("should initialize GitHub OAuth service with credentials", () => {
    expect(githubOAuth).toBeDefined();
    expect(process.env.GITHUB_OAUTH_CLIENT_ID).toBeTruthy();
    expect(process.env.GITHUB_OAUTH_CLIENT_SECRET).toBeTruthy();
  });

  it("should have valid GitHub OAuth endpoints", () => {
    // Verify that the service can be created and has the expected methods
    expect(githubOAuth).toHaveProperty("authenticate");
    expect(githubOAuth).toHaveProperty("exchangeCodeForToken");
    expect(githubOAuth).toHaveProperty("getUserInfo");
  });

  it("should handle missing credentials gracefully", () => {
    // Temporarily clear credentials
    const originalClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const originalClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

    try {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;

      // Should not throw during initialization
      const serviceWithoutCreds = createGitHubOAuthService("https://luminari.onrender.com/api/oauth/callback");
      expect(serviceWithoutCreds).toBeDefined();
    } finally {
      // Restore credentials
      if (originalClientId) process.env.GITHUB_OAUTH_CLIENT_ID = originalClientId;
      if (originalClientSecret) process.env.GITHUB_OAUTH_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("should have correct redirect URI format", () => {
    const redirectUri = "https://luminari.onrender.com/api/oauth/callback";
    const service = createGitHubOAuthService(redirectUri);
    expect(service).toBeDefined();
    // Service should accept the redirect URI without throwing
  });
});
