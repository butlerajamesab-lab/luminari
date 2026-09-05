import { getPool } from "../db";

export type CurrentDiscoveryFactInput = {
  query?: string;
  category?: string;
  jurisdiction?: string;
  limit?: number;
  offset?: number;
};

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function dateHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

const verifiedStatusSql =
  "lower(trim(coalesce(verification_status,''))) like 'verified%'";
const displayPrioritySql = `case
  when ${verifiedStatusSql} then 100
  when website is not null or phone is not null then 70
  else 40
end`;

// A discovery fact carries a verifiable claim — an amount, a percentage, a
// bounded duration, or an eligibility/right verb — in its title or body. A
// row without one is a resource listing (an office, a program entry), which
// belongs to the Resource Directory, not the Did You Know rotation. The
// predicate is deterministic content shape, never a judgment call.
const claimSignalSql = `(
  coalesce(title,'') || ' ' || coalesce(body,'')
) ~* '(\\$[0-9]|[0-9]+\\s*%|\\b[0-9]+\\s*(day|days|week|weeks|month|months|year|years|hour|hours)\\b|\\b(eligible|eligibility|qualify|qualifies|entitled|deadline|covers|pays|free of charge|no cost)\\b)'`;
const factKindSql = `case when ${claimSignalSql} then 'discovery_fact' else 'resource_listing' end`;

export async function readCurrentDiscoveryFacts(input: CurrentDiscoveryFactInput = {}) {
  const pool = getPool();
  const limit = clamp(input.limit, 1, 100, 60);
  const offset = clamp(input.offset, 0, 100_000, 0);
  const query = input.query?.trim() || null;
  const category = input.category?.trim() || null;
  const jurisdiction = input.jurisdiction?.trim().toUpperCase() || null;

  const params: unknown[] = [];
  const where: string[] = ["coalesce(title,'') <> ''"];
  if (query) {
    params.push(`%${query}%`);
    const p = `$${params.length}`;
    where.push(`(
      coalesce(title,'') ilike ${p}
      or coalesce(body,'') ilike ${p}
      or coalesce(category,'') ilike ${p}
      or coalesce(jurisdiction_code,'') ilike ${p}
      or coalesce(source_lane,'') ilike ${p}
    )`);
  }
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (jurisdiction) {
    params.push(jurisdiction);
    where.push(`upper(coalesce(jurisdiction_code,'')) = $${params.length}`);
  }
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const [pageResult, categoryResult, summaryResult] = await Promise.all([
    pool.query(`
      select fact_id,fact_type,${factKindSql} as fact_kind,title,body,category,
             jurisdiction_code,jurisdiction_raw,
             phone,website,source_lane,source_id,verification_status,
             ${displayPrioritySql} as display_priority,metadata,
             count(*) over()::int as filtered_total
        from public.v_lighthouse_did_you_know_candidates_v1
       where ${where.join(" and ")}
       order by
         case when ${claimSignalSql} then 0 else 1 end,
         display_priority desc nulls last,title,fact_id
       limit ${limitParam} offset ${offsetParam}
    `, params),
    pool.query(`
      select coalesce(nullif(category,''),'uncategorized') as category,count(*)::int as count
        from public.v_lighthouse_did_you_know_candidates_v1
       where coalesce(title,'') <> ''
       group by coalesce(nullif(category,''),'uncategorized')
       order by count desc,category
    `),
    pool.query(`
      select count(*)::int as total,
             count(*) filter(where ${verifiedStatusSql})::int as verified,
             count(*) filter(where ${claimSignalSql})::int as discovery_facts,
             count(*) filter(where phone is not null)::int as with_phone,
             count(*) filter(where website is not null)::int as with_website,
             count(distinct coalesce(jurisdiction_code,jurisdiction_raw))::int as jurisdictions,
             count(distinct source_lane)::int as source_lanes
        from public.v_lighthouse_did_you_know_candidates_v1
       where coalesce(title,'') <> ''
    `),
  ]);

  const items = pageResult.rows.map(({ filtered_total: _filteredTotal, ...row }) => row);
  const today = new Date().toISOString().slice(0, 10);
  // The daily spotlight rotates only through discovery facts — never office
  // listings. Falls back to the full window if none are present.
  const factPool = items.filter((item) => item.fact_kind === "discovery_fact");
  const dailyPool = factPool.length > 0 ? factPool : items;
  const daily = dailyPool.length > 0 ? dailyPool[dateHash(today) % dailyPool.length] : null;
  const summary = summaryResult.rows[0] ?? {};

  return {
    contract: "lighthouse_current_discovery_facts_v1",
    total: Number(pageResult.rows[0]?.filtered_total ?? 0),
    limit,
    offset,
    window_only: true,
    items,
    daily,
    categories: categoryResult.rows.map((row) => ({
      category: String(row.category),
      count: Number(row.count ?? 0),
    })),
    summary: {
      total: Number(summary.total ?? 0),
      verified: Number(summary.verified ?? 0),
      discovery_facts: Number(summary.discovery_facts ?? 0),
      resource_listings:
        Number(summary.total ?? 0) - Number(summary.discovery_facts ?? 0),
      with_phone: Number(summary.with_phone ?? 0),
      with_website: Number(summary.with_website ?? 0),
      jurisdictions: Number(summary.jurisdictions ?? 0),
      source_lanes: Number(summary.source_lanes ?? 0),
    },
    filters: { query, category, jurisdiction },
  };
}
