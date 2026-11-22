/**
 * Gate B Kernel 2 — Transparency: signal publication.
 *
 * The kernel, and all of it: a human at the gate takes a second,
 * distinct governed act — publication — that places ONE promoted
 * signal's plain-language explainer on the public surface.
 *
 * Promotion ≠ publication. Promotion (governance_status = 'promoted'
 * on public.live_data_signals) is the gate's acceptance act: the
 * signal becomes eligible. Nothing about promotion makes a signal
 * public. Publication is recorded in public.signal_publications
 * (migration 20261120210000_gateb_k2_signal_publications.sql), one row
 * per publish act, and every publish/unpublish act is written to the
 * governance log in the SAME transaction as the publication-row write
 * (writeGovernanceLog, component "signal_publication", scope
 * "signal_id:<id>", actorRole "admin", rationale validated by the log
 * itself: ≥10 chars, ≥3 words, no filler).
 *
 * The public surface is a SELECTION, not a writing task: the explainer
 * prose already exists in the promoted row's description, written
 * deterministically by the detection layer. The public read is
 *   active publications ⋈ currently-promoted current rows
 * projected through an explicit field whitelist, so:
 * - a candidate / review_hold / rejected signal can never appear;
 * - an unpublished signal disappears;
 * - a demoted or superseded signal disappears on its own, because
 *   its row is no longer a current promoted row — no cleanup write
 *   is needed for the public surface to stay truthful;
 * - entity names appear ONLY when the promoted row's own
 *   entity_resolution_status is 'resolved' (the name is taken from
 *   the row's own supporting_statistics — never from legacy stores).
 *
 * Public-safety (Codex Finding 1 on PR #873): the resolved-only rule
 * above gates the separate entityName field, but for an unresolved
 * signal the working entity name is ALSO embedded in the title /
 * description prose itself (the recurrence format: "X appears in N
 * observations…"). Verbatim publication would expose what the rule
 * says must stay hidden, so eligibility carries a deterministic
 * public-safety assessment (assessPublicSafety): a signal carrying
 * entity attribution — entity ids, or a working entity name in its
 * supporting_statistics — whose resolution status is not 'resolved'
 * is NOT public-safe, and publishSignal refuses it outright with
 * that stated reason. The prose is never redacted or rewritten; the
 * act simply cannot happen until attribution is resolved. Every
 * published row is therefore safe by construction, and the public
 * projection needs no safety logic of its own.
 *
 * Deterministic: the selection and projection functions are pure —
 * same records and publications in, same explainers out, same order.
 * No scoring, no generation, no LLM anywhere in this module.
 */

import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  get_canonical_live_signals,
  get_canonical_live_signals_by_ids,
  type CanonicalLiveSignal,
} from "../canonical-live-signal-queries";
import { writeGovernanceLog } from "../governance-log";

export const PUBLICATION_COMPONENT = "signal_publication";
export const PROMOTED_GOVERNANCE_STATUS = "promoted";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * One governed signal, in the service's own record shape. Built from
 * the canonical projection (fromCanonicalLiveSignal) or directly in
 * tests. entityName is the name carried by the row's own
 * supporting_statistics, surfaced raw here; the RESOLVED-only rule is
 * enforced by the public projection, not by hiding data from the gate.
 */
export interface GovernedSignalRecord {
  signalId: string;
  signalHash: string;
  title: string;
  explanation: string;
  jurisdiction: string;
  category: string;
  streamId: string;
  severity: string;
  verificationState: string;
  /** Epoch milliseconds; null when the source value is unparseable. */
  detectedAt: number | null;
  governanceStatus: string;
  isCurrent: boolean;
  entityResolutionStatus: string;
  /** Entity ids the row attributes the pattern to (may be empty). */
  entityIds: string[];
  entityName: string | null;
  // Why-it-is-a-signal detail for the gate reviewer (admin surface only).
  detectionRuleId: string;
  detectionRuleVersion: string;
  engineId: string;
  engineVersion: string;
  confidenceScore: number;
}

