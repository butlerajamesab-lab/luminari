import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import {
  getRTCProfiles,
  getRTCProfile,
  getPrecedentChain,
  getPrecedentNode,
  getStructuralBiasProfiles,
  getStructuralBiasProfile,
  getCivilGideonSummary,
} from "../civil-gideon";

export const civilGideonRouter = router({
  /** Summary statistics for the Civil Gideon module */
  summary: publicProcedure.query(() => {
    return getCivilGideonSummary();
  }),

  /** All right-to-counsel state profiles */
  rtcProfiles: publicProcedure.query(() => {
    return getRTCProfiles();
  }),

  /** Single state RTC profile */
  rtcProfile: publicProcedure
    .input(z.object({ state: z.string().length(2) }))
    .query(({ input }) => {
      return getRTCProfile(input.state) ?? null;
    }),

  /** Full precedent chain */
  precedentChain: publicProcedure.query(() => {
    return getPrecedentChain();
  }),

  /** Single precedent node */
  precedentNode: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return getPrecedentNode(input.id) ?? null;
    }),

  /** All structural bias profiles */
  biasProfiles: publicProcedure.query(() => {
    return getStructuralBiasProfiles();
  }),

  /** Single state structural bias profile */
  biasProfile: publicProcedure
    .input(z.object({ state: z.string().length(2) }))
    .query(({ input }) => {
      return getStructuralBiasProfile(input.state) ?? null;
    }),
});
