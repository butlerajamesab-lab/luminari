import { getPool } from "../db";

export type PublishableResourceDirectorySearchInput = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

const PROJECTION_CONTRACT = "lighthouse_resource_directory_whole_corpus_v2";

const CLASSIFICATION_TEXT = `lower(concat_ws(' ',
  coalesce(c.category,''),
  coalesce(c.section_name,''),
  coalesce(c.organization_type,''),
  coalesce(c.name,''),
  coalesce(c.description,'')
))`;

const CATEGORY_SQL = `case
  when ${CLASSIFICATION_TEXT} ~ '(food|nutrition|snap|wic|pantry|meal)' then 'food_nutrition'
  when ${CLASSIFICATION_TEXT} ~ '(mental health|behavioral health|substance|recovery|healthcare|health care|clinic|hospital|medical|medicaid|medicare)' then 'healthcare'
  when ${CLASSIFICATION_TEXT} ~ '(housing|shelter|rent|homeless|eviction|mortgage)' then 'housing'
  when ${CLASSIFICATION_TEXT} ~ '(domestic violence|sexual assault|crisis|safety|trafficking|victim)' then 'safety_crisis'
  when ${CLASSIFICATION_TEXT} ~ '(legal aid|legal service|civil rights|attorney|lawyer|court help)' then 'legal_civil_rights'
  when ${CLASSIFICATION_TEXT} ~ '(utility|utilities|energy|electric|water|heating|liheap)' then 'utilities'
  when ${CLASSIFICATION_TEXT} ~ '(tribal|indigenous|native american|american indian|alaska native)' then 'tribal'
  when ${CLASSIFICATION_TEXT} ~ '(employment|workforce|labor|job|unemployment|wage)' then 'employment_labor'
  when ${CLASSIFICATION_TEXT} ~ '(disability|disabled|ada|developmental)' then 'disability'
  when ${CLASSIFICATION_TEXT} ~ '(veteran|military|va benefit)' then 'veterans'
  when ${CLASSIFICATION_TEXT} ~ '(cash assistance|income support|tanf|ssi|ssdi|public assistance|benefit)' then 'cash_assistance'
  else 'general_resource'
end`;

const SOURCE_CTE = `
with active_snapshot as (
  select snapshot_id
    from public.luminari_resource_snapshot_v1
   where is_current=true and status='active'
   order by activated_at desc nulls last,created_at desc
   limit 1
), snapshot_membership as (
  select distinct on (candidate_key)
         candidate_key as object_ref,
         i.resource_entity_id,
         i.identity_key
    from active_snapshot s
    join public.luminari_resource_snapshot_identity_v1 i
      on i.snapshot_id=s.snapshot_id and i.resolution_state='resolved'
   cross join lateral jsonb_array_elements_text(i.candidate_keys) as k(candidate_key)
   order by candidate_key,i.created_at desc,i.resource_entity_id
), directory_source as (
  select
    c.*,
    coalesce(
      sm.resource_entity_id,
      public.luminari_resource_identity_uuid_v1(
        encode(
          digest(
            'lighthouse-resource-directory-v2|' || c.artifact_key || '|' || c.source_locator || '|' || c.object_class,
            'sha256'
          ),
          'hex'
        )
      )
    ) as resource_entity_id,
    sm.resource_entity_id is not null as legacy_identity_preserved,
    sm.identity_key as legacy_identity_key,
    ${CATEGORY_SQL} as ui_category
  from public.v_lighthouse_resource_program_catalog_v2 c
  left join snapshot_membership sm on sm.object_ref=c.object_ref
  where c.person_facing_ready
)`;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function sourceReference(row: any) {
  return row?.run_id && row?.source_candidate_hash
    ? `whole_corpus:${row.run_id}:${row.source_candidate_hash}`
    : null;
}

function contactsFor(row: any) {
  const contacts: Array<Record<string, unknown>> = [];
  const source = sourceReference(row);

  if (row.phone) {
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:phone`,
      contact_type: "phone",
      contact_value: String(row.phone),
      label: "Phone",
      is_primary: true,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: source,
    });
  }
  if (row.email) {
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:email`,
      contact_type: "email",
      contact_value: String(row.email),
      label: "Email",
      is_primary: !row.phone,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: source,
    });
  }
  if (row.website_url) {
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:website`,
      contact_type: "website",
      contact_value: String(row.website_url),
      label: "Website",
      is_primary: !row.phone && !row.email,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: source,
    });
  }
  if (row.filing_portal_url && row.filing_portal_url !== row.website_url) {
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:filing-portal`,
      contact_type: "filing_portal",
      contact_value: String(row.filing_portal_url),
      label: "Portal",
      is_primary: !row.phone && !row.email && !row.website_url,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: source,
    });
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
    manual_review_version: "whole_corpus_resource_directory_v2",
  }];
}

