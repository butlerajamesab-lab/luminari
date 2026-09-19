import { query_with_diagnostics } from "./db";
import { get_bill, type legiscan_bill_detail } from "./services/legiscan";
import { background_feature_enabled } from "./runtime-role";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 20;
const DEFAULT_SOURCE_FRESHNESS_HOURS = 24;
const MIN_SOURCE_FRESHNESS_HOURS = 1;
const MAX_SOURCE_FRESHNESS_HOURS = 168;
const FAILURE_COOLDOWN_MS = 60 * 60 * 1000;
const OFFICIAL_TERMINAL_FETCH_TIMEOUT_MS = 20_000;
const OFFICIAL_TERMINAL_MAX_BYTES = 2 * 1024 * 1024;

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

type official_terminal_source = {
  source_url: string;
  source_artifact_id: string;
  provider_document_type: string;
  provider_date: string | null;
  description: string;
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
  return background_feature_enabled(
    "CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED",
  );
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


function integer_field(record: Record<string, unknown> | null, key: string): number | null {
  const value = Number(record?.[key]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function text_field(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function south_carolina_official_terminal_url(
  candidate: final_source_reconciliation_candidate,
  bill: legiscan_bill_detail,
): string | null {
  if (candidate.state_code !== "SC") return null;
  const bill_record = as_record(bill);
  const session = as_record(bill_record?.session);
  const session_name = text_field(session, "session_name");
  const year_start = integer_field(session, "year_start");
  const year_end = integer_field(session, "year_end");
  const bill_number = String(candidate.source_bill_number ?? "").trim().toUpperCase();
  const assembly = session_name?.match(/^(\d+)(?:ST|ND|RD|TH) GENERAL ASSEMBLY$/i)?.[1];
  const numeric_bill = bill_number.match(/^[SH]0*(\d+)$/)?.[1];
  if (!assembly || !numeric_bill || !year_start || !year_end) return null;
  return `https://www.scstatehouse.gov/sess${assembly}_${year_start}-${year_end}/bills/${Number(numeric_bill)}.htm`;
}

export function parse_south_carolina_terminal_act(
  html: string,
  source_bill_number: string | null,
): { artifact_id: string; act_number: number; ratification_number: number } | null {
  const bill_number = String(source_bill_number ?? "").trim().toUpperCase();
  const bill_match = bill_number.match(/^([SH])0*(\d+)$/);
  if (!bill_match) return null;
  const chamber = bill_match[1];
  const numeric_bill = Number(bill_match[2]);
  const identity = html.match(/A\s*(\d+)\s*,\s*R\s*(\d+)\s*,\s*([SH])\s*0*(\d+)/i);
  if (!identity) return null;
  const act_number = Number(identity[1]);
  const ratification_number = Number(identity[2]);
  const observed_chamber = identity[3].toUpperCase();
  const observed_bill = Number(identity[4]);
  if (
    !Number.isSafeInteger(act_number) || act_number <= 0
    || !Number.isSafeInteger(ratification_number) || ratification_number <= 0
    || observed_chamber !== chamber
    || observed_bill !== numeric_bill
    || !/\bAN\s+ACT\b/i.test(html)
    || !/\bSECTION\s+1\b/i.test(html)
  ) return null;
  return {
    artifact_id: `sc-a${act_number}-r${ratification_number}-${chamber.toLowerCase()}${numeric_bill}`,
    act_number,
    ratification_number,
  };
}

async function fetch_verified_south_carolina_terminal_source(
  candidate: final_source_reconciliation_candidate,
  bill: legiscan_bill_detail,
): Promise<official_terminal_source | null> {
  const source_url = south_carolina_official_terminal_url(candidate, bill);
  if (!source_url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICIAL_TERMINAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source_url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html,*/*;q=0.1" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const content_length = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(content_length) && content_length > OFFICIAL_TERMINAL_MAX_BYTES) {
      throw new Error("official_terminal_source_exceeds_max_bytes");
    }
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > OFFICIAL_TERMINAL_MAX_BYTES) {
      throw new Error("official_terminal_source_exceeds_max_bytes");
    }
    const terminal = parse_south_carolina_terminal_act(html, candidate.source_bill_number);
    if (!terminal) return null;

    const bill_record = as_record(bill);
    const provider_date = text_field(bill_record, "status_date");
    return {
      source_url,
      source_artifact_id: terminal.artifact_id,
      provider_document_type: `Official Act ${terminal.act_number}`,
      provider_date: provider_date && /^\d{4}-\d{2}-\d{2}$/.test(provider_date)
        ? provider_date
        : null,
      description:
        `Verified South Carolina Act ${terminal.act_number} / Ratification ${terminal.ratification_number}; official terminal source supplement after provider text chain remained non-terminal.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function discover_official_terminal_source(
  candidate: final_source_reconciliation_candidate,
  bill: legiscan_bill_detail,
): Promise<official_terminal_source | null> {
  if (candidate.state_code === "SC") {
    return fetch_verified_south_carolina_terminal_source(candidate, bill);
  }
  return null;
}

async function register_official_terminal_source(
  candidate: final_source_reconciliation_candidate,
  source: official_terminal_source,
): Promise<void> {
  await query_with_diagnostics(
    `select public.register_docket_official_terminal_source_v1(
       $1::integer,
       $2::text,
       $3::text,
       $4::text,
       $5::date,
       $6::text,
       now(),
       true
     ) as receipt`,
    [
      candidate.source_bill_id,
      source.source_url,
      source.source_artifact_id,
      source.provider_document_type,
      source.provider_date,
      source.description,
    ],
    {
      label: "civic_genome_official_terminal_source_register",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
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

async function register_refreshed_provider_spine(source_bill_id: number): Promise<void> {
  await query_with_diagnostics(
    `select public.register_docket_legislative_version_spine(
       $1::integer,
       false
     ) as receipt`,
    [source_bill_id],
    {
      label: "civic_genome_final_source_register_refreshed_provider_spine",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
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
  await register_refreshed_provider_spine(candidate.source_bill_id);
  const refreshed = await read_result(candidate);
  if (refreshed.final_version_present) return refreshed;

  const official_terminal = await discover_official_terminal_source(candidate, bill);
  if (!official_terminal) return refreshed;
  await register_official_terminal_source(candidate, official_terminal);
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
