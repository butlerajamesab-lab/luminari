import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import {
  read_admitted_target,
  read_live_target,
  validate_target_agreement,
  type admitted_generation_target,
  type live_generation_target,
} from "./civic-genome-version-admission-driver";
import {
  load_version,
  record_amendment_attachment,
  register_rosetta_amendment_attachment,
  resolve_current_amendment_attachment,
} from "./civic-genome-legislative-version-pipeline";

/**
 * Amendment attachment backfill: link already-ingested amendments to the
 * exact source text they amend.
 *
 * Amendment base identity is intentionally unresolved at registration time;
 * the link is earned by the governed attachment evaluation in the legislative
 * version pipeline, which reads the amendment's own text for an explicit
 * target reference and matches it to that exact print. The Lane 2 ingestion
 * driver runs that evaluation for every amendment it ingests, but amendments
 * ingested before the driver existed were never evaluated. This leg is the
 * backfill for exactly that population: amendment versions already
 * source_ingested, still without a base, whose exact content is preserved in
 * Rosetta and not yet evaluated.
 *
 * Each cycle first proves the Genome's admitted generation target and
 * Rosetta's live selected target agree (the lane's standing discipline for
 * legs that register Rosetta-side receipts) and stands down without writing
 * anything when they do not. Per version it fetches the preserved content,
 * verifies its hash against the version's recorded source content hash, and
 * only then runs the governed evaluation — never against unverified text.
 * Resolved attachments are registered and recorded through the pipeline's
 * own functions, exactly as the ingestion driver does.
 *
 * Evaluation is marker-first and resumable: a claim writes an
 * amendment_attachment_evaluation_v1 receipt in the 'evaluating' state
 * before any governed write, and every governed step that follows is
 * idempotent (the persist is conflict-checked and null-guarded; the Rosetta
 * registration is replay-safe). A failure anywhere leaves the marker in
 * 'evaluating', and claims resume stale 'evaluating' markers, so a
 * partially completed attachment — base persisted, registration not yet
 * recorded — is always eligible for completion instead of being stranded
 * by its own base link. Final outcomes replace the marker with their
 * terminal state, which makes the evaluated stock a reason-coded census
 * for later evidence methods and keeps finished versions out of claims.
 * This leg reads and writes no queue rows, invokes no decomposition,
 * binds nothing, assembles nothing, and deletes nothing.
 */

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 15_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const DEFAULT_BATCH_SIZE = 5;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 25;
const ROSETTA_CONTENT_TIMEOUT_MS = 15_000;
const RESUME_STALE_AFTER_MINUTES = 15;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

export type attachment_cycle_plan =
  | { action: "stand_down"; reason: string }
  | { action: "evaluate" };

export function plan_attachment_cycle(
  admitted: admitted_generation_target | null,
  live: live_generation_target | null,
): attachment_cycle_plan {
  if (!admitted) return { action: "stand_down", reason: "no_admitted_target" };
  if (!live) return { action: "stand_down", reason: "live_target_unreadable" };
  const agreement = validate_target_agreement(admitted, live);
  if (!agreement.ok) return { action: "stand_down", reason: agreement.reason };
  return { action: "evaluate" };
}

export const CLAIM_ATTACHMENT_CANDIDATES_SQL = `
  select version.bill_version_id::text as bill_version_id,
         version.rosetta_source_document_id::bigint as rosetta_source_document_id,
         lower(version.receipt_json->>'source_content_hash') as source_content_hash
    from public.civic_genome_bill_version version
   where version.document_family = 'amendment'
     and version.processing_state = 'source_ingested'
     and version.rosetta_source_document_id is not null
     and version.receipt_json->>'source_content_hash' ~ '^[0-9a-fA-F]{64}$'
     and (
       (
         version.base_bill_version_id is null
         and not (version.receipt_json ? 'amendment_attachment_evaluation_v1')
       )
       or (
         version.receipt_json->'amendment_attachment_evaluation_v1'->>'status'
           = 'evaluating'
         and (version.receipt_json->'amendment_attachment_evaluation_v1'->>'evaluated_at')::timestamptz
           < now() - make_interval(mins => ${RESUME_STALE_AFTER_MINUTES})
       )
     )
   order by version.updated_at, version.bill_version_id
   limit $1::int`;

/**
 * The evaluation record. The key sits outside the receipt quarantine's
 * derivative namespaces (rosetta_/assembly_/prism_) by design: this is raw
 * evidence about the version's own evaluation, not a derivative receipt.
 * Rehearsed against production in BEGIN...ROLLBACK before this driver was
 * written; the guard accepts the key and the rolled-back write left no
 * trace.
 */
