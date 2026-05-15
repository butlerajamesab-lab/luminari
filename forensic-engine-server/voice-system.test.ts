/**
 * Voice System Tests
 *
 * Tests the voiceAdapter and narrativeSynthesis layers.
 * These are pure functions (no DB, no tRPC) so they can run in vitest directly.
 */

import { describe, it, expect } from "vitest";

// ─── Import synthesis functions (pure, no side effects) ───
// We test the synthesis layer directly since it's pure TypeScript.
// The adapter layer requires tRPC client mocking, so we test its types and contracts.

import {
  synthesizeCaseNarration,
  synthesizeSignalNarration,
  synthesizePatternNarration,
} from "../client/src/lib/voice/narrativeSynthesis";

import type {
  CaseNarrationInput,
  SignalNarrationInput,
  PatternNarrationInput,
} from "../client/src/lib/voice/voiceAdapter";

// ─── Test Data Factories ───

function makeCaseInput(overrides: Partial<CaseNarrationInput> = {}): CaseNarrationInput {
  return {
    status: "ready",
    case: {
      id: 7,
      title: "Test Case Alpha",
      clientName: "Jane Doe",
      opposingParty: "Agency X",
      status: "active",
      priority: "high",
      filingDate: "2025-03-15",
      domain: "benefits_denial",
      description: "Test case for voice system.",
    },
    signals: [
      { id: 1, severity: "high", component: "document_analysis", description: "Missing required form.", trend: null },
      { id: 2, severity: "medium", component: "timeline", description: "Gap in records from Jan to Mar.", trend: "increasing" },
    ],
    patterns: [
      { id: 1, description: "Repeated denial pattern across 3 agencies.", confidence: 0.85, implication: "Systemic issue.", recommendation: "File consolidated complaint." },
    ],
    deadlines: [
      { description: "SOL for administrative appeal", date: "2026-06-15" },
    ],
    claimsSummary: { total: 20, findingEligible: 5, signalOnly: 15 },
    snapshot: { id: 1, status: "complete" },
    ...overrides,
  };
}

function makeSignalInput(overrides: Partial<SignalNarrationInput> = {}): SignalNarrationInput {
  return {
    status: "ready",
    signal: {
      id: 42,
      severity: "critical",
      component: "evidence_chain",
      description: "Document chain broken between pages 12 and 15.",
      trend: "stable",
    },
    ...overrides,
  };
}

function makePatternInput(overrides: Partial<PatternNarrationInput> = {}): PatternNarrationInput {
  return {
    status: "ready",
    pattern: {
      id: 3,
      description: "Agency delayed response by 45+ days in 4 of 5 requests.",
      confidence: 0.92,
      implication: "Pattern suggests systemic delay.",
      recommendation: "Escalate to oversight body.",
    },
    ...overrides,
  };
}

// ─── Case Narration Tests ───

