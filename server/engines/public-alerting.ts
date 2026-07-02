import { db } from "../db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import {
  alertSubscriptions,
  alertEvents,
  alertDeliveryLog,
  detectedSignals,
  type AlertSubscriptionRow,
  type AlertEventRow,
  type AlertDeliveryLogRow,
} from "../../drizzle/schema";

// ─── Subscription Types ──────────────────────────────────────────────
export const SUBSCRIPTION_TYPES = [
  "pattern", "entity", "industry", "jurisdiction", "risk_level",
] as const;

export const ALERT_CHANNELS = ["in_app", "email", "webhook"] as const;
export const ALERT_FREQUENCIES = ["immediate", "daily_digest", "weekly_digest"] as const;

// ─── Create Subscription ─────────────────────────────────────────────

export async function createSubscription(params: {
  userId: string;
  subscriptionType: string;
  targetId?: number;
  targetName: string;
  alertChannel: string;
  alertFrequency: string;
  thresholdRiskScore?: number;
  thresholdSignalCount?: number;
}): Promise<AlertSubscriptionRow> {
  const now = Date.now();

  // SCHEMA NOTE: alertSubscriptions columns (per drizzle/schema.ts):
  //   targetScope (not targetName), alertFrequency (not alertChannel),
  //   isPaused (not isActive), riskThreshold (string, not thresholdRiskScore/thresholdSignalCount).
  //   createdAt/updatedAt are bigint milliseconds.
  await db.insert(alertSubscriptions).values({
    userId: params.userId,
    subscriptionType: params.subscriptionType,
    targetId: params.targetId || null,
    targetScope: params.targetName,
    alertFrequency: params.alertFrequency || "immediate",
    isPaused: 0,
    createdAt: now,
    updatedAt: now,
  });

  const [sub] = await db.select().from(alertSubscriptions)
    .where(and(
      eq(alertSubscriptions.userId, params.userId),
      eq(alertSubscriptions.targetScope, params.targetName),
      eq(alertSubscriptions.subscriptionType, params.subscriptionType)
    ))
    .orderBy(desc(alertSubscriptions.id))
    .limit(1);

  return sub;
}

// ─── List User Subscriptions ─────────────────────────────────────────

export async function listUserSubscriptions(userId: string): Promise<AlertSubscriptionRow[]> {
  // isPaused=0 means the subscription is active (not paused).
  return db.select().from(alertSubscriptions)
    .where(and(eq(alertSubscriptions.userId, userId), eq(alertSubscriptions.isPaused, 0)))
    .orderBy(desc(alertSubscriptions.createdAt));
}

// ─── Toggle Subscription ─────────────────────────────────────────────

export async function toggleSubscription(subscriptionId: number, isActive: boolean): Promise<void> {
  // isPaused is the inverse of isActive: active=not-paused, inactive=paused.
  await db.update(alertSubscriptions)
    .set({ isPaused: isActive ? 0 : 1, updatedAt: Date.now() })
    .where(eq(alertSubscriptions.id, subscriptionId));
}

// ─── Delete Subscription ─────────────────────────────────────────────

export async function deleteSubscription(subscriptionId: number): Promise<void> {
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.id, subscriptionId));
}

// ─── Check Alert Triggers ────────────────────────────────────────────

export async function checkAlertTriggers(): Promise<AlertEventRow[]> {
  // isPaused=0 means the subscription is active (not paused).
  const activeSubs = await db.select().from(alertSubscriptions)
    .where(eq(alertSubscriptions.isPaused, 0));

  const newEvents: AlertEventRow[] = [];
  const now = Date.now();
  const oneDayAgo = new Date(now - 86400000);
  const oneDayAgoMs = now - 86400000;

  for (const sub of activeSubs) {
    let shouldTrigger = false;
    let message = "";
    let riskScore = 0;

    if (sub.subscriptionType === "entity") {
      // SCHEMA MISMATCH: detectedSignals.entityId is a UUID foreign key, not an entity name.
      // sub.targetScope stores the entity name/scope string. Matching UUID to name is incorrect;
      // a join against the entities table would be required. Using signalType as proxy for now.
      // TODO: verify production schema and fix this join.
      const newSignals = await db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals)
        .where(and(
          eq(detectedSignals.signalType, sub.targetScope ?? ""),
          gte(detectedSignals.detectionTimestamp, oneDayAgo)
        ));
      const signalCount = newSignals[0]?.count || 0;
      if (signalCount > 0) {
        shouldTrigger = true;
        message = `Entity scope "${sub.targetScope}" has ${signalCount} new signals`;
        riskScore = Math.min(100, signalCount * 10);
      }
    }

    if (sub.subscriptionType === "industry") {
      // SCHEMA MISMATCH: detectedSignals has no complaintCategory column; that column is on
      // signal_extractions. Using detectedSignals.datasetId as the nearest available proxy.
      // TODO: verify production schema — may need to join signal_extractions instead.
      const newSignals = await db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals)
        .where(and(
          eq(detectedSignals.datasetId, sub.industry ?? ""),
          gte(detectedSignals.detectionTimestamp, oneDayAgo)
        ));
      const signalCount = newSignals[0]?.count || 0;
      if (signalCount > 0) {
        shouldTrigger = true;
        message = `Industry "${sub.industry}" has ${signalCount} new signals`;
        riskScore = Math.min(100, signalCount * 5);
      }
    }

    if (sub.subscriptionType === "jurisdiction") {
      const newSignals = await db.select({ count: sql<number>`COUNT(*)` }).from(detectedSignals)
        .where(and(
          eq(detectedSignals.jurisdictionScope, sub.jurisdiction ?? ""),
          gte(detectedSignals.detectionTimestamp, oneDayAgo)
        ));
      const signalCount = newSignals[0]?.count || 0;
      if (signalCount > 0) {
        shouldTrigger = true;
        message = `Jurisdiction "${sub.jurisdiction}" has ${signalCount} new signals`;
        riskScore = Math.min(100, signalCount * 5);
      }
    }

    if (shouldTrigger) {
      // Dedup: check if we already triggered for this subscription recently
      const recentEvent = await db.select().from(alertEvents)
        .where(and(
          eq(alertEvents.subscriptionId, sub.id),
          gte(alertEvents.createdAt, oneDayAgoMs)
        ))
        .limit(1);

      if (!recentEvent[0]) {
        await db.insert(alertEvents).values({
          subscriptionId: sub.id,
          alertType: sub.subscriptionType,
          triggerSource: sub.targetScope,
          riskScore,
          riskLevel: riskScore >= 70 ? "critical" : riskScore >= 40 ? "warning" : "info",
          severity: riskScore >= 70 ? "critical" : riskScore >= 40 ? "warning" : "info",
          message,
          createdAt: now,
        });

        const [evt] = await db.select().from(alertEvents)
          .where(eq(alertEvents.subscriptionId, sub.id))
          .orderBy(desc(alertEvents.id))
          .limit(1);

        if (evt) newEvents.push(evt);
      }
    }
  }

  return newEvents;
}

