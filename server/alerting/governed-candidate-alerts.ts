/**
 * Gate B Kernel 1 — Governed Candidate Alerting.
 *
 * The kernel, and all of it: tell a human when something new needs eyes.
 * Alerts fire on NEW GOVERNED CANDIDATES AWAITING REVIEW — nothing else.
 *
 * True candidate store: public.live_data_signals (the bridge-persisted
 * governed signal table read by server/canonical-live-signal-queries.ts).
 * A candidate is awaiting review exactly when
 *   is_current = true AND governance_status = 'observation_candidate'
 * which is the same definition the canonical signal summary uses for
 * pending_signals. governance_status is a closed set
 * ('observation_candidate' | 'review_hold' | 'promoted' | 'rejected');
 * 'review_hold' is a held state a human has already touched, so it is
 * not awaiting first review and never alerts. verification_state is a
 * separate evidence axis and plays no part here.
 *
 * Substrate: alert_subscriptions / alert_events / alert_delivery_log
 * (drizzle/schema.ts; created by migration
 * 20261120203000_gateb_k1_alerting_substrate.sql). Kernel records are
 * scoped by subscription_type / alert_type = 'governed_candidate', so
 * the older public-alerting generation's rows can never mix in.
 *
 * Deterministic: planGovernedCandidateAlerts is a pure function — given
 * the same candidates, subscriptions, and already-alerted keys it always
 * returns the same planned deliveries, in the same order. No scoring,
 * no thresholds, no LLM anywhere in this module.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "../db";
import {
  alertDeliveryLog,
  alertEvents,
  alertSubscriptions,
} from "../../drizzle/schema";

export const GOVERNED_CANDIDATE_ALERT_TYPE = "governed_candidate";
export const GOVERNED_CANDIDATE_SUBSCRIPTION_TYPE = "governed_candidate";
export const AWAITING_REVIEW_GOVERNANCE_STATUS = "observation_candidate";
export const GOVERNED_CANDIDATE_TRIGGER_SOURCE = "live_data_signals";
export const DEFAULT_ALERT_CHANNEL = "in_app";

// ─── Types ───────────────────────────────────────────────────────────

export interface GovernedCandidate {
  signalId: string;
  signalHash: string;
  title: string;
  streamId: string;
  jurisdictionId: string;
  severity: string;
  governanceStatus: string;
  isCurrent: boolean;
  /** Epoch milliseconds. */
  detectedAt: number;
}

export interface ReviewAlertSubscription {
  id: number;
  userId: string;
  /** null = all streams. */
  streamId: string | null;
  /** null = all jurisdictions. */
  jurisdictionId: string | null;
  channel: string;
  isPaused: boolean;
}

export interface PlannedAlertDelivery {
  alertKey: string;
  subscriptionId: number;
  userId: string;
  channel: string;
  signalId: string;
  signalHash: string;
  streamId: string;
  jurisdictionId: string;
  title: string;
  severity: string;
  detectedAt: number;
  message: string;
}

// ─── Pure core ───────────────────────────────────────────────────────

/** Durable identity of one alert: one subscription × one candidate. */
export function alertKey(subscriptionId: number, signalId: string): string {
  return `${subscriptionId}:${signalId}`;
}

export function isAwaitingReview(candidate: GovernedCandidate): boolean {
  return (
    candidate.isCurrent === true &&
    candidate.governanceStatus === AWAITING_REVIEW_GOVERNANCE_STATUS
  );
}

export function subscriptionMatchesCandidate(
  subscription: ReviewAlertSubscription,
  candidate: GovernedCandidate,
): boolean {
  if (subscription.streamId != null && subscription.streamId !== candidate.streamId) {
    return false;
  }
  if (
    subscription.jurisdictionId != null &&
    subscription.jurisdictionId !== candidate.jurisdictionId
  ) {
    return false;
  }
  return true;
}

/**
 * Plan the alert deliveries for one evaluation pass.
 *
 * Rules (the whole policy):
 * - only candidates awaiting review (isAwaitingReview) can alert;
 * - only unpaused subscriptions receive alerts;
 * - a subscription receives a candidate when its stream/jurisdiction
 *   filters match (null filter = match all);
 * - a (subscription, candidate) pair that already alerted — present in
 *   existingAlertKeys or already planned in this pass — never alerts again.
 *
 * Output order is deterministic: subscriptions by id ascending, then
 * candidates by (detectedAt, signalId) ascending.
 */
