/**
 * World Router
 * Single tRPC endpoint that returns the unified World Index.
 * No filtering logic here — consumers filter client-side.
 */
import { router, publicProcedure } from "../_core/trpc";
import { get_cached_world_index } from "../services/world-index-cache";

export const worldRouter = router({
  getIndex: publicProcedure.query(async () => {
    return get_cached_world_index();
  }),
});
