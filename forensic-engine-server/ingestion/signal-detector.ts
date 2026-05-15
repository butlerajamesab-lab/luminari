// LINT-GUARD: AUTHORIZED live_signals accessor — signal pipeline infrastructure
/**
 * Live Signal Detection Engine — Broad Recall Edition
 * 
 * Principle: Capture everything that could be a signal. Tsunam decides what's
 * strong enough to surface. Detection should never be the bottleneck.
 * 
 * Detection pipeline (expanded):
 * T1. Query ingested_records for the target dataset.
 * T1b. Load interpretation pack for dataset-specific thresholds and context.
 * T2. Frequency spike detection (lowered thresholds).
 * T3. Geographic clustering (county, region, zip prefix, not just city).
 * T4. Entity repeat detection (partial matches, aliases, broader pool).
 * T5. Status delay detection (expanded status vocabulary).
 * T6. Year-over-year trend anomaly detection (lowered change threshold).
 * T7. NEW: Keyword/description-based signal detection.
 * T8. NEW: Cross-category co-occurrence detection.
 * T9. NEW: Temporal clustering (burst detection within short windows).
 * T10. NEW: Amount anomaly detection (for datasets with financial amounts).
 * T11. Deduplicate signals using fingerprints.
 * T12. Store signals in live_signals with explanations and statistics.
 * 
 * RECALL OVER PRECISION. Tsunam handles precision.
 */

import { db } from "../db";
import { ingestedRecords, liveSignals } from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count } from "drizzle-orm";
import crypto from "crypto";
import {
  loadInterpretationPack,
  getSignalTemplate,
  getCategoryContext,
  getEntityRules,
  getGeoRules,
  getStatusMeaning,
  classifyScope,
  type InterpretationPack,
} from "./interpretation-layer";
import { updateProvenance } from "../signal-governance";
import { processGateBatch } from "../sunam-gate";
import {
  classifyEntity,
  shouldGenerateSignal,
  computeEntityConfidenceScore,
  type EntityClassification,
  type EntityType,
  type EntityRole,
} from "./entity-classifier";

// ─── Thresholds (BROADENED for recall) ───

const MIN_RECORDS_FOR_SIGNAL = 3;       // Was 10 — capture smaller patterns
const MIN_CONFIDENCE_SCORE = 0.35;      // Was 0.60 — let Tsunam filter
const MIN_PATTERN_REPETITION = 2;       // Was 3 — catch early patterns

// ─── Keyword Detection Lists ───

/** High-signal keywords that should generate signals when found in descriptions */
const SIGNAL_KEYWORDS: Record<string, { domain: string; severity: "critical" | "high" | "medium"; category: string }> = {
  // Financial harm
  "foreclosure": { domain: "financial_harm", severity: "high", category: "Housing/Foreclosure" },
  "predatory lending": { domain: "financial_harm", severity: "critical", category: "Predatory Lending" },
  "debt collection": { domain: "financial_harm", severity: "medium", category: "Debt Collection" },
  "wage theft": { domain: "labor_rights", severity: "critical", category: "Wage Theft" },
  "unpaid wages": { domain: "labor_rights", severity: "high", category: "Wage Theft" },
  "minimum wage": { domain: "labor_rights", severity: "high", category: "Wage Violation" },
  "overtime": { domain: "labor_rights", severity: "medium", category: "Overtime Violation" },
  "misclassification": { domain: "labor_rights", severity: "high", category: "Worker Misclassification" },
  "identity theft": { domain: "consumer_protection", severity: "critical", category: "Identity Theft" },
  "fraud": { domain: "consumer_protection", severity: "high", category: "Fraud" },
  "scam": { domain: "consumer_protection", severity: "high", category: "Scam" },
  "deceptive": { domain: "consumer_protection", severity: "high", category: "Deceptive Practices" },
  "unfair": { domain: "consumer_protection", severity: "medium", category: "Unfair Practices" },
  "misleading": { domain: "consumer_protection", severity: "medium", category: "Misleading Practices" },
  "unauthorized": { domain: "consumer_protection", severity: "high", category: "Unauthorized Activity" },
  "billing error": { domain: "consumer_protection", severity: "medium", category: "Billing Disputes" },
  "overcharge": { domain: "consumer_protection", severity: "medium", category: "Overcharging" },
  "refund": { domain: "consumer_protection", severity: "medium", category: "Refund Issues" },
  // Housing
  "eviction": { domain: "housing_rights", severity: "high", category: "Eviction" },
  "habitability": { domain: "housing_rights", severity: "high", category: "Habitability" },
  "mold": { domain: "housing_rights", severity: "medium", category: "Housing Conditions" },
  "lead paint": { domain: "housing_rights", severity: "critical", category: "Lead Paint Exposure" },
  "discrimination": { domain: "civil_rights", severity: "critical", category: "Discrimination" },
  "retaliation": { domain: "civil_rights", severity: "high", category: "Retaliation" },
  "harassment": { domain: "civil_rights", severity: "high", category: "Harassment" },
  "sexual harassment": { domain: "civil_rights", severity: "critical", category: "Sexual Harassment" },
  "wrongful termination": { domain: "labor_rights", severity: "high", category: "Wrongful Termination" },
  // Environmental
  "contamination": { domain: "environmental", severity: "high", category: "Environmental Contamination" },
  "pollution": { domain: "environmental", severity: "high", category: "Pollution" },
  "toxic": { domain: "environmental", severity: "critical", category: "Toxic Exposure" },
  "hazardous": { domain: "environmental", severity: "high", category: "Hazardous Conditions" },
  // Healthcare
  "denied claim": { domain: "healthcare", severity: "high", category: "Insurance Denial" },
  "medical debt": { domain: "healthcare", severity: "high", category: "Medical Debt" },
  "surprise billing": { domain: "healthcare", severity: "high", category: "Surprise Medical Billing" },
  // Data/Privacy
  "data breach": { domain: "privacy", severity: "critical", category: "Data Breach" },
  "privacy violation": { domain: "privacy", severity: "high", category: "Privacy Violation" },
  // Credit reporting
  "credit report": { domain: "financial_harm", severity: "medium", category: "Credit Reporting" },
  "incorrect information": { domain: "financial_harm", severity: "medium", category: "Inaccurate Reporting" },
  "credit score": { domain: "financial_harm", severity: "medium", category: "Credit Score Impact" },
  // Student loans
  "student loan": { domain: "financial_harm", severity: "medium", category: "Student Loans" },
  "loan servicer": { domain: "financial_harm", severity: "medium", category: "Loan Servicing" },
  "forbearance": { domain: "financial_harm", severity: "medium", category: "Forbearance Issues" },
  // Auto
  "auto loan": { domain: "financial_harm", severity: "medium", category: "Auto Lending" },
  "repossession": { domain: "financial_harm", severity: "high", category: "Vehicle Repossession" },
  "lemon": { domain: "consumer_protection", severity: "medium", category: "Lemon Law" },
  // Utilities
  "shutoff": { domain: "utility_rights", severity: "high", category: "Utility Shutoff" },
  "disconnection": { domain: "utility_rights", severity: "high", category: "Service Disconnection" },
};

