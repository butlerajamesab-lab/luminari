import { describe, it, expect } from "vitest";

describe("GitHub OAuth Frontend Configuration", () => {
  it("should have VITE_GITHUB_OAUTH_CLIENT_ID environment variable set", () => {
    const clientId = process.env.VITE_GITHUB_OAUTH_CLIENT_ID;
    expect(clientId).toBeTruthy();
    expect(typeof clientId).toBe("string");
    expect(clientId?.length).toBeGreaterThan(0);
  });

  it("should generate valid GitHub OAuth URL", () => {
    const clientId = process.env.VITE_GITHUB_OAUTH_CLIENT_ID;
    const redirectUri = "https://luminari.onrender.com/api/oauth/callback";

    if (!clientId) {
      throw new Error("VITE_GITHUB_OAUTH_CLIENT_ID not configured");
    }

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", btoa(redirectUri));

    const urlString = url.toString();
    expect(urlString).toContain("https://github.com/login/oauth/authorize");
    expect(urlString).toContain(`client_id=${clientId}`);
    expect(urlString).toContain("redirect_uri=https%3A%2F%2Fluminari.onrender.com%2Fapi%2Foauth%2Fcallback");
    expect(urlString).toContain("scope=user%3Aemail");
  });

  it("should have both backend and frontend GitHub OAuth credentials", () => {
    const backendClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const backendClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    const frontendClientId = process.env.VITE_GITHUB_OAUTH_CLIENT_ID;

    expect(backendClientId).toBeTruthy();
    expect(backendClientSecret).toBeTruthy();
    expect(frontendClientId).toBeTruthy();

    // Frontend and backend should use the same client ID
    expect(frontendClientId).toBe(backendClientId);
  });
});
