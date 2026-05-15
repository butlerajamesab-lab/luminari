/**
 * Build a safe `from` query parameter value from the current location.
 * Strips any existing `from` param to prevent recursive nesting.
 * Works with wouter's useLocation which returns [pathname, setLocation].
 */
export function buildFromParam(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("from");

  const search = params.toString();
  return search
    ? `${window.location.pathname}?${search}`
    : window.location.pathname;
}

/**
 * Read the `from` query parameter from the current URL.
 * Returns null if not present or not a safe internal path.
 */
export function getFromParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  if (from && from.startsWith("/")) {
    return from;
  }
  return null;
}