/** Agency name variants for broader matching */
const AGENCY_ALIASES: Record<string, string[]> = {
  "CFPB": ["Consumer Financial Protection Bureau", "CFPB", "Bureau of Consumer Financial Protection"],
  "FTC": ["Federal Trade Commission", "FTC", "F.T.C."],
  "EEOC": ["Equal Employment Opportunity Commission", "EEOC", "E.E.O.C."],
  "DOL": ["Department of Labor", "DOL", "D.O.L.", "Labor Department"],
  "HUD": ["Housing and Urban Development", "HUD", "H.U.D.", "Dept of Housing"],
  "OSHA": ["Occupational Safety and Health", "OSHA", "O.S.H.A."],
  "EPA": ["Environmental Protection Agency", "EPA", "E.P.A."],
  "SEC": ["Securities and Exchange Commission", "SEC", "S.E.C."],
  "NLRB": ["National Labor Relations Board", "NLRB", "N.L.R.B."],
  "DOJ": ["Department of Justice", "DOJ", "D.O.J.", "Justice Department"],
  "AG": ["Attorney General", "AG", "A.G.", "State AG", "AG Office"],
};

/** Washington State geographic regions for broader geographic matching */
const WA_REGIONS: Record<string, string[]> = {
  "Puget Sound": ["Seattle", "Tacoma", "Bellevue", "Everett", "Kent", "Renton", "Federal Way", "Auburn", "Kirkland", "Redmond", "Lakewood", "Burien", "Tukwila", "SeaTac", "Shoreline", "Lynnwood", "Edmonds", "Bothell", "Issaquah", "Sammamish", "Mercer Island", "Woodinville", "Covington", "Maple Valley", "Bonney Lake"],
  "Eastern WA": ["Spokane", "Yakima", "Kennewick", "Pasco", "Richland", "Walla Walla", "Wenatchee", "Moses Lake", "Ellensburg", "Pullman", "Cheney"],
  "Southwest WA": ["Vancouver", "Longview", "Kelso", "Centralia", "Chehalis", "Olympia", "Tumwater", "Lacey"],
  "Northwest WA": ["Bellingham", "Mount Vernon", "Anacortes", "Burlington", "Sedro-Woolley", "Ferndale", "Lynden"],
  "Peninsula": ["Bremerton", "Silverdale", "Port Orchard", "Port Angeles", "Sequim", "Port Townsend"],
};

// ─── Types ───

interface DetectedSignal {
  signalType: string;
  jurisdiction: string;
  domain: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  explanation: string;
  patternSummary: string;
  supportingStatistics: {
    recordsAnalyzed: number;
    patternCount: number;
    percentageAffected: number;
    timeRange: { from: number; to: number };
    jurisdictionsAffected: string[];
    dataSource: string;
    additionalMetrics?: Record<string, number | string>;
  };
  confidenceScore: number;
  entityType?: EntityType;
  entityRole?: EntityRole;
  entityConfidenceScore?: number;
  roleConfidence?: number;
  canonicalEntityName?: string;
  entityAliases?: string[];
  interpretationContext?: {
    relatedLaws?: string[];
    relatedAgencies?: string[];
    riskType?: string;
    riskDescription?: string;
    scopeClassification?: string;
    actionRecommendation?: string;
    templateUsed?: boolean;
  };
}

// ─── Main Detection Pipeline ───

