/**
 * Provenance Alerting — Self-monitoring governance layer.
 *
 * Post-pipeline hook that checks provenance metrics and fires
 * owner notifications when thresholds are breached. 24-hour
 * cooldown per alert type prevents spam.
 */

import { db } from "./db";
import { provenanceAlertEvents } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import { getProvenanceDrilldownMetrics } from "./db";
import { notifyOwner } from "./_core/notification";

// ─── Constants ───

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const UNSUPPORTED_RATE_THRESHOLD = 5; // percentage
const COVERAGE_THRESHOLD = 90; // percentage

type AlertType = "PROVENANCE_DRIFT" | "PROVENANCE_COVERAGE_DROP";

// ─── Cooldown Check ───

async function isInCooldown(alertType: AlertType): Promise<boolean> {
  const now = Date.now();
  const [recent] = await db
    .select()
    .from(provenanceAlertEvents)
    .where(
      and(
        eq(provenanceAlertEvents.alertType, alertType),
        gt(provenanceAlertEvents.cooldownUntil, now)
      )
    )
    .limit(1);
  return !!recent;
}

// ─── Log Alert Event ───

async function logAlertEvent(
  alertType: AlertType,
  metrics: {
    coverage: number;
    unsupportedRate: number;
    fallbackRate: number;
    totalFindings: number;
    unsupportedCount: number;
    batchId?: number;
  },
  notificationSent: boolean
): Promise<number> {
  const [result] = await db.insert(provenanceAlertEvents).values({
    alertType,
    metrics,
    cooldownUntil: Date.now() + COOLDOWN_MS,
    notificationSent,
    createdAt: Date.now(),
  });
  return result.insertId;
}

// ─── Core: Check Thresholds and Alert ───

export async function checkProvenanceThresholds(caseId?: number): Promise<{
  checked: boolean;
  alerts: Array<{ type: AlertType; sent: boolean; reason: string }>;
}> {
  const m = await getProvenanceDrilldownMetrics(caseId);

  if (m.totalFindings === 0) {
    return { checked: true, alerts: [] };
  }

  const coverage = 100 - m.unsupportedRate; // coverage = 100% - unsupported%
  const alerts: Array<{ type: AlertType; sent: boolean; reason: string }> = [];

  const metricsPayload = {
    coverage,
    unsupportedRate: m.unsupportedRate,
    fallbackRate: m.fallbackUsageRate,
    totalFindings: m.totalFindings,
    unsupportedCount: m.unsupportedCount,
  };

  // Check PROVENANCE_DRIFT: unsupported rate > 5%
  if (m.unsupportedRate > UNSUPPORTED_RATE_THRESHOLD) {
    const inCooldown = await isInCooldown("PROVENANCE_DRIFT");

    if (!inCooldown) {
      let sent = false;
      try {
        sent = await notifyOwner({
          title: "⚠️ Provenance Drift Detected",
          content: [
            `Unsupported finding rate has exceeded ${UNSUPPORTED_RATE_THRESHOLD}%.`,
            ``,
            `Current metrics:`,
            `• Unsupported rate: ${m.unsupportedRate}%`,
            `• Coverage: ${coverage.toFixed(2)}%`,
            `• Fallback rate: ${m.fallbackUsageRate}%`,
            `• Total findings: ${m.totalFindings}`,
            `• Unsupported count: ${m.unsupportedCount}`,
            ``,
            `Action: Review unsupported findings in Provenance Drill-Down.`,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[Alerting] Failed to send PROVENANCE_DRIFT notification:", err);
        sent = false;
      }

      await logAlertEvent("PROVENANCE_DRIFT", metricsPayload, sent);
      alerts.push({
        type: "PROVENANCE_DRIFT",
        sent,
        reason: `Unsupported rate ${m.unsupportedRate}% > ${UNSUPPORTED_RATE_THRESHOLD}% threshold`,
      });
    } else {
      console.log("[Alerting] PROVENANCE_DRIFT in cooldown, skipping notification");
    }
  }

  // Check PROVENANCE_COVERAGE_DROP: coverage < 90%
  if (coverage < COVERAGE_THRESHOLD) {
    const inCooldown = await isInCooldown("PROVENANCE_COVERAGE_DROP");

    if (!inCooldown) {
      let sent = false;
      try {
        sent = await notifyOwner({
          title: "⚠️ Provenance Coverage Below Threshold",
          content: [
            `Provenance coverage has dropped below ${COVERAGE_THRESHOLD}%.`,
            ``,
            `Current metrics:`,
            `• Coverage: ${coverage.toFixed(2)}%`,
            `• Unsupported rate: ${m.unsupportedRate}%`,
            `• Fallback rate: ${m.fallbackUsageRate}%`,
            `• Total findings: ${m.totalFindings}`,
            `• Unsupported count: ${m.unsupportedCount}`,
            ``,
            `Action: Run batch re-matching or review claim extraction pipeline.`,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[Alerting] Failed to send PROVENANCE_COVERAGE_DROP notification:", err);
        sent = false;
      }

      await logAlertEvent("PROVENANCE_COVERAGE_DROP", metricsPayload, sent);
      alerts.push({
        type: "PROVENANCE_COVERAGE_DROP",
        sent,
        reason: `Coverage ${coverage.toFixed(2)}% < ${COVERAGE_THRESHOLD}% threshold`,
      });
    } else {
      console.log("[Alerting] PROVENANCE_COVERAGE_DROP in cooldown, skipping notification");
    }
  }

  return { checked: true, alerts };
}

// ─── List Alert History ───

export async function listAlertEvents(limit = 20): Promise<ProvenanceAlertEvent[]> {
  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(provenanceAlertEvents)
    .orderBy(desc(provenanceAlertEvents.createdAt))
    .limit(limit);
}

type ProvenanceAlertEvent = typeof provenanceAlertEvents.$inferSelect;
