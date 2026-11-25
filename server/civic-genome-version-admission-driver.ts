import { create_idle_backoff, type idle_backoff } from "./_core/idle-backoff";
import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

/**
 * Engine-neutral Genome version admission driver.
 *
 * The legacy automatic decomposition conveyor is permanently retired and this
 * module is not a revival of it: no fallback classification, no backlog
 * replay, no source-provider pulls, no trait assembly, no version repair.
 * This driver does one bounded thing — it registers legislative versions for
 * Genome bills whose source detail is already landed, through the governed
 * registration door, enqueueing them for the current-result pipeline.
 *
 * Admission is checked every cycle against the generation target that is
 * both selected in Rosetta and admitted into the Genome target table. The
 * driver binds on the fields both sides agree on (rule set version, rule
 * manifest hash, promotion instant) and names no generation anywhere: when
 * the selected generation changes, this driver follows the admitted target
 * or stands down. Any doubt — no admitted target, live target unreadable,
 * any identity flag false, any field in disagreement — stands the cycle
 * down with no writes. Unknown holds; proven continues.
 *
 * Bills are selected only when none of their versions holds a queue row, so
 * the driver never alters existing queue state; the governed door creates
 * registrations and queue rows, idempotently, and never resurrects
 * completed or permanently failed queue rows.
 *
 * Selection also requires the bill's latest landed detail to hold at least
 * one usable document (the same usability test the registration door
 * applies), so a bill that can produce no versions never monopolizes the
 * batch window; it re-enters selection if a fresher detail lands. The
 * promotion instant is converted with floor() on the database side to
 * match the truncation the runtime applies when parsing the live side, so
 * identical instants agree at microsecond resolution.
 */

const DEFAULT_POLL_INTERVAL_MS = 45_000;
const MIN_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const DEFAULT_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;
const ROSETTA_TARGET_TIMEOUT_MS = 10_000;
const DOOR_QUERY_TIMEOUT_MS = 30_000;
const HASH = /^[a-f0-9]{64}$/i;

let timer: NodeJS.Timeout | null = null;
let backoff: idle_backoff | null = null;
let running = false;
let stopped = false;

export type admitted_generation_target = {
  rule_set_version: string;
  rule_manifest_hash: string;
  promoted_epoch_ms: number;
};

export type live_generation_target = {
  ruleset_version: unknown;
  ruleset_sha256: unknown;
  selected_at: unknown;
  identity_valid: unknown;
  engine_identity_valid: unknown;
  read_identity_valid: unknown;
};

export type target_agreement =
  | { ok: true }
  | { ok: false; reason: string };

export type admission_cycle_plan =
  | { action: "stand_down"; reason: string }
  | { action: "register" };

export const SELECT_UNREGISTERED_BILLS_SQL = `
  select bill.genome_bill_id,
         (bill.structural_dna_json ->> 'source_bill_id')::int as source_bill_id
    from public.civic_genome_bill bill
    join lateral (
      select cache.bill as detail
        from public.docket_bill_detail_cache cache
       where cache.bill_id = (bill.structural_dna_json ->> 'source_bill_id')::int
       order by cache.fetched_at desc
       limit 1
    ) latest on true
   where bill.structural_dna_json ->> 'source_bill_id' ~ '^[0-9]+$'
     and (
       exists (
         select 1
           from jsonb_array_elements(coalesce(latest.detail -> 'texts', '[]'::jsonb)) doc
          where nullif(doc ->> 'doc_id', '') is not null
            and coalesce(nullif(doc ->> 'state_link', ''), nullif(doc ->> 'url', '')) is not null
       )
       or exists (
         select 1
           from jsonb_array_elements(coalesce(latest.detail -> 'amendments', '[]'::jsonb)) doc
          where nullif(doc ->> 'amendment_id', '') is not null
            and coalesce(nullif(doc ->> 'state_link', ''), nullif(doc ->> 'url', '')) is not null
       )
     )
     and not exists (
       select 1
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
        where version.genome_bill_id = bill.genome_bill_id
     )
     and not exists (
       select 1
         from public.docket_bill_detail_derived_work_v1 work
        where work.source_bill_id = case
          when coalesce(bill.structural_dna_json ->> 'source_bill_id','') ~ '^[0-9]+$'
            then (bill.structural_dna_json ->> 'source_bill_id')::int
          else null
        end
          and work.work_state in ('eligible','leased','degraded')
     )
   order by bill.genome_bill_id
   limit $1::int`;