export const RECORD_ATTACHMENT_EVALUATION_SQL = `
  update public.civic_genome_bill_version
     set receipt_json = receipt_json || jsonb_build_object(
           'amendment_attachment_evaluation_v1',
           jsonb_build_object(
             'contract', 'lighthouse-amendment-attachment-evaluation-v1',
             'status', $2::text,
             'reason', $3::text,
             'evaluated_at', now()
           )
         ),
         updated_at = now()
   where bill_version_id = $1::uuid`;

export function content_hash_matches(
  recorded_hash: string | null | undefined,
  fetched_hash: string | null | undefined,
): boolean {
  if (!recorded_hash || !fetched_hash) return false;
  return recorded_hash.toLowerCase() === fetched_hash.toLowerCase();
}

export type preserved_content = {
  source_content_id: string;
  source_text: string;
  source_content_hash: string;
  source_url: string;
};

/**
 * A source document can hold several preserved content rows (one per
 * registration). The amendment's recorded hash names the exact one its
 * evaluation must run against: select by hash, never by position.
 */
export function select_content_by_hash(
  rows: preserved_content[],
  recorded_hash: string,
): preserved_content | null {
  return (
    rows.find((row) => content_hash_matches(recorded_hash, row.source_content_hash))
    ?? null
  );
}

type attachment_candidate = {
  bill_version_id: string;
  rosetta_source_document_id: number;
  source_content_hash: string;
};

