import type { QueryClient } from "@tanstack/react-query";

/**
 * Removes data owned by the departing session without asking active queries to
 * refetch after authentication has already been removed.
 *
 * QueryClient.clear() removes cache entries, but QueryObserver instances can
 * retain their last result until React renders again. Reset each query first so
 * subscribed views synchronously stop exposing the previous session's data.
 * Calling Query.reset() also cancels in-flight work and, unlike resetQueries(),
 * does not automatically refetch active queries.
 */
export function clearPrivateQueryCache(queryClient: QueryClient): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    query.reset();
  }

  queryClient.clear();
}
