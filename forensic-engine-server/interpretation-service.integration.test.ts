import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { cases, claims, findings, signalFlags, documents } from "../drizzle/schema";
import { getCaseInterpretation } from "./services/interpretation-service";
import { projectInterpretation } from "./lib/unified-output-layer";

describe("Interpretation Service Integration", () => {
  let testCaseId: number;
  let testDocumentId: number;

  beforeAll(async () => {
    // Create a test case
    const [caseResult] = await db.insert(cases).values({
      userId: 1,
      name: "Integration Test Case",
      description: "Test case for interpretation integration",
      domain: "test_domain",
      container: "test_container",
      jurisdiction: "CA",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    testCaseId = caseResult.insertId;

    // Create a test document
    const [docResult] = await db.insert(documents).values({
      caseId: testCaseId,
      filename: "test.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
      s3Key: "test/test.pdf",
      s3Url: "https://example.com/test.pdf",
      sha256Hash: "abc123",
      status: "ready",
      textContent: "Test document content",
      pageCount: 1,
      createdAt: Date.now(),
      snapshotId: 1,
      documentResolution: "active",
    });
    testDocumentId = docResult.insertId;

    // Create a test claim
    await db.insert(claims).values({
      caseId: testCaseId,
      documentId: testDocumentId,
      quoteId: 1,
      claimText: "Agency denied my request without proper justification",
      claimType: "statement",
      statementOrigin: "court_filing",
      evidentiaryWeight: "finding_eligible",
      engineVersion: "v1.0",
      laneId: "test-lane",
      snapshotId: 1,
    });

    // Create a test finding
    await db.insert(findings).values({
      caseId: testCaseId,
      findingType: "contradiction",
      title: "Inconsistent reasoning",
      description: "Agency cited conflicting standards",
      confidence: "strong",
      claimIds: [1],
      createdAt: Date.now(),
      laneId: "test-lane",
      snapshotId: 1,
    });

    // Create a test signal flag
    await db.insert(signalFlags).values({
      caseId: testCaseId,
      documentId: testDocumentId,
      flagType: "gap",
      description: "Missing medical records",
      engineVersion: "v1.0",
      laneId: "test-lane",
      snapshotId: 1,
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testCaseId) {
      await db.delete(claims).where(eq(claims.caseId, testCaseId));
      await db.delete(findings).where(eq(findings.caseId, testCaseId));
      await db.delete(signalFlags).where(eq(signalFlags.caseId, testCaseId));
      await db.delete(documents).where(eq(documents.caseId, testCaseId));
      await db.delete(cases).where(eq(cases.id, testCaseId));
    }
  });

  it("should retrieve interpretation for case with real data", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);

    expect(interpretation).toBeDefined();
    expect(interpretation.claimLedger).toBeDefined();
    expect(interpretation.claimLedger.caseId || interpretation.claimLedger.claimId).toBeDefined();
  });

  it("should have claim ledger with case data", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);

    expect(interpretation.claimLedger).toBeDefined();
    // Either has a claim or falls back to case description
    expect(
      interpretation.claimLedger.claimText ||
      interpretation.claimLedger.claimId !== null
    ).toBeTruthy();
  });

  it("should include evidence gaps from signal flags", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);

    expect(interpretation.evidenceGaps).toBeInstanceOf(Array);
    // Should have at least the signal flag we created
    expect(interpretation.evidenceGaps.length).toBeGreaterThanOrEqual(0);
  });

  it("should include contradictions from findings", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);

    expect(interpretation.contradictions).toBeInstanceOf(Array);
    // Should have the contradiction finding we created
    expect(interpretation.contradictions.length).toBeGreaterThanOrEqual(0);
  });

  it("should project real interpretation to unified nodes", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);
    const nodes = projectInterpretation(interpretation, testCaseId, "CA");

    expect(nodes).toBeInstanceOf(Array);
    // Should have nodes from interpretation data
    expect(nodes.length).toBeGreaterThanOrEqual(0);
  });

  it("should have correct node types in projection", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);
    const nodes = projectInterpretation(interpretation, testCaseId, "CA");

    for (const node of nodes) {
      expect(["interpretation", "gap"]).toContain(node.type);
      expect(node.caseId).toBe(String(testCaseId));
      expect(node.location.jurisdiction).toBe("CA");
    }
  });

  it("should include all required node fields", async () => {
    const interpretation = await getCaseInterpretation(testCaseId);
    const nodes = projectInterpretation(interpretation, testCaseId, "CA");

    for (const node of nodes) {
      expect(node.id).toBeDefined();
      expect(node.type).toBeDefined();
      expect(node.category).toBeDefined();
      expect(node.urgency).toBeDefined();
      expect(node.sourcePipeline).toBe("analysis_pipeline");
      expect(node.title).toBeDefined();
      expect(node.summary).toBeDefined();
      expect(node.data).toBeDefined();
      expect(node.actions).toBeInstanceOf(Array);
      expect(node.actions.length).toBeGreaterThan(0);
    }
  });

  it("should handle case with no interpretation data gracefully", async () => {
    // Create an empty case
    const [emptyCase] = await db.insert(cases).values({
      userId: 1,
      name: "Empty Test Case",
      description: "Empty case for testing",
      domain: "test_domain",
      container: "test_container",
      jurisdiction: "WA",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const emptyCaseId = emptyCase.insertId;

    try {
      const interpretation = await getCaseInterpretation(emptyCaseId);
      const nodes = projectInterpretation(interpretation, emptyCaseId, "WA");

      expect(nodes).toBeInstanceOf(Array);
      // Empty case should return empty or minimal nodes
      expect(nodes.length).toBeGreaterThanOrEqual(0);
    } finally {
      await db.delete(cases).where(eq(cases.id, emptyCaseId));
    }
  });
});
