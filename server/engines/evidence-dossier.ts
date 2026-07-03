/**
 * Evidence Publishing & Dossier Engine
 * 
 * Generates structured evidence packages for different audiences:
 * investigation kits, legal bundles, policy packets, regulator referrals,
 * and entity/pattern dossiers. Supports export in multiple formats.
 */

import { db } from "../db";
import {
  dossierPackages,
  dossierSections,
  dossierExports,
  type DossierPackageRow,
} from "../../drizzle/schema";
import { eq, desc, sql, count } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────

export type DossierType =
  | "investigation_kit"
  | "legal_bundle"
  | "policy_packet"
  | "regulator_referral"
  | "entity_dossier"
  | "pattern_dossier";

export type DossierAudience =
  | "journalist"
  | "attorney"
  | "policymaker"
  | "regulator"
  | "advocate"
  | "internal";

export interface DossierInput {
  dossierType: DossierType;
  patternId?: number;
  patternName?: string;
  entityId?: number;
  entityName?: string;
  jurisdiction?: string;
  audienceType: DossierAudience;
  createdBy?: string;
  // Evidence context
  signalCount?: number;
  complaintCount?: number;
  litigationCount?: number;
  enforcementCount?: number;
  entityNames?: string[];
  institutionNames?: string[];
  pressureIndex?: number;
  accountabilityScore?: number;
  enforcementGap?: number;
  crisisProbability?: number;
  trendClassification?: string;
  topSignals?: { title: string; severity: number; date: string }[];
  relatedPatterns?: { name: string; pressureIndex: number }[];
}

interface GeneratedDossier {
  dossierId: number;
  title: string;
  summary: string;
  sections: { type: string; heading: string; content: string }[];
}

// ── Section Templates ──────────────────────────────────────────────

function buildEvidenceSummary(input: DossierInput): string {
  const parts: string[] = [];
  parts.push(`**Subject:** ${input.entityName || input.patternName || "Systemic Issue"}`);
  if (input.jurisdiction) parts.push(`**Jurisdiction:** ${input.jurisdiction}`);
  parts.push(`**Data Points:**`);
  if (input.signalCount) parts.push(`- ${input.signalCount} warning signals detected`);
  if (input.complaintCount) parts.push(`- ${input.complaintCount} complaints on record`);
  if (input.litigationCount) parts.push(`- ${input.litigationCount} related legal cases`);
  if (input.enforcementCount) parts.push(`- ${input.enforcementCount} enforcement actions`);
  if (input.pressureIndex) parts.push(`- System stress level: ${input.pressureIndex}/100`);
  return parts.join("\n");
}

function buildSignalTimeline(input: DossierInput): string {
  if (!input.topSignals || input.topSignals.length === 0) {
    return "Signal timeline data is being compiled.";
  }
  let md = "| Date | Signal | Severity |\n|------|--------|----------|\n";
  for (const s of input.topSignals) {
    md += `| ${s.date} | ${s.title} | ${s.severity}/100 |\n`;
  }
  return md;
}

function buildEntityProfile(input: DossierInput): string {
  const parts: string[] = [];
  if (input.entityName) parts.push(`**Primary Entity:** ${input.entityName}`);
  if (input.entityNames && input.entityNames.length > 0) {
    parts.push(`**Related Entities:** ${input.entityNames.join(", ")}`);
  }
  if (input.institutionNames && input.institutionNames.length > 0) {
    parts.push(`**Responsible Institutions:** ${input.institutionNames.join(", ")}`);
  }
  return parts.join("\n\n") || "Entity information is being compiled.";
}

function buildLegalContext(input: DossierInput): string {
  const parts: string[] = [];
  if (input.litigationCount) {
    parts.push(`${input.litigationCount} related legal cases have been identified in the system.`);
  }
  if (input.enforcementCount) {
    parts.push(`${input.enforcementCount} enforcement actions have been recorded.`);
  }
  if (input.enforcementGap && input.enforcementGap > 40) {
    parts.push(`The enforcement gap of ${input.enforcementGap}% indicates that official response has not matched the scale of reported harm.`);
  }
  return parts.join(" ") || "Legal context is being compiled.";
}

