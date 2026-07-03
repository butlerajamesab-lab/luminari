# Profile lookup timeout root cause

## Execution path

1. An HTTP request reaches the tRPC Express adapter and `createContext` in `server/_core/context.ts` runs once for the request context.
2. `createContext` extracts a forwarded Supabase bearer token from `x-lighthouse-supabase-session` or `Authorization`.
3. `resolveSupabaseAuthUser` calls Supabase Auth REST `/auth/v1/user` and logs `supabase_auth_fetch_succeeded` when the JWT is valid.
4. `resolveProfileFromSupabaseAuthUser` resolves the runtime profile. The authoritative lookup key is the Supabase user id mapped to `public.users.open_id`; email lookup is only used when Supabase does not return an id.
5. `get_user_by_open_id_snake` in `server/_core/user-resolver.ts` checks the process user cache, then runs the SQL label `profile_open_id_lookup`.
6. `query_with_diagnostics` in `server/db.ts` acquires a client from the canonical `pg` pool, runs the profile query, releases the client, and records pool wait/acquisition/query timings.
7. `createContext` exposes both `ctx.user` and `ctx.auth`. If profile lookup fails or times out, the Supabase identity remains in `ctx.auth` with `auth_status: "authenticated_profile_unresolved"` and `profile_resolution_status: "timed_out"` or `"threw"`.
8. Downstream routers consume `ctx.user` for operations that require a runtime profile; profile-aware authorization continues to reject where required, while code that only needs the authenticated Supabase identity can inspect `ctx.auth`.

## Root cause

The observed `profile_open_id_lookup pool acquire timed out after 250ms` value originated in `server/_core/user-resolver.ts` as the default `CONTEXT_PROFILE_POOL_ACQUIRE_TIMEOUT_MS` fallback. It was not inherited from the global PostgreSQL pool. The canonical pool is initialized in `server/db.ts` with:

- pool max: `5`
- connection timeout: `10000ms`
- idle timeout: `30000ms`
- max uses: `7500`
- statement timeout: no pool-level statement timeout configured
- query timeout: per-query, default `10000ms`, with profile queries using `CONTEXT_PROFILE_QUERY_TIMEOUT_MS`

The previous 250ms acquire budget was therefore an extra profile-specific micro-timeout. It could fire while the outer context/request budget still had time left, producing repeated profile lookup timeout telemetry after successful Supabase Auth validation.

## Why repeated failures occurred

There was already a process-level user cache and an in-flight dedupe map in `server/_core/user-cache.ts`, but failed lookups were not cached and the context layer did not retain a request-scoped profile resolution result. If the same request path, tRPC batch, or nested context creation asked for the same profile again after the first timeout settled, the process cache had no successful user to return and a new pool acquisition could be attempted.

The context resolver also allowed a second database lookup path by email after an open-id miss. Since Supabase `id` is the stable profile key for `open_id`, that fallback could create extra work in a single authenticated request.

## Permanent fix

- The profile pool-acquire fallback is now `1000ms`, aligned with the default context DB phase budget instead of the arbitrary 250ms micro-timeout. Operators can still set `CONTEXT_PROFILE_POOL_ACQUIRE_TIMEOUT_MS` explicitly.
- `createContext` now stores profile resolution by lookup key on the Express request object. Successes, misses, timeouts, and thrown errors are all reused for the rest of that request.
- After the first timeout or failure, the request records the unresolved profile state and suppresses duplicate lookup attempts for that same Supabase identity.
- The Supabase Auth identity is preserved in `ctx.auth` even when the runtime profile is unavailable.
- Open-id lookup is authoritative when Supabase returns an id; email lookup only runs when there is no Supabase id, ensuring one authenticated request performs at most one profile lookup.
- Pool acquisition and query diagnostics now log pool wait time, acquisition time, query execution time, cache hit/miss, duplicate suppression, fallback activation, and runtime pool settings.

## Non-goals

This fix does not add silent retries, hide database errors, or increase request fan-out. It makes the timeout budget explicit, records the failed profile state, and prevents repeated pool acquisition attempts during the same request.
