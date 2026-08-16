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

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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
    if (record.english != null && String(record.english).trim()) return String(record.english).trim();
    if (record.local != null && String(record.local).trim()) return String(record.local).trim();
  }

  const raw = String(value).trim();
  if (!raw) return "";

  // Standard JSON object representation.
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.english === "string" && parsed.english.trim()) return parsed.english.trim();
        if (typeof parsed.local === "string" && parsed.local.trim()) return parsed.local.trim();
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
  return String(row.resource_entity_id ?? row.object_ref ?? row.civic_object_uid);
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

  const add = (type: string, value: unknown, label: string, primary: boolean) => {
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
    add("filing_portal", row.filing_portal_url, "Portal", !row.phone && !row.email && !row.website_url);
  }
  return contacts;
}

function locationsFor(row: any) {
  if (!row.address) return [];
  const resourceId = stableResourceId(row);
  return [{
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
  }];
}

function mapResourceRow(row: any) {
  const rawName = String(row.name ?? row.organization_name ?? "[unnamed]");
  const displayName = resourceDisplayText(row.name ?? row.organization_name) || "[unnamed]";
  const category = String(row.category ?? row.layer ?? row.object_class ?? "general_resource");
  const state = row.state_code ?? null;
  const jurisdiction = row.jurisdiction ?? state ?? null;
  const resourceId = stableResourceId(row);
  const source = sourceReference(row);

  const mapped = {
    resource_entity_id: resourceId,
    canonical_id: String(row.object_ref ?? row.source_candidate_hash ?? row.civic_object_uid ?? resourceId),
    source_family_key: row.source_object_type ?? row.current_run_role ?? "current_civic_object",
    source_table: DIRECTORY_VIEW,
    source_pk: String(row.object_ref ?? resourceId),
    source_hash: row.source_candidate_hash ?? null,
    resource_name: displayName,
    source_resource_name: rawName,
    resource_type: String(row.object_class ?? "resource"),
    resource_category: category,
    jurisdiction,
    jurisdiction_scope: jurisdiction === "US" ? "federal" : state ? "state" : "jurisdiction",
    state,
    county: null,
    city: null,
    description: row.description ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    apply_notes: row.apply_notes ?? null,
    service_categories: uniqueStrings([category, row.layer, row.object_class]),
    verification_status: row.data_state ?? row.projection_state ?? "source_attached",
    promotion_status: row.person_facing_ready ? "current_person_facing" : "current_source_preserved",
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
          review_note: "Address text is preserved from source evidence; no exact geocode is asserted by this projection.",
          review_version: PROJECTION_CONTRACT,
        }
      : {
          disposition: "jurisdiction_only",
          location_kind: "jurisdiction_coverage",
          map_eligible: false,
          source_reference: source,
          review_note: "No source-attached physical address is represented for this catalog record.",
          review_version: PROJECTION_CONTRACT,
        },
  };
}

async function getWholeCorpusState() {
  const result = await getPool().query(`select public.get_lighthouse_civic_object_snapshot_v1() as snapshot`);
  return result.rows[0]?.snapshot ?? null;
}

export async function getPublishableResourceDirectorySummary() {
  const pool = getPool();
  const [state, totalsResult, categoriesResult, jurisdictionsResult] = await Promise.all([
    getWholeCorpusState(),
    pool.query(`
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
        from ${DIRECTORY_VIEW}
    `),
    pool.query(`
      select coalesce(nullif(category,''),nullif(layer,''),object_class,'general_resource') as id,
             count(*)::int as count
        from ${DIRECTORY_VIEW}
       group by 1
       order by count desc,id
    `),
    pool.query(`
      select code,count(*)::int as count,
             jsonb_object_agg(category_key,category_count order by category_key) as categories
        from (
          select upper(coalesce(state_code,jurisdiction)) as code,
                 coalesce(nullif(category,''),nullif(layer,''),object_class,'general_resource') as category_key,
                 count(*)::int as category_count
            from ${DIRECTORY_VIEW}
           where coalesce(state_code,jurisdiction) is not null
           group by 1,2
        ) x
       where code is not null and code <> ''
       group by code
       order by code
    `),
  ]);

  const totals = totalsResult.rows[0] ?? {};
  return {
    total_resources: finiteNumber(totals.total_resources),
    active_resources: finiteNumber(totals.total_resources),
    inactive_resources: 0,
    jurisdiction_count: finiteNumber(totals.jurisdiction_count),
    category_count: categoriesResult.rows.length,
    contact_count: finiteNumber(totals.contact_count),
    resources_with_contacts: finiteNumber(totals.resources_with_contacts),
    location_count: finiteNumber(totals.location_count),
    resources_with_locations: finiteNumber(totals.resources_with_locations),
    verified_physical_sites: 0,
    exact_mappable_resources: 0,
    direct_resource_count: finiteNumber(totals.direct_resource_count),
    program_count: finiteNumber(totals.program_count),
    person_facing_ready_count: finiteNumber(totals.person_facing_ready_count),
    source_preserved_pending_count: finiteNumber(totals.source_preserved_pending_count),
    categories: categoriesResult.rows.map((row) => ({ id: String(row.id), count: finiteNumber(row.count) })),
    jurisdictions: jurisdictionsResult.rows.map((row) => ({ code: String(row.code), count: finiteNumber(row.count), categories: row.categories ?? {} })),
    source_lanes: [{ id: "whole_corpus_current", count: finiteNumber(totals.total_resources) }],
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v4",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
      activated_at: null,
      source_quality_lanes: ["whole_corpus_current"],
      held_identity_conflicts: finiteNumber((state as any)?.unresolved_or_held),
    },
    whole_corpus_state: state,
    projection_contract: PROJECTION_CONTRACT,
    availability: finiteNumber(totals.total_resources) > 0 ? "available" : "unavailable",
  };
}

