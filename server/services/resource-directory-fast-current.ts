import { getPool } from "../db";

export type PublishableResourceDirectorySearchInput = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

const PROJECTION_CONTRACT = "lighthouse_resource_directory_current_v4";
const DIRECTORY_VIEW = "public.v_lighthouse_resource_program_catalog_v2";
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
// Reuse the governed twelve-category vocabulary and precedence already
// declared by v_lighthouse_resource_directory_whole_corpus_v2. The bounded
// public reader classifies only source category/layer labels so summary and
// filtering never scan long descriptions merely to draw navigation. Raw
// source category text is preserved separately and never rewritten.
const DIRECTORY_UI_CATEGORY_SQL = `case
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
end`;

let summaryCache: { expiresAt: number; value: Record<string, unknown> } | null =
  null;
let summaryInFlight: Promise<Record<string, unknown>> | null = null;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
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
export function resourceDisplayText(value: unknown): string {
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
  const englishPrefix = "'english': '";
  const englishStart = raw.indexOf(englishPrefix);
  if (englishStart >= 0) {
    const valueStart = englishStart + englishPrefix.length;
    const localMarker = "', 'local':";
    const valueEnd = raw.indexOf(localMarker, valueStart);
    if (valueEnd > valueStart) return raw.slice(valueStart, valueEnd).trim();
  }

  return raw;
}

function stableResourceId(row: any): string {
  return String(
    row.resource_entity_id ?? row.object_ref ?? row.civic_object_uid,
  );
}

function sourceReference(row: any) {
  if (row?.run_id && row?.source_candidate_hash) {
    return `whole_corpus:${row.run_id}:${row.source_candidate_hash}`;
  }
  if (row?.source_locator) return `catalog:${row.source_locator}`;
  return row?.object_ref ?? row?.civic_object_uid ?? null;
}