export interface PublicationRecord {
  id: number;
  liveDataSignalId: string;
  signalHash: string;
  /** Epoch milliseconds. */
  publishedAt: number;
  /** SHA-256 hash of the acting admin's identity. */
  publishedBy: string;
  /** Epoch milliseconds; null while the publication is active. */
  unpublishedAt: number | null;
  governanceSeqNo: number | null;
}

/** The gate's view of one promoted signal and its publication state. */
export interface PromotedSignalAdminView {
  signal: GovernedSignalRecord;
  /**
   * The deterministic public-safety assessment (assessPublicSafety):
   * false — with the stated reason — when the signal carries entity
   * attribution that is not resolved, so the gate shows why there is
   * no Publish button for the row instead of offering the act.
   */
  publicSafe: boolean;
  publicSafeReason: string | null;
  publication: {
    state: "published" | "unpublished" | "never_published";
    publicationId: number | null;
    publishedAt: number | null;
    publishedBy: string | null;
    unpublishedAt: number | null;
    governanceSeqNo: number | null;
  };
}

/**
 * The public explainer — the ONLY shape an unauthenticated reader can
 * ever receive. Field whitelist: title, explanation, jurisdiction,
 * category, stream, severity, verification_state, detected_at,
 * signal_hash, plus published_at (the act's own timestamp) and
 * entityName ONLY when the row's resolution status is 'resolved'.
 * No entity ids, no evidence refs, no supporting statistics, no
 * confidence score — those stay behind the gate.
 */
export interface PublicSignalExplainer {
  signalId: string;
  title: string;
  explanation: string;
  jurisdiction: string;
  category: string;
  stream: string;
  severity: string;
  verificationState: string;
  detectedAt: number | null;
  signalHash: string;
  publishedAt: number;
  entityName?: string;
}

// ─── Canonical → record ──────────────────────────────────────────────

function entityNameFromStatistics(statistics: unknown): string | null {
  if (statistics && typeof statistics === "object") {
    const name = (statistics as { entity_name?: unknown }).entity_name;
    if (typeof name === "string" && name.trim().length > 0) return name;
  }
  return null;
}

export function fromCanonicalLiveSignal(
  signal: CanonicalLiveSignal,
): GovernedSignalRecord {
  return {
    signalId: signal.signal_id,
    signalHash: signal.signal_hash,
    title: signal.title,
    explanation: signal.explanation,
    jurisdiction: signal.jurisdiction,
    category: signal.category,
    streamId: signal.stream_id,
    severity: signal.severity_level,
    verificationState: signal.verification_state,
    detectedAt: signal.detected_at,
    governanceStatus: signal.governance_status,
    // The canonical projection's WHERE clause pins is_current = true,
    // so every record it returns is current by construction.
    isCurrent: true,
    entityResolutionStatus: signal.entity_resolution_status,
    entityIds: signal.affected_entities,
    entityName: entityNameFromStatistics(signal.supporting_statistics),
    detectionRuleId: signal.detection_rule_id,
    detectionRuleVersion: signal.detection_rule_version,
    engineId: signal.engine_id,
    engineVersion: signal.engine_version,
    confidenceScore: signal.confidence_score,
  };
}



// ─── Pure core: selection & projection ───────────────────────────────

/** Eligible for publication, and for staying public: current + promoted. */
export function isPublishable(record: GovernedSignalRecord): boolean {
  return (
    record.isCurrent === true &&
    record.governanceStatus === PROMOTED_GOVERNANCE_STATUS
  );
}

// ─── Pure core: public-safety assessment ─────────────────────────────

export const ENTITY_ATTRIBUTION_UNRESOLVED_REASON =
  "entity attribution unresolved";

export interface PublicSafetyAssessment {
  publicSafe: boolean;
  /** The stated reason when not public-safe; null when safe. */
  reason: string | null;
}