function buildRecommendations(input: DossierInput, audience: DossierAudience): string {
  const recs: string[] = [];
  switch (audience) {
    case "journalist":
      recs.push("1. Verify key claims independently before publication.");
      recs.push("2. Contact named entities for comment.");
      recs.push("3. Request public records from responsible institutions.");
      if (input.entityNames?.length) recs.push(`4. Investigate connections between: ${input.entityNames.join(", ")}.`);
      break;
    case "attorney":
      recs.push("1. Review complaint records for potential class action viability.");
      recs.push("2. Evaluate enforcement history for regulatory failure claims.");
      if (input.enforcementGap && input.enforcementGap > 50) recs.push("3. Consider institutional negligence based on enforcement gap data.");
      recs.push(`${recs.length + 1}. Preserve all evidence referenced in this dossier.`);
      break;
    case "policymaker":
      recs.push("1. Review existing regulatory authority for adequacy.");
      recs.push("2. Consider legislative reform to address identified gaps.");
      if (input.accountabilityScore && input.accountabilityScore < 40) recs.push("3. Investigate institutional failure to act.");
      recs.push(`${recs.length + 1}. Request briefing from responsible agencies.`);
      break;
    case "regulator":
      recs.push("1. Open formal investigation based on complaint volume and pattern data.");
      recs.push("2. Issue information requests to named entities.");
      if (input.crisisProbability && input.crisisProbability > 50) recs.push("3. Escalate to enforcement priority given crisis probability.");
      recs.push(`${recs.length + 1}. Coordinate with other jurisdictions if pattern crosses boundaries.`);
      break;
    default:
      recs.push("1. Review evidence and determine appropriate next steps.");
      recs.push("2. Share with relevant stakeholders.");
      recs.push("3. Monitor for new developments.");
  }
  return recs.join("\n");
}

// ── Dossier Generators ─────────────────────────────────────────────

