import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReformPackage {
  packageId: string;
  patternId: string;
  title: string;
  status: string;
  executiveSummary: string;
  evidenceSection: string;
  rootCauseSection: string;
  interventionHistorySection: string;
  recommendedReformsSection: string;
  implementationRoadmapSection: string;
  supportingDataSection: string;
  jurisdiction: string;
  reformType: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReformPackageDashboard {
  total: number;
  byStatus: Record<string, number>;
  byJurisdiction: Record<string, number>;
  byReformType: Record<string, number>;
  recentPackages: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Generate Reform Package ──────────────────────────────────────────────────
export async function generateReformPackage(patternId: string): Promise<ReformPackage> {
  const now = Date.now();

  // 1. Fetch pattern data
  const [patternRows] = await db.execute(
    sql`SELECT * FROM pattern_registry WHERE pattern_id = ${patternId} LIMIT 1`
  );
  const pattern = (patternRows as unknown as any[])[0];
  if (!pattern) throw new Error(`Pattern not found: ${patternId}`);

  // 2. Fetch trend data (trend_registry may not exist, handle gracefully)
  let trends: any[] = [];
  try {
    const [trendRows] = await db.execute(
      sql`SELECT * FROM trend_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 5`
    );
    trends = trendRows as unknown as any[];
  } catch { /* table may not exist */ }

  // 3. Fetch detected signals (detected_signals has no pattern_id column; use signal_type matching pattern_type)
  let signals: any[] = [];
  try {
    const [signalRows] = await db.execute(
      sql`SELECT * FROM detected_signals WHERE signal_type = ${pattern.pattern_type || ''} ORDER BY detection_timestamp DESC LIMIT 20`
    );
    signals = signalRows as unknown as any[];
  } catch { /* handle gracefully */ }

  // 4. Fetch outcome data
  const [outcomeRows] = await db.execute(
    sql`SELECT * FROM outcome_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 10`
  );
  const outcomes = outcomeRows as unknown as any[];

  // 5. Fetch strategy paths
  const [strategyRows] = await db.execute(
    sql`SELECT * FROM sys_strategy_paths WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 5`
  );
  const strategies = strategyRows as unknown as any[];

  // 6. Fetch reform registry entries
  const [reformRows] = await db.execute(
    sql`SELECT * FROM reform_registry WHERE pattern_id = ${patternId} ORDER BY created_at DESC LIMIT 5`
  );
  const reforms = reformRows as unknown as any[];

  // 7. Fetch policy impact data (policy_change_registry uses pattern_type, not pattern_id)
  let policyChanges: any[] = [];
  try {
    const [policyRows] = await db.execute(
      sql`SELECT * FROM policy_change_registry WHERE pattern_type = ${pattern.pattern_type || ''} ORDER BY created_at DESC LIMIT 5`
    );
    policyChanges = policyRows as unknown as any[];
  } catch { /* handle gracefully */ }

  // 8. Fetch memory data
  const [memoryRows] = await db.execute(
    sql`SELECT * FROM strategy_memory WHERE pattern_type = ${pattern.pattern_type || ''} ORDER BY success_score DESC LIMIT 5`
  );
  const memories = memoryRows as unknown as any[];

  // ─── Compile Sections ─────────────────────────────────────────────────────
  const jurisdiction = pattern.jurisdiction_scope || pattern.jurisdiction || "Multi-jurisdiction";
  const harmDomains = (() => {
    try {
      const d = pattern.harm_domains || pattern.harm_domain;
      return Array.isArray(d) ? d : typeof d === "string" ? JSON.parse(d) : [d];
    } catch { return []; }
  })();

  // Executive Summary
  const executiveSummary = JSON.stringify({
    patternName: pattern.pattern_name || pattern.name,
    patternType: pattern.pattern_type,
    scopeOfImpact: `${signals.length} signals detected across ${new Set(signals.map((s: any) => s.jurisdiction)).size} jurisdictions`,
    affectedPopulations: harmDomains.join(", "),
    urgencyLevel: pattern.severity_level || pattern.priority_level || "high",
    summaryOfEvidence: `${signals.length} signals, ${trends.length} trend analyses, ${outcomes.length} documented outcomes`,
    jurisdiction,
  });

  // Evidence of the Problem
  const evidenceSection = JSON.stringify({
    signalCount: signals.length,
    trendAnalyses: trends.map((t: any) => ({
      trendId: t.trend_id,
      direction: t.trend_direction || t.direction,
      magnitude: t.magnitude,
      period: t.period,
    })),
    geographicSpread: [...new Set(signals.map((s: any) => s.jurisdiction))],
    entitiesInvolved: [...new Set(signals.map((s: any) => s.entity_id).filter(Boolean))],
    historicalGrowthRate: trends.length > 0 ? trends[0].growth_rate || null : null,
  });

  // Root Cause Analysis
  const rootCauseSection = JSON.stringify({
    regulatoryGaps: pattern.regulatory_gaps || "Analysis pending",
    enforcementFailures: pattern.enforcement_failures || "Analysis pending",
    proceduralBarriers: pattern.procedural_barriers || "Analysis pending",
    informationAsymmetry: pattern.information_asymmetry || "Analysis pending",
    strategyInsights: memories.map((m: any) => ({
      strategyName: m.strategy_name,
      successScore: m.success_score,
      signalReduction: m.signal_reduction_pct,
    })),
  });

  // Intervention History
  const interventionHistorySection = JSON.stringify({
    interventions: outcomes.map((o: any) => ({
      outcomeId: o.outcome_id,
      interventionType: o.intervention_type || o.outcome_type,
      agency: o.agency_involved || o.jurisdiction,
      outcome: o.outcome_status || o.status,
      cost: o.cost_estimate,
      effectiveness: o.effectiveness_score,
    })),
    totalInterventions: outcomes.length,
    successRate: outcomes.length > 0
      ? (outcomes.filter((o: any) => (o.outcome_status || o.status) === "successful").length / outcomes.length * 100).toFixed(1)
      : "0",
  });

  // Recommended Reforms
  const recommendedReformsSection = JSON.stringify({
    reforms: reforms.map((r: any, i: number) => ({
      reformName: r.reform_title,
      type: r.reform_type,
      expectedImpact: r.reform_description,
      estimatedCost: r.estimated_cost || "To be determined",
      supportingEvidence: `${r.supporting_signal_count || 0} signals`,
      legalReferences: r.legal_references || "See supporting data appendix",
      priority: i + 1,
    })),
    policyChanges: policyChanges.map((pc: any) => ({
      changeId: pc.change_id,
      title: pc.title,
      status: pc.status,
      jurisdiction: pc.jurisdiction,
    })),
  });

  // Implementation Roadmap
  const implementationRoadmapSection = JSON.stringify({
    steps: strategies.map((s: any, i: number) => ({
      step: i + 1,
      responsibleAgency: s.target_agency || "To be assigned",
      requiredAuthority: s.authority_level || "Regulatory",
      timeline: s.estimated_timeline || "6-12 months",
      resourcesNeeded: s.resource_requirements || "To be determined",
      measurableMilestones: s.success_criteria || "Signal reduction, compliance improvement",
    })),
  });

  // Supporting Data Appendix
  const supportingDataSection = JSON.stringify({
    signalDataset: signals.slice(0, 10).map((s: any) => ({
      signalId: s.signal_id,
      type: s.signal_type,
      jurisdiction: s.jurisdiction,
      detectedAt: s.detected_at,
    })),
    trendTables: trends.map((t: any) => ({
      trendId: t.trend_id,
      metric: t.metric_name || t.trend_type,
      value: t.current_value,
      change: t.change_pct,
    })),
    interventionResults: outcomes.slice(0, 5).map((o: any) => ({
      outcomeId: o.outcome_id,
      type: o.outcome_type,
      status: o.status || o.outcome_status,
    })),
    jurisdictionComparisons: [...new Set(signals.map((s: any) => s.jurisdiction))].map(j => ({
      jurisdiction: j,
      signalCount: signals.filter((s: any) => s.jurisdiction === j).length,
    })),
  });

  const title = `Reform Package: ${pattern.pattern_name || pattern.name} — ${jurisdiction}`;
  const packageId = genId("RPK");
  const reformType = reforms.length > 0 ? reforms[0].reform_type : "legislative_change";

  // Insert into reform_packages
  await db.execute(sql`
    INSERT INTO reform_packages (package_id, pattern_id, title, status, executive_summary, evidence_section,
      root_cause_section, intervention_history_section, recommended_reforms_section,
      implementation_roadmap_section, supporting_data_section, jurisdiction, reform_type, created_at, updated_at)
    VALUES (${packageId}, ${patternId}, ${title}, 'draft', ${executiveSummary}, ${evidenceSection},
      ${rootCauseSection}, ${interventionHistorySection}, ${recommendedReformsSection},
      ${implementationRoadmapSection}, ${supportingDataSection}, ${jurisdiction}, ${reformType}, ${now}, ${now})
  `);

  return {
    packageId, patternId, title, status: "draft",
    executiveSummary, evidenceSection, rootCauseSection,
    interventionHistorySection, recommendedReformsSection,
    implementationRoadmapSection, supportingDataSection,
    jurisdiction, reformType, createdAt: now, updatedAt: now,
  };
}

// ─── Export Reform Package (Markdown/HTML) ────────────────────────────────────
export async function exportReformPackage(
  packageId: string,
  format: "markdown" | "html" | "json"
): Promise<{ content: string; mimeType: string; filename: string }> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
  );
  const pkg = (rows as unknown as any[])[0];
  if (!pkg) throw new Error(`Reform package not found: ${packageId}`);

  const parse = (s: string | null) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
  const exec = parse(pkg.executive_summary);
  const evidence = parse(pkg.evidence_section);
  const rootCause = parse(pkg.root_cause_section);
  const interventions = parse(pkg.intervention_history_section);
  const reforms = parse(pkg.recommended_reforms_section);
  const roadmap = parse(pkg.implementation_roadmap_section);
  const appendix = parse(pkg.supporting_data_section);

  if (format === "json") {
    return {
      content: JSON.stringify({ package: pkg, sections: { exec, evidence, rootCause, interventions, reforms, roadmap, appendix } }, null, 2),
      mimeType: "application/json",
      filename: `${packageId}.json`,
    };
  }

  // Build Markdown
  let md = `# ${pkg.title}\n\n`;
  md += `**Status:** ${pkg.status} | **Jurisdiction:** ${pkg.jurisdiction} | **Reform Type:** ${pkg.reform_type}\n\n`;
  md += `**Generated:** ${new Date(Number(pkg.created_at)).toLocaleDateString()}\n\n---\n\n`;

  // Executive Summary
  md += `## 1. Executive Summary\n\n`;
  md += `**Pattern:** ${exec.patternName || "N/A"}\n\n`;
  md += `**Type:** ${exec.patternType || "N/A"}\n\n`;
  md += `**Scope of Impact:** ${exec.scopeOfImpact || "N/A"}\n\n`;
  md += `**Affected Populations:** ${exec.affectedPopulations || "N/A"}\n\n`;
  md += `**Urgency Level:** ${exec.urgencyLevel || "N/A"}\n\n`;
  md += `**Summary of Evidence:** ${exec.summaryOfEvidence || "N/A"}\n\n---\n\n`;

  // Evidence
  md += `## 2. Evidence of the Problem\n\n`;
  md += `**Signal Count:** ${evidence.signalCount || 0}\n\n`;
  md += `**Geographic Spread:** ${(evidence.geographicSpread || []).join(", ") || "N/A"}\n\n`;
  if (evidence.trendAnalyses?.length) {
    md += `| Trend ID | Direction | Magnitude |\n|---|---|---|\n`;
    evidence.trendAnalyses.forEach((t: any) => { md += `| ${t.trendId} | ${t.direction} | ${t.magnitude} |\n`; });
    md += `\n`;
  }
  md += `---\n\n`;

  // Root Cause
  md += `## 3. Root Cause Analysis\n\n`;
  md += `**Regulatory Gaps:** ${rootCause.regulatoryGaps || "N/A"}\n\n`;
  md += `**Enforcement Failures:** ${rootCause.enforcementFailures || "N/A"}\n\n`;
  md += `**Procedural Barriers:** ${rootCause.proceduralBarriers || "N/A"}\n\n`;
  md += `**Information Asymmetry:** ${rootCause.informationAsymmetry || "N/A"}\n\n`;
  md += `---\n\n`;

  // Intervention History
  md += `## 4. Intervention History\n\n`;
  md += `**Total Interventions:** ${interventions.totalInterventions || 0} | **Success Rate:** ${interventions.successRate || 0}%\n\n`;
  if (interventions.interventions?.length) {
    md += `| Type | Agency | Outcome | Cost | Effectiveness |\n|---|---|---|---|---|\n`;
    interventions.interventions.forEach((i: any) => {
      md += `| ${i.interventionType} | ${i.agency} | ${i.outcome} | ${i.cost || "N/A"} | ${i.effectiveness || "N/A"} |\n`;
    });
    md += `\n`;
  }
  md += `---\n\n`;

  // Recommended Reforms
  md += `## 5. Recommended Reforms\n\n`;
  if (reforms.reforms?.length) {
    reforms.reforms.forEach((r: any) => {
      md += `### ${r.priority}. ${r.reformName}\n\n`;
      md += `**Type:** ${r.type} | **Expected Impact:** ${r.expectedImpact}\n\n`;
      md += `**Estimated Cost:** ${r.estimatedCost} | **Supporting Evidence:** ${r.supportingEvidence}\n\n`;
      md += `**Legal References:** ${r.legalReferences}\n\n`;
    });
  }
  md += `---\n\n`;

  // Implementation Roadmap
  md += `## 6. Implementation Roadmap\n\n`;
  if (roadmap.steps?.length) {
    md += `| Step | Agency | Authority | Timeline | Resources | Milestones |\n|---|---|---|---|---|---|\n`;
    roadmap.steps.forEach((s: any) => {
      md += `| ${s.step} | ${s.responsibleAgency} | ${s.requiredAuthority} | ${s.timeline} | ${s.resourcesNeeded} | ${s.measurableMilestones} |\n`;
    });
    md += `\n`;
  }
  md += `---\n\n`;

  // Supporting Data
  md += `## 7. Supporting Data Appendix\n\n`;
  if (appendix.jurisdictionComparisons?.length) {
    md += `### Jurisdiction Comparisons\n\n`;
    md += `| Jurisdiction | Signal Count |\n|---|---|\n`;
    appendix.jurisdictionComparisons.forEach((j: any) => {
      md += `| ${j.jurisdiction} | ${j.signalCount} |\n`;
    });
    md += `\n`;
  }

  if (format === "html") {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pkg.title}</title>
<style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.6}
table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f5f5f5}h1{color:#1a1a2e}h2{color:#16213e;border-bottom:2px solid #0f3460;padding-bottom:0.5rem}
h3{color:#533483}hr{border:none;border-top:1px solid #eee;margin:2rem 0}</style></head>
<body>${md.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\n\n/g, '<br><br>')
  .replace(/---/g, '<hr>')
}</body></html>`;
    return { content: html, mimeType: "text/html", filename: `${packageId}.html` };
  }

  return { content: md, mimeType: "text/markdown", filename: `${packageId}.md` };
}

// ─── Update Package Status ────────────────────────────────────────────────────
export async function updateReformPackageStatus(
  packageId: string,
  newStatus: string,
  opts?: { submittedTo?: string; signalReductionPct?: number; systemicImpactScore?: number }
): Promise<void> {
  const now = Date.now();
  const validStatuses = ["draft", "review", "submitted", "under_consideration", "adopted", "rejected"];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  await db.execute(sql`
    UPDATE reform_packages SET status = ${newStatus}, updated_at = ${now}
    WHERE package_id = ${packageId}
  `);

  if (newStatus === "submitted" && opts?.submittedTo) {
    await db.execute(sql`
      UPDATE reform_packages SET submitted_to = ${opts.submittedTo} WHERE package_id = ${packageId}
    `);
  }

  if (newStatus === "adopted") {
    await db.execute(sql`
      UPDATE reform_packages SET adopted_date = ${now},
        signal_reduction_pct = ${opts?.signalReductionPct || null},
        systemic_impact_score = ${opts?.systemicImpactScore || null}
      WHERE package_id = ${packageId}
    `);

    // Learning integration: update policy impact and strategy memory
    const [pkgRows] = await db.execute(
      sql`SELECT pattern_id, jurisdiction, reform_type FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
    );
    const pkg = (pkgRows as unknown as any[])[0];
    if (pkg) {
      // Record in policy_change_registry
      const changeId = genId("PCH");
      await db.execute(sql`
        INSERT INTO policy_change_registry (change_id, pattern_type, jurisdiction, reform_type, proposal_title, priority_score, status, created_at, updated_at)
        VALUES (${changeId}, ${pkg.reform_type || 'reform'}, ${pkg.jurisdiction}, 'legislative_fix', ${"Reform Adopted: " + packageId}, 90, 'approved', ${now}, ${now})
      `);

      // Update strategy memory with success
      await db.execute(sql`
        INSERT INTO strategy_memory (memory_id, pattern_type, jurisdiction, intervention_type,
          success_score, confidence_score, notes, created_at)
        VALUES (${genId("MEM")}, ${pkg.reform_type || "reform"}, ${pkg.jurisdiction}, 'reform_adopted',
          ${opts?.signalReductionPct ? opts.signalReductionPct * 10 : 75},
          ${opts?.signalReductionPct ? Math.min(opts.signalReductionPct * 10, 100) : 70},
          ${"Auto-recorded from adopted reform package " + packageId}, ${now})
      `);
    }
  }
}

