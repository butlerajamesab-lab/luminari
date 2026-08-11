import { getPool } from "../db";
import type { ResourceDirectorySearchInput } from "./resource-directory";

const SUMMARY_CACHE_MS = 5 * 60 * 1000;

let summaryCache:
  | {
      expiresAt: number;
      value: unknown;
    }
  | undefined;

function cleanText(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)));
}

function normalizeJurisdiction(value: string | undefined): string | null {
  const cleaned = cleanText(value, 2)?.toUpperCase() ?? null;
  return cleaned && /^[A-Z]{2}$/.test(cleaned) ? cleaned : null;
}

function normalizeCategory(value: string | undefined): string | null {
  const cleaned = cleanText(value, 64)?.toLowerCase() ?? null;
  return cleaned && /^[a-z0-9_]+$/.test(cleaned) ? cleaned : null;
}

/**
 * Publication is a governed projection, not a synonym for "row exists".
 *
 * review_ready/source_attached is the existing state-directory publication
 * ceiling. promoted/verified covers explicitly verified deep-dive/promoted
 * resources. Staged-review and unverified candidates remain inspectable in
 * admin substrates but are never silently exposed as public resources.
 */
const PUBLISHABLE_QUALITY_SQL = `(
  (
    e.promotion_status = 'review_ready'
    and e.verification_status = 'source_attached'
    and e.provenance_status = 'staging_provenance_attached'
  )
  or
  (
    e.promotion_status = 'promoted'
    and e.verification_status = 'verified'
    and e.provenance_status in ('verified', 'source_preserved')
  )
)`;

const RESOURCE_SELECT_SQL = `
  e.resource_entity_id,
  e.canonical_id,
  e.source_family_key,
  e.source_table,
  e.source_pk,
  e.source_hash,
  e.resource_name as source_resource_name,
  coalesce(nullif(p.display_name_override, ''), e.resource_name) as resource_name,
  e.resource_type,
  e.resource_category,
  e.jurisdiction,
  e.jurisdiction_scope,
  e.state,
  e.county,
  e.city,
  e.description,
  e.eligibility_summary,
  e.apply_notes,
  e.service_categories,
  e.verification_status,
  e.promotion_status,
  e.provenance_status,
  coalesce(p.publication_status, 'active') as publication_status,
  p.source_reference as publication_source_reference,
  p.review_note as publication_review_note
`;