export function planGovernedCandidateAlerts(input: {
  candidates: GovernedCandidate[];
  subscriptions: ReviewAlertSubscription[];
  existingAlertKeys: Iterable<string>;
}): PlannedAlertDelivery[] {
  const seen = new Set<string>(input.existingAlertKeys);
  const subscriptions = [...input.subscriptions]
    .filter((s) => !s.isPaused)
    .sort((a, b) => a.id - b.id);
  const candidates = [...input.candidates]
    .filter(isAwaitingReview)
    .sort(
      (a, b) =>
        a.detectedAt - b.detectedAt ||
        (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0),
    );

  const planned: PlannedAlertDelivery[] = [];
  for (const subscription of subscriptions) {
    for (const candidate of candidates) {
      if (!subscriptionMatchesCandidate(subscription, candidate)) continue;
      const key = alertKey(subscription.id, candidate.signalId);
      if (seen.has(key)) continue;
      seen.add(key);
      planned.push({
        alertKey: key,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        channel: subscription.channel,
        signalId: candidate.signalId,
        signalHash: candidate.signalHash,
        streamId: candidate.streamId,
        jurisdictionId: candidate.jurisdictionId,
        title: candidate.title,
        severity: candidate.severity,
        detectedAt: candidate.detectedAt,
        message: `New governed candidate awaiting review: ${candidate.title} (${candidate.streamId})`,
      });
    }
  }
  return planned;
}

// ─── I/O: candidate store (public.live_data_signals) ─────────────────

interface LiveSignalRow {
  live_data_signal_id: string;
  signal_hash: string;
  title: string;
  primary_stream_id: string;
  jurisdiction_id: string;
  severity: string;
  governance_status: string;
  is_current: boolean;
  detected_at: string | Date;
}

function rowToCandidate(row: LiveSignalRow): GovernedCandidate {
  return {
    signalId: String(row.live_data_signal_id),
    signalHash: String(row.signal_hash),
    title: String(row.title),
    streamId: String(row.primary_stream_id),
    jurisdictionId: String(row.jurisdiction_id),
    severity: String(row.severity),
    governanceStatus: String(row.governance_status),
    isCurrent: row.is_current === true,
    detectedAt: new Date(row.detected_at).getTime(),
  };
}

