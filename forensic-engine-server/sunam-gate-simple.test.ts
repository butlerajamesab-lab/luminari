/**
 * Test: Sunam Gate (Simple) — Verification
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "./db";
import { signalFlags, signalRegistry } from "../drizzle/schema";
import { runSunamGate } from "./sunam-gate-simple";
import { eq } from "drizzle-orm";

describe("Sunam Gate (Simple) — Verification", () => {
  const UNIQUE_TEST_ID = Math.floor(Math.random() * 1000000);
  let testCaseId = 100000 + UNIQUE_TEST_ID;
  let testDocumentId = 200000 + UNIQUE_TEST_ID;
  let testQuoteId = 300000 + UNIQUE_TEST_ID;
  let testSnapshotId = 400000 + UNIQUE_TEST_ID;
  let createdSignalIds: number[] = [];

  let gateResults: any[] = [];

  beforeAll(async () => {
    // Create 5 test signals
    const testSignals = [
      {
        caseId: testCaseId,
        documentId: testDocumentId,
        flagType: `contradiction_${UNIQUE_TEST_ID}`,
        description: "Timeline contradiction detected between witness statements",
        quoteId: testQuoteId,
        engineVersion: "1.0.0",
        laneId: `lane_${UNIQUE_TEST_ID}`,
        snapshotId: testSnapshotId,
        sunamStatus: "pending" as const,
      },
      {
        caseId: testCaseId,
        documentId: testDocumentId + 1,
        flagType: `missing_evidence_${UNIQUE_TEST_ID}`,
        description: "Chain of custody gap identified in evidence log",
        quoteId: testQuoteId + 1,
        engineVersion: "1.0.0",
        laneId: `lane_${UNIQUE_TEST_ID}`,
        snapshotId: testSnapshotId,
        sunamStatus: "pending" as const,
      },
      {
        caseId: testCaseId,
        documentId: testDocumentId + 2,
        flagType: `annotation_${UNIQUE_TEST_ID}`,
        description: "Brief",
        quoteId: null,
        engineVersion: "1.0.0",
        laneId: `lane_${UNIQUE_TEST_ID}`,
        snapshotId: testSnapshotId,
        sunamStatus: "pending" as const,
      },
      {
        caseId: testCaseId,
        documentId: testDocumentId + 3,
        flagType: `generic_${UNIQUE_TEST_ID}`,
        description: "",
        quoteId: null,
        engineVersion: "1.0.0",
        laneId: `lane_${UNIQUE_TEST_ID}`,
        snapshotId: testSnapshotId,
        sunamStatus: "pending" as const,
      },
      {
        caseId: testCaseId,
        documentId: testDocumentId + 4,
        flagType: `inconsistency_${UNIQUE_TEST_ID}`,
        description: "Data inconsistency found in document metadata records",
        quoteId: testQuoteId + 4,
        engineVersion: "1.0.0",
        laneId: `lane_${UNIQUE_TEST_ID}`,
        snapshotId: testSnapshotId,
        sunamStatus: "pending" as const,
      },
    ];

    for (const signal of testSignals) {
      const result = await db.insert(signalFlags).values(signal);
      createdSignalIds.push(result[0]);
    }

    // Process signals through Sunam gate
    gateResults = await runSunamGate(db, 100);
  });

  afterAll(async () => {
    // Cleanup
    for (const id of createdSignalIds) {
      try {
        await db.delete(signalFlags).where(eq(signalFlags.id, id));
      } catch (e) {
        // Ignore
      }
    }
  });

  it("should create 5 test signals", async () => {
    expect(createdSignalIds.length).toBe(5);
  });

  it("should process signals and return results", async () => {
    expect(gateResults).toBeDefined();
    expect(Array.isArray(gateResults)).toBe(true);
    expect(gateResults.length).toBeGreaterThanOrEqual(5);
  });

  it("should have correct result structure", async () => {
    for (const result of gateResults.slice(0, 5)) {
      expect(result).toHaveProperty("signalFlagId");
      expect(result).toHaveProperty("flagType");
      expect(result).toHaveProperty("afterStatus");
      expect(result).toHaveProperty("confidenceScore");
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("registryCreated");

      // Validate enum values
      expect(["approved", "rejected", "deferred"]).toContain(result.afterStatus);
      expect(typeof result.confidenceScore).toBe("number");
    }
  });

  it("should approve contradiction signal", async () => {
    const contradictionResult = gateResults.find((r) =>
      r.flagType.includes(`contradiction_${UNIQUE_TEST_ID}`)
    );

    expect(contradictionResult).toBeDefined();
    expect(contradictionResult?.afterStatus).toBe("approved");
    expect(contradictionResult?.confidenceScore).toBe(0.85);
  });

  it("should approve missing_evidence signal", async () => {
    const missingEvidenceResult = gateResults.find((r) =>
      r.flagType.includes(`missing_evidence_${UNIQUE_TEST_ID}`)
    );

    expect(missingEvidenceResult).toBeDefined();
    expect(missingEvidenceResult?.afterStatus).toBe("approved");
    expect(missingEvidenceResult?.confidenceScore).toBe(0.85);
  });

  it("should defer annotation signal (no quote)", async () => {
    const annotationResult = gateResults.find((r) =>
      r.flagType.includes(`annotation_${UNIQUE_TEST_ID}`)
    );

    expect(annotationResult).toBeDefined();
    expect(annotationResult?.afterStatus).toBe("deferred");
    expect(annotationResult?.confidenceScore).toBe(0.5);
  });

  it("should reject generic signal (empty description)", async () => {
    const genericResult = gateResults.find((r) =>
      r.flagType.includes(`generic_${UNIQUE_TEST_ID}`)
    );

    expect(genericResult).toBeDefined();
    expect(genericResult?.afterStatus).toBe("rejected");
    expect(genericResult?.confidenceScore).toBe(0.2);
  });

  it("should approve inconsistency signal", async () => {
    const inconsistencyResult = gateResults.find((r) =>
      r.flagType.includes(`inconsistency_${UNIQUE_TEST_ID}`)
    );

    expect(inconsistencyResult).toBeDefined();
    expect(inconsistencyResult?.afterStatus).toBe("approved");
    expect(inconsistencyResult?.confidenceScore).toBe(0.85);
  });

  it("should verify database updates", async () => {
    const signals = await db
      .select()
      .from(signalFlags)
      .where(eq(signalFlags.caseId, testCaseId));

    expect(signals.length).toBe(5);

    // Verify statuses match gate results
    const contradictionSignal = signals.find((s) =>
      s.flagType.includes(`contradiction_${UNIQUE_TEST_ID}`)
    );
    expect(contradictionSignal?.sunamStatus).toBe("approved");

    const genericSignal = signals.find((s) =>
      s.flagType.includes(`generic_${UNIQUE_TEST_ID}`)
    );
    expect(genericSignal?.sunamStatus).toBe("rejected");

    const annotationSignal = signals.find((s) =>
      s.flagType.includes(`annotation_${UNIQUE_TEST_ID}`)
    );
    expect(annotationSignal?.sunamStatus).toBe("deferred");
  });
});