export async function getPublishableResourceDirectorySummary(options?: {
  bypassCache?: boolean;
}) {
  const now = Date.now();
  if (!options?.bypassCache && summaryCache && summaryCache.expiresAt > now) {
    return summaryCache.value;
  }

  const pool = getPool();
  const { rows } = await pool.query(`
    with eligible as (
      select
        e.resource_entity_id,
        e.state,
        e.resource_category,
        e.source_table,
        coalesce(p.publication_status, 'active') as publication_status
      from public.luminari_resource_entities e
      left join public.luminari_resource_publication_resolutions p
        on p.resource_entity_id = e.resource_entity_id
      where ${PUBLISHABLE_QUALITY_SQL}
    ),
    active_corpus as (
      select * from eligible where publication_status = 'active'
    ),
    category_rows as (
      select resource_category as id, count(*)::int as count
      from active_corpus
      where resource_category is not null
      group by resource_category
      order by count(*) desc, resource_category
    ),
    jurisdiction_category_rows as (
      select state as code, resource_category as category, count(*)::int as count
      from active_corpus
      where state is not null and resource_category is not null
      group by state, resource_category
    ),
    jurisdiction_rows as (
      select
        c.state as code,
        count(*)::int as count,
        coalesce(
          (
            select jsonb_object_agg(j.category, j.count)
            from jurisdiction_category_rows j
            where j.code = c.state
          ),
          '{}'::jsonb
        ) as categories
      from active_corpus c
      where c.state is not null
      group by c.state
      order by c.state
    ),
    source_rows as (
      select source_table as id, count(*)::int as count
      from active_corpus
      group by source_table
      order by count(*) desc, source_table
    ),
    contact_stats as (
      select
        count(*)::int as contact_count,
        count(distinct c.resource_entity_id)::int as resources_with_contacts
      from public.v_luminari_resource_contact_points_current_v3_13 c
      join active_corpus x on x.resource_entity_id = c.resource_entity_id
    ),
    location_stats as (
      select
        count(*)::int as location_count,
        count(distinct l.resource_entity_id)::int as resources_with_locations,
        count(distinct l.resource_entity_id) filter (
          where l.manual_map_eligible is true
        )::int as verified_physical_sites,
        count(distinct l.resource_entity_id) filter (
          where l.manual_map_eligible is true
            and l.latitude is not null
            and l.longitude is not null
        )::int as exact_mappable_resources
      from public.v_luminari_resource_locations_current_v3_13 l
      join active_corpus x on x.resource_entity_id = l.resource_entity_id
    ),
    substrate_state as (
      select jsonb_build_object(
        'unified_resource_rows', (select count(*)::int from public.unified_resources),
        'candidate_rows', (select count(*)::int from public.v_luminari_resource_source_candidates),
        'canonical_entity_rows', (select count(*)::int from public.luminari_resource_entities),
        'publishable_rows', (select count(*)::int from active_corpus),
        'state_directory_logical_records', (select count(*)::int from public.state_directory_logical_record),
        'state_directory_raw_source_rows', (
          select coalesce(sum(raw_source_row_count), 0)::int
          from public.state_directory_logical_record
        ),
        'state_directory_deduped_source_rows', (
          select coalesce(sum(deduped_source_row_count), 0)::int
          from public.state_directory_logical_record
        ),
        'state_directory_source_files', (
          select count(distinct source_file)::int
          from public.state_directory_logical_record
        ),
        'state_directory_jurisdictions', (
          select count(distinct jurisdiction_key)::int
          from public.state_directory_logical_record
        )
      ) as payload
    )
    select jsonb_build_object(
      'total_resources', (select count(*)::int from eligible),
      'active_resources', (select count(*)::int from active_corpus),
      'inactive_resources', (
        select count(*)::int from eligible where publication_status = 'inactive'
      ),
      'jurisdiction_count', (select count(*)::int from jurisdiction_rows),
      'category_count', (select count(*)::int from category_rows),
      'contact_count', coalesce((select contact_count from contact_stats), 0),
      'resources_with_contacts', coalesce((select resources_with_contacts from contact_stats), 0),
      'location_count', coalesce((select location_count from location_stats), 0),
      'resources_with_locations', coalesce((select resources_with_locations from location_stats), 0),
      'verified_physical_sites', coalesce((select verified_physical_sites from location_stats), 0),
      'exact_mappable_resources', coalesce((select exact_mappable_resources from location_stats), 0),
      'categories', coalesce((select jsonb_agg(to_jsonb(category_rows)) from category_rows), '[]'::jsonb),
      'jurisdictions', coalesce((select jsonb_agg(to_jsonb(jurisdiction_rows)) from jurisdiction_rows), '[]'::jsonb),
      'source_lanes', coalesce((select jsonb_agg(to_jsonb(source_rows)) from source_rows), '[]'::jsonb),
      'substrate', (select payload from substrate_state),
      'projection_contract', 'luminari_resource_directory_publishable_v3_13'
    ) as payload
  `);

  const value = rows[0]?.payload ?? {
    total_resources: 0,
    active_resources: 0,
    inactive_resources: 0,
    categories: [],
    jurisdictions: [],
    source_lanes: [],
    substrate: {},
    projection_contract: "luminari_resource_directory_publishable_v3_13",
  };
  summaryCache = { value, expiresAt: now + SUMMARY_CACHE_MS };
  return value;
}

