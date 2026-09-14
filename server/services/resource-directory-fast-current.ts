import { getPool as get_pool } from "../db";
import { ENV } from "../_core/env";
import { resource_source_access } from "./resource-source-access";

export type publishable_resource_directory_search_input = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

const PROJECTION_CONTRACT = "lighthouse_resource_directory_current_v5";
const DIRECTORY_VIEW = "public.v_lighthouse_resource_program_classified_v1";
// Reuses the reviewed service change from PR #612. The original source code
// remains available on each row; this is presentation alias normalization.
const JURISDICTION_CODE_SQL = `case upper(btrim(coalesce(state_code,jurisdiction))) when 'USVI' then 'VI' else upper(btrim(coalesce(state_code,jurisdiction))) end`;
function normalized_jurisdiction(value: unknown): string | null {
  if (value == null || !String(value).trim()) return null;
  const code = String(value).trim().toUpperCase();
  return code === "USVI" ? "VI" : code;
}
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
// Reuse the governed twelve-category vocabulary and precedence already
// declared by v_lighthouse_resource_directory_whole_corpus_v2. Exact-source
// reviewed memberships take precedence. Unreviewed rows retain the existing
// category/layer fallback; navigation never scans descriptions. Raw source
// category text is preserved separately and never rewritten.
const DIRECTORY_UI_CATEGORY_SQL = `coalesce(reviewed_primary_category, case
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(food|nutrition|snap|wic|pantry|meal)' then 'food_nutrition'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(mental health|behavioral health|substance|recovery|healthcare|health care|clinic|hospital|medical|medicaid|medicare)' then 'healthcare'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(housing|shelter|rent|homeless|eviction|mortgage)' then 'housing'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(domestic violence|sexual assault|crisis|safety|trafficking|victim)' then 'safety_crisis'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(legal aid|legal service|civil rights|attorney|lawyer|court help)' then 'legal_civil_rights'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(utility|utilities|energy|electric|water|heating|liheap)' then 'utilities'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(tribal|indigenous|native american|american indian|alaska native)' then 'tribal'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(employment|workforce|labor|job|unemployment|wage)' then 'employment_labor'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(disability|disabled|ada|developmental)' then 'disability'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(veteran|military|va benefit)' then 'veterans'
  when lower(concat_ws(' ',coalesce(category,''),coalesce(layer,''))) ~ '(cash assistance|income support|tanf|ssi|ssdi|public assistance|benefit)' then 'cash_assistance'
  else 'general_resource'
end)`;
const DIRECTORY_CATEGORY_MEMBERSHIP_SQL = `coalesce(reviewed_category_memberships,array[${DIRECTORY_UI_CATEGORY_SQL}])`;

let summary_cache: {
  expires_at: number;
  value: Record<string, unknown>;
} | null = null;
let summary_in_flight: Promise<Record<string, unknown>> | null = null;

function finite_number(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique_strings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

/**
 * Presentation-only normalization for source-preserved multilingual values.
 * The raw source value is retained separately as source_resource_name.
 * This deliberately does not mutate canonical/source data.
 */
export function resource_display_text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.english != null && String(record.english).trim())
      return String(record.english).trim();
    if (record.local != null && String(record.local).trim())
      return String(record.local).trim();
  }

  const raw = String(value).trim();
  if (!raw) return "";

  // Standard JSON object representation.
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.english === "string" && parsed.english.trim())
          return parsed.english.trim();
        if (typeof parsed.local === "string" && parsed.local.trim())
          return parsed.local.trim();
      }
    } catch {
      // Continue to the source-preserved Python-dict representation below.
    }
  }

  // Several preserved workbook cells use Python's single-quoted dict display.
  // Parse only the explicitly labelled English field; never infer a value.
  const english_prefix = "'english': '";
  const english_start = raw.indexOf(english_prefix);
  if (english_start >= 0) {
    const value_start = english_start + english_prefix.length;
    const local_marker = "', 'local':";
    const value_end = raw.indexOf(local_marker, value_start);
    if (value_end > value_start)
      return raw.slice(value_start, value_end).trim();
  }

  return raw;
}

function stable_resource_id(row: any): string {
  return String(
    row.resource_entity_id ?? row.object_ref ?? row.civic_object_uid,
  );
}

function source_reference(row: any) {
  if (row?.run_id && row?.source_candidate_hash) {
    return `whole_corpus:${row.run_id}:${row.source_candidate_hash}`;
  }
  if (row?.source_locator) return `catalog:${row.source_locator}`;
  return row?.object_ref ?? row?.civic_object_uid ?? null;
}

