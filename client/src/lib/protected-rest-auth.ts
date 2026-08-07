import { getAuthenticatedRequestHeaders } from "@/lib/session-token";

const PROTECTED_REST_PREFIXES = [
  "/api/executor",
  "/api/system",
  "/api/atlas",
  "/api/ingestion-control",
  "/api/upload",
  "/api/cases",
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

function isPrivateDocumentBridgeUrl(value: string): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(value, window.location.origin);
  return (
    url.origin === window.location.origin &&
    /^\/api\/cases\/\d+\/documents\/file$/.test(url.pathname)
  );
}

function filenameFromAnchor(anchor: HTMLAnchorElement): string {
  const explicit = anchor.getAttribute("download")?.trim();
  if (explicit) return explicit;
  return "evidence-source";
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

  document.addEventListener(
    "click",
    event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isPrivateDocumentBridgeUrl(anchor.href)) return;

      event.preventDefault();
      event.stopPropagation();

      const shouldDownload = anchor.hasAttribute("download");
      const previewWindow = shouldDownload ? null : window.open("about:blank", "_blank");

      void (async () => {
        try {
          const headers = await getAuthenticatedRequestHeaders();
          const response = await nativeFetch(anchor.href, {
            method: "GET",
            headers,
            credentials: "include",
            redirect: "follow",
          });
          if (!response.ok) {
            throw new Error(`Evidence source request failed with HTTP ${response.status}`);
          }

          const blob = await response.blob();
          if (blob.size === 0) {
            throw new Error("Evidence source response was empty");
          }

          const objectUrl = URL.createObjectURL(blob);
          if (shouldDownload) {
            const downloadAnchor = document.createElement("a");
            downloadAnchor.href = objectUrl;
            downloadAnchor.download = filenameFromAnchor(anchor);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            document.body.removeChild(downloadAnchor);
          } else if (previewWindow) {
            previewWindow.location.href = objectUrl;
          } else {
            const fallbackAnchor = document.createElement("a");
            fallbackAnchor.href = objectUrl;
            fallbackAnchor.download = filenameFromAnchor(anchor);
            document.body.appendChild(fallbackAnchor);
            fallbackAnchor.click();
            document.body.removeChild(fallbackAnchor);
          }

          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (error) {
          previewWindow?.close();
          console.error("[EVIDENCE] Private source retrieval failed", error);
        }
      })();
    },
    true,
  );

  installed = true;
}

export const protectedRestPrefixes = PROTECTED_REST_PREFIXES;
