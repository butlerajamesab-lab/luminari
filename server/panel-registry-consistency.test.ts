import { describe, expect, it } from "vitest";
import { PANEL_REGISTRY as CLIENT_PANEL_REGISTRY } from "../client/src/lib/panelRegistry";
import { PANEL_REGISTRY as SERVER_PANEL_REGISTRY } from "./panelRegistry";

/**
 * Registry consistency for the 8 panels salvaged by the 2026-11-19
 * 38-panel audit. They are deterministic rules libraries over populated
 * stores, so both registries must label them WIRED_WITH_DATA (never
 * WIRED_LLM / layer LLM) and must agree with each other field-for-field.
 *
 * Scope is deliberately limited to the salvaged 8: other panels (e.g.
 * Gate B) carry pre-existing client/server divergences that are
 * separate decisions.
 */
const SALVAGED_PANELS = [
  "procedural-paths",
  "claim-validation",
  "remedy-feasibility",
  "evidence-lab",
  "remedy-templates",
  "reform-proposals",
  "strategy-paths",
  "export-readiness",
] as const;

describe("panel registry consistency — salvaged rules libraries", () => {
  it("registers all 8 salvaged panels in both registries", () => {
    for (const key of SALVAGED_PANELS) {
      expect(CLIENT_PANEL_REGISTRY[key], `client registry missing ${key}`).toBeDefined();
      expect(SERVER_PANEL_REGISTRY[key], `server registry missing ${key}`).toBeDefined();
    }
  });

  it("labels all 8 WIRED_WITH_DATA with no LLM layer in both registries", () => {
    for (const key of SALVAGED_PANELS) {
      for (const [name, registry] of [
        ["client", CLIENT_PANEL_REGISTRY],
        ["server", SERVER_PANEL_REGISTRY],
      ] as const) {
        expect(registry[key].viability, `${name} ${key} viability`).toBe("WIRED_WITH_DATA");
        expect(registry[key].layer, `${name} ${key} layer`).not.toBe("LLM");
        expect(registry[key].enabled, `${name} ${key} enabled`).toBe(true);
      }
    }
  });

  it("keeps client and server configs identical for the salvaged 8", () => {
    for (const key of SALVAGED_PANELS) {
      expect(SERVER_PANEL_REGISTRY[key], `config drift on ${key}`).toEqual(
        CLIENT_PANEL_REGISTRY[key],
      );
    }
  });

  it("points strategy-paths at the live strategy_paths store in both registries", () => {
    for (const registry of [CLIENT_PANEL_REGISTRY, SERVER_PANEL_REGISTRY]) {
      expect(registry["strategy-paths"].dataSource).toBe("strategy_paths");
      expect(registry["strategy-paths"].canonicalTables).toContain("strategy_paths");
      expect(registry["strategy-paths"].canonicalTables).not.toContain("strategy_outputs");
    }
  });
});