/**
 * Whether a signal may go public at all, computed deterministically
 * from the promoted row itself. A signal carries entity attribution
 * when it names entities (entityIds non-empty) or carries a working
 * entity name in its supporting_statistics. Attribution that is not
 * 'resolved' is NOT public-safe: the working name rides inside the
 * title/description prose, so verbatim publication would expose it.
 * No attribution → public-safe. Resolved attribution → public-safe
 * (the name may render). The prose is never edited either way.
 */
/** The three attribution facts the assessment reads. */
export type PublicSafetyInput = Pick<
  GovernedSignalRecord,
  "entityIds" | "entityName" | "entityResolutionStatus"
>;

export function assessPublicSafety(
  record: PublicSafetyInput,
): PublicSafetyAssessment {
  const hasAttribution = record.entityIds.length > 0 || record.entityName != null;
  if (hasAttribution && record.entityResolutionStatus !== "resolved") {
    return {
      publicSafe: false,
      reason: ENTITY_ATTRIBUTION_UNRESOLVED_REASON,
    };
  }
  return { publicSafe: true, reason: null };
}

/**
 * The refusal publishSignal raises for a not-public-safe signal — a
 * typed error (code SIGNAL_NOT_PUBLIC_SAFE, reason stated) so the
 * router can surface it as a precondition failure, never a silent
 * skip and never a 500.
 */
export class SignalNotPublicSafeError extends Error {
  readonly code = "SIGNAL_NOT_PUBLIC_SAFE";
  readonly signalId: string;
  readonly reason: string;

  constructor(signalId: string, reason: string) {
    super(`Signal ${signalId} is not public-safe: ${reason}`);
    this.name = "SignalNotPublicSafeError";
    this.signalId = signalId;
    this.reason = reason;
  }
}

/**
 * The refusal unpublishSignal raises when a concurrent unpublish
 * claimed the active publication first (Codex Finding 3 on PR #873).
 * Typed (code SIGNAL_PUBLICATION_ALREADY_WITHDRAWN) so the router
 * can surface it as a conflict: the losing act is refused BEFORE any
 * governance event is written, so the log never records a second
 * withdrawal of a publication that was no longer active, and the
 * first withdrawal's timestamp and governance seq_no stand.
 */
export class SignalPublicationAlreadyWithdrawnError extends Error {
  readonly code = "SIGNAL_PUBLICATION_ALREADY_WITHDRAWN";
  readonly signalId: string;
  readonly publicationId: number;

  constructor(signalId: string, publicationId: number) {
    super(
      `Signal ${signalId} publication ${publicationId} was already withdrawn by a concurrent unpublish`,
    );
    this.name = "SignalPublicationAlreadyWithdrawnError";
    this.signalId = signalId;
    this.publicationId = publicationId;
  }
}

/** The active (not withdrawn) publication for a signal, if one exists. */
export function activePublicationFor(
  publications: PublicationRecord[],
  signalId: string,
): PublicationRecord | null {
  let active: PublicationRecord | null = null;
  for (const publication of publications) {
    if (publication.liveDataSignalId !== signalId) continue;
    if (publication.unpublishedAt != null) continue;
    if (active == null || publication.id > active.id) active = publication;
  }
  return active;
}

/** The most recent publication row for a signal, active or withdrawn. */
export function latestPublicationFor(
  publications: PublicationRecord[],
  signalId: string,
): PublicationRecord | null {
  let latest: PublicationRecord | null = null;
  for (const publication of publications) {
    if (publication.liveDataSignalId !== signalId) continue;
    if (latest == null || publication.id > latest.id) latest = publication;
  }
  return latest;
}

/**
 * The public-visibility rule, whole: a signal is publicly visible
 * exactly when it has an ACTIVE publication AND is still a current
 * promoted row. Unpublish removes it; demotion removes it; rejection
 * or supersession removes it. Nothing else is ever public.
 */
export function isPubliclyVisible(
  record: GovernedSignalRecord,
  publications: PublicationRecord[],
): boolean {
  return (
    isPublishable(record) &&
    activePublicationFor(publications, record.signalId) != null
  );
}

