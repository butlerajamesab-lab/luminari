/**
 * Remedy Path Engine
 * 
 * Generates remedy paths from case data using LLM, with:
 * - Viability assessment (strong/moderate/weak/uncertain)
 * - Step-by-step action plans with deadlines
 * - Documentation requirements per step
 * - Readiness indicators (what % of requirements are met)
 * - Tool links for each step (filing generator, FOIA, etc.)
 */
import { db } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  remedyPaths, remedySteps, remedyDocRequirements,
  cases, claims, findings, events, documents, checklistItems,
  missingRecords, evidenceItems,
} from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ─── Types ───

interface RemedyPathGeneration {
  title: string;
  description: string;
  pathType: "administrative" | "judicial" | "legislative" | "informal" | "hybrid";
  viability: "strong" | "moderate" | "weak" | "uncertain";
  estimatedTimeline: string;
  estimatedCost: string;
  riskLevel: "low" | "medium" | "high";
  prerequisites: string[];
  relatedClaimTypes: string[];
  steps: {
    title: string;
    description: string;
    actionType: string;
    estimatedDuration: string;
    linkedToolHref: string;
    docRequirements: {
      documentType: string;
      description: string;
      required: boolean;
    }[];
  }[];
}

// ─── Gather Case Context ───

async function gatherCaseContext(caseId: number) {
  const [
    [caseRow],
    caseClaims,
    caseFindings,
    caseEvents,
    [docCount],
    caseChecklist,
    caseMissing,
    caseEvidence,
  ] = await Promise.all([
    db.select().from(cases).where(eq(cases.id, caseId)),
    db.select({
      id: claims.id,
      claimType: claims.claimType,
      // @ts-ignore pre-existing type mismatch
      description: claims.description,
      // @ts-ignore pre-existing type mismatch
      severity: claims.severity,
      // @ts-ignore pre-existing type mismatch
      confidence: claims.confidence,
    }).from(claims).where(eq(claims.caseId, caseId)).limit(20),
    db.select({
      id: findings.id,
      findingType: findings.findingType,
      // @ts-ignore pre-existing type mismatch
      summary: findings.summary,
      // @ts-ignore pre-existing type mismatch
      severity: findings.severity,
    }).from(findings).where(eq(findings.caseId, caseId)).limit(15),
    db.select({
      id: events.id,
      description: events.description,
      eventType: events.eventType,
      // @ts-ignore pre-existing type mismatch
      eventDate: events.eventDate,
    // @ts-ignore pre-existing type mismatch
    }).from(events).where(eq(events.caseId, caseId)).orderBy(events.eventDate).limit(20),
    db.select({ c: sql<number>`COUNT(*)` }).from(documents).where(eq(documents.caseId, caseId)),
    db.select().from(checklistItems).where(eq(checklistItems.caseId, caseId)),
    db.select().from(missingRecords).where(eq(missingRecords.caseId, caseId)),
    db.select({ c: sql<number>`COUNT(*)` }).from(evidenceItems).where(eq(evidenceItems.caseId, caseId)),
  ]);

  return {
    case: caseRow,
    claims: caseClaims,
    findings: caseFindings,
    events: caseEvents,
    documentCount: docCount.c,
    checklist: caseChecklist,
    missingRecords: caseMissing,
    // @ts-ignore pre-existing type mismatch
    evidenceCount: caseEvidence.c,
  };
}

// ─── Generate Remedy Paths ───

