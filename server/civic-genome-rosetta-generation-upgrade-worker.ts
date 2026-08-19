import { randomUUID } from "node:crypto";

import { query_with_diagnostics } from "./db";
import { assemble_rosetta_and_resolve_family } from "./civic-genome-rosetta-family-orchestration";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const QUEUE_LEASE_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const DISCOVERY_BATCH_SIZE = 25;
const MAX_JOBS_PER_CYCLE = 3;
const ROSETTA_REQUEST_TIMEOUT_MS = 120_000;

const worker_id = [
  process.env.RENDER_SERVICE_ID ?? "lighthouse",
  "rosetta-generation-upgrade",
  process.pid,
  randomUUID(),
].join(":");

let timer: NodeJS.Timeout | null = null;
let cycle_running = false;
let stopped = false;

export type current_generation = {
  contract: string;
  engine_version: string;
  rule_set_version: string;
  rule_manifest_hash: string;
};

type discovery_candidate = {
  bill_version_id: string;
  genome_bill_id: string;
  source_document_id: number;
  source_identity_hash: string | null;
  source_content_hash: string | null;
  source_version: string | null;
};

type upgrade_job = {
  upgrade_id: string;
  genome_bill_id: string;
  source_document_id: number;
  source_identity_hash: string;
  target_engine_version: string;
  target_rule_set_version: string;
  target_rule_manifest_hash: string;
  attempt_count: number;
};

type replay_receipt = {
  extraction_run_id: number;
  source_document_id: number;
  engine_version: string;
  rule_set_version: string;
  rule_manifest_hash: string;
  configuration_hash: string;
  output_content_hash: string | null;
  run_status: string;
  admissibility_state: string;
  provenance_state?: string;
  replay_contract?: string;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : "unknown_rosetta_generation_upgrade_failure";
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 256)
    || "unknown_rosetta_generation_upgrade_failure";
}

function bounded_poll_interval(): number {
  const parsed = Number.parseInt(
    process.env.ROSETTA_GENOME_UPGRADE_QUEUE_POLL_MS ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, parsed));
}

