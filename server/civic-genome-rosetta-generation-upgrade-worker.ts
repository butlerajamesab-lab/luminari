import { randomUUID } from "node:crypto";

import { getPool } from "./db";
import { assemble_rosetta_and_resolve_family } from "./civic-genome-rosetta-family-orchestration";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

const POLL_MS = 2_000;
const DISCOVERY_MS = 30_000;
const CLAIM_LIMIT = 4;
const MAX_ATTEMPTS = 8;

export type rosetta_current_generation = {
  contract: string;
  engine_version: string;
  rule_set_version: string;
  rule_manifest_hash: string;
};

type upgrade_row = {
  upgrade_id: string;
  genome_bill_id: string;
  source_document_id: number;
  source_identity_hash: string;
  target_engine_version: string;
  target_rule_set_version: string;
  target_rule_manifest_hash: string | null;
  attempt_count: number;
};

type replay_receipt = {
  extraction_run_id?: number | string;
  run_status?: string;
  admissibility_state?: string;
  engine_version?: string;
  rule_set_version?: string;
  rule_manifest_hash?: string;
  failure_code?: string | null;
};

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function as_record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function required_text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`rosetta_current_generation_${key}_invalid`);
  }
  return value.trim();
}

async function rosetta_rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base_url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: create_rosetta_supabase_headers(service_role_key, {
      accept: "application/json",
      "content-type": "application/json",
    }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const preview = (await response.text()).slice(0, 1_000);
    throw new Error(`rosetta_rpc_failed:${name}:${response.status}:${preview}`);
  }
  return response.json();
}

export async function get_current_rosetta_generation(): Promise<rosetta_current_generation> {
  const payload = await rosetta_rpc("rosetta_current_generation_v1", {});
  const record = as_record(payload);
  if (!record) throw new Error("rosetta_current_generation_invalid");
  return {
    contract: required_text(record, "contract"),
    engine_version: required_text(record, "engine_version"),
    rule_set_version: required_text(record, "rule_set_version"),
    rule_manifest_hash: required_text(record, "rule_manifest_hash"),
  };
}

export function binding_requires_upgrade(
  binding: { rosetta_engine_version?: string | null; rosetta_rule_set_version?: string | null },
  current: rosetta_current_generation,
): boolean {
  return binding.rosetta_engine_version !== current.engine_version
    || binding.rosetta_rule_set_version !== current.rule_set_version;
}

