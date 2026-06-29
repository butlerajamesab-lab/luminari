/**
 * Entity Deduplication Service
 *
 * Normalizes entity names and manages canonical alias mappings.
 * Produces reviewable merge suggestions rather than automatic merges.
 *
 * Pipeline:
 * T1. Normalize entity name (trim, collapse whitespace, standardize casing).
 * T2. Strip common suffixes for comparison key generation.
 * T3. Compute similarity between entity names using Levenshtein distance.
 * T4. Group similar entities into merge candidates.
 * T5. Store merge suggestions for review (not auto-merged).
 * T6. Apply confirmed merges to entity_aliases table.
 */

import { db } from "../db";
import { entityAliases } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { classifyEntity, type EntityType } from "./entity-classifier";

// ─── Normalization Rules ───

const STRIP_SUFFIXES = [
  /\s*,?\s*(LLC|L\.L\.C\.?|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|LP|L\.P\.?|LLP|L\.L\.P\.?|PLC|P\.L\.C\.?|S\.A\.?|SA|GmbH)\s*$/i,
];

const STRIP_PREFIXES = [
  /^(The|A|An)\s+/i,
];

const NORMALIZE_REPLACEMENTS: [RegExp, string][] = [
  [/\s+/g, " "],           // collapse whitespace
  [/[\u2018\u2019\u201A\uFF07]/g, "'"],  // normalize smart single quotes
  [/[\u201C\u201D\u201E\uFF02]/g, '"'],  // normalize smart double quotes
  [/&amp;/g, "&"],          // HTML entities
  [/\s*\/\s*/g, "/"],       // normalize slashes
  [/\s*-\s*/g, "-"],        // normalize hyphens
];

/**
 * Normalize an entity name for comparison purposes.
 * Returns a lowercase comparison key.
 */
