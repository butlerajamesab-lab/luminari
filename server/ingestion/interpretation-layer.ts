/**
 * Interpretation Layer Service
 *
 * Loads dataset-specific interpretation packs and applies them to:
 * 1. Enrich signal detection with domain-specific thresholds and context
 * 2. Provide plain-language explanations, related laws, and action recommendations
 * 3. Classify signal scope (local/regional/statewide) using jurisdiction guidance
 *
 * Each interpretation pack is keyed by datasetId and cached per-run.
 */

import { db } from "../db";
import {
  interpCategoryInterpretations,
  interpHarmMappings,
  interpTimelineExpectations,
  interpEntitySignalRules,
  interpGeographicSignalRules,
  interpStatusInterpretations,
  interpSignalTemplates,
  interpJurisdictionGuidance,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ───

export interface InterpretationPack {
  datasetId: string;
  categories: Map<string, {
    explanation: string;
    domain: string;
    relatedLaws: string[];
    relatedAgencies: string[];
  }>;
  harmMappings: Map<string, {
    riskType: string;
    riskDescription: string;
    detectionIndicators: string[];
    severityBase: string;
  }>;
  timelines: Map<string, {
    frequency: string | null;
    expectedMinDays: number;
    expectedMaxDays: number;
    sourceReference: string | null;
    notes: string | null;
    electionCycleMultiplier: number | null;
  }>;
  entityRules: Array<{
    signalType: string;
    entityType: string;
    thresholdCount: number;
    timeWindowDays: number;
    severity: string;
    description: string;
    actionRecommendation: string | null;
  }>;
  geoRules: Array<{
    signalType: string;
    geographicScope: string;
    thresholdCount: number;
    thresholdPercentage: number | null;
    timeWindowDays: number | null;
    description: string;
    baselineComparison: string | null;
  }>;
  statusMeanings: Map<string, {
    meaning: string;
    transparencyImplication: string | null;
    signalInterpretation: string;
    warningThresholdPercentage: number | null;
  }>;
  signalTemplates: Map<string, Array<{
    templateText: string;
    severityLevel: string;
    exampleUse: string | null;
    dataContextRequired: string[];
  }>>;
  jurisdictionScopes: Array<{
    scopeName: string;
    description: string;
    detectionCriteria: string;
    examples: string[];
    signalImplications: string | null;
  }>;
}

// ─── In-memory cache (per server lifetime) ───
const packCache = new Map<string, InterpretationPack>();

/**
 * Load the full interpretation pack for a dataset.
 * Results are cached for the server lifetime.
 */
export async function loadInterpretationPack(datasetId: string): Promise<InterpretationPack | null> {
  if (packCache.has(datasetId)) return packCache.get(datasetId)!;

  // Load all 8 tables in parallel
  const [cats, harms, timelines, entityRules, geoRules, statuses, templates, jurisdictions] =
    await Promise.all([
      db.select().from(interpCategoryInterpretations).where(eq(interpCategoryInterpretations.datasetId, datasetId)),
      db.select().from(interpHarmMappings).where(eq(interpHarmMappings.datasetId, datasetId)),
      db.select().from(interpTimelineExpectations).where(eq(interpTimelineExpectations.datasetId, datasetId)),
      db.select().from(interpEntitySignalRules).where(eq(interpEntitySignalRules.datasetId, datasetId)),
      db.select().from(interpGeographicSignalRules).where(eq(interpGeographicSignalRules.datasetId, datasetId)),
      db.select().from(interpStatusInterpretations).where(eq(interpStatusInterpretations.datasetId, datasetId)),
      db.select().from(interpSignalTemplates).where(eq(interpSignalTemplates.datasetId, datasetId)),
      db.select().from(interpJurisdictionGuidance).where(eq(interpJurisdictionGuidance.datasetId, datasetId)),
    ]);

  // If no interpretation data exists for this dataset, return null
  if (cats.length === 0 && harms.length === 0 && templates.length === 0) {
    return null;
  }

  const pack: InterpretationPack = {
    datasetId,
    categories: new Map(cats.map((c: any) => [c.categoryName, {
      explanation: c.plainLanguageExplanation,
      domain: c.domain,
      relatedLaws: (c.relatedLaws ?? []) as string[],
      relatedAgencies: (c.relatedAgencies ?? []) as string[],
    }])),
    harmMappings: new Map(harms.map((h: any) => [h.categoryName, {
      riskType: h.riskType,
      riskDescription: h.riskDescription,
      detectionIndicators: (h.detectionIndicators ?? []) as string[],
      severityBase: h.severityBase,
    }])),
    timelines: new Map(timelines.map((t: any) => [t.categoryName, {
      frequency: t.frequency,
      expectedMinDays: t.expectedMinDays,
      expectedMaxDays: t.expectedMaxDays,
      sourceReference: t.sourceReference,
      notes: t.notes,
      electionCycleMultiplier: t.electionCycleMultiplier,
    }])),
    entityRules: entityRules.map((e: any) => ({
      signalType: e.signalType,
      entityType: e.entityType,
      thresholdCount: e.thresholdCount,
      timeWindowDays: e.timeWindowDays,
      severity: e.severity,
      description: e.description,
      actionRecommendation: e.actionRecommendation,
    })),
    geoRules: geoRules.map((g: any) => ({
      signalType: g.signalType,
      geographicScope: g.geographicScope,
      thresholdCount: g.thresholdCount,
      thresholdPercentage: g.thresholdPercentage,
      timeWindowDays: g.timeWindowDays,
      description: g.description,
      baselineComparison: g.baselineComparison,
    })),
    statusMeanings: new Map(statuses.map((s: any) => [s.status, {
      meaning: s.meaning,
      transparencyImplication: s.transparencyImplication,
      signalInterpretation: s.signalInterpretation,
      warningThresholdPercentage: s.warningThresholdPercentage,
    }])),
    signalTemplates: new Map(),
    jurisdictionScopes: jurisdictions.map((j: any) => ({
      scopeName: j.scopeName,
      description: j.description,
      detectionCriteria: j.detectionCriteria,
      examples: (j.examples ?? []) as string[],
      signalImplications: j.signalImplications,
    })),
  };

  // Group signal templates by signalType
  for (const t of templates) {
    if (!pack.signalTemplates.has(t.signalType)) {
      pack.signalTemplates.set(t.signalType, []);
    }
    pack.signalTemplates.get(t.signalType)!.push({
      templateText: t.templateText,
      severityLevel: t.severityLevel,
      exampleUse: t.exampleUse,
      dataContextRequired: (t.dataContextRequired ?? []) as string[],
    });
  }

  packCache.set(datasetId, pack);
  return pack;
}

/**
 * Clear the interpretation pack cache (useful for testing or after data updates).
 */
export function clearInterpretationCache(): void {
  packCache.clear();
}

// ─── Enrichment Functions ───

/**
 * Get interpretation context for a specific category within a dataset.
 */
export function getCategoryContext(pack: InterpretationPack, category: string) {
  const catInfo = pack.categories.get(category);
  const harmInfo = pack.harmMappings.get(category);
  const timeline = pack.timelines.get(category);

  return {
    category,
    explanation: catInfo?.explanation ?? null,
    domain: catInfo?.domain ?? null,
    relatedLaws: catInfo?.relatedLaws ?? [],
    relatedAgencies: catInfo?.relatedAgencies ?? [],
    riskType: harmInfo?.riskType ?? null,
    riskDescription: harmInfo?.riskDescription ?? null,
    detectionIndicators: harmInfo?.detectionIndicators ?? [],
    severityBase: harmInfo?.severityBase ?? null,
    expectedMinDays: timeline?.expectedMinDays ?? null,
    expectedMaxDays: timeline?.expectedMaxDays ?? null,
    timelineNotes: timeline?.notes ?? null,
    sourceReference: timeline?.sourceReference ?? null,
  };
}

/**
 * Get the best matching signal template for a signal type and severity.
 */
export function getSignalTemplate(
  pack: InterpretationPack,
  signalType: string,
  severity: string
): { templateText: string; exampleUse: string | null } | null {
  const templates = pack.signalTemplates.get(signalType);
  if (!templates || templates.length === 0) return null;

  // Prefer exact severity match, fall back to first available
  const exact = templates.find(t => t.severityLevel === severity);
  const best = exact ?? templates[0];
  return { templateText: best.templateText, exampleUse: best.exampleUse };
}

/**
 * Get entity signal rules that apply to a given signal type.
 */
export function getEntityRules(pack: InterpretationPack, signalType: string) {
  return pack.entityRules.filter(r => r.signalType === signalType);
}

/**
 * Get geographic signal rules that apply to a given signal type.
 */
export function getGeoRules(pack: InterpretationPack, signalType: string) {
  return pack.geoRules.filter(r => r.signalType === signalType);
}

/**
 * Get status interpretation for a specific status value.
 */
export function getStatusMeaning(pack: InterpretationPack, status: string) {
  return pack.statusMeanings.get(status) ?? null;
}

/**
 * Classify the scope of a signal based on jurisdiction guidance rules.
 */
export function classifyScope(
  pack: InterpretationPack,
  affectedJurisdictions: string[],
  recordCount: number,
  totalRecords: number
): { scope: string; description: string; implications: string | null } | null {
  if (pack.jurisdictionScopes.length === 0) return null;

  const pct = (recordCount / totalRecords) * 100;
  const numJurisdictions = affectedJurisdictions.length;

  // Simple heuristic: match based on scope name and criteria
  // national > statewide > regional > local
  if (numJurisdictions > 5 || pct > 50) {
    const national = pack.jurisdictionScopes.find(s => s.scopeName.toLowerCase().includes("national") || s.scopeName.toLowerCase().includes("statewide"));
    if (national) return { scope: national.scopeName, description: national.description, implications: national.signalImplications };
  }
  if (numJurisdictions > 2 || pct > 20) {
    const regional = pack.jurisdictionScopes.find(s => s.scopeName.toLowerCase().includes("regional") || s.scopeName.toLowerCase().includes("multi"));
    if (regional) return { scope: regional.scopeName, description: regional.description, implications: regional.signalImplications };
  }
  const local = pack.jurisdictionScopes.find(s => s.scopeName.toLowerCase().includes("local") || s.scopeName.toLowerCase().includes("single"));
  if (local) return { scope: local.scopeName, description: local.description, implications: local.signalImplications };

  return { scope: pack.jurisdictionScopes[0].scopeName, description: pack.jurisdictionScopes[0].description, implications: pack.jurisdictionScopes[0].signalImplications };
}

/**
 * Build a full interpretation enrichment for a live signal.
 * Used by the UI to display context alongside signal cards.
 */
export async function enrichSignalWithInterpretation(signal: {
  signalType: string;
  datasetId: string;
  severity: string;
  title: string;
  supportingStatistics: any;
}) {
  const pack = await loadInterpretationPack(signal.datasetId);
  if (!pack) return null;

  // Extract category from title if it's a frequency spike
  const categoryMatch = signal.title.match(/:\s*(.+)$/);
  const category = categoryMatch?.[1] ?? null;

  // Get category context
  const catContext = category ? getCategoryContext(pack, category) : null;

  // Get signal template
  const template = getSignalTemplate(pack, signal.signalType, signal.severity);

  // Get entity/geo rules
  const entityRules = getEntityRules(pack, signal.signalType);
  const geoRules = getGeoRules(pack, signal.signalType);

  // Classify scope
  const stats = signal.supportingStatistics ?? {};
  const scope = classifyScope(
    pack,
    stats.jurisdictionsAffected ?? [],
    stats.patternCount ?? 0,
    stats.recordsAnalyzed ?? 1
  );

  // Collect all related laws from category context
  const relatedLaws = catContext?.relatedLaws ?? [];
  const relatedAgencies = catContext?.relatedAgencies ?? [];

  // Get status meanings if relevant
  const statusMeanings: Array<{ status: string; meaning: string; interpretation: string }> = [];
  if (signal.signalType === "status_delay" && stats.additionalMetrics) {
    for (const statusKey of Object.keys(stats.additionalMetrics)) {
      const meaning = getStatusMeaning(pack, statusKey);
      if (meaning) {
        statusMeanings.push({
          status: statusKey,
          meaning: meaning.meaning,
          interpretation: meaning.signalInterpretation,
        });
      }
    }
  }

  return {
    datasetId: signal.datasetId,
    signalType: signal.signalType,
    hasInterpretation: true,
    categoryContext: catContext,
    signalTemplate: template,
    entityRules: entityRules.length > 0 ? entityRules : null,
    geoRules: geoRules.length > 0 ? geoRules : null,
    scopeClassification: scope,
    statusMeanings: statusMeanings.length > 0 ? statusMeanings : null,
    relatedLaws,
    relatedAgencies,
    riskType: catContext?.riskType ?? null,
    riskDescription: catContext?.riskDescription ?? null,
    detectionIndicators: catContext?.detectionIndicators ?? [],
    timelineExpectation: catContext?.expectedMinDays != null ? {
      minDays: catContext.expectedMinDays,
      maxDays: catContext.expectedMaxDays,
      notes: catContext.timelineNotes,
      source: catContext.sourceReference,
    } : null,
  };
}
