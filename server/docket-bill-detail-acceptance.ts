import { createHash } from "node:crypto";
import { query_with_diagnostics } from "./db";
import { docket_bulk_source_event_date } from "./docket-bulk-json-member";
import type { legiscan_bill_detail } from "./services/legiscan";

/** Both HTTP getBill and a validated bulk ZIP member enter through this function. */
export type docket_archive_member_receipt = {
  archive_sha256: string;
  member_path: string;
  member_sha256: string;
  source_observed_at?: string | null;
};

type docket_accept_input = {
  bill_id: number;
  bill: legiscan_bill_detail;
  source: string;
  archive?: docket_archive_member_receipt;
  label?: string;
};

const hash_pattern = /^[a-f0-9]{64}$/i;
const plain_record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function require_sha(value: string, field: string): void {
  if (!hash_pattern.test(value)) throw new Error("docket_bulk_invalid_" + field);
}

export function validate_docket_bill_identity(bill_id: number, bill: unknown, archive = false): asserts bill is legiscan_bill_detail {
  if (!Number.isSafeInteger(bill_id) || bill_id < 1 || !plain_record(bill)) {
    throw new Error("docket_bill_invalid_identity");
  }
  if (Number(bill.bill_id) !== bill_id) throw new Error("docket_bill_id_mismatch");
  if (archive && (
    !Number.isSafeInteger(Number(bill.session_id)) ||
    Number(bill.session_id) < 1 ||
    typeof bill.state !== "string" ||
    !/^(?:[A-Z]{2}|US)$/.test(bill.state) ||
    typeof bill.bill_number !== "string" ||
    !bill.bill_number.trim()
  )) throw new Error("docket_bulk_missing_provider_identity");
}

