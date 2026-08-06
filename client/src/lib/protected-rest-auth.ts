import { getAuthenticatedRequestHeaders } from "@/lib/session-token";

const PROTECTED_REST_PREFIXES = [
  "/api/executor",
  "/api/system",
  "/api/atlas",
  "/api/ingestion-control",
] as const;

let installed = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isProtectedSameOriginRequest(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(requestUrl(input), window.location.origin);
  if (url.origin !== window.location.origin) return false;
  return PROTECTED_REST_PREFIXES.some(
    prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

export function installProtectedRestAuthTransport(): void {
  if (installed || typeof window === "undefined") return;

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    if (!isProtectedSameOriginRequest(input)) {
      return nativeFetch(input, init);
    }

    const requestHeaders = input instanceof Request ? input.headers : undefined;
    const headers = await getAuthenticatedRequestHeaders(
      init.headers ?? requestHeaders,
    );

    if (input instanceof Request) {
      return nativeFetch(
        new Request(input, {
          ...init,
          headers,
          credentials: init.credentials ?? input.credentials ?? "include",
        }),
      );
    }

    return nativeFetch(input, {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
    });
  };

  installed = true;
}

export const protectedRestPrefixes = PROTECTED_REST_PREFIXES;