async function discover_upgrades(current: rosetta_current_generation): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
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
        where version.rosetta_source_document_id is not null
     ), current_versions as (
       select * from ranked where rn = 1
     ), stale as (
       select current_versions.genome_bill_id,
              current_versions.rosetta_source_document_id as source_document_id,
              binding.source_identity_hash
         from current_versions
         join public.civic_genome_rosetta_source_binding binding
           on binding.source_document_id = current_versions.rosetta_source_document_id
        where binding.source_identity_hash is not null
          and (
            binding.rosetta_engine_version is distinct from $1
            or binding.rosetta_rule_set_version is distinct from $2
          )
     )
     insert into public.civic_genome_rosetta_generation_upgrade_queue (
       genome_bill_id, source_document_id, source_identity_hash,
       target_engine_version, target_rule_set_version, target_rule_manifest_hash,
       queue_state, next_attempt_at, updated_at
     )
     select stale.genome_bill_id, stale.source_document_id, stale.source_identity_hash,
            $1, $2, $3, 'eligible', now(), now()
       from stale
     on conflict (source_document_id, target_engine_version, target_rule_set_version)
     do update set
       genome_bill_id = excluded.genome_bill_id,
       target_rule_manifest_hash = excluded.target_rule_manifest_hash,
       queue_state = case
         when public.civic_genome_rosetta_generation_upgrade_queue.source_identity_hash = excluded.source_identity_hash
          and public.civic_genome_rosetta_generation_upgrade_queue.queue_state = 'completed'
           then 'completed'
         else 'eligible'
       end,
       source_identity_hash = excluded.source_identity_hash,
       next_attempt_at = case
         when public.civic_genome_rosetta_generation_upgrade_queue.source_identity_hash = excluded.source_identity_hash
          and public.civic_genome_rosetta_generation_upgrade_queue.queue_state = 'completed'
           then public.civic_genome_rosetta_generation_upgrade_queue.next_attempt_at
         else now()
       end,
       locked_at = null,
       locked_by = null,
       extraction_run_id = case
         when public.civic_genome_rosetta_generation_upgrade_queue.source_identity_hash = excluded.source_identity_hash
          and public.civic_genome_rosetta_generation_upgrade_queue.queue_state = 'completed'
           then public.civic_genome_rosetta_generation_upgrade_queue.extraction_run_id
         else null
       end,
       assembly_run_id = case
         when public.civic_genome_rosetta_generation_upgrade_queue.source_identity_hash = excluded.source_identity_hash
          and public.civic_genome_rosetta_generation_upgrade_queue.queue_state = 'completed'
           then public.civic_genome_rosetta_generation_upgrade_queue.assembly_run_id
         else null
       end,
       completed_at = case
         when public.civic_genome_rosetta_generation_upgrade_queue.source_identity_hash = excluded.source_identity_hash
          and public.civic_genome_rosetta_generation_upgrade_queue.queue_state = 'completed'
           then public.civic_genome_rosetta_generation_upgrade_queue.completed_at
         else null
       end,
       last_error_code = null,
       last_error_detail = null,
       updated_at = now()`,
    [current.engine_version, current.rule_set_version, current.rule_manifest_hash],
  );
  return rowCount ?? 0;
}

async function claim_upgrades(worker_id: string): Promise<upgrade_row[]> {
  const pool = getPool();
  const { rows } = await pool.query<upgrade_row>(
    `with candidate as (
       select upgrade_id
         from public.civic_genome_rosetta_generation_upgrade_queue
        where queue_state in ('eligible','retry')
          and next_attempt_at <= now()
        order by next_attempt_at, created_at, upgrade_id
        for update skip locked
        limit $1
     )
     update public.civic_genome_rosetta_generation_upgrade_queue queue
        set queue_state = 'running',
            locked_at = now(),
            locked_by = $2,
            attempt_count = queue.attempt_count + 1,
            updated_at = now()
       from candidate
      where queue.upgrade_id = candidate.upgrade_id
      returning queue.upgrade_id::text,
                queue.genome_bill_id::text,
                queue.source_document_id::bigint,
                queue.source_identity_hash,
                queue.target_engine_version,
                queue.target_rule_set_version,
                queue.target_rule_manifest_hash,
                queue.attempt_count`,
    [CLAIM_LIMIT, worker_id],
  );
  return rows.map(row => ({ ...row, source_document_id: Number(row.source_document_id) }));
}

async function replay_current_generation(row: upgrade_row): Promise<replay_receipt> {
  const payload = await rosetta_rpc("rosetta_replay_source_identity_current_v1", {
    p_source_document_id: row.source_document_id,
    p_source_identity_hash: row.source_identity_hash,
  });
  const record = as_record(payload);
  if (!record) throw new Error("rosetta_generation_replay_receipt_invalid");
  return record as replay_receipt;
}

function required_extraction_run_id(receipt: replay_receipt): number {
  const run_id = Number(receipt.extraction_run_id);
  if (!Number.isSafeInteger(run_id) || run_id <= 0) {
    throw new Error("rosetta_generation_replay_run_id_invalid");
  }
  return run_id;
}

function assert_replay_accepted(row: upgrade_row, receipt: replay_receipt): void {
  if (receipt.engine_version !== row.target_engine_version) {
    throw new Error("rosetta_generation_replay_engine_mismatch");
  }
  if (receipt.rule_set_version !== row.target_rule_set_version) {
    throw new Error("rosetta_generation_replay_rule_set_mismatch");
  }
  if (row.target_rule_manifest_hash && receipt.rule_manifest_hash !== row.target_rule_manifest_hash) {
    throw new Error("rosetta_generation_replay_manifest_mismatch");
  }
  if (receipt.run_status !== "completed" || receipt.admissibility_state !== "admissible") {
    throw new Error(
      `rosetta_generation_replay_not_admissible:${receipt.run_status ?? "unknown"}:${receipt.admissibility_state ?? "unknown"}:${receipt.failure_code ?? "none"}`,
    );
  }
}

async function mark_completed(
  row: upgrade_row,
  extraction_run_id: number,
  assembly_run_id: string,
): Promise<void> {
  await getPool().query(
    `update public.civic_genome_rosetta_generation_upgrade_queue
        set queue_state = 'completed',
            extraction_run_id = $2,
            assembly_run_id = $3,
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            last_error_code = null,
            last_error_detail = null,
            updated_at = now()
      where upgrade_id = $1`,
    [row.upgrade_id, extraction_run_id, assembly_run_id],
  );
}

function error_code(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].slice(0, 120) || "rosetta_generation_upgrade_failed";
}

async function mark_failed(row: upgrade_row, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const terminal = row.attempt_count >= MAX_ATTEMPTS;
  const delay_ms = Math.min(60_000 * 2 ** Math.max(0, row.attempt_count - 1), 60 * 60_000);
  await getPool().query(
    `update public.civic_genome_rosetta_generation_upgrade_queue
        set queue_state = $2,
            next_attempt_at = case when $2 = 'retry' then now() + ($3::bigint * interval '1 millisecond') else next_attempt_at end,
            locked_at = null,
            locked_by = null,
            last_error_code = $4,
            last_error_detail = $5,
            updated_at = now()
      where upgrade_id = $1`,
    [row.upgrade_id, terminal ? "dead_letter" : "retry", delay_ms, error_code(error), message.slice(0, 2_000)],
  );
}

async function process_upgrade(row: upgrade_row): Promise<void> {
  try {
    const receipt = await replay_current_generation(row);
    assert_replay_accepted(row, receipt);
    const extraction_run_id = required_extraction_run_id(receipt);
    const assembly = await assemble_rosetta_and_resolve_family({
      genome_bill_id: row.genome_bill_id,
      source_document_id: row.source_document_id,
      extraction_run_id,
    });
    await mark_completed(row, extraction_run_id, assembly.assembly_run_id);
    console.log("[RosettaGenerationUpgrade] completed", {
      upgrade_id: row.upgrade_id,
      source_document_id: row.source_document_id,
      extraction_run_id,
      assembly_run_id: assembly.assembly_run_id,
    });
  } catch (error) {
    await mark_failed(row, error);
    console.error("[RosettaGenerationUpgrade] failed", {
      upgrade_id: row.upgrade_id,
      source_document_id: row.source_document_id,
      attempt_count: row.attempt_count,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const global_worker = globalThis as typeof globalThis & {
  __civic_genome_rosetta_generation_upgrade_worker_started?: boolean;
};

export function start_civic_genome_rosetta_generation_upgrade_worker(): void {
  if (global_worker.__civic_genome_rosetta_generation_upgrade_worker_started) return;
  global_worker.__civic_genome_rosetta_generation_upgrade_worker_started = true;

  const worker_id = `rosetta-generation-upgrade:${process.pid}:${randomUUID()}`;
  let running = false;
  let last_discovery = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      if (now - last_discovery >= DISCOVERY_MS) {
        const current = await get_current_rosetta_generation();
        const discovered = await discover_upgrades(current);
        if (discovered > 0) {
          console.log("[RosettaGenerationUpgrade] discovery", {
            discovered,
            engine_version: current.engine_version,
            rule_set_version: current.rule_set_version,
          });
        }
        last_discovery = now;
      }

      const rows = await claim_upgrades(worker_id);
      await Promise.all(rows.map(process_upgrade));
    } catch (error) {
      console.error("[RosettaGenerationUpgrade] worker tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), POLL_MS);
  timer.unref?.();
}
