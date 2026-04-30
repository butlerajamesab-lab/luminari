/**
 * Remedy Template Service
 * 
 * Manages 93+ remedy document templates across claim types and jurisdictions.
 * Handles template selection, placeholder filling, document generation,
 * and generation queue processing.
 * 
 * Connects to: Evidence Lab, Shop Office, Paperwork Generation Engine,
 * Strategy Engine, Section Library, Outcome Engine.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Types ───

export interface TemplateInfo {
  templateId: string;
  templateName: string;
  templateType: string;
  claimType: string;
  jurisdiction: string;
  placeholderFields: string[];
  governingLaw: string[];
  difficultyLevel: string;
  usageCount: number;
  successRate: number | null;
}

export interface GeneratedDoc {
  docId: string;
  templateId: string;
  templateName: string;
  caseId: number | null;
  patternId: string | null;
  strategyPathId: string | null;
  documentContent: string;
  documentType: string;
  status: string;
  createdAt: any;
}

export interface QueueItem {
  queueId: string;
  caseId: number | null;
  patternId: string | null;
  templateId: string | null;
  strategyPathId: string | null;
  priority: number;
  status: string;
  createdAt: any;
}

// ─── Template Management ───

/**
 * List templates with optional filtering
 */
export async function listTemplates(filters?: {
  claimType?: string;
  jurisdiction?: string;
  templateType?: string;
  difficultyLevel?: string;
  search?: string;
}): Promise<TemplateInfo[]> {
  let query = sql`SELECT * FROM remedy_templates WHERE is_active = 1`;

  if (filters?.claimType) query = sql`${query} AND claim_type = ${filters.claimType}`;
  if (filters?.jurisdiction) query = sql`${query} AND jurisdiction = ${filters.jurisdiction}`;
  if (filters?.templateType) query = sql`${query} AND template_type = ${filters.templateType}`;
  if (filters?.difficultyLevel) query = sql`${query} AND difficulty_level = ${filters.difficultyLevel}`;
  if (filters?.search) query = sql`${query} AND template_name LIKE ${`%${filters.search}%`}`;

  query = sql`${query} ORDER BY usage_count DESC, template_name ASC`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(mapTemplateRow);
}

/**
 * Get a single template by ID with full body
 */
export async function getTemplate(templateId: string): Promise<TemplateInfo & { templateBody: string }> {
  const [rows] = await db.execute(
    sql`SELECT * FROM remedy_templates WHERE template_id = ${templateId}`
  );
  const row = (rows as unknown as any[])[0];
  if (!row) throw new Error(`Template not found: ${templateId}`);

  return {
    ...mapTemplateRow(row),
    templateBody: row.template_body,
  };
}

/**
 * Find best matching templates for a pattern/claim
 */
export async function findMatchingTemplates(
  claimType: string,
  jurisdiction: string,
  templateType?: string
): Promise<TemplateInfo[]> {
  // First try exact jurisdiction match
  let query = sql`SELECT * FROM remedy_templates 
      WHERE is_active = 1 AND claim_type = ${claimType} AND jurisdiction = ${jurisdiction}`;
  if (templateType) query = sql`${query} AND template_type = ${templateType}`;
  query = sql`${query} ORDER BY usage_count DESC, success_rate DESC`;

  const [rows] = await db.execute(query);
  let results = (rows as unknown as any[]).map(mapTemplateRow);

  // If no jurisdiction-specific results, also include federal templates
  if (results.length === 0 || jurisdiction !== 'federal') {
    const [federalRows] = await db.execute(
      sql`SELECT * FROM remedy_templates 
          WHERE is_active = 1 AND claim_type = ${claimType} AND jurisdiction = 'federal'
          ${templateType ? sql`AND template_type = ${templateType}` : sql``}
          ORDER BY usage_count DESC`
    );
    const federalResults = (federalRows as unknown as any[]).map(mapTemplateRow);
    results = [...results, ...federalResults];
  }

  return results;
}

// ─── Document Generation ───

/**
 * Generate a document from a template by filling placeholders
 */