export async function generateInvestigationKit(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Investigation Kit: ${input.entityName || input.patternName || "Systemic Issue"}`;
  const summary = `Compiled evidence package for investigative review of ${input.entityName || input.patternName || "a systemic issue"}.`;

  const sections = [
    { type: "executive_summary", heading: "Executive Summary", content: summary },
    { type: "evidence_summary", heading: "Evidence Overview", content: buildEvidenceSummary(input) },
    { type: "signal_timeline", heading: "Signal Timeline", content: buildSignalTimeline(input) },
    { type: "entity_profile", heading: "Entities & Institutions", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Legal & Enforcement Context", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Pattern Analysis", content: input.trendClassification ? `Current trend: **${input.trendClassification}**. ${input.pressureIndex ? `System stress level: ${input.pressureIndex}/100.` : ""} ${input.crisisProbability ? `Crisis probability: ${input.crisisProbability}%.` : ""}` : "Pattern analysis is in progress." },
    { type: "recommendations", heading: "Investigation Leads", content: buildRecommendations(input, "journalist") },
    { type: "methodology", heading: "Data Sources & Methodology", content: `This kit is compiled from complaint records, enforcement actions, litigation filings, and institutional activity data as of ${new Date().toLocaleDateString()}. All claims should be independently verified. This package is intended as a starting point for investigation, not as a final report.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

export async function generateLegalBundle(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Legal Evidence Bundle: ${input.entityName || input.patternName || "Systemic Issue"}`;
  const summary = `Structured legal evidence package for attorney review.`;

  const sections = [
    { type: "executive_summary", heading: "Case Summary", content: `This bundle compiles evidence related to ${input.entityName || input.patternName || "a systemic issue"}${input.jurisdiction ? ` in ${input.jurisdiction}` : ""}. It is intended for attorney review to assess potential legal action.` },
    { type: "evidence_summary", heading: "Evidence Inventory", content: buildEvidenceSummary(input) },
    { type: "signal_timeline", heading: "Chronological Evidence", content: buildSignalTimeline(input) },
    { type: "entity_profile", heading: "Parties Involved", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Existing Legal Actions", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Systemic Pattern Evidence", content: `The data shows a pattern of ${input.trendClassification || "recurring"} activity involving ${input.entityNames?.length || "multiple"} entities. ${input.pressureIndex ? `System stress level is ${input.pressureIndex}/100.` : ""} This pattern may support claims of systemic negligence or institutional failure.` },
    { type: "recommendations", heading: "Legal Considerations", content: buildRecommendations(input, "attorney") },
    { type: "methodology", heading: "Evidentiary Standards Note", content: `This bundle is compiled from public records and system analysis as of ${new Date().toLocaleDateString()}. Evidence quality varies by source. All items should be independently verified and assessed for admissibility before use in legal proceedings.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

export async function generatePolicyPacket(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Policy Packet: ${input.patternName || "Systemic Issue"}`;
  const summary = `Policy briefing package for legislative or regulatory review.`;

  const sections = [
    { type: "executive_summary", heading: "Policy Issue Summary", content: `This packet addresses ${input.patternName || "a systemic issue"}${input.jurisdiction ? ` in ${input.jurisdiction}` : ""}. It provides evidence-based context for policy review and potential reform.` },
    { type: "evidence_summary", heading: "Scale of the Problem", content: buildEvidenceSummary(input) },
    { type: "entity_profile", heading: "Affected Parties & Responsible Institutions", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Current Regulatory Framework", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Systemic Analysis", content: `${input.enforcementGap ? `The enforcement gap of ${input.enforcementGap}% indicates existing regulations are not adequately addressing the problem.` : ""} ${input.accountabilityScore ? `Institutional accountability score: ${input.accountabilityScore}/100.` : ""} ${input.crisisProbability ? `Without intervention, crisis probability is estimated at ${input.crisisProbability}%.` : ""}` },
    { type: "recommendations", heading: "Policy Recommendations", content: buildRecommendations(input, "policymaker") },
    { type: "methodology", heading: "Sources & Limitations", content: `Based on available data as of ${new Date().toLocaleDateString()}. Policy recommendations should be evaluated in the context of existing legislative authority, budget constraints, and jurisdictional scope.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

export async function generateRegulatorReferral(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Regulator Referral: ${input.entityName || input.patternName || "Systemic Issue"}`;
  const summary = `Formal referral package for regulatory agency review and potential enforcement action.`;

  const sections = [
    { type: "executive_summary", heading: "Referral Summary", content: `This referral documents evidence of ${input.patternName || "systemic harm"} involving ${input.entityName || "multiple entities"}${input.jurisdiction ? ` in ${input.jurisdiction}` : ""}. The data suggests regulatory review and potential enforcement action may be warranted.` },
    { type: "evidence_summary", heading: "Evidence Summary", content: buildEvidenceSummary(input) },
    { type: "signal_timeline", heading: "Timeline of Indicators", content: buildSignalTimeline(input) },
    { type: "entity_profile", heading: "Subject Entities", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Prior Enforcement History", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Pattern Assessment", content: `System analysis indicates a ${input.trendClassification || "sustained"} pattern. ${input.pressureIndex ? `Current stress level: ${input.pressureIndex}/100.` : ""} ${input.crisisProbability && input.crisisProbability > 50 ? `Crisis probability exceeds 50%, suggesting urgency.` : ""}` },
    { type: "recommendations", heading: "Recommended Regulatory Actions", content: buildRecommendations(input, "regulator") },
    { type: "methodology", heading: "Data Provenance", content: `This referral is based on complaint, enforcement, and litigation data as of ${new Date().toLocaleDateString()}. All evidence should be independently verified by the receiving agency before initiating formal proceedings.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

export async function generateEntityDossier(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Entity Dossier: ${input.entityName || "Unknown Entity"}`;
  const summary = `Comprehensive profile of ${input.entityName || "an entity"} based on available system data.`;

  const sections = [
    { type: "executive_summary", heading: "Entity Overview", content: `**Entity:** ${input.entityName || "Unknown"}\n${input.jurisdiction ? `**Jurisdiction:** ${input.jurisdiction}` : ""}` },
    { type: "evidence_summary", heading: "Activity Summary", content: buildEvidenceSummary(input) },
    { type: "signal_timeline", heading: "Signal History", content: buildSignalTimeline(input) },
    { type: "entity_profile", heading: "Related Entities & Institutions", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Legal & Enforcement History", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Pattern Involvement", content: input.relatedPatterns && input.relatedPatterns.length > 0 ? `This entity is connected to ${input.relatedPatterns.length} tracked patterns:\n${input.relatedPatterns.map(p => `- **${p.name}** (stress level: ${p.pressureIndex}/100)`).join("\n")}` : "Pattern connections are being analyzed." },
    { type: "methodology", heading: "Data Sources", content: `Compiled from system data as of ${new Date().toLocaleDateString()}.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

export async function generatePatternDossier(input: DossierInput): Promise<GeneratedDossier> {
  const title = `Pattern Dossier: ${input.patternName || "Systemic Pattern"}`;
  const summary = `Full analytical dossier on ${input.patternName || "a systemic pattern"}.`;

  const sections = [
    { type: "executive_summary", heading: "Pattern Overview", content: `**Pattern:** ${input.patternName || "Unknown"}\n${input.jurisdiction ? `**Jurisdiction:** ${input.jurisdiction}` : ""}\n${input.trendClassification ? `**Trend:** ${input.trendClassification}` : ""}` },
    { type: "evidence_summary", heading: "Evidence Base", content: buildEvidenceSummary(input) },
    { type: "signal_timeline", heading: "Detection Timeline", content: buildSignalTimeline(input) },
    { type: "entity_profile", heading: "Involved Entities & Institutions", content: buildEntityProfile(input) },
    { type: "legal_context", heading: "Legal & Enforcement Context", content: buildLegalContext(input) },
    { type: "pattern_analysis", heading: "Systemic Analysis", content: `${input.pressureIndex ? `System stress level: **${input.pressureIndex}/100**.` : ""} ${input.enforcementGap ? `Enforcement gap: **${input.enforcementGap}%**.` : ""} ${input.accountabilityScore ? `Institutional accountability: **${input.accountabilityScore}/100**.` : ""} ${input.crisisProbability ? `Crisis probability: **${input.crisisProbability}%**.` : ""}` },
    { type: "recommendations", heading: "Recommended Actions", content: buildRecommendations(input, input.audienceType) },
    { type: "methodology", heading: "Methodology & Limitations", content: `This dossier is compiled from all available system data as of ${new Date().toLocaleDateString()}. Findings are analytical outputs and should be reviewed by qualified professionals before use in any formal proceedings.` },
  ];

  return await saveDossier(input, title, summary, sections);
}

// ── Helpers ────────────────────────────────────────────────────────

async function saveDossier(
  input: DossierInput,
  title: string,
  summary: string,
  sections: { type: string; heading: string; content: string }[],
): Promise<GeneratedDossier> {
  const [inserted] = await db.insert(dossierPackages).values({
    dossierType: input.dossierType,
    title,
    patternId: input.patternId ?? null,
    entityId: input.entityId ?? null,
    jurisdiction: input.jurisdiction ?? null,
    audienceType: input.audienceType,
    summary,
    createdBy: input.createdBy ?? "system",
  }).$returningId();

  const dossierId = inserted.id;

  for (let i = 0; i < sections.length; i++) {
    await db.insert(dossierSections).values({
      dossierId,
      sectionType: sections[i].type,
      heading: sections[i].heading,
      content: sections[i].content,
      displayOrder: i + 1,
    });
  }

  return { dossierId, title, summary, sections };
}

export async function exportDossier(dossierId: number, format: "markdown" | "html" | "json" = "markdown"): Promise<string> {
  const [dossier] = await db.select().from(dossierPackages).where(eq(dossierPackages.id, dossierId)).limit(1);
  if (!dossier) return "Dossier not found.";

  const sections = await db
    .select()
    .from(dossierSections)
    .where(eq(dossierSections.dossierId, dossierId))
    .orderBy(dossierSections.displayOrder);

  if (format === "markdown") {
    let md = `# ${dossier.title}\n\n`;
    md += `*${dossier.dossierType.replace(/_/g, " ")} | ${dossier.audienceType} | ${new Date(Number(dossier.createdAt)).toLocaleDateString()}*\n\n`;
    if (dossier.summary) md += `> ${dossier.summary}\n\n`;
    for (const s of sections) {
      md += `## ${s.heading}\n\n${s.content}\n\n`;
    }
    md += `---\n\n*Generated by Luminari Forensic Engine. All findings require independent verification.*\n`;
    return md;
  }

  if (format === "json") {
    return JSON.stringify({ dossier, sections }, null, 2);
  }

  // HTML
  let html = `<!DOCTYPE html><html><head><title>${dossier.title}</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}h1{border-bottom:2px solid #1a1a2e;color:#1a1a2e}h2{color:#16213e;margin-top:2rem}blockquote{border-left:3px solid #0f3460;padding-left:1rem;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}</style></head><body>`;
  html += `<h1>${dossier.title}</h1>`;
  html += `<p><em>${dossier.dossierType.replace(/_/g, " ")} | ${dossier.audienceType} | ${new Date(Number(dossier.createdAt)).toLocaleDateString()}</em></p>`;
  if (dossier.summary) html += `<blockquote>${dossier.summary}</blockquote>`;
  for (const s of sections) {
    html += `<h2>${s.heading}</h2><div>${(s.content ?? "").replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>`;
  }
  html += `<hr><p><em>Generated by Luminari Forensic Engine. All findings require independent verification.</em></p></body></html>`;
  return html;
}

export async function getDossierStats(): Promise<{
  totalDossiers: number;
  byType: Record<string, number>;
  byAudience: Record<string, number>;
  byStatus: Record<string, number>;
  recentDossiers: DossierPackageRow[];
}> {
  const [totalRow] = await db.select({ c: count() }).from(dossierPackages);
  const totalDossiers = totalRow?.c ?? 0;

  const typeRows = await db.select({ type: dossierPackages.dossierType, c: count() }).from(dossierPackages).groupBy(dossierPackages.dossierType);
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type] = r.c;

  const audienceRows = await db.select({ audience: dossierPackages.audienceType, c: count() }).from(dossierPackages).groupBy(dossierPackages.audienceType);
  const byAudience: Record<string, number> = {};
  for (const r of audienceRows) byAudience[r.audience] = r.c;

  const statusRows = await db.select({ status: dossierPackages.status, c: count() }).from(dossierPackages).groupBy(dossierPackages.status);
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  const recentDossiers = await db.select().from(dossierPackages).orderBy(desc(dossierPackages.createdAt)).limit(10);

  return { totalDossiers, byType, byAudience, byStatus, recentDossiers };
}

export async function getDossierById(id: number): Promise<{
  dossier: DossierPackageRow;
  sections: { type: string; heading: string; content: string | null; order: number }[];
} | null> {
  const [dossier] = await db.select().from(dossierPackages).where(eq(dossierPackages.id, id)).limit(1);
  if (!dossier) return null;

  const sections = await db
    .select()
    .from(dossierSections)
    .where(eq(dossierSections.dossierId, id))
    .orderBy(dossierSections.displayOrder);

  return {
    dossier,
    sections: sections.map((s: any) => ({
      type: s.sectionType,
      heading: s.heading,
      content: s.content,
      order: s.displayOrder,
    })),
  };
}