export async function searchPublishableResourceDirectory(input: PublishableResourceDirectorySearchInput = {}) {
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
    where.push(`coalesce(nullif(category,''),nullif(layer,''),object_class,'general_resource')=$${params.length}`);
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
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const result = await pool.query(
    `select
       public.luminari_stable_uuid_v1(object_ref) as resource_entity_id,
       civic_object_uid,object_ref,source_object_type,object_class,target_surface,run_id::text,
       current_run_role,current_run_engine_version,current_run_completed_at,artifact_key,artifact_role,
       source_locator,source_content_sha256,source_candidate_hash,parser_version,jurisdiction,state_code,
       jurisdiction_resolution_state,section_name,name,organization_name,category,layer,phone,email,website_url,
       address,eligibility_summary,apply_notes,description,filing_portal,filing_portal_url,statutory_authority,
       deadline,hours,languages,organization_type,candidate_state,source_created_at,field_provenance,
       has_access_point,projection_state,projection_version,reconciled_at,typed_ready,jurisdiction_ready,
       direct_access_ready,data_state,catalog_kind,person_facing_ready,
       count(*) over()::int as filtered_total
     from ${DIRECTORY_VIEW}
     ${whereSql}
     order by name asc nulls last,organization_name asc nulls last,object_ref asc
     limit ${limitParam} offset ${offsetParam}`,
    params,
  );

  return {
    total: finiteNumber(result.rows[0]?.filtered_total),
    limit,
    offset,
    items: result.rows.map(mapResourceRow),
    current_snapshot: {
      snapshot_id: "current-resource-program-catalog-v4",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function getPublishableResourceDirectoryDetail(resourceEntityId: string) {
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
    pool.query(`
      select c.candidate_key,c.run_id::text,c.artifact_key,c.candidate_type,c.source_locator,c.jurisdiction,c.state_code,
             c.section_name,c.name,c.organization_name,c.category,c.layer,c.phone,c.email,c.website_url,c.address,
             c.eligibility_summary,c.apply_notes,c.description,left(c.raw_excerpt,5000) as raw_excerpt,
             c.parser_version,c.candidate_hash,c.source_content_sha256,c.jurisdiction_resolution_state,c.candidate_state,c.payload
        from public.luminari_corpus_candidate_v1 c
       where c.candidate_key=$1
       limit 1
    `, [row.object_ref]),
    pool.query(`
      select artifact_key,bucket_id,object_name,artifact_role,jurisdiction_hint,semantic_family,generation_label,
             exact_duplicate_of,content_sha256,extracted_text_sha256,extraction_status,byte_size,mimetype,
             storage_created_at,storage_updated_at,observed_at
        from public.luminari_corpus_source_artifact_v1
       where artifact_key=$1
       limit 1
    `, [row.artifact_key]),
    pool.query(`
      select q.candidate_key,q.run_id::text,q.quality_version,q.artifact_key,q.source_locator,q.effective_name,
             q.state_code,q.jurisdiction,q.category,q.source_priority,q.quality_state,q.quality_reasons,q.evaluated_at
        from public.luminari_corpus_resource_quality_v1 q
       where q.candidate_key=$1
       order by q.evaluated_at desc,q.quality_version
       limit 100
    `, [row.object_ref]),
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