// ─── Get Reform Package Dashboard ─────────────────────────────────────────────
export async function getReformPackageDashboard(): Promise<ReformPackageDashboard> {
  const [allRows] = await db.execute(sql`SELECT * FROM reform_packages ORDER BY updated_at DESC`);
  const packages = allRows as unknown as any[];

  const byStatus: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  const byReformType: Record<string, number> = {};

  packages.forEach((p: any) => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (p.jurisdiction) byJurisdiction[p.jurisdiction] = (byJurisdiction[p.jurisdiction] || 0) + 1;
    if (p.reform_type) byReformType[p.reform_type] = (byReformType[p.reform_type] || 0) + 1;
  });

  return {
    total: packages.length,
    byStatus,
    byJurisdiction,
    byReformType,
    recentPackages: packages.slice(0, 20).map((p: any) => ({
      packageId: p.package_id,
      patternId: p.pattern_id,
      title: p.title,
      status: p.status,
      jurisdiction: p.jurisdiction,
      reformType: p.reform_type,
      createdAt: Number(p.created_at),
      updatedAt: Number(p.updated_at),
    })),
  };
}

// ─── Get Single Package ───────────────────────────────────────────────────────
export async function getReformPackageDetail(packageId: string) {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
  );
  const pkg = (rows as unknown as any[])[0];
  if (!pkg) return null;

  const parse = (s: string | null) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };

  return {
    packageId: pkg.package_id,
    patternId: pkg.pattern_id,
    title: pkg.title,
    status: pkg.status,
    jurisdiction: pkg.jurisdiction,
    reformType: pkg.reform_type,
    submittedTo: pkg.submitted_to,
    adoptedDate: pkg.adopted_date ? Number(pkg.adopted_date) : null,
    signalReductionPct: pkg.signal_reduction_pct ? Number(pkg.signal_reduction_pct) : null,
    systemicImpactScore: pkg.systemic_impact_score ? Number(pkg.systemic_impact_score) : null,
    executiveSummary: parse(pkg.executive_summary),
    evidenceSection: parse(pkg.evidence_section),
    rootCauseSection: parse(pkg.root_cause_section),
    interventionHistorySection: parse(pkg.intervention_history_section),
    recommendedReformsSection: parse(pkg.recommended_reforms_section),
    implementationRoadmapSection: parse(pkg.implementation_roadmap_section),
    supportingDataSection: parse(pkg.supporting_data_section),
    createdAt: Number(pkg.created_at),
    updatedAt: Number(pkg.updated_at),
  };
}
