/**
 * Intervention Timeline Engine
 * 
 * Tracks pattern evolution over time:
 * pattern_detected → strategy_generated → intervention_started → 
 * intervention_completed → outcome_recorded → trend_shift → policy_change
 * 
 * Each event is linked to a pattern and records the progression
 * from detection through resolution.
 */
import { db } from "../db";
import { eq, desc, sql, and, gte, lte, asc } from "drizzle-orm";
import { patternTimelineEvents } from "../../drizzle/schema";

export const EVENT_TYPES = [
  { id: "pattern_detected", label: "Pattern Detected", icon: "eye", color: "#3b82f6" },
  { id: "strategy_generated", label: "Strategy Generated", icon: "lightbulb", color: "#8b5cf6" },
  { id: "intervention_started", label: "Intervention Started", icon: "play", color: "#f59e0b" },
  { id: "intervention_completed", label: "Intervention Completed", icon: "check-circle", color: "#10b981" },
  { id: "outcome_recorded", label: "Outcome Recorded", icon: "clipboard", color: "#06b6d4" },
  { id: "trend_shift", label: "Trend Shift", icon: "trending-up", color: "#ec4899" },
  { id: "policy_change", label: "Policy Change", icon: "landmark", color: "#14b8a6" },
] as const;

export type TimelineEventType = typeof EVENT_TYPES[number]["id"];

/** Record a new timeline event */
export async function recordTimelineEvent(input: {
  patternId: string;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  eventSource?: string;
  impactScore?: number;
  metadata?: Record<string, any>;
  timestamp?: number;
}) {
  const [result] = await db.insert(patternTimelineEvents).values({
    patternId: input.patternId,
    eventType: input.eventType,
    title: input.title,
    description: input.description,
    eventSource: input.eventSource,
    impactScore: input.impactScore ?? 0,
    metadata: input.metadata,
    timestamp: input.timestamp ?? Date.now(),
  });

  return { id: (result as any).insertId };
}

/** Get timeline for a specific pattern */
export async function getPatternTimeline(patternId: string) {
  const events = await db.select().from(patternTimelineEvents)
    .where(eq(patternTimelineEvents.patternId, patternId))
    .orderBy(asc(patternTimelineEvents.timestamp));

  // Calculate progression
  const eventTypeOrder = EVENT_TYPES.map(t => t.id);
  const latestEventType = events.length > 0
    ? events[events.length - 1].eventType
    : null;
  const progressIndex = latestEventType
    ? eventTypeOrder.indexOf(latestEventType)
    : -1;
  const progressPercent = eventTypeOrder.length > 0
    ? Math.round(((progressIndex + 1) / eventTypeOrder.length) * 100)
    : 0;

  return {
    patternId,
    events,
    totalEvents: events.length,
    latestEventType,
    progressPercent,
    currentStage: latestEventType
      ? EVENT_TYPES.find(t => t.id === latestEventType)?.label || "Unknown"
      : "Not started",
  };
}

/** Get all timelines (grouped by pattern) */
export async function getAllTimelines(limit = 50) {
  const allEvents = await db.select().from(patternTimelineEvents)
    .orderBy(desc(patternTimelineEvents.timestamp))
    .limit(500);

  // Group by pattern
  const grouped = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const existing = grouped.get(event.patternId) || [];
    existing.push(event);
    grouped.set(event.patternId, existing);
  }

  const timelines = Array.from(grouped.entries()).map(([patternId, events]) => {
    events.sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
    const latestEvent = events[events.length - 1];
    const eventTypeOrder = EVENT_TYPES.map(t => t.id);
    const progressIndex = eventTypeOrder.indexOf(latestEvent.eventType);

    return {
      patternId,
      eventCount: events.length,
      firstEvent: events[0],
      latestEvent,
      currentStage: EVENT_TYPES.find(t => t.id === latestEvent.eventType)?.label || "Unknown",
      progressPercent: Math.round(((progressIndex + 1) / eventTypeOrder.length) * 100),
      startedAt: Number(events[0].timestamp),
      lastUpdatedAt: Number(latestEvent.timestamp),
    };
  });

  // Sort by last updated
  timelines.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);

  return timelines.slice(0, limit);
}

/** Get recent events across all patterns */
export async function getRecentEvents(limit = 30) {
  return db.select().from(patternTimelineEvents)
    .orderBy(desc(patternTimelineEvents.timestamp))
    .limit(limit);
}

/** Get timeline stats */
export async function getTimelineStats() {
  const allEvents = await db.select().from(patternTimelineEvents);
  
  const uniquePatterns = new Set(allEvents.map((e: any) => e.patternId));
  const byType = EVENT_TYPES.map(t => ({
    type: t.id,
    label: t.label,
    count: allEvents.filter((e: any) => e.eventType === t.id).length,
    color: t.color,
  }));

  // Patterns that reached policy_change
  const patternsWithPolicyChange = new Set(
    allEvents.filter((e: any) => e.eventType === "policy_change").map((e: any) => e.patternId)
  );

  return {
    totalEvents: allEvents.length,
    uniquePatterns: uniquePatterns.size,
    patternsWithPolicyChange: patternsWithPolicyChange.size,
    byType,
    avgImpactScore: allEvents.length > 0
      ? Math.round(allEvents.reduce((sum: any, e: any) => sum + (e.impactScore || 0), 0) / allEvents.length)
      : 0,
  };
}

/** Delete a timeline event */
export async function deleteTimelineEvent(eventId: number) {
  await db.delete(patternTimelineEvents).where(eq(patternTimelineEvents.id, eventId));
  return { success: true };
}

/** Update a timeline event */
export async function updateTimelineEvent(eventId: number, updates: {
  title?: string;
  description?: string;
  impactScore?: number;
  metadata?: Record<string, any>;
}) {
  const setValues: any = {};
  if (updates.title !== undefined) setValues.title = updates.title;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.impactScore !== undefined) setValues.impactScore = updates.impactScore;
  if (updates.metadata !== undefined) setValues.metadata = updates.metadata;

  await db.update(patternTimelineEvents).set(setValues).where(eq(patternTimelineEvents.id, eventId));
  return { success: true };
}