export const REGISTER_VERSION_SPINE_SQL =
  "select public.register_docket_legislative_version_spine($1::int, true) as receipt";

function epoch_ms(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function validate_target_agreement(
  admitted: admitted_generation_target,
  live: live_generation_target,
): target_agreement {
  if (live.identity_valid !== true) {
    return { ok: false, reason: "live_identity_invalid" };
  }
  if (live.engine_identity_valid !== true) {
    return { ok: false, reason: "live_engine_identity_invalid" };
  }
  if (live.read_identity_valid !== true) {
    return { ok: false, reason: "live_read_identity_invalid" };
  }
  if (typeof live.ruleset_version !== "string" || !live.ruleset_version.trim()) {
    return { ok: false, reason: "live_ruleset_version_missing" };
  }
  if (live.ruleset_version !== admitted.rule_set_version) {
    return { ok: false, reason: "ruleset_version_mismatch" };
  }
  if (typeof live.ruleset_sha256 !== "string" || !HASH.test(live.ruleset_sha256)) {
    return { ok: false, reason: "live_ruleset_sha256_invalid" };
  }
  if (live.ruleset_sha256.toLowerCase() !== admitted.rule_manifest_hash.toLowerCase()) {
    return { ok: false, reason: "ruleset_sha256_mismatch" };
  }
  const live_selected = epoch_ms(live.selected_at);
  if (live_selected === null) {
    return { ok: false, reason: "live_selected_at_invalid" };
  }
  if (live_selected !== admitted.promoted_epoch_ms) {
    return { ok: false, reason: "promoted_at_mismatch" };
  }
  return { ok: true };
}

export function plan_admission_cycle(
  admitted: admitted_generation_target | null,
  live: live_generation_target | null,
): admission_cycle_plan {
  if (!admitted) return { action: "stand_down", reason: "no_admitted_target" };
  if (!live) return { action: "stand_down", reason: "live_target_unreadable" };
  const agreement = validate_target_agreement(admitted, live);
  if (!agreement.ok) return { action: "stand_down", reason: agreement.reason };
  return { action: "register" };
}

function enabled(): boolean {
  return background_feature_enabled("GENOME_VERSION_ADMISSION_ENABLED");
}

function bounded_batch_size(): number {
  const raw = Number(process.env.GENOME_VERSION_ADMISSION_BATCH_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.trunc(raw)));
}

function bounded_poll_interval_ms(): number {
  const raw = Number(process.env.GENOME_VERSION_ADMISSION_POLL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw)));
}

function required_environment(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`genome_version_admission_env_missing:${name}`);
  }
  return value;
}

function error_code(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const prefix = typeof code === "string" ? `${code}:` : "";
    return `${prefix}${error.message}`.slice(0, 200);
  }
  return "unknown";
}

function is_prerequisite_skip(error: unknown): boolean {
  const text = error_code(error);
  return (
    text.includes("P0002")
    || text.includes("docket_bill_detail_cache_not_found")
    || text.includes("civic_genome_bill_not_found")
  );
}

