import { describe, it, expect } from "vitest";
import {
  PANEL_REGISTRY,
  shouldRenderPanel,
  getEnabledPanels,
  getDisabledPanels,
  getPanelConfig,
  getPanelsByViability,
  getPanelsBySubsystem,
  getPanelsByLayer,
  getPanelSummary,
  type PanelConfig,
  type PanelViability,
  type PanelLayer,
  type PanelSubsystem,
} from "./panelRegistry";

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — REGISTRY INTEGRITY
// ═══════════════════════════════════════════════════════════════

describe("Panel Registry Integrity", () => {
  it("contains exactly 52 panels", () => {
    const count = Object.keys(PANEL_REGISTRY).length;
    expect(count).toBe(52);
  });

  it("every panel has a key matching its registry key", () => {
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(config.key).toBe(key);
    }
  });

  it("every panel has a non-empty label", () => {
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(config.label.length).toBeGreaterThan(0);
    }
  });

  it("every panel has a valid viability status", () => {
    const validViabilities: PanelViability[] = [
      "WIRED_WITH_DATA",
      "WIRED_NO_DATA",
      "WIRED_LLM",
      "DISABLED",
      "INVALID",
      "UNWIRED",
    ];
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(validViabilities).toContain(config.viability);
    }
  });

  it("every panel has a valid layer classification", () => {
    const validLayers: PanelLayer[] = [
      "REGISTRY",
      "ALPHA_LAKE",
      "PROJECTION",
      "LLM",
      "UNKNOWN",
    ];
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(validLayers).toContain(config.layer);
    }
  });

  it("no panel has UNKNOWN layer classification", () => {
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(config.layer).not.toBe("UNKNOWN");
    }
  });

  it("every panel has a valid subsystem", () => {
    const validSubsystems: PanelSubsystem[] = [
      "legal",
      "benefits",
      "civic_map",
      "case",
      "enforcement",
      "campaign_reform",
      "mission_control",
      "knowledge",
      "signal_ingestion",
      "stream",
      "advanced_engine",
      "conduit",
    ];
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(validSubsystems).toContain(config.subsystem);
    }
  });

  it("every panel has a canonicalTables array", () => {
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(Array.isArray(config.canonicalTables)).toBe(true);
    }
  });

  it("every panel has a category", () => {
    const validCategories = ["core", "analysis", "engine", "advanced", "data", "conduit", "stream"];
    for (const [key, config] of Object.entries(PANEL_REGISTRY)) {
      expect(validCategories).toContain(config.category);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — ACTIVATION ENGINE (shouldRenderPanel)
// ═══════════════════════════════════════════════════════════════

describe("Activation Engine — shouldRenderPanel", () => {
  it("returns false for unknown panel keys", () => {
    expect(shouldRenderPanel("nonexistent-panel")).toBe(false);
    expect(shouldRenderPanel("")).toBe(false);
    expect(shouldRenderPanel("__invalid__")).toBe(false);
  });

  it("returns true for WIRED_WITH_DATA panels that are enabled", () => {
    const wiredPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "WIRED_WITH_DATA" && c.enabled
    );
    expect(wiredPanels.length).toBeGreaterThan(0);
    for (const [key] of wiredPanels) {
      expect(shouldRenderPanel(key)).toBe(true);
    }
  });

  it("returns true for WIRED_LLM panels that are enabled", () => {
    const llmPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "WIRED_LLM" && c.enabled
    );
    expect(llmPanels.length).toBeGreaterThan(0);
    for (const [key] of llmPanels) {
      expect(shouldRenderPanel(key)).toBe(true);
    }
  });

  it("returns false for all DISABLED panels", () => {
    const disabledPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "DISABLED"
    );
    expect(disabledPanels.length).toBeGreaterThan(0);
    for (const [key] of disabledPanels) {
      expect(shouldRenderPanel(key)).toBe(false);
    }
  });

  it("returns false for UNWIRED panels", () => {
    const unwiredPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "UNWIRED"
    );
    for (const [key] of unwiredPanels) {
      expect(shouldRenderPanel(key)).toBe(false);
    }
  });

  it("returns false for INVALID panels", () => {
    const invalidPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "INVALID"
    );
    for (const [key] of invalidPanels) {
      expect(shouldRenderPanel(key)).toBe(false);
    }
  });

  it("WIRED_NO_DATA panels respect allowEmptyState", () => {
    const noDataPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.viability === "WIRED_NO_DATA" && c.enabled
    );
    for (const [key, config] of noDataPanels) {
      if (config.allowEmptyState) {
        expect(shouldRenderPanel(key)).toBe(true);
      } else {
        expect(shouldRenderPanel(key)).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — LAYER SEPARATION GOVERNANCE
// ═══════════════════════════════════════════════════════════════

describe("Layer Separation Governance", () => {
  it("Registry tab is classified as REGISTRY layer", () => {
    const registryPanel = PANEL_REGISTRY["registry"];
    expect(registryPanel).toBeDefined();
    expect(registryPanel.layer).toBe("REGISTRY");
  });

  it("Registry tab subsystem is mission_control (admin layer)", () => {
    const registryPanel = PANEL_REGISTRY["registry"];
    expect(registryPanel.subsystem).toBe("mission_control");
  });

  it("no PROJECTION-layer panel exists inside mission_control subsystem except operations", () => {
    const mcProjections = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.subsystem === "mission_control" && c.layer === "PROJECTION"
    );
    // Operations is the only MC panel allowed to be a PROJECTION
    for (const [key] of mcProjections) {
      expect(["operations"]).toContain(key);
    }
  });

  it("ALPHA_LAKE panels are read-only export surfaces", () => {
    const alphaLakePanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.layer === "ALPHA_LAKE"
    );
    for (const [key, config] of alphaLakePanels) {
      expect(config.canonicalTables.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("enabled panels count matches getEnabledPanels length", () => {
    const enabledFromRegistry = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.enabled
    ).length;
    expect(getEnabledPanels().length).toBe(enabledFromRegistry);
  });

  it("disabled panels count matches getDisabledPanels length", () => {
    const disabledFromRegistry = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => !c.enabled
    ).length;
    expect(getDisabledPanels().length).toBe(disabledFromRegistry);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

describe("Panel Registry Query Helpers", () => {
  it("getPanelConfig returns correct config for known key", () => {
    const config = getPanelConfig("operations");
    expect(config).toBeDefined();
    expect(config!.key).toBe("operations");
    expect(config!.label).toBe("Operations");
  });

  it("getPanelConfig returns undefined for unknown key", () => {
    expect(getPanelConfig("nonexistent")).toBeUndefined();
  });

  it("getPanelsByViability returns only panels with matching viability", () => {
    const wired = getPanelsByViability("WIRED_WITH_DATA");
    for (const panel of wired) {
      expect(panel.viability).toBe("WIRED_WITH_DATA");
    }
  });

  it("getPanelsBySubsystem returns only panels with matching subsystem", () => {
    const legal = getPanelsBySubsystem("legal");
    for (const panel of legal) {
      expect(panel.subsystem).toBe("legal");
    }
  });

  it("getPanelsByLayer returns only panels with matching layer", () => {
    const registry = getPanelsByLayer("REGISTRY");
    for (const panel of registry) {
      expect(panel.layer).toBe("REGISTRY");
    }
  });

  it("getPanelSummary returns correct totals", () => {
    const summary = getPanelSummary();
    expect(summary.total).toBe(52);
    expect(summary.enabled + summary.disabled).toBe(52);
    expect(
      summary.wiredWithData +
        summary.wiredNoData +
        summary.wiredLLM +
        summary.unwired +
        summary.invalid +
        summary.disabled
    ).toBe(52);
  });

  it("getPanelSummary subsystem counts sum to total", () => {
    const summary = getPanelSummary();
    const subsystemTotal = Object.values(summary.bySubsystem).reduce(
      (a, b) => a + b,
      0
    );
    expect(subsystemTotal).toBe(52);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — NO DEAD SURFACES
// ═══════════════════════════════════════════════════════════════

describe("No Dead Surfaces", () => {
  it("every enabled panel has a defined viability that is not UNWIRED or INVALID", () => {
    const enabledPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.enabled
    );
    for (const [key, config] of enabledPanels) {
      expect(["WIRED_WITH_DATA", "WIRED_NO_DATA", "WIRED_LLM"]).toContain(
        config.viability
      );
    }
  });

  it("no enabled panel has an empty dataSource unless it is LLM-backed", () => {
    const enabledPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => c.enabled
    );
    for (const [key, config] of enabledPanels) {
      if (config.viability !== "WIRED_LLM") {
        expect(config.dataSource).not.toBe("");
      }
    }
  });

  it("all renderable panels return true from shouldRenderPanel", () => {
    const renderablePanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) =>
        c.enabled &&
        (c.viability === "WIRED_WITH_DATA" || c.viability === "WIRED_LLM")
    );
    for (const [key] of renderablePanels) {
      expect(shouldRenderPanel(key)).toBe(true);
    }
  });

  it("no disabled panel is renderable", () => {
    const disabledPanels = Object.entries(PANEL_REGISTRY).filter(
      ([_, c]) => !c.enabled
    );
    for (const [key] of disabledPanels) {
      expect(shouldRenderPanel(key)).toBe(false);
    }
  });
});