function contacts_for(row: any) {
  const contacts: Array<Record<string, unknown>> = [];
  const source = source_reference(row);
  const resource_id = stable_resource_id(row);

  const add = (
    type: string,
    value: unknown,
    label: string,
    primary: boolean,
  ) => {
    if (value == null || String(value).trim() === "") return;
    contacts.push({
      contact_point_id: `${resource_id}:${type}`,
      contact_type: type,
      contact_value: String(value),
      label,
      is_primary: primary,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: source,
    });
  };

  add("phone", row.phone, "Phone", true);
  add("email", row.email, "Email", !row.phone);
  add("website", row.website_url, "Website", !row.phone && !row.email);
  if (row.filing_portal_url && row.filing_portal_url !== row.website_url) {
    add(
      "filing_portal",
      row.filing_portal_url,
      "Portal",
      !row.phone && !row.email && !row.website_url,
    );
  }
  return contacts;
}

function locations_for(row: any) {
  if (!row.address) return [];
  const resource_id = stable_resource_id(row);
  return [
    {
      location_id: `${resource_id}:source-address`,
      address_line1: String(row.address),
      address_line2: null,
      city: null,
      county: null,
      // A service jurisdiction is not evidence of the physical address state.
      // Preserve the complete source address until structured geography is reviewed.
      state: null,
      postal_code: null,
      country: "US",
      latitude: null,
      longitude: null,
      manual_location_kind: "source_attached_address",
      manual_map_eligible: false,
      manual_source_reference: source_reference(row),
      manual_review_version: PROJECTION_CONTRACT,
    },
  ];
}

function map_resource_row(row: any) {
  const raw_name = String(
    row.source_transcription_correction?.before_fields?.name ??
      row.name ??
      row.organization_name ??
      "[unnamed]",
  );
  const display_name =
    resource_display_text(row.name ?? row.organization_name) || "[unnamed]";
  const category = String(row.ui_category ?? "general_resource");
  const state = normalized_jurisdiction(row.state_code);
  const jurisdiction = normalized_jurisdiction(row.jurisdiction) ?? state;
  const resource_id = stable_resource_id(row);
  const source = source_reference(row);

  const mapped = {
    resource_entity_id: resource_id,
    canonical_id: String(
      row.object_ref ??
        row.source_candidate_hash ??
        row.civic_object_uid ??
        resource_id,
    ),
    source_family_key:
      row.source_object_type ?? row.current_run_role ?? "current_civic_object",
    source_table: DIRECTORY_VIEW,
    source_pk: String(row.object_ref ?? resource_id),
    source_hash: row.source_candidate_hash ?? null,
    resource_name: display_name,
    source_resource_name: raw_name,
    resource_type: String(row.object_class ?? "resource"),
    resource_category: category,
    directory_categories: Array.isArray(row.reviewed_category_memberships)
      ? row.reviewed_category_memberships
      : [category],
    category_review: row.category_review ?? null,
    source_resource_category: row.category ?? row.layer ?? null,
    jurisdiction,
    source_state: row.state_code ?? null,
    source_jurisdiction: row.jurisdiction ?? null,
    jurisdiction_scope:
      jurisdiction === "US" ? "federal" : state ? "state" : "jurisdiction",
    state,
    county: null,
    city: null,
    description: row.description ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    apply_notes: row.apply_notes ?? null,
    service_categories: unique_strings([
      ...(Array.isArray(row.reviewed_category_memberships)
        ? row.reviewed_category_memberships
        : [category]),
      row.layer,
      row.object_class,
    ]),
    verification_status:
      row.data_state ?? row.projection_state ?? "source_attached",
    promotion_status: row.person_facing_ready
      ? "current_person_facing"
      : "current_source_preserved",
    provenance_status: "source_preserved",
    publication_status: "active" as const,
    publication_source_reference: source,
    publication_review_note: row.person_facing_ready
      ? "Current source-authored civic object. Source attachment preserves provenance; it is not an independent re-verification of every underlying fact."
      : "Current source-authored civic object retained for corpus breadth. One or more person-facing access or identity fields remain unresolved; the source record is shown without inventing missing details.",
    projection_contract: PROJECTION_CONTRACT,
    catalog_kind: row.catalog_kind ?? row.source_object_type ?? null,
    object_class: row.object_class ?? null,
    object_ref: row.object_ref ?? null,
    artifact_key: row.artifact_key ?? null,
    artifact_role: row.artifact_role ?? null,
    source_locator: row.source_locator ?? null,
    source_content_sha256: row.source_content_sha256 ?? null,
    parser_version: row.parser_version ?? null,
    current_run_role: row.current_run_role ?? null,
    current_run_engine_version: row.current_run_engine_version ?? null,
    current_run_completed_at: row.current_run_completed_at ?? null,
    field_provenance: row.field_provenance ?? {},
    source_transcription_correction:
      row.source_transcription_correction ?? null,
    has_access_point: Boolean(row.has_access_point),
    person_facing_ready: Boolean(row.person_facing_ready),
    projection_state: row.projection_state ?? null,
    filing_portal: row.filing_portal ?? null,
    filing_portal_url: row.filing_portal_url ?? null,
    statutory_authority: row.statutory_authority ?? null,
    deadline: row.deadline ?? null,
    hours: row.hours ?? null,
    languages: row.languages ?? null,
    publication_lane: "whole_corpus_current",
  };

  return {
    ...mapped,
    contacts: contacts_for({ ...row, ...mapped }),
    locations: locations_for({ ...row, ...mapped }),
    location_resolution: row.address
      ? {
          disposition: "source_attached_address_unverified_for_map",
          location_kind: "source_attached_address",
          map_eligible: false,
          source_reference: source,
          review_note:
            "Address text is preserved from source evidence; no exact geocode is asserted by this projection.",
          review_version: PROJECTION_CONTRACT,
        }
      : {
          disposition: "jurisdiction_only",
          location_kind: "jurisdiction_coverage",
          map_eligible: false,
          source_reference: source,
          review_note:
            "No source-attached physical address is represented for this catalog record.",
          review_version: PROJECTION_CONTRACT,
        },
  };
}