function required_environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing_environment:${name}`);
  return value;
}

function enabled(): boolean {
  return background_feature_enabled("GENOME_AMENDMENT_ATTACHMENT_ENABLED");
}

function bounded_batch_size(): number {
  const raw = Number(process.env.GENOME_AMENDMENT_ATTACHMENT_BATCH_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.trunc(raw)));
}

function bounded_poll_interval_ms(): number {
  const raw = Number(process.env.GENOME_AMENDMENT_ATTACHMENT_POLL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw)),
  );
}

function error_code(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const prefix = typeof code === "string" ? `${code}:` : "";
    return `${prefix}${error.message}`.slice(0, 200);
  }
  return "unknown";
}

async function claim_attachment_candidates(
  batch_size: number,
): Promise<attachment_candidate[]> {
  const { rows } = await query_with_diagnostics<attachment_candidate>(
    CLAIM_ATTACHMENT_CANDIDATES_SQL,
    [batch_size],
    {
      label: "genome_amendment_attachment_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  return rows;
}

async function record_attachment_evaluation(
  bill_version_id: string,
  status: string,
  reason: string | null,
): Promise<void> {
  await query_with_diagnostics(RECORD_ATTACHMENT_EVALUATION_SQL, [
    bill_version_id,
    status,
    reason,
  ], {
    label: "genome_amendment_attachment_record_evaluation",
    pool_acquire_timeout_ms: 1_000,
    query_timeout_ms: 5_000,
  });
}

async function fetch_preserved_content(
  rosetta_source_document_id: number,
): Promise<preserved_content[]> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL").replace(/\/$/, "");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key);
  headers.set("accept", "application/json");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_CONTENT_TIMEOUT_MS);
  try {
    const query = new URLSearchParams({
      select: "source_content_id,source_text,source_content_hash,source_url",
      source_document_id: `eq.${rosetta_source_document_id}`,
    });
    const response = await fetch(
      `${base_url}/rest/v1/source_document_content?${query.toString()}`,
      { method: "GET", headers, signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(
        `amendment_attachment_content_read_failed:${response.status}`,
      );
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        source_content_id: String(row.source_content_id),
        source_text: String(row.source_text ?? ""),
        source_content_hash: String(row.source_content_hash ?? ""),
        source_url: String(row.source_url ?? ""),
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

type evaluation_outcome =
  | "linked"
  | "awaiting_base_content"
  | "unresolved"
  | "skipped"
  | "deferred";

async function evaluate_attachment(
  candidate: attachment_candidate,
): Promise<evaluation_outcome> {
  const version = await load_version(candidate.bill_version_id);
  if (version.document_family !== "amendment") return "skipped";
  if (
    version.base_bill_version_id
    && version.receipt_json?.amendment_attachment_v1
  ) {
    // A previous pass completed registration and recording but did not
    // finalize the marker. Heal the bookkeeping; nothing else to do.
    await record_attachment_evaluation(
      candidate.bill_version_id,
      "resolved",
      null,
    );
    return "linked";
  }

  // Marker first: from here on, any failure leaves a resumable
  // 'evaluating' state instead of an untracked partial completion.
  await record_attachment_evaluation(
    candidate.bill_version_id,
    "evaluating",
    null,
  );

  const rows = await fetch_preserved_content(
    candidate.rosetta_source_document_id,
  );
  if (rows.length === 0) {
    await record_attachment_evaluation(
      candidate.bill_version_id,
      "content_missing",
      "preserved_source_content_not_found",
    );
    return "skipped";
  }
  const content = select_content_by_hash(rows, candidate.source_content_hash);
  if (!content) {
    await record_attachment_evaluation(
      candidate.bill_version_id,
      "content_hash_mismatch",
      "no_preserved_content_row_matches_recorded_hash",
    );
    return "skipped";
  }

  let attachment: Awaited<
    ReturnType<typeof resolve_current_amendment_attachment>
  >;
  try {
    attachment = await resolve_current_amendment_attachment(version, {
      source_text: content.source_text,
      source_content_hash: candidate.source_content_hash,
      source_url: content.source_url || version.source_url,
    });
  } catch (error) {
    const code = error_code(error);
    if (
      code.includes("legislative_amendment_base_identity_conflict")
      || code.includes("legislative_amendment_base_version_conflict")
    ) {
      await record_attachment_evaluation(
        candidate.bill_version_id,
        "base_identity_conflict",
        code,
      );
      return "skipped";
    }
    throw error;
  }
  if (!attachment) return "skipped";

  if (attachment.resolution.status === "resolved") {
    const receipt = await register_rosetta_amendment_attachment(
      content.source_content_id,
      candidate.source_content_hash,
      attachment,
    );
    await record_amendment_attachment(
      candidate.bill_version_id,
      attachment,
      receipt,
    );
    await record_attachment_evaluation(
      candidate.bill_version_id,
      "resolved",
      null,
    );
    return "linked";
  }
  if (attachment.resolution.status === "awaiting_base_content") {
    await record_attachment_evaluation(
      candidate.bill_version_id,
      "awaiting_base_content",
      attachment.resolution.reason,
    );
    return "awaiting_base_content";
  }
  await record_attachment_evaluation(
    candidate.bill_version_id,
    "unresolved",
    attachment.resolution.reason,
  );
  return "unresolved";
}

async function run_attachment_cycle(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    let admitted: admitted_generation_target | null = null;
    try {
      admitted = await read_admitted_target();
    } catch {
      admitted = null;
    }
    let live: live_generation_target | null = null;
    if (admitted) {
      try {
        live = await read_live_target();
      } catch {
        live = null;
      }
    }
    const plan = plan_attachment_cycle(admitted, live);
    if (plan.action === "stand_down") {
      console.log("[GenomeAmendmentAttachment] stood_down", {
        reason: plan.reason,
      });
      return;
    }

    const candidates = await claim_attachment_candidates(bounded_batch_size());
    let linked = 0;
    let awaiting = 0;
    let unresolved = 0;
    let skipped = 0;
    let deferred = 0;
    for (const candidate of candidates) {
      try {
        const outcome = await evaluate_attachment(candidate);
        if (outcome === "linked") linked += 1;
        else if (outcome === "awaiting_base_content") awaiting += 1;
        else if (outcome === "unresolved") unresolved += 1;
        else if (outcome === "skipped") skipped += 1;
        else deferred += 1;
      } catch (error) {
        deferred += 1;
        console.error("[GenomeAmendmentAttachment] evaluation_failed", {
          bill_version_id: candidate.bill_version_id,
          error_code: error_code(error),
        });
      }
    }
    if (candidates.length > 0) {
      console.log("[GenomeAmendmentAttachment] cycle", {
        claimed: candidates.length,
        linked,
        awaiting,
        unresolved,
        skipped,
        deferred,
        rule_set_version: admitted?.rule_set_version,
      });
    }
  } catch (error) {
    console.error("[GenomeAmendmentAttachment] cycle_failed", {
      error_code: error_code(error),
    });
  } finally {
    running = false;
  }
}

export function start_genome_amendment_attachment_driver(): void {
  if (timer || !enabled()) return;
  stopped = false;
  const delay = bounded_poll_interval_ms();
  console.log("[GenomeAmendmentAttachment] started", {
    interval_ms: delay,
    batch_size: bounded_batch_size(),
  });
  void run_attachment_cycle();
  timer = setInterval(() => void run_attachment_cycle(), delay);
  timer.unref?.();
}

export function stop_genome_amendment_attachment_driver(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}
