/**
 * lighthouse/operations.ts
 *
 * Read-only operational observability endpoints for canonical Lighthouse intake telemetry.
 * The database view performs all aggregation and freshness/health classification.
 */
import { router, publicProcedure } from "../../_core/trpc.js";
import { getLiveIntakeOperations } from "../../services/lighthouseClient.js";

export const lighthouseOperationsRouter = router({
  /** Stream-level Live Intake Operations panel state. */
  liveIntakeOperations: publicProcedure.query(async () => {
    const operations = await getLiveIntakeOperations();
    return {
      operations,
      count: operations.length,
      critical_count: operations.filter((row) =>
        row.health_classification === "stalled" || row.health_classification === "quarantined"
      ).length,
    };
  }),
});