export async function accept_docket_bill_detail(input: docket_accept_input):
  Promise<{ disposition: string; cache_inserted: boolean; stored_source?: string; activation_id?: string | null }> {
  const is_archive = input.source === "legiscan_bulk_json";
  validate_docket_bill_identity(input.bill_id, input.bill, is_archive);
  if (is_archive !== Boolean(input.archive)) throw new Error("docket_bulk_archive_receipt_required");
  if (!is_archive) {
    const sql = [
      "insert into public.docket_bill_detail_cache (bill_id, bill, fetched_at, source, created_at, updated_at)",
      "values ($1, $2::jsonb, now(), $3, now(), now())",
      "on conflict (bill_id) do update set",
      "bill=excluded.bill, fetched_at=excluded.fetched_at, source=excluded.source, updated_at=now()",
    ].join("\n");
    await query_with_diagnostics(sql, [input.bill_id, JSON.stringify(input.bill), input.source], {
      label: input.label || "docket_bill_detail_accept",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 30_000,
    });
    return { disposition: "api_accepted", cache_inserted: true };
  }

  const archive = input.archive!;
  // A provider bill lacking event chronology still belongs in searchable
  // Docket source cache, but cannot be activated for Genome projection.
  const chronology_held = !docket_bulk_source_event_date(input.bill as Record<string, unknown>);
  require_sha(archive.archive_sha256, "archive_sha256");
  require_sha(archive.member_sha256, "member_sha256");
  if (!archive.member_path || archive.member_path.startsWith("/") ||
      archive.member_path.split("/").includes("..") ||
      !archive.member_path.endsWith(".json")) throw new Error("docket_bulk_invalid_member_path");
  if (archive.source_observed_at != null && !Number.isFinite(Date.parse(archive.source_observed_at))) {
    throw new Error("docket_bulk_invalid_source_observed_at");
  }

  // Never replace an existing API detail with a potentially older archive snapshot.
  const existing = await query_with_diagnostics<{ bill: Record<string, unknown> }>(
    "select bill from public.docket_bill_detail_cache where bill_id=$1 limit 1",
    [input.bill_id],
    { label: "docket_bulk_existing_identity", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 10_000 },
  );
  const previous = existing.rows[0]?.bill;
  if (previous && (String(previous.state) !== String(input.bill.state) ||
      Number(previous.session_id) !== Number(input.bill.session_id))) {
    throw new Error("docket_bulk_existing_bill_identity_conflict");
  }

  // Archive transport feeds the SAME Docket activation function as the live
  // getMasterList trigger. This is one atomic accept + receipt + activation;
  // it cannot overwrite the current per-state live master-list cache.
  // fetched_at is local ingest time, never a claimed upstream API fetch.
  const sql = [
    "with inserted as (",
    " insert into public.docket_bill_detail_cache (bill_id,bill,fetched_at,source,created_at,updated_at)",
    " values ($1,$2::jsonb,now(),'legiscan_bulk_json',now(),now())",
    " on conflict (bill_id) do nothing returning bill_id, fetched_at",
    "), recorded as (",
    " insert into public.docket_legiscan_bulk_member_receipt",
    " (archive_sha256,member_path,member_sha256,member_kind,provider_record_id,bill_id,session_id,state,",
    "  change_hash,source_observed_at,disposition)",
    " values ($3,$4,$5,'bill',$1,$1,$6,$7,$8,$9::timestamptz,",
    "  case when exists(select 1 from inserted) then",
    "    case when $10::boolean then 'held_chronology' else 'inserted' end",
    "  else 'existing_preserved' end)",
    " on conflict (archive_sha256,member_path) do nothing returning disposition",
    "), activated as (",
    " select public.register_docket_jurisdiction_activation(",
    "  $7::text, $6::integer, null::text,",
    "  jsonb_build_array(jsonb_build_object(",
    "   'bill_id', $1::integer, 'number', $2::jsonb->>'bill_number',",
    "   'title', $2::jsonb->>'title', 'description', $2::jsonb->>'description',",
    "   'status', $2::jsonb->'status', 'status_date', $2::jsonb->>'status_date',",
    "   'last_action', $2::jsonb->>'last_action',",
    "   'last_action_date', $2::jsonb->>'last_action_date',",
    "   'change_hash', $2::jsonb->>'change_hash')),",
    "  1::integer, inserted.fetched_at, 'legiscan_bulk_json'::text",
    " ) as activation_id from inserted where not $10::boolean",
    ") select coalesce((select disposition from recorded),'already_recorded') as disposition,",
    " exists(select 1 from inserted) as cache_inserted,",
    " coalesce((select 'legiscan_bulk_json' from inserted limit 1),",
    " (select source from public.docket_bill_detail_cache where bill_id=$1)) as stored_source,",
    " (select activation_id::text from activated) as activation_id",
  ].join("\n");
  const result = await query_with_diagnostics<{ disposition: string; cache_inserted: boolean; stored_source: string; activation_id: string | null }>(
    sql, [input.bill_id, JSON.stringify(input.bill), archive.archive_sha256, archive.member_path,
      archive.member_sha256, Number(input.bill.session_id), String(input.bill.state),
      typeof input.bill.change_hash === "string" ? input.bill.change_hash : null,
      archive.source_observed_at ?? null, chronology_held],
    { label: "docket_bulk_canonical_accept", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 30_000 },
  );
  return result.rows[0] || { disposition: "unknown", cache_inserted: false };
}

export async function preserve_docket_archive_auxiliary(input: {
  kind: "person" | "roll_call";
  payload: Record<string, unknown>;
  provider_record_id: number;
  state: string;
  archive: docket_archive_member_receipt;
}): Promise<void> {
  if (!Number.isSafeInteger(input.provider_record_id) || input.provider_record_id < 1 ||
      !/^(?:[A-Z]{2}|US)$/.test(input.state)) throw new Error("docket_bulk_invalid_auxiliary_identity");
  require_sha(input.archive.archive_sha256, "archive_sha256");
  require_sha(input.archive.member_sha256, "member_sha256");
  const payload_hash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  await query_with_diagnostics(
    [
      "insert into public.docket_legiscan_bulk_member_receipt",
      "(archive_sha256,member_path,member_sha256,member_kind,provider_record_id,state,payload_sha256,payload_json,disposition)",
      "values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'source_preserved')",
      "on conflict (archive_sha256,member_path) do nothing",
    ].join("\n"),
    [input.archive.archive_sha256,input.archive.member_path,input.archive.member_sha256,
      input.kind,input.provider_record_id,input.state,payload_hash,JSON.stringify(input.payload)],
    { label: "docket_bulk_preserve_source_member", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 30_000 },
  );
}
