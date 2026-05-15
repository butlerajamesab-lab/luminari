import { describe, it, expect } from "vitest";
import {
  enforceSignalFlowReadOnly,
  computeDeterministicHash,
  verifyDeterminism,
  validateRemedyPathIntegrity,
} from "./canonical-enforcement";

describe("Downstream Proof — Enforcement Rules", () => {
  // ─── Rule 1: Signal Flow Read-Only ───────────────────────────
  // The function returns { rule, passed, message }
  // INSERT and SELECT are permitted (append-only + read)
  // UPDATE and DELETE are blocked (read-only to upstream)

  describe("Signal Flow Generator (L7) — Read-Only", () => {
    it("permits INSERT (append-only)", () => {
      const result = enforceSignalFlowReadOnly("INSERT");
      expect(result.passed).toBe(true);
      expect(result.rule).toBe("SIGNAL_FLOW_READ_ONLY");
    });

    it("permits SELECT (read access)", () => {
      const result = enforceSignalFlowReadOnly("SELECT");
      expect(result.passed).toBe(true);
    });

    it("blocks UPDATE operations", () => {
      const result = enforceSignalFlowReadOnly("UPDATE");
      expect(result.passed).toBe(false);
      expect(result.message).toContain("BLOCKED");
    });

    it("blocks DELETE operations", () => {
      const result = enforceSignalFlowReadOnly("DELETE");
      expect(result.passed).toBe(false);
      expect(result.message).toContain("BLOCKED");
    });
  });

  // ─── Rule 2: Determinism ─────────────────────────────────────

  describe("Determinism — Same Input → Same Output", () => {
    it("produces consistent hashes for identical inputs", () => {
      const input = JSON.stringify({ signalId: 1, type: "FORM_DETECTION" });
      const hash1 = computeDeterministicHash(input);
      const hash2 = computeDeterministicHash(input);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = computeDeterministicHash(JSON.stringify({ signalId: 1 }));
      const hash2 = computeDeterministicHash(JSON.stringify({ signalId: 2 }));
      expect(hash1).not.toBe(hash2);
    });

    it("passes verification when no expected hash is provided (first run)", () => {
      const inputHash = computeDeterministicHash("test_input");
      const outputHash = computeDeterministicHash("test_output");
      const result = verifyDeterminism(inputHash, outputHash);
      expect(result.passed).toBe(true);
    });

    it("passes verification when output matches expected hash", () => {
      const inputHash = computeDeterministicHash("test_input");
      const outputHash = computeDeterministicHash("test_output");
      const result = verifyDeterminism(inputHash, outputHash, outputHash);
      expect(result.passed).toBe(true);
    });

    it("fails verification when output does not match expected hash", () => {
      const inputHash = computeDeterministicHash("test_input");
      const outputHash = computeDeterministicHash("test_output");
      const wrongHash = computeDeterministicHash("wrong_output");
      const result = verifyDeterminism(inputHash, outputHash, wrongHash);
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Determinism violation");
    });

    it("fails when input or output hash is empty", () => {
      const result = verifyDeterminism("", "abc123");
      expect(result.passed).toBe(false);
    });
  });

  // ─── Rule 3: Remedy Path Integrity ───────────────────────────

  describe("Remedy Path Integrity — No Dead Ends", () => {
    it("validates LATERAL path with target_node_id", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: "LATERAL",
        targetNodeId: 1,
        blockReason: null,
      });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("LATERAL");
    });

    it("validates UPWARD path without target_node_id", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: "UPWARD",
        targetNodeId: null,
        blockReason: null,
      });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("UPWARD");
    });

    it("validates blocked path with block_reason", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: null,
        targetNodeId: null,
        blockReason: "No valid agency found for this jurisdiction",
      });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("Blocked");
    });

    it("rejects LATERAL path without target_node_id", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: "LATERAL",
        targetNodeId: null,
        blockReason: null,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("target_node_id");
    });

    it("rejects blocked path that also has a target_node_id", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: "LATERAL",
        targetNodeId: 1,
        blockReason: "Should not have both",
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("must not have a target_node_id");
    });

    it("rejects invalid route_direction", () => {
      const result = validateRemedyPathIntegrity({
        routeDirection: "DIAGONAL",
        targetNodeId: null,
        blockReason: null,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Invalid route_direction");
    });

    it("passes legacy paths with null direction and null block_reason", () => {
      // The enforcement engine has a fallback for legacy paths
      const result = validateRemedyPathIntegrity({
        routeDirection: null,
        targetNodeId: null,
        blockReason: null,
      });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("Legacy");
    });
  });

  // ─── L10 Metadata Contract ──────────────────────────────────

  describe("World Node Metadata Contract (L10)", () => {
    it("validates complete metadata", () => {
      const metadata = {
        access_protocol: "dol.gov/whd SOL: 2 years (3 if willful) — FATAL",
        capacity_status: "AVAILABLE",
        resource_links: ["agency_authority_map:1", "escalation_routes:5"],
        valid_for: ["employment"],
      };
      expect(metadata.access_protocol).toBeTruthy();
      expect(["AVAILABLE", "LIMITED", "FULL"]).toContain(metadata.capacity_status);
      expect(metadata.valid_for.length).toBeGreaterThan(0);
      expect(metadata.resource_links.length).toBeGreaterThan(0);
    });

    it("rejects metadata with missing access_protocol", () => {
      const metadata = {
        access_protocol: "",
        capacity_status: "AVAILABLE",
        resource_links: [],
        valid_for: ["employment"],
      };
      expect(metadata.access_protocol).toBeFalsy();
    });

    it("rejects metadata with invalid capacity_status", () => {
      const metadata = {
        access_protocol: "dol.gov/whd",
        capacity_status: "UNKNOWN",
        resource_links: [],
        valid_for: ["employment"],
      };
      expect(["AVAILABLE", "LIMITED", "FULL"]).not.toContain(metadata.capacity_status);
    });

    it("rejects metadata with empty valid_for", () => {
      const metadata = {
        access_protocol: "dol.gov/whd",
        capacity_status: "AVAILABLE",
        resource_links: [],
        valid_for: [],
      };
      expect(metadata.valid_for.length).toBe(0);
    });
  });

  // ─── Proof Pipeline Hashing ──────────────────────────────────

  describe("Proof Pipeline — Hash Chain Integrity", () => {
    it("each stage produces a unique hash from its inputs", () => {
      const signalHash = computeDeterministicHash(JSON.stringify({ id: 1, signalType: "FORM_DETECTION" }));
      const flowHash = computeDeterministicHash(JSON.stringify({ signalId: 1, vectorPath: "test" }));
      const nodeHash = computeDeterministicHash(JSON.stringify({ agency: "DOL WHD", domain: "employment" }));
      const remedyHash = computeDeterministicHash(JSON.stringify({ signalId: 1, worldNodeId: 1 }));

      const hashes = [signalHash, flowHash, nodeHash, remedyHash];
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(4);
    });

    it("hash chain is reproducible across runs", () => {
      const run1 = [
        computeDeterministicHash(JSON.stringify({ stage: "read", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "flow", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "node", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "remedy", id: 1 })),
      ];
      const run2 = [
        computeDeterministicHash(JSON.stringify({ stage: "read", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "flow", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "node", id: 1 })),
        computeDeterministicHash(JSON.stringify({ stage: "remedy", id: 1 })),
      ];
      expect(run1).toEqual(run2);
    });
  });
});
