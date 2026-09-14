/** Read existing public resource records. Counts describe this query, not verification. */
type resource_kind = "food_bank" | "benefits_office";
type resource_query = (query: string, values: unknown[]) => Promise<{ rows: any[] }>;

const resource_columns = `n.id, n.name, n.description, n.organization_name, n.agency_name,
  n.address_line1, n.address_line2, n.city, n.state, n.postal_code,
  n.latitude, n.longitude, n.geocode_precision, n.phone, n.email, n.website_url,
  n.eligibility_summary, n.languages, n.accessibility_features,
  n.source_snapshot_hash, n.updated_at`;

export const benefits_resource_query = `
  with scoped as (
    select ${resource_columns}
    from public.normalized_civic_resource n
    where n.resource_type = $1
      and ($2::text is null or n.source_key = $2 or exists (
        select 1 from public.api_source_registry s
        where s.id = n.source_id and s.source_key = $2
      ))
  ), sample as (
    select * from scoped order by name, id limit $3
  )
  select count(*)::int as total,
    count(*) filter (where latitude between -90 and 90 and longitude between -180 and 180)::int as mapped,
    count(*) filter (where latitude between -90 and 90 and longitude between -180 and 180
      and lower(geocode_precision) = 'rooftop')::int as rooftop,
    count(*) filter (where latitude between -90 and 90 and longitude between -180 and 180
      and lower(geocode_precision) = 'street')::int as street,
    coalesce((select jsonb_agg(sample order by name, id) from sample), '[]'::jsonb) as items
  from scoped
`;

async function live_resource_query(query: string, values: unknown[]) {
  const { getPool } = await import("./db-legacy");
  return getPool().query(query, values);
}

export async function read_benefits_resource_proof(
  kind: resource_kind,
  endpoint: string,
  query: resource_query = live_resource_query,
) {
  const source_key = kind === "benefits_office" ? "wa_dshs_office_locator" : null;
  const limit = kind === "benefits_office" ? 100 : 20;
  const base = {
    endpoint, source: "normalized_civic_resource", source_key, resource_type: kind,
    query_mode: "live_read", queried_at: new Date().toISOString(),
    verification_status: "source_attached_unverified", limit,
  };
  try {
    const { rows } = await query(benefits_resource_query, [kind, source_key, limit]);
    const result = rows[0];
    if (!result || !Array.isArray(result.items)) throw new Error("Invalid resource response");
    const total = Number(result.total);
    const mapped = Number(result.mapped);
    const rooftop = Number(result.rooftop);
    const street = Number(result.street);
    if (![total, mapped, rooftop, street].every(n => Number.isSafeInteger(n) && n >= 0)
      || mapped > total || rooftop + street > mapped) throw new Error("Invalid resource counts");
    return {
      ...base, ok: true, status: "source_records_available", total, mapped,
      unmapped: total - mapped, precision_breakdown: { rooftop, street, other: mapped - rooftop - street },
      has_more: total > result.items.length, rows: result.items,
      resources: kind === "food_bank" ? result.items : [],
      offices: kind === "benefits_office" ? result.items : [],
      warning: null,
    };
  } catch {
    // A failed read cannot establish any count, location precision, or verification.
    return {
      ...base, ok: false, status: "source_unavailable", total: null, mapped: null,
      unmapped: null, precision_breakdown: null, has_more: null,
      rows: [], resources: [], offices: [], warning: "Resource records are temporarily unavailable. Please retry.",
    };
  }
}
