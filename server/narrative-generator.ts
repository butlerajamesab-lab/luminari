/**
 * Narrative Generator — Session 6
 *
 * Assembles a chronological Statement of Facts from structured evidence
 * (events, quotes, claims, findings, FOIA requests) using a single targeted
 * LLM call. Each paragraph in the output is anchored to source evidence
 * via a sourceMap.
 *
 * Architecture:
 * T1. Timeline assembly: getCaseTimelineData(caseId) → TimelineItem[]
 * T2. Timeline grouping: groupByDateRange(items) → DateGroup[]
 * T3. Prompt construction: buildNarrativePrompt(case, groups) → messages[]
 * T4. LLM generation: invokeLLMInteractive(messages) → structured JSON
 * T5. Source map construction: mapParagraphsToSources(llmOutput, items) → NarrativeSourceMap
 * T6. Persistence: upsertCaseNarrative(caseId, content, sourceMap)
 *
 * Constraints:
 * - One LLM call per generation (no chaining)
 * - Source map must reference actual evidence IDs
 * - Undated items grouped separately at end
 * - Staleness detection via timelineItemCount comparison
 */

import { getCaseTimelineData, upsertCaseNarrative, getCaseNarrative, parseDateToSortKey, listSignalFlags, getCaseInternal } from "./db";
import type { TimelineItem, TimelineItemType } from "./db";
import type { NarrativeSourceMap, NarrativeSourceEntry } from "../drizzle/schema";
import { invokeLLMInteractive } from "./_core/llm";
import { db } from "./db";
import { cases } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { LensContext, ActivatedLens } from "./lens-engine";

// ─── Types ───

export interface DateGroup {
  label: string; // "January 2023", "March 15, 2024", "Undated"
  sortKey: number;
  items: TimelineItem[];
}

export interface NarrativeGenerationResult {
  success: boolean;
  narrativeId?: number;
  content?: string;
  sourceMap?: NarrativeSourceMap;
  timelineItemCount?: number;
  error?: string;
  isStale?: boolean;
}

export interface NarrativeParagraph {
  text: string;
  sourceRefs: number[]; // indices into the timeline items array
}

// ─── T2. Timeline Grouping ───

/**
 * Group timeline items by date proximity.
 * Items with exact dates are grouped by month.
 * Items with year-only dates are grouped by year.
 * Undated items are grouped separately.
 */
export function groupByDateRange(items: TimelineItem[]): DateGroup[] {
  const groups: Map<string, DateGroup> = new Map();
  const undated: TimelineItem[] = [];

  for (const item of items) {
    if (item.sortKey === Infinity || !item.date) {
      undated.push(item);
      continue;
    }

    // Determine grouping key based on precision
    const d = new Date(item.sortKey);
    let groupKey: string;
    let groupLabel: string;

    if (item.datePrecision === "exact" || item.datePrecision === "referenced" || item.datePrecision === "document_date") {
      // Group by month
      groupKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      groupLabel = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    } else {
      // Group by year
      groupKey = `${d.getFullYear()}`;
      groupLabel = `${d.getFullYear()}`;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        label: groupLabel,
        sortKey: d.getTime(),
        items: [],
      });
    }
    groups.get(groupKey)!.items.push(item);
  }

  // Sort groups chronologically
  const sorted = Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey);

  // Add undated group at end if any
  if (undated.length > 0) {
    sorted.push({
      label: "Undated / Approximate",
      sortKey: Infinity,
      items: undated,
    });
  }

  return sorted;
}

// ─── T3. Prompt Construction ───

/**
 * Build the LLM prompt for narrative generation.
 * The prompt instructs the LLM to produce a structured JSON response
 * with paragraphs and source references.
 */
