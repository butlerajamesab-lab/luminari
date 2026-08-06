import { trpc } from "@/lib/trpc";
import { getAuthenticatedRequestHeaders } from "@/lib/session-token";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { initializeValidationSession } from "./_core/validation-session";
import { ClickToReadProvider } from "./contexts/ClickToReadContext";
import { CivicGenomeRosettaProgressControl } from "./components/CivicGenomeRosettaProgressControl";
import "./index.css";

// Initialize validation session for /intake and /case/:id routes
initializeValidationSession().catch(console.error);

function is_non_retryable_runtime_error(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    "timeout exceeded when trying to connect",
    "pool acquire timed out",
    "pool is saturated",
    "application_pool_saturated",
    "request timed out",
  ].some(fragment => message.includes(fragment));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on cancel errors or auth errors
        if (error instanceof TRPCClientError) {
          if (error.message === UNAUTHED_ERR_MSG) return false;
          if (error.message?.includes('cancel')) return false;
        }
        // Replaying database saturation multiplies pressure on the same pool
        // and keeps read-only screens in a misleading loading state. Surface
        // the first bounded failure and let the user retry deliberately.
        if (is_non_retryable_runtime_error(error)) return false;
        return failureCount < 2;
      },
      staleTime: 10000,
    },
    mutations: {
      retry: false,
    },
  },
});

// Suppress benign AbortError / cancel errors from crashing the app
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('cancel') || event.error?.name === 'AbortError') {
    event.preventDefault();
    console.warn('[Suppressed] Benign abort/cancel error:', event.error?.message);
  }
  // TEMPORARY: Suppress auth errors
  if (event.error?.message?.includes('UNAUTHORIZED') || event.error?.message?.includes('Unauthorized')) {
    event.preventDefault();
    console.warn('[Suppressed] Auth error:', event.error?.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason?.message?.includes('cancel') || reason?.name === 'AbortError' || reason?.message?.includes('aborted')) {
    event.preventDefault();
    console.warn('[Suppressed] Benign unhandled rejection:', reason?.message);
  }
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  // TEMPORARY: OAuth disabled - no redirects
  return;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    // Don't log cancel/abort errors as they're benign
    if (error?.message?.includes('cancel') || error?.name === 'AbortError') return;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // Don't log cancel/abort errors as they're benign
    if (error?.message?.includes('cancel') || error?.name === 'AbortError') return;
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const headers = await getAuthenticatedRequestHeaders(init?.headers);

        if (!headers.has("x-lighthouse-supabase-session")) {
          console.warn('[AUTH] tRPC call proceeding without auth token — expect 10001 if route is protected');
        }

        const request_url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
        const bounded_runtime_read = request_url.includes("civicGenome.")
          || request_url.includes("uploadSessions.getActive");
        if (!bounded_runtime_read) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            headers,
            credentials: "include",
          });
        }

        const controller = new AbortController();
        const upstream_signal = init?.signal;
        const forward_abort = () => controller.abort(upstream_signal?.reason);
        if (upstream_signal?.aborted) forward_abort();
        else upstream_signal?.addEventListener("abort", forward_abort, { once: true });
        const timeout = setTimeout(() => {
          controller.abort(new Error("Lighthouse request timed out after 12000ms"));
        }, 12_000);

        try {
          return await globalThis.fetch(input, {
            ...(init ?? {}),
            headers,
            credentials: "include",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
          upstream_signal?.removeEventListener("abort", forward_abort);
        }
      },
    }),
  ],
});

function AppWithProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <ClickToReadProvider>
          <App />
          <CivicGenomeRosettaProgressControl />
        </ClickToReadProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
