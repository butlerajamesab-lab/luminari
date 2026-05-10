import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { initializeValidationSession } from "./_core/validation-session";
import { ClickToReadProvider } from "./contexts/ClickToReadContext";
import "./index.css";

// Initialize validation session for /intake and /case/:id routes
initializeValidationSession().catch(console.error);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on cancel errors or auth errors
        if (error instanceof TRPCClientError) {
          if (error.message === UNAUTHED_ERR_MSG) return false;
          if (error.message?.includes('cancel')) return false;
        }
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
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
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
        </ClickToReadProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