export function buildNarrativePrompt(
  caseName: string,
  caseDescription: string | null,
  pipelineType: string | null,
  groups: DateGroup[],
  items: TimelineItem[],
  lensContext?: LensContext | null,
): { systemPrompt: string; userPrompt: string } {
  // Build the evidence inventory
  const inventory = items.map((item, idx) => {
    const parts = [`[${idx}] (${item.type}) "${item.label}"`];
    if (item.date) parts.push(`Date: ${item.date}`);
    if (item.documentName) parts.push(`Source: ${item.documentName}`);
    if (item.page) parts.push(`Page: ${item.page}`);
    if (item.entityNames.length > 0) parts.push(`Entities: ${item.entityNames.join(", ")}`);
    if (item.evidentiaryWeight) parts.push(`Weight: ${item.evidentiaryWeight}`);
    return parts.join(" | ");
  }).join("\n");

  // Build the chronological outline
  const outline = groups.map(g => {
    const itemSummaries = g.items.map(item => {
      const idx = items.indexOf(item);
      return `  [${idx}] ${item.type}: ${item.label}`;
    }).join("\n");
    return `### ${g.label}\n${itemSummaries}`;
  }).join("\n\n");

  const domainContext = pipelineType
    ? `This case involves ${pipelineType.replace(/_/g, " ")} matters.`
    : "The domain of this case should be inferred from the evidence.";

  const systemPrompt = `You are a forensic analyst writing a Statement of Facts for a legal case. Your task is to synthesize evidence into a clear, chronological narrative.

Rules:
1. Write in third person, past tense, formal legal style.
2. Every factual assertion MUST reference at least one source item by its index number.
3. Organize the narrative chronologically using the date groups provided.
4. Do NOT speculate or add information not present in the evidence.
5. Do NOT use emotional language or advocacy framing.
6. Note contradictions or gaps when the evidence shows them.
7. For undated items, group them in a "Background and Context" section.
8. Use precise language: "According to [source]..." or "The record indicates..."
9. Each paragraph should reference 1-4 source items.
10. For longer narratives (8 or more paragraphs), organize the text under section headings. Use headings such as "Background", "Incident", "Investigation", "Records Requests", "Aftermath", or other headings appropriate to the evidence. Insert headings as standalone paragraphs with the text formatted as "## Heading Name" and an empty sourceRefs array.

Output format: Return a JSON object with this exact structure:
{
  "paragraphs": [
    {
      "text": "The narrative paragraph text with factual assertions.",
      "sourceRefs": [0, 3, 7]
    }
  ]
}

The sourceRefs array contains the index numbers from the evidence inventory. Every paragraph MUST have at least one sourceRef.`;

  // Build lens overlay section (Option C — supplementary context, does not modify extraction)
  let lensSection = "";
  if (lensContext && lensContext.active_lenses.length > 0) {
    const lensDescriptions = lensContext.active_lenses.map(l => {
      const hooks = l.analysis_hooks.length > 0 ? ` (focus areas: ${l.analysis_hooks.join(", ")})` : "";
      return `- **${l.label}** [${l.category}]${hooks}`;
    }).join("\n");

    const allHooks = Array.from(new Set(lensContext.active_lenses.flatMap(l => l.analysis_hooks)));
    const hookGuidance = allHooks.length > 0
      ? `\n\nWhen the evidence supports it, pay particular attention to: ${allHooks.join(", ")}. Do not force these perspectives — only apply them where the evidence naturally supports the observation.`
      : "";

    lensSection = `\n\n## Active Analysis Lenses\nThe following analytical perspectives have been activated for this case based on its domain and evidence signals:\n${lensDescriptions}${hookGuidance}\n\nThese lenses provide supplementary framing. Continue to follow all rules above — especially: no speculation, no advocacy, every assertion must cite evidence.`;
  }

  const userPrompt = `Case: "${caseName}"
${caseDescription ? `Description: ${caseDescription}` : ""}
${domainContext}

## Evidence Inventory (${items.length} items)
${inventory}

## Chronological Outline
${outline}${lensSection}

Generate a Statement of Facts narrative. Reference evidence items by their [index] numbers in sourceRefs.`;

  return { systemPrompt, userPrompt };
}

// ─── T4-T5. Generation Pipeline ───

/**
 * Parse the LLM response into paragraphs with source references.
 * Handles both well-formed JSON and fallback text extraction.
 */
export function parseLLMResponse(
  responseContent: string,
  itemCount: number,
): NarrativeParagraph[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseContent.match(/\{[\s\S]*"paragraphs"[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: treat entire response as a single paragraph
      return [{
        text: responseContent.trim(),
        sourceRefs: [],
      }];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.paragraphs)) {
      return [{
        text: responseContent.trim(),
        sourceRefs: [],
      }];
    }

    // Validate and clean source refs
    return parsed.paragraphs.map((p: any) => ({
      text: typeof p.text === "string" ? p.text.trim() : String(p.text || "").trim(),
      sourceRefs: Array.isArray(p.sourceRefs)
        ? p.sourceRefs.filter((ref: any) => typeof ref === "number" && ref >= 0 && ref < itemCount)
        : [],
    })).filter((p: NarrativeParagraph) => p.text.length > 0);
  } catch {
    // JSON parse failed — treat as plain text
    const paragraphs = responseContent.split(/\n\n+/).filter(p => p.trim().length > 0);
    return paragraphs.map(text => ({
      text: text.trim(),
      sourceRefs: [],
    }));
  }
}

/**
 * Build the NarrativeSourceMap from parsed paragraphs and timeline items.
 */
