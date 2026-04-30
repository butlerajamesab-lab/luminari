/**
 * Public Transparency Layer
 * 
 * Converts internal signals, patterns, trends, simulations, and reforms
 * into clear, shareable, non-technical explainers for external audiences.
 * Translates technical jargon into plain language.
 */

import { db } from "../db";
import {
  publicReports,
  publicReportSections,
  publicReportExports,
  type PublicReportRow,
} from "../../drizzle/schema";
import { eq, desc, sql, count } from "drizzle-orm";

// ── Jargon Translation Map ─────────────────────────────────────────

const JARGON_MAP: Record<string, string> = {
  "pressure_index": "system stress level",
  "pressure index": "system stress level",
  "multi-stream confirmation": "evidence confirmed by multiple independent sources",
  "multi_stream_confirmation": "evidence confirmed by multiple independent sources",
  "institutional accountability score": "strength of official response",
  "accountability_score": "strength of official response",
  "enforcement_gap": "gap between reported harm and official action",
  "enforcement gap": "gap between reported harm and official action",
  "signal_count": "number of detected warning indicators",
  "signal count": "number of detected warning indicators",
  "pattern_registry": "tracked systemic issues",
  "trend_classification": "direction of change over time",
  "crisis_probability": "likelihood of escalation into a larger problem",
  "crisis probability": "likelihood of escalation into a larger problem",
  "complaint_velocity": "rate at which new complaints are arriving",
  "complaint velocity": "rate at which new complaints are arriving",
  "regulatory_capture": "situation where regulators serve industry interests instead of the public",
  "regulatory capture": "situation where regulators serve industry interests instead of the public",
  "cross-stream correlation": "connections found across different types of evidence",
  "entity_resolution": "identifying the same organization across different records",
  "counterfactual_replay": "testing what would have happened under different conditions",
  "historical_replay": "re-analyzing past data with current detection methods",
};

