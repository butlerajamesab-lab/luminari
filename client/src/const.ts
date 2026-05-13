export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL — redirects to GitHub OAuth via our server endpoint.
export const getLoginUrl = (_returnTo?: string) => {
  return "/api/auth/github";
};
