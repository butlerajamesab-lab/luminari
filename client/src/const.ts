export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate GitHub OAuth login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (returnTo?: string) => {
  const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID || "";
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Encode return path in state so callback can redirect back after login
  const statePath = returnTo || "/";
  const state = btoa(statePath);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email read:user");
  url.searchParams.set("state", state);

  return url.toString();
};
