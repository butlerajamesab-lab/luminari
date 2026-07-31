/**
 * Narrative Generator — Session 6
 *
 * Assembles a chronological Statement of Facts from structured evidence
 * (events, quotes, claims, findings, FOIA requests) using deterministic
 * chronological assembly. Each paragraph in the output is anchored to
 * source evidence via a sourceMap.
 *
 * Architecture:
 * T1. Timeline assembly: getCaseTimelineData(caseId) → TimelineItem[]
 * T2. Timeline grouping: groupByDateRange(items) → DateGroup[]
 * T3. (removed — was LLM prompt construction)
 * T4. Deterministic paragraph generation from grouped timeline data
 * T5. Source map construction: mapParagraphsToSources(paragraphs, items) → NarrativeSourceMap
 * T6. Persistence: upsertCaseNarrative(caseId, content, sourceMap)
 *
 * Constraints:
 * - No LLM calls — purely mechanical chronological assembly
 * - Source map must reference actual evidence IDs
 * - Undated items grouped separately at end
 * - Staleness detection via timelineItemCount comparison
 */

import { getCaseTimelineData, upsertCaseNarrative, getCaseNarrative, parseDateToSortKey, listSignalFlags, getCaseInternal } from "./db";
import type { TimelineItem, TimelineItemType } from "./db";
import type { NarrativeSourceMap, NarrativeSourceEntry } from "../drizzle/schema";
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

// ─── T3. Prompt Construction (legacy — retained but unused) ───

/**
 * Build the LLM prompt for narrative generation.
 * Retained for backward compatibility but no longer called.
 */
export function buildNarrativePrompt(
  caseName: string,
  caseDescription: string | null,
  pipelineType: string | null,
  groups: DateGroup[],
  items: TimelineItem[],
  lensContext?: LensContext | null,
): { systemPrompt: string; userPrompt: string } {
  const inventory = items.map((item, idx) => {
    const parts = [`[${idx}] (${item.type}) "${item.label}"`];
    if (item.date) parts.push(`Date: ${item.date}`);
    if (item.documentName) parts.push(`Source: ${item.documentName}`);
    if (item.page) parts.push(`Page: ${item.page}`);
    if (item.entityNames.length > 0) parts.push(`Entities: ${item.entityNames.join(", ")}`);
    if (item.evidentiaryWeight) parts.push(`Weight: ${item.evidentiaryWeight}`);
    return parts.join(" | ");
  }).join("\n");

  const outline = groups.map(g => {
    const itemSummaries = g.items.map(item => {
      const idx = items.indexOf(item);
      return `  [${idx}] ${item.type}: ${item.label}`;
    }).join("\n");
    return `### ${g.label}\n${itemSummaries}`;
  }).join("\n\n");

  return { systemPrompt: "", userPrompt: `${inventory}\n\n${outline}` };
}

// ─── T4. Deterministic Paragraph Generation ───

/**
 * Generate paragraphs mechanically from grouped timeline data.
 * Each DateGroup becomes one paragraph combining all items in that group.
 * Undated items become a "Background" paragraph.
 */
function generateParagraphsFromGroups(
  groups: DateGroup[],
  items: TimelineItem[],
): NarrativeParagraph[] {
  const paragraphs: NarrativeParagraph[] = [];

  // If there are enough groups, add section headings
  const useHeadings = groups.length >= 4;

  for (const group of groups) {
    const isUndated = group.sortKey === Infinity;

    // Add heading paragraph for undated section
    if (isUndated && useHeadings) {
      paragraphs.push({ text: "## Background and Context", sourceRefs: [] });
    } else if (useHeadings && paragraphs.length === 0) {
      paragraphs.push({ text: "## Chronological Record", sourceRefs: [] });
    }

    // Build paragraph text from items in this group
    const sentences: string[] = [];
    const sourceRefs: number[] = [];

    for (const item of group.items) {
      const idx = items.indexOf(item);
      if (idx >= 0) sourceRefs.push(idx);

      // Build sentence for this item
      const sourcePart = item.documentName
        ? ` (Source: ${item.documentName}, ${item.type} #${idx})`
        : ` (${item.type} #${idx})`;

      sentences.push(`${item.label}.${sourcePart}`);
    }

    // Combine into paragraph
    const prefix = isUndated
      ? "The following background information was identified: "
      : `During ${group.label}, the record indicates the following: `;

    const text = prefix + sentences.join(" ");
    paragraphs.push({ text, sourceRefs });
  }

  return paragraphs;
}

// ─── T5. Source Map Construction ───

/**
 * Parse the LLM response into paragraphs with source references.
 * Retained for backward compatibility.
 */
export function parseLLMResponse(
  responseContent: string,
  itemCount: number,
): NarrativeParagraph[] {
  try {
    const jsonMatch = responseContent.match(/\{[\s\S]*"paragraphs"[\s\S]*\}/);
    if (!jsonMatch) {
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

    return parsed.paragraphs.map((p: any) => ({
      text: typeof p.text === "string" ? p.text.trim() : String(p.text || "").trim(),
      sourceRefs: Array.isArray(p.sourceRefs)
        ? p.sourceRefs.filter((ref: any) => typeof ref === "number" && ref >= 0 && ref < itemCount)
        : [],
    })).filter((p: NarrativeParagraph) => p.text.length > 0);
  } catch {
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
 * 3. (skipped — no LLM prompt needed)
 * 4. Generate paragraphs deterministically from grouped data
 * 5. Build source map
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
  }).from(cases).where(eq(cases.id, caseId as any));

  if (!caseRow) {
    return { success: false, error: "Case not found." };
  }

  // T2. Group by date range
  const groups = groupByDateRange(items);

  // T4. Generate paragraphs deterministically
  const paragraphs = generateParagraphsFromGroups(groups, items);

  // T5. Build source map
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