function worker_enabled(): boolean {
  const configured = process.env.ROSETTA_GENOME_UPGRADE_QUEUE_ENABLED?.trim().toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function rosetta_generation_upgrade_retry_delay_seconds(
  prior_attempt_count: number,
): number {
  const exponent = Math.max(0, Math.min(7, prior_attempt_count));
  return Math.min(3_600, 30 * (2 ** exponent));
}

async function rosetta_rpc<T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(key, {
    accept: "application/json",
    "content-type": "application/json",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base_url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`rosetta_rpc_failed:${name}:${response.status}:${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`rosetta_rpc_timeout:${name}:${ROSETTA_REQUEST_TIMEOUT_MS}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function rosetta_select<T>(path: string): Promise<T[]> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(key, { accept: "application/json" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${base_url}/rest/v1/${path}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`rosetta_select_failed:${response.status}:${text.slice(0, 500)}`);
    }
    const payload: unknown = JSON.parse(text);
    if (!Array.isArray(payload)) throw new Error("rosetta_select_invalid_shape");
    return payload as T[];
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_select_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetch_rosetta_current_generation(): Promise<current_generation> {
  const generation = await rosetta_rpc<current_generation>("rosetta_current_generation_v1");
  if (
    generation?.contract !== "rosetta-current-generation-v1"
    || !generation.engine_version
    || !generation.rule_set_version
    || !/^[0-9a-f]{64}$/.test(generation.rule_manifest_hash)
  ) {
    throw new Error("rosetta_current_generation_receipt_invalid");
  }
  return generation;
}

async function resolve_source_identity(candidate: discovery_candidate): Promise<string> {
  if (candidate.source_identity_hash) return candidate.source_identity_hash;
  if (!candidate.source_version) {
    throw new Error("rosetta_upgrade_source_receipt_incomplete");
  }

  const query_params: Record<string, string> = {
    select: "source_identity_hash,source_content_hash,source_version",
    source_document_id: `eq.${candidate.source_document_id}`,
    source_version: `eq.${candidate.source_version}`,
    limit: "2",
  };
  if (candidate.source_content_hash) {
    query_params.source_content_hash = `eq.${candidate.source_content_hash}`;
  }
  const query = new URLSearchParams(query_params);
  const rows = await rosetta_select<{
    source_identity_hash: string;
    source_content_hash: string;
    source_version: string;
  }>(`source_document_content?${query.toString()}`);

  if (rows.length !== 1 || !/^[0-9a-f]{64}$/.test(rows[0].source_identity_hash)) {
    throw new Error(`rosetta_upgrade_source_identity_not_unique:${candidate.source_document_id}`);
  }
  return rows[0].source_identity_hash;
}

async function discover_candidates(
  generation: current_generation,
): Promise<discovery_candidate[]> {
  const result = await query_with_diagnostics<discovery_candidate>(
    `with ranked as (
       select version.*,
              row_number() over (
                partition by version.genome_bill_id
                order by version.stage_rank desc,
                         version.provider_sequence desc,
                         version.created_at desc,
                         version.bill_version_id desc
              ) as rn
         from public.civic_genome_bill_version version
     )
     select version.bill_version_id::text,
            version.genome_bill_id::text,
            version.rosetta_source_document_id::integer as source_document_id,
            binding.source_identity_hash,
            coalesce(
              binding.source_content_hash,
              nullif(version.receipt_json->>'source_content_hash','')
            ) as source_content_hash,
            coalesce(
              binding.source_version,
              nullif(version.receipt_json->>'source_version','')
            ) as source_version
       from ranked version
       left join public.civic_genome_rosetta_source_binding binding
         on binding.source_document_id = version.rosetta_source_document_id
      where version.rn = 1
        and version.rosetta_source_document_id is not null
        and (
          binding.source_document_id is null
          or binding.rosetta_engine_version is distinct from $1
          or binding.rosetta_rule_set_version is distinct from $2
          or binding.rosetta_rule_manifest_hash is distinct from $3
        )
        and not exists (
          select 1
            from public.civic_genome_rosetta_generation_upgrade_queue queued
           where queued.source_document_id = version.rosetta_source_document_id
             and queued.target_engine_version = $1
             and queued.target_rule_set_version = $2
             and queued.target_rule_manifest_hash = $3
        )
      order by version.stage_rank desc,
               version.provider_sequence desc,
               version.created_at desc,
               version.bill_version_id desc
      limit $4`,
    [
      generation.engine_version,
      generation.rule_set_version,
      generation.rule_manifest_hash,
      DISCOVERY_BATCH_SIZE,
    ],
    {
      label: "rosetta_generation_upgrade_discovery",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

export async function discover_rosetta_generation_upgrades(): Promise<number> {
  const generation = await fetch_rosetta_current_generation();
  const candidates = await discover_candidates(generation);
  let inserted = 0;

  for (const candidate of candidates) {
    try {
      const source_identity_hash = await resolve_source_identity(candidate);
      const result = await query_with_diagnostics(
        `insert into public.civic_genome_rosetta_generation_upgrade_queue (
           genome_bill_id,
           source_document_id,
           source_identity_hash,
           target_engine_version,
           target_rule_set_version,
           target_rule_manifest_hash,
           queue_state,
           next_attempt_at,
           updated_at
         ) values ($1::uuid,$2::bigint,$3,$4,$5,$6,'eligible',now(),now())
         on conflict (
           source_document_id,
           target_engine_version,
           target_rule_set_version,
           target_rule_manifest_hash
         ) do nothing`,
        [
          candidate.genome_bill_id,
          candidate.source_document_id,
          source_identity_hash,
          generation.engine_version,
          generation.rule_set_version,
          generation.rule_manifest_hash,
        ],
        {
          label: "rosetta_generation_upgrade_enqueue",
          pool_acquire_timeout_ms: 1_000,
          query_timeout_ms: 5_000,
        },
      );
      inserted += result.rowCount ?? 0;
    } catch (error) {
      console.error("[RosettaGenerationUpgrade] discovery_candidate_failed", {
        bill_version_id: candidate.bill_version_id,
        genome_bill_id: candidate.genome_bill_id,
        source_document_id: candidate.source_document_id,
        error_code: safe_error_code(error),
      });
    }
  }
  return inserted;
}

async function claim_next_job(): Promise<upgrade_job | null> {
  const result = await query_with_diagnostics<upgrade_job>(
    `with candidate as (
       select queue.upgrade_id
         from public.civic_genome_rosetta_generation_upgrade_queue queue
        where queue.next_attempt_at <= now()
          and queue.attempt_count < $2::integer
          and (
            queue.queue_state in ('eligible','retry')
            or (
              queue.queue_state = 'running'
              and queue.locked_at < now() - make_interval(mins => $3::integer)
            )
          )
          and (
            queue.locked_at is null
            or queue.locked_at < now() - make_interval(mins => $3::integer)
          )
        order by queue.created_at, queue.upgrade_id
        for update skip locked
        limit 1
     )
     update public.civic_genome_rosetta_generation_upgrade_queue queue
        set queue_state='running',
            locked_at=now(),
            locked_by=$1,
            updated_at=now()
       from candidate
      where queue.upgrade_id=candidate.upgrade_id
      returning queue.upgrade_id::text,
                queue.genome_bill_id::text,
                queue.source_document_id::integer,
                queue.source_identity_hash,
                queue.target_engine_version,
                queue.target_rule_set_version,
                queue.target_rule_manifest_hash,
                queue.attempt_count`,
    [worker_id, MAX_ATTEMPTS, QUEUE_LEASE_MINUTES],
    {
      label: "rosetta_generation_upgrade_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0] ?? null;
}

async function claim_job_batch(): Promise<upgrade_job[]> {
  const jobs: upgrade_job[] = [];
  for (let index = 0; index < MAX_JOBS_PER_CYCLE; index += 1) {
    const job = await claim_next_job();
    if (!job) break;
    jobs.push(job);
  }
  return jobs;
}

async function replay_job(job: upgrade_job): Promise<replay_receipt> {
  const receipt = await rosetta_rpc<replay_receipt>(
    "rosetta_replay_source_identity_current_v1",
    {
      p_source_document_id: job.source_document_id,
      p_source_identity_hash: job.source_identity_hash,
    },
  );
  if (
    receipt.replay_contract !== "rosetta-exact-source-current-generation-replay-v1"
    || receipt.source_document_id !== job.source_document_id
    || receipt.engine_version !== job.target_engine_version
    || receipt.rule_set_version !== job.target_rule_set_version
    || receipt.rule_manifest_hash !== job.target_rule_manifest_hash
    || receipt.run_status !== "completed"
    || receipt.admissibility_state !== "admissible"
    || receipt.provenance_state !== "complete"
    || !receipt.output_content_hash
  ) {
    throw new Error("rosetta_generation_upgrade_replay_receipt_rejected");
  }
  return receipt;
}

async function update_current_version_receipt(
  job: upgrade_job,
  receipt: replay_receipt,
  assembly: Awaited<ReturnType<typeof assemble_rosetta_and_resolve_family>>,
): Promise<void> {
  await query_with_diagnostics(
    `with current_version as (
       select version.bill_version_id
         from public.civic_genome_bill_version version
        where version.genome_bill_id=$1::uuid
          and version.rosetta_source_document_id=$2::bigint
        order by version.stage_rank desc,
                 version.provider_sequence desc,
                 version.created_at desc,
                 version.bill_version_id desc
        limit 1
     )
     update public.civic_genome_bill_version version
        set rosetta_extraction_run_id=$3::text,
            assembly_run_id=$4::uuid,
            processing_state='assembled',
            failure_code=null,
            receipt_json=version.receipt_json || jsonb_build_object(
              'rosetta_extraction_run_id',$3::text,
              'rosetta_engine_version',$5::text,
              'rosetta_rule_set_version',$6::text,
              'rosetta_rule_manifest_hash',$7::text,
              'rosetta_configuration_hash',$8::text,
              'rosetta_output_content_hash',$9::text,
              'rosetta_generation_upgrade_contract','civic-genome-rosetta-generation-upgrade-v1',
              'rosetta_generation_upgrade_at',now(),
              'assembly_run_id',$4::uuid,
              'assembly_input_hash',$10::text,
              'assembly_output_hash',$11::text,
              'assembly_trait_count',$12::integer,
              'assembly_verification_state',$13::text,
              'family_resolution_status',$14::text
            ),
            updated_at=now()
       from current_version
      where version.bill_version_id=current_version.bill_version_id`,
    [
      job.genome_bill_id,
      job.source_document_id,
      String(receipt.extraction_run_id),
      assembly.assembly_run_id,
      receipt.engine_version,
      receipt.rule_set_version,
      receipt.rule_manifest_hash,
      receipt.configuration_hash,
      receipt.output_content_hash,
      assembly.input_hash,
      assembly.output_hash,
      assembly.trait_count,
      assembly.verification_state,
      assembly.family_resolution.status,
    ],
    {
      label: "rosetta_generation_upgrade_version_receipt",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function mark_completed(
  job: upgrade_job,
  receipt: replay_receipt,
  assembly_run_id: string,
): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_rosetta_generation_upgrade_queue
        set queue_state='completed',
            attempt_count=attempt_count+1,
            extraction_run_id=$2::bigint,
            assembly_run_id=$3::uuid,
            completed_at=now(),
            locked_at=null,
            locked_by=null,
            last_error_code=null,
            last_error_detail=null,
            updated_at=now()
      where upgrade_id=$1::uuid
        and locked_by=$4`,
    [job.upgrade_id, receipt.extraction_run_id, assembly_run_id, worker_id],
    {
      label: "rosetta_generation_upgrade_complete",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function mark_failed(job: upgrade_job, error: unknown): Promise<void> {
  const next_attempt = job.attempt_count + 1;
  const dead_letter = next_attempt >= MAX_ATTEMPTS;
  const delay = rosetta_generation_upgrade_retry_delay_seconds(job.attempt_count);
  const detail = error instanceof Error ? error.message.slice(0, 1_000) : "unknown_error";
  await query_with_diagnostics(
    `update public.civic_genome_rosetta_generation_upgrade_queue
        set queue_state=$2,
            attempt_count=attempt_count+1,
            next_attempt_at=case
              when $2='retry' then now()+make_interval(secs=>$3::integer)
              else next_attempt_at
            end,
            locked_at=null,
            locked_by=null,
            last_error_code=$4,
            last_error_detail=$5,
            updated_at=now()
      where upgrade_id=$1::uuid
        and locked_by=$6`,
    [
      job.upgrade_id,
      dead_letter ? "dead_letter" : "retry",
      delay,
      safe_error_code(error),
      detail,
      worker_id,
    ],
    {
      label: "rosetta_generation_upgrade_fail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

export async function process_rosetta_generation_upgrade_job(
  job: upgrade_job,
): Promise<void> {
  try {
    const receipt = await replay_job(job);
    const assembly = await assemble_rosetta_and_resolve_family({
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      extraction_run_id: receipt.extraction_run_id,
    });
    await update_current_version_receipt(job, receipt, assembly);
    await mark_completed(job, receipt, assembly.assembly_run_id);
    console.log("[RosettaGenerationUpgrade] completed", {
      upgrade_id: job.upgrade_id,
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      extraction_run_id: receipt.extraction_run_id,
      assembly_run_id: assembly.assembly_run_id,
      target_engine_version: job.target_engine_version,
      target_rule_set_version: job.target_rule_set_version,
      target_rule_manifest_hash: job.target_rule_manifest_hash,
    });
  } catch (error) {
    await mark_failed(job, error);
    console.error("[RosettaGenerationUpgrade] failed", {
      upgrade_id: job.upgrade_id,
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      error_code: safe_error_code(error),
    });
  }
}

export async function run_rosetta_generation_upgrade_cycle(): Promise<void> {
  if (cycle_running || stopped) return;
  cycle_running = true;
  try {
    await discover_rosetta_generation_upgrades();
    const jobs = await claim_job_batch();
    if (jobs.length) {
      await Promise.all(jobs.map(job => process_rosetta_generation_upgrade_job(job)));
    }
  } catch (error) {
    console.error("[RosettaGenerationUpgrade] cycle_failed", {
      error_code: safe_error_code(error),
    });
  } finally {
    cycle_running = false;
  }
}

export function start_rosetta_generation_upgrade_worker(): void {
  if (timer || !worker_enabled()) return;
  stopped = false;
  const interval_ms = bounded_poll_interval();
  console.log("[RosettaGenerationUpgrade] started", {
    worker_id,
    interval_ms,
    max_attempts: MAX_ATTEMPTS,
    discovery_batch_size: DISCOVERY_BATCH_SIZE,
    max_jobs_per_cycle: MAX_JOBS_PER_CYCLE,
  });
  void run_rosetta_generation_upgrade_cycle();
  timer = setInterval(() => {
    void run_rosetta_generation_upgrade_cycle();
  }, interval_ms);
  timer.unref?.();
}

export function stop_rosetta_generation_upgrade_worker(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}
