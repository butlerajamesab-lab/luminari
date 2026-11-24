import { query_with_diagnostics } from "./db";

/**
 * Docket Room actor layer, step 2. For one bill: project its roll calls from
 * the stored provider detail, then each legislator's vote from the preserved
 * LegiScan archive record (only when that record names this bill). Reads
 * stored data only; no provider calls. An older snapshot never overwrites a
 * newer roll call; individual votes come from immutable archive records.
 */
export const DOCKET_ROLL_CALL_PROJECTION_SQL = `
  insert into public.docket_roll_call_v1 as existing (
    roll_call_id, source_bill_id, state_code, chamber, chamber_id, vote_date,
    description, yea, nay, nv, absent, total, passed, legiscan_url, state_link,
    docket_fetched_at, docket_source
  )
  select (roll_call->>'roll_call_id')::bigint,
         cache.bill_id,
         nullif(cache.bill->>'state', ''),
         nullif(roll_call->>'chamber', ''),
         nullif(roll_call->>'chamber_id', '')::integer,
         case when coalesce(roll_call->>'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              then (roll_call->>'date')::date end,
         nullif(roll_call->>'desc', ''),
         nullif(roll_call->>'yea', '')::integer,
         nullif(roll_call->>'nay', '')::integer,
         nullif(roll_call->>'nv', '')::integer,
         nullif(roll_call->>'absent', '')::integer,
         nullif(roll_call->>'total', '')::integer,
         case roll_call->>'passed' when '1' then true when '0' then false end,
         nullif(roll_call->>'url', ''),
         nullif(roll_call->>'state_link', ''),
         cache.fetched_at,
         cache.source
    from public.docket_bill_detail_cache cache
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cache.bill->'votes') = 'array'
           then cache.bill->'votes' else '[]'::jsonb end
    ) as roll_call
   where cache.bill_id = $1::integer
     and coalesce(roll_call->>'roll_call_id', '') ~ '^[1-9][0-9]*$'
  on conflict (roll_call_id) do update
     set source_bill_id = excluded.source_bill_id,
         state_code = excluded.state_code,
         chamber = excluded.chamber,
         chamber_id = excluded.chamber_id,
         vote_date = excluded.vote_date,
         description = excluded.description,
         yea = excluded.yea,
         nay = excluded.nay,
         nv = excluded.nv,
         absent = excluded.absent,
         total = excluded.total,
         passed = excluded.passed,
         legiscan_url = excluded.legiscan_url,
         state_link = excluded.state_link,
         docket_fetched_at = excluded.docket_fetched_at,
         docket_source = excluded.docket_source,
         recorded_at = now()
   where excluded.docket_fetched_at >= existing.docket_fetched_at
  returning roll_call_id`;

export const DOCKET_ROLL_CALL_VOTE_PROJECTION_SQL = `
  with chosen as materialized (
    -- Exactly one archive copy per roll call: newest import first, then a
    -- stable tiebreak. Only copies that name this same bill are eligible.
    select distinct on (receipt.provider_record_id)
           receipt.provider_record_id as roll_call_id,
           receipt.archive_sha256, receipt.member_path, receipt.member_sha256,
           receipt.payload_json
      from public.docket_roll_call_v1 roll_call
      join public.docket_legiscan_bulk_member_receipt receipt
        on receipt.member_kind = 'roll_call'
       and receipt.provider_record_id = roll_call.roll_call_id
       and receipt.payload_json->>'bill_id' = roll_call.source_bill_id::text
     where roll_call.source_bill_id = $1::integer
     order by receipt.provider_record_id,
              receipt.imported_at desc nulls last,
              receipt.archive_sha256 desc,
              receipt.member_path desc
  ), inserted as (
    insert into public.docket_roll_call_vote_v1 (
      roll_call_id, people_id, vote_id, vote_text,
      archive_sha256, member_path, member_sha256
    )
    select chosen.roll_call_id,
           (vote->>'people_id')::integer,
           nullif(vote->>'vote_id', '')::integer,
           vote->>'vote_text',
           chosen.archive_sha256,
           chosen.member_path,
           chosen.member_sha256
      from chosen
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(chosen.payload_json->'votes') = 'array'
             then chosen.payload_json->'votes' else '[]'::jsonb end
      ) as vote
     where coalesce(vote->>'people_id', '') ~ '^[1-9][0-9]*$'
       and coalesce(vote->>'vote_text', '') <> ''
    on conflict (roll_call_id, member_sha256, people_id) do nothing
    returning roll_call_id
  ), pointed as (
    update public.docket_roll_call_v1 roll_call
       set vote_archive_sha256 = chosen.archive_sha256,
           vote_member_sha256 = chosen.member_sha256
      from chosen
     where roll_call.roll_call_id = chosen.roll_call_id
       and roll_call.vote_member_sha256 is distinct from chosen.member_sha256
    returning roll_call.roll_call_id
  )
  select roll_call_id from inserted`;

export function docket_roll_call_projection_enabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.DOCKET_ROLL_CALL_PROJECTION_ENABLED === "true";
}

/** Best effort: a failure is logged and never fails the caller's job. */
export async function project_docket_bill_roll_calls(
  source_bill_id: number,
): Promise<{ roll_calls: number; votes: number }> {
  if (!docket_roll_call_projection_enabled()) return { roll_calls: 0, votes: 0 };
  try {
    const options = { pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 };
    const roll_calls = await query_with_diagnostics<{ roll_call_id: string }>(
      DOCKET_ROLL_CALL_PROJECTION_SQL,
      [source_bill_id],
      { ...options, label: "docket_roll_call_projection" },
    );
    const votes = await query_with_diagnostics<{ roll_call_id: string }>(
      DOCKET_ROLL_CALL_VOTE_PROJECTION_SQL,
      [source_bill_id],
      { ...options, label: "docket_roll_call_vote_projection" },
    );
    return { roll_calls: roll_calls.rows.length, votes: votes.rows.length };
  } catch (error) {
    console.error("[DocketRollCallProjection] failed", {
      source_bill_id,
      error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { roll_calls: 0, votes: 0 };
  }
}
