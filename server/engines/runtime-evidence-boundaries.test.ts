import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, insert } = vi.hoisted(() => ({ execute: vi.fn(), insert: vi.fn() }));
vi.mock("../db", () => ({ db: { execute, insert } }));

// Gate A removal (2026-11-19): the harm-index, harm-map, and
// crisis-prediction cases were removed together with their engines
// and Mission Control panels. The risk-forecast engine remains
// (Gate B) and its boundary case is retained below.
import { getRiskForecastSummary } from "./risk-forecast-service";

beforeEach(() => {
  execute.mockReset();
  insert.mockReset();
});

describe("Runtime evidence boundaries", () => {
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
});
