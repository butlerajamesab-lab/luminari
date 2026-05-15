/**
 * Remedy Connector — Cross-Engine Wiring
 * 
 * Connects the Remedy Template & Settlement Calculator module to:
 * - Strategy Engine: auto-select templates when strategy path is approved
 * - Remedy Path Engine: generate docs for remedy steps
 * - Paperwork Generation Engine: queue template-based document generation
 * - Evidence Lab: store generated documents as evidence items
 * - Section Library: register template sections for assembly engine
 * - Outcome Engine: feed document outcomes back into template effectiveness
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { findMatchingTemplates, generateDocument, enqueueGeneration } from "./remedy-template-service";
import { calculateSettlement } from "./settlement-calculator";

// ─── Strategy → Template Selection ───────────────────────────────────────────
// When a strategy path is approved, auto-find matching templates for each step

export async function selectTemplatesForStrategyPath(pathId: string, userId: number): Promise<{
  stepId: string;
  stepType: string;
  templates: { templateId: string; templateName: string; claimType: string; score: number }[];
}[]> {
  // Get the strategy path and its steps
  const [path] = await db.execute(sql`
    SELECT sp.path_id, sp.strategy_id, sp.pattern_id
    FROM sys_strategy_paths sp WHERE sp.path_id = ${pathId}
  `);
  // @ts-expect-error pre-existing type mismatch
  if (!path.length) return [];
  // @ts-expect-error pre-existing type mismatch
  const pathRow = path[0] as any;

  const [steps] = await db.execute(sql`
    SELECT step_id, step_type, step_name, step_description
    FROM strategy_steps WHERE path_id = ${pathId}
    ORDER BY step_number ASC
  `);

  // Get pattern info for claim type mapping
  const [patternRows] = await db.execute(sql`
    SELECT pattern_type, geographic_spread FROM pattern_registry
    WHERE pattern_id = ${pathRow.pattern_id} LIMIT 1
  `);
  const pattern = (patternRows as unknown as any[])[0] || {};

  // Map step types to claim types
  const stepToClaimType: Record<string, string> = {
    "cease_and_desist": "consumer_fraud",
    "agency_complaint": "consumer_fraud",
    "oversight_request": "public_records",
    "regulatory_notice": "consumer_fraud",
    "enforcement_referral": "consumer_fraud",
    "legislative_briefing": "public_records",
    "investigation_request": "housing_discrimination",
    "public_report": "consumer_fraud",
    "mediation": "consumer_fraud",
    "settlement_negotiation": "consumer_fraud",
    "class_action_prep": "consumer_fraud",
    "foia_request": "foia_violation",
    "whistleblower_filing": "wage_theft",
    "tribal_sovereignty": "housing_discrimination",
  };

  const results: any[] = [];

  for (const step of steps as unknown as any[]) {
    const claimType = stepToClaimType[step.step_type] || pattern.pattern_type || "consumer_fraud";
    const jurisdiction = (pattern.geographic_spread || "WA").split(",")[0].trim();

    const templates = await findMatchingTemplates(claimType, jurisdiction, step.step_type);

    results.push({
      stepId: step.step_id,
      stepType: step.step_type,
      templates: templates.slice(0, 5).map((t: any) => ({
        templateId: t.templateId,
        templateName: t.templateName,
        claimType: t.claimType,
        score: t.successRate || 0,
      })),
    });
  }

  return results;
}

// ─── Strategy → Settlement Estimate ──────────────────────────────────────────
// Calculate settlement estimates for a strategy path based on pattern data

export async function calculateStrategySettlement(pathId: string, userId: number): Promise<{
  totalEstimate: number;
  confidenceLevel: string;
  calculations: any[];
}> {
  const [path] = await db.execute(sql`
    SELECT sp.path_id, sp.strategy_id, sp.pattern_id
    FROM sys_strategy_paths sp WHERE sp.path_id = ${pathId}
  `);
  // @ts-expect-error pre-existing type mismatch
  if (!path.length) return { totalEstimate: 0, confidenceLevel: "low", calculations: [] };
  // @ts-expect-error pre-existing type mismatch
  const pathRow = path[0] as any;

  // Get pattern data for variables
  const [patternRows] = await db.execute(sql`
    SELECT pattern_type, signal_count, geographic_spread, decay_status
    FROM pattern_registry WHERE pattern_id = ${pathRow.pattern_id} LIMIT 1
  `);
  const pattern = (patternRows as unknown as any[])[0] || {};

  // Get trend data for pressure
  const [trendRows] = await db.execute(sql`
    SELECT pressure_index, trend_classification
    FROM trend_registry WHERE pattern_id = ${pathRow.pattern_id} LIMIT 1
  `);
  const trend = (trendRows as unknown as any[])[0] || {};

  // Build variables from pattern data
  const variables: Record<string, number> = {
    baseDamages: 10000,
    patternCount: pattern.signal_count || 1,
    affectedParties: Math.max(1, Math.floor((pattern.signal_count || 1) * 2.5)),
    durationMonths: 12,
    evidenceStrength: pattern.decay_status === "active" ? 0.85 : 0.6,
    complianceHistory: 0.5,
    cooperationLevel: 0.3,
  };

  const jurisdiction = (pattern.geographic_spread || "WA").split(",")[0].trim();
  const claimType = pattern.pattern_type || "consumer_fraud";

  const calculations: any[] = [];
  let totalEstimate = 0;

  try {
    const result = await calculateSettlement({
      claimType,
      jurisdiction,
      variables,
      patternId: pathRow.pattern_id,
    }, userId);

    calculations.push(result);
    totalEstimate = result.calculatedAmount;
  } catch (e) {
    // Fallback: use base estimate
    totalEstimate = variables.baseDamages * variables.patternCount;
  }

  const confidenceLevel = totalEstimate > 100000 ? "high" :
    totalEstimate > 25000 ? "medium" : "low";

  return { totalEstimate, confidenceLevel, calculations };
}

// ─── Remedy Path → Template Generation ───────────────────────────────────────
// When a remedy step activates, auto-generate documents from matching templates

export async function generateDocsForRemedyStep(params: {
  remedyStepId: number;
  caseId: number;
  patternId?: string;
  strategyPathId?: string;
  stepType: string;
  userId: number;
}): Promise<{ queued: number; docIds: string[] }> {
  const claimType = mapStepTypeToClaimType(params.stepType);
  const jurisdiction = "WA"; // Default, could be derived from case

  const templates = await findMatchingTemplates(claimType, jurisdiction, params.stepType);
  const docIds: string[] = [];

  for (const tmpl of templates.slice(0, 3)) {
    const queueId = await enqueueGeneration({
      templateId: tmpl.templateId,
      caseId: params.caseId,
      patternId: params.patternId,
      strategyPathId: params.strategyPathId,
      priority: 8,
    });
    docIds.push(queueId);
  }

  return { queued: docIds.length, docIds };
}

// ─── Evidence Lab Integration ────────────────────────────────────────────────
// Store generated remedy documents as evidence items

export async function storeDocInEvidenceLab(params: {
  docId: string;
  caseId: number;
  title: string;
  content: string;
  documentType: string;
  userId: number;
}): Promise<number> {
  const now = Date.now();
  const [result] = await db.execute(sql`
    INSERT INTO evidence_items (caseId, evidenceType, title, description, sourceName, sourceDate, extractedText, metadata, createdAt, updatedAt)
    VALUES (
      ${params.caseId},
      'generated_document',
      ${params.title},
      ${"Auto-generated remedy document: " + params.documentType},
      'Remedy Template Engine',
      ${now},
      ${params.content},
      ${JSON.stringify({ docId: params.docId, documentType: params.documentType, generatedBy: params.userId })},
      ${now},
      ${now}
    )
  `);

  const evidenceId = (result as any).insertId;

  // Link back to remedy_doc_generated
  await db.execute(sql`
    UPDATE remedy_doc_generated SET evidence_item_id = ${evidenceId}
    WHERE doc_id = ${params.docId}
  `);

  return evidenceId;
}

// ─── Section Library Integration ─────────────────────────────────────────────
// Register template sections in the assembly section library

export async function syncTemplateSections(templateId: string): Promise<number> {
  const [sections] = await db.execute(sql`
    SELECT section_id, section_name, section_order, section_content, is_required, placeholders
    FROM template_sections WHERE template_id = ${templateId}
    ORDER BY section_order ASC
  `);

  let synced = 0;
  for (const section of sections as unknown as any[]) {
    const [existing] = await db.execute(sql`
      SELECT id FROM assembly_section_library
      WHERE sectionName = ${section.section_name} AND sectionType = 'remedy_template'
      LIMIT 1
    `);

    if (!(existing as unknown as any[]).length) {
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO assembly_section_library (sectionName, sectionType, templateId, orderIndex, contentTemplate, placeholders, createdAt)
        VALUES (
          ${section.section_name},
          'remedy_template',
          ${0},
          ${section.section_order},
          ${section.section_content || ""},
          ${section.placeholders || "[]"},
          ${now}
        )
      `);
      synced++;
    }
  }

  return synced;
}

// ─── Outcome → Template Effectiveness ────────────────────────────────────────
// When an outcome is recorded for a document, update template effectiveness

export async function updateTemplateEffectiveness(params: {
  templateId: string;
  outcomeStatus: string;
  settlementAmount?: number;
  daysToResolution?: number;
  effectivenessScore?: number;
}): Promise<void> {
  const now = Date.now();
  const isSuccess = ["resolved", "settled", "favorable", "accepted"].includes(params.outcomeStatus);

  const [existing] = await db.execute(sql`
    SELECT effectiveness_id, total_uses, successful_outcomes, avg_settlement_amount, avg_response_time_days, avg_effectiveness_score
    FROM template_effectiveness WHERE template_id = ${params.templateId} LIMIT 1
  `);

  if ((existing as unknown as any[]).length) {
    const row = (existing as unknown as any[])[0];
    const newTotal = (row.total_uses || 0) + 1;
    const newSuccessful = (row.successful_outcomes || 0) + (isSuccess ? 1 : 0);
    const newAvgSettlement = params.settlementAmount
      ? ((parseFloat(row.avg_settlement_amount || "0") * row.total_uses) + params.settlementAmount) / newTotal
      : parseFloat(row.avg_settlement_amount || "0");
    const newAvgDays = params.daysToResolution
      ? ((parseFloat(row.avg_response_time_days || "0") * row.total_uses) + params.daysToResolution) / newTotal
      : parseFloat(row.avg_response_time_days || "0");
    const newAvgScore = params.effectivenessScore
      ? ((parseFloat(row.avg_effectiveness_score || "0") * row.total_uses) + params.effectivenessScore) / newTotal
      : parseFloat(row.avg_effectiveness_score || "0");

    await db.execute(sql`
      UPDATE template_effectiveness SET
        total_uses = ${newTotal},
        successful_outcomes = ${newSuccessful},
        avg_settlement_amount = ${newAvgSettlement},
        avg_response_time_days = ${newAvgDays},
        avg_effectiveness_score = ${newAvgScore},
        last_calculated_at = ${now},
        updated_at = ${now}
      WHERE template_id = ${params.templateId}
    `);
  } else {
    const effectivenessId = `te-${crypto.randomUUID().slice(0, 8)}`;
    await db.execute(sql`
      INSERT INTO template_effectiveness (effectiveness_id, template_id, total_uses, successful_outcomes, avg_settlement_amount, avg_response_time_days, avg_effectiveness_score, last_calculated_at, created_at, updated_at)
      VALUES (
        ${effectivenessId},
        ${params.templateId},
        1,
        ${isSuccess ? 1 : 0},
        ${params.settlementAmount || 0},
        ${params.daysToResolution || 0},
        ${params.effectivenessScore || 0},
        ${now},
        ${now},
        ${now}
      )
    `);
  }
}

// ─── Full Pipeline: Strategy Approval → Document Generation ──────────────────
// Orchestrates the full flow when a strategy path is approved

export async function onStrategyPathApproved(pathId: string, userId: number): Promise<{
  templatesSelected: number;
  docsQueued: number;
  settlementEstimate: number;
}> {
  // 1. Select matching templates for each step
  const templateSelections = await selectTemplatesForStrategyPath(pathId, userId);
  let templatesSelected = 0;
  let docsQueued = 0;

  // 2. Queue document generation for each step's best template
  for (const sel of templateSelections) {
    templatesSelected += sel.templates.length;
    if (sel.templates.length > 0) {
      const best = sel.templates[0];
      await enqueueGeneration({
        templateId: best.templateId,
        strategyPathId: pathId,
        priority: 7,
      });
      docsQueued++;
    }
  }

  // 3. Calculate settlement estimate
  const settlement = await calculateStrategySettlement(pathId, userId);

  return {
    templatesSelected,
    docsQueued,
    settlementEstimate: settlement.totalEstimate,
  };
}

// ─── Get Connector Status ────────────────────────────────────────────────────

export async function getConnectorStatus(): Promise<{
  templatesAvailable: number;
  formulasAvailable: number;
  docsGenerated: number;
  docsInQueue: number;
  evidenceLinked: number;
  effectivenessTracked: number;
}> {
  const [templates] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_templates`);
  const [formulas] = await db.execute(sql`SELECT COUNT(*) as cnt FROM settlement_formulas`);
  const [docs] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_doc_generated`);
  const [queue] = await db.execute(sql`SELECT COUNT(*) as cnt FROM doc_generation_queue WHERE queue_status = 'pending'`);
  const [evidence] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_doc_generated WHERE evidence_item_id IS NOT NULL`);
  const [effectiveness] = await db.execute(sql`SELECT COUNT(*) as cnt FROM template_effectiveness`);

  return {
    templatesAvailable: (templates as unknown as any[])[0]?.cnt || 0,
    formulasAvailable: (formulas as unknown as any[])[0]?.cnt || 0,
    docsGenerated: (docs as unknown as any[])[0]?.cnt || 0,
    docsInQueue: (queue as unknown as any[])[0]?.cnt || 0,
    evidenceLinked: (evidence as unknown as any[])[0]?.cnt || 0,
    effectivenessTracked: (effectiveness as unknown as any[])[0]?.cnt || 0,
  };
}

// ─── Helpers ───

function mapStepTypeToClaimType(stepType: string): string {
  const map: Record<string, string> = {
    "cease_and_desist": "consumer_fraud",
    "agency_complaint": "consumer_fraud",
    "demand_letter": "wage_theft",
    "complaint": "housing_discrimination",
    "appeal": "ssdi_denial",
    "notice": "security_deposit",
    "request": "public_records",
    "filing": "consumer_fraud",
  };
  return map[stepType] || "consumer_fraud";
}