export async function countAwaitingReview(): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as cnt
       from public.live_data_signals
      where is_current = true and governance_status = $1`,
    [AWAITING_REVIEW_GOVERNANCE_STATUS],
  );
  return Number(result.rows[0]?.cnt ?? 0);
}

/** Page size for candidate fetches — one page of the newest-first scan. */
export const CANDIDATE_PAGE_SIZE = 1000;

async function listAwaitingReviewCandidatesPage(
  limit: number,
  offset: number,
): Promise<GovernedCandidate[]> {
  const result = await pool.query(
    `select live_data_signal_id, signal_hash, title, primary_stream_id,
            jurisdiction_id, severity, governance_status, is_current, detected_at
       from public.live_data_signals
      where is_current = true and governance_status = $1
      order by detected_at desc, live_data_signal_id desc
      limit $2 offset $3`,
    [AWAITING_REVIEW_GOVERNANCE_STATUS, limit, offset],
  );
  return (result.rows as LiveSignalRow[]).map(rowToCandidate);
}

export async function listAwaitingReviewCandidates(
  limit = CANDIDATE_PAGE_SIZE,
): Promise<GovernedCandidate[]> {
  const capped = Math.min(Math.max(limit, 1), CANDIDATE_PAGE_SIZE);
  return listAwaitingReviewCandidatesPage(capped, 0);
}

/**
 * Every awaiting-review candidate, paged newest-first until the scan
 * is exhausted. The evaluation pass must see the whole eligible set:
 * fetching only the newest page starves older candidates — once the
 * newest page is alerted, the planner dedupes it to an empty plan and
 * nothing older is ever reached. The (detected_at, live_data_signal_id)
 * ordering is total, so pages are stable within a pass; the planner
 * sorts again for its own deterministic output order.
 */
export async function listAllAwaitingReviewCandidates(): Promise<GovernedCandidate[]> {
  const all: GovernedCandidate[] = [];
  for (let offset = 0; ; offset += CANDIDATE_PAGE_SIZE) {
    const page = await listAwaitingReviewCandidatesPage(CANDIDATE_PAGE_SIZE, offset);
    all.push(...page);
    if (page.length < CANDIDATE_PAGE_SIZE) return all;
  }
}

// ─── I/O: subscriptions & delivery log (alerting substrate) ──────────

function channelOf(notificationChannels: unknown): string {
  if (Array.isArray(notificationChannels)) {
    const first = notificationChannels.find((c) => typeof c === "string" && c);
    if (first) return first as string;
  }
  return DEFAULT_ALERT_CHANNEL;
}

function rowToSubscription(row: typeof alertSubscriptions.$inferSelect): ReviewAlertSubscription {
  return {
    id: row.id,
    userId: row.userId,
    streamId: row.targetScope ?? null,
    jurisdictionId: row.jurisdiction ?? null,
    channel: channelOf(row.notificationChannels),
    isPaused: row.isPaused === 1,
  };
}

export async function createReviewSubscription(params: {
  userId: string;
  streamId?: string | null;
  jurisdictionId?: string | null;
  channel?: string;
}): Promise<ReviewAlertSubscription> {
  const now = Date.now();
  const channel = params.channel || DEFAULT_ALERT_CHANNEL;
  await db.insert(alertSubscriptions).values({
    userId: params.userId,
    subscriptionType: GOVERNED_CANDIDATE_SUBSCRIPTION_TYPE,
    targetScope: params.streamId ?? null,
    jurisdiction: params.jurisdictionId ?? null,
    alertFrequency: "immediate",
    isPaused: 0,
    notificationChannels: [channel],
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db
    .select()
    .from(alertSubscriptions)
    .where(
      and(
        eq(alertSubscriptions.userId, params.userId),
        eq(alertSubscriptions.subscriptionType, GOVERNED_CANDIDATE_SUBSCRIPTION_TYPE),
      ),
    )
    .orderBy(desc(alertSubscriptions.id))
    .limit(1);
  return rowToSubscription(row);
}

export async function listReviewSubscriptions(): Promise<ReviewAlertSubscription[]> {
  const rows = await db
    .select()
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.subscriptionType, GOVERNED_CANDIDATE_SUBSCRIPTION_TYPE))
    .orderBy(alertSubscriptions.id);
  return rows.map(rowToSubscription);
}

export async function deleteReviewSubscription(subscriptionId: number): Promise<void> {
  await db
    .delete(alertSubscriptions)
    .where(
      and(
        eq(alertSubscriptions.id, subscriptionId),
        eq(alertSubscriptions.subscriptionType, GOVERNED_CANDIDATE_SUBSCRIPTION_TYPE),
      ),
    );
}

async function loadExistingAlertKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      subscriptionId: alertEvents.subscriptionId,
      metadata: alertEvents.metadata,
    })
    .from(alertEvents)
    .where(eq(alertEvents.alertType, GOVERNED_CANDIDATE_ALERT_TYPE));
  const keys = new Set<string>();
  for (const row of rows) {
    const signalId = (row.metadata as { signalId?: unknown } | null)?.signalId;
    if (row.subscriptionId != null && typeof signalId === "string") {
      keys.add(alertKey(row.subscriptionId, signalId));
    }
  }
  return keys;
}

/**
 * True when an insert failed because the governed-candidate alert
 * already exists (partial unique index idx_ae_governed_candidate_unique).
 *
 * The node-postgres Drizzle adapter wraps PG errors in
 * DrizzleQueryError: the 23505 code and the constraint name live on the
 * wrapped error's `cause`, not on the wrapper itself, so detection
 * walks the cause chain and checks each layer's code / constraint /
 * message. Within this module the only inserts are into alert_events
 * and alert_delivery_log, and the governed index is the only unique
 * constraint either write can hit — a 23505 anywhere in the chain is
 * the duplicate.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current != null; depth += 1) {
    if (typeof current !== "object") break;
    const layer = current as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (layer.code === "23505") return true;
    if (layer.constraint === "idx_ae_governed_candidate_unique") return true;
    if (
      typeof layer.message === "string" &&
      layer.message.includes("idx_ae_governed_candidate_unique")
    ) {
      return true;
    }
    current = layer.cause;
  }
  return false;
}

// ─── Evaluation pass ─────────────────────────────────────────────────

export interface GovernedAlertingRunResult {
  candidatesAwaitingReview: number;
  activeSubscriptions: number;
  planned: number;
  delivered: number;
  skippedDuplicates: number;
}

/**
 * One evaluation pass: read the true candidate store (all pages — see
 * listAllAwaitingReviewCandidates), plan with the pure core, and
 * record one alert event + one delivery-log row per planned alert.
 * Each pair is written in a single transaction: if the delivery-log
 * insert fails, the event rolls back with it, so the candidate stays
 * un-alerted and a later pass retries it — an event without a delivery
 * record would otherwise mark the candidate alerted forever
 * (loadExistingAlertKeys reads events). Re-running the pass records
 * nothing new — the plan is empty once every (subscription, candidate)
 * pair has alerted, and the partial unique index
 * idx_ae_governed_candidate_unique enforces the same guarantee at the
 * database level; a concurrent pass that wins the race surfaces as a
 * unique violation inside the transaction and is counted as a skipped
 * duplicate, never an abort.
 */
export async function runGovernedCandidateAlerting(
  now: number = Date.now(),
): Promise<GovernedAlertingRunResult> {
  const [candidates, subscriptions, existingAlertKeys] = await Promise.all([
    listAllAwaitingReviewCandidates(),
    listReviewSubscriptions(),
    loadExistingAlertKeys(),
  ]);

  const planned = planGovernedCandidateAlerts({
    candidates,
    subscriptions,
    existingAlertKeys,
  });

  let delivered = 0;
  let skippedDuplicates = 0;
  for (const item of planned) {
    try {
      await db.transaction(async (tx: any) => {
        const [event] = await tx
          .insert(alertEvents)
          .values({
            subscriptionId: item.subscriptionId,
            alertType: GOVERNED_CANDIDATE_ALERT_TYPE,
            triggerSource: GOVERNED_CANDIDATE_TRIGGER_SOURCE,
            severity: item.severity,
            message: item.message,
            metadata: {
              signalId: item.signalId,
              signalHash: item.signalHash,
              streamId: item.streamId,
              jurisdictionId: item.jurisdictionId,
              title: item.title,
              detectedAt: item.detectedAt,
            },
            createdAt: now,
            sentAt: now,
          })
          .returning({ id: alertEvents.id });

        await tx.insert(alertDeliveryLog).values({
          alertId: event.id,
          channel: item.channel,
          recipient: item.userId,
          status: "delivered",
          sentAt: now,
        });
      });
      delivered += 1;
    } catch (err) {
      if (isUniqueViolation(err)) {
        skippedDuplicates += 1;
        continue;
      }
      throw err;
    }
  }

  return {
    candidatesAwaitingReview: candidates.length,
    activeSubscriptions: subscriptions.filter((s) => !s.isPaused).length,
    planned: planned.length,
    delivered,
    skippedDuplicates,
  };
}

// ─── Delivery log read ───────────────────────────────────────────────

export interface GovernedAlertDelivery {
  deliveryId: number;
  alertId: number;
  subscriptionId: number | null;
  channel: string;
  recipient: string | null;
  status: string;
  sentAt: number | null;
  signalId: string | null;
  title: string | null;
  streamId: string | null;
}

export async function listRecentDeliveries(limit = 20): Promise<GovernedAlertDelivery[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const rows = await db
    .select({
      delivery: alertDeliveryLog,
      event: alertEvents,
    })
    .from(alertDeliveryLog)
    .innerJoin(alertEvents, eq(alertDeliveryLog.alertId, alertEvents.id))
    .where(eq(alertEvents.alertType, GOVERNED_CANDIDATE_ALERT_TYPE))
    .orderBy(desc(alertDeliveryLog.id))
    .limit(capped);

  return rows.map(
    ({
      delivery,
      event,
    }: {
      delivery: typeof alertDeliveryLog.$inferSelect;
      event: typeof alertEvents.$inferSelect;
    }) => {
      const metadata = (event.metadata ?? {}) as {
        signalId?: unknown;
        title?: unknown;
        streamId?: unknown;
      };
      return {
        deliveryId: delivery.id,
        alertId: delivery.alertId,
        subscriptionId: event.subscriptionId,
        channel: delivery.channel,
        recipient: delivery.recipient,
        status: delivery.status ?? "pending",
        sentAt: delivery.sentAt,
        signalId: typeof metadata.signalId === "string" ? metadata.signalId : null,
        title: typeof metadata.title === "string" ? metadata.title : null,
        streamId: typeof metadata.streamId === "string" ? metadata.streamId : null,
      };
    },
  );
}
