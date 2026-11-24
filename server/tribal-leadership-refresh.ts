import { createHash } from "node:crypto";
import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";

/**
 * Weekly pull of the BIA Tribal Leaders Directory into
 * public.tribal_leadership_snapshot_v1. Each pull is its own dated snapshot;
 * rows are only ever added (on conflict do nothing), so who held office
 * before stays on record. public.tribal_leaders is not touched.
 *
 * Off unless TRIBAL_LEADERSHIP_REFRESH_ENABLED is exactly "true" on a worker.
 */
export const TRIBAL_LEADERSHIP_SERVICE_URL =
  "https://services1.arcgis.com/UxqqIfhng71wUT9x/arcgis/rest/services/TribalLeadership_Directory/FeatureServer/0/query"
  + "?where=1%3D1&outFields=*&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount=2000&f=json";
export const TRIBAL_LEADERSHIP_SOURCE =
  "BIA Tribal Leaders Directory (bia.gov), live ArcGIS service";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REFRESH_AFTER_DAYS = 7;
const MIN_NATIONS = 500;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const FETCH_DEADLINE_MS = 60_000;
const NAME_FIELDS = ["salutation", "firstname", "middlename", "lastname", "suffix"] as const;

export const TRIBAL_LEADERSHIP_LATEST_SQL = `
  select max(captured_date) as latest from public.tribal_leadership_snapshot_v1
`;

export const TRIBAL_LEADERSHIP_INSERT_SQL = `
  insert into public.tribal_leadership_snapshot_v1 (
    snapshot_id, tribe_full_name, bia_global_id, leader_full_name, title,
    date_elected, next_election, record, source, source_file_sha256, captured_date
  )
  select $1, r->>'tribe_full_name', r->>'bia_global_id', r->>'leader_full_name',
         r->>'title', r->>'date_elected', r->>'next_election', r->'record',
         $2, $3, $4
  from jsonb_array_elements($5::jsonb) as r
  on conflict (snapshot_id, tribe_full_name) do nothing
  returning tribe_full_name
`;

export type tribal_leadership_row = {
  tribe_full_name: string;
  bia_global_id: string | null;
  leader_full_name: string | null;
  title: string | null;
  date_elected: string | null;
  next_election: string | null;
  record: Record<string, unknown>;
};

function text_or_null(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Validate an ArcGIS query response and shape one row per nation. Throws
 * rather than writing a partial or doubtful pull.
 */
export function parse_tribal_leadership_response(
  body: unknown,
  min_nations: number = MIN_NATIONS,
): tribal_leadership_row[] {
  const payload = body as { error?: unknown; exceededTransferLimit?: boolean; features?: unknown };
  if (payload?.error) throw new Error("tribal_leadership_service_error");
  if (payload?.exceededTransferLimit) throw new Error("tribal_leadership_truncated");
  if (!Array.isArray(payload?.features)) throw new Error("tribal_leadership_no_features");

  const seen = new Set<string>();
  const rows: tribal_leadership_row[] = [];
  for (const feature of payload.features as { attributes?: Record<string, unknown> }[]) {
    const record = feature?.attributes;
    const tribe = text_or_null(record?.tribefullname);
    if (!record || !tribe) throw new Error("tribal_leadership_missing_tribe_name");
    if (seen.has(tribe)) throw new Error("tribal_leadership_duplicate_tribe_name");
    seen.add(tribe);
    const name = NAME_FIELDS.map(field => text_or_null(record[field])).filter(Boolean).join(" ");
    rows.push({
      tribe_full_name: tribe,
      bia_global_id: text_or_null(record.GlobalID),
      leader_full_name: name === "" ? null : name,
      title: text_or_null(record.jobtitle),
      date_elected: text_or_null(record.dateelected),
      next_election: text_or_null(record.nextelection),
      record,
    });
  }
  if (rows.length < min_nations) throw new Error("tribal_leadership_too_few_nations");
  return rows;
}

export function tribal_leadership_refresh_due(latest: string | null, today: string): boolean {
  if (!latest) return true;
  const age_ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest.slice(0, 10)}T00:00:00Z`);
  return !Number.isFinite(age_ms) || age_ms >= REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

function enabled(): boolean {
  return background_feature_enabled("TRIBAL_LEADERSHIP_REFRESH_ENABLED");
}

function safe_error_code(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : "unknown";
}

export async function run_tribal_leadership_refresh_once(
  today: string = new Date().toISOString().slice(0, 10),
  signal?: AbortSignal,
): Promise<number> {
  const latest = await query_with_diagnostics<{ latest: string | null }>(
    TRIBAL_LEADERSHIP_LATEST_SQL, [], { label: "tribal_leadership_latest", query_timeout_ms: 5_000 },
  );
  if (!tribal_leadership_refresh_due(latest.rows[0]?.latest ?? null, today)) return 0;

  // One deadline covers the request and the body; shutdown aborts it too.
  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const fetch_signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await fetch(TRIBAL_LEADERSHIP_SERVICE_URL, {
    method: "GET",
    redirect: "follow",
    signal: fetch_signal,
  });
  if (!response.ok) throw new Error(`tribal_leadership_fetch_failed:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES) throw new Error("tribal_leadership_bad_size");
  const rows = parse_tribal_leadership_response(JSON.parse(bytes.toString("utf8")));
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const inserted = await query_with_diagnostics<{ tribe_full_name: string }>(
    TRIBAL_LEADERSHIP_INSERT_SQL,
    [`bia_tld_${today}`, TRIBAL_LEADERSHIP_SOURCE, sha256, today, JSON.stringify(rows)],
    { label: "tribal_leadership_insert", query_timeout_ms: 30_000 },
  );
  console.log("[TribalLeadershipRefresh] snapshot_written", {
    snapshot_id: `bia_tld_${today}`,
    nations: rows.length,
    inserted: inserted.rows.length,
    sha256,
  });
  return inserted.rows.length;
}

let timer: NodeJS.Timeout | null = null;
let active: Promise<unknown> | null = null;
let shutdown_controller = new AbortController();

function run_guarded(): void {
  if (active) return;
  active = run_tribal_leadership_refresh_once(undefined, shutdown_controller.signal)
    .catch(error => console.error("[TribalLeadershipRefresh] failed", { error_code: safe_error_code(error) }))
    .finally(() => { active = null; });
}

export function start_tribal_leadership_refresh(): void {
  if (timer || !enabled()) return;
  shutdown_controller = new AbortController();
  console.log("[TribalLeadershipRefresh] started", { check_interval_ms: CHECK_INTERVAL_MS });
  run_guarded();
  timer = setInterval(run_guarded, CHECK_INTERVAL_MS);
  timer.unref?.();
}

export async function stop_tribal_leadership_refresh(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  shutdown_controller.abort();
  await active;
}
