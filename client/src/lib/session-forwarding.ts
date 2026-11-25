/**
 * Which plain fetch() calls carry the signed-in session header.
 *
 * The whole /api surface sits behind the invite-only gate, so every
 * same-origin /api request forwards the session, exactly as tRPC already
 * does. The token is never attached to another origin.
 */
export function should_forward_session(input: RequestInfo | URL, origin: string): boolean {
  let url: URL;
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    url = new URL(raw, origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  const pathname = url.pathname.replace(/\/{2,}/g, "/").toLowerCase();
  return pathname === "/api" || pathname.startsWith("/api/");
}