/**
 * Project one record to its public explainer, or null when it is not
 * publicly visible. The entity name is included ONLY when the row's
 * own entity_resolution_status is 'resolved' and the row carries a
 * name — an unresolved row never leaks the statistics' working name.
 */
export function projectPublicExplainer(
  record: GovernedSignalRecord,
  publications: PublicationRecord[],
): PublicSignalExplainer | null {
  if (!isPublishable(record)) return null;
  const publication = activePublicationFor(publications, record.signalId);
  if (publication == null) return null;

  const explainer: PublicSignalExplainer = {
    signalId: record.signalId,
    title: record.title,
    explanation: record.explanation,
    jurisdiction: record.jurisdiction,
    category: record.category,
    stream: record.streamId,
    severity: record.severity,
    verificationState: record.verificationState,
    detectedAt: record.detectedAt,
    signalHash: record.signalHash,
    publishedAt: publication.publishedAt,
  };
  if (record.entityResolutionStatus === "resolved" && record.entityName) {
    explainer.entityName = record.entityName;
  }
  return explainer;
}

/**
 * The public list: every publicly visible explainer, newest
 * publication first (ties broken by signal id for determinism).
 */
export function selectPublicExplainers(
  records: GovernedSignalRecord[],
  publications: PublicationRecord[],
): PublicSignalExplainer[] {
  const explainers: PublicSignalExplainer[] = [];
  for (const record of records) {
    const explainer = projectPublicExplainer(record, publications);
    if (explainer != null) explainers.push(explainer);
  }
  explainers.sort(
    (a, b) =>
      b.publishedAt - a.publishedAt ||
      (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0),
  );
  return explainers;
}

/** The gate's promoted list with each signal's publication state. */
export function buildPromotedAdminList(
  records: GovernedSignalRecord[],
  publications: PublicationRecord[],
): PromotedSignalAdminView[] {
  return records
    .filter(isPublishable)
    .map((record) => {
      const active = activePublicationFor(publications, record.signalId);
      const latest = latestPublicationFor(publications, record.signalId);
      const shown = active ?? latest;
      const safety = assessPublicSafety(record);
      return {
        signal: record,
        publicSafe: safety.publicSafe,
        publicSafeReason: safety.reason,
        publication: {
          state: active
            ? ("published" as const)
            : latest
              ? ("unpublished" as const)
              : ("never_published" as const),
          publicationId: shown?.id ?? null,
          publishedAt: shown?.publishedAt ?? null,
          publishedBy: shown?.publishedBy ?? null,
          unpublishedAt: shown?.unpublishedAt ?? null,
          governanceSeqNo: shown?.governanceSeqNo ?? null,
        },
      };
    })
    .sort(
      (a, b) =>
        (b.signal.detectedAt ?? 0) - (a.signal.detectedAt ?? 0) ||
        (a.signal.signalId < b.signal.signalId
          ? -1
          : a.signal.signalId > b.signal.signalId
            ? 1
            : 0),
    );
}

// ─── I/O: reads ──────────────────────────────────────────────────────