export async function detectSignals(
  datasetId: string,
  ingestRunId: number,
  onProgress?: (msg: string) => void
): Promise<number> {
  const log = onProgress ?? console.log;
  log(`[SignalDetector] Starting broad-recall analysis for dataset ${datasetId}`);

  // T1. Load dataset records
  const records = await db
    .select()
    .from(ingestedRecords)
    .where(eq(ingestedRecords.datasetId, datasetId));

  if (records.length < MIN_RECORDS_FOR_SIGNAL) {
    log(`[SignalDetector] Only ${records.length} records — below minimum threshold of ${MIN_RECORDS_FOR_SIGNAL}. No signals generated.`);
    return 0;
  }

  log(`[SignalDetector] Analyzing ${records.length} records (broad-recall mode)...`);

  // T1b. Load interpretation pack
  const interpPack = await loadInterpretationPack(datasetId);
  if (interpPack) {
    log(`[SignalDetector] Interpretation pack loaded: ${interpPack.categories.size} categories, ${interpPack.entityRules.length} entity rules, ${interpPack.geoRules.length} geo rules`);
  } else {
    log(`[SignalDetector] No interpretation pack for dataset ${datasetId} — using default thresholds`);
  }

  const allSignals: DetectedSignal[] = [];

  // T2. Frequency spike detection (lowered thresholds)
  const frequencySignals = detectFrequencySpikes(records, datasetId, interpPack);
  allSignals.push(...frequencySignals);
  log(`[SignalDetector] Frequency spikes: ${frequencySignals.length} signals`);

  // T3. Geographic clustering (expanded: zip prefix, region, county)
  const geoSignals = detectGeographicClustering(records, datasetId, interpPack);
  allSignals.push(...geoSignals);
  log(`[SignalDetector] Geographic clusters: ${geoSignals.length} signals`);

  // T4. Entity repeat detection (broader pool, partial matches)
  const entitySignals = detectRepeatEntities(records, datasetId, interpPack);
  allSignals.push(...entitySignals);
  log(`[SignalDetector] Repeat entities: ${entitySignals.length} signals`);

  // T5. Status delay detection (expanded vocabulary)
  const delaySignals = detectStatusDelays(records, datasetId, interpPack);
  allSignals.push(...delaySignals);
  log(`[SignalDetector] Status delays: ${delaySignals.length} signals`);

  // T6. Year-over-year trend anomalies (lowered threshold)
  const trendSignals = detectTrendAnomalies(records, datasetId, interpPack);
  allSignals.push(...trendSignals);
  log(`[SignalDetector] Trend anomalies: ${trendSignals.length} signals`);

  // T7. NEW: Keyword/description-based detection
  const keywordSignals = detectKeywordSignals(records, datasetId);
  allSignals.push(...keywordSignals);
  log(`[SignalDetector] Keyword signals: ${keywordSignals.length} signals`);

  // T8. NEW: Cross-category co-occurrence
  const coOccurrenceSignals = detectCrossCategory(records, datasetId);
  allSignals.push(...coOccurrenceSignals);
  log(`[SignalDetector] Cross-category: ${coOccurrenceSignals.length} signals`);

  // T9. NEW: Temporal clustering (burst detection)
  const burstSignals = detectTemporalBursts(records, datasetId);
  allSignals.push(...burstSignals);
  log(`[SignalDetector] Temporal bursts: ${burstSignals.length} signals`);

  // T10. NEW: Amount anomaly detection
  const amountSignals = detectAmountAnomalies(records, datasetId);
  allSignals.push(...amountSignals);
  log(`[SignalDetector] Amount anomalies: ${amountSignals.length} signals`);

  // T11. Filter by confidence threshold (VERY LOW — Tsunam handles precision)
  const validSignals = allSignals.filter(s => s.confidenceScore >= MIN_CONFIDENCE_SCORE);
  log(`[SignalDetector] ${validSignals.length} signals above threshold (${allSignals.length - validSignals.length} filtered out)`);

  // T12. Store signals with deduplication
  let stored = 0;
  const newLiveSignalIds: number[] = [];
  for (const signal of validSignals) {
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${signal.signalType}|${datasetId}|${signal.jurisdiction}|${signal.domain}|${signal.title}`)
      .digest("hex")
      .substring(0, 64);

    // Check for existing signal with same fingerprint
    const existing = await db
      .select({ id: liveSignals.id })
      .from(liveSignals)
      .where(
        and(
          eq(liveSignals.signalFingerprint, fingerprint),
          eq(liveSignals.active, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(liveSignals)
        .set({ active: false, supersededBy: existing[0].id })
        .where(eq(liveSignals.id, existing[0].id));
    }

    // @ts-expect-error pre-existing type mismatch
    const insertResult = await db.insert(liveSignals).values({
      signalType: signal.signalType,
      datasetId: datasetId,
      jurisdiction: signal.jurisdiction,
      domain: signal.domain,
      severity: signal.severity,
      title: signal.title,
      explanation: signal.explanation,
      patternSummary: signal.patternSummary,
      supportingStatistics: {
        ...signal.supportingStatistics,
        interpretationContext: signal.interpretationContext ?? undefined,
      },
      confidenceScore: signal.confidenceScore.toFixed(4),
      detectedAt: Date.now(),
      ingestRunId: ingestRunId,
      signalFingerprint: fingerprint,
      active: true,
      entityType: signal.entityType ?? null,
      entityConfidenceScore: signal.entityConfidenceScore?.toFixed(4) ?? null,
      canonicalEntityName: signal.canonicalEntityName ?? null,
      entityAliasesJson: signal.entityAliases ?? null,
      entityRole: signal.entityRole ?? null,
      roleConfidence: signal.roleConfidence?.toFixed(4) ?? null,
    });

    // Collect the inserted live_signal ID for Tsunam gate processing
    const insertedId = (insertResult as any)[0]?.insertId;
    if (insertedId) {
      newLiveSignalIds.push(insertedId);
    }

    stored++;
  }

  log(`[SignalDetector] Stored ${stored} signals in live_signals (broad-recall mode)`);

  // T13. Route through Sunam gate: live_signals → gate → detected_signals or extraction_staging
  if (newLiveSignalIds.length > 0) {
    log(`[SignalDetector] Routing ${newLiveSignalIds.length} signals through Sunam gate...`);
    try {
      const gateResult = await processGateBatch(newLiveSignalIds);
      log(`[SignalDetector] Sunam gate: ${gateResult.approved} approved → detected_signals, ${gateResult.rejected} rejected → extraction_staging, ${gateResult.errors} errors`);
    } catch (gateErr) {
      log(`[SignalDetector] Sunam gate error (non-fatal, signals remain in live_signals): ${gateErr}`);
    }
  }

  // Update dataset provenance
  try {
    await updateProvenance(datasetId, {
      lastFetched: Date.now(),
      recordCount: records.length,
      qualityScore: validSignals.length > 0
        ? Math.round(validSignals.reduce((s, v) => s + v.confidenceScore, 0) / validSignals.length * 100)
        : 50,
    });
  } catch (provErr) {
    log(`[SignalDetector] Provenance update error (non-fatal): ${provErr}`);
  }

  return stored;
}

// ─── T2. Frequency Spike Detection (BROADENED) ───

function detectFrequencySpikes(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string,
  interpPack: InterpretationPack | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const categoryCount = new Map<string, number>();
  const total = records.length;

  for (const r of records) {
    const cat = r.normalizedCategory;
    if (cat) categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
  }

  const counts = Array.from(categoryCount.values());
  if (counts.length < 2) return signals;

  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);

  // LOWERED: 1.0 stddev (was 1.5) — catch more categories
  const threshold = mean + 1.0 * stdDev;

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  for (const [category, cnt] of categoryCount) {
    // LOWERED: MIN_RECORDS_FOR_SIGNAL (was hardcoded 10)
    if (cnt >= threshold && cnt >= MIN_RECORDS_FOR_SIGNAL) {
      const pct = (cnt / total) * 100;
      const zScore = stdDev > 0 ? (cnt - mean) / stdDev : 0;
      const confidence = Math.min(0.95, 0.40 + (zScore * 0.12));

      const catContext = interpPack ? getCategoryContext(interpPack, category) : null;
      const template = interpPack ? getSignalTemplate(interpPack, "frequency_spike", zScore > 3 ? "critical" : zScore > 2 ? "high" : "medium") : null;
      const scope = interpPack ? classifyScope(interpPack, jurisdictions, cnt, total) : null;
      const domain = catContext?.domain ?? "consumer_protection";

      let explanation: string;
      if (template) {
        explanation = template.templateText
          .replace(/\{category\}/g, category)
          .replace(/\{count\}/g, cnt.toLocaleString())
          .replace(/\{total\}/g, total.toLocaleString())
          .replace(/\{percentage\}/g, pct.toFixed(1))
          .replace(/\{zScore\}/g, zScore.toFixed(1))
          .replace(/\{mean\}/g, Math.round(mean).toLocaleString());
        if (catContext?.riskDescription) {
          explanation += ` Risk context: ${catContext.riskDescription}`;
        }
      } else {
        explanation = `Records show that "${category}" accounts for ${cnt.toLocaleString()} out of ${total.toLocaleString()} total records (${pct.toFixed(1)}%). This is ${zScore.toFixed(1)} standard deviations above the average category volume of ${Math.round(mean).toLocaleString()} records.`;
      }

      signals.push({
        signalType: "frequency_spike",
        jurisdiction: inferJurisdiction(records),
        domain,
        severity: zScore > 3 ? "critical" : zScore > 2 ? "high" : zScore > 1.5 ? "medium" : "low",
        title: `Sector Spike: ${category}`,
        explanation,
        patternSummary: `Category "${category}" has ${cnt.toLocaleString()} records, ${zScore.toFixed(1)} standard deviations above the mean of ${Math.round(mean).toLocaleString()}.`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: cnt,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: {
            zScore: parseFloat(zScore.toFixed(2)),
            categoryMean: Math.round(mean),
            categoryStdDev: Math.round(stdDev),
            totalCategories: categoryCount.size,
          },
        },
        confidenceScore: confidence,
        interpretationContext: catContext ? {
          relatedLaws: catContext.relatedLaws,
          relatedAgencies: catContext.relatedAgencies,
          riskType: catContext.riskType ?? undefined,
          riskDescription: catContext.riskDescription ?? undefined,
          scopeClassification: scope?.scope,
          templateUsed: !!template,
        } : undefined,
      });
    }
  }

  // ALSO: Generate signals for ANY category with significant absolute count
  for (const [category, cnt] of categoryCount) {
    if (cnt >= 50 && cnt < threshold) {
      // Below stddev threshold but still significant volume
      const pct = (cnt / total) * 100;
      const catContext = interpPack ? getCategoryContext(interpPack, category) : null;
      const domain = catContext?.domain ?? "consumer_protection";

      signals.push({
        signalType: "category_volume",
        jurisdiction: inferJurisdiction(records),
        domain,
        severity: "low",
        title: `Notable Volume: ${category}`,
        explanation: `Category "${category}" has ${cnt.toLocaleString()} records (${pct.toFixed(1)}% of total). While not a statistical spike, the absolute volume warrants monitoring.`,
        patternSummary: `${cnt.toLocaleString()} records in category "${category}".`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: cnt,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: getDateRange(records),
          jurisdictionsAffected: getUniqueJurisdictions(records),
          dataSource: datasetId,
        },
        confidenceScore: 0.40,
      });
    }
  }

  return signals;
}

// ─── T3. Geographic Clustering Detection (EXPANDED) ───

function detectGeographicClustering(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string,
  interpPack: InterpretationPack | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const total = records.length;

  // --- City-level clustering (lowered thresholds) ---
  const cityCount = new Map<string, number>();
  for (const r of records) {
    const city = r.normalizedCity;
    if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
  }

  if (cityCount.size >= 2) {
    const counts = Array.from(cityCount.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);
    // LOWERED: 1.5 stddev (was 2.0)
    const threshold = mean + 1.5 * stdDev;

    const dateRange = getDateRange(records);

    for (const [city, cnt] of cityCount) {
      if (cnt >= threshold && cnt >= MIN_RECORDS_FOR_SIGNAL) {
        const pct = (cnt / total) * 100;
        const zScore = stdDev > 0 ? (cnt - mean) / stdDev : 0;
        const confidence = Math.min(0.93, 0.40 + (zScore * 0.10));

        signals.push({
          signalType: "geographic_cluster",
          jurisdiction: inferJurisdiction(records),
          domain: "consumer_protection",
          severity: zScore > 4 ? "critical" : zScore > 3 ? "high" : zScore > 2 ? "medium" : "low",
          title: `Geographic Concentration: ${city}`,
          explanation: `Records show ${cnt.toLocaleString()} records concentrated in ${city}, representing ${pct.toFixed(1)}% of all records. This is ${zScore.toFixed(1)} standard deviations above the average city volume of ${Math.round(mean).toLocaleString()} records across ${cityCount.size} cities.`,
          patternSummary: `${city} has ${cnt.toLocaleString()} records, ${zScore.toFixed(1)} standard deviations above the city average.`,
          supportingStatistics: {
            recordsAnalyzed: total,
            patternCount: cnt,
            percentageAffected: parseFloat(pct.toFixed(2)),
            timeRange: dateRange,
            jurisdictionsAffected: [city, inferJurisdiction(records)],
            dataSource: datasetId,
            additionalMetrics: {
              totalCities: cityCount.size,
              cityMean: Math.round(mean),
              zScore: parseFloat(zScore.toFixed(2)),
            },
          },
          confidenceScore: confidence,
        });
      }
    }
  }

  // --- State-level clustering ---
  const stateCount = new Map<string, number>();
  for (const r of records) {
    const state = r.normalizedState;
    if (state) stateCount.set(state, (stateCount.get(state) ?? 0) + 1);
  }

  if (stateCount.size >= 3) {
    const counts = Array.from(stateCount.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);
    const threshold = mean + 1.5 * stdDev;

    for (const [state, cnt] of stateCount) {
      if (cnt >= threshold && cnt >= MIN_RECORDS_FOR_SIGNAL) {
        const pct = (cnt / total) * 100;
        const zScore = stdDev > 0 ? (cnt - mean) / stdDev : 0;
        const confidence = Math.min(0.90, 0.40 + (zScore * 0.08));

        signals.push({
          signalType: "state_concentration",
          jurisdiction: state,
          domain: "consumer_protection",
          severity: zScore > 3 ? "high" : "medium",
          title: `State Concentration: ${state}`,
          explanation: `${cnt.toLocaleString()} records (${pct.toFixed(1)}%) are concentrated in ${state}, ${zScore.toFixed(1)} standard deviations above the state average.`,
          patternSummary: `${state}: ${cnt.toLocaleString()} records, ${zScore.toFixed(1)} stddev above mean.`,
          supportingStatistics: {
            recordsAnalyzed: total,
            patternCount: cnt,
            percentageAffected: parseFloat(pct.toFixed(2)),
            timeRange: getDateRange(records),
            jurisdictionsAffected: [state],
            dataSource: datasetId,
            additionalMetrics: { totalStates: stateCount.size, zScore: parseFloat(zScore.toFixed(2)) },
          },
          confidenceScore: confidence,
        });
      }
    }
  }

  // --- ZIP prefix clustering (3-digit zip areas) ---
  const zipPrefixCount = new Map<string, number>();
  for (const r of records) {
    const zip = r.normalizedZip;
    if (zip && zip.length >= 3) {
      const prefix = zip.substring(0, 3);
      zipPrefixCount.set(prefix, (zipPrefixCount.get(prefix) ?? 0) + 1);
    }
  }

  if (zipPrefixCount.size >= 3) {
    const counts = Array.from(zipPrefixCount.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);
    const threshold = mean + 1.5 * stdDev;

    for (const [prefix, cnt] of zipPrefixCount) {
      if (cnt >= threshold && cnt >= MIN_RECORDS_FOR_SIGNAL * 2) {
        const pct = (cnt / total) * 100;
        const zScore = stdDev > 0 ? (cnt - mean) / stdDev : 0;

        signals.push({
          signalType: "zip_area_cluster",
          jurisdiction: inferJurisdiction(records),
          domain: "consumer_protection",
          severity: zScore > 3 ? "high" : "medium",
          title: `ZIP Area Concentration: ${prefix}xx`,
          explanation: `ZIP code area ${prefix}xx has ${cnt.toLocaleString()} records (${pct.toFixed(1)}%), ${zScore.toFixed(1)} standard deviations above the area average.`,
          patternSummary: `ZIP area ${prefix}xx: ${cnt.toLocaleString()} records.`,
          supportingStatistics: {
            recordsAnalyzed: total,
            patternCount: cnt,
            percentageAffected: parseFloat(pct.toFixed(2)),
            timeRange: getDateRange(records),
            jurisdictionsAffected: [prefix + "xx", inferJurisdiction(records)],
            dataSource: datasetId,
            additionalMetrics: { zipPrefix: prefix, totalAreas: zipPrefixCount.size, zScore: parseFloat(zScore.toFixed(2)) },
          },
          confidenceScore: Math.min(0.85, 0.38 + (zScore * 0.08)),
        });
      }
    }
  }

  // --- Region clustering (WA-specific) ---
  for (const [region, cities] of Object.entries(WA_REGIONS)) {
    const citySet = new Set(cities.map(c => c.toLowerCase()));
    let regionCount = 0;
    for (const r of records) {
      if (r.normalizedCity && citySet.has(r.normalizedCity.toLowerCase())) {
        regionCount++;
      }
    }
    if (regionCount >= MIN_RECORDS_FOR_SIGNAL * 3) {
      const pct = (regionCount / total) * 100;
      signals.push({
        signalType: "region_cluster",
        jurisdiction: "Washington",
        domain: "consumer_protection",
        severity: pct > 30 ? "high" : "medium",
        title: `Regional Concentration: ${region}`,
        explanation: `${regionCount.toLocaleString()} records (${pct.toFixed(1)}%) are concentrated in the ${region} region across ${cities.length} cities.`,
        patternSummary: `${region}: ${regionCount.toLocaleString()} records across ${cities.length} cities.`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: regionCount,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: getDateRange(records),
          jurisdictionsAffected: [region, "Washington"],
          dataSource: datasetId,
          additionalMetrics: { citiesInRegion: cities.length },
        },
        confidenceScore: Math.min(0.85, 0.40 + (pct / 100)),
      });
    }
  }

  return signals;
}

// ─── Non-Entity Name Blocklist ───
const NON_ENTITY_NAMES = new Set([
  "private individual", "unknown", "unnamed business", "unknown - imposter scam",
  "n/a", "na", "none", "not applicable", "unspecified", "other", "various",
  "multiple", "anonymous", "confidential", "redacted", "test", "self",
  "individual", "consumer", "complainant",
]);

function isNonEntityName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (NON_ENTITY_NAMES.has(lower)) return true;
  if (lower.length <= 2) return true;
  if (/^\d+$/.test(lower)) return true;
  return false;
}

// ─── T4. Entity Repeat Detection (BROADENED) ───

function detectRepeatEntities(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string,
  interpPack: InterpretationPack | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const entityCount = new Map<string, number>();
  const total = records.length;

  for (const r of records) {
    const entity = r.normalizedEntity;
    if (entity && entity.trim() && !isNonEntityName(entity)) {
      entityCount.set(entity, (entityCount.get(entity) ?? 0) + 1);
    }
  }

  // LOWERED: MIN_PATTERN_REPETITION (was 3, now 2)
  const counts = Array.from(entityCount.values()).filter(c => c >= MIN_PATTERN_REPETITION);
  if (counts.length < 2) return signals;

  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);
  // LOWERED: 1.5 stddev (was 2.0)
  const threshold = mean + 1.5 * stdDev;

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  const entityRules = interpPack ? getEntityRules(interpPack, "repeat_entity") : [];

  // EXPANDED: 50 candidates (was 30), MAX_SIGNALS 30 (was 15)
  const sorted = Array.from(entityCount.entries())
    .filter(([_, cnt]) => cnt >= Math.min(threshold, MIN_RECORDS_FOR_SIGNAL) && cnt >= MIN_PATTERN_REPETITION)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  let emitted = 0;
  const MAX_SIGNALS = 30;

  for (const [entity, cnt] of sorted) {
    if (emitted >= MAX_SIGNALS) break;

    const classification = classifyEntity(entity, datasetId);
    const signalDecision = shouldGenerateSignal(classification, cnt, false);

    // BROADENED: Still generate for suppressed entities if count is high enough
    if (!signalDecision.generate && cnt < 20) {
      continue;
    }

    const entityConfScore = computeEntityConfidenceScore(classification, cnt, total, 1);

    const pct = (cnt / total) * 100;
    const zScore = stdDev > 0 ? (cnt - mean) / stdDev : 0;
    const baseConfidence = Math.min(0.92, 0.40 + (zScore * 0.10));
    const confidence = signalDecision.generate
      ? Math.min(0.95, baseConfidence * signalDecision.priorityMultiplier + (1 - signalDecision.priorityMultiplier) * 0.3)
      : Math.min(0.50, baseConfidence * 0.5); // Lower confidence for suppressed but high-count entities

    const matchingRule = entityRules.find(r => cnt >= r.thresholdCount);
    const ruleSeverity = matchingRule?.severity as "critical" | "high" | "medium" | "low" | undefined;
    const severity = ruleSeverity ?? (cnt > 200 ? "critical" : cnt > 100 ? "high" : cnt > 20 ? "medium" : "low");

    const displayName = classification.canonicalName || entity;
    const entityTypeLabel = classification.entityType.replace(/_/g, " ");
    const roleLabel = classification.entityRole === "business" || classification.entityRole === "respondent"
      ? "Company" : classification.entityRole === "agency" ? "Agency" : "Entity";

    const explanation = `${roleLabel} "${displayName}" (${entityTypeLabel}) appears in ${cnt.toLocaleString()} records out of ${total.toLocaleString()} total (${pct.toFixed(1)}%). This entity is ${zScore.toFixed(1)} standard deviations above the mean entity frequency.`;

    signals.push({
      signalType: "repeat_entity",
      jurisdiction: inferJurisdiction(records),
      domain: "consumer_protection",
      severity,
      title: `Repeat ${roleLabel}: ${displayName}`,
      explanation,
      patternSummary: `${roleLabel} "${displayName}" (${entityTypeLabel}) appears in ${cnt.toLocaleString()} records.`,
      supportingStatistics: {
        recordsAnalyzed: total,
        patternCount: cnt,
        percentageAffected: parseFloat(pct.toFixed(2)),
        timeRange: dateRange,
        jurisdictionsAffected: jurisdictions,
        dataSource: datasetId,
        additionalMetrics: {
          entityMean: Math.round(mean),
          zScore: parseFloat(zScore.toFixed(2)),
          totalEntities: entityCount.size,
          entityType: classification.entityType,
          entityClassificationConfidence: parseFloat(classification.confidence.toFixed(2)),
          signalPriorityMultiplier: signalDecision.priorityMultiplier,
        },
      },
      confidenceScore: confidence,
      entityType: classification.entityType,
      entityRole: classification.entityRole,
      entityConfidenceScore: entityConfScore,
      roleConfidence: classification.roleConfidence,
      canonicalEntityName: classification.canonicalName,
      entityAliases: classification.aliases.length > 0 ? classification.aliases : undefined,
      interpretationContext: {
        ...(matchingRule ? {
          actionRecommendation: matchingRule.actionRecommendation ?? undefined,
        } : {}),
        riskType: classification.entityType,
        riskDescription: signalDecision.reason,
      },
    });

    emitted++;
  }

  return signals;
}

// ─── T5. Status Delay Detection (EXPANDED) ───

function detectStatusDelays(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string,
  interpPack: InterpretationPack | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const statusCount = new Map<string, number>();
  const total = records.length;

  for (const r of records) {
    const status = r.normalizedStatus;
    if (status) statusCount.set(status, (statusCount.get(status) ?? 0) + 1);
  }

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  // EXPANDED: Much broader status vocabulary
  const openStatuses = [
    "Open", "New", "Pending", "In Progress", "Under Review",
    "Received", "Assigned", "Investigating", "Under Investigation",
    "Awaiting Response", "Awaiting Review", "Processing",
    "In review", "In process", "Active", "Ongoing",
    "Referred", "Escalated", "Reopened",
    // CFPB-specific
    "In progress", "Untimely response",
    // Common complaint statuses
    "Unresolved", "Disputed", "Appealed",
  ];

  // Also detect negative resolution statuses
  const negativeStatuses = [
    "Closed with explanation", "Closed without relief",
    "Closed with non-monetary relief", "Closed",
    "Dismissed", "Denied", "Rejected", "Withdrawn",
    "No action taken", "No violation found",
  ];

  let totalOpen = 0;
  const openBreakdown: Record<string, number> = {};

  for (const status of openStatuses) {
    // Case-insensitive matching
    for (const [actualStatus, cnt] of statusCount) {
      if (actualStatus.toLowerCase() === status.toLowerCase() && cnt > 0) {
        totalOpen += cnt;
        openBreakdown[actualStatus] = cnt;
      }
    }
  }

  if (totalOpen >= MIN_RECORDS_FOR_SIGNAL) {
    const pct = (totalOpen / total) * 100;
    const warningThreshold = 3; // LOWERED from 5

    if (pct > warningThreshold) {
      const confidence = Math.min(0.90, 0.40 + (pct / 100));

      const explanation = `${totalOpen.toLocaleString()} records (${pct.toFixed(1)}% of ${total.toLocaleString()} total) remain in unresolved status. Breakdown: ${Object.entries(openBreakdown).map(([s, c]) => `${s}: ${c.toLocaleString()}`).join(", ")}.`;

      signals.push({
        signalType: "status_delay",
        jurisdiction: inferJurisdiction(records),
        domain: "consumer_protection",
        severity: pct > 20 ? "critical" : pct > 10 ? "high" : pct > 5 ? "medium" : "low",
        title: `Elevated Unresolved Record Rate`,
        explanation,
        patternSummary: `${pct.toFixed(1)}% of records are unresolved across ${Object.keys(openBreakdown).length} status categories.`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: totalOpen,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: openBreakdown,
        },
        confidenceScore: confidence,
      });
    }
  }

  // NEW: Detect high negative resolution rates
  let totalNegative = 0;
  const negativeBreakdown: Record<string, number> = {};
  for (const status of negativeStatuses) {
    for (const [actualStatus, cnt] of statusCount) {
      if (actualStatus.toLowerCase() === status.toLowerCase() && cnt > 0) {
        totalNegative += cnt;
        negativeBreakdown[actualStatus] = cnt;
      }
    }
  }

  if (totalNegative >= MIN_RECORDS_FOR_SIGNAL) {
    const pct = (totalNegative / total) * 100;
    if (pct > 20) {
      signals.push({
        signalType: "negative_resolution_rate",
        jurisdiction: inferJurisdiction(records),
        domain: "consumer_protection",
        severity: pct > 50 ? "high" : "medium",
        title: `High Negative Resolution Rate`,
        explanation: `${totalNegative.toLocaleString()} records (${pct.toFixed(1)}%) resolved with negative outcomes. Breakdown: ${Object.entries(negativeBreakdown).map(([s, c]) => `${s}: ${c.toLocaleString()}`).join(", ")}.`,
        patternSummary: `${pct.toFixed(1)}% negative resolution rate.`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: totalNegative,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: negativeBreakdown,
        },
        confidenceScore: Math.min(0.85, 0.40 + (pct / 200)),
      });
    }
  }

  // NEW: Per-status signals for any status with significant count
  for (const [status, cnt] of statusCount) {
    if (cnt >= 100) {
      const pct = (cnt / total) * 100;
      if (pct >= 5) {
        signals.push({
          signalType: "status_concentration",
          jurisdiction: inferJurisdiction(records),
          domain: "consumer_protection",
          severity: "low",
          title: `Status Concentration: ${status}`,
          explanation: `${cnt.toLocaleString()} records (${pct.toFixed(1)}%) have status "${status}".`,
          patternSummary: `Status "${status}": ${cnt.toLocaleString()} records.`,
          supportingStatistics: {
            recordsAnalyzed: total,
            patternCount: cnt,
            percentageAffected: parseFloat(pct.toFixed(2)),
            timeRange: dateRange,
            jurisdictionsAffected: jurisdictions,
            dataSource: datasetId,
          },
          confidenceScore: 0.38,
        });
      }
    }
  }

  return signals;
}

// ─── T6. Year-over-Year Trend Anomaly Detection (LOWERED) ───

function detectTrendAnomalies(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string,
  interpPack: InterpretationPack | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const yearCount = new Map<number, number>();

  for (const r of records) {
    if (r.normalizedDate) {
      const year = new Date(r.normalizedDate).getFullYear();
      if (year >= 2010 && year <= 2030) { // EXPANDED: from 2010 (was 2015)
        yearCount.set(year, (yearCount.get(year) ?? 0) + 1);
      }
    }
  }

  const years = Array.from(yearCount.keys()).sort();
  if (years.length < 2) return signals;

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  for (let i = 1; i < years.length; i++) {
    const prevYear = years[i - 1];
    const currYear = years[i];
    const prevCount = yearCount.get(prevYear) ?? 0;
    const currCount = yearCount.get(currYear) ?? 0;

    if (prevCount < MIN_RECORDS_FOR_SIGNAL) continue;

    const changeRate = ((currCount - prevCount) / prevCount) * 100;

    // LOWERED: 15% threshold (was 30%)
    if (Math.abs(changeRate) > 15) {
      const direction = changeRate > 0 ? "increase" : "decrease";
      const confidence = Math.min(0.90, 0.40 + (Math.abs(changeRate) / 200));
      const severity: "critical" | "high" | "medium" | "low" = Math.abs(changeRate) > 60 ? "high" : Math.abs(changeRate) > 30 ? "medium" : "low";

      const explanation = `Record volume changed from ${prevCount.toLocaleString()} in ${prevYear} to ${currCount.toLocaleString()} in ${currYear}, a ${Math.abs(changeRate).toFixed(1)}% ${direction}.`;

      signals.push({
        signalType: "trend_anomaly",
        jurisdiction: inferJurisdiction(records),
        domain: "consumer_protection",
        severity,
        title: `Year-over-Year ${direction === "increase" ? "Surge" : "Drop"}: ${prevYear}\u2192${currYear}`,
        explanation,
        patternSummary: `${Math.abs(changeRate).toFixed(1)}% ${direction} from ${prevYear} (${prevCount.toLocaleString()}) to ${currYear} (${currCount.toLocaleString()}).`,
        supportingStatistics: {
          recordsAnalyzed: prevCount + currCount,
          patternCount: Math.abs(currCount - prevCount),
          percentageAffected: parseFloat(Math.abs(changeRate).toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: {
            previousYear: prevYear,
            previousCount: prevCount,
            currentYear: currYear,
            currentCount: currCount,
            changeRate: parseFloat(changeRate.toFixed(2)),
          },
        },
        confidenceScore: confidence,
      });
    }
  }

  return signals;
}

// ─── T7. NEW: Keyword/Description-Based Signal Detection ───

function detectKeywordSignals(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const total = records.length;
  const keywordHits = new Map<string, { count: number; keyword: string; config: typeof SIGNAL_KEYWORDS[string] }>();

  for (const r of records) {
    const searchText = [
      r.normalizedDescription,
      r.normalizedCategory,
      r.normalizedEntity,
    ].filter(Boolean).join(" ").toLowerCase();

    for (const [keyword, config] of Object.entries(SIGNAL_KEYWORDS)) {
      if (searchText.includes(keyword.toLowerCase())) {
        const existing = keywordHits.get(keyword) ?? { count: 0, keyword, config };
        existing.count++;
        keywordHits.set(keyword, existing);
      }
    }
  }

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  for (const [keyword, hit] of keywordHits) {
    if (hit.count >= MIN_RECORDS_FOR_SIGNAL) {
      const pct = (hit.count / total) * 100;
      const confidence = Math.min(0.88, 0.38 + (hit.count / total) * 2 + (hit.config.severity === "critical" ? 0.15 : hit.config.severity === "high" ? 0.10 : 0.05));

      signals.push({
        signalType: "keyword_match",
        jurisdiction: inferJurisdiction(records),
        domain: hit.config.domain,
        severity: hit.config.severity,
        title: `Keyword Signal: ${hit.config.category}`,
        explanation: `${hit.count.toLocaleString()} records (${pct.toFixed(1)}%) contain keyword "${keyword}" associated with ${hit.config.category}.`,
        patternSummary: `"${keyword}" found in ${hit.count.toLocaleString()} records.`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: hit.count,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: { keyword, category: hit.config.category },
        },
        confidenceScore: confidence,
      });
    }
  }

  return signals;
}

// ─── T8. NEW: Cross-Category Co-Occurrence Detection ───

function detectCrossCategory(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const total = records.length;

  // Find entities that appear across multiple categories
  const entityCategories = new Map<string, Set<string>>();
  const entityCounts = new Map<string, number>();

  for (const r of records) {
    const entity = r.normalizedEntity;
    const category = r.normalizedCategory;
    if (entity && category && !isNonEntityName(entity)) {
      if (!entityCategories.has(entity)) entityCategories.set(entity, new Set());
      entityCategories.get(entity)!.add(category);
      entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1);
    }
  }

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  let emitted = 0;
  const MAX_CROSS_SIGNALS = 15;

  // Sort by number of categories (most diverse first)
  const sorted = Array.from(entityCategories.entries())
    .filter(([_, cats]) => cats.size >= 3) // Entity appears in 3+ categories
    .sort((a, b) => b[1].size - a[1].size);

  for (const [entity, categories] of sorted) {
    if (emitted >= MAX_CROSS_SIGNALS) break;
    const cnt = entityCounts.get(entity) ?? 0;
    if (cnt < MIN_RECORDS_FOR_SIGNAL) continue;

    const pct = (cnt / total) * 100;
    const catList = Array.from(categories).slice(0, 5);

    signals.push({
      signalType: "cross_category_entity",
      jurisdiction: inferJurisdiction(records),
      domain: "consumer_protection",
      severity: categories.size >= 5 ? "high" : "medium",
      title: `Multi-Category Entity: ${entity}`,
      explanation: `Entity "${entity}" appears across ${categories.size} different categories (${cnt.toLocaleString()} total records): ${catList.join(", ")}${categories.size > 5 ? ` and ${categories.size - 5} more` : ""}.`,
      patternSummary: `"${entity}": ${cnt.toLocaleString()} records across ${categories.size} categories.`,
      supportingStatistics: {
        recordsAnalyzed: total,
        patternCount: cnt,
        percentageAffected: parseFloat(pct.toFixed(2)),
        timeRange: dateRange,
        jurisdictionsAffected: jurisdictions,
        dataSource: datasetId,
        additionalMetrics: {
          categoryCount: categories.size,
          categories: catList.join("; "),
        },
      },
      confidenceScore: Math.min(0.85, 0.40 + (categories.size * 0.08)),
    });

    emitted++;
  }

  return signals;
}

// ─── T9. NEW: Temporal Burst Detection ───

function detectTemporalBursts(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const total = records.length;

  // Group records by month
  const monthCount = new Map<string, number>();
  for (const r of records) {
    if (r.normalizedDate) {
      const d = new Date(r.normalizedDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCount.set(key, (monthCount.get(key) ?? 0) + 1);
    }
  }

  if (monthCount.size < 3) return signals;

  const counts = Array.from(monthCount.values());
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length);

  if (stdDev === 0) return signals;

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  // Find months with burst activity (1.5+ stddev above mean)
  for (const [month, cnt] of monthCount) {
    const zScore = (cnt - mean) / stdDev;
    if (zScore >= 1.5 && cnt >= MIN_RECORDS_FOR_SIGNAL) {
      const pct = (cnt / total) * 100;

      signals.push({
        signalType: "temporal_burst",
        jurisdiction: inferJurisdiction(records),
        domain: "consumer_protection",
        severity: zScore > 3 ? "high" : zScore > 2 ? "medium" : "low",
        title: `Monthly Burst: ${month}`,
        explanation: `${cnt.toLocaleString()} records in ${month}, ${zScore.toFixed(1)} standard deviations above the monthly average of ${Math.round(mean).toLocaleString()}.`,
        patternSummary: `${month}: ${cnt.toLocaleString()} records (${zScore.toFixed(1)} stddev burst).`,
        supportingStatistics: {
          recordsAnalyzed: total,
          patternCount: cnt,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: {
            month,
            monthlyMean: Math.round(mean),
            zScore: parseFloat(zScore.toFixed(2)),
            totalMonths: monthCount.size,
          },
        },
        confidenceScore: Math.min(0.88, 0.38 + (zScore * 0.10)),
      });
    }
  }

  // Group records by week for finer-grained burst detection
  const weekCount = new Map<string, number>();
  for (const r of records) {
    if (r.normalizedDate) {
      const d = new Date(r.normalizedDate);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      weekCount.set(key, (weekCount.get(key) ?? 0) + 1);
    }
  }

  if (weekCount.size >= 4) {
    const wCounts = Array.from(weekCount.values());
    const wMean = wCounts.reduce((a, b) => a + b, 0) / wCounts.length;
    const wStdDev = Math.sqrt(wCounts.reduce((sum, c) => sum + (c - wMean) ** 2, 0) / wCounts.length);

    if (wStdDev > 0) {
      for (const [week, cnt] of weekCount) {
        const zScore = (cnt - wMean) / wStdDev;
        if (zScore >= 2.0 && cnt >= MIN_RECORDS_FOR_SIGNAL * 2) {
          signals.push({
            signalType: "weekly_burst",
            jurisdiction: inferJurisdiction(records),
            domain: "consumer_protection",
            severity: zScore > 3 ? "high" : "medium",
            title: `Weekly Burst: week of ${week}`,
            explanation: `${cnt.toLocaleString()} records in week of ${week}, ${zScore.toFixed(1)} standard deviations above the weekly average of ${Math.round(wMean).toLocaleString()}.`,
            patternSummary: `Week of ${week}: ${cnt.toLocaleString()} records (${zScore.toFixed(1)} stddev burst).`,
            supportingStatistics: {
              recordsAnalyzed: total,
              patternCount: cnt,
              percentageAffected: parseFloat(((cnt / total) * 100).toFixed(2)),
              timeRange: dateRange,
              jurisdictionsAffected: jurisdictions,
              dataSource: datasetId,
              additionalMetrics: { weekOf: week, weeklyMean: Math.round(wMean), zScore: parseFloat(zScore.toFixed(2)) },
            },
            confidenceScore: Math.min(0.85, 0.36 + (zScore * 0.10)),
          });
        }
      }
    }
  }

  return signals;
}

// ─── T10. NEW: Amount Anomaly Detection ───

function detectAmountAnomalies(
  records: typeof ingestedRecords.$inferSelect[],
  datasetId: string
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const total = records.length;

  // Only run if dataset has amount data
  const amounts = records
    // @ts-expect-error pre-existing type mismatch
    .filter(r => r.normalizedAmount != null && r.normalizedAmount > 0)
    .map(r => r.normalizedAmount!);

  if (amounts.length < MIN_RECORDS_FOR_SIGNAL) return signals;

  // @ts-expect-error pre-existing type mismatch
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  // @ts-expect-error pre-existing type mismatch
  const stdDev = Math.sqrt(amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length);

  if (stdDev === 0) return signals;

  const dateRange = getDateRange(records);
  const jurisdictions = getUniqueJurisdictions(records);

  // Detect high-value outliers
  const outlierThreshold = mean + 2 * stdDev;
  // @ts-expect-error pre-existing type mismatch
  const outliers = amounts.filter(a => a > outlierThreshold);

  if (outliers.length >= MIN_RECORDS_FOR_SIGNAL) {
    const pct = (outliers.length / amounts.length) * 100;
    // @ts-expect-error pre-existing type mismatch
    const maxAmount = Math.max(...outliers);
    // @ts-expect-error pre-existing type mismatch
    const avgOutlier = outliers.reduce((a, b) => a + b, 0) / outliers.length;

    signals.push({
      signalType: "amount_outlier",
      jurisdiction: inferJurisdiction(records),
      domain: "financial_harm",
      severity: maxAmount > mean * 10 ? "critical" : maxAmount > mean * 5 ? "high" : "medium",
      title: `High-Value Outliers Detected`,
      explanation: `${outliers.length} records have amounts exceeding ${outlierThreshold.toFixed(2)} (2 stddev above mean of ${mean.toFixed(2)}). Max: ${maxAmount.toFixed(2)}, avg outlier: ${avgOutlier.toFixed(2)}.`,
      patternSummary: `${outliers.length} amount outliers above ${outlierThreshold.toFixed(2)}.`,
      supportingStatistics: {
        recordsAnalyzed: amounts.length,
        patternCount: outliers.length,
        percentageAffected: parseFloat(pct.toFixed(2)),
        timeRange: dateRange,
        jurisdictionsAffected: jurisdictions,
        dataSource: datasetId,
        additionalMetrics: {
          amountMean: parseFloat(mean.toFixed(2)),
          amountStdDev: parseFloat(stdDev.toFixed(2)),
          maxOutlier: parseFloat(maxAmount.toFixed(2)),
          avgOutlier: parseFloat(avgOutlier.toFixed(2)),
        },
      },
      confidenceScore: Math.min(0.88, 0.40 + (outliers.length / amounts.length) * 2),
    });
  }

  // Detect amount concentration in specific ranges
  const ranges = [
    { label: "Under $100", min: 0, max: 100 },
    { label: "$100-$1,000", min: 100, max: 1000 },
    { label: "$1,000-$10,000", min: 1000, max: 10000 },
    { label: "$10,000-$100,000", min: 10000, max: 100000 },
    { label: "Over $100,000", min: 100000, max: Infinity },
  ];

  for (const range of ranges) {
    // @ts-expect-error pre-existing type mismatch
    const inRange = amounts.filter(a => a >= range.min && a < range.max);
    if (inRange.length >= amounts.length * 0.3 && inRange.length >= MIN_RECORDS_FOR_SIGNAL * 3) {
      const pct = (inRange.length / amounts.length) * 100;
      signals.push({
        signalType: "amount_concentration",
        jurisdiction: inferJurisdiction(records),
        domain: "financial_harm",
        severity: "low",
        title: `Amount Concentration: ${range.label}`,
        explanation: `${inRange.length.toLocaleString()} records (${pct.toFixed(1)}%) have amounts in the ${range.label} range.`,
        patternSummary: `${pct.toFixed(1)}% of amounts in ${range.label} range.`,
        supportingStatistics: {
          recordsAnalyzed: amounts.length,
          patternCount: inRange.length,
          percentageAffected: parseFloat(pct.toFixed(2)),
          timeRange: dateRange,
          jurisdictionsAffected: jurisdictions,
          dataSource: datasetId,
          additionalMetrics: { rangeLabel: range.label, rangeMin: range.min, rangeMax: range.max === Infinity ? "Infinity" : range.max },
        },
        confidenceScore: 0.38,
      });
    }
  }

  return signals;
}

// ─── Helpers ───

function getDateRange(records: typeof ingestedRecords.$inferSelect[]): { from: number; to: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const r of records) {
    if (r.normalizedDate) {
      if (r.normalizedDate < min) min = r.normalizedDate;
      if (r.normalizedDate > max) max = r.normalizedDate;
    }
  }
  return {
    from: min === Infinity ? Date.now() : min,
    to: max === -Infinity ? Date.now() : max,
  };
}

function getUniqueJurisdictions(records: typeof ingestedRecords.$inferSelect[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.normalizedState) set.add(r.normalizedState);
    if (r.normalizedJurisdiction) set.add(r.normalizedJurisdiction);
  }
  return Array.from(set).slice(0, 20);
}

/** Infer primary jurisdiction from records (most common state) */
function inferJurisdiction(records: typeof ingestedRecords.$inferSelect[]): string {
  const stateCount = new Map<string, number>();
  for (const r of records) {
    if (r.normalizedState) {
      stateCount.set(r.normalizedState, (stateCount.get(r.normalizedState) ?? 0) + 1);
    }
  }
  if (stateCount.size === 0) return "Unknown";
  const sorted = Array.from(stateCount.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}
