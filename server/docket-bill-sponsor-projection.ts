import { query_with_diagnostics } from "./db";

/**
 * Docket Room actor layer, step 1: project each bill's sponsors from the
 * stored provider detail into docket_bill_sponsor_v1. Reads only the cached
 * snapshot (no provider calls). An older snapshot never overwrites a newer one.
 * The official page is the legislature's own member page: the official
 * website link, else the legislature biography link LegiScan carries.
 */
export const DOCKET_BILL_SPONSOR_PROJECTION_SQL = `
  insert into public.docket_bill_sponsor_v1 as existing (
    source_bill_id, people_id, state_code, sponsor_order, sponsor_type_id,
    sponsor_type, committee_sponsor, committee_id, name, first_name, last_name,
    role, party, district, official_page_url, ballotpedia, votesmart_id,
    knowwho_pid, ftm_eid, bioguide_id, person_hash, docket_fetched_at,
    docket_source
  )
  select cache.bill_id,
         (sponsor->>'people_id')::integer,
         nullif(cache.bill->>'state', ''),
         nullif(sponsor->>'sponsor_order', '')::integer,
         nullif(sponsor->>'sponsor_type_id', '')::integer,
         case nullif(sponsor->>'sponsor_type_id', '')::integer
           when 0 then 'sponsor'
           when 1 then 'primary'
           when 2 then 'cosponsor'
           when 3 then 'joint'
           else 'unknown'
         end,
         coalesce(nullif(sponsor->>'committee_sponsor', '')::integer, 0) = 1,
         nullif(nullif(sponsor->>'committee_id', '')::integer, 0),
         sponsor->>'name',
         nullif(sponsor->>'first_name', ''),
         nullif(sponsor->>'last_name', ''),
         nullif(sponsor->>'role', ''),
         nullif(sponsor->>'party', ''),
         nullif(sponsor->>'district', ''),
         coalesce(
           nullif(sponsor->'bio'->'links'->'official'->>'website', ''),
           nullif(sponsor->'bio'->'social'->>'biography', '')
         ),
         nullif(sponsor->>'ballotpedia', ''),
         nullif(nullif(sponsor->>'votesmart_id', '')::integer, 0),
         nullif(nullif(sponsor->>'knowwho_pid', '')::integer, 0),
         nullif(nullif(sponsor->>'ftm_eid', '')::integer, 0),
         nullif(sponsor->>'bioguide_id', ''),
         nullif(sponsor->>'person_hash', ''),
         cache.fetched_at,
         cache.source
    from public.docket_bill_detail_cache cache
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cache.bill->'sponsors') = 'array'
           then cache.bill->'sponsors' else '[]'::jsonb end
    ) as sponsor
   where cache.bill_id = $1::integer
     and coalesce(sponsor->>'people_id', '') ~ '^[1-9][0-9]*$'
     and coalesce(sponsor->>'name', '') <> ''
  on conflict (source_bill_id, people_id) do update
     set state_code = excluded.state_code,
         sponsor_order = excluded.sponsor_order,
         sponsor_type_id = excluded.sponsor_type_id,
         sponsor_type = excluded.sponsor_type,
         committee_sponsor = excluded.committee_sponsor,
         committee_id = excluded.committee_id,
         name = excluded.name,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         role = excluded.role,
         party = excluded.party,
         district = excluded.district,
         official_page_url = excluded.official_page_url,
         ballotpedia = excluded.ballotpedia,
         votesmart_id = excluded.votesmart_id,
         knowwho_pid = excluded.knowwho_pid,
         ftm_eid = excluded.ftm_eid,
         bioguide_id = excluded.bioguide_id,
         person_hash = excluded.person_hash,
         docket_fetched_at = excluded.docket_fetched_at,
         docket_source = excluded.docket_source,
         recorded_at = now()
   where excluded.docket_fetched_at >= existing.docket_fetched_at
  returning people_id`;

export function docket_bill_sponsor_projection_enabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.DOCKET_BILL_SPONSOR_PROJECTION_ENABLED === "true";
}

/** Best effort: a failure is logged and never fails the caller's job. */
export async function project_docket_bill_sponsors(source_bill_id: number): Promise<number> {
  if (!docket_bill_sponsor_projection_enabled()) return 0;
  try {
    const result = await query_with_diagnostics<{ people_id: number }>(
      DOCKET_BILL_SPONSOR_PROJECTION_SQL,
      [source_bill_id],
      {
        label: "docket_bill_sponsor_projection",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: 5_000,
      },
    );
    return result.rows.length;
  } catch (error) {
    console.error("[DocketBillSponsorProjection] failed", {
      source_bill_id,
      error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return 0;
  }
}