describe("Case Narration Synthesis", () => {
  it("produces narrated output for ready case data", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    expect(result.status).toBe("narrated");
    expect(result.dataStatus).toBe("ready");
    expect(result.text).toContain("Test Case Alpha");
    expect(result.text).toContain("End of readout.");
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it("includes case overview section with all provided fields", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const overview = result.sections.find((s) => s.label === "Case Overview");
    expect(overview).toBeDefined();
    expect(overview!.text).toContain("Test Case Alpha");
    expect(overview!.text).toContain("Jane Doe");
    expect(overview!.text).toContain("Agency X");
    expect(overview!.text).toContain("benefits denial");
  });

  it("includes signal flags section when signals exist", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const signals = result.sections.find((s) => s.label === "Signal Flags");
    expect(signals).toBeDefined();
    expect(signals!.itemCount).toBe(2);
    expect(signals!.text).toContain("Missing required form");
  });

  it("includes patterns section when patterns exist", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const patterns = result.sections.find((s) => s.label === "Detected Patterns");
    expect(patterns).toBeDefined();
    expect(patterns!.text).toContain("Repeated denial pattern");
  });

  it("includes deadlines section when deadlines exist", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const deadlines = result.sections.find((s) => s.label === "Deadlines");
    expect(deadlines).toBeDefined();
    expect(deadlines!.text).toContain("SOL for administrative appeal");
  });

  it("includes evidence summary when claims exist", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const summary = result.sections.find((s) => s.label === "Evidence Summary");
    expect(summary).toBeDefined();
    expect(summary!.text).toContain("20 items total");
    expect(summary!.text).toContain("5 items classified as finding eligible");
  });

  it("includes snapshot status when snapshot exists", () => {
    const input = makeCaseInput();
    const result = synthesizeCaseNarration(input);

    const snapshot = result.sections.find((s) => s.label === "Snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot!.text).toContain("complete");
  });

  it("gates narration when status is insufficient_data", () => {
    const input = makeCaseInput({
      status: "insufficient_data",
      reason: "No signals, patterns, or findings available.",
    });
    const result = synthesizeCaseNarration(input);

    expect(result.status).toBe("gated");
    expect(result.text).toContain("Narration unavailable");
    expect(result.sections).toHaveLength(0);
  });

  it("gates narration for partial_data by default", () => {
    const input = makeCaseInput({
      status: "partial_data",
      reason: "Missing: patterns.",
    });
    const result = synthesizeCaseNarration(input);

    expect(result.status).toBe("gated");
    expect(result.text).toContain("Narration limited");
  });

  it("allows narration for partial_data when allowPartial is true", () => {
    const input = makeCaseInput({
      status: "partial_data",
      reason: "Missing: patterns.",
    });
    const result = synthesizeCaseNarration(input, { allowPartial: true });

    expect(result.status).toBe("narrated");
    expect(result.text).toContain("Test Case Alpha");
  });

  it("omits sections for empty data arrays", () => {
    const input = makeCaseInput({
      signals: [],
      patterns: [],
      deadlines: [],
      claimsSummary: { total: 0, findingEligible: 0, signalOnly: 0 },
      snapshot: null,
    });
    // Override status to ready (normally adapter would set insufficient_data)
    input.status = "ready";
    const result = synthesizeCaseNarration(input);

    expect(result.status).toBe("narrated");
    // Only Case Overview section should exist
    expect(result.sections.length).toBe(1);
    expect(result.sections[0].label).toBe("Case Overview");
  });

  it("handles null/missing optional case fields gracefully", () => {
    const input = makeCaseInput();
    input.case.clientName = null;
    input.case.opposingParty = null;
    input.case.filingDate = null;
    input.case.domain = null;
    input.case.description = null;

    const result = synthesizeCaseNarration(input);
    expect(result.status).toBe("narrated");
    expect(result.text).toContain("Test Case Alpha");
    // Should NOT contain "null" as text
    expect(result.text).not.toContain("null");
  });
});

// ─── Signal Narration Tests ───

describe("Signal Narration Synthesis", () => {
  it("produces narrated output for a ready signal", () => {
    const input = makeSignalInput();
    const result = synthesizeSignalNarration(input);

    expect(result.status).toBe("narrated");
    expect(result.text).toContain("Critical");
    expect(result.text).toContain("evidence_chain");
    expect(result.text).toContain("Document chain broken");
    expect(result.text).toContain("End of readout.");
  });

  it("includes trend when available", () => {
    const input = makeSignalInput();
    const result = synthesizeSignalNarration(input);

    expect(result.text).toContain("Trend: stable");
  });

  it("gates when signal is insufficient_data", () => {
    const input = makeSignalInput({
      status: "insufficient_data",
      reason: "Signal 99 not found.",
      signal: null,
    });
    const result = synthesizeSignalNarration(input);

    expect(result.status).toBe("gated");
    expect(result.text).toContain("Narration unavailable");
  });

  it("gates when signal object is null even if status is ready", () => {
    const input: SignalNarrationInput = {
      status: "ready",
      signal: null,
    };
    const result = synthesizeSignalNarration(input);

    expect(result.status).toBe("gated");
    expect(result.text).toContain("Signal data not available");
  });
});

