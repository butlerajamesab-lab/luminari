export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = (returnTo?: string) => {
  const params = new URLSearchParams({ interactive: "1" });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("redirect", returnTo);
  }
  return `/login?${params.toString()}`;
};