async function load_publishable_resource_directory_summary(): Promise<
  Record<string, unknown>
> {
  const pool = get_pool();
  const result = await pool.query(`
    with catalog as materialized (
      select object_ref,object_class,phone,email,website_url,address,
             ${JURISDICTION_CODE_SQL} as jurisdiction_code,
             person_facing_ready,${DIRECTORY_CATEGORY_MEMBERSHIP_SQL} as directory_categories
        from ${DIRECTORY_VIEW}
    ), totals as (
      select count(*)::int as total_resources,
             count(*) filter(where phone is not null)::int
               + count(*) filter(where email is not null)::int
               + count(*) filter(where website_url is not null)::int as contact_count,
             count(*) filter(where phone is not null or email is not null or website_url is not null)::int as resources_with_contacts,
             count(*) filter(where address is not null)::int as location_count,
             count(*) filter(where address is not null)::int as resources_with_locations,
             count(distinct jurisdiction_code)::int as jurisdiction_count,
             count(*) filter(where object_class='resource')::int as direct_resource_count,
             count(*) filter(where object_class='program')::int as program_count,
             count(*) filter(where person_facing_ready)::int as person_facing_ready_count,
             count(*) filter(where not person_facing_ready)::int as source_preserved_pending_count
        from catalog
    ), memberships as (
      select c.object_ref,c.jurisdiction_code,m.category_key
        from catalog c cross join lateral unnest(c.directory_categories) m(category_key)
    ), category_rows as (
      select category_key as id,count(distinct object_ref)::int as item_count
        from memberships group by category_key
    ), jurisdiction_category_rows as (
      select jurisdiction_code as code,category_key,count(distinct object_ref)::int as category_count
        from memberships where jurisdiction_code is not null group by jurisdiction_code,category_key
    ), jurisdiction_rows as (
      select c.jurisdiction_code as code,count(*)::int as item_count,
             count(*) filter(where c.object_class='resource')::int as direct_resource_count,
             count(*) filter(where c.object_class='program')::int as program_count,
             (select jsonb_object_agg(j.category_key,j.category_count order by j.category_key)
                from jurisdiction_category_rows j where j.code=c.jurisdiction_code) as categories
        from catalog c where c.jurisdiction_code is not null and c.jurisdiction_code<>''
        group by c.jurisdiction_code
    )
    select to_jsonb(totals) as totals,
           coalesce((
             select jsonb_agg(
               jsonb_build_object('id',id,'count',item_count)
               order by item_count desc,id
             )
               from category_rows
           ),'[]'::jsonb) as categories,
           coalesce((
             select jsonb_agg(
               jsonb_build_object(
                 'code',code,
                 'count',item_count,
                 'direct_resource_count',direct_resource_count,
                 'program_count',program_count,
                 'categories',categories
               ) order by code
             )
               from jurisdiction_rows
           ),'[]'::jsonb) as jurisdictions
      from totals
  `);

  const summary_row = result.rows[0] ?? {};
  const totals = summary_row.totals ?? {};
  const categories = Array.isArray(summary_row.categories)
    ? summary_row.categories
    : [];
  const jurisdictions = Array.isArray(summary_row.jurisdictions)
    ? summary_row.jurisdictions
    : [];
  return {
    // total_resources/active_resources remain as compatibility aliases for
    // existing Resource Directory consumers. Civic Map uses the explicit
    // directory-record names so programs are never mislabeled as resources.
    total_directory_records: finite_number(totals.total_resources),
    active_directory_records: finite_number(totals.total_resources),
    total_resources: finite_number(totals.total_resources),
    active_resources: finite_number(totals.total_resources),
    inactive_resources: 0,
    jurisdiction_count: finite_number(totals.jurisdiction_count),
    category_count: categories.length,
    category_counts_overlap: true,
    contact_count: finite_number(totals.contact_count),
    resources_with_contacts: finite_number(totals.resources_with_contacts),
    location_count: finite_number(totals.location_count),
    resources_with_locations: finite_number(totals.resources_with_locations),
    verified_physical_sites: 0,
    exact_mappable_resources: 0,
    direct_resource_count: finite_number(totals.direct_resource_count),
    program_count: finite_number(totals.program_count),
    person_facing_ready_count: finite_number(totals.person_facing_ready_count),
    source_preserved_pending_count: finite_number(
      totals.source_preserved_pending_count,
    ),
    categories: categories.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      count: finite_number(row.count),
    })),
    jurisdictions: jurisdictions.map((row: Record<string, unknown>) => ({
      code: String(row.code),
      count: finite_number(row.count),
      direct_resource_count: finite_number(row.direct_resource_count),
      program_count: finite_number(row.program_count),
      categories: row.categories ?? {},
    })),
    source_lanes: [
      {
        id: "whole_corpus_current",
        count: finite_number(totals.total_resources),
      },
    ],
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v5",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
      activated_at: null,
      source_quality_lanes: ["whole_corpus_current"],
      held_identity_conflicts: null,
    },
    // The Directory summary no longer launches a second whole-corpus state
    // scan. Canonical state remains available from canonicalCore.currentState.
    whole_corpus_state: null,
    projection_contract: PROJECTION_CONTRACT,
    availability:
      finite_number(totals.total_resources) > 0 ? "available" : "unavailable",
  };
}