// ─── Pattern Narration Tests ───

describe("Pattern Narration Synthesis", () => {
  it("produces narrated output for a ready pattern", () => {
    const input = makePatternInput();
    const result = synthesizePatternNarration(input);

    expect(result.status).toBe("narrated");
    expect(result.text).toContain("Pattern detected");
    expect(result.text).toContain("45+ days");
    expect(result.text).toContain("92 percent");
    expect(result.text).toContain("End of readout.");
  });

  it("includes implication and recommendation", () => {
    const input = makePatternInput();
    const result = synthesizePatternNarration(input);

    expect(result.text).toContain("Implication: Pattern suggests systemic delay");
    expect(result.text).toContain("Recommendation: Escalate to oversight body");
  });

  it("handles pattern with null confidence", () => {
    const input = makePatternInput();
    input.pattern!.confidence = null;
    const result = synthesizePatternNarration(input);

    expect(result.status).toBe("narrated");
    expect(result.text).not.toContain("percent");
  });

  it("gates when pattern is insufficient_data", () => {
    const input = makePatternInput({
      status: "insufficient_data",
      reason: "Pattern 99 not found.",
      pattern: null,
    });
    const result = synthesizePatternNarration(input);

    expect(result.status).toBe("gated");
  });
});

// ─── Edge Cases ───

describe("Voice System Edge Cases", () => {
  it("narration text always ends with 'End of readout.'", () => {
    const caseResult = synthesizeCaseNarration(makeCaseInput());
    const signalResult = synthesizeSignalNarration(makeSignalInput());
    const patternResult = synthesizePatternNarration(makePatternInput());

    expect(caseResult.text).toMatch(/End of readout\.$/);
    expect(signalResult.text).toMatch(/End of readout\.$/);
    expect(patternResult.text).toMatch(/End of readout\.$/);
  });

  it("narration text never contains 'undefined' or 'NaN'", () => {
    const input = makeCaseInput();
    input.case.clientName = undefined as any;
    input.case.priority = undefined as any;

    const result = synthesizeCaseNarration(input);
    expect(result.text).not.toContain("undefined");
    expect(result.text).not.toContain("NaN");
  });

  it("signal list synthesis caps at 3 per severity", () => {
    const input = makeCaseInput({
      signals: Array.from({ length: 10 }, (_, i) => ({
        id: i,
        severity: "high",
        component: `component_${i}`,
        description: `Signal ${i} description.`,
        trend: null,
      })),
    });
    const result = synthesizeCaseNarration(input);
    const signalSection = result.sections.find((s) => s.label === "Signal Flags");
    expect(signalSection).toBeDefined();
    // Should mention "additional flags not read"
    expect(signalSection!.text).toContain("additional high flags not read");
  });

  it("pattern list synthesis caps at 5", () => {
    const input = makeCaseInput({
      patterns: Array.from({ length: 8 }, (_, i) => ({
        id: i,
        description: `Pattern ${i} description.`,
        confidence: 0.7 + i * 0.03,
        implication: null,
        recommendation: null,
      })),
    });
    const result = synthesizeCaseNarration(input);
    const patternSection = result.sections.find((s) => s.label === "Detected Patterns");
    expect(patternSection).toBeDefined();
    expect(patternSection!.text).toContain("additional patterns not read");
  });

  it("gated results always have empty sections array", () => {
    const gatedCase = synthesizeCaseNarration(makeCaseInput({ status: "insufficient_data" }));
    const gatedSignal = synthesizeSignalNarration(makeSignalInput({ status: "insufficient_data", signal: null }));
    const gatedPattern = synthesizePatternNarration(makePatternInput({ status: "insufficient_data", pattern: null }));

    expect(gatedCase.sections).toHaveLength(0);
    expect(gatedSignal.sections).toHaveLength(0);
    expect(gatedPattern.sections).toHaveLength(0);
  });
});
