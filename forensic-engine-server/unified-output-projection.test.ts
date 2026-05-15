import { describe, it, expect } from "vitest";
import { projectInterpretation, type CaseInterpretation } from "./lib/unified-output-layer";

describe("Unified Output Layer - Projection", () => {
  const mockInterpretation: CaseInterpretation = {
    claimLedger: {
      claimId: 1,
      claimText: "Test claim",
      adverseParty: "Test Agency",
      decisionDate: "2026-01-01",
      decisionType: "denial",
    },
    comparisonMatrix: [
      {
        adverseReason: "Insufficient evidence",
        governingRule: "42 U.S.C. § 1983",
        ruleSource: "federal",
        ruleCitation: "42 USC 1983",
        matchType: "unsupported",
        missingElements: ["expert testimony"],
        suggestedClarification: "Need expert witness",
      },
      {
        adverseReason: "Timing issue",
        governingRule: "State statute of limitations",
        ruleSource: "state",
        ruleCitation: "RCW 4.16.080",
        matchType: "partial",
        missingElements: [],
        suggestedClarification: "May still be within window",
      },
    ],
    evidenceGaps: [
      {
        id: 1,
        gapType: "document",
        requiredItem: "Medical records",
        whyRequired: "To establish causation",
        howToObtain: "Request from healthcare provider",
        priority: "critical",
        source: "signal_flag",
      },
      {
        id: 2,
        gapType: "witness",
        requiredItem: "Witness statement",
        whyRequired: "Corroborate timeline",
        howToObtain: "Contact witness directly",
        priority: "important",
        source: "missing_record",
      },
    ],
    contradictions: [],
    patternContext: [],
    availableActions: [],
  };

  const caseId = 123;
  const jurisdiction = "WA";

  it("should project interpretation to unified nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    expect(nodes).toBeInstanceOf(Array);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("should create interpretation nodes from comparison matrix", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const interpretationNodes = nodes.filter(n => n.type === "interpretation");
    
    expect(interpretationNodes.length).toBe(2);
    expect(interpretationNodes[0].type).toBe("interpretation");
    expect(interpretationNodes[1].type).toBe("interpretation");
  });

  it("should create gap nodes from evidence gaps", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const gapNodes = nodes.filter(n => n.type === "gap");
    
    expect(gapNodes.length).toBe(2);
    expect(gapNodes[0].type).toBe("gap");
    expect(gapNodes[1].type).toBe("gap");
  });

  it("should map urgency correctly for unsupported matches", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const unsupportedNode = nodes.find(n => 
      n.type === "interpretation" && 
      (n.data as any).matchType === "unsupported"
    );
    
    expect(unsupportedNode?.urgency).toBe("critical");
  });

  it("should map urgency correctly for partial matches", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const partialNode = nodes.find(n => 
      n.type === "interpretation" && 
      (n.data as any).matchType === "partial"
    );
    
    expect(partialNode?.urgency).toBe("high");
  });

  it("should map urgency correctly for critical gaps", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const criticalGapNode = nodes.find(n => 
      n.type === "gap" && 
      (n.data as any).priority === "critical"
    );
    
    expect(criticalGapNode?.urgency).toBe("critical");
  });

  it("should map urgency correctly for important gaps", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const importantGapNode = nodes.find(n => 
      n.type === "gap" && 
      (n.data as any).priority === "important"
    );
    
    expect(importantGapNode?.urgency).toBe("high");
  });

  it("should set jurisdiction on all nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    
    for (const node of nodes) {
      expect(node.location.jurisdiction).toBe("WA");
    }
  });

  it("should set caseId on all nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    
    for (const node of nodes) {
      expect(node.caseId).toBe(String(caseId));
    }
  });

  it("should include navigate actions for all nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    
    for (const node of nodes) {
      expect(node.actions.length).toBeGreaterThan(0);
      const navigateAction = node.actions.find(a => a.type === "navigate");
      expect(navigateAction).toBeDefined();
      expect(navigateAction?.target).toContain(`/cases/${caseId}`);
    }
  });

  it("should only include interpretation and gap node types", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    
    for (const node of nodes) {
      expect(["interpretation", "gap"]).toContain(node.type);
    }
  });

  it("should include correct node structure", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    
    for (const node of nodes) {
      expect(node.id).toBeDefined();
      expect(node.type).toBeDefined();
      expect(node.category).toBeDefined();
      expect(node.location).toBeDefined();
      expect(node.urgency).toBeDefined();
      expect(node.sourcePipeline).toBe("analysis_pipeline");
      expect(node.sourceId).toBeDefined();
      expect(node.title).toBeDefined();
      expect(node.summary).toBeDefined();
      expect(node.data).toBeDefined();
      expect(node.actions).toBeInstanceOf(Array);
      expect(node.tags).toBeInstanceOf(Array);
      expect(node.createdAt).toBeDefined();
      expect(node.caseId).toBeDefined();
    }
  });

  it("should include interpretation data in nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const interpretationNode = nodes.find(n => n.type === "interpretation");
    
    expect(interpretationNode?.data).toHaveProperty("matchType");
    expect(interpretationNode?.data).toHaveProperty("governingRule");
    expect(interpretationNode?.data).toHaveProperty("ruleSource");
  });

  it("should include gap data in nodes", () => {
    const nodes = projectInterpretation(mockInterpretation, caseId, jurisdiction);
    const gapNode = nodes.find(n => n.type === "gap");
    
    expect(gapNode?.data).toHaveProperty("gapType");
    expect(gapNode?.data).toHaveProperty("requiredItem");
    expect(gapNode?.data).toHaveProperty("priority");
  });

  it("should handle empty interpretation gracefully", () => {
    const emptyInterpretation: CaseInterpretation = {
      claimLedger: {
        claimId: null,
        claimText: null,
        adverseParty: "Unknown",
        decisionDate: null,
        decisionType: "unknown",
      },
      comparisonMatrix: [],
      evidenceGaps: [],
      contradictions: [],
      patternContext: [],
      availableActions: [],
    };
    
    const nodes = projectInterpretation(emptyInterpretation, caseId, jurisdiction);
    expect(nodes).toBeInstanceOf(Array);
    expect(nodes.length).toBe(0);
  });
});
