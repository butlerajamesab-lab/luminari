import { getPool } from "../db";

export type PublishableResourceDirectorySearchInput = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

const PROJECTION_CONTRACT = "lighthouse_resource_directory_breadth_v3";
const DIRECTORY_VIEW = "public.v_lighthouse_resource_directory_breadth_v3";

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function sourceReference(row: any) {
  if (row?.run_id && row?.source_candidate_hash) {
    return `whole_corpus:${row.run_id}:${row.source_candidate_hash}`;
  }
  if (row?.source_locator) return `catalog:${row.source_locator}`;
  if (row?.source_lane && row?.source_id) return `${row.source_lane}:${row.source_id}`;
  return row?.resource_record_uid ?? null;
}

function contactsFor(row: any) {
  const contacts: Array<Record<string, unknown>> = [];
  const source = sourceReference(row);

  const add = (type: string, value: unknown, label: string, primary: boolean) => {
    if (value == null || String(value).trim() === "") return;
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:${type}`,
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
  return [{
    location_id: `${row.resource_entity_id}:source-address`,
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
  const category = row.ui_category ?? "general_resource";
  const state = row.state_code ?? null;
  const jurisdiction = row.jurisdiction ?? state ?? null;
  const current = row.publication_lane === "whole_corpus_current";
  const mapped = {
    resource_entity_id: String(row.resource_entity_id),
    canonical_id: String(row.source_candidate_hash ?? row.resource_record_uid),
    source_family_key: row.source_lane ?? row.current_run_role ?? "resource_catalog",
    source_table: DIRECTORY_VIEW,
    source_pk: String(row.object_ref ?? row.resource_record_uid),
    source_hash: row.source_candidate_hash ?? null,
    resource_name: String(row.name ?? row.organization_name ?? "[unnamed]"),
    source_resource_name: String(row.name ?? row.organization_name ?? "[unnamed]"),
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
    service_categories: uniqueStrings([category, row.category, row.object_class]),
    verification_status: row.data_state ?? "source_attached",
    promotion_status: current ? "whole_corpus_current" : "legacy_catalog_preserved",
    provenance_status: "source_preserved",
    publication_status: "active" as const,
    publication_source_reference: sourceReference(row),
    publication_review_note: current
      ? "Current source-authored civic object recovered from the preserved Lighthouse corpus. Source attachment preserves provenance; it is not an independent re-verification of every underlying fact."
      : "Preserved pre-existing Lighthouse resource/program catalog record retained for breadth continuity. The newer reconciliation layer enriches this record but does not suppress it.",
    projection_contract: PROJECTION_CONTRACT,
    catalog_kind: row.catalog_kind ?? row.source_lane ?? null,
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
    legacy_identity_preserved: Boolean(row.legacy_identity_preserved),
    filing_portal: row.filing_portal ?? null,
    filing_portal_url: row.filing_portal_url ?? null,
    statutory_authority: row.statutory_authority ?? null,
    deadline: row.deadline ?? null,
    hours: row.hours ?? null,
    languages: row.languages ?? null,
    source_lane: row.source_lane ?? null,
    publication_lane: row.publication_lane ?? null,
    exact_match_record_count: finiteNumber(row.exact_match_record_count, 1),
    corroborating_lane_count: finiteNumber(row.corroborating_lane_count, 1),
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
          source_reference: sourceReference(row),
          review_note: "Address text is preserved from source evidence; no exact geocode is asserted by this projection.",
          review_version: PROJECTION_CONTRACT,
        }
      : {
          disposition: "jurisdiction_only",
          location_kind: "jurisdiction_coverage",
          map_eligible: false,
          source_reference: sourceReference(row),
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
  const [state, totalsResult, categoriesResult, jurisdictionsResult, lanesResult] = await Promise.all([
    getWholeCorpusState(),
    pool.query(`
      select count(*)::int as total_resources,
             count(*) filter(where phone is not null)::int
               + count(*) filter(where email is not null)::int
               + count(*) filter(where website_url is not null)::int as contact_count,
             count(*) filter(where phone is not null or email is not null or website_url is not null)::int as resources_with_contacts,
             count(*) filter(where address is not null)::int as location_count,
             count(*) filter(where address is not null)::int as resources_with_locations,
             count(distinct coalesce(state_code,jurisdiction))::int as jurisdiction_count,
             count(*) filter(where object_class='resource')::int as direct_resource_count,
             count(*) filter(where object_class='program')::int as program_count,
             count(*) filter(where legacy_identity_preserved)::int as legacy_identity_preserved_count,
             count(*) filter(where corroborating_lane_count > 1)::int as cross_lane_corroborated_count
        from ${DIRECTORY_VIEW}
    `),
    pool.query(`select ui_category as id,count(*)::int as count from ${DIRECTORY_VIEW} group by ui_category order by count desc,id`),
    pool.query(`
      select code,count(*)::int as count,
             jsonb_object_agg(category_key,category_count order by category_key) as categories
        from (
          select coalesce(state_code,jurisdiction) as code,ui_category as category_key,count(*)::int as category_count
            from ${DIRECTORY_VIEW}
           group by coalesce(state_code,jurisdiction),ui_category
        ) x
       where code is not null
       group by code
       order by code
    `),
    pool.query(`select source_lane,count(*)::int as count from ${DIRECTORY_VIEW} group by source_lane order by count desc,source_lane`),
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
    legacy_identity_preserved_count: finiteNumber(totals.legacy_identity_preserved_count),
    cross_lane_corroborated_count: finiteNumber(totals.cross_lane_corroborated_count),
    categories: categoriesResult.rows.map((row) => ({ id: String(row.id), count: finiteNumber(row.count) })),
    jurisdictions: jurisdictionsResult.rows.map((row) => ({ code: String(row.code), count: finiteNumber(row.count), categories: row.categories ?? {} })),
    source_lanes: lanesResult.rows.map((row) => ({ id: String(row.source_lane), count: finiteNumber(row.count) })),
    current_snapshot: {
      snapshot_id: "breadth-preserving-resource-directory-v3",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
      activated_at: null,
      source_quality_lanes: lanesResult.rows.map((row) => String(row.source_lane)),
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
    where.push(`coalesce(state_code,jurisdiction)=$${params.length}`);
  }
  if (input.category) {
    params.push(input.category);
    where.push(`ui_category=$${params.length}`);
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
      or coalesce(source_lane,'') ilike ${p}
    )`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const countResult = await pool.query(`select count(*)::int as total from ${DIRECTORY_VIEW} ${whereSql}`, params);
  const queryParams = [...params, limit, offset];
  const rowsResult = await pool.query(
    `select * from ${DIRECTORY_VIEW} ${whereSql}
     order by name asc nulls last,organization_name asc nulls last,resource_entity_id asc
     limit $${queryParams.length - 1} offset $${queryParams.length}`,
    queryParams,
  );

  return {
    total: finiteNumber(countResult.rows[0]?.total),
    limit,
    offset,
    items: rowsResult.rows.map(mapResourceRow),
    current_snapshot: {
      snapshot_id: "breadth-preserving-resource-directory-v3",
      snapshot_version: PROJECTION_CONTRACT,
      receipt_hash: null,
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function getPublishableResourceDirectoryDetail(resourceEntityId: string) {
  const pool = getPool();
  const result = await pool.query(`select * from ${DIRECTORY_VIEW} where resource_entity_id=$1::uuid limit 1`, [resourceEntityId]);
  const row = result.rows[0];
  if (!row) return null;

  const current = row.publication_lane === "whole_corpus_current";
  const [candidateResult, artifactResult, qualityResult] = current
    ? await Promise.all([
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
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }] as any;

  return {
    ...mapResourceRow(row),
    identity: {
      identity_key: row.legacy_identity_key ?? row.source_candidate_hash ?? row.resource_record_uid,
      resolution_state: current
        ? row.legacy_identity_preserved ? "snapshot_identity_preserved" : "source_object_deterministic"
        : "legacy_catalog_identity_preserved",
      candidate_count: current ? 1 : 0,
      candidate_keys: current ? [row.object_ref] : [],
      source_artifacts: current && row.artifact_key ? [row.artifact_key] : [],
      identity_receipt_hash: row.source_candidate_hash ?? null,
      legacy_identity_preserved: Boolean(row.legacy_identity_preserved),
      exact_match_record_count: finiteNumber(row.exact_match_record_count, 1),
      corroborating_lane_count: finiteNumber(row.corroborating_lane_count, 1),
    },
    provenance: {
      publication_lane: row.publication_lane,
      source_lane: row.source_lane,
      resource_record_uid: row.resource_record_uid,
      run_id: row.run_id,
      run_role: row.current_run_role,
      engine_version: row.current_run_engine_version,
      source_locator: row.source_locator,
      source_content_sha256: row.source_content_sha256,
      source_candidate_hash: row.source_candidate_hash,
      parser_version: row.parser_version,
      field_provenance: row.field_provenance ?? {},
      source_created_at: row.source_created_at,
    },
    source_candidates: candidateResult.rows,
    source_artifacts: artifactResult.rows,
    quality_receipts: qualityResult.rows,
    source_notice: current
      ? "This directory entry is projected from a current, provenance-bound civic object in the preserved Lighthouse corpus."
      : "This directory entry is a preserved pre-existing Lighthouse resource/program catalog record retained for breadth continuity while identity/corroboration is reconciled across lanes.",
  };
}
