export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = (returnTo?: string) => {
  const params = new URLSearchParams({ interactive: "1" });
  const currentPath = typeof window === "undefined"
    ? undefined
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const requestedPath = returnTo ?? currentPath;
  if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
    params.set("redirect", requestedPath);
  }
  return `/login?${params.toString()}`;
};
