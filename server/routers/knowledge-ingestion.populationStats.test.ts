import { describe, expect, it } from "vitest";
import { buildKnowledgePopulationStats, knowledgeBackboneTableList } from "./knowledge-ingestion";

describe("knowledgeIngestion populationStats", () => {
  it("limits count query concurrency to four and preserves table order", async () => {
    let active = 0;
    let maxActive = 0;
    const response = await buildKnowledgePopulationStats(async (tableName) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return knowledgeBackboneTableList.findIndex((table) => table.name === tableName) + 1;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
    expect(response.tables.map((table) => table.name)).toEqual(knowledgeBackboneTableList.map((table) => table.name));
  });

  it("isolates a table failure and returns both snake_case and camelCase summary fields", async () => {
    const failingTable = knowledgeBackboneTableList[2].name;
    const response = await buildKnowledgePopulationStats(async (tableName) => {
      if (tableName === failingTable) throw new Error("missing table");
      return 10;
    });

    expect(response.tables[2]).toMatchObject({ name: failingTable, count: 0, coverage: 0 });
    expect(response.summary.overallCoverage).toBe(response.summary.overall_coverage);
    expect(response.summary.criticallyLow).toEqual(response.summary.critically_low);
    expect(response.summary.underPopulated).toEqual(response.summary.under_populated);
  });
});
