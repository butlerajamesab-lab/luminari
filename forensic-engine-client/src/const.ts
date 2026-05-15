export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate GitHub OAuth login URL at runtime
// Redirect URI reflects the current origin for proper callback handling
export const getLoginUrl = () => {
  const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  
  if (!clientId) {
    console.error("[GitHub OAuth] VITE_GITHUB_OAUTH_CLIENT_ID is not configured");
    return "";
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", btoa(redirectUri));

  return url.toString();
};