export function translateJargon(text: string): string {
  let result = text;
  for (const [jargon, plain] of Object.entries(JARGON_MAP)) {
    const regex = new RegExp(jargon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(regex, plain);
  }
  return result;
}

// ── Types ──────────────────────────────────────────────────────────

export type ReportType =
  | "pattern_explainer"
  | "issue_brief"
  | "accountability_report"
  | "policy_brief"
  | "crisis_warning"
  | "simulation_summary";

export type AudienceType = "public" | "journalist" | "advocate" | "policymaker" | "researcher";

export interface ReportInput {
  patternId?: number;
  patternName?: string;
  jurisdiction?: string;
  audienceType?: AudienceType;
  generatedBy?: string;
  // Context data from other engines
  signalCount?: number;
  entityNames?: string[];
  institutionNames?: string[];
  pressureIndex?: number;
  crisisProbability?: number;
  accountabilityScore?: number;
  enforcementGap?: number;
  trendClassification?: string;
  complaintCount?: number;
  litigationCount?: number;
  enforcementCount?: number;
}

interface GeneratedReport {
  reportId: number;
  title: string;
  summary: string;
  sections: { type: string; heading: string; content: string }[];
}

// ── Section Builders ───────────────────────────────────────────────

function buildOverview(input: ReportInput): string {
  const pattern = input.patternName || "this systemic issue";
  const jurisdiction = input.jurisdiction ? ` in ${input.jurisdiction}` : "";
  return `This report describes ${pattern}${jurisdiction}. The system has detected ${input.signalCount || "multiple"} warning indicators across ${input.entityNames?.length || "several"} organizations. ${input.trendClassification ? `The current trend is classified as ${translateJargon(input.trendClassification)}.` : ""}`;
}

function buildWhatIsHappening(input: ReportInput): string {
  const parts: string[] = [];
  if (input.complaintCount) parts.push(`${input.complaintCount} complaints have been recorded in the system.`);
  if (input.litigationCount) parts.push(`${input.litigationCount} related legal cases have been identified.`);
  if (input.enforcementCount) parts.push(`${input.enforcementCount} enforcement actions have been taken.`);
  if (input.pressureIndex) parts.push(`The current ${translateJargon("pressure_index")} is ${input.pressureIndex} out of 100, indicating ${input.pressureIndex > 70 ? "significant" : input.pressureIndex > 40 ? "moderate" : "low"} systemic stress.`);
  if (parts.length === 0) parts.push("The system has detected a pattern of recurring issues that may indicate a systemic problem.");
  return parts.join(" ");
}

function buildWhyItMatters(input: ReportInput): string {
  const parts: string[] = [];
  if (input.crisisProbability && input.crisisProbability > 50) {
    parts.push(`There is a ${input.crisisProbability}% ${translateJargon("crisis_probability")} if current trends continue.`);
  }
  if (input.enforcementGap && input.enforcementGap > 40) {
    parts.push(`There is a significant ${translateJargon("enforcement_gap")} — the level of reported harm substantially exceeds the level of official response.`);
  }
  if (input.entityNames && input.entityNames.length > 0) {
    parts.push(`The issue involves ${input.entityNames.length} identified organizations, suggesting the problem is not isolated to a single actor.`);
  }
  if (parts.length === 0) parts.push("This issue affects public welfare and may require attention from responsible institutions.");
  return parts.join(" ");
}

function buildWhoIsInvolved(input: ReportInput): string {
  const parts: string[] = [];
  if (input.entityNames && input.entityNames.length > 0) {
    parts.push(`**Organizations involved:** ${input.entityNames.join(", ")}`);
  }
  if (input.institutionNames && input.institutionNames.length > 0) {
    parts.push(`**Responsible institutions:** ${input.institutionNames.join(", ")}`);
  }
  if (parts.length === 0) parts.push("Specific entities and institutions are being tracked by the system.");
  return parts.join("\n\n");
}

function buildWhatCanBeDone(input: ReportInput): string {
  const actions: string[] = [];
  if (input.enforcementGap && input.enforcementGap > 50) {
    actions.push("Increase enforcement capacity to close the gap between reported harm and official response.");
  }
  if (input.accountabilityScore && input.accountabilityScore < 40) {
    actions.push("Strengthen institutional oversight mechanisms to improve the strength of official response.");
  }
  if (input.crisisProbability && input.crisisProbability > 60) {
    actions.push("Prioritize this issue for immediate review to prevent escalation.");
  }
  actions.push("Continue monitoring for new developments and cross-reference with related patterns.");
  return actions.map((a, i) => `${i + 1}. ${a}`).join("\n");
}

// ── Report Generators ──────────────────────────────────────────────

export async function generatePatternExplainer(input: ReportInput): Promise<GeneratedReport> {
  const title = `Pattern Explainer: ${input.patternName || "Systemic Issue"}`;
  const summary = buildOverview(input);

  const sections = [
    { type: "overview", heading: "Overview", content: buildOverview(input) },
    { type: "what_is_happening", heading: "What Is Happening", content: buildWhatIsHappening(input) },
    { type: "why_it_matters", heading: "Why It Matters", content: buildWhyItMatters(input) },
    { type: "who_is_affected", heading: "Who Is Involved", content: buildWhoIsInvolved(input) },
    { type: "recommended_actions", heading: "What Can Be Done", content: buildWhatCanBeDone(input) },
    { type: "sources", heading: "About This Report", content: `This report is based on complaint, litigation, and enforcement data currently available to the system as of ${new Date().toLocaleDateString()}. All findings should be independently verified before being used for decision-making.` },
  ];

  return await saveReport("pattern_explainer", title, summary, sections, input);
}

export async function generateAccountabilityReport(input: ReportInput): Promise<GeneratedReport> {
  const title = `Accountability Report: ${input.patternName || "Systemic Issue"}`;
  const summary = `Assessment of institutional response to ${input.patternName || "this systemic issue"}.`;

  const institutionStatus = input.accountabilityScore
    ? (input.accountabilityScore > 70 ? "Institutions appear to be responding adequately." : input.accountabilityScore > 40 ? "Institutional response is partial and may be insufficient." : "Institutional response is weak or absent.")
    : "Institutional response status is being assessed.";

  const sections = [
    { type: "overview", heading: "Issue Summary", content: buildOverview(input) },
    { type: "institutional_response", heading: "Responsible Institutions", content: buildWhoIsInvolved(input) },
    { type: "institutional_response", heading: "Whether They Acted", content: institutionStatus },
    { type: "supporting_data", heading: "Enforcement Gap", content: input.enforcementGap ? `The current ${translateJargon("enforcement_gap")} is ${input.enforcementGap}%. This means ${input.enforcementGap > 50 ? "more than half" : "a significant portion"} of reported harm has not been met with corresponding official action.` : "Enforcement gap data is being calculated." },
    { type: "supporting_data", heading: "Accountability Assessment", content: input.accountabilityScore ? `The current ${translateJargon("institutional accountability score")} is ${input.accountabilityScore} out of 100. ${input.accountabilityScore < 40 ? "This indicates a significant failure of institutional oversight." : input.accountabilityScore < 70 ? "This indicates room for improvement in institutional response." : "This indicates a reasonable level of institutional engagement."}` : "Accountability scoring is in progress." },
    { type: "recommended_actions", heading: "Recommended Actions", content: buildWhatCanBeDone(input) },
    { type: "sources", heading: "Methodology & Limitations", content: `This accountability assessment is based on available complaint, enforcement, and litigation data as of ${new Date().toLocaleDateString()}. Accountability scores are model-derived indicators and should be reviewed by analysts before publication. This report requires analyst review before external distribution.` },
  ];

  return await saveReport("accountability_report", title, summary, sections, input);
}

export async function generateCrisisWarning(input: ReportInput): Promise<GeneratedReport> {
  const title = `Crisis Warning: ${input.patternName || "Systemic Issue"}`;
  const probability = input.crisisProbability || 0;
  const timeline = probability > 70 ? "1–3 months" : probability > 50 ? "3–6 months" : "6–12 months";
  const summary = probability > 50
    ? `This issue is likely to escalate into a larger systemic problem within ${timeline} if current trends continue.`
    : `This issue shows early warning signs that warrant monitoring for potential escalation.`;

  const sections = [
    { type: "overview", heading: "Warning Summary", content: summary },
    { type: "supporting_data", heading: "Crisis Probability", content: `Current ${translateJargon("crisis_probability")}: **${probability}%**. ${probability > 70 ? "This is a high-priority warning." : probability > 50 ? "This warrants close monitoring." : "This is an early-stage indicator."}` },
    { type: "supporting_data", heading: "Escalation Timeline", content: `Based on current trends, escalation could occur within **${timeline}**.` },
    { type: "supporting_data", heading: "Contributing Factors", content: [
      input.pressureIndex ? `System stress level: ${input.pressureIndex}/100` : null,
      input.enforcementGap ? `Gap between harm and response: ${input.enforcementGap}%` : null,
      input.accountabilityScore ? `Strength of official response: ${input.accountabilityScore}/100` : null,
      input.complaintCount ? `Complaint volume: ${input.complaintCount}` : null,
    ].filter(Boolean).join("\n") || "Contributing factors are being analyzed." },
    { type: "recommended_actions", heading: "Possible Consequences", content: `If this pattern continues without intervention, it may result in increased public harm, media attention, litigation activity, and potential regulatory action. Early intervention is recommended.` },
    { type: "sources", heading: "Disclaimer", content: `This crisis warning is based on pattern analysis and predictive modeling as of ${new Date().toLocaleDateString()}. Predictions are estimates, not certainties. This report requires analyst review before external distribution.` },
  ];

  return await saveReport("crisis_warning", title, summary, sections, input);
}

export async function generatePolicyBrief(input: ReportInput): Promise<GeneratedReport> {
  const title = `Policy Brief: ${input.patternName || "Systemic Issue"}`;
  const summary = `Briefing on ${input.patternName || "a systemic issue"} for policymaker review.`;

  const sections = [
    { type: "overview", heading: "Issue Overview", content: buildOverview(input) },
    { type: "what_is_happening", heading: "Scale of Harm", content: buildWhatIsHappening(input) },
    { type: "why_it_matters", heading: "Public Consequences", content: buildWhyItMatters(input) },
    { type: "institutional_response", heading: "Responsible Institutions", content: buildWhoIsInvolved(input) },
    { type: "supporting_data", heading: "Existing Legal Framework", content: `Current enforcement and regulatory mechanisms have produced an ${translateJargon("institutional accountability score")} of ${input.accountabilityScore || "N/A"}/100, suggesting ${(input.accountabilityScore || 0) < 50 ? "significant gaps in the existing framework" : "partial but insufficient coverage"}.` },
    { type: "supporting_data", heading: "Policy Gaps", content: input.enforcementGap ? `The ${input.enforcementGap}% ${translateJargon("enforcement_gap")} indicates that existing policies are not adequately addressing the reported harm. Legislative or regulatory reform may be needed to close this gap.` : "Policy gap analysis is in progress." },
    { type: "recommended_actions", heading: "Recommended Legislative or Regulatory Actions", content: buildWhatCanBeDone(input) },
    { type: "sources", heading: "Data Sources & Limitations", content: `This brief is based on complaint, litigation, enforcement, and institutional data as of ${new Date().toLocaleDateString()}. All recommendations should be evaluated in the context of existing legislative authority and jurisdictional constraints.` },
  ];

  return await saveReport("policy_brief", title, summary, sections, input);
}

export async function generateIssueBrief(input: ReportInput): Promise<GeneratedReport> {
  const title = `Issue Brief: ${input.patternName || "Systemic Issue"}`;
  const summary = `Summary of ${input.patternName || "a detected systemic issue"} for general awareness.`;

  const sections = [
    { type: "overview", heading: "What This Is About", content: buildOverview(input) },
    { type: "what_is_happening", heading: "Current Situation", content: buildWhatIsHappening(input) },
    { type: "why_it_matters", heading: "Why It Matters", content: buildWhyItMatters(input) },
    { type: "who_is_affected", heading: "Key Players", content: buildWhoIsInvolved(input) },
    { type: "recommended_actions", heading: "What Comes Next", content: buildWhatCanBeDone(input) },
    { type: "sources", heading: "Sources", content: `Based on data available as of ${new Date().toLocaleDateString()}.` },
  ];

  return await saveReport("issue_brief", title, summary, sections, input);
}

export async function generateSimulationSummary(input: ReportInput & { simulationScenario?: string; projectedPressureChange?: number; projectedCrisisChange?: number; confidence?: number }): Promise<GeneratedReport> {
  const title = `Simulation Summary: ${input.simulationScenario || "Reform Scenario"}`;
  const pressureChange = input.projectedPressureChange || 0;
  const crisisChange = input.projectedCrisisChange || 0;
  const summary = `If ${input.simulationScenario || "the proposed reform"} were implemented, ${translateJargon("pressure_index")} would likely ${pressureChange < 0 ? `decline by ${Math.abs(pressureChange).toFixed(1)}%` : `increase by ${pressureChange.toFixed(1)}%`} and ${translateJargon("crisis_probability")} would ${crisisChange < 0 ? `fall by ${Math.abs(crisisChange).toFixed(1)}%` : `rise by ${crisisChange.toFixed(1)}%`}.`;

  const sections = [
    { type: "overview", heading: "What Was Tested", content: `This simulation tested the likely effects of: ${input.simulationScenario || "a proposed reform"}.` },
    { type: "supporting_data", heading: "Projected Results", content: summary },
    { type: "supporting_data", heading: "Confidence Level", content: `The model's confidence in these projections is ${input.confidence || 65}%. This means the actual outcomes may vary, but the direction of change is considered reliable.` },
    { type: "recommended_actions", heading: "What This Means", content: pressureChange < 0 ? "The simulation suggests this reform would reduce systemic harm. It may be worth pursuing as part of a broader strategy." : "The simulation suggests this reform may not significantly reduce harm. Alternative approaches should be considered." },
    { type: "sources", heading: "Important Note", content: `This is a simulation, not a prediction. Results are based on model assumptions and historical patterns. Real-world outcomes depend on implementation quality, political context, and other factors not captured in the model. Generated ${new Date().toLocaleDateString()}.` },
  ];

  return await saveReport("simulation_summary", title, summary, sections, input);
}

// ── Helpers ────────────────────────────────────────────────────────

async function saveReport(
  reportType: ReportType,
  title: string,
  summary: string,
  sections: { type: string; heading: string; content: string }[],
  input: ReportInput,
): Promise<GeneratedReport> {
  const [inserted] = await db.insert(publicReports).values({
    reportType,
    title,
    summary,
    patternId: input.patternId ?? null,
    jurisdiction: input.jurisdiction ?? null,
    audienceType: input.audienceType ?? "public",
    generatedBy: input.generatedBy ?? "system",
  }).$returningId();

  const reportId = inserted.id;

  for (let i = 0; i < sections.length; i++) {
    await db.insert(publicReportSections).values({
      reportId,
      sectionType: sections[i].type,
      heading: sections[i].heading,
      content: sections[i].content,
      displayOrder: i + 1,
    });
  }

  return { reportId, title, summary, sections };
}

export async function exportPublicReport(reportId: number, format: "markdown" | "pdf" | "html" | "json" = "markdown"): Promise<string> {
  const [report] = await db.select().from(publicReports).where(eq(publicReports.id, reportId)).limit(1);
  if (!report) return "Report not found.";

  const sections = await db
    .select()
    .from(publicReportSections)
    .where(eq(publicReportSections.reportId, reportId))
    .orderBy(publicReportSections.displayOrder);

  if (format === "markdown" || format === "pdf") {
    let md = `# ${report.title}\n\n`;
    md += `*${report.audienceType} report | ${new Date(Number(report.generatedAt)).toLocaleDateString()}*\n\n`;
    if (report.summary) md += `> ${report.summary}\n\n`;
    for (const s of sections) {
      md += `## ${s.heading}\n\n${s.content}\n\n`;
    }
    return md;
  }

  if (format === "json") {
    return JSON.stringify({ report, sections }, null, 2);
  }

  // HTML
  let html = `<!DOCTYPE html><html><head><title>${report.title}</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}h1{border-bottom:2px solid #333}h2{color:#444;margin-top:2rem}blockquote{border-left:3px solid #ccc;padding-left:1rem;color:#666}</style></head><body>`;
  html += `<h1>${report.title}</h1>`;
  html += `<p><em>${report.audienceType} report | ${new Date(Number(report.generatedAt)).toLocaleDateString()}</em></p>`;
  if (report.summary) html += `<blockquote>${report.summary}</blockquote>`;
  for (const s of sections) {
    html += `<h2>${s.heading}</h2><p>${(s.content ?? "").replace(/\n/g, "<br>")}</p>`;
  }
  html += `</body></html>`;
  return html;
}

export async function getTransparencyStats(): Promise<{
  totalReports: number;
  byType: Record<string, number>;
  byAudience: Record<string, number>;
  byStatus: Record<string, number>;
  recentReports: PublicReportRow[];
}> {
  const [totalRow] = await db.select({ c: count() }).from(publicReports);
  const totalReports = totalRow?.c ?? 0;

  const typeRows = await db.select({ type: publicReports.reportType, c: count() }).from(publicReports).groupBy(publicReports.reportType);
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type] = r.c;

  const audienceRows = await db.select({ audience: publicReports.audienceType, c: count() }).from(publicReports).groupBy(publicReports.audienceType);
  const byAudience: Record<string, number> = {};
  for (const r of audienceRows) byAudience[r.audience] = r.c;

  const statusRows = await db.select({ status: publicReports.status, c: count() }).from(publicReports).groupBy(publicReports.status);
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  const recentReports = await db.select().from(publicReports).orderBy(desc(publicReports.generatedAt)).limit(10);

  return { totalReports, byType, byAudience, byStatus, recentReports };
}