export async function searchPublishableResourceDirectory(
  input: ResourceDirectorySearchInput = {}
) {
  const query = cleanText(input.query, 160);
  const jurisdiction = normalizeJurisdiction(input.jurisdiction);
  const category = normalizeCategory(input.category);
  const limit = clampInteger(input.limit, 24, 1, 60);
  const offset = clampInteger(input.offset, 0, 0, 20_000);
  const pool = getPool();

  const { rows } = await pool.query(
    `
      with corpus as (
        select ${RESOURCE_SELECT_SQL}
        from public.luminari_resource_entities e
        left join public.luminari_resource_publication_resolutions p
          on p.resource_entity_id = e.resource_entity_id
        where ${PUBLISHABLE_QUALITY_SQL}
          and coalesce(p.publication_status, 'active') = 'active'
      ),
      filtered as (
        select c.*
        from corpus c
        where ($1::text is null or c.state = $1)
          and ($2::text is null or c.resource_category = $2)
          and (
            $3::text is null
            or c.resource_name ilike '%' || $3 || '%'
            or c.source_resource_name ilike '%' || $3 || '%'
            or coalesce(c.description, '') ilike '%' || $3 || '%'
            or coalesce(c.eligibility_summary, '') ilike '%' || $3 || '%'
            or coalesce(c.apply_notes, '') ilike '%' || $3 || '%'
            or array_to_string(coalesce(c.service_categories, array[]::text[]), ' ') ilike '%' || $3 || '%'
            or exists (
              select 1
              from public.v_luminari_resource_contact_points_current_v3_13 cp
              where cp.resource_entity_id = c.resource_entity_id
                and cp.contact_value ilike '%' || $3 || '%'
            )
          )
      ),
      page as (
        select * from filtered
        order by resource_name, resource_entity_id
        limit $4 offset $5
      )
      select jsonb_build_object(
        'total', (select count(*)::int from filtered),
        'limit', $4::int,
        'offset', $5::int,
        'items', coalesce(
          (
            select jsonb_agg(item.payload order by item.sort_name, item.sort_id)
            from (
              select
                p.resource_name as sort_name,
                p.resource_entity_id as sort_id,
                jsonb_build_object(
                  'resource_entity_id', p.resource_entity_id,
                  'canonical_id', p.canonical_id,
                  'source_family_key', p.source_family_key,
                  'source_table', p.source_table,
                  'source_pk', p.source_pk,
                  'source_hash', p.source_hash,
                  'resource_name', p.resource_name,
                  'source_resource_name', p.source_resource_name,
                  'resource_type', p.resource_type,
                  'resource_category', p.resource_category,
                  'jurisdiction', p.jurisdiction,
                  'jurisdiction_scope', p.jurisdiction_scope,
                  'state', p.state,
                  'county', p.county,
                  'city', p.city,
                  'description', p.description,
                  'eligibility_summary', p.eligibility_summary,
                  'apply_notes', p.apply_notes,
                  'service_categories', coalesce(to_jsonb(p.service_categories), '[]'::jsonb),
                  'verification_status', p.verification_status,
                  'promotion_status', p.promotion_status,
                  'provenance_status', p.provenance_status,
                  'publication_status', p.publication_status,
                  'publication_source_reference', p.publication_source_reference,
                  'publication_review_note', p.publication_review_note,
                  'projection_contract', 'luminari_resource_directory_publishable_v3_13',
                  'contacts', coalesce(contacts.payload, '[]'::jsonb),
                  'locations', coalesce(locations.payload, '[]'::jsonb),
                  'location_resolution', location_resolution.payload
                ) as payload
              from page p
              left join lateral (
                select jsonb_agg(
                  jsonb_build_object(
                    'contact_point_id', cp.contact_point_id,
                    'contact_type', cp.contact_type,
                    'contact_value', cp.contact_value,
                    'label', cp.label,
                    'is_primary', cp.is_primary,
                    'contact_quality', cp.contact_quality,
                    'manually_reviewed', cp.manually_reviewed,
                    'manual_source_reference', cp.manual_source_reference,
                    'manual_review_note', cp.manual_review_note
                  ) order by cp.is_primary desc, cp.contact_type, cp.contact_value
                ) as payload
                from public.v_luminari_resource_contact_points_current_v3_13 cp
                where cp.resource_entity_id = p.resource_entity_id
              ) contacts on true
              left join lateral (
                select jsonb_agg(
                  jsonb_build_object(
                    'location_id', l.location_id,
                    'address_line1', l.address_line1,
                    'address_line2', l.address_line2,
                    'city', l.city,
                    'county', l.county,
                    'state', l.state,
                    'postal_code', l.postal_code,
                    'country', l.country,
                    'latitude', l.latitude,
                    'longitude', l.longitude,
                    'coordinate_quality', l.coordinate_quality,
                    'manual_location_kind', l.manual_location_kind,
                    'manual_map_eligible', l.manual_map_eligible,
                    'manual_source_reference', l.manual_source_reference,
                    'manual_review_note', l.manual_review_note,
                    'manual_review_version', l.manual_review_version
                  ) order by l.manual_map_eligible desc nulls last, l.address_line1 nulls last, l.location_id
                ) as payload
                from public.v_luminari_resource_locations_current_v3_13 l
                where l.resource_entity_id = p.resource_entity_id
              ) locations on true
              left join lateral (
                select jsonb_build_object(
                  'disposition', r.disposition,
                  'location_kind', r.location_kind,
                  'map_eligible', r.map_eligible,
                  'source_reference', r.source_reference,
                  'review_note', r.review_note,
                  'review_version', r.review_version,
                  'reviewed_at', r.reviewed_at
                ) as payload
                from public.luminari_resource_location_resolutions r
                where r.resource_entity_id = p.resource_entity_id
                order by r.reviewed_at desc, r.review_version desc
                limit 1
              ) location_resolution on true
            ) item
          ),
          '[]'::jsonb
        )
      ) as payload
    `,
    [jurisdiction, category, query, limit, offset]
  );

  return rows[0]?.payload ?? { total: 0, limit, offset, items: [] };
}

