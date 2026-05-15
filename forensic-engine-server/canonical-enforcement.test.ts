import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Canonical Enforcement Rules — Vitest Suite
 *
 * Tests the 4 mandatory enforcement rules from the Implementation Package:
 * 1. Signal Flow Generator is read-only (cannot write upstream)
 * 2. No dead ends (every detected_signal must produce ≥1 remedy_path OR block_reason)
 * 3. World node validation (metadata contract enforcement)
 * 4. Determinism (same input → same output, no randomness)
 */

// Import the enforcement functions
import {
  enforceSignalFlowReadOnly,
  validateWorldNodeMetadata,
  validateRemedyPathIntegrity,
  computeDeterministicHash,
  verifyDeterminism,
} from "./canonical-enforcement";

// ─── Rule 1: Signal Flow Generator is Read-Only ───

describe("Rule 1: Signal Flow Generator — Read-Only", () => {
  it("allows INSERT (append-only write path)", () => {
    const result = enforceSignalFlowReadOnly("INSERT");
    expect(result.passed).toBe(true);
  });

  it("rejects UPDATE operations on signal_flow_logs", () => {
    const result = enforceSignalFlowReadOnly("UPDATE");
    expect(result.passed).toBe(false);
  });

  it("rejects DELETE operations on signal_flow_logs", () => {
    const result = enforceSignalFlowReadOnly("DELETE");
    expect(result.passed).toBe(false);
  });

  it("allows SELECT operations on signal_flow_logs", () => {
    const result = enforceSignalFlowReadOnly("SELECT");
    expect(result.passed).toBe(true);
  });
});

// ─── Rule 3: World Node Validation (L10 Metadata Contract) ───

describe("Rule 3: World Node Validation — L10 Metadata Contract", () => {
  it("passes with valid metadata", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "https",
      capacity_status: "AVAILABLE",
      resource_links: ["ref-001"],
      valid_for: ["ontology.term.housing"],
    });
    expect(result.passed).toBe(true);
  });

  it("rejects missing access_protocol", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "",
      capacity_status: "AVAILABLE",
      resource_links: [],
      valid_for: ["ontology.term.housing"],
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("access_protocol");
  });

  it("rejects invalid capacity_status", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "https",
      capacity_status: "UNKNOWN" as any,
      resource_links: [],
      valid_for: ["ontology.term.housing"],
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("capacity_status");
  });

  it("rejects empty valid_for array", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "https",
      capacity_status: "AVAILABLE",
      resource_links: [],
      valid_for: [],
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("valid_for");
  });

  it("accepts LIMITED capacity_status", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "api-v2",
      capacity_status: "LIMITED",
      resource_links: ["link-a", "link-b"],
      valid_for: ["ontology.term.employment"],
    });
    expect(result.passed).toBe(true);
  });

  it("accepts FULL capacity_status", () => {
    const result = validateWorldNodeMetadata({
      access_protocol: "internal",
      capacity_status: "FULL",
      resource_links: [],
      valid_for: ["ontology.term.disability"],
    });
    expect(result.passed).toBe(true);
  });
});

// ─── Remedy Path Integrity Check ───

describe("Remedy Path Integrity — Constraint Validation", () => {
  it("passes LATERAL with target_node_id and no block_reason", () => {
    const result = validateRemedyPathIntegrity({
      routeDirection: "LATERAL",
      targetNodeId: 42,
      blockReason: null,
    });
    expect(result.passed).toBe(true);
  });

  it("passes UPWARD with no target_node_id and no block_reason", () => {
    const result = validateRemedyPathIntegrity({
      routeDirection: "UPWARD",
      targetNodeId: null,
      blockReason: null,
    });
    expect(result.passed).toBe(true);
  });

  it("passes blocked path with block_reason and no target_node_id", () => {
    const result = validateRemedyPathIntegrity({
      routeDirection: null,
      targetNodeId: null,
      blockReason: "Jurisdiction mismatch",
    });
    expect(result.passed).toBe(true);
  });

  it("rejects LATERAL without target_node_id", () => {
    const result = validateRemedyPathIntegrity({
      routeDirection: "LATERAL",
      targetNodeId: null,
      blockReason: null,
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("LATERAL");
  });

  it("rejects block_reason with target_node_id (contradictory)", () => {
    const result = validateRemedyPathIntegrity({
      routeDirection: null,
      targetNodeId: 42,
      blockReason: "Some reason",
    });
    expect(result.passed).toBe(false);
  });
});

// ─── Rule 4: Determinism ───

describe("Rule 4: Determinism — Same Input → Same Output", () => {
  it("produces identical hash for identical input", () => {
    const input = { datasetId: "ds-001", sourceRecordId: "rec-123" };
    const hash1 = computeDeterministicHash(input);
    const hash2 = computeDeterministicHash(input);
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different input", () => {
    const hash1 = computeDeterministicHash({ datasetId: "ds-001", sourceRecordId: "rec-123" });
    const hash2 = computeDeterministicHash({ datasetId: "ds-001", sourceRecordId: "rec-456" });
    expect(hash1).not.toBe(hash2);
  });

  it("hash is order-independent for object keys", () => {
    const hash1 = computeDeterministicHash({ a: 1, b: 2 });
    const hash2 = computeDeterministicHash({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("verifyDeterminism passes when hashes match", () => {
    const input = { datasetId: "ds-001", sourceRecordId: "rec-123" };
    const hash = computeDeterministicHash(input);
    const result = verifyDeterminism(hash, hash);
    expect(result.passed).toBe(true);
  });

  it("verifyDeterminism fails when expected hash doesn't match", () => {
    const input = { datasetId: "ds-001", sourceRecordId: "rec-123" };
    const hash = computeDeterministicHash(input);
    const result = verifyDeterminism(hash, "actual-output-hash", "expected-different-hash");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Determinism violation");
  });
});
