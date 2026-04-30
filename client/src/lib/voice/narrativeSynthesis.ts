/**
 * Narrative Synthesis Layer
 *
 * Transforms validated adapter output into spoken narration text.
 * Accepts ONLY types from voiceAdapter.ts — no raw tRPC data.
 *
 * Rules enforced:
 * 1. Projection-only — reads adapter output, produces text
 * 2. Data gating — refuses to narrate if status !== "ready" (or "partial_data" with explicit flag)
 * 3. No fabrication — only narrates what the adapter provides
 * 4. Attribution-first — follows forensicReadAloud formatting rules
 * 5. Neutral, procedural tone — no dramatization, commentary, or opinion
 */

import type {
  CaseNarrationInput,
  SignalNarrationInput,
  PatternNarrationInput,
  SignalItem,
  PatternItem,
  DeadlineItem,
} from "./voiceAdapter";

// ─── Synthesis Output Types ───

export interface NarrationResult {
  status: "narrated" | "gated" | "error";
  text: string;
  dataStatus: "ready" | "partial_data" | "insufficient_data";
  reason?: string;
  sections: NarrationSection[];
}

export interface NarrationSection {
  label: string;
  text: string;
  itemCount: number;
}

// ─── Data Gate ───

function gateCheck(
  status: "ready" | "partial_data" | "insufficient_data",
  reason?: string,
  allowPartial: boolean = false
): NarrationResult | null {
  if (status === "insufficient_data") {
    return {
      status: "gated",
      text: `Narration unavailable. ${reason || "Insufficient data for this module."}`,
      dataStatus: status,
      reason,
      sections: [],
    };
  }
  if (status === "partial_data" && !allowPartial) {
    return {
      status: "gated",
      text: `Narration limited. ${reason || "Some data modules are not yet populated."}`,
      dataStatus: status,
      reason,
      sections: [],
    };
  }
  return null; // Gate passed
}

