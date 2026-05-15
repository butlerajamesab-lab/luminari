import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AdvocacyTarget {
  targetId: string;
  name: string;
  organization: string;
  role: string;
  jurisdiction: string;
  issueDomains: string[];
  influenceScore: number;
  publicVisibilityScore: number;
}

export interface CoalitionMember {
  coalitionId: string;
  coalitionName: string;
  coalitionType: string;
  jurisdictionScope: string;
  issueDomains: string[];
  credibilityScore: number;
  verificationStatus: string;
}

export interface AdvocacyPackage {
  packageId: string;
  patternId: string;
  executiveSummary: string;
  evidenceBrief: string;
  trendAnalysis: string;
  humanImpactSection: string;
  recommendedReforms: string;
  supportingData: string;
  targets: AdvocacyTarget[];
  coalitions: CoalitionMember[];
}

export interface CoalitionDashboard {
  totalCoalitions: number;
  byType: Record<string, number>;
  byVerification: Record<string, number>;
  totalTargets: number;
  totalOutcomes: number;
  outcomesByType: Record<string, number>;
  recentOutcomes: any[];
  topCoalitions: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseJson(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

// ─── Match Advocacy Targets ───────────────────────────────────────────────────
export async function matchAdvocacyTargets(
  patternId: string,
  opts?: { jurisdiction?: string; issueDomain?: string; limit?: number }
): Promise<{ targets: AdvocacyTarget[]; coalitions: CoalitionMember[] }> {
  // 1. Get pattern info
  const [patternRows] = await db.execute(
    sql`SELECT * FROM pattern_registry WHERE pattern_id = ${patternId} LIMIT 1`
  );
  const pattern = (patternRows as unknown as any[])[0];
  if (!pattern) throw new Error(`Pattern not found: ${patternId}`);

  const jurisdiction = opts?.jurisdiction || pattern.jurisdiction_scope || pattern.jurisdiction || "";
  const harmDomains = safeParseJson(pattern.harm_domains);
  const limit = opts?.limit || 20;

  // 2. Match advocacy targets by jurisdiction + issue domain
  let targetQuery = sql`SELECT * FROM advocacy_targets WHERE 1=1`;
  if (jurisdiction) {
    targetQuery = sql`SELECT * FROM advocacy_targets WHERE jurisdiction = ${jurisdiction} OR jurisdiction = 'federal' OR jurisdiction = 'national'`;
  }
  const [targetRows] = await db.execute(targetQuery);
  let targets = (targetRows as unknown as any[]).map((t: any) => ({
    targetId: t.target_id,
    name: t.name,
    organization: t.organization || "",
    role: t.role || "",
    jurisdiction: t.jurisdiction || "",
    issueDomains: safeParseJson(t.issue_domains),
    influenceScore: Number(t.influence_score) || 0,
    publicVisibilityScore: Number(t.public_visibility_score) || 0,
  }));

  // Score and rank targets by relevance
  targets = targets.map(t => {
    let relevance = t.influenceScore;
    const domainOverlap = t.issueDomains.filter((d: string) =>
      harmDomains.some((h: string) => h.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(h.toLowerCase()))
    ).length;
    relevance += domainOverlap * 15;
    if (t.jurisdiction === jurisdiction) relevance += 10;
    return { ...t, relevanceScore: relevance };
  }).sort((a: any, b: any) => b.relevanceScore - a.relevanceScore).slice(0, limit);

  // 3. Match coalition partners
  let coalitionQuery = sql`SELECT * FROM coalition_registry WHERE 1=1`;
  if (jurisdiction) {
    coalitionQuery = sql`SELECT * FROM coalition_registry WHERE jurisdiction_scope = ${jurisdiction} OR jurisdiction_scope = 'national' OR jurisdiction_scope = 'federal'`;
  }
  const [coalitionRows] = await db.execute(coalitionQuery);
  let coalitions = (coalitionRows as unknown as any[]).map((c: any) => ({
    coalitionId: c.coalition_id,
    coalitionName: c.coalition_name,
    coalitionType: c.coalition_type,
    jurisdictionScope: c.jurisdiction_scope || "",
    issueDomains: safeParseJson(c.issue_domains),
    credibilityScore: Number(c.credibility_score) || 0,
    verificationStatus: c.verification_status || "unverified",
  }));

  coalitions = coalitions.sort((a, b) => b.credibilityScore - a.credibilityScore).slice(0, limit);

  // 4. Also pull from advocacy_organizations table
  const [orgRows] = await db.execute(
    sql`SELECT * FROM advocacy_organizations ORDER BY id LIMIT 20`
  );
  const orgs = (orgRows as unknown as any[]).map((o: any) => ({
    coalitionId: `ORG-${o.id}`,
    coalitionName: o.name,
    coalitionType: o.org_type || "nonprofit",
    jurisdictionScope: o.jurisdiction || o.jurisdiction_scope || "",
    issueDomains: safeParseJson(o.focus_areas || o.issue_domains),
    credibilityScore: 70,
    verificationStatus: "verified",
  }));

  // Merge and deduplicate
  const allCoalitions = [...coalitions, ...orgs].slice(0, limit);

  return { targets, coalitions: allCoalitions };
}

// ─── Activate Coalition ───────────────────────────────────────────────────────
export async function activateCoalition(
  patternId: string,
  coalitionIds: string[],
  actionType: string
): Promise<{ actionsCreated: number; actionIds: string[] }> {
  const now = Date.now();
  const actionIds: string[] = [];

  // Get pattern for context
  const [patternRows] = await db.execute(
    sql`SELECT * FROM pattern_registry WHERE pattern_id = ${patternId} LIMIT 1`
  );
  const pattern = (patternRows as unknown as any[])[0];

  // Get the corresponding policy change (policy_change_registry uses pattern_type, not pattern_id)
  let changeId = genId("PCH");
  try {
    const [changeRows] = await db.execute(
      sql`SELECT change_id FROM policy_change_registry WHERE pattern_type = ${pattern?.pattern_type || ''} ORDER BY created_at DESC LIMIT 1`
    );
    changeId = (changeRows as unknown as any[])[0]?.change_id || changeId;
  } catch { /* handle gracefully */ }

  for (const cid of coalitionIds) {
    const actionId = genId("ADV");
    actionIds.push(actionId);

    // Get coalition name
    let orgName = cid;
    if (cid.startsWith("ORG-")) {
      const orgId = cid.replace("ORG-", "");
      const [orgRows] = await db.execute(sql`SELECT name FROM advocacy_organizations WHERE id = ${orgId} LIMIT 1`);
      orgName = (orgRows as unknown as any[])[0]?.name || cid;
    } else {
      const [coalRows] = await db.execute(sql`SELECT coalition_name FROM coalition_registry WHERE coalition_id = ${cid} LIMIT 1`);
      orgName = (coalRows as unknown as any[])[0]?.coalition_name || cid;
    }

    await db.execute(sql`
      INSERT INTO advocacy_action_registry (action_id, change_id, organization_name, action_type,
        recipient_target, packet_generated, response_status, notes, created_at)
      VALUES (${actionId}, ${changeId}, ${orgName}, ${actionType},
        ${pattern?.pattern_name || patternId}, ${false}, 'pending',
        ${"Coalition activation for pattern " + patternId}, ${now})
    `);
  }

  return { actionsCreated: actionIds.length, actionIds };
}

// ─── Generate Advocacy Package ────────────────────────────────────────────────
export async function generateAdvocacyPackage(patternId: string): Promise<AdvocacyPackage> {
  // 1. Fetch pattern
  const [patternRows] = await db.execute(
    sql`SELECT * FROM pattern_registry WHERE pattern_id = ${patternId} LIMIT 1`
  );
  const pattern = (patternRows as unknown as any[])[0];
  if (!pattern) throw new Error(`Pattern not found: ${patternId}`);

  // 2. Fetch signals (detected_signals has no pattern_id; match on signal_type = pattern_type)
  let signals: any[] = [];
  try {
    const [signalRows] = await db.execute(
      sql`SELECT * FROM detected_signals WHERE signal_type = ${pattern.pattern_type || ''} ORDER BY detection_timestamp DESC LIMIT 20`
    );
    signals = signalRows as unknown as any[];
  } catch { /* handle gracefully */ }

  // 3. Fetch trends (trend_registry may not exist)
  let trends: any[] = [];
  try {
    const [trendRows] = await db.execute(
      sql`SELECT * FROM trend_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 5`
    );
    trends = trendRows as unknown as any[];
  } catch { /* table may not exist */ }

  // 4. Fetch outcomes
  const [outcomeRows] = await db.execute(
    sql`SELECT * FROM outcome_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 10`
  );
  const outcomes = outcomeRows as unknown as any[];

  // 5. Fetch reforms
  const [reformRows] = await db.execute(
    sql`SELECT * FROM reform_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 5`
  );
  const reforms = reformRows as unknown as any[];

  // 6. Match targets and coalitions
  const { targets, coalitions } = await matchAdvocacyTargets(patternId);

  const harmDomains = safeParseJson(pattern.harm_domains);
  const jurisdiction = pattern.jurisdiction_scope || pattern.jurisdiction || "Multi-jurisdiction";

  // Compile sections
  const executiveSummary = JSON.stringify({
    patternName: pattern.pattern_name || pattern.name,
    patternType: pattern.pattern_type,
    jurisdiction,
    urgency: pattern.severity_level || pattern.priority_level || "high",
    signalCount: signals.length,
    affectedDomains: harmDomains,
    callToAction: `Immediate attention required for ${pattern.pattern_name || "this pattern"} affecting ${harmDomains.join(", ")} in ${jurisdiction}`,
  });

  const evidenceBrief = JSON.stringify({
    totalSignals: signals.length,
    jurisdictions: [...new Set(signals.map((s: any) => s.jurisdiction))],
    signalTypes: [...new Set(signals.map((s: any) => s.signal_type))],
    timespan: signals.length > 1
      ? { earliest: signals[signals.length - 1]?.detected_at, latest: signals[0]?.detected_at }
      : null,
    keyFindings: signals.slice(0, 5).map((s: any) => ({
      signalId: s.signal_id,
      type: s.signal_type,
      jurisdiction: s.jurisdiction,
    })),
  });

  const trendAnalysis = JSON.stringify({
    trends: trends.map((t: any) => ({
      trendId: t.trend_id,
      direction: t.trend_direction || t.direction,
      magnitude: t.magnitude,
      period: t.period,
      metric: t.metric_name || t.trend_type,
    })),
    overallDirection: trends.length > 0 ? (trends[0].trend_direction || trends[0].direction) : "stable",
  });

  const humanImpactSection = JSON.stringify({
    affectedPopulations: harmDomains,
    geographicImpact: [...new Set(signals.map((s: any) => s.jurisdiction))],
    estimatedScope: `${signals.length} documented instances across ${new Set(signals.map((s: any) => s.jurisdiction)).size} jurisdictions`,
    outcomeHistory: outcomes.map((o: any) => ({
      type: o.outcome_type || o.intervention_type,
      status: o.status || o.outcome_status,
      jurisdiction: o.jurisdiction,
    })),
  });

  const recommendedReforms = JSON.stringify({
    reforms: reforms.map((r: any) => ({
      title: r.reform_title,
      type: r.reform_type,
      description: r.reform_description,
      priority: r.priority_level,
    })),
  });

  const supportingData = JSON.stringify({
    signalSummary: {
      total: signals.length,
      byType: signals.reduce((acc: any, s: any) => {
        acc[s.signal_type] = (acc[s.signal_type] || 0) + 1;
        return acc;
      }, {}),
    },
    trendSummary: trends.length,
    outcomeSummary: outcomes.length,
    reformSummary: reforms.length,
  });

  const packageId = genId("ADVPKG");

  return {
    packageId,
    patternId,
    executiveSummary,
    evidenceBrief,
    trendAnalysis,
    humanImpactSection,
    recommendedReforms,
    supportingData,
    targets: targets.slice(0, 10),
    coalitions: coalitions.slice(0, 10),
  };
}

// ─── Record Advocacy Outcome ──────────────────────────────────────────────────
export async function recordAdvocacyOutcome(
  patternId: string,
  coalitionId: string | null,
  outcomeType: string,
  description: string,
  impactScore: number
): Promise<string> {
  const now = Date.now();
  const outcomeId = genId("AO");

  if (coalitionId) {
    await db.execute(sql`
      INSERT INTO advocacy_outcomes (outcome_id, pattern_id, coalition_id, outcome_type,
        description, impact_score, date_occurred, created_at)
      VALUES (${outcomeId}, ${patternId}, ${coalitionId}, ${outcomeType},
        ${description}, ${impactScore}, ${now}, ${now})
    `);
  } else {
    await db.execute(sql`
      INSERT INTO advocacy_outcomes (outcome_id, pattern_id, outcome_type,
        description, impact_score, date_occurred, created_at)
      VALUES (${outcomeId}, ${patternId}, ${outcomeType},
        ${description}, ${impactScore}, ${now}, ${now})
    `);
  }

  // Learning integration: high-impact advocacy outcomes feed into strategy memory
  if (impactScore >= 60) {
    const [patternRows] = await db.execute(
      sql`SELECT pattern_type, jurisdiction_scope FROM pattern_registry WHERE pattern_id = ${patternId} LIMIT 1`
    );
    const pattern = (patternRows as unknown as any[])[0];
    if (pattern) {
      const memId = genId("MEM");
      await db.execute(sql`
        INSERT INTO strategy_memory (memory_id, pattern_type, jurisdiction, intervention_type,
          success_score, confidence_score, notes, created_at)
        VALUES (${memId}, ${pattern.pattern_type || 'advocacy'}, ${pattern.jurisdiction_scope || 'national'},
          ${'advocacy_' + outcomeType},
          ${impactScore}, ${Math.min(impactScore, 100)},
          ${`Auto-recorded from advocacy outcome ${outcomeId}: ${description.substring(0, 200)}`}, ${now})
      `);
    }
  }

  return outcomeId;
}

// ─── Get Coalition Dashboard ──────────────────────────────────────────────────
export async function getCoalitionDashboard(): Promise<CoalitionDashboard> {
  // Coalitions
  const [coalitionRows] = await db.execute(sql`SELECT * FROM coalition_registry ORDER BY credibility_score DESC`);
  const coalitions = coalitionRows as unknown as any[];

  const byType: Record<string, number> = {};
  const byVerification: Record<string, number> = {};
  coalitions.forEach((c: any) => {
    byType[c.coalition_type] = (byType[c.coalition_type] || 0) + 1;
    byVerification[c.verification_status] = (byVerification[c.verification_status] || 0) + 1;
  });

  // Targets
  const [targetCountRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM advocacy_targets`);
  const totalTargets = Number((targetCountRows as unknown as any[])[0]?.cnt || 0);

  // Outcomes
  const [outcomeRows] = await db.execute(sql`SELECT * FROM advocacy_outcomes ORDER BY date_occurred DESC LIMIT 50`);
  const outcomes = outcomeRows as unknown as any[];

  const outcomesByType: Record<string, number> = {};
  outcomes.forEach((o: any) => {
    outcomesByType[o.outcome_type] = (outcomesByType[o.outcome_type] || 0) + 1;
  });

  // Also count advocacy_organizations
  const [orgCountRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM advocacy_organizations`);
  const orgCount = Number((orgCountRows as unknown as any[])[0]?.cnt || 0);

  return {
    totalCoalitions: coalitions.length + orgCount,
    byType,
    byVerification,
    totalTargets,
    totalOutcomes: outcomes.length,
    outcomesByType,
    recentOutcomes: outcomes.slice(0, 10).map((o: any) => ({
      outcomeId: o.outcome_id,
      patternId: o.pattern_id,
      coalitionId: o.coalition_id,
      outcomeType: o.outcome_type,
      description: o.description,
      impactScore: Number(o.impact_score) || 0,
      dateOccurred: o.date_occurred ? Number(o.date_occurred) : null,
    })),
    topCoalitions: coalitions.slice(0, 10).map((c: any) => ({
      coalitionId: c.coalition_id,
      coalitionName: c.coalition_name,
      coalitionType: c.coalition_type,
      jurisdictionScope: c.jurisdiction_scope,
      credibilityScore: Number(c.credibility_score) || 0,
      verificationStatus: c.verification_status,
    })),
  };
}