function rowsFromExecuteResult(result: unknown): any[] {
  const nativeRows = (result as { rows?: unknown })?.rows;
  if (Array.isArray(nativeRows)) return nativeRows;
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

function rowToPublication(row: any): PublicationRecord {
  return {
    id: Number(row.id),
    liveDataSignalId: String(row.live_data_signal_id),
    signalHash: String(row.signal_hash),
    publishedAt: Number(row.published_at),
    publishedBy: String(row.published_by),
    unpublishedAt: row.unpublished_at == null ? null : Number(row.unpublished_at),
    governanceSeqNo:
      row.governance_seq_no == null ? null : Number(row.governance_seq_no),
  };
}

const PUBLICATION_COLUMNS = `id, live_data_signal_id, signal_hash, published_at,
  published_by, unpublished_at, governance_seq_no`;

/** Every publication row for the given signals (all acts, all states). */
export async function listPublicationRows(
  signalIds: string[],
): Promise<PublicationRecord[]> {
  if (signalIds.length === 0) return [];
  const result = await pool.query(
    `select ${PUBLICATION_COLUMNS}
       from public.signal_publications
      where live_data_signal_id = any($1::uuid[])
      order by id`,
    [signalIds],
  );
  return (result.rows as any[]).map(rowToPublication);
}

export const PROMOTED_PAGE_SIZE = 1000;

/**
 * One page of promoted current signals from the canonical
 * projection, status pinned to 'promoted' — the canonical helper's
 * default (all non-rejected) is never used here. The canonical
 * ordering (detected_at desc, live_data_signal_id desc) is total,
 * so pages are stable within a pass.
 */
async function listPromotedRecordsPage(
  limit: number,
  offset: number,
): Promise<GovernedSignalRecord[]> {
  const signals = await get_canonical_live_signals({
    status: PROMOTED_GOVERNANCE_STATUS,
    limit,
    offset,
  });
  return signals.map(fromCanonicalLiveSignal);
}

/** The newest page of promoted records (single-page read). */
export async function listPromotedRecords(
  limit = PROMOTED_PAGE_SIZE,
): Promise<GovernedSignalRecord[]> {
  const capped = Math.min(Math.max(limit, 1), PROMOTED_PAGE_SIZE);
  return listPromotedRecordsPage(capped, 0);
}

/**
 * EVERY promoted record, paged through the full eligible set
 * (the K1 pagination pattern): a first-page cap must never starve
 * older promoted signals out of the gate's list.
 */
export async function listAllPromotedRecords(): Promise<GovernedSignalRecord[]> {
  const all: GovernedSignalRecord[] = [];
  for (let offset = 0; ; offset += PROMOTED_PAGE_SIZE) {
    const page = await listPromotedRecordsPage(PROMOTED_PAGE_SIZE, offset);
    all.push(...page);
    if (page.length < PROMOTED_PAGE_SIZE) return all;
  }
}

const RECORD_ID_CHUNK = 500;

/** Promoted records fetched directly by id, in chunks. */
async function listPromotedRecordsByIds(
  signalIds: string[],
): Promise<GovernedSignalRecord[]> {
  const records: GovernedSignalRecord[] = [];
  for (let i = 0; i < signalIds.length; i += RECORD_ID_CHUNK) {
    const chunk = signalIds.slice(i, i + RECORD_ID_CHUNK);
    const signals = await get_canonical_live_signals_by_ids(chunk);
    records.push(...signals.map(fromCanonicalLiveSignal));
  }
  return records;
}

export const PUBLICATION_PAGE_SIZE = 1000;

/**
 * EVERY active publication row, paged by id. The public reads start
 * from the publication side — the set a human actually published —
 * so the selection filter is applied before any limit, and a
 * published signal can never be starved out by newer promoted rows
 * (Codex Finding 2 on PR #873: filter-before-limit).
 */
export async function listActivePublicationRows(): Promise<PublicationRecord[]> {
  const all: PublicationRecord[] = [];
  for (let offset = 0; ; offset += PUBLICATION_PAGE_SIZE) {
    const result = await pool.query(
      `select ${PUBLICATION_COLUMNS}
         from public.signal_publications
        where unpublished_at is null
        order by id
        limit $1 offset $2`,
      [PUBLICATION_PAGE_SIZE, offset],
    );
    const page = (result.rows as any[]).map(rowToPublication);
    all.push(...page);
    if (page.length < PUBLICATION_PAGE_SIZE) return all;
  }
}

/** Gate read: promoted signals with their publication state. */
export async function listPromotedSignals(): Promise<PromotedSignalAdminView[]> {
  const records = await listAllPromotedRecords();
  const publications = await listPublicationRows(
    records.map((r) => r.signalId),
  );
  return buildPromotedAdminList(records, publications);
}

/**
 * Public read: the published explainers, and nothing else. The
 * candidate set is the active publications (fetched first, in
 * full); the promoted rows are then fetched by id. The caller's
 * limit applies AFTER selection — never before it.
 */
export async function listPublishedSignals(
  limit = 100,
): Promise<PublicSignalExplainer[]> {
  const publications = await listActivePublicationRows();
  if (publications.length === 0) return [];
  const records = await listPromotedRecordsByIds(
    publications.map((p) => p.liveDataSignalId),
  );
  const capped = Math.min(Math.max(limit, 1), 1000);
  return selectPublicExplainers(records, publications).slice(0, capped);
}

/**
 * Public read: one published explainer by signal id, or null. The
 * record is fetched directly by id — no list window can hide it.
 */
export async function getPublishedSignal(
  signalId: string,
): Promise<PublicSignalExplainer | null> {
  const publications = await listPublicationRows([signalId]);
  if (activePublicationFor(publications, signalId) == null) return null;
  const records = await listPromotedRecordsByIds([signalId]);
  const record = records.find((r) => r.signalId === signalId);
  if (!record) return null;
  return projectPublicExplainer(record, publications);
}

// ─── I/O: governed acts ──────────────────────────────────────────────

/** SHA-256 of the actor identity — the governance log's own recipe. */
export function hashActorId(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex");
}

export interface PublishResult {
  publicationId: number;
  signalId: string;
  signalHash: string;
  publishedAt: number;
  governanceSeqNo: number;
  entryHash: string;
}

export interface UnpublishResult {
  publicationId: number;
  signalId: string;
  unpublishedAt: number;
  governanceSeqNo: number;
  entryHash: string;
}

/**
 * Publish one promoted signal. A single transaction: verify the row
 * is a current promoted signal → verify it is public-safe (a signal
 * with unresolved entity attribution is refused with a
 * SignalNotPublicSafeError stating the reason — never published,
 * never silently skipped) → insert the publication row → write the
 * governance log entry (signal_published) → stamp the row with the
 * log's seq_no. If any step fails — including rationale validation
 * inside the log write — everything rolls back: there is no
 * published-but-unlogged state.
 */
export async function publishSignal(input: {
  signalId: string;
  rationale: string;
  actorId: string;
}): Promise<PublishResult> {
  const now = Date.now();
  return await db.transaction(async (tx: any) => {
    const [signal] = rowsFromExecuteResult(
      await tx.execute(sql`
        select live_data_signal_id, signal_hash, governance_status, is_current,
               entity_ids, entity_resolution_status, supporting_statistics
          from public.live_data_signals
         where live_data_signal_id = ${input.signalId}
         limit 1
      `),
    );
    if (!signal) throw new Error(`Signal ${input.signalId} not found`);
    if (signal.is_current !== true || signal.governance_status !== PROMOTED_GOVERNANCE_STATUS) {
      throw new Error(
        `Signal ${input.signalId} is not a current promoted signal and cannot be published`,
      );
    }

    // Public-safety: unresolved entity attribution rides inside the
    // prose itself, so the act is refused — with the reason stated —
    // rather than publishing and leaking the working entity name.
    const safety = assessPublicSafety({
      entityIds: Array.isArray(signal.entity_ids)
        ? signal.entity_ids.map(String)
        : [],
      entityName: entityNameFromStatistics(signal.supporting_statistics),
      entityResolutionStatus: String(signal.entity_resolution_status),
    });
    if (!safety.publicSafe) {
      throw new SignalNotPublicSafeError(input.signalId, safety.reason!);
    }

    const existing = rowsFromExecuteResult(
      await tx.execute(sql`
        select id from public.signal_publications
         where live_data_signal_id = ${input.signalId} and unpublished_at is null
         limit 1
      `),
    );
    if (existing.length > 0) {
      throw new Error(`Signal ${input.signalId} is already published`);
    }

    const publishedBy = hashActorId(input.actorId);
    const [publication] = rowsFromExecuteResult(
      await tx.execute(sql`
        insert into public.signal_publications
          (live_data_signal_id, signal_hash, published_at, published_by)
        values (${input.signalId}, ${signal.signal_hash}, ${now}, ${publishedBy})
        returning id
      `),
    );

    const log = await writeGovernanceLog(tx, {
      eventType: "signal_published",
      component: PUBLICATION_COMPONENT,
      scope: `signal_id:${input.signalId}`,
      previousState: { published: false, signalId: input.signalId },
      newState: {
        published: true,
        signalId: input.signalId,
        signalHash: String(signal.signal_hash),
        publicationId: Number(publication.id),
        publishedAt: now,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: "admin",
    });

    await tx.execute(sql`
      update public.signal_publications
         set governance_seq_no = ${log.seqNo}
       where id = ${Number(publication.id)}
    `);

    return {
      publicationId: Number(publication.id),
      signalId: input.signalId,
      signalHash: String(signal.signal_hash),
      publishedAt: now,
      governanceSeqNo: log.seqNo,
      entryHash: log.entryHash,
    };
  });
}

/**
 * Withdraw one signal's active publication. A single transaction:
 * find the active publication → atomically CLAIM it (conditional
 * update, still-active predicate) → write the governance log entry
 * (signal_unpublished) → re-stamp the row's seq_no. Unpublishing
 * does not require the signal to still be promoted: the record of a
 * demoted signal's publication must remain closable. With no active
 * publication there is nothing to withdraw.
 *
 * The claim is the concurrency guard (Codex Finding 3 on PR #873):
 * the read above is not a lock, so two concurrent unpublishes could
 * both read the active row. The conditional UPDATE is atomic —
 * under READ COMMITTED it waits on the concurrent withdrawer's row
 * lock and re-evaluates `unpublished_at is null` against the
 * committed row, so the loser matches zero rows and is refused with
 * SignalPublicationAlreadyWithdrawnError BEFORE its governance
 * event is written. The first withdrawal's unpublished_at and
 * governance_seq_no are never overwritten, and the log never claims
 * a publication was withdrawn while it was still active when it
 * was not.
 */
export async function unpublishSignal(input: {
  signalId: string;
  rationale: string;
  actorId: string;
}): Promise<UnpublishResult> {
  const now = Date.now();
  return await db.transaction(async (tx: any) => {
    const [publication] = rowsFromExecuteResult(
      await tx.execute(sql`
        select id, live_data_signal_id, signal_hash, published_at,
               published_by, unpublished_at, governance_seq_no
          from public.signal_publications
         where live_data_signal_id = ${input.signalId} and unpublished_at is null
         order by id desc
         limit 1
      `),
    );
    if (!publication) {
      throw new Error(`Signal ${input.signalId} has no active publication`);
    }

    const claimed = rowsFromExecuteResult(
      await tx.execute(sql`
        update public.signal_publications
           set unpublished_at = ${now}
         where id = ${Number(publication.id)} and unpublished_at is null
         returning id
      `),
    );
    if (claimed.length === 0) {
      throw new SignalPublicationAlreadyWithdrawnError(
        input.signalId,
        Number(publication.id),
      );
    }

    const log = await writeGovernanceLog(tx, {
      eventType: "signal_unpublished",
      component: PUBLICATION_COMPONENT,
      scope: `signal_id:${input.signalId}`,
      previousState: {
        published: true,
        signalId: input.signalId,
        signalHash: String(publication.signal_hash),
        publicationId: Number(publication.id),
        publishedAt: Number(publication.published_at),
      },
      newState: {
        published: false,
        signalId: input.signalId,
        publicationId: Number(publication.id),
        unpublishedAt: now,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: "admin",
    });

    await tx.execute(sql`
      update public.signal_publications
         set governance_seq_no = ${log.seqNo}
       where id = ${Number(publication.id)}
    `);

    return {
      publicationId: Number(publication.id),
      signalId: input.signalId,
      unpublishedAt: now,
      governanceSeqNo: log.seqNo,
      entryHash: log.entryHash,
    };
  });
}
