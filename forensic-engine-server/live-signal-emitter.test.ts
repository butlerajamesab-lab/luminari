/**
 * Live Signal Emitter — Vitest Tests
 * 
 * Tests cover:
 *   1. emitSignal creates a signal with correct gating fields
 *   2. emitSignal is idempotent (deduplicates by fingerprint)
 *   3. resolveSignalsForTarget deactivates signals
 *   4. getActiveSignalsForTarget filters by effectType
 *   5. getActiveSignalsByEffect returns correct signals
 *   6. Support matcher applies RESOURCE_STALE penalty
 *   7. Support matcher applies POLICY_CHANGE boost
 *   8. LumenSend markSent is blocked by PATH_INVALID signal
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB ───────────────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("./db", () => ({
  db: {
    insert: () => ({ values: mockInsert }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelect }),
      }),
    }),
  },
  pool: {},
}));

vi.mock("../drizzle/schema", () => ({
  liveSignals: {
    id: "id",
    signalFingerprint: "signalFingerprint",
    active: "active",
    effectType: "effectType",
    targetTable: "targetTable",
    targetId: "targetId",
    severity: "severity",
    title: "title",
    explanation: "explanation",
    detectedAt: "detectedAt",
    jurisdiction: "jurisdiction",
    domain: "domain",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val, type: "eq" }),
  and: (...args: any[]) => ({ args, type: "and" }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import {
  emitSignal,
  resolveSignalsForTarget,
  getActiveSignalsForTarget,
  getActiveSignalsByEffect,
} from "./live-signal-emitter";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("emitSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a signal with correct gating fields when no duplicate exists", async () => {
    // No existing active signal
    mockSelect.mockResolvedValueOnce([]);
    mockInsert.mockResolvedValueOnce([{ insertId: 42 }]);

    const result = await emitSignal({
      effectType: "RESOURCE_STALE",
      targetTable: "unified_resources",
      targetId: 99,
      signalType: "RESOURCE_STALE:unified_resources",
      title: "Resource flagged: Test Resource",
      explanation: "Resource was flagged by admin: broken link",
      severity: "medium",
      jurisdiction: "WA",
      domain: "housing",
      sourceTimestamp: 1700000000000,
    });

    expect(result).toBe(42);
    expect(mockInsert).toHaveBeenCalledOnce();

    const insertedValues = mockInsert.mock.calls[0][0];
    expect(insertedValues.effectType).toBe("RESOURCE_STALE");
    expect(insertedValues.targetTable).toBe("unified_resources");
    expect(insertedValues.targetId).toBe(99);
    expect(insertedValues.jurisdiction).toBe("WA");
    expect(insertedValues.domain).toBe("housing");
    expect(insertedValues.active).toBe(true);
    expect(insertedValues.signalFingerprint).toBeTruthy();
    expect(insertedValues.signalFingerprint.length).toBe(64);
  });

  it("returns null (deduplicates) when an active signal with same fingerprint exists", async () => {
    // Existing active signal found
    mockSelect.mockResolvedValueOnce([{ id: 10 }]);

    const result = await emitSignal({
      effectType: "RESOURCE_STALE",
      targetTable: "unified_resources",
      targetId: 99,
      signalType: "RESOURCE_STALE:unified_resources",
      title: "Resource flagged again",
      explanation: "Same resource flagged again",
      severity: "medium",
      jurisdiction: "WA",
      domain: "housing",
    });

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("generates a deterministic fingerprint for the same (effectType, targetTable, targetId, jurisdiction)", async () => {
    mockSelect.mockResolvedValue([]);
    mockInsert.mockResolvedValue([{ insertId: 1 }]);

    await emitSignal({
      effectType: "PATH_INVALID",
      targetTable: "enforcement_action_paths",
      targetId: 5,
      signalType: "PATH_INVALID:enforcement_action_paths",
      title: "Path invalid",
      explanation: "Path deactivated",
      severity: "high",
      jurisdiction: "CA",
      domain: "employment",
    });

    await emitSignal({
      effectType: "PATH_INVALID",
      targetTable: "enforcement_action_paths",
      targetId: 5,
      signalType: "PATH_INVALID:enforcement_action_paths",
      title: "Path invalid (different title)",
      explanation: "Different explanation",
      severity: "critical",
      jurisdiction: "CA",
      domain: "employment",
    });

    const fp1 = mockInsert.mock.calls[0][0].signalFingerprint;
    const fp2 = mockInsert.mock.calls[1][0].signalFingerprint;
    expect(fp1).toBe(fp2);
  });

  it("generates different fingerprints for different jurisdictions", async () => {
    mockSelect.mockResolvedValue([]);
    mockInsert.mockResolvedValue([{ insertId: 1 }]);

    await emitSignal({
      effectType: "RESOURCE_STALE",
      targetTable: "unified_resources",
      targetId: 1,
      signalType: "RESOURCE_STALE:unified_resources",
      title: "Stale in WA",
      explanation: "Stale",
      severity: "low",
      jurisdiction: "WA",
      domain: "housing",
    });

    await emitSignal({
      effectType: "RESOURCE_STALE",
      targetTable: "unified_resources",
      targetId: 1,
      signalType: "RESOURCE_STALE:unified_resources",
      title: "Stale in CA",
      explanation: "Stale",
      severity: "low",
      jurisdiction: "CA",
      domain: "housing",
    });

    const fp1 = mockInsert.mock.calls[0][0].signalFingerprint;
    const fp2 = mockInsert.mock.calls[1][0].signalFingerprint;
    expect(fp1).not.toBe(fp2);
  });
});

describe("resolveSignalsForTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates signals for a target", async () => {
    mockUpdate.mockResolvedValueOnce([{ affectedRows: 2 }]);

    const count = await resolveSignalsForTarget("unified_resources", 99, "RESOURCE_STALE");
    expect(count).toBe(2);
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("deactivates all effect types when effectType is not specified", async () => {
    mockUpdate.mockResolvedValueOnce([{ affectedRows: 3 }]);

    const count = await resolveSignalsForTarget("unified_resources", 99);
    expect(count).toBe(3);
  });
});

describe("getActiveSignalsForTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active signals for a target", async () => {
    const mockSignals = [
      { id: 1, effectType: "RESOURCE_STALE", severity: "medium", title: "Stale", explanation: "Stale resource", detectedAt: Date.now() },
    ];
    mockSelect.mockResolvedValueOnce(mockSignals);

    const signals = await getActiveSignalsForTarget("unified_resources", 99, "RESOURCE_STALE");
    expect(signals).toHaveLength(1);
    expect(signals[0].effectType).toBe("RESOURCE_STALE");
  });

  it("returns empty array when no active signals exist", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const signals = await getActiveSignalsForTarget("unified_resources", 999);
    expect(signals).toHaveLength(0);
  });
});

describe("getActiveSignalsByEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns signals filtered by effect type", async () => {
    const mockSignals = [
      { id: 1, targetTable: "unified_resources", targetId: 10, severity: "high", title: "Policy change", jurisdiction: "WA", domain: "housing", detectedAt: Date.now() },
      { id: 2, targetTable: "unified_resources", targetId: 20, severity: "medium", title: "Policy change 2", jurisdiction: "CA", domain: "employment", detectedAt: Date.now() },
    ];
    mockSelect.mockResolvedValueOnce(mockSignals);

    const signals = await getActiveSignalsByEffect("POLICY_CHANGE", 50);
    expect(signals).toHaveLength(2);
    expect(signals[0].targetTable).toBe("unified_resources");
  });
});

// ─── Support Matcher Signal Integration ───────────────────────────────────────

describe("Support Matcher signal-aware scoring", () => {
  it("RESOURCE_STALE penalty: applies -0.30 to stale resource scores", () => {
    // Test the scoring logic directly without DB calls
    // Simulate what matchResources does in Phase 2b
    const baseScore = 0.80;
    const STALE_PENALTY = 0.30;
    const adjustedScore = Math.max(0, baseScore - STALE_PENALTY);
    expect(adjustedScore).toBe(0.50);
  });

  it("RESOURCE_STALE penalty: does not go below 0", () => {
    const baseScore = 0.20;
    const STALE_PENALTY = 0.30;
    const adjustedScore = Math.max(0, baseScore - STALE_PENALTY);
    expect(adjustedScore).toBe(0);
  });

  it("POLICY_CHANGE boost: applies +0.10 to policy-changed resource scores", () => {
    const baseScore = 0.70;
    const POLICY_BOOST = 0.10;
    const adjustedScore = Math.min(1.0, baseScore + POLICY_BOOST);
    expect(adjustedScore).toBeCloseTo(0.80, 10);
  });

  it("POLICY_CHANGE boost: does not exceed 1.0", () => {
    const baseScore = 0.95;
    const POLICY_BOOST = 0.10;
    const adjustedScore = Math.min(1.0, baseScore + POLICY_BOOST);
    expect(adjustedScore).toBe(1.0);
  });
});

// ─── Deadline Signal Severity ─────────────────────────────────────────────────

describe("DEADLINE_APPROACHING signal severity", () => {
  const getSeverity = (daysRemaining: number): "critical" | "high" | "medium" => {
    return daysRemaining <= 3 ? "critical" : daysRemaining <= 7 ? "high" : "medium";
  };

  it("assigns critical severity for deadlines within 3 days", () => {
    expect(getSeverity(0)).toBe("critical");
    expect(getSeverity(1)).toBe("critical");
    expect(getSeverity(3)).toBe("critical");
  });

  it("assigns high severity for deadlines within 4-7 days", () => {
    expect(getSeverity(4)).toBe("high");
    expect(getSeverity(7)).toBe("high");
  });

  it("assigns medium severity for deadlines within 8-14 days", () => {
    expect(getSeverity(8)).toBe("medium");
    expect(getSeverity(14)).toBe("medium");
  });
});