function contactsFor(row: any) {
  const contacts: Array<Record<string, unknown>> = [];
  const source = sourceReference(row);
  const resourceId = stableResourceId(row);

  const add = (
    type: string,
    value: unknown,
    label: string,
    primary: boolean,
  ) => {
    if (value == null || String(value).trim() === "") return;
    contacts.push({
      contact_point_id: `${resourceId}:${type}`,
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

function locationsFor(row: any) {
  if (!row.address) return [];
  const resourceId = stableResourceId(row);
  return [
    {
      location_id: `${resourceId}:source-address`,
      address_line1: String(row.address),
      address_line2: null,
      city: null,
      county: null,
      state: row.state_code ?? null,
      postal_code: null,
      country: "US",
      latitude: null,
      longitude: null,
      manual_location_kind: "source_attached_address",
      manual_map_eligible: false,
      manual_source_reference: sourceReference(row),
      manual_review_version: PROJECTION_CONTRACT,
    },
  ];
}

function mapResourceRow(row: any) {
  const rawName = String(row.name ?? row.organization_name ?? "[unnamed]");
  const displayName =
    resourceDisplayText(row.name ?? row.organization_name) || "[unnamed]";
  const category = String(row.ui_category ?? "general_resource");
  const state = row.state_code ?? null;
  const jurisdiction = row.jurisdiction ?? state ?? null;
  const resourceId = stableResourceId(row);
  const source = sourceReference(row);

  const mapped = {
    resource_entity_id: resourceId,
    canonical_id: String(
      row.object_ref ??
        row.source_candidate_hash ??
        row.civic_object_uid ??
        resourceId,
    ),
    source_family_key:
      row.source_object_type ?? row.current_run_role ?? "current_civic_object",
    source_table: DIRECTORY_VIEW,
    source_pk: String(row.object_ref ?? resourceId),
    source_hash: row.source_candidate_hash ?? null,
    resource_name: displayName,
    source_resource_name: rawName,
    resource_type: String(row.object_class ?? "resource"),
    resource_category: category,
    source_resource_category: row.category ?? row.layer ?? null,
    jurisdiction,
    jurisdiction_scope:
      jurisdiction === "US" ? "federal" : state ? "state" : "jurisdiction",
    state,
    county: null,
    city: null,
    description: row.description ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    apply_notes: row.apply_notes ?? null,
    service_categories: uniqueStrings([category, row.layer, row.object_class]),
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
    contacts: contactsFor({ ...row, ...mapped }),
    locations: locationsFor({ ...row, ...mapped }),
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

async function loadPublishableResourceDirectorySummary(): Promise<
  Record<string, unknown>
> {
  const pool = getPool();
  const result = await pool.query(`
    with catalog as materialized (
      select object_class,phone,email,website_url,address,state_code,jurisdiction,
             person_facing_ready,${DIRECTORY_UI_CATEGORY_SQL} as ui_category
        from ${DIRECTORY_VIEW}
    ), totals as (
      select count(*)::int as total_resources,
             count(*) filter(where phone is not null)::int
               + count(*) filter(where email is not null)::int
               + count(*) filter(where website_url is not null)::int as contact_count,
             count(*) filter(where phone is not null or email is not null or website_url is not null)::int as resources_with_contacts,
             count(*) filter(where address is not null)::int as location_count,
             count(*) filter(where address is not null)::int as resources_with_locations,
             count(distinct upper(coalesce(state_code,jurisdiction)))::int as jurisdiction_count,
             count(*) filter(where object_class='resource')::int as direct_resource_count,
             count(*) filter(where object_class='program')::int as program_count,
             count(*) filter(where person_facing_ready)::int as person_facing_ready_count,
             count(*) filter(where not person_facing_ready)::int as source_preserved_pending_count
        from catalog
    ), category_rows as (
      select ui_category as id,
             count(*)::int as item_count
        from catalog
       group by 1
    ), jurisdiction_category_rows as (
      select upper(coalesce(state_code,jurisdiction)) as code,
             ui_category as category_key,
             count(*)::int as category_count,
             count(*) filter(where object_class='resource')::int as direct_resource_count,
             count(*) filter(where object_class='program')::int as program_count
        from catalog
       where coalesce(state_code,jurisdiction) is not null
       group by 1,2
    ), jurisdiction_rows as (
      select code,
             sum(category_count)::int as item_count,
             sum(direct_resource_count)::int as direct_resource_count,
             sum(program_count)::int as program_count,
             jsonb_object_agg(category_key,category_count order by category_key) as categories
        from jurisdiction_category_rows
       where code is not null and code <> ''
       group by code
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

  const summaryRow = result.rows[0] ?? {};
  const totals = summaryRow.totals ?? {};
  const categories = Array.isArray(summaryRow.categories)
    ? summaryRow.categories
    : [];
  const jurisdictions = Array.isArray(summaryRow.jurisdictions)
    ? summaryRow.jurisdictions
    : [];
  return {
    // total_resources/active_resources remain as compatibility aliases for
    // existing Resource Directory consumers. Civic Map uses the explicit
    // directory-record names so programs are never mislabeled as resources.
    total_directory_records: finiteNumber(totals.total_resources),
    active_directory_records: finiteNumber(totals.total_resources),
    total_resources: finiteNumber(totals.total_resources),
    active_resources: finiteNumber(totals.total_resources),
    inactive_resources: 0,
    jurisdiction_count: finiteNumber(totals.jurisdiction_count),
    category_count: categories.length,
    contact_count: finiteNumber(totals.contact_count),
    resources_with_contacts: finiteNumber(totals.resources_with_contacts),
    location_count: finiteNumber(totals.location_count),
    resources_with_locations: finiteNumber(totals.resources_with_locations),
    verified_physical_sites: 0,
    exact_mappable_resources: 0,
    direct_resource_count: finiteNumber(totals.direct_resource_count),
    program_count: finiteNumber(totals.program_count),
    person_facing_ready_count: finiteNumber(totals.person_facing_ready_count),
    source_preserved_pending_count: finiteNumber(
      totals.source_preserved_pending_count,
    ),
    categories: categories.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      count: finiteNumber(row.count),
    })),
    jurisdictions: jurisdictions.map((row: Record<string, unknown>) => ({
      code: String(row.code),
      count: finiteNumber(row.count),
      direct_resource_count: finiteNumber(row.direct_resource_count),
      program_count: finiteNumber(row.program_count),
      categories: row.categories ?? {},
    })),
    source_lanes: [
      {
        id: "whole_corpus_current",
        count: finiteNumber(totals.total_resources),
      },
    ],
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v4",
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
      finiteNumber(totals.total_resources) > 0 ? "available" : "unavailable",
  };
}

export async function getPublishableResourceDirectorySummary() {
  const now = Date.now();
  if (summaryCache && summaryCache.expiresAt > now) return summaryCache.value;
  if (summaryInFlight) return summaryInFlight;

  const activeRequest = loadPublishableResourceDirectorySummary();
  summaryInFlight = activeRequest;
  try {
    const value = await activeRequest;
    summaryCache = { value, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS };
    return value;
  } finally {
    if (summaryInFlight === activeRequest) summaryInFlight = null;
  }
}

export async function searchPublishableResourceDirectory(
  input: PublishableResourceDirectorySearchInput = {},
) {
  const pool = getPool();
  const limit = Math.min(Math.max(Number(input.limit ?? 24), 1), 60);
  const offset = Math.max(Number(input.offset ?? 0), 0);
  const params: unknown[] = [];
  const where: string[] = [];

  if (input.jurisdiction) {
    params.push(input.jurisdiction.toUpperCase());
    where.push(`upper(coalesce(state_code,jurisdiction))=$${params.length}`);
  }
  if (input.category) {
    params.push(input.category);
    where.push(`${DIRECTORY_UI_CATEGORY_SQL}=$${params.length}`);
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

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const fetchLimit = limit + 1;
  params.push(fetchLimit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

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
       direct_access_ready,data_state,catalog_kind,person_facing_ready
     from ${DIRECTORY_VIEW}
     ${whereSql}
     order by name asc nulls last,organization_name asc nulls last,object_ref asc
     limit ${limitParam} offset ${offsetParam}`,
    params,
  );

  const hasMore = result.rows.length > limit;
  const pageRows = result.rows.slice(0, limit);
  const knownTotal = offset + pageRows.length + (hasMore ? 1 : 0);

  return {
    // Compatibility total: exact on the last page, otherwise a lower bound.
    // Initial rendering never scans the whole filtered catalog merely to
    // compute pagination chrome.
    total: knownTotal,
    total_is_exact: !hasMore,
    has_more: hasMore,
    limit,
    offset,
    items: pageRows.map(mapResourceRow),
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v4",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function getPublishableResourceDirectoryDetail(
  resourceEntityId: string,
) {
  const pool = getPool();
  const result = await pool.query(
    `select public.luminari_stable_uuid_v1(object_ref) as resource_entity_id,v.*
       from ${DIRECTORY_VIEW} v
      where public.luminari_stable_uuid_v1(object_ref)=$1::uuid
      limit 1`,
    [resourceEntityId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const [candidateResult, artifactResult, qualityResult] = await Promise.all([
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
             storage_created_at,storage_updated_at,observed_at
        from public.luminari_corpus_source_artifact_v1
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
  ]);

  return {
    ...mapResourceRow(row),
    identity: {
      identity_key: row.source_candidate_hash ?? row.object_ref,
      resolution_state: row.candidate_state ?? "source_object_deterministic",
      candidate_count: 1,
      candidate_keys: [row.object_ref],
      source_artifacts: row.artifact_key ? [row.artifact_key] : [],
      identity_receipt_hash: row.source_candidate_hash ?? null,
    },
    source_candidate: candidateResult.rows[0] ?? null,
    source_artifact: artifactResult.rows[0] ?? null,
    quality_history: qualityResult.rows ?? [],
  };
}