export async function get_publishable_resource_directory_summary() {
  const now = Date.now();
  if (summary_cache && summary_cache.expires_at > now)
    return summary_cache.value;
  if (summary_in_flight) return summary_in_flight;

  const active_request = load_publishable_resource_directory_summary();
  summary_in_flight = active_request;
  try {
    const value = await active_request;
    summary_cache = { value, expires_at: Date.now() + SUMMARY_CACHE_TTL_MS };
    return value;
  } finally {
    if (summary_in_flight === active_request) summary_in_flight = null;
  }
}

export async function search_publishable_resource_directory(
  input: publishable_resource_directory_search_input = {},
) {
  const pool = get_pool();
  const limit = Math.min(Math.max(Number(input.limit ?? 24), 1), 60);
  const offset = Math.max(Number(input.offset ?? 0), 0);
  const params: unknown[] = [];
  const where: string[] = [];

  if (input.jurisdiction) {
    params.push(normalized_jurisdiction(input.jurisdiction));
    where.push(`${JURISDICTION_CODE_SQL}=$${params.length}`);
  }
  if (input.category) {
    params.push(input.category);
    where.push(`$${params.length}=any(${DIRECTORY_CATEGORY_MEMBERSHIP_SQL})`);
  }
  if (input.query?.trim()) {
    params.push(`%${input.query.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(
      coalesce(name,'') ilike ${p}
      or coalesce(organization_name,'') ilike ${p}
      or coalesce(description,'') ilike ${p}
      or coalesce(eligibility_summary,'') ilike ${p}
      or coalesce(apply_notes,'') ilike ${p}
      or coalesce(phone,'') ilike ${p}
      or coalesce(email,'') ilike ${p}
      or coalesce(website_url,'') ilike ${p}
      or coalesce(address,'') ilike ${p}
      or coalesce(category,'') ilike ${p}
      or coalesce(layer,'') ilike ${p}
    )`);
  }

  const where_sql = where.length ? `where ${where.join(" and ")}` : "";
  const fetch_limit = limit + 1;
  params.push(fetch_limit, offset);
  const limit_param = `$${params.length - 1}`;
  const offset_param = `$${params.length}`;

  const result = await pool.query(
    `select
       public.luminari_stable_uuid_v1(object_ref) as resource_entity_id,
       civic_object_uid,object_ref,source_object_type,object_class,target_surface,run_id::text,
       current_run_role,current_run_engine_version,current_run_completed_at,artifact_key,artifact_role,
       source_locator,source_content_sha256,source_candidate_hash,parser_version,jurisdiction,state_code,
       jurisdiction_resolution_state,section_name,name,organization_name,category,layer,${DIRECTORY_UI_CATEGORY_SQL} as ui_category,phone,email,website_url,
       address,eligibility_summary,apply_notes,description,filing_portal,filing_portal_url,statutory_authority,
       deadline,hours,languages,organization_type,candidate_state,source_created_at,field_provenance,
       has_access_point,projection_state,projection_version,reconciled_at,typed_ready,jurisdiction_ready,
       direct_access_ready,data_state,catalog_kind,person_facing_ready,source_transcription_correction,reviewed_primary_category,reviewed_category_memberships,category_review
     from ${DIRECTORY_VIEW}
     ${where_sql}
     order by name asc nulls last,organization_name asc nulls last,object_ref asc
     limit ${limit_param} offset ${offset_param}`,
    params,
  );

  const has_more = result.rows.length > limit;
  const page_rows = result.rows.slice(0, limit);
  const known_total = offset + page_rows.length + (has_more ? 1 : 0);

  return {
    // Compatibility total: exact on the last page, otherwise a lower bound.
    // Initial rendering never scans the whole filtered catalog merely to
    // compute pagination chrome.
    total: known_total,
    total_is_exact: !has_more,
    has_more,
    limit,
    offset,
    items: page_rows.map(map_resource_row),
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v5",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function get_publishable_resource_directory_detail(
  resource_entity_id: string,
) {
  const pool = get_pool();
  const result = await pool.query(
    `select public.luminari_stable_uuid_v1(object_ref) as resource_entity_id,v.*,
            ${DIRECTORY_UI_CATEGORY_SQL} as ui_category
       from ${DIRECTORY_VIEW} v
      where public.luminari_stable_uuid_v1(object_ref)=$1::uuid
      limit 1`,
    [resource_entity_id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const [candidate_result, artifact_result, quality_result] = await Promise.all(
    [
      pool.query(
        `
      select c.candidate_key,c.run_id::text,c.artifact_key,c.candidate_type,c.source_locator,c.jurisdiction,c.state_code,
             c.section_name,c.name,c.organization_name,c.category,c.layer,c.phone,c.email,c.website_url,c.address,
             c.eligibility_summary,c.apply_notes,c.description,left(c.raw_excerpt,5000) as raw_excerpt,
             c.parser_version,c.candidate_hash,c.source_content_sha256,c.jurisdiction_resolution_state,c.candidate_state,c.payload
        from public.luminari_corpus_candidate_v1 c
       where c.candidate_key=$1
       limit 1
    `,
        [row.object_ref],
      ),
      pool.query(
        `
      select artifact_key,bucket_id,object_name,artifact_role,jurisdiction_hint,semantic_family,generation_label,
             exact_duplicate_of,content_sha256,extracted_text_sha256,extraction_status,byte_size,mimetype,
             storage_created_at,storage_updated_at,observed_at,storage_state,
             (select b.public from storage.buckets b where b.id=a.bucket_id) as bucket_public,
             exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_name) as object_present,
             exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_name and o.updated_at=a.storage_updated_at) as storage_version_matches,
             (select o.updated_at from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_name limit 1) as object_updated_at
        from public.luminari_corpus_source_artifact_v1 a
       where artifact_key=$1
       limit 1
    `,
        [row.artifact_key],
      ),
      pool.query(
        `
      select q.candidate_key,q.run_id::text,q.quality_version,q.artifact_key,q.source_locator,q.effective_name,
             q.state_code,q.jurisdiction,q.category,q.source_priority,q.quality_state,q.quality_reasons,q.evaluated_at
        from public.luminari_corpus_resource_quality_v1 q
       where q.candidate_key=$1
       order by q.evaluated_at desc,q.quality_version
       limit 100
    `,
        [row.object_ref],
      ),
    ],
  );

  return {
    ...map_resource_row(row),
    identity: {
      identity_key: row.source_candidate_hash ?? row.object_ref,
      resolution_state: row.candidate_state ?? "source_object_deterministic",
      candidate_count: 1,
      candidate_keys: [row.object_ref],
      source_artifacts: row.artifact_key ? [row.artifact_key] : [],
      identity_receipt_hash: row.source_candidate_hash ?? null,
    },
    source_candidate: candidate_result.rows[0] ?? null,
    source_artifact: artifact_result.rows[0] ?? null,
    source_access: resource_source_access(
      artifact_result.rows[0],
      ENV.lighthouseSupabaseUrl,
      row.source_content_sha256,
    ),
    quality_history: quality_result.rows ?? [],
  };
}
