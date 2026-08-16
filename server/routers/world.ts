/**
 * World Router
 * Bounded current-corpus projection for web clients.
 * The complete civic-object universe remains in Postgres; this endpoint must
 * never materialize the entire platform into one Node heap.
 */
import { router, publicProcedure } from "../_core/trpc";
import { getBoundedWorldIndex } from "../services/world-index-bounded";

export const worldRouter = router({
  getIndex: publicProcedure.query(async () => {
    return getBoundedWorldIndex();
  }),
});
