import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, insert } = vi.hoisted(() => ({ execute: vi.fn(), insert: vi.fn() }));
vi.mock("../db", () => ({ db: { execute, insert } }));

import { getHarmIndexSummary } from "./harm-index-service";
import { getRiskForecastSummary } from "./risk-forecast-service";
import { calculateCrisisProbability, generateCrisisPrediction } from "./crisis-prediction";

beforeEach(() => {
  execute.mockReset();
  insert.mockReset();
});

describe("Runtime evidence boundaries", () => {
  it("does not create harm scores from unrelated records when no stored scores exist", async () => {
    execute.mockResolvedValue([[]]);
    const result = await getHarmIndexSummary();
    expect(result.topEntities).toEqual([]);
    expect(result.materialized).toBe(false);
    expect(result.source).toBe("harm_index_entities + harm_index_scores");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("preserves the identity and result of an actual stored entity forecast", async () => {
    execute.mockResolvedValue([[{
      entity_name: "Synthetic entity",
      predicted_harm_score: "41.5",
      risk_category: "Emerging Risk",
    }]]);
    const result = await getRiskForecastSummary();
    expect(result.source).toBe("entity_risk_projection");
    expect(result.topRisks[0].entityName).toBe("Synthetic entity");
    expect(result.topRisks[0].riskForecastScore).toBe(41.5);
  });

  it("reports an unknown crisis probability when required evidence is absent", async () => {
    execute.mockResolvedValue([[{
      pattern_count: 40, avg_pressure: 100,
      signal_count: 1000, source_count: 20, high_pressure_count: 40,
    }]]);
    const result = await calculateCrisisProbability({});
    expect(result.probability).toBeNull();
    expect(result.riskLevel).toBe("unknown");
    expect(result.unresolved_inputs).toEqual(["enforcement_gap", "capture_risk", "cross_stream"]);
  });

  it("does not persist a prediction without the required inputs", async () => {
    execute.mockResolvedValue([[{ avg_pressure: 100, signal_count: 1000 }]]);
    await expect(generateCrisisPrediction({})).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(insert).not.toHaveBeenCalled();
  });
});
