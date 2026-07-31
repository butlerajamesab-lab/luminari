/**
 * Entity Deduplication Scanner
 * 
 * Container-aware: never suggests merges across different containers.
 * Uses deterministic string comparison (Levenshtein distance, normalized matching,
 * alias overlap) to detect similar entity names and generate reviewable suggestions.
 * No automatic merges — all suggestions require human approval.
 */
import * as db from "./db";
import { createHash } from "crypto";

interface DedupCandidate {
  sourceId: number;
  targetId: number;
  confidence: number;
  reason: string;
}

/**
 * Run deduplication scan for a case.
 * Groups entities by type, then compares pairs using string similarity.
 * Container-aware: only compares entities that share the same case (and thus the same container).
 */
export async function runDedupScan(caseId: number): Promise<number> {
  const allEntities = await db.listEntities(caseId);
  if (allEntities.length < 2) return 0;

  // Group entities by type for more focused comparison
  const byType: Record<string, typeof allEntities> = {};
  for (const e of allEntities) {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(e);
  }

  let totalSuggestions = 0;

  for (const [type, entitiesOfType] of Object.entries(byType)) {
    if (entitiesOfType.length < 2) continue;

    // Process in batches
    const BATCH_SIZE = 80;
    for (let i = 0; i < entitiesOfType.length; i += BATCH_SIZE) {
      const batch = entitiesOfType.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) continue;

      const candidates = detectDuplicatesInBatch(batch, type);
      for (const c of candidates) {
        await db.createMergeSuggestion({
          caseId,
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          confidence: c.confidence,
          reason: c.reason,
        });
        totalSuggestions++;
      }
    }
  }

  return totalSuggestions;
}

// ─── String Normalization ───

const TITLE_SUFFIXES = /\b(esq\.?|jr\.?|sr\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ii|iii|iv)\b/gi;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(TITLE_SUFFIXES, "")
    .replace(/[^\w\s]/g, "")  // remove punctuation
    .replace(/\s+/g, " ")     // collapse whitespace
    .trim();
}

// ─── Levenshtein Distance ───

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix for memory efficiency
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ─── Duplicate Detection ───

function detectDuplicatesInBatch(
  entities: Array<{ id: number; name: string; type: string; description: string | null; aliases: unknown }>,
  entityType: string,
): DedupCandidate[] {
  const candidates: DedupCandidate[] = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];

      const normA = normalizeName(a.name);
      const normB = normalizeName(b.name);

      if (!normA || !normB) continue;

      let confidence = 0;
      let reason = "";

      // Check 1: Exact match on normalized name
      if (normA === normB) {
        confidence = 0.95;
        reason = `Normalized names are identical: "${normA}"`;
      }
      // Check 2: One name contains the other
      else if (normA.includes(normB) || normB.includes(normA)) {
        confidence = 0.85;
        const shorter = normA.length < normB.length ? normA : normB;
        const longer = normA.length >= normB.length ? normA : normB;
        reason = `Name "${shorter}" is contained within "${longer}"`;
      }
      // Check 3: Levenshtein distance relative to max length
      else {
        const maxLen = Math.max(normA.length, normB.length);
        if (maxLen > 0) {
          const dist = levenshtein(normA, normB);
          const ratio = dist / maxLen;
          if (ratio < 0.2) {
            confidence = 0.75;
            reason = `Names are very similar (edit distance ${dist}/${maxLen}): "${a.name}" vs "${b.name}"`;
          }
        }
      }

      // Check 4: Aliases overlap (can upgrade confidence)
      if (confidence < 0.80) {
        const aliasesA = Array.isArray(a.aliases) ? (a.aliases as string[]).map(x => normalizeName(x)) : [];
        const aliasesB = Array.isArray(b.aliases) ? (b.aliases as string[]).map(x => normalizeName(x)) : [];

        if (aliasesA.length > 0 && aliasesB.length > 0) {
          const overlap = aliasesA.some(aa => aliasesB.includes(aa));
          if (overlap) {
            confidence = Math.max(confidence, 0.80);
            reason = `Shared alias found between "${a.name}" and "${b.name}"`;
          }
        }

        // Also check if one entity's name matches the other's alias
        if (aliasesB.includes(normA) || aliasesA.includes(normB)) {
          confidence = Math.max(confidence, 0.80);
          reason = `One entity's name matches the other's alias: "${a.name}" / "${b.name}"`;
        }
      }

      // Only emit if confidence meets threshold
      if (confidence >= 0.5) {
        // The entity with the longer/more complete name is the target (surviving entity)
        const aIsSource = a.name.length <= b.name.length;
        candidates.push({
          sourceId: aIsSource ? a.id : b.id,
          targetId: aIsSource ? b.id : a.id,
          confidence: Math.min(1, Math.max(0, confidence)),
          reason,
        });
      }
    }
  }

  return candidates;
}