export async function getPublishableResourceDirectoryDetail(resourceEntityId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      with target as (
        select ${RESOURCE_SELECT_SQL}
        from public.luminari_resource_entities e
        left join public.luminari_resource_publication_resolutions p
          on p.resource_entity_id = e.resource_entity_id
        where e.resource_entity_id = $1::uuid
          and ${PUBLISHABLE_QUALITY_SQL}
          and coalesce(p.publication_status, 'active') = 'active'
        limit 1
      )
      select jsonb_build_object(
        'resource_entity_id', t.resource_entity_id,
        'canonical_id', t.canonical_id,
        'source_family_key', t.source_family_key,
        'source_table', t.source_table,
        'source_pk', t.source_pk,
        'source_hash', t.source_hash,
        'resource_name', t.resource_name,
        'source_resource_name', t.source_resource_name,
        'resource_type', t.resource_type,
        'resource_category', t.resource_category,
        'jurisdiction', t.jurisdiction,
        'jurisdiction_scope', t.jurisdiction_scope,
        'state', t.state,
        'county', t.county,
        'city', t.city,
        'description', t.description,
        'eligibility_summary', t.eligibility_summary,
        'apply_notes', t.apply_notes,
        'service_categories', coalesce(to_jsonb(t.service_categories), '[]'::jsonb),
        'verification_status', t.verification_status,
        'promotion_status', t.promotion_status,
        'provenance_status', t.provenance_status,
        'publication_status', t.publication_status,
        'publication_source_reference', t.publication_source_reference,
        'publication_review_note', t.publication_review_note,
        'projection_contract', 'luminari_resource_directory_publishable_v3_13',
        'contacts', coalesce(contacts.payload, '[]'::jsonb),
        'locations', coalesce(locations.payload, '[]'::jsonb),
        'location_resolution', location_resolution.payload
      ) as payload
      from target t
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'contact_point_id', cp.contact_point_id,
            'contact_type', cp.contact_type,
            'contact_value', cp.contact_value,
            'label', cp.label,
            'is_primary', cp.is_primary,
            'contact_quality', cp.contact_quality,
            'manually_reviewed', cp.manually_reviewed,
            'manual_source_reference', cp.manual_source_reference,
            'manual_review_note', cp.manual_review_note
          ) order by cp.is_primary desc, cp.contact_type, cp.contact_value
        ) as payload
        from public.v_luminari_resource_contact_points_current_v3_13 cp
        where cp.resource_entity_id = t.resource_entity_id
      ) contacts on true
      left join lateral (
        select jsonb_agg(to_jsonb(l) order by l.location_id) as payload
        from public.v_luminari_resource_locations_current_v3_13 l
        where l.resource_entity_id = t.resource_entity_id
      ) locations on true
      left join lateral (
        select to_jsonb(r) - 'malformed_location_ids' - 'metadata' as payload
        from public.luminari_resource_location_resolutions r
        where r.resource_entity_id = t.resource_entity_id
        order by r.reviewed_at desc, r.review_version desc
        limit 1
      ) location_resolution on true
    `,
    [resourceEntityId]
  );

  return rows[0]?.payload ?? null;
}

export function clearPublishableResourceDirectorySummaryCache() {
  summaryCache = undefined;
}
