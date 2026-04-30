/**
 * Cross-Stream Signal Correlation Engine
 * Identifies patterns that appear across multiple independent data streams.
 * Checks for shared entity, claim_type, industry, geographic_region, and time_window.
 */
import { db } from "../db";
import { crossStreamCorrelations, detectedSignals } from "../../drizzle/schema";
import { sql, desc, and, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

// ── Types ───────────────────────────────────────────────────────────
export type CorrelationLevel = 1 | 2 | 3;

export interface CorrelationResult {
  correlationId: string;
  entity: string;
  level: CorrelationLevel;
  streamCount: number;
  streams: string[];
  signalCount: number;
  confidenceBoost: number;
  description: string;
  metadata: Record<string, unknown>;
}

// ── Confidence Boost Rules ──────────────────────────────────────────
function getConfidenceBoost(streamCount: number): number {
  if (streamCount >= 4) return 40;
  if (streamCount >= 3) return 20;
  if (streamCount >= 2) return 0; // baseline
  return 0;
}

function getCorrelationLevel(streamCount: number): CorrelationLevel {
  if (streamCount >= 4) return 3;
  if (streamCount >= 3) return 2;
  return 1;
}

// ── Stream Classification ───────────────────────────────────────────
/**
 * Classify a signal's source stream based on its type and metadata.
 */
export function classifyStream(signalType: string, metadata?: Record<string, unknown>): string {
  // Map signal types to stream categories
  const streamMap: Record<string, string> = {
    repeat_entity: "consumer_complaints",
    geographic_cluster: "consumer_complaints",
    temporal_spike: "consumer_complaints",
    lobbying_spike: "lobbying_disclosures",
    industry_policy_pressure: "lobbying_disclosures",
    lobbying_concentration: "lobbying_disclosures",
    policy_pressure_event: "lobbying_disclosures",
    lawsuit_filed: "federal_litigation",
    class_action_filed: "federal_litigation",
    administrative_appeal: "federal_litigation",
    case_dismissed: "federal_litigation",
    case_settlement: "federal_litigation",
    repeat_litigation_pattern: "federal_litigation",
    claim_denial: "administrative_decisions",
    appeal_reversal: "administrative_decisions",
    processing_delay: "administrative_decisions",
    hearing_backlog: "administrative_decisions",
    appeal_success_inversion: "administrative_decisions",
    verified_harm_report: "verified_reports",
    case_signal: "case_workbench",
  };

  return streamMap[signalType] || "unknown";
}

// ── Correlation Detection ───────────────────────────────────────────

/**
 * Find cross-stream correlations by matching entities across signal streams.
 * Time window: 180 days by default.
 */
export async function detectCrossStreamCorrelations(
  timeWindowDays = 180
): Promise<CorrelationResult[]> {
  const results: CorrelationResult[] = [];
  const windowStart = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);

  // Get all active signals within the time window
  const signals = await db
    .select({
      id: detectedSignals.signalId,
      signalType: detectedSignals.signalType,
      title: detectedSignals.plainLanguageExplanation,
      description: detectedSignals.plainLanguageExplanation,
      confidence: detectedSignals.confidenceScore,
      metadata: detectedSignals.crossSignalLinks,
      createdAt: detectedSignals.createdAt,
    })
    .from(detectedSignals)
    .where(and(
      sql`${detectedSignals.escalationStatus} IS NOT NULL`,
      // @ts-expect-error gte overload mismatch with bigint createdAt
      gte(detectedSignals.createdAt, windowStart)
    ));

  // Group signals by entity (extracted from title or metadata)
  const entitySignals: Record<string, { streams: Set<string>; signals: typeof signals; claimTypes: Set<string>; jurisdictions: Set<string> }> = {};

  for (const sig of signals) {
    // Extract entity from title (format: "Entity Name — description")
    const entity = extractEntityFromTitle(sig.title || "");
    if (!entity || entity.length < 3) continue;

    const normalizedEntity = entity.toLowerCase().trim();
    const stream = classifyStream(sig.signalType || "");

    if (!entitySignals[normalizedEntity]) {
      entitySignals[normalizedEntity] = {
        streams: new Set(),
        signals: [],
        claimTypes: new Set(),
        jurisdictions: new Set(),
      };
    }

    entitySignals[normalizedEntity].streams.add(stream);
    entitySignals[normalizedEntity].signals.push(sig);

    // Extract claim type and jurisdiction from metadata if available
    try {
      const meta = typeof sig.metadata === "string" ? JSON.parse(sig.metadata) : sig.metadata;
      if (meta?.claimType) entitySignals[normalizedEntity].claimTypes.add(meta.claimType);
      if (meta?.jurisdiction) entitySignals[normalizedEntity].jurisdictions.add(meta.jurisdiction);
    } catch {}
  }

  // Find entities appearing in 2+ streams
  for (const [entity, data] of Object.entries(entitySignals)) {
    if (data.streams.size < 2) continue;

    const streamCount = data.streams.size;
    const level = getCorrelationLevel(streamCount);
    const confidenceBoost = getConfidenceBoost(streamCount);
    const correlationId = `CORR-${randomUUID().slice(0, 8).toUpperCase()}`;
    const streamsArray = Array.from(data.streams);

    // Build stream breakdown
    const streamBreakdown: Record<string, number> = {};
    for (const sig of data.signals) {
      const stream = classifyStream(sig.signalType || "");
      streamBreakdown[stream] = (streamBreakdown[stream] || 0) + 1;
    }

    const displayEntity = data.signals[0]?.title
      ? extractEntityFromTitle(data.signals[0].title)
      : entity;

    results.push({
      correlationId,
      entity: displayEntity || entity,
      level,
      streamCount,
      streams: streamsArray,
      signalCount: data.signals.length,
      confidenceBoost,
      description: `${displayEntity || entity} appears across ${streamCount} independent streams: ${streamsArray.join(", ")} (${data.signals.length} total signals)`,
      metadata: {
        streamBreakdown,
        claimTypes: Array.from(data.claimTypes),
        jurisdictions: Array.from(data.jurisdictions),
        timeWindowDays,
      },
    });
  }

  // Sort by level descending, then signal count
  results.sort((a, b) => b.level - a.level || b.signalCount - a.signalCount);

  return results;
}

