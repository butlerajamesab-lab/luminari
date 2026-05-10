/**
 * ESCALATION WINDOW SERVICE
 * Tracks 30-day response window for initial engagement
 */

import { createHash } from "crypto";

export interface WindowEntry {
  case_id: string;
  packet_id: string;
  sent_at: string; // Authoritative timestamp
  opened_at: string | null; // Optional, not authoritative for window
  response_received_at: string | null;
  response_window_days: number;
  days_elapsed: number;
  days_remaining: number;
  window_status: "ACTIVE" | "EXPIRED" | "RESPONDED";
  follow_up_eligible: boolean;
  follow_up_triggered_at: string | null;
  escalation_stage: "INITIAL" | "FOLLOW_UP" | "PUBLIC";
  window_hash: string;
  created_at: string;
  updated_at: string;
}

export interface WindowCheckResult {
  case_id: string;
  window_active: boolean;
  days_elapsed: number;
  days_remaining: number;
  window_status: "ACTIVE" | "EXPIRED" | "RESPONDED";
  follow_up_eligible: boolean;
  follow_up_reason?: string;
}

/**
 * Create a new window entry when escalation is sent
 */
export function createWindowEntry(
  caseId: string,
  packetId: string,
  responseDays: number = 30
): WindowEntry {
  const now = new Date().toISOString();

  const entry: WindowEntry = {
    case_id: caseId,
    packet_id: packetId,
    sent_at: now,
    opened_at: null,
    response_received_at: null,
    response_window_days: responseDays,
    days_elapsed: 0,
    days_remaining: responseDays,
    window_status: "ACTIVE",
    follow_up_eligible: false,
    follow_up_triggered_at: null,
    escalation_stage: "INITIAL",
    window_hash: "",
    created_at: now,
    updated_at: now,
  };

  entry.window_hash = generateWindowHash(entry);
  return entry;
}

/**
 * Record that packet was opened (informational only, not authoritative for window)
 */
export function recordOpened(entry: WindowEntry): WindowEntry {
  if (!entry.opened_at) {
    entry.opened_at = new Date().toISOString();
    entry.updated_at = new Date().toISOString();
    entry.window_hash = generateWindowHash(entry);
  }
  return entry;
}

/**
 * Record that response was received
 */
export function recordResponse(entry: WindowEntry): WindowEntry {
  entry.response_received_at = new Date().toISOString();
  entry.window_status = "RESPONDED";
  entry.follow_up_eligible = false;
  entry.updated_at = new Date().toISOString();
  entry.window_hash = generateWindowHash(entry);
  return entry;
}

/**
 * Check window status and calculate days elapsed/remaining
 * sent_at is the ONLY authoritative timestamp
 */
export function checkWindow(entry: WindowEntry): WindowCheckResult {
  const now = new Date();
  const sentDate = new Date(entry.sent_at);

  // Calculate days elapsed since sent_at
  const msElapsed = now.getTime() - sentDate.getTime();
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));

  // Calculate days remaining
  const daysRemaining = Math.max(0, entry.response_window_days - daysElapsed);

  // Determine window status
  let windowStatus: "ACTIVE" | "EXPIRED" | "RESPONDED" = "ACTIVE";
  if (entry.response_received_at) {
    windowStatus = "RESPONDED";
  } else if (daysElapsed >= entry.response_window_days) {
    windowStatus = "EXPIRED";
  }

  // Determine if follow-up is eligible
  const followUpEligible = windowStatus === "EXPIRED" && !entry.response_received_at;

  return {
    case_id: entry.case_id,
    window_active: windowStatus === "ACTIVE",
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    window_status: windowStatus,
    follow_up_eligible: followUpEligible,
    follow_up_reason: followUpEligible ? "30-day window expired without response" : undefined,
  };
}

/**
 * Update entry based on current window status
 */
export function updateWindowStatus(entry: WindowEntry): WindowEntry {
  const result = checkWindow(entry);

  entry.days_elapsed = result.days_elapsed;
  entry.days_remaining = result.days_remaining;
  entry.window_status = result.window_status;
  entry.follow_up_eligible = result.follow_up_eligible;
  entry.updated_at = new Date().toISOString();
  entry.window_hash = generateWindowHash(entry);

  return entry;
}

/**
 * Trigger follow-up escalation after window expires
 */
