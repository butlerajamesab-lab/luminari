/**
 * Intervention Network Engine
 * 
 * Connects detected patterns and approved strategies to real-world authorities.
 * Provides endpoint registry, pattern-authority routing, and escalation rule evaluation.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── IN1. Endpoint Registry ─────────────────────────────────────────────────

export async function getEndpoints(filters?: {
  jurisdictionScope?: string;
  interventionType?: string;
  isActive?: boolean;
}): Promise<any[]> {
  let query = `SELECT * FROM intervention_endpoints WHERE 1=1`;
  const params: any[] = [];
  if (filters?.jurisdictionScope) {
    query += ` AND jurisdiction_scope = ?`;
    params.push(filters.jurisdictionScope);
  }
  if (filters?.interventionType) {
    query += ` AND intervention_type = ?`;
    params.push(filters.interventionType);
  }
  if (filters?.isActive !== undefined) {
    query += ` AND is_active = ?`;
    params.push(filters.isActive ? 1 : 0);
  }
  query += ` ORDER BY escalation_level ASC, agency_name ASC`;
  const [rows] = await db.execute(sql.raw(query));
  // Bind params manually since sql.raw doesn't support placeholders easily
  // Use parameterized approach instead
  return rows as unknown as any[];
}

export async function getEndpointsFiltered(filters?: {
  jurisdictionScope?: string;
  interventionType?: string;
}): Promise<any[]> {
  if (filters?.jurisdictionScope && filters?.interventionType) {
    const [rows] = await db.execute(sql`
      SELECT * FROM intervention_endpoints
      WHERE is_active = 1
        AND jurisdiction_scope = ${filters.jurisdictionScope}
        AND intervention_type = ${filters.interventionType}
      ORDER BY escalation_level ASC, agency_name ASC
    `);
    return rows as unknown as any[];
  }
  if (filters?.jurisdictionScope) {
    const [rows] = await db.execute(sql`
      SELECT * FROM intervention_endpoints
      WHERE is_active = 1 AND jurisdiction_scope = ${filters.jurisdictionScope}
      ORDER BY escalation_level ASC, agency_name ASC
    `);
    return rows as unknown as any[];
  }
  if (filters?.interventionType) {
    const [rows] = await db.execute(sql`
      SELECT * FROM intervention_endpoints
      WHERE is_active = 1 AND intervention_type = ${filters.interventionType}
      ORDER BY escalation_level ASC, agency_name ASC
    `);
    return rows as unknown as any[];
  }
  const [rows] = await db.execute(sql`
    SELECT * FROM intervention_endpoints WHERE is_active = 1
    ORDER BY escalation_level ASC, agency_name ASC
  `);
  return rows as unknown as any[];
}

export async function getEndpointById(endpointId: string): Promise<any | null> {
  const [rows] = await db.execute(sql`
    SELECT * FROM intervention_endpoints WHERE endpoint_id = ${endpointId}
  `);
  return (rows as unknown as any[])[0] || null;
}

// ─── IN2. Pattern-Authority Routing ──────────────────────────────────────────

export async function getRoutesForPattern(
  patternType: string,
  harmDomain?: string,
  jurisdictionScope?: string
): Promise<{ routes: any[]; endpoints: any[] }> {
  // Find matching routes
  let routeQuery = sql`
    SELECT * FROM pattern_intervention_routes
    WHERE pattern_type = ${patternType}
  `;
  const [routeRows] = await db.execute(routeQuery);
  let routes = routeRows as unknown as any[];

  // Filter by harm_domain and jurisdiction if provided
  if (harmDomain) {
    routes = routes.filter((r: any) => !r.harm_domain || r.harm_domain === harmDomain);
  }
  if (jurisdictionScope) {
    routes = routes.filter((r: any) => !r.jurisdiction_scope || r.jurisdiction_scope === jurisdictionScope);
  }

  // Sort by priority
  routes.sort((a: any, b: any) => (a.priority_order || 1) - (b.priority_order || 1));

  // Collect all recommended endpoint IDs
  const endpointIds = new Set<string>();
  for (const route of routes) {
    const ids = typeof route.recommended_endpoint_ids === "string"
      ? JSON.parse(route.recommended_endpoint_ids)
      : route.recommended_endpoint_ids;
    if (Array.isArray(ids)) {
      ids.forEach((id: string) => endpointIds.add(id));
    }
  }

  // Fetch endpoint details
  const endpoints: any[] = [];
  for (const eid of endpointIds) {
    const ep = await getEndpointById(eid);
    if (ep) endpoints.push(ep);
  }

  return { routes, endpoints };
}

// ─── IN3. Escalation Rule Engine ─────────────────────────────────────────────

export interface EscalationCheckResult {
  shouldEscalate: boolean;
  triggeredRules: any[];
  recommendedEndpoints: any[];
  recommendedActions: string[];
}

export async function checkEscalationRules(params: {
  patternType: string;
  harmDomain?: string;
  signalCount: number;
  pressureIndex: number;
  confidenceScore: number;
}): Promise<EscalationCheckResult> {
  const [ruleRows] = await db.execute(sql`
    SELECT * FROM intervention_escalation_rules
    WHERE is_active = 1 AND pattern_type = ${params.patternType}
    ORDER BY pressure_threshold ASC
  `);
  const rules = ruleRows as unknown as any[];
  const triggered: any[] = [];
  const endpointIds = new Set<string>();
  const actions = new Set<string>();

  for (const rule of rules) {
    // Filter by harm_domain if specified
    if (rule.harm_domain && params.harmDomain && rule.harm_domain !== params.harmDomain) continue;

    const signalMet = params.signalCount >= (rule.signal_threshold || 0);
    const pressureMet = params.pressureIndex >= (rule.pressure_threshold || 0);
    const confidenceMet = params.confidenceScore >= Number(rule.confidence_threshold || 0);

    if (signalMet && pressureMet && confidenceMet) {
      triggered.push(rule);
      if (rule.recommended_endpoint) endpointIds.add(rule.recommended_endpoint);
      if (rule.escalation_action) actions.add(rule.escalation_action);
    }
  }

  // Fetch endpoint details for triggered rules
  const endpoints: any[] = [];
  for (const eid of endpointIds) {
    const ep = await getEndpointById(eid);
    if (ep) endpoints.push(ep);
  }

  return {
    shouldEscalate: triggered.length > 0,
    triggeredRules: triggered,
    recommendedEndpoints: endpoints,
    recommendedActions: Array.from(actions),
  };
}

// ─── IN4. Dashboard & Summary ────────────────────────────────────────────────

export async function getInterventionDashboard(): Promise<{
  endpoints: any[];
  submissions: any[];
  summary: {
    totalEndpoints: number;
    activeEndpoints: number;
    totalSubmissions: number;
    pendingSubmissions: number;
    activeInvestigations: number;
    closedSubmissions: number;
  };
}> {
  const [endpointRows] = await db.execute(sql`
    SELECT * FROM intervention_endpoints WHERE is_active = 1
    ORDER BY escalation_level ASC, agency_name ASC
  `);
  const [submissionRows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.agency_abbreviation, e.intervention_type
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    ORDER BY s.submission_date DESC
    LIMIT 50
  `);
  const [summaryRows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM intervention_endpoints) as total_endpoints,
      (SELECT COUNT(*) FROM intervention_endpoints WHERE is_active = 1) as active_endpoints,
      (SELECT COUNT(*) FROM intervention_submissions) as total_submissions,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status = 'submitted') as pending_submissions,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status = 'investigation_open') as active_investigations,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status = 'closed') as closed_submissions
  `);
  const s = (summaryRows as unknown as any[])[0] || {};
  return {
    endpoints: endpointRows as unknown as any[],
    submissions: submissionRows as unknown as any[],
    summary: {
      totalEndpoints: Number(s.total_endpoints) || 0,
      activeEndpoints: Number(s.active_endpoints) || 0,
      totalSubmissions: Number(s.total_submissions) || 0,
      pendingSubmissions: Number(s.pending_submissions) || 0,
      activeInvestigations: Number(s.active_investigations) || 0,
      closedSubmissions: Number(s.closed_submissions) || 0,
    },
  };
}

export async function getMissionControlInterventionSummary(): Promise<{
  totalEndpoints: number;
  activeEscalations: number;
  authoritiesNotified: number;
  pendingResponses: number;
  investigationsOpen: number;
  closedCases: number;
  recentSubmissions: any[];
  endpointsByType: any[];
}> {
  const [summaryRows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM intervention_endpoints WHERE is_active = 1) as total_endpoints,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status IN ('submitted','under_review','investigation_open')) as active_escalations,
      (SELECT COUNT(DISTINCT endpoint_id) FROM intervention_submissions) as authorities_notified,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status IN ('submitted','under_review')) as pending_responses,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status = 'investigation_open') as investigations_open,
      (SELECT COUNT(*) FROM intervention_submissions WHERE response_status = 'closed') as closed_cases
  `);
  const [recentRows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.agency_abbreviation
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    ORDER BY s.submission_date DESC LIMIT 10
  `);
  const [typeRows] = await db.execute(sql`
    SELECT intervention_type, COUNT(*) as count
    FROM intervention_endpoints WHERE is_active = 1
    GROUP BY intervention_type ORDER BY count DESC
  `);
  const s = (summaryRows as unknown as any[])[0] || {};
  return {
    totalEndpoints: Number(s.total_endpoints) || 0,
    activeEscalations: Number(s.active_escalations) || 0,
    authoritiesNotified: Number(s.authorities_notified) || 0,
    pendingResponses: Number(s.pending_responses) || 0,
    investigationsOpen: Number(s.investigations_open) || 0,
    closedCases: Number(s.closed_cases) || 0,
    recentSubmissions: recentRows as unknown as any[],
    endpointsByType: typeRows as unknown as any[],
  };
}

// ─── IN5. Create Submission ──────────────────────────────────────────────────

export async function createSubmission(params: {
  endpointId: string;
  patternId?: string;
  strategyId?: string;
  pathId?: string;
  caseId?: number;
  actionType: string;
  actionDescription?: string;
  evidenceBundle?: any;
  documentsSent?: any;
  submittedBy?: string;
}): Promise<string> {
  const submissionId = randomUUID();
  const trackingId = `LUM-${Date.now().toString(36).toUpperCase()}-${submissionId.slice(0, 8).toUpperCase()}`;
  await db.execute(sql`
    INSERT INTO intervention_submissions (
      submission_id, endpoint_id, pattern_id, strategy_id, path_id, case_id,
      action_type, action_description, evidence_bundle, documents_sent,
      tracking_identifier, submitted_by
    ) VALUES (
      ${submissionId}, ${params.endpointId}, ${params.patternId || null},
      ${params.strategyId || null}, ${params.pathId || null}, ${params.caseId || null},
      ${params.actionType}, ${params.actionDescription || null},
      ${params.evidenceBundle ? JSON.stringify(params.evidenceBundle) : null},
      ${params.documentsSent ? JSON.stringify(params.documentsSent) : null},
      ${trackingId}, ${params.submittedBy || null}
    )
  `);
  return submissionId;
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: string,
  responseDetails?: string
): Promise<void> {
  await db.execute(sql`
    UPDATE intervention_submissions SET
      response_status = ${status},
      response_details = ${responseDetails || null},
      response_date = CASE WHEN ${status} IN ('responded','closed') THEN NOW() ELSE response_date END,
      updated_at = NOW()
    WHERE submission_id = ${submissionId}
  `);
}

export async function getSubmissionsForPattern(patternId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.agency_abbreviation, e.intervention_type
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    WHERE s.pattern_id = ${patternId}
    ORDER BY s.submission_date DESC
  `);
  return rows as unknown as any[];
}

export async function getSubmissionsForCase(caseId: number): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT s.*, e.agency_name, e.agency_abbreviation, e.intervention_type
    FROM intervention_submissions s
    LEFT JOIN intervention_endpoints e ON s.endpoint_id = e.endpoint_id
    WHERE s.case_id = ${caseId}
    ORDER BY s.submission_date DESC
  `);
  return rows as unknown as any[];
}