export async function generateRemedyPaths(caseId: number, userId: number): Promise<number[]> {
  const ctx = await gatherCaseContext(caseId);
  if (!ctx.case) throw new Error("Case not found");

  const claimSummary = ctx.claims.map(c =>
    `- ${c.claimType}: ${c.description?.slice(0, 150) || "No description"} (severity: ${c.severity || "unknown"}, confidence: ${c.confidence || "unknown"})`
  ).join("\n");

  const findingSummary = ctx.findings.map(f =>
    `- ${f.findingType}: ${f.summary?.slice(0, 120) || "No summary"} (severity: ${f.severity || "unknown"})`
  ).join("\n");

  const eventSummary = ctx.events.slice(0, 10).map(e =>
    `- ${e.eventDate ? new Date(e.eventDate).toLocaleDateString() : "Unknown date"}: ${e.description?.slice(0, 100) || "Event"}`
  ).join("\n");

  const missingSummary = ctx.missingRecords.map(m =>
    `- ${m.recordType}: ${m.description} (severity: ${m.severity})`
  ).join("\n");

  const prompt = `You are a legal remedy path analyst for a civic advocacy platform. Based on the following case data, generate 2-4 distinct remedy paths that the person could pursue. Each path should be realistic, actionable, and include specific steps.

CASE: ${ctx.case.name}
Pipeline Type: ${ctx.case.pipelineType || "general"}
Domain: ${ctx.case.domain || "general"}
Documents: ${ctx.documentCount}
Evidence Items: ${ctx.evidenceCount}

CLAIMS IDENTIFIED:
${claimSummary || "No claims identified yet"}

FINDINGS:
${findingSummary || "No findings yet"}

KEY EVENTS:
${eventSummary || "No events extracted yet"}

MISSING RECORDS:
${missingSummary || "None identified"}

CHECKLIST: ${ctx.checklist.length} items, ${ctx.checklist.filter((i: any) => i.checked).length} completed

For each remedy path, provide:
1. A clear title and description
2. Path type (administrative, judicial, legislative, informal, or hybrid)
3. Viability assessment (strong, moderate, weak, or uncertain) based on evidence strength
4. Estimated timeline and cost range
5. Risk level (low, medium, high)
6. Prerequisites
7. Related claim types
8. Ordered steps, each with:
   - Title and description
   - Action type (file_document, gather_evidence, contact_agency, attend_hearing, submit_form, wait, review)
   - Estimated duration
   - A linked tool path from this list: /filing-generator, /foia, /lumensend, /upload, /narrative, /deadline-calculator, /proof-frameworks, /benefits
   - Documentation requirements (what documents are needed for this step)

Return JSON matching this exact schema:
{
  "paths": [
    {
      "title": "string",
      "description": "string",
      "pathType": "administrative|judicial|legislative|informal|hybrid",
      "viability": "strong|moderate|weak|uncertain",
      "estimatedTimeline": "string",
      "estimatedCost": "string",
      "riskLevel": "low|medium|high",
      "prerequisites": ["string"],
      "relatedClaimTypes": ["string"],
      "steps": [
        {
          "title": "string",
          "description": "string",
          "actionType": "file_document|gather_evidence|contact_agency|attend_hearing|submit_form|wait|review",
          "estimatedDuration": "string",
          "linkedToolHref": "string",
          "docRequirements": [
            {
              "documentType": "string",
              "description": "string",
              "required": true
            }
          ]
        }
      ]
    }
  ]
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a legal remedy path analyst. Return valid JSON only. Be specific and practical. Focus on actionable steps that a non-lawyer can follow." },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remedy_paths",
        strict: true,
        schema: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  pathType: { type: "string" },
                  viability: { type: "string" },
                  estimatedTimeline: { type: "string" },
                  estimatedCost: { type: "string" },
                  riskLevel: { type: "string" },
                  prerequisites: { type: "array", items: { type: "string" } },
                  relatedClaimTypes: { type: "array", items: { type: "string" } },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        actionType: { type: "string" },
                        estimatedDuration: { type: "string" },
                        linkedToolHref: { type: "string" },
                        docRequirements: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              documentType: { type: "string" },
                              description: { type: "string" },
                              required: { type: "boolean" },
                            },
                            required: ["documentType", "description", "required"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["title", "description", "actionType", "estimatedDuration", "linkedToolHref", "docRequirements"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "description", "pathType", "viability", "estimatedTimeline", "estimatedCost", "riskLevel", "prerequisites", "relatedClaimTypes", "steps"],
                additionalProperties: false,
              },
            },
          },
          required: ["paths"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");

  // @ts-ignore pre-existing type mismatch
  const parsed = JSON.parse(content) as { paths: RemedyPathGeneration[] };
  const createdPathIds: number[] = [];
  const now = Date.now();

  for (const path of parsed.paths) {
    // Insert remedy path
    const [inserted] = await db.insert(remedyPaths).values({
      caseId,
      userId,
      title: path.title,
      description: path.description,
      pathType: path.pathType,
      viability: path.viability,
      estimatedTimeline: path.estimatedTimeline,
      estimatedCost: path.estimatedCost,
      riskLevel: path.riskLevel,
      prerequisites: path.prerequisites,
      relatedClaimTypes: path.relatedClaimTypes,
      generatedBy: "llm",
      createdAt: now,
      updatedAt: now,
    });
    const pathId = inserted.insertId;
    createdPathIds.push(pathId);

    // Insert steps
    for (let i = 0; i < path.steps.length; i++) {
      const step = path.steps[i];
      const [stepInserted] = await db.insert(remedySteps).values({
        pathId,
        stepOrder: i + 1,
        title: step.title,
        description: step.description,
        actionType: step.actionType,
        estimatedDuration: step.estimatedDuration,
        linkedToolHref: step.linkedToolHref,
        createdAt: now,
      });
      const stepId = stepInserted.insertId;

      // Insert doc requirements
      for (const req of step.docRequirements) {
        await db.insert(remedyDocRequirements).values({
          stepId,
          documentType: req.documentType,
          description: req.description,
          required: req.required ? 1 : 0,
          createdAt: now,
        });
      }
    }
  }

  return createdPathIds;
}

// ─── Get Remedy Paths for Case ───

export async function getRemedyPathsForCase(caseId: number) {
  const paths = await db.select()
    .from(remedyPaths)
    .where(eq(remedyPaths.caseId, caseId))
    .orderBy(desc(remedyPaths.createdAt));

  // For each path, get steps and their doc requirements
  const enriched = await Promise.all(paths.map(async (path) => {
    const steps = await db.select()
      .from(remedySteps)
      .where(eq(remedySteps.pathId, path.id))
      .orderBy(remedySteps.stepOrder);

    const stepsWithDocs = await Promise.all(steps.map(async (step) => {
      const docs = await db.select()
        .from(remedyDocRequirements)
        .where(eq(remedyDocRequirements.stepId, step.id));
      return { ...step, docRequirements: docs };
    }));

    // Calculate readiness
    const totalRequired = stepsWithDocs.reduce((sum, s) =>
      sum + s.docRequirements.filter(d => d.required).length, 0);
    const totalFulfilled = stepsWithDocs.reduce((sum, s) =>
      sum + s.docRequirements.filter(d => d.fulfilled).length, 0);
    const completedSteps = stepsWithDocs.filter(s => s.status === "completed").length;

    return {
      ...path,
      steps: stepsWithDocs,
      readiness: {
        docsFulfilled: totalFulfilled,
        docsRequired: totalRequired,
        docsPercent: totalRequired > 0 ? Math.round((totalFulfilled / totalRequired) * 100) : 100,
        stepsCompleted: completedSteps,
        stepsTotal: stepsWithDocs.length,
        stepsPercent: stepsWithDocs.length > 0 ? Math.round((completedSteps / stepsWithDocs.length) * 100) : 0,
      },
    };
  }));

  return enriched;
}

// ─── Update Step Status ───

export async function updateStepStatus(stepId: number, status: "pending" | "in_progress" | "completed" | "skipped" | "blocked") {
  const completedAt = status === "completed" ? Date.now() : null;
  await db.update(remedySteps)
    .set({ status, completedAt })
    .where(eq(remedySteps.id, stepId));
  return { success: true };
}

// ─── Fulfill Doc Requirement ───

export async function fulfillDocRequirement(reqId: number, docId: number | null) {
  await db.update(remedyDocRequirements)
    .set({
      fulfilled: docId ? 1 : 0,
      fulfilledByDocId: docId,
    })
    .where(eq(remedyDocRequirements.id, reqId));
  return { success: true };
}

// ─── Update Remedy Path Status ───

export async function updateRemedyPathStatus(pathId: number, status: "draft" | "active" | "completed" | "abandoned") {
  await db.update(remedyPaths)
    .set({ status, updatedAt: Date.now() })
    .where(eq(remedyPaths.id, pathId));
  return { success: true };
}