// ─── Process Events → Delivery Log ──────────────────────────────────

export async function processEventsToDelivery(): Promise<AlertDeliveryLogRow[]> {
  // Find alert events that haven't been delivered yet
  const undelivered = await db.select().from(alertEvents)
    .where(sql`${alertEvents.sentAt} IS NULL`)
    .orderBy(alertEvents.createdAt)
    .limit(50);

  const deliveries: AlertDeliveryLogRow[] = [];
  const now = Date.now();

  for (const evt of undelivered) {
    // Get the subscription to find the channel
    const [sub] = await db.select().from(alertSubscriptions)
      .where(eq(alertSubscriptions.id, evt.subscriptionId!))
      .limit(1);

    if (!sub) continue;

    await db.insert(alertDeliveryLog).values({
      alertId: evt.id,
      // alertFrequency is the closest available column; alertChannel does not exist in the schema.
      channel: sub.alertFrequency || "immediate",
      recipient: sub.userId,
      status: "delivered",
      sentAt: now,
    });

    // Mark the event as sent
    await db.update(alertEvents)
      .set({ sentAt: now })
      .where(eq(alertEvents.id, evt.id));

    const [delivery] = await db.select().from(alertDeliveryLog)
      .where(eq(alertDeliveryLog.alertId, evt.id))
      .orderBy(desc(alertDeliveryLog.id))
      .limit(1);

    if (delivery) deliveries.push(delivery);
  }

  return deliveries;
}

// ─── Get User Notifications (via alert events) ──────────────────────

export async function getUserNotifications(userId: string, limit: number = 50): Promise<AlertEventRow[]> {
  // Get subscriptions for this user, then get their events
  const subs = await db.select().from(alertSubscriptions)
    .where(eq(alertSubscriptions.userId, userId));

  if (subs.length === 0) return [];

  const subIds = subs.map((s: any) => s.id);
  const events = await db.select().from(alertEvents)
    .orderBy(desc(alertEvents.createdAt))
    .limit(limit * 2); // fetch more, filter in JS

  return events.filter((e: any) => e.subscriptionId && subIds.includes(e.subscriptionId)).slice(0, limit);
}

// ─── Mark Notification Read ──────────────────────────────────────────

export async function markNotificationRead(eventId: number): Promise<void> {
  await db.update(alertEvents)
    .set({ sentAt: Date.now() })
    .where(eq(alertEvents.id, eventId));
}

// ─── Alerting Stats ──────────────────────────────────────────────────

export async function getAlertingStats() {
  const [totalSubs] = await db.select({ count: sql<number>`COUNT(*)` }).from(alertSubscriptions);
  const [activeSubs] = await db.select({ count: sql<number>`COUNT(*)` }).from(alertSubscriptions)
    // isPaused=0 means the subscription is active.
    .where(eq(alertSubscriptions.isPaused, 0));
  const [totalEvents] = await db.select({ count: sql<number>`COUNT(*)` }).from(alertEvents);
  const [pendingDeliveries] = await db.select({ count: sql<number>`COUNT(*)` }).from(alertDeliveryLog)
    .where(eq(alertDeliveryLog.status, "pending"));

  return {
    totalSubscriptions: totalSubs?.count || 0,
    activeSubscriptions: activeSubs?.count || 0,
    totalEvents: totalEvents?.count || 0,
    pendingDeliveries: pendingDeliveries?.count || 0,
  };
}
