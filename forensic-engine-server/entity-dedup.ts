/**
 * Entity Deduplication Scanner
 * 
 * Container-aware: never suggests merges across different containers.
 * Uses LLM to detect similar entity names and generate reviewable suggestions.
 * No automatic merges — all suggestions require human approval.
 */
import * as db from "./db";
import { invokeLLMDeterministic } from "./_core/llm";
import { createHash } from "crypto";

interface DedupCandidate {
  sourceId: number;
  targetId: number;
  confidence: number;
  reason: string;
}

/**
 * Run deduplication scan for a case.
 * Groups entities by type, then sends batches to LLM for similarity analysis.
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

    // Process in batches to stay within LLM context limits
    const BATCH_SIZE = 80;
    for (let i = 0; i < entitiesOfType.length; i += BATCH_SIZE) {
      const batch = entitiesOfType.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) continue;

      const candidates = await detectDuplicatesInBatch(batch, type);
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

async function detectDuplicatesInBatch(
  entities: Array<{ id: number; name: string; type: string; description: string | null; aliases: unknown }>,
  entityType: string,
): Promise<DedupCandidate[]> {
  const entityList = entities.map(e => {
    const aliasStr = Array.isArray(e.aliases) ? (e.aliases as string[]).join(", ") : "";
    return `ID:${e.id} | Name: "${e.name}"${aliasStr ? ` | Aliases: ${aliasStr}` : ""}${e.description ? ` | Desc: ${e.description.slice(0, 100)}` : ""}`;
  }).join("\n");

  // Derive deterministic hash from sorted entity IDs in this batch
  const dedupHash = createHash("sha256")
    .update(`dedup:${entityType}:${entities.map(e => e.id).sort((a, b) => a - b).join(",")}`)
    .digest("hex");

  const response = await invokeLLMDeterministic({
    documentHash: dedupHash,
    pass: "dedup",
    messages: [
      {
        role: "system",
        content: `You are a forensic entity deduplication assistant. You analyze lists of ${entityType} entities and identify likely duplicates — entities that refer to the same real-world person, organization, or location.

RULES:
1. Only flag pairs that very likely refer to the SAME real-world entity
2. Consider name variations: "John Smith" vs "J. Smith" vs "John A. Smith" vs "Smith, John"
3. Consider titles/suffixes: "Bradley Edwards" vs "Bradley J. Edwards, Esq."
4. Consider abbreviations: "FBI" vs "Federal Bureau of Investigation"
5. Consider nicknames or informal names
6. Do NOT flag entities that are merely related (e.g., parent company vs subsidiary)
7. Do NOT flag entities with the same common name if context suggests different people
8. The entity with the more complete/formal name should be the target (surviving entity)
9. Confidence: 0.9+ for near-certain matches, 0.7-0.89 for likely matches, 0.5-0.69 for possible matches
10. Only suggest pairs with confidence >= 0.5

Return a JSON array of duplicate pairs. If no duplicates found, return an empty array.`,
      },
      {
        role: "user",
        content: `Analyze these ${entityType} entities for duplicates:\n\n${entityList}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "dedup_results",
        strict: true,
        schema: {
          type: "object",
          properties: {
            pairs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source_id: { type: "integer", description: "ID of entity to be absorbed (less complete name)" },
                  target_id: { type: "integer", description: "ID of surviving entity (more complete name)" },
                  confidence: { type: "number", description: "0.0-1.0 confidence score" },
                  reason: { type: "string", description: "Brief factual explanation of why these are likely the same entity" },
                },
                required: ["source_id", "target_id", "confidence", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["pairs"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = response.choices[0]?.message?.content as string | undefined;
    if (!content) return [];
    const parsed = JSON.parse(content);
    const validIds = new Set(entities.map(e => e.id));

    return (parsed.pairs || [])
      .filter((p: any) =>
        p.confidence >= 0.5 &&
        validIds.has(p.source_id) &&
        validIds.has(p.target_id) &&
        p.source_id !== p.target_id
      )
      .map((p: any) => ({
        sourceId: p.source_id,
        targetId: p.target_id,
        confidence: Math.min(1, Math.max(0, p.confidence)),
        reason: p.reason,
      }));
  } catch {
    console.error("[Dedup] Failed to parse LLM response");
    return [];
  }
}