// ─── Formatting Helpers ───

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural || singular + "s"}`;
}

function formatSeverity(severity: string): string {
  const normalized = severity.toLowerCase().replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── T1. Case Narration Synthesis ───

/**
 * Synthesize a full case narration from adapter output.
 * Follows structural announcement → signals → patterns → deadlines → summary flow.
 */
export function synthesizeCaseNarration(
  input: CaseNarrationInput,
  options: { allowPartial?: boolean } = {}
): NarrationResult {
  const gated = gateCheck(input.status, input.reason, options.allowPartial);
  if (gated) return gated;

  const sections: NarrationSection[] = [];
  const textParts: string[] = [];

  // Section 1: Case Overview (structural announcement)
  const overviewParts: string[] = [];
  overviewParts.push(`Case: ${input.case.title}.`);
  if (input.case.domain) {
    overviewParts.push(`Domain: ${input.case.domain.replace(/_/g, " ")}.`);
  }
  overviewParts.push(`Status: ${input.case.status}.`);
  if (input.case.filingDate) {
    overviewParts.push(`Filed: ${formatDate(input.case.filingDate)}.`);
  }
  if (input.case.clientName) {
    overviewParts.push(`Client: ${input.case.clientName}.`);
  }
  if (input.case.opposingParty) {
    overviewParts.push(`Opposing party: ${input.case.opposingParty}.`);
  }
  if (input.case.description) {
    overviewParts.push(input.case.description);
  }

  const overviewText = overviewParts.join(" ");
  sections.push({ label: "Case Overview", text: overviewText, itemCount: 1 });
  textParts.push(overviewText);

  // Section 2: Signals
  if (input.signals.length > 0) {
    const signalText = synthesizeSignalList(input.signals);
    sections.push({ label: "Signal Flags", text: signalText, itemCount: input.signals.length });
    textParts.push(signalText);
  }

  // Section 3: Patterns
  if (input.patterns.length > 0) {
    const patternText = synthesizePatternList(input.patterns);
    sections.push({ label: "Detected Patterns", text: patternText, itemCount: input.patterns.length });
    textParts.push(patternText);
  }

  // Section 4: Deadlines
  if (input.deadlines.length > 0) {
    const deadlineText = synthesizeDeadlineList(input.deadlines);
    sections.push({ label: "Deadlines", text: deadlineText, itemCount: input.deadlines.length });
    textParts.push(deadlineText);
  }

  // Section 5: Evidence Summary
  if (input.claimsSummary.total > 0) {
    const summaryText = synthesizeClaimsSummary(input.claimsSummary);
    sections.push({ label: "Evidence Summary", text: summaryText, itemCount: input.claimsSummary.total });
    textParts.push(summaryText);
  }

  // Section 6: Snapshot Status
  if (input.snapshot) {
    const snapshotText = `Data snapshot ${input.snapshot.id} is ${input.snapshot.status}.`;
    sections.push({ label: "Snapshot", text: snapshotText, itemCount: 1 });
    textParts.push(snapshotText);
  }

  // Completion marker
  textParts.push("End of readout.");

  return {
    status: "narrated",
    text: textParts.join(" "),
    dataStatus: input.status,
    reason: input.reason,
    sections,
  };
}

// ─── T2. Signal Narration Synthesis ───

/**
 * Synthesize narration for a single signal.
 */
export function synthesizeSignalNarration(input: SignalNarrationInput): NarrationResult {
  const gated = gateCheck(input.status, input.reason);
  if (gated) return gated;

  if (!input.signal) {
    return {
      status: "gated",
      text: "Signal data not available.",
      dataStatus: "insufficient_data",
      reason: "Signal object is null.",
      sections: [],
    };
  }

  const s = input.signal;
  const parts: string[] = [];
  parts.push(`Signal flag: ${formatSeverity(s.severity)}.`);
  parts.push(`Component: ${s.component}.`);
  parts.push(s.description);
  if (s.trend) {
    parts.push(`Trend: ${s.trend}.`);
  }
  parts.push("End of readout.");

  const text = parts.join(" ");
  return {
    status: "narrated",
    text,
    dataStatus: "ready",
    sections: [{ label: "Signal Detail", text, itemCount: 1 }],
  };
}

// ─── T3. Pattern Narration Synthesis ───

/**
 * Synthesize narration for a single pattern.
 */
export function synthesizePatternNarration(input: PatternNarrationInput): NarrationResult {
  const gated = gateCheck(input.status, input.reason);
  if (gated) return gated;

  if (!input.pattern) {
    return {
      status: "gated",
      text: "Pattern data not available.",
      dataStatus: "insufficient_data",
      reason: "Pattern object is null.",
      sections: [],
    };
  }

  const p = input.pattern;
  const parts: string[] = [];
  parts.push(`Pattern detected.`);
  parts.push(p.description);
  if (p.confidence !== null) {
    parts.push(`Confidence: ${Math.round(p.confidence * 100)} percent.`);
  }
  if (p.implication) {
    parts.push(`Implication: ${p.implication}.`);
  }
  if (p.recommendation) {
    parts.push(`Recommendation: ${p.recommendation}.`);
  }
  parts.push("End of readout.");

  const text = parts.join(" ");
  return {
    status: "narrated",
    text,
    dataStatus: "ready",
    sections: [{ label: "Pattern Detail", text, itemCount: 1 }],
  };
}

// ─── Internal Synthesis Helpers ───

function synthesizeSignalList(signals: SignalItem[]): string {
  const parts: string[] = [];
  parts.push(`${pluralize(signals.length, "signal flag")} detected.`);

  // Group by severity for structured announcement
  const bySeverity = new Map<string, SignalItem[]>();
  for (const s of signals) {
    const key = s.severity.toLowerCase();
    if (!bySeverity.has(key)) bySeverity.set(key, []);
    bySeverity.get(key)!.push(s);
  }

  // Announce by severity (critical first)
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  for (const sev of severityOrder) {
    const group = bySeverity.get(sev);
    if (!group) continue;
    parts.push(`${formatSeverity(sev)}: ${pluralize(group.length, "flag")}.`);
    // Narrate up to 3 per severity to avoid excessive length
    for (const s of group.slice(0, 3)) {
      parts.push(`${s.component}: ${s.description}`);
    }
    if (group.length > 3) {
      parts.push(`${group.length - 3} additional ${sev} flags not read.`);
    }
  }

  return parts.join(" ");
}

function synthesizePatternList(patterns: PatternItem[]): string {
  const parts: string[] = [];
  parts.push(`${pluralize(patterns.length, "pattern")} detected.`);

  for (const p of patterns.slice(0, 5)) {
    parts.push(p.description);
    if (p.confidence !== null) {
      parts.push(`Confidence: ${Math.round(p.confidence * 100)} percent.`);
    }
  }
  if (patterns.length > 5) {
    parts.push(`${patterns.length - 5} additional patterns not read.`);
  }

  return parts.join(" ");
}

function synthesizeDeadlineList(deadlines: DeadlineItem[]): string {
  const parts: string[] = [];
  parts.push(`${pluralize(deadlines.length, "deadline")} identified.`);

  for (const d of deadlines) {
    parts.push(`${d.description}: ${formatDate(d.date)}.`);
  }

  return parts.join(" ");
}

function synthesizeClaimsSummary(summary: { total: number; findingEligible: number; signalOnly: number }): string {
  const parts: string[] = [];
  parts.push(`Evidence summary: ${pluralize(summary.total, "item")} total.`);
  if (summary.findingEligible > 0) {
    parts.push(`${pluralize(summary.findingEligible, "item")} classified as finding eligible.`);
  }
  if (summary.signalOnly > 0) {
    parts.push(`${pluralize(summary.signalOnly, "item")} classified as signal only.`);
  }
  return parts.join(" ");
}