export function buildSourceMap(
  paragraphs: NarrativeParagraph[],
  items: TimelineItem[],
): NarrativeSourceMap {
  return paragraphs.map((p, idx) => ({
    paragraphIndex: idx,
    sources: p.sourceRefs
      .map(ref => {
        const item = items[ref];
        if (!item) return null;
        const entry: NarrativeSourceEntry = {
          type: item.type,
          id: item.id,
          label: item.label,
        };
        if (item.documentId != null) entry.documentId = item.documentId;
        if (item.documentName != null) entry.documentName = item.documentName;
        if (item.page != null) entry.page = item.page;
        if (item.date != null) entry.date = item.date;
        return entry;
      })
      .filter((s: NarrativeSourceEntry | null): s is NarrativeSourceEntry => s !== null),
  }));
}

/**
 * T1-T6. Full generation pipeline.
 *
 * 1. Load timeline data for the case
 * 2. Group by date range
 * 3. Build LLM prompt
 * 4. Call LLM (single call)
 * 5. Parse response and build source map
 * 6. Persist to case_narratives
 */
export async function generateNarrative(
  caseId: number,
  userId: number,
): Promise<NarrativeGenerationResult> {
  // T1. Load timeline data
  const items = await getCaseTimelineData(caseId);

  if (items.length === 0) {
    return {
      success: false,
      error: "No evidence found for this case. Upload and analyze documents first.",
    };
  }

  // Load case metadata
  const [caseRow] = await db.select({
    name: cases.name,
    description: cases.description,
    pipelineType: cases.pipelineType,
  }).from(cases).where(eq(cases.id, caseId));

  if (!caseRow) {
    return { success: false, error: "Case not found." };
  }

  // T2. Group by date range
  const groups = groupByDateRange(items);

  // T2b. Build LensContext (Option C overlay — supplementary, not modifying extraction)
  let lensContext: LensContext | null = null;
  try {
    const { activateLensesWithResolution, mapSignalFlags, getCachedRegistry } = await import("./lens-engine");
    const { resolveCanonical } = await import("./pipeline-resolver");
    const cached = getCachedRegistry();
    if (cached) {
      const fullCase = await getCaseInternal(caseId);
      const flags = await listSignalFlags(caseId);
      const flagTypes = flags.map(f => f.flagType);
      const evidenceSignals = mapSignalFlags(flagTypes);
      lensContext = activateLensesWithResolution(
        {
          caseId,
          primaryDomain: caseRow.pipelineType,
          manualLensIds: (fullCase?.manualLensOverrides as string[] | null) || undefined,
        },
        evidenceSignals,
        resolveCanonical,
      );
    }
  } catch {
    // Non-fatal: narrative generation works without lenses
    lensContext = null;
  }

  // T3. Build prompt
  const { systemPrompt, userPrompt } = buildNarrativePrompt(
    caseRow.name,
    caseRow.description,
    caseRow.pipelineType,
    groups,
    items,
    lensContext,
  );

  // T4. Call LLM (single call)
  let llmResponse: string;
  try {
    const result = await invokeLLMInteractive({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "narrative_output",
          strict: true,
          schema: {
            type: "object",
            properties: {
              paragraphs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Narrative paragraph text" },
                    sourceRefs: {
                      type: "array",
                      items: { type: "integer" },
                      description: "Indices into the evidence inventory",
                    },
                  },
                  required: ["text", "sourceRefs"],
                  additionalProperties: false,
                },
              },
            },
            required: ["paragraphs"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = result.choices?.[0]?.message?.content;
    llmResponse = typeof rawContent === "string" ? rawContent : "";
  } catch (err: any) {
    return {
      success: false,
      error: `LLM generation failed: ${err.message || "Unknown error"}`,
    };
  }

  if (!llmResponse) {
    return { success: false, error: "LLM returned empty response." };
  }

  // T5. Parse response and build source map
  const paragraphs = parseLLMResponse(llmResponse, items.length);
  const sourceMap = buildSourceMap(paragraphs, items);
  const content = paragraphs.map(p => p.text).join("\n\n");

  // T6. Persist
  const narrative = await upsertCaseNarrative({
    caseId,
    userId,
    content,
    sourceMap,
    timelineItemCount: items.length,
  });

  return {
    success: true,
    narrativeId: narrative.id,
    content,
    sourceMap,
    timelineItemCount: items.length,
  };
}

/**
 * Check if the existing narrative is stale (evidence has changed since generation).
 */
export async function checkNarrativeStaleness(caseId: number): Promise<{
  isStale: boolean;
  currentItemCount: number;
  narrativeItemCount: number | null;
  narrative: Awaited<ReturnType<typeof getCaseNarrative>>;
}> {
  const narrative = await getCaseNarrative(caseId);
  const items = await getCaseTimelineData(caseId);

  if (!narrative) {
    return {
      isStale: true,
      currentItemCount: items.length,
      narrativeItemCount: null,
      narrative: null,
    };
  }

  return {
    isStale: items.length !== narrative.timelineItemCount,
    currentItemCount: items.length,
    narrativeItemCount: narrative.timelineItemCount,
    narrative,
  };
}