export function normalizeEntityName(name: string): string {
  let normalized = name.trim();

  // Apply replacements
  for (const [pattern, replacement] of NORMALIZE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

/**
 * Generate a comparison key by stripping suffixes and prefixes.
 * Used for fuzzy matching between entity variants.
 */
export function generateComparisonKey(name: string): string {
  let key = normalizeEntityName(name).toLowerCase();

  // Strip prefixes
  for (const pattern of STRIP_PREFIXES) {
    key = key.replace(pattern, "");
  }

  // Strip suffixes
  for (const pattern of STRIP_SUFFIXES) {
    key = key.replace(pattern, "");
  }

  return key.trim();
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Compute similarity score between two entity names (0-1).
 * Uses comparison keys and Levenshtein distance.
 */
export function computeSimilarity(nameA: string, nameB: string): number {
  const keyA = generateComparisonKey(nameA);
  const keyB = generateComparisonKey(nameB);

  // Exact match on comparison key
  if (keyA === keyB) return 1.0;

  // One contains the other
  if (keyA.includes(keyB) || keyB.includes(keyA)) {
    const ratio = Math.min(keyA.length, keyB.length) / Math.max(keyA.length, keyB.length);
    return 0.8 + (ratio * 0.15);
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(keyA.length, keyB.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(keyA, keyB);
  const similarity = 1 - (distance / maxLen);

  return similarity;
}

export interface MergeSuggestion {
  canonicalName: string;
  entityType: EntityType;
  variants: string[];
  similarity: number;
  confidence: number;
}

/**
 * Find merge candidates from a list of entity names.
 * Groups entities with similarity >= threshold.
 * Returns reviewable suggestions, not auto-merges.
 */
export function findMergeCandidates(
  entities: string[],
  similarityThreshold: number = 0.80
): MergeSuggestion[] {
  const suggestions: MergeSuggestion[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < entities.length; i++) {
    if (processed.has(i)) continue;

    const group: string[] = [entities[i]];
    processed.add(i);

    for (let j = i + 1; j < entities.length; j++) {
      if (processed.has(j)) continue;

      const sim = computeSimilarity(entities[i], entities[j]);
      if (sim >= similarityThreshold) {
        group.push(entities[j]);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      // Choose canonical name: longest name with corporate suffix, or the most common variant
      const canonical = group.reduce((best, name) => {
        const hasCorpSuffix = STRIP_SUFFIXES.some(p => p.test(name));
        const bestHasCorpSuffix = STRIP_SUFFIXES.some(p => p.test(best));
        if (hasCorpSuffix && !bestHasCorpSuffix) return name;
        if (!hasCorpSuffix && bestHasCorpSuffix) return best;
        return name.length > best.length ? name : best;
      });

      const classification = classifyEntity(canonical);
      const avgSimilarity = group.reduce((sum, name) => {
        return sum + (name === canonical ? 1 : computeSimilarity(canonical, name));
      }, 0) / group.length;

      suggestions.push({
        canonicalName: canonical,
        entityType: classification.entityType,
        variants: group.filter(n => n !== canonical),
        similarity: avgSimilarity,
        confidence: classification.confidence,
      });
    }
  }

  return suggestions;
}

/**
 * Apply a confirmed merge: store canonical name and aliases in entity_aliases table.
 */
export async function applyMerge(suggestion: MergeSuggestion): Promise<void> {
  const now = Date.now();

  // Store canonical entry
  try {
    await db.insert(entityAliases).values({
      canonicalName: suggestion.canonicalName,
      aliasName: suggestion.canonicalName,
      entityType: suggestion.entityType,
      confidence: suggestion.confidence.toFixed(4),
      source: "dedup_merge",
      createdAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        canonicalName: suggestion.canonicalName,
        entityType: suggestion.entityType,
      },
    });
  } catch {
    // Ignore duplicate
  }

  // Store each variant as an alias
  for (const variant of suggestion.variants) {
    try {
      await db.insert(entityAliases).values({
        canonicalName: suggestion.canonicalName,
        aliasName: variant,
        entityType: suggestion.entityType,
        confidence: suggestion.confidence.toFixed(4),
        source: "dedup_merge",
        createdAt: now,
      }).onDuplicateKeyUpdate({
        set: {
          canonicalName: suggestion.canonicalName,
          entityType: suggestion.entityType,
        },
      });
    } catch {
      // Ignore duplicate
    }
  }
}

/**
 * Look up the canonical name for an entity.
 * Returns the canonical name if found, otherwise the original name.
 */
export async function resolveCanonicalName(entityName: string): Promise<{
  canonicalName: string;
  entityType: EntityType | null;
  aliases: string[];
}> {
  const cached = await db
    .select()
    .from(entityAliases)
    .where(eq(entityAliases.aliasName, entityName))
    .limit(1);

  if (cached.length > 0) {
    const entry = cached[0];
    const allAliases = await db
      .select({ aliasName: entityAliases.aliasName })
      .from(entityAliases)
      .where(eq(entityAliases.canonicalName, entry.canonicalName));

    return {
      canonicalName: entry.canonicalName,
      entityType: entry.entityType as EntityType,
      aliases: allAliases.map((a: any) => a.aliasName).filter((a: any) => a !== entry.canonicalName),
    };
  }

  return {
    canonicalName: entityName,
    entityType: null,
    aliases: [],
  };
}

/**
 * Backfill entity classifications for existing live_signals.
 * Classifies all repeat_entity signals that don't yet have an entityType.
 */
export async function backfillEntityClassifications(): Promise<{
  total: number;
  classified: number;
  suppressed: number;
  byType: Record<string, number>;
}> {
  const { detectedSignals } = await import("../../drizzle/schema");

  const unclassified = await db
    .select({
      id: detectedSignals.signalId,
      title: detectedSignals.plainLanguageExplanation,
      signalType: detectedSignals.signalType,
    })
    .from(detectedSignals)
    .where(
      sql`${detectedSignals.signalType} = 'repeat_entity' AND ${detectedSignals.entityRole} IS NULL AND ${detectedSignals.escalationStatus} != 'suppressed'`
    );

  const byType: Record<string, number> = {};
  let classified = 0;
  let suppressed = 0;

  for (const signal of unclassified) {
    // Extract entity name from title "Repeat Entity: <name>"
    const entityName = signal.title.replace(/^Repeat Entity:\s*/, "").trim();
    if (!entityName) continue;

    const classification = classifyEntity(entityName);
    byType[classification.entityType] = (byType[classification.entityType] ?? 0) + 1;

    // Update the signal with classification
    await db
      .update(detectedSignals)
      .set({
        entityRole: classification.entityType,
        confidenceScore: Number(classification.confidence.toFixed(4)),
        entityId: classification.canonicalName,
      } as any)
      .where(eq(detectedSignals.signalId, signal.id));

    classified++;

    // If individual_person, deactivate the signal (suppress it)
    if (classification.entityType === "individual_person") {
      await db
        .update(detectedSignals)
        .set({ escalationStatus: 'suppressed' } as any)
        .where(eq(detectedSignals.signalId, signal.id));
      suppressed++;
    }
  }

  return { total: unclassified.length, classified, suppressed, byType };
}