function mapResourceRow(row: any) {
  const category = row.ui_category ?? "general_resource";
  const state = row.state_code ?? null;
  const jurisdiction = row.jurisdiction ?? state ?? null;
  const mapped = {
    resource_entity_id: String(row.resource_entity_id),
    canonical_id: String(row.source_candidate_hash),
    source_family_key: row.current_run_role ?? "whole_corpus",
    source_table: "v_lighthouse_resource_program_catalog_v2",
    source_pk: String(row.object_ref),
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
    verification_status: "source_attached",
    promotion_status: "whole_corpus_current",
    provenance_status: "source_preserved",
    publication_status: "active" as const,
    publication_source_reference: sourceReference(row),
    publication_review_note:
      "Current source-authored civic object recovered from the preserved Lighthouse corpus. Source attachment preserves provenance; it is not an independent re-verification of every underlying fact.",
    projection_contract: PROJECTION_CONTRACT,
    catalog_kind: row.catalog_kind ?? null,
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
  };

  return {
    ...mapped,
    contacts: contactsFor({ ...row, ...mapped }),
    locations: locationsFor({ ...row, ...mapped }),
    location_resolution: row.address ? {
      disposition: "source_attached_address_unverified_for_map",
      location_kind: "source_attached_address",
      map_eligible: false,
      source_reference: sourceReference(row),
      review_note: "Address text is preserved from source evidence; no exact geocode is asserted by this projection.",
      review_version: "whole_corpus_resource_directory_v2",
    } : {
      disposition: "jurisdiction_only",
      location_kind: "jurisdiction_coverage",
      map_eligible: false,
      source_reference: sourceReference(row),
      review_note: "No source-attached physical address is represented for this civic object.",
      review_version: "whole_corpus_resource_directory_v2",
    },
  };
}

async function getWholeCorpusState() {
  const result = await getPool().query(
    `select public.get_lighthouse_civic_object_snapshot_v1() as snapshot`
  );
  return result.rows[0]?.snapshot ?? null;
}

export async function getPublishableResourceDirectorySummary() {
  const pool = getPool();
  const [state, totalsResult, categoriesResult, jurisdictionsResult] = await Promise.all([
    getWholeCorpusState(),
    pool.query(`${SOURCE_CTE}
      select count(*)::int as total_resources,
             count(*) filter(where phone is not null)::int
               + count(*) filter(where email is not null)::int
               + count(*) filter(where website_url is not null)::int
               + count(*) filter(where filing_portal_url is not null and filing_portal_url is distinct from website_url)::int as contact_count,
             count(*) filter(where phone is not null or email is not null or website_url is not null or filing_portal_url is not null)::int as resources_with_contacts,
             count(*) filter(where address is not null)::int as location_count,
             count(*) filter(where address is not null)::int as resources_with_locations,
             count(distinct coalesce(state_code,jurisdiction))::int as jurisdiction_count,
             count(*) filter(where object_class='resource')::int as direct_resource_count,
             count(*) filter(where object_class='program')::int as program_count,
             count(*) filter(where legacy_identity_preserved)::int as legacy_identity_preserved_count
        from directory_source`),
    pool.query(`${SOURCE_CTE}
      select ui_category as id,count(*)::int as count
        from directory_source
       group by ui_category
       order by count desc,id`),
    pool.query(`${SOURCE_CTE}
      select code,count(*)::int as count,
             jsonb_object_agg(category_key,category_count order by category_key) as categories
        from (
          select coalesce(state_code,jurisdiction) as code,ui_category as category_key,count(*)::int as category_count
            from directory_source
           group by coalesce(state_code,jurisdiction),ui_category
        ) x
       where code is not null
       group by code
       order by code`),
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
    categories: categoriesResult.rows.map((row) => ({ id: String(row.id), count: finiteNumber(row.count) })),
    jurisdictions: jurisdictionsResult.rows.map((row) => ({ code: String(row.code), count: finiteNumber(row.count), categories: row.categories ?? {} })),
    current_snapshot: {
      snapshot_id: "whole-corpus-current-v1",
      snapshot_version: "whole_corpus_civic_object_pull_through_v1",
      receipt_hash: null,
      activated_at: null,
      source_quality_lanes: ["fresh_corpus_current", "state_enrichment_current"],
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
      or coalesce(filing_portal,'') ilike ${p}
      or coalesce(address,'') ilike ${p}
      or coalesce(statutorY_authority,'') ilike ${p}
      or coalesce(category,'') ilike ${p}
      or coalesce(section_name,'') ilike ${p}
    )`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const countResult = await pool.query(
    `${SOURCE_CTE} select count(*)::int as total from directory_source ${whereSql}`,
    params,
  );

  const queryParams = [...params, limit, offset];
  const rowsResult = await pool.query(
    `${SOURCE_CTE}
      select *
        from directory_source
        ${whereSql}
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
      snapshot_id: "whole-corpus-current-v1",
      snapshot_version: "whole_corpus_civic_object_pull_through_v1",
      receipt_hash: null,
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function getPublishableResourceDirectoryDetail(resourceEntityId: string) {
  const pool = getPool();
  const result = await pool.query(
    `${SOURCE_CTE}
      select *
        from directory_source
       where resource_entity_id=$1::uuid
       order by legacy_identity_preserved desc,reconciled_at desc
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
      identity_key: row.legacy_identity_key ?? row.source_candidate_hash,
      resolution_state: row.legacy_identity_preserved ? "snapshot_identity_preserved" : "source_object_deterministic",
      candidate_count: 1,
      candidate_keys: [row.object_ref],
      source_artifacts: [row.artifact_key],
      identity_receipt_hash: row.source_candidate_hash,
      legacy_identity_preserved: Boolean(row.legacy_identity_preserved),
    },
    provenance: {
      run_id: row.run_id,
      run_role: row.current_run_role,
      engine_version: row.current_run_engine_version,
      source_locator: row.source_locator,
      source_content_sha256: row.source_content_sha256,
      source_candidate_hash: row.source_candidate_hash,
      parser_version: row.parser_version,
      field_provenance: row.field_provenance ?? {},
      reconciled_at: row.reconciled_at,
    },
    source_candidates: candidateResult.rows,
    source_artifacts: artifactResult.rows,
    quality_receipts: qualityResult.rows,
    source_notice:
      "This directory entry is projected from a current, provenance-bound civic object in the preserved Lighthouse corpus. Unresolved/conflicted objects remain outside the person-facing directory.",
  };
}
