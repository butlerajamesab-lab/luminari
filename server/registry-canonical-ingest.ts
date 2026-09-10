/**
 * CANONICAL REGISTRY INGESTION ENGINE
 * 
 * Ingests luminari_registry_canonical_export.json into the registry tables
 * and generates signals into the SAME live_signals table used by pattern/strategy engines.
 * 
 * Single pipeline path. Idempotent. No parallel ingestion.
 * Wired into the existing ingest_runs audit trail.
 */
import { db } from "./db";
import {
  registryJurisdictions,
  registryPrograms,
  registryPolicyAlerts,
  registryWorkflows,
  registryOversightBodies,
  registrySourceTraceability,
  registrySignals,
  liveSignals,
  ingestRuns,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ─── Types ───
interface JurisdictionData {
  jurisdiction_metadata: Record<string, string>;
  layer_0_policy_alerts: any[];
  layer_1_programs: Record<string, any[]>;
  layer_2_workflows: any[];
  layer_3_oversight_enforcement: any[];
  source_traceability: {
    source_documents: string[];
    source_variants: string[];
    notes_on_merge: any[];
    conflicts: any[];
  };
  jurisdiction_key: string;
  jurisdiction_type: string;
}

interface CanonicalExport {
  states: Record<string, JurisdictionData>;
  territories: Record<string, JurisdictionData>;
  auxiliary: Record<string, JurisdictionData>;
}

interface IngestResult {
  ingestRunId: number;
  jurisdictions: number;
  programs: number;
  policyAlerts: number;
  workflows: number;
  oversightBodies: number;
  sourceTraceability: number;
  signalsGenerated: number;
  signalsInLiveSignals: number;
  errors: string[];
}

function makeId(prefix: string, key: string): string {
  return `${prefix}_${key.replace(/\s+/g, "_").toLowerCase()}`;
}

function fingerprint(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// ─── MAIN INGESTION ───
export async function ingestCanonicalRegistry(data: CanonicalExport): Promise<IngestResult> {
  const errors: string[] = [];
  const now = Date.now();

  // T1. Create ingest_run record (wired into existing audit trail)
  const [runResult] = await db.insert(ingestRuns).values({
    datasetId: "luminari_canonical_registry",
    startTime: now,
    status: "running",
    recordsProcessed: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    signalsGenerated: 0,
    retryCount: 0,
    signalsProcessed: false,
    adapterUsed: "canonical_registry_ingest",
  }).returning({ id: ingestRuns.id });
  const runId = runResult.id;

  let totalJurisdictions = 0;
  let totalPrograms = 0;
  let totalAlerts = 0;
  let totalWorkflows = 0;
  let totalOversight = 0;
  let totalTraceability = 0;
  let totalSignals = 0;
  let totalLiveSignals = 0;

  // T2. Iterate all collections: states, territories, auxiliary
  const collections: [string, Record<string, JurisdictionData>][] = [
    ["states", data.states || {}],
    ["territories", data.territories || {}],
    ["auxiliary", data.auxiliary || {}],
  ];

  for (const [collectionType, collection] of collections) {
    for (const [key, jData] of Object.entries(collection)) {
      try {
        const jId = makeId("j", key);
        const meta = jData.jurisdiction_metadata || {};

        // ── Jurisdiction ──
        const jurisdictionName = meta.state || meta.jurisdiction || key;
        const jurisdictionAbbreviation = extractAbbreviation(meta.state || key);
        const jurisdictionType = jData.jurisdiction_type || collectionType;
        await db.insert(registryJurisdictions).values({
          id: jId,
          name: jurisdictionName,
          abbreviation: jurisdictionAbbreviation,
          fips: meta.fips || null,
          type: jurisdictionType,
          population: meta.population || null,
          medicaidStatus: meta.medicaid || null,
          minimumWage: meta.minimum_wage || null,
          uiMax: meta.ui_max || null,
          wageSol: meta.wage_sol || null,
          civilRightsSol: meta.civil_rights_sol || null,
          createdAt: now,
        }).onConflictDoUpdate({
          target: registryJurisdictions.id,
          set: {
            name: jurisdictionName,
            abbreviation: jurisdictionAbbreviation,
            fips: meta.fips || null,
            type: jurisdictionType,
            population: meta.population || null,
            medicaidStatus: meta.medicaid || null,
            minimumWage: meta.minimum_wage || null,
            uiMax: meta.ui_max || null,
            wageSol: meta.wage_sol || null,
            civilRightsSol: meta.civil_rights_sol || null,
          },
        });
        totalJurisdictions++;

        // ── Policy Alerts (layer_0) ──
        const alerts = jData.layer_0_policy_alerts || [];
        for (let i = 0; i < alerts.length; i++) {
          const a = alerts[i];
          const aId = makeId("pa", `${key}_${i}`);
          const alertTitle = a.title || null;
          const alertDescription = a.description || a.raw || null;
          await db.insert(registryPolicyAlerts).values({
            id: aId,
            jurisdictionId: jId,
            severity: a.severity || null,
            title: alertTitle,
            description: alertDescription,
            createdAt: now,
          }).onConflictDoUpdate({
            target: registryPolicyAlerts.id,
            set: {
              jurisdictionId: jId,
              severity: a.severity || null,
              title: alertTitle,
              description: alertDescription,
            },
          });
          totalAlerts++;
        }

        // ── Programs (layer_1) — dict of category → items[] ──
        const programs = jData.layer_1_programs || {};
        if (typeof programs === "object" && !Array.isArray(programs)) {
          for (const [category, items] of Object.entries(programs)) {
            if (!Array.isArray(items)) continue;
            for (let i = 0; i < items.length; i++) {
              const p = items[i];
              const pId = makeId("prog", `${key}_${category}_${i}`);
              const fp = fingerprint(jId, category, p.name || `${i}`);
              const programName = p.name || null;
              await db.insert(registryPrograms).values({
                id: pId,
                jurisdictionId: jId,
                category: category,
                name: programName,
                agency: p.agency || null,
                eligibility: p.eligibility || null,
                contact: p.contact || null,
                website: p.website || null,
                applyNotes: p.apply_notes || null,
                fingerprint: fp,
                createdAt: now,
              }).onConflictDoUpdate({
                target: registryPrograms.id,
                set: {
                  jurisdictionId: jId,
                  category,
                  name: programName,
                  agency: p.agency || null,
                  eligibility: p.eligibility || null,
                  contact: p.contact || null,
                  website: p.website || null,
                  applyNotes: p.apply_notes || null,
                  fingerprint: fp,
                },
              });
              totalPrograms++;
            }
          }
        }

        // ── Workflows (layer_2) ──
        const workflows = jData.layer_2_workflows || [];
        for (let i = 0; i < workflows.length; i++) {
          const w = workflows[i];
          const wId = makeId("wf", `${key}_${i}`);
          const workflowType = w.workflow_type || null;
          const workflowSteps = w.steps || [];
          const workflowDeadlines = Array.isArray(w.deadlines) ? w.deadlines.join("; ") : (w.deadlines || null);
          const workflowEscalationPaths = Array.isArray(w.escalation_paths) ? w.escalation_paths.join("; ") : (w.escalation_paths || null);
          await db.insert(registryWorkflows).values({
            id: wId,
            jurisdictionId: jId,
            workflowType,
            primaryStatutes: w.primary_statutes || null,
            steps: workflowSteps,
            deadlines: workflowDeadlines,
            escalationPaths: workflowEscalationPaths,
            createdAt: now,
          }).onConflictDoUpdate({
            target: registryWorkflows.id,
            set: {
              jurisdictionId: jId,
              workflowType,
              primaryStatutes: w.primary_statutes || null,
              steps: workflowSteps,
              deadlines: workflowDeadlines,
              escalationPaths: workflowEscalationPaths,
            },
          });
          totalWorkflows++;
        }

        // ── Oversight Bodies (layer_3) ──
        const oversight = jData.layer_3_oversight_enforcement || [];
        for (let i = 0; i < oversight.length; i++) {
          const o = oversight[i];
          const oId = makeId("ob", `${key}_${i}`);
          const oversightAgencyName = o.agency_name || null;
          await db.insert(registryOversightBodies).values({
            id: oId,
            jurisdictionId: jId,
            agencyName: oversightAgencyName,
            function: o.function || null,
            statuteOfLimitations: o.statute_of_limitations || null,
            contact: o.contact || null,
            pathway: o.pathway || null,
            escalation: o.escalation || null,
            createdAt: now,
          }).onConflictDoUpdate({
            target: registryOversightBodies.id,
            set: {
              jurisdictionId: jId,
              agencyName: oversightAgencyName,
              function: o.function || null,
              statuteOfLimitations: o.statute_of_limitations || null,
              contact: o.contact || null,
              pathway: o.pathway || null,
              escalation: o.escalation || null,
            },
          });
          totalOversight++;
        }

        // ── Source Traceability ──
        const st = jData.source_traceability;
        if (st) {
          const stId = makeId("st", key);
          const sourceDocuments = st.source_documents || [];
          const sourceVariants = st.source_variants || [];
          const notesOnMerge = Array.isArray(st.notes_on_merge) ? st.notes_on_merge.join("; ") : null;
          const sourceConflicts = st.conflicts || [];
          await db.insert(registrySourceTraceability).values({
            id: stId,
            jurisdictionId: jId,
            sourceDocuments,
            sourceVariants,
            notesOnMerge,
            conflicts: sourceConflicts,
            createdAt: now,
          }).onConflictDoUpdate({
            target: registrySourceTraceability.id,
            set: {
              jurisdictionId: jId,
              sourceDocuments,
              sourceVariants,
              notesOnMerge,
              conflicts: sourceConflicts,
            },
          });
          totalTraceability++;
        }

        // ── Signal Extraction: generate signals from registry data ──
        const signals = extractSignalsFromJurisdiction(jId, key, jData);
        for (const sig of signals) {
          // Insert into registry_signals table
          await db.insert(registrySignals).values({
            id: sig.id,
            jurisdictionId: jId,
            category: sig.category,
            signalType: sig.signalType,
            severity: sig.severity,
            sourceReference: sig.sourceReference,
            fingerprint: sig.fingerprint,
            createdAt: now,
          }).onConflictDoUpdate({
            target: registrySignals.id,
            set: {
              jurisdictionId: jId,
              category: sig.category,
              signalType: sig.signalType,
              severity: sig.severity,
              sourceReference: sig.sourceReference,
              fingerprint: sig.fingerprint,
            },
          });
          totalSignals++;

          // ALSO insert into live_signals — the SAME table used by pattern/strategy engines
          const lsFp = fingerprint("registry", sig.signalType, jId, sig.category);
          try {
            await db.insert(liveSignals).values({
              signalType: sig.signalType,
              datasetId: "luminari_canonical_registry",
              jurisdiction: key,
              domain: sig.category,
              severity: mapSeverity(sig.severity),
              title: `[Registry] ${sig.signalType} — ${meta.state || key}`,
              explanation: sig.sourceReference || `Registry signal from ${key}`,
              patternSummary: `Registry-derived ${sig.category} signal for ${key}`,
              supportingStatistics: {
                recordsAnalyzed: 1,
                patternCount: 1,
                percentageAffected: 100,
                timeRange: { from: now, to: now },
                jurisdictionsAffected: [key],
                dataSource: "luminari_canonical_registry",
              },
              confidenceScore: "0.9000",
              detectedAt: now,
              ingestRunId: String(runId),
              signalFingerprint: lsFp,
              active: true,
            }).onConflictDoUpdate({
              target: liveSignals.signalFingerprint,
              set: {
                datasetId: "luminari_canonical_registry",
                jurisdiction: key,
                domain: sig.category,
                severity: mapSeverity(sig.severity),
                title: `[Registry] ${sig.signalType} — ${meta.state || key}`,
                explanation: sig.sourceReference || `Registry signal from ${key}`,
                patternSummary: `Registry-derived ${sig.category} signal for ${key}`,
                confidenceScore: "0.9000",
                detectedAt: now,
                ingestRunId: String(runId),
                active: true,
              },
            });
            totalLiveSignals++;
          } catch (e: any) {
            // Duplicate fingerprint — idempotent, skip
            if (!e.message?.includes("Duplicate")) {
              errors.push(`live_signal error for ${key}: ${e.message}`);
            }
          }
        }
      } catch (e: any) {
        errors.push(`Jurisdiction ${key}: ${e.message}`);
      }
    }
  }

  // T3. Update ingest_run with final counts
  const totalRecords = totalJurisdictions + totalPrograms + totalAlerts + totalWorkflows + totalOversight + totalTraceability;
  await db.update(ingestRuns)
    .set({
      endTime: Date.now(),
      recordsProcessed: totalRecords,
      recordsInserted: totalRecords,
      signalsGenerated: totalSignals,
      status: errors.length > 0 ? "partial" : "completed",
      errors: errors.length > 0 ? errors : null,
      summary: `Registry ingestion: ${totalJurisdictions} jurisdictions, ${totalPrograms} programs, ${totalAlerts} alerts, ${totalWorkflows} workflows, ${totalOversight} oversight, ${totalTraceability} traceability, ${totalSignals} signals (${totalLiveSignals} in live_signals)`,
      signalsProcessed: true,
      postProcessingEngine: "registry_canonical_ingest",
      outcomeClassification: errors.length > 0 ? "partial_success" : "full_success",
    })
    .where(eq(ingestRuns.id, runId));

  return {
    ingestRunId: runId,
    jurisdictions: totalJurisdictions,
    programs: totalPrograms,
    policyAlerts: totalAlerts,
    workflows: totalWorkflows,
    oversightBodies: totalOversight,
    sourceTraceability: totalTraceability,
    signalsGenerated: totalSignals,
    signalsInLiveSignals: totalLiveSignals,
    errors,
  };
}

// ─── Signal Extraction Logic ───
function extractSignalsFromJurisdiction(jId: string, key: string, jData: JurisdictionData): Array<{
  id: string; category: string; signalType: string; severity: string; sourceReference: string; fingerprint: string;
}> {
  const signals: Array<{ id: string; category: string; signalType: string; severity: string; sourceReference: string; fingerprint: string }> = [];
  const meta = jData.jurisdiction_metadata || {};

  // Signal: Medicaid expansion status
  if (meta.medicaid && meta.medicaid.includes("NOT")) {
    signals.push({
      id: makeId("sig", `${key}_medicaid_gap`),
      category: "healthcare",
      signalType: "medicaid_expansion_gap",
      severity: "high",
      sourceReference: `${meta.state || key}: ${meta.medicaid}`,
      fingerprint: fingerprint(jId, "medicaid_expansion_gap"),
    });
  }

  // Signal: Federal minimum wage floor (no state minimum wage)
  if (meta.minimum_wage && meta.minimum_wage.includes("federal floor")) {
    signals.push({
      id: makeId("sig", `${key}_wage_floor`),
      category: "employment",
      signalType: "federal_wage_floor_only",
      severity: "medium",
      sourceReference: `${meta.state || key}: ${meta.minimum_wage}`,
      fingerprint: fingerprint(jId, "federal_wage_floor_only"),
    });
  }

  // Signal: Short statute of limitations (contains "FATAL" or very short timeframes)
  if (meta.wage_sol && meta.wage_sol.includes("FATAL")) {
    signals.push({
      id: makeId("sig", `${key}_sol_fatal`),
      category: "employment",
      signalType: "statute_of_limitations_critical",
      severity: "critical",
      sourceReference: `${meta.state || key}: ${meta.wage_sol}`,
      fingerprint: fingerprint(jId, "sol_fatal"),
    });
  }

  if (meta.civil_rights_sol && (meta.civil_rights_sol.includes("180 days") || meta.civil_rights_sol.includes("FATAL"))) {
    signals.push({
      id: makeId("sig", `${key}_cr_sol_short`),
      category: "civil_rights",
      signalType: "civil_rights_sol_short",
      severity: "high",
      sourceReference: `${meta.state || key}: ${meta.civil_rights_sol}`,
      fingerprint: fingerprint(jId, "cr_sol_short"),
    });
  }

  // Signal: Low UI max benefit
  if (meta.ui_max) {
    const match = meta.ui_max.match(/\$(\d+)/);
    if (match && parseInt(match[1]) < 300) {
      signals.push({
        id: makeId("sig", `${key}_low_ui`),
        category: "benefits",
        signalType: "low_unemployment_benefit",
        severity: "medium",
        sourceReference: `${meta.state || key}: ${meta.ui_max}`,
        fingerprint: fingerprint(jId, "low_ui"),
      });
    }
  }

  // Signal: Oversight bodies with FATAL statute of limitations
  const oversight = jData.layer_3_oversight_enforcement || [];
  for (const o of oversight) {
    if (o.statute_of_limitations && o.statute_of_limitations.includes("FATAL")) {
      signals.push({
        id: makeId("sig", `${key}_oversight_fatal_${fingerprint(o.agency_name || "unknown").slice(0, 8)}`),
        category: "oversight",
        signalType: "oversight_sol_critical",
        severity: "critical",
        sourceReference: `${o.agency_name}: ${o.statute_of_limitations}`,
        fingerprint: fingerprint(jId, "oversight_fatal", o.agency_name || "unknown"),
      });
    }
  }

  return signals;
}

function extractAbbreviation(name: string): string {
  if (!name) return "";
  const match = name.match(/\(([A-Z]{2})\)/);
  if (match) return match[1];
  // Common abbreviations
  const abbrevMap: Record<string, string> = {
    "alabama": "AL", "alaska": "AK", "arkansas": "AR", "connecticut": "CT",
    "delaware": "DE", "hawaii": "HI", "idaho": "ID", "iowa": "IA",
    "kansas": "KS", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "mississippi": "MS", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "north carolina": "NC", "north dakota": "ND", "oklahoma": "OK",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "utah": "UT", "vermont": "VT", "wyoming": "WY",
    "american samoa": "AS", "guam": "GU", "northern mariana islands": "MP",
    "puerto rico": "PR", "us virgin islands": "VI", "washington dc": "DC",
  };
  return abbrevMap[name.toLowerCase()] || "";
}

function mapSeverity(s: string): "critical" | "high" | "medium" | "low" {
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}
