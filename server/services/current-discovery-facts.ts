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
      select fact_id,fact_type,title,body,category,jurisdiction_code,jurisdiction_raw,
             phone,website,source_lane,source_id,verification_status,display_priority,metadata,
             count(*) over()::int as filtered_total
        from public.v_lighthouse_did_you_know_candidates_v1
       where ${where.join(" and ")}
       order by display_priority desc nulls last,title,fact_id
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
             count(*) filter(where verification_status ilike '%verified%')::int as verified,
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
  const daily = items.length > 0 ? items[dateHash(today) % items.length] : null;
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
      with_phone: Number(summary.with_phone ?? 0),
      with_website: Number(summary.with_website ?? 0),
      jurisdictions: Number(summary.jurisdictions ?? 0),
      source_lanes: Number(summary.source_lanes ?? 0),
    },
    filters: { query, category, jurisdiction },
  };
}