export async function read_admitted_target(): Promise<admitted_generation_target | null> {
  const { rows } = await query_with_diagnostics<{
    rule_set_version: string;
    rule_manifest_hash: string;
    promoted_epoch_ms: number | string;
  }>(
    `select rule_set_version,
            rule_manifest_hash,
            floor(extract(epoch from promoted_at) * 1000)::bigint as promoted_epoch_ms
       from public.civic_genome_rosetta_generation_target
      where target_name = 'current'`,
    [],
    {
      label: "genome_version_admission_read_target",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    rule_set_version: row.rule_set_version,
    rule_manifest_hash: row.rule_manifest_hash,
    promoted_epoch_ms: Number(row.promoted_epoch_ms),
  };
}

let last_live_target_error: string | null = null;

export async function read_live_target(): Promise<live_generation_target | null> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL").replace(/\/$/, "");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key);
  headers.set("accept", "application/json");
  // The runtime schema is not exposed through PostgREST. The live target is
  // read through the public service-role-only door
  // public.rosetta_current_target_v1(), which delegates to the runtime
  // registry's current-target read.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_TARGET_TIMEOUT_MS);
  try {
    const response = await fetch(`${base_url}/rest/v1/rpc/rosetta_current_target_v1`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      last_live_target_error = `http_${response.status}:${body.slice(0, 200)}`;
      return null;
    }
    const payload: unknown = await response.json();
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      last_live_target_error = "unexpected_payload_shape";
      return null;
    }
    last_live_target_error = null;
    return row as live_generation_target;
  } catch (error) {
    last_live_target_error = `fetch_error:${error instanceof Error ? error.message : String(error)}`;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function run_admission_cycle(): Promise<void> {
  if (running || stopped) return;
  running = true;
  let did_work = false;
  try {
    const admitted = await read_admitted_target().catch(() => null);
    const live = admitted ? await read_live_target().catch(() => null) : null;
    const plan = plan_admission_cycle(admitted, live);
    if (plan.action === "stand_down") {
      console.log("[GenomeVersionAdmission] stood_down", {
        reason: plan.reason,
        ...(plan.reason === "live_target_unreadable"
          ? { detail: last_live_target_error }
          : {}),
      });
      return;
    }
    const { rows } = await query_with_diagnostics<{
      genome_bill_id: string;
      source_bill_id: number;
    }>(SELECT_UNREGISTERED_BILLS_SQL, [bounded_batch_size()], {
      label: "genome_version_admission_select",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    });
    let registered_bills = 0;
    let registered_documents = 0;
    let enqueued = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (stopped) break;
      try {
        const { rows: receipt_rows } = await query_with_diagnostics<{
          receipt: {
            registered_document_count?: number;
            queued_or_refreshed_count?: number;
          } | null;
        }>(REGISTER_VERSION_SPINE_SQL, [row.source_bill_id], {
          label: "genome_version_admission_register",
          pool_acquire_timeout_ms: 1_000,
          query_timeout_ms: DOOR_QUERY_TIMEOUT_MS,
        });
        const receipt = receipt_rows[0]?.receipt ?? {};
        registered_bills += 1;
        registered_documents += Number(receipt.registered_document_count ?? 0);
        enqueued += Number(receipt.queued_or_refreshed_count ?? 0);
      } catch (error) {
        if (is_prerequisite_skip(error)) skipped += 1;
        else failed += 1;
      }
    }
    did_work = registered_bills > 0;
    console.log("[GenomeVersionAdmission] cycle", {
      selected: rows.length,
      registered_bills,
      registered_documents,
      enqueued,
      skipped,
      failed,
      rule_set_version: admitted?.rule_set_version ?? null,
    });
  } catch (error) {
    console.error("[GenomeVersionAdmission] cycle_failed", {
      error_code: error_code(error),
    });
  } finally {
    backoff?.record(did_work);
    running = false;
  }
}

export function start_genome_version_admission_driver(): void {
  if (timer || !enabled()) return;
  stopped = false;
  const delay = bounded_poll_interval_ms();
  console.log("[GenomeVersionAdmission] started", {
    interval_ms: delay,
    batch_size: bounded_batch_size(),
  });
  backoff = create_idle_backoff("genome_version_admission", delay);
  void run_admission_cycle();
  timer = setInterval(() => {
    if (backoff?.should_run() === false) return;
    void run_admission_cycle();
  }, delay);
  timer.unref?.();
}

export function stop_genome_version_admission_driver(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}