export function triggerFollowUp(entry: WindowEntry): WindowEntry {
  const result = checkWindow(entry);

  if (!result.follow_up_eligible) {
    throw new Error(`Cannot trigger follow-up: ${result.window_status}`);
  }

  entry.follow_up_triggered_at = new Date().toISOString();
  entry.escalation_stage = "FOLLOW_UP";
  entry.sent_at = new Date().toISOString(); // Reset sent_at for new window
  entry.days_elapsed = 0;
  entry.days_remaining = entry.response_window_days;
  entry.window_status = "ACTIVE";
  entry.updated_at = new Date().toISOString();
  entry.window_hash = generateWindowHash(entry);

  return entry;
}

/**
 * Check if follow-up can be triggered (either window expired or operator override)
 */
export function canTriggerFollowUp(entry: WindowEntry, operatorOverride: boolean = false): boolean {
  const result = checkWindow(entry);

  if (operatorOverride) {
    return true;
  }

  return result.follow_up_eligible;
}

/**
 * Trigger media escalation (PUBLIC stage)
 */
export function triggerMediaEscalation(entry: WindowEntry): WindowEntry {
  entry.escalation_stage = "PUBLIC";
  entry.updated_at = new Date().toISOString();
  entry.window_hash = generateWindowHash(entry);
  return entry;
}

/**
 * Generate deterministic hash of window entry
 */
export function generateWindowHash(entry: WindowEntry): string {
  const payload = JSON.stringify({
    case_id: entry.case_id,
    packet_id: entry.packet_id,
    sent_at: entry.sent_at,
    response_received_at: entry.response_received_at,
    response_window_days: entry.response_window_days,
    escalation_stage: entry.escalation_stage,
  });

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Verify window entry integrity
 */
export function verifyWindowIntegrity(entry: WindowEntry): boolean {
  const expectedHash = generateWindowHash(entry);
  return entry.window_hash === expectedHash;
}

/**
 * Validate window entry for escalation readiness
 */
export function validateWindowForEscalation(entry: WindowEntry): { valid: boolean; reason?: string } {
  if (!verifyWindowIntegrity(entry)) {
    return {
      valid: false,
      reason: "Window integrity check failed",
    };
  }

  if (!entry.sent_at) {
    return {
      valid: false,
      reason: "sent_at timestamp is required",
    };
  }

  if (entry.response_window_days <= 0) {
    return {
      valid: false,
      reason: "response_window_days must be positive",
    };
  }

  return { valid: true };
}

/**
 * Get window summary for display
 */
export function getWindowSummary(entry: WindowEntry): string {
  const result = checkWindow(entry);

  const parts: string[] = [];
  parts.push(`Case: ${entry.case_id}`);
  parts.push(`Sent: ${entry.sent_at}`);
  parts.push(`Status: ${result.window_status}`);
  parts.push(`Days Elapsed: ${result.days_elapsed}/${entry.response_window_days}`);
  parts.push(`Days Remaining: ${result.days_remaining}`);
  parts.push(`Stage: ${entry.escalation_stage}`);

  if (entry.response_received_at) {
    parts.push(`Response Received: ${entry.response_received_at}`);
  }

  if (result.follow_up_eligible) {
    parts.push(`Follow-up Eligible: YES`);
  }

  return parts.join(" | ");
}

/**
 * List all cases eligible for follow-up (window expired, no response)
 */
export function findFollowUpCandidates(entries: WindowEntry[]): WindowEntry[] {
  return entries.filter((entry) => {
    const result = checkWindow(entry);
    return result.follow_up_eligible;
  });
}

/**
 * Calculate batch follow-up statistics
 */
export function calculateFollowUpStats(entries: WindowEntry[]): {
  total: number;
  active: number;
  expired: number;
  responded: number;
  follow_up_eligible: number;
} {
  const stats = {
    total: entries.length,
    active: 0,
    expired: 0,
    responded: 0,
    follow_up_eligible: 0,
  };

  for (const entry of entries) {
    const result = checkWindow(entry);
    switch (result.window_status) {
      case "ACTIVE":
        stats.active++;
        break;
      case "EXPIRED":
        stats.expired++;
        break;
      case "RESPONDED":
        stats.responded++;
        break;
    }

    if (result.follow_up_eligible) {
      stats.follow_up_eligible++;
    }
  }

  return stats;
}
