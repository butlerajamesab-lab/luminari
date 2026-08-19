import { query_with_diagnostics } from "./db";
import { get_bill, type legiscan_bill_detail } from "./services/legiscan";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 20;
const DEFAULT_SOURCE_FRESHNESS_HOURS = 24;
const MIN_SOURCE_FRESHNESS_HOURS = 1;
const MAX_SOURCE_FRESHNESS_HOURS = 168;
const FAILURE_COOLDOWN_MS = 60 * 60 * 1000;

export type final_source_reconciliation_candidate = {
  genome_bill_id: string;
  source_bill_id: number;
  state_code: string;
  session_key: string;
  source_bill_number: string | null;
  detail_fetched_at: string | Date | null;
};

export type final_source_reconciliation_result = {
  source_bill_id: number;
  genome_bill_id: string;
  final_version_present: boolean;
  text_version_count: number;
};

let timer: NodeJS.Timeout | null = null;
let cycle_running = false;
let stopped = false;
const failure_cooldown_until = new Map<number, number>();

function bounded_integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function worker_enabled(): boolean {
  const configured = process.env.CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function poll_interval_ms(): number {
  return bounded_integer(
    process.env.CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
  );
}

function batch_size(): number {
  return bounded_integer(
    process.env.CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
}

function source_freshness_hours(): number {
  return bounded_integer(
    process.env.CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_FRESHNESS_HOURS,
    DEFAULT_SOURCE_FRESHNESS_HOURS,
    MIN_SOURCE_FRESHNESS_HOURS,
    MAX_SOURCE_FRESHNESS_HOURS,
  );
}

function as_record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : "unknown_final_source_reconciliation_failure";
  return raw
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 500) || "unknown_final_source_reconciliation_failure";
}

