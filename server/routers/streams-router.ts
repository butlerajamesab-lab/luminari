/**
 * Streams Router — tRPC surface retained after the Gate A removal
 * (2026-11-19).
 *
 * The Lobbying, Verified User Reports, Advocacy, and Cross-Stream
 * Correlation procedure groups were removed with their Mission Control
 * panels (Gate A). The Litigation and Administrative Decisions groups
 * were also removed EXCEPT the three read procedures below, which are
 * still referenced by the kept Outcomes panel
 * (client/src/components/mission/OutcomesPanel.tsx) and are therefore
 * retained deliberately.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

import {
  getCaseOutcomeBreakdown,
} from "../streams/litigation-stream";

import {
  getAdminDecisionStats,
  getOutcomesByAgency,
} from "../streams/admin-decisions-stream";

export const streamsRouter = router({
  // ── Federal Litigation (retained: Outcomes panel) ───────────────
  litigationOutcomes: protectedProcedure
    .query(async () => getCaseOutcomeBreakdown()),

  // ── Administrative Decisions (retained: Outcomes panel) ─────────
  adminDecisionsStats: protectedProcedure
    .query(async () => getAdminDecisionStats()),

  adminDecisionsOutcomesByAgency: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getOutcomesByAgency(input?.limit)),
});