export async function generateDocument(
  templateId: string,
  placeholderValues: Record<string, string>,
  options?: {
    caseId?: number;
    patternId?: string;
    strategyPathId?: string;
    userId?: number;
  }
): Promise<GeneratedDoc> {
  const template = await getTemplate(templateId);

  // Fill placeholders
  let filledContent = template.templateBody;
  for (const [key, value] of Object.entries(placeholderValues)) {
    const placeholder = `[${key}]`;
    filledContent = filledContent.split(placeholder).join(value);
  }

  // Add current date
  const now = new Date();
  filledContent = filledContent.split('[CURRENT_DATE]').join(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  const docId = randomUUID();
  await db.execute(
    sql`INSERT INTO remedy_doc_generated 
        (doc_id, template_id, case_id, pattern_id, strategy_path_id, 
         document_content, document_title, document_type, doc_status, generated_by, jurisdiction, metadata, created_at, updated_at)
        VALUES (${docId}, ${templateId}, ${options?.caseId || null}, ${options?.patternId || null},
                ${options?.strategyPathId || null}, ${filledContent}, 
                ${template.templateName || 'Generated Document'}, ${template.templateType || 'general'},
                'draft', ${options?.userId || null}, ${template.jurisdiction || 'WA'},
                ${JSON.stringify(placeholderValues)}, ${Date.now()}, ${Date.now()})`
  );

  // Update usage count
  await db.execute(
    sql`UPDATE remedy_templates SET usage_count = usage_count + 1, updated_at = NOW() WHERE template_id = ${templateId}`
  );

  return {
    docId,
    templateId,
    templateName: template.templateName,
    caseId: options?.caseId || null,
    patternId: options?.patternId || null,
    strategyPathId: options?.strategyPathId || null,
    documentContent: filledContent,
    documentType: template.templateType,
    status: 'draft',
    createdAt: now,
  };
}

/**
 * List generated documents with optional filtering
 */
export async function listGeneratedDocs(filters?: {
  caseId?: number;
  patternId?: string;
  strategyPathId?: string;
  status?: string;
  limit?: number;
}): Promise<GeneratedDoc[]> {
  let query = sql`SELECT grd.*, rt.template_name FROM remedy_doc_generated grd
      LEFT JOIN remedy_templates rt ON grd.template_id = rt.template_id WHERE 1=1`;

  if (filters?.caseId) query = sql`${query} AND grd.case_id = ${filters.caseId}`;
  if (filters?.patternId) query = sql`${query} AND grd.pattern_id = ${filters.patternId}`;
  if (filters?.strategyPathId) query = sql`${query} AND grd.strategy_path_id = ${filters.strategyPathId}`;
  if (filters?.status) query = sql`${query} AND grd.doc_status = ${filters.status}`;

  query = sql`${query} ORDER BY grd.created_at DESC LIMIT ${filters?.limit || 20}`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(r => ({
    docId: r.doc_id,
    templateId: r.template_id,
    templateName: r.template_name || 'Unknown',
    caseId: r.case_id,
    patternId: r.pattern_id,
    strategyPathId: r.strategy_path_id,
    documentContent: r.document_content,
    documentType: r.document_type,
    status: r.doc_status,
    createdAt: r.created_at,
  }));
}

/**
 * Update document status
 */
export async function updateDocStatus(docId: string, status: string): Promise<void> {
  await db.execute(
    sql`UPDATE remedy_doc_generated SET doc_status = ${status}, updated_at = ${Date.now()} WHERE doc_id = ${docId}`
  );
}

// ─── Document Generation Queue ───

/**
 * Add a document generation request to the queue
 */
export async function enqueueGeneration(request: {
  caseId?: number;
  patternId?: string;
  templateId?: string;
  strategyPathId?: string;
  priority?: number;
  userId?: number;
}): Promise<string> {
  const queueId = randomUUID();
  await db.execute(
    sql`INSERT INTO doc_generation_queue 
        (queue_id, template_id, case_id, pattern_id, strategy_path_id, priority, queue_status, requested_by, requested_at)
        VALUES (${queueId}, ${request.templateId || ''}, ${request.caseId || null}, ${request.patternId || null}, 
                ${request.strategyPathId || null},
                ${request.priority || 5}, 'pending', ${request.userId || null}, ${Date.now()})`
  );
  return queueId;
}

/**
 * Process pending items in the generation queue
 */
export async function processQueue(limit = 10): Promise<{ processed: number; errors: number }> {
  const [pending] = await db.execute(
    sql`SELECT * FROM doc_generation_queue WHERE queue_status = 'pending' ORDER BY priority ASC, requested_at ASC LIMIT ${limit}`
  );

  let processed = 0;
  let errors = 0;

  for (const item of pending as unknown as any[]) {
    try {
      // Mark as processing
      await db.execute(
        sql`UPDATE doc_generation_queue SET queue_status = 'processing' WHERE queue_id = ${item.queue_id}`
      );

      // If template is specified, generate directly
      if (item.template_id) {
        await generateDocument(item.template_id, {}, {
          caseId: item.case_id,
          patternId: item.pattern_id,
          strategyPathId: item.strategy_path_id,
          userId: item.requested_by,
        });
      }
      // Otherwise, auto-select templates based on pattern
      else if (item.pattern_id) {
        const [patternRows] = await db.execute(
          sql`SELECT pattern_type FROM pattern_registry WHERE pattern_id = ${item.pattern_id} LIMIT 1`
        );
        const pattern = (patternRows as unknown as any[])[0];
        if (pattern) {
          const templates = await findMatchingTemplates(pattern.pattern_type, 'WA', 'demand_letter');
          if (templates.length > 0) {
            await generateDocument(templates[0].templateId, {}, {
              caseId: item.case_id,
              patternId: item.pattern_id,
              strategyPathId: item.strategy_path_id,
              userId: item.requested_by,
            });
          }
        }
      }

      // Mark as completed
      await db.execute(
        sql`UPDATE doc_generation_queue SET queue_status = 'completed', processed_at = ${Date.now()} WHERE queue_id = ${item.queue_id}`
      );
      processed++;
    } catch (err: any) {
      await db.execute(
        sql`UPDATE doc_generation_queue SET queue_status = 'failed', error_message = ${err.message || 'Unknown error'} WHERE queue_id = ${item.queue_id}`
      );
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  recentItems: QueueItem[];
}> {
  const [statusRows] = await db.execute(
    sql`SELECT queue_status, COUNT(*) as cnt FROM doc_generation_queue GROUP BY queue_status`
  );
  const statusMap: Record<string, number> = {};
  for (const r of statusRows as unknown as any[]) {
    statusMap[r.queue_status] = r.cnt;
  }

  const [recent] = await db.execute(
    sql`SELECT * FROM doc_generation_queue ORDER BY requested_at DESC LIMIT 10`
  );

  return {
    pending: statusMap['pending'] || 0,
    processing: statusMap['processing'] || 0,
    completed: statusMap['completed'] || 0,
    failed: statusMap['failed'] || 0,
    recentItems: (recent as unknown as any[]).map(r => ({
      queueId: r.queue_id,
      caseId: r.case_id,
      patternId: r.pattern_id,
      templateId: r.template_id,
      strategyPathId: r.strategy_path_id,
      priority: r.priority,
      status: r.queue_status,
      createdAt: r.requested_at,
    })),
  };
}

// ─── Outcome Tracking ───

/**
 * Record outcome for a generated document
 * Uses template_effectiveness table directly since remedy_outcome_tracking doesn't exist
 */
export async function recordDocOutcome(input: {
  docId: string;
  templateId: string;
  caseId?: number;
  outcomeStatus: string;
  settlementAmount?: number;
  responseReceived?: boolean;
  daysToResolution?: number;
  effectivenessScore?: number;
  notes?: string;
}): Promise<string> {
  const trackingId = randomUUID();
  const now = Date.now();
  const isSuccess = ["resolved", "settled", "favorable", "accepted", "successful"].includes(input.outcomeStatus);

  // Check if effectiveness record exists for this template
  const [existing] = await db.execute(
    sql`SELECT * FROM template_effectiveness WHERE template_id = ${input.templateId} LIMIT 1`
  );

  if ((existing as unknown as any[]).length) {
    const row = (existing as unknown as any[])[0];
    const newTotal = (row.total_uses || 0) + 1;
    const newSuccessful = (row.successful_outcomes || 0) + (isSuccess ? 1 : 0);
    const newAvgSettlement = input.settlementAmount
      ? ((parseFloat(row.avg_settlement_amount || "0") * row.total_uses) + input.settlementAmount) / newTotal
      : parseFloat(row.avg_settlement_amount || "0");
    const newAvgDays = input.daysToResolution
      ? ((parseFloat(row.avg_response_time_days || "0") * row.total_uses) + input.daysToResolution) / newTotal
      : parseFloat(row.avg_response_time_days || "0");
    const newAvgScore = input.effectivenessScore
      ? ((parseFloat(row.avg_effectiveness_score || "0") * row.total_uses) + input.effectivenessScore) / newTotal
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
      WHERE template_id = ${input.templateId}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO template_effectiveness 
        (effectiveness_id, template_id, total_uses, successful_outcomes, avg_settlement_amount, 
         avg_response_time_days, avg_effectiveness_score, last_calculated_at, created_at, updated_at)
      VALUES (
        ${trackingId}, ${input.templateId}, 1, ${isSuccess ? 1 : 0},
        ${input.settlementAmount || 0}, ${input.daysToResolution || 0},
        ${input.effectivenessScore || 0}, ${now}, ${now}, ${now}
      )
    `);
  }

  // Update template success rate
  const successRate = isSuccess ? 100 : 0;
  await db.execute(
    sql`UPDATE remedy_templates SET success_rate = ${successRate}, updated_at = NOW() WHERE template_id = ${input.templateId}`
  );

  return trackingId;
}

// ─── Dashboard ───

/**
 * Get remedy templates dashboard summary
 */
export async function getTemplateDashboard(): Promise<{
  totalTemplates: number;
  totalGenerated: number;
  totalInQueue: number;
  templatesByType: { type: string; count: number }[];
  templatesByJurisdiction: { jurisdiction: string; count: number }[];
  templatesByClaim: { claimType: string; count: number }[];
  topTemplates: TemplateInfo[];
  recentDocs: GeneratedDoc[];
}> {
  const [totalTemplateRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1`);
  const [totalGenRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_doc_generated`);
  const [totalQueueRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM doc_generation_queue WHERE queue_status = 'pending'`);

  const [byType] = await db.execute(
    sql`SELECT template_type, COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1 GROUP BY template_type ORDER BY cnt DESC`
  );
  const [byJurisdiction] = await db.execute(
    sql`SELECT jurisdiction, COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1 GROUP BY jurisdiction ORDER BY cnt DESC`
  );
  const [byClaim] = await db.execute(
    sql`SELECT claim_type, COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1 GROUP BY claim_type ORDER BY cnt DESC`
  );

  const [topRows] = await db.execute(
    sql`SELECT * FROM remedy_templates WHERE is_active = 1 ORDER BY usage_count DESC LIMIT 5`
  );

  const recentDocs = await listGeneratedDocs({ limit: 5 });

  return {
    totalTemplates: (totalTemplateRows as unknown as any[])[0]?.cnt || 0,
    totalGenerated: (totalGenRows as unknown as any[])[0]?.cnt || 0,
    totalInQueue: (totalQueueRows as unknown as any[])[0]?.cnt || 0,
    templatesByType: (byType as unknown as any[]).map(r => ({ type: r.template_type, count: r.cnt })),
    templatesByJurisdiction: (byJurisdiction as unknown as any[]).map(r => ({ jurisdiction: r.jurisdiction, count: r.cnt })),
    templatesByClaim: (byClaim as unknown as any[]).map(r => ({ claimType: r.claim_type, count: r.cnt })),
    topTemplates: (topRows as unknown as any[]).map(mapTemplateRow),
    recentDocs,
  };
}

/**
 * Get Mission Control summary for remedy templates
 */
export async function getMissionControlRemedySummary(): Promise<{
  totalTemplates: number;
  totalGenerated: number;
  pendingInQueue: number;
  avgEffectiveness: number;
  topClaimTypes: { claimType: string; templateCount: number; generatedCount: number }[];
  jurisdictionCoverage: { jurisdiction: string; count: number }[];
}> {
  const [totalTemplateRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1`);
  const [totalGenRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM remedy_doc_generated`);
  const [pendingRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM doc_generation_queue WHERE queue_status = 'pending'`);
  const [avgEffRows] = await db.execute(
    sql`SELECT AVG(CAST(avg_effectiveness_score AS DECIMAL(5,2))) as avg_eff FROM template_effectiveness WHERE total_uses > 0`
  );

  const [topClaims] = await db.execute(
    sql`SELECT rt.claim_type, 
          COUNT(DISTINCT rt.template_id) as template_count,
          COUNT(grd.doc_id) as generated_count
        FROM remedy_templates rt
        LEFT JOIN remedy_doc_generated grd ON rt.template_id = grd.template_id
        WHERE rt.is_active = 1
        GROUP BY rt.claim_type
        ORDER BY generated_count DESC`
  );

  const [jurisdictions] = await db.execute(
    sql`SELECT jurisdiction, COUNT(*) as cnt FROM remedy_templates WHERE is_active = 1 GROUP BY jurisdiction ORDER BY cnt DESC`
  );

  return {
    totalTemplates: (totalTemplateRows as unknown as any[])[0]?.cnt || 0,
    totalGenerated: (totalGenRows as unknown as any[])[0]?.cnt || 0,
    pendingInQueue: (pendingRows as unknown as any[])[0]?.cnt || 0,
    avgEffectiveness: parseFloat((avgEffRows as unknown as any[])[0]?.avg_eff) || 0,
    topClaimTypes: (topClaims as unknown as any[]).map(r => ({
      claimType: r.claim_type,
      templateCount: r.template_count,
      generatedCount: r.generated_count,
    })),
    jurisdictionCoverage: (jurisdictions as unknown as any[]).map(r => ({
      jurisdiction: r.jurisdiction,
      count: r.cnt,
    })),
  };
}

// ─── Helpers ───

function mapTemplateRow(row: any): TemplateInfo {
  return {
    templateId: row.template_id,
    templateName: row.template_name,
    templateType: row.template_type,
    claimType: row.claim_type,
    jurisdiction: row.jurisdiction,
    placeholderFields: typeof row.placeholder_fields === 'string' ? JSON.parse(row.placeholder_fields) : (row.placeholder_fields || []),
    governingLaw: typeof row.governing_law === 'string' ? JSON.parse(row.governing_law) : (row.governing_law || []),
    difficultyLevel: row.difficulty_level || 'basic',
    usageCount: row.usage_count || 0,
    successRate: row.success_rate ? parseFloat(row.success_rate) : null,
  };
}
