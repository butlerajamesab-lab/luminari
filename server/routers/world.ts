/**
 * World Router
 * Single tRPC endpoint that returns the unified World Index.
 * No filtering logic here — consumers filter client-side.
 */
import { router, publicProcedure } from "../_core/trpc";
import { getWorldIndex } from "../services/world-index";

export const worldRouter = router({
  getIndex: publicProcedure.query(async () => {
    return await getWorldIndex();
  }),
});
