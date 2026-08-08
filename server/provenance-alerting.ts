/**
 * Provenance Alerting — Self-monitoring governance layer.
 *
 * Post-pipeline hook that checks provenance metrics and fires
 * owner notifications when thresholds are breached. 24-hour
 * cooldown per alert type prevents spam.
 */

import {
  createProvenanceAlertEvent,
  getProvenanceDrilldownMetrics,
  isProvenanceAlertInCooldown,
  listProvenanceAlertEvents,
} from "./db";
import { notifyOwner } from "./_core/notification";
import type {
  ProvenanceAlertEventCompat,
  ProvenanceAlertMetrics,
  ProvenanceAlertType,
} from "./provenance-alert-runtime-compat";

// ─── Constants ───

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const UNSUPPORTED_RATE_THRESHOLD = 5; // percentage
const COVERAGE_THRESHOLD = 90; // percentage

// ─── Cooldown Check ───

async function isInCooldown(alertType: ProvenanceAlertType): Promise<boolean> {
  return isProvenanceAlertInCooldown(alertType, Date.now());
}

// ─── Log Alert Event ───

async function logAlertEvent(
  alertType: ProvenanceAlertType,
  metrics: ProvenanceAlertMetrics,
  notificationSent: boolean,
): Promise<number> {
  const now = Date.now();
  return createProvenanceAlertEvent({
    alertType,
    metrics,
    cooldownUntil: now + COOLDOWN_MS,
    notificationSent,
    createdAt: now,
  });
}

// ─── Core: Check Thresholds and Alert ───

export async function checkProvenanceThresholds(
  caseId?: number,
  batchId?: number,
): Promise<{
  checked: boolean;
  alerts: Array<{ type: ProvenanceAlertType; sent: boolean; reason: string }>;
}> {
  const m = await getProvenanceDrilldownMetrics(caseId);

  // No population means there is no provenance rate to evaluate. The check ran,
  // but no alert event is fabricated from an empty denominator.
  if (m.totalFindings === 0) {
    return { checked: true, alerts: [] };
  }

  const coverage = 100 - m.unsupportedRate; // coverage = 100% - unsupported%
  const alerts: Array<{ type: ProvenanceAlertType; sent: boolean; reason: string }> = [];

  const metricsPayload: ProvenanceAlertMetrics = {
    coverage,
    unsupportedRate: m.unsupportedRate,
    fallbackRate: m.fallbackUsageRate,
    totalFindings: m.totalFindings,
    unsupportedCount: m.unsupportedCount,
    ...(batchId === undefined ? {} : { batchId }),
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
            ...(batchId === undefined ? [] : [`• Completed batch: #${batchId}`]),
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
            ...(batchId === undefined ? [] : [`• Completed batch: #${batchId}`]),
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

export async function listAlertEvents(limit = 20): Promise<ProvenanceAlertEventCompat[]> {
  return listProvenanceAlertEvents(limit);
}
