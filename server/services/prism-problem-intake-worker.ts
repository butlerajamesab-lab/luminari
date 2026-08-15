import { query_with_diagnostics } from "../db";
import { PrismBoundaryError } from "./prism-verification-client";
import {
  buildPrismProblemObservation,
  submitLighthouseProblemToPrism,
  type LighthouseProblemInstanceRow,
} from "./prism-problem-intake-client";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

async function loadPendingProblems(limit: number): Promise<LighthouseProblemInstanceRow[]> {
  const result = await query_with_diagnostics<LighthouseProblemInstanceRow>(
    `select
       p.id::text, p.record_id, p.problem_type, p.jurisdiction, p.system_primary,
       p.risk_level, p.friction, p.alignment, p.findings, p.resolution_pathways,
       p.evidence, p.grounding_entities, p.actions, p.feedback_history,
       p.traceability, p.coordination, p.intake_ready, p.recommended_next_action,
       p.created_at::text, p.updated_at::text
     from public.problem_instances p
     where p.intake_ready = true
       and not exists (
         select 1
         from public.lighthouse_prism_problem_handoff h
         where h.origin_problem_instance_id = p.id
           and h.handoff_state = 'COMPLETED'
           and h.completed_at >= coalesce(p.updated_at, p.created_at, '-infinity'::timestamptz)
       )
     order by coalesce(p.updated_at, p.created_at) asc nulls first, p.record_id
     limit $1`,
    [limit],
    { label: "prism_problem_handoff_pending", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
  return result.rows;
}

async function beginAttempt(row: LighthouseProblemInstanceRow, sourceSnapshotHash: string) {
  await query_with_diagnostics(
    `insert into public.lighthouse_prism_problem_handoff (
       origin_problem_instance_id, origin_record_id, source_snapshot_hash,
       handoff_state, attempt_count, first_attempted_at, last_attempted_at
     ) values ($1::uuid,$2,$3,'PENDING',1,now(),now())
     on conflict (origin_problem_instance_id, source_snapshot_hash)
     do update set
       handoff_state = 'PENDING',
       attempt_count = public.lighthouse_prism_problem_handoff.attempt_count + 1,
       last_attempted_at = now(),
       failure_class = null,
       failure_message = null,
       updated_at = now()`,
    [row.id, row.record_id, sourceSnapshotHash],
    { label: "prism_problem_handoff_attempt", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
}

async function completeAttempt(row: LighthouseProblemInstanceRow, sourceSnapshotHash: string, result: Awaited<ReturnType<typeof submitLighthouseProblemToPrism>>) {
  await query_with_diagnostics(
    `update public.lighthouse_prism_problem_handoff
     set handoff_state='COMPLETED',
         prism_problem_instance_id=$3::uuid,
         prism_normalized_hash=$4,
         eligible_pair_count=$5,
         failure_class=null,
         failure_message=null,
         completed_at=now(),
         updated_at=now()
     where origin_problem_instance_id=$1::uuid and source_snapshot_hash=$2`,
    [
      row.id,
      sourceSnapshotHash,
      result.persistence.problem_instance_id,
      result.persistence.normalized_hash,
      result.eligible_pair_count,
    ],
    { label: "prism_problem_handoff_complete", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
}

async function failAttempt(row: LighthouseProblemInstanceRow, sourceSnapshotHash: string, error: unknown) {
  const boundary = error instanceof PrismBoundaryError ? error : null;
  const transient = boundary && ["timeout", "transient_upstream", "network"].includes(boundary.failure_class);
  const failureClass = boundary?.failure_class ?? (error instanceof Error ? error.name : "unknown");
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  await query_with_diagnostics(
    `update public.lighthouse_prism_problem_handoff
     set handoff_state=$3,
         failure_class=$4,
         failure_message=$5,
         updated_at=now()
     where origin_problem_instance_id=$1::uuid and source_snapshot_hash=$2`,
    [row.id, sourceSnapshotHash, transient ? "DEGRADED" : "PERMANENT_FAILURE", failureClass, message],
    { label: "prism_problem_handoff_fail", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
}

export async function runPrismProblemHandoffBatch(limit = DEFAULT_BATCH_SIZE) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_BATCH_SIZE);
  const rows = await loadPendingProblems(boundedLimit);
  let completed = 0;
  let failed = 0;
  let eligiblePairsCreatedOrReused = 0;

  for (const row of rows) {
    const { source_snapshot_hash } = buildPrismProblemObservation(row);
    await beginAttempt(row, source_snapshot_hash);
    try {
      const result = await submitLighthouseProblemToPrism(row);
      await completeAttempt(row, source_snapshot_hash, result);
      completed += 1;
      eligiblePairsCreatedOrReused += result.eligible_pair_count;
    } catch (error) {
      failed += 1;
      await failAttempt(row, source_snapshot_hash, error);
      console.error("[PrismProblemHandoff] problem handoff failed", {
        record_id: row.record_id,
        failure_class: error instanceof PrismBoundaryError ? error.failure_class : error instanceof Error ? error.name : "unknown",
        error_message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    attempted: rows.length,
    completed,
    failed,
    eligible_pairs_created_or_reused: eligiblePairsCreatedOrReused,
    remaining_may_exist: rows.length === boundedLimit,
  };
}
