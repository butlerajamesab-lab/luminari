import { describe, expect, it } from "vitest";
import {
  SPINE_EXCLUDED_RUNTIME_TABLES,
  SPINE_STATIC_CIVIC_TABLE_SET,
  assert_static_spine_table,
} from "./spine-static-table-policy";

describe("Sovereign Spine static civic data policy", () => {
  it("includes governed public knowledge and configuration tables", () => {
    for (const table of [
      "engine_registry",
      "registry_programs",
      "legal_statutes",
      "doctrine_registry",
      "workflow_definitions",
      "unified_resources",
    ]) {
      expect(SPINE_STATIC_CIVIC_TABLE_SET.has(table)).toBe(true);
      expect(assert_static_spine_table(table)).toBe(table);
    }
  });

  it("excludes case, user, generated strategy, calculation, and outcome runtime", () => {
    for (const table of SPINE_EXCLUDED_RUNTIME_TABLES) {
      expect(SPINE_STATIC_CIVIC_TABLE_SET.has(table)).toBe(false);
      expect(() => assert_static_spine_table(table)).toThrow(
        "outside the static civic Spine policy",
      );
    }
  });

  it("specifically blocks the live case-bearing tables found in the audit", () => {
    for (const table of [
      "procedural_outputs",
      "remedy_paths",
      "strategy_paths",
      "settlement_calculations",
      "strategy_viability_assessment",
      "investigative_queries",
      "outcome_registry",
      "outcome_metrics",
    ]) {
      expect(SPINE_STATIC_CIVIC_TABLE_SET.has(table)).toBe(false);
    }
  });
});
