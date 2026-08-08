import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { engineRunsCanonical } from "./engine-runs-schema";

describe("engine_runs canonical schema adapter", () => {
  it("maps every owned property to the production snake_case column", () => {
    const columns = getTableColumns(engineRunsCanonical);
    const names = Object.fromEntries(
      Object.entries(columns).map(([property, column]) => [property, column.name]),
    );

    expect(names).toEqual({
      id: "id",
      runId: "run_id",
      caseId: "case_id",
      engineId: "engine_id",
      userId: "user_id",
      runType: "engine_run_type",
      runStatus: "engine_run_status",
      status: "status",
      currentStage: "current_stage",
      stageResults: "stage_results",
      outputRefs: "output_refs",
      snapshotId: "snapshot_id",
      viabilityRunId: "viability_run_id",
      strategyMatterProfileId: "strategy_matter_profile_id",
      assemblyPacketId: "assembly_packet_id",
      patternAggregationRunId: "pattern_aggregation_run_id",
      errorMessage: "error_message",
      startedAt: "started_at",
      completedAt: "completed_at",
      createdAt: "created_at",
    });
  });
});