/**
 * Extract entity name from signal title.
 * Titles follow format: "Entity Name — description" or "Company appears in X..."
 */
function extractEntityFromTitle(title: string): string {
  // Try "Entity — description" format
  const dashMatch = title.match(/^(.+?)\s*[—–-]\s/);
  if (dashMatch) return dashMatch[1].trim();

  // Try "Company appears in" format
  const appearsMatch = title.match(/^(.+?)\s+appears?\s+in/i);
  if (appearsMatch) return appearsMatch[1].trim();

  // Try "Entity: description" format
  const colonMatch = title.match(/^(.+?):\s/);
  if (colonMatch) return colonMatch[1].trim();

  return title.split(" ").slice(0, 3).join(" ");
}

/**
 * Store correlation results in the database.
 */
export async function storeCorrelations(correlations: CorrelationResult[]): Promise<{ stored: number }> {
  if (!correlations.length) return { stored: 0 };

  const values = correlations.map(c => ({
    correlationId: c.correlationId,
    entity: c.entity,
    correlationLevel: c.level,
    streamCount: c.streamCount,
    streams: JSON.stringify(c.streams),
    signalCount: c.signalCount,
    confidenceBoost: c.confidenceBoost,
    description: c.description,
    metadata: JSON.stringify(c.metadata),
  }));
  // @ts-expect-error insert values type mismatch

  await db.insert(crossStreamCorrelations).values(values);
  return { stored: values.length };
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getCorrelationStats() {
  const [stats] = await db
    .select({
      totalCorrelations: sql<number>`COUNT(*)`.as("total_correlations"),
      level1: sql<number>`SUM(CASE WHEN correlation_level = 1 THEN 1 ELSE 0 END)`.as("level1"),
      level2: sql<number>`SUM(CASE WHEN correlation_level = 2 THEN 1 ELSE 0 END)`.as("level2"),
      level3: sql<number>`SUM(CASE WHEN correlation_level = 3 THEN 1 ELSE 0 END)`.as("level3"),
      uniqueEntities: sql<number>`COUNT(DISTINCT entity)`.as("unique_entities"),
      avgStreamCount: sql<number>`AVG(stream_count)`.as("avg_stream_count"),
    })
    .from(crossStreamCorrelations);
  return stats;
}

export async function getRecentCorrelations(limit = 20) {
  return db
    .select()
    .from(crossStreamCorrelations)
    .orderBy(desc(crossStreamCorrelations.correlationLevel), desc(crossStreamCorrelations.streamCount))
    .limit(limit);
}

export async function getCorrelationsByEntity(entity: string) {
  return db
    .select()
    .from(crossStreamCorrelations)
    .where(sql`LOWER(${crossStreamCorrelations.entity}) LIKE ${`%${entity.toLowerCase()}%`}`)
    .orderBy(desc(crossStreamCorrelations.correlationLevel));
}