async function list_candidates(limit: number): Promise<final_source_reconciliation_candidate[]> {
  const freshness_hours = source_freshness_hours();
  const result = await query_with_diagnostics<final_source_reconciliation_candidate>(
    `select distinct on (source_bill_id)
            bill.genome_bill_id::text as genome_bill_id,
            (bill.structural_dna_json ->> 'source_bill_id')::integer as source_bill_id,
            bill.state_code,
            bill.session_key,
            bill.source_bill_number,
            detail.fetched_at as detail_fetched_at
       from public.civic_genome_bill bill
       join public.docket_bill_state_cache state_cache
         on state_cache.state = bill.state_code
        and state_cache.session_id::text = bill.session_key
       left join public.docket_bill_detail_cache detail
         on detail.bill_id = (bill.structural_dna_json ->> 'source_bill_id')::integer
      where bill.current_state_position = 'enacted'
        and bill.structural_dna_json ? 'source_bill_id'
        and (bill.structural_dna_json ->> 'source_bill_id') ~ '^[0-9]+$'
        and not exists (
          select 1
            from public.civic_genome_bill_version version
           where version.genome_bill_id = bill.genome_bill_id
             and version.document_family = 'text'
             and lower(version.version_type) in ('enrolled', 'chaptered')
        )
        and (
          detail.fetched_at is null
          or detail.fetched_at < now() - make_interval(hours => $1::integer)
        )
      order by source_bill_id,
               detail.fetched_at asc nulls first,
               bill.last_action_at desc nulls last,
               bill.genome_bill_id
      limit $2::integer`,
    [freshness_hours, limit],
    {
      label: "civic_genome_final_source_reconciliation_candidates",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

async function cache_bill_detail(
  source_bill_id: number,
  bill: legiscan_bill_detail,
): Promise<void> {
  if (!as_record(bill)) {
    throw new Error("civic_genome_final_source_reconciliation_invalid_bill_detail");
  }

  await query_with_diagnostics(
    `insert into public.docket_bill_detail_cache (
       bill_id,
       bill,
       fetched_at,
       source,
       created_at,
       updated_at
     ) values (
       $1,
       $2::jsonb,
       now(),
       'legiscan_get_bill_final_source_reconciliation',
       now(),
       now()
     )
     on conflict (bill_id) do update
       set bill = excluded.bill,
           fetched_at = excluded.fetched_at,
           source = excluded.source,
           updated_at = now()`,
    [source_bill_id, JSON.stringify(bill)],
    {
      label: "civic_genome_final_source_reconciliation_cache_detail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 30_000,
    },
  );
}

async function read_result(
  candidate: final_source_reconciliation_candidate,
): Promise<final_source_reconciliation_result> {
  const result = await query_with_diagnostics<{
    final_version_present: boolean;
    text_version_count: number;
  }>(
    `select exists (
              select 1
                from public.civic_genome_bill_version version
               where version.genome_bill_id = $1::uuid
                 and version.document_family = 'text'
                 and lower(version.version_type) in ('enrolled', 'chaptered')
            ) as final_version_present,
            count(*) filter (where version.document_family = 'text')::integer as text_version_count
       from public.civic_genome_bill_version version
      where version.genome_bill_id = $1::uuid`,
    [candidate.genome_bill_id],
    {
      label: "civic_genome_final_source_reconciliation_result",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  return {
    source_bill_id: candidate.source_bill_id,
    genome_bill_id: candidate.genome_bill_id,
    final_version_present: result.rows[0]?.final_version_present === true,
    text_version_count: Number(result.rows[0]?.text_version_count ?? 0),
  };
}

export async function reconcile_civic_genome_final_source_candidate(
  candidate: final_source_reconciliation_candidate,
): Promise<final_source_reconciliation_result> {
  const bill = await get_bill(candidate.source_bill_id);
  await cache_bill_detail(candidate.source_bill_id, bill);
  return read_result(candidate);
}

export async function run_civic_genome_final_source_reconciliation_cycle(): Promise<void> {
  if (cycle_running || stopped || !worker_enabled()) return;
  cycle_running = true;

  try {
    const now = Date.now();
    const candidates = (await list_candidates(batch_size() * 3))
      .filter(candidate => (failure_cooldown_until.get(candidate.source_bill_id) ?? 0) <= now)
      .slice(0, batch_size());

    if (candidates.length === 0) return;

    await Promise.all(candidates.map(async candidate => {
      try {
        const result = await reconcile_civic_genome_final_source_candidate(candidate);
        failure_cooldown_until.delete(candidate.source_bill_id);
        console.log("[CivicGenomeFinalSource] checked", {
          source_bill_id: result.source_bill_id,
          genome_bill_id: result.genome_bill_id,
          state: candidate.state_code,
          session_key: candidate.session_key,
          bill_number: candidate.source_bill_number,
          final_version_present: result.final_version_present,
          text_version_count: result.text_version_count,
          outcome: result.final_version_present
            ? "final_source_registered"
            : "official_final_source_not_yet_available",
        });
      } catch (error) {
        failure_cooldown_until.set(candidate.source_bill_id, Date.now() + FAILURE_COOLDOWN_MS);
        console.error("[CivicGenomeFinalSource] check_failed", {
          source_bill_id: candidate.source_bill_id,
          genome_bill_id: candidate.genome_bill_id,
          state: candidate.state_code,
          session_key: candidate.session_key,
          bill_number: candidate.source_bill_number,
          retry_after_minutes: FAILURE_COOLDOWN_MS / 60_000,
          error_code: safe_error_code(error),
        });
      }
    }));
  } catch (error) {
    console.error("[CivicGenomeFinalSource] cycle_failed", {
      error_code: safe_error_code(error),
    });
  } finally {
    cycle_running = false;
  }
}

export function start_civic_genome_final_source_reconciliation_worker(): void {
  if (timer || !worker_enabled()) return;
  stopped = false;
  const interval_ms = poll_interval_ms();
  console.log("[CivicGenomeFinalSource] started", {
    interval_ms,
    batch_size: batch_size(),
    source_freshness_hours: source_freshness_hours(),
    scope: "current_session_enacted_without_enrolled_or_chaptered_source",
  });

  void run_civic_genome_final_source_reconciliation_cycle();
  timer = setInterval(() => {
    void run_civic_genome_final_source_reconciliation_cycle();
  }, interval_ms);
  timer.unref?.();
}

export function stop_civic_genome_final_source_reconciliation_worker(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}
