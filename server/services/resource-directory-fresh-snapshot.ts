import { getPool } from "../db";

export type PublishableResourceDirectorySearchInput = {
  query?: string;
  jurisdiction?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

const PROJECTION_CONTRACT = "luminari_resource_directory_fresh_snapshot_v1";
const CATEGORY_SQL = `case
  when lower(coalesce(i.category,'')) in ('food_nutrition','food_and_nutrition','food_bank') then 'food_nutrition'
  when lower(coalesce(i.category,'')) in ('healthcare','mental_health','mental_health_substance_use','clinic','hospital') then 'healthcare'
  when lower(coalesce(i.category,'')) in ('housing','housing_and_rent','housing_provider','shelter') then 'housing'
  when lower(coalesce(i.category,'')) in ('domestic_violence_safety','domestic_violence_and_safety','safety_crisis') then 'safety_crisis'
  when lower(coalesce(i.category,'')) in ('legal_aid','legal','legal_civil_rights') then 'legal_civil_rights'
  when lower(coalesce(i.category,'')) in ('cash_assistance_income','cash_assistance','benefits','benefits_office') then 'cash_assistance'
  when lower(coalesce(i.category,'')) in ('utilities','utility') then 'utilities'
  when lower(coalesce(i.category,'')) in ('tribal_indigenous','tribal','tribal_service') then 'tribal'
  when lower(coalesce(i.category,'')) in ('labor_employment','employment','employment_labor') then 'employment_labor'
  when lower(coalesce(i.category,''))='disability' then 'disability'
  when lower(coalesce(i.category,''))='veterans' then 'veterans'
  else 'general_resource'
end`;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getCurrentSnapshot() {
  const result = await getPool().query(`
    select snapshot_id::text,snapshot_version,source_quality_lanes,status,is_current,
           resource_count,conflict_count,receipt_hash,created_at,activated_at,metadata
      from public.luminari_resource_snapshot_v1
     where is_current=true and status='active'
     order by activated_at desc nulls last,created_at desc
     limit 1
  `);
  return result.rows[0] ?? null;
}

function sourceReference(snapshot: any) {
  return snapshot?.snapshot_id && snapshot?.receipt_hash
    ? `fresh_resource_snapshot_v1:${snapshot.snapshot_id}:${snapshot.receipt_hash}`
    : null;
}

function contactsFor(row: any) {
  const contacts: Array<Record<string, unknown>> = [];
  if (row.phone) {
    contacts.push({
      contact_point_id: `${row.resource_entity_id}:phone`,
      contact_type: "phone",
      contact_value: String(row.phone),
      label: "Phone",
      is_primary: true,
      contact_quality: "source_attached",
      manually_reviewed: false,
      manual_source_reference: row.publication_source_reference ?? null,
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
      manual_source_reference: row.publication_source_reference ?? null,
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
      manual_source_reference: row.publication_source_reference ?? null,
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
    manual_source_reference: row.publication_source_reference ?? null,
    manual_review_version: "fresh_resource_snapshot_v1",
  }];
}

function mapResourceRow(row: any, snapshot: any) {
  const category = row.ui_category ?? "general_resource";
  const publicationSourceReference = sourceReference(snapshot);
  const mapped = {
    resource_entity_id: String(row.resource_entity_id),
    canonical_id: String(row.identity_key),
    source_family_key: "fresh_corpus_snapshot",
    source_table: "luminari_resource_snapshot_identity_v1",
    source_pk: String(row.identity_key),
    source_hash: row.identity_receipt_hash ?? null,
    resource_name: String(row.canonical_name),
    source_resource_name: String(row.canonical_name),
    resource_type: category,
    resource_category: category,
    jurisdiction: row.jurisdiction ?? row.state_code ?? null,
    jurisdiction_scope: row.jurisdiction === "US" ? "federal" : row.state_code ? "state" : "jurisdiction",
    state: row.state_code ?? null,
    county: null,
    city: null,
    description: row.description ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    apply_notes: row.apply_notes ?? null,
    service_categories: [category],
    verification_status: "source_attached",
    promotion_status: "snapshot_active",
    provenance_status: "source_preserved",
    publication_status: "active" as const,
    publication_source_reference: publicationSourceReference,
    publication_review_note: "Fresh-corpus identity resolved from source-attached registry/backbone evidence. Source attachment is not an independent re-verification of every underlying fact.",
    projection_contract: PROJECTION_CONTRACT,
    snapshot_id: snapshot?.snapshot_id ?? null,
    snapshot_version: snapshot?.snapshot_version ?? null,
    candidate_count: finiteNumber(row.candidate_count),
  };
  return {
    ...mapped,
    contacts: contactsFor({ ...row, ...mapped }),
    locations: locationsFor({ ...row, ...mapped }),
    location_resolution: row.address ? {
      disposition: "source_attached_address_unverified_for_map",
      location_kind: "source_attached_address",
      map_eligible: false,
      source_reference: publicationSourceReference,
      review_note: "Address text is preserved from source evidence; no exact geocode is asserted by the fresh resource snapshot.",
      review_version: "fresh_resource_snapshot_v1",
    } : {
      disposition: "jurisdiction_only",
      location_kind: "jurisdiction_coverage",
      map_eligible: false,
      source_reference: publicationSourceReference,
      review_note: "No source-attached physical address is represented for this identity.",
      review_version: "fresh_resource_snapshot_v1",
    },
  };
}

export async function getPublishableResourceDirectorySummary() {
  const pool = getPool();
  const snapshot = await getCurrentSnapshot();
  if (!snapshot) {
    return {
      total_resources: 0,
      active_resources: 0,
      inactive_resources: 0,
      jurisdiction_count: 0,
      category_count: 0,
      contact_count: 0,
      resources_with_contacts: 0,
      location_count: 0,
      resources_with_locations: 0,
      verified_physical_sites: 0,
      exact_mappable_resources: 0,
      categories: [],
      jurisdictions: [],
      current_snapshot: null,
      projection_contract: PROJECTION_CONTRACT,
      availability: "unavailable",
    };
  }

  const [totalsResult, categoriesResult, jurisdictionsResult] = await Promise.all([
    pool.query(`
      select count(*)::int as total_resources,
             count(*) filter(where phone is not null)::int
             + count(*) filter(where email is not null)::int
             + count(*) filter(where website_url is not null)::int as contact_count,
             count(*) filter(where phone is not null or email is not null or website_url is not null)::int as resources_with_contacts,
             count(*) filter(where address is not null)::int as location_count,
             count(*) filter(where address is not null)::int as resources_with_locations,
             count(distinct coalesce(state_code,jurisdiction))::int as jurisdiction_count
        from public.luminari_resource_snapshot_identity_v1
       where snapshot_id=$1 and resolution_state='resolved'
    `, [snapshot.snapshot_id]),
    pool.query(`
      select ${CATEGORY_SQL} as id,count(*)::int as count
        from public.luminari_resource_snapshot_identity_v1 i
       where i.snapshot_id=$1 and i.resolution_state='resolved'
       group by ${CATEGORY_SQL}
       order by count desc,id
    `, [snapshot.snapshot_id]),
    pool.query(`
      select coalesce(i.state_code,i.jurisdiction) as code,count(*)::int as count,
             jsonb_object_agg(category_key,category_count order by category_key) as categories
        from (
          select i.state_code,i.jurisdiction,${CATEGORY_SQL} as category_key,count(*)::int as category_count
            from public.luminari_resource_snapshot_identity_v1 i
           where i.snapshot_id=$1 and i.resolution_state='resolved'
           group by i.state_code,i.jurisdiction,${CATEGORY_SQL}
        ) i
       group by coalesce(i.state_code,i.jurisdiction)
       order by code
    `, [snapshot.snapshot_id]),
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
    categories: categoriesResult.rows.map(row => ({ id: String(row.id), count: finiteNumber(row.count) })),
    jurisdictions: jurisdictionsResult.rows.map(row => ({ code: String(row.code), count: finiteNumber(row.count), categories: row.categories ?? {} })),
    current_snapshot: {
      snapshot_id: snapshot.snapshot_id,
      snapshot_version: snapshot.snapshot_version,
      receipt_hash: snapshot.receipt_hash,
      activated_at: snapshot.activated_at,
      source_quality_lanes: snapshot.source_quality_lanes,
      held_identity_conflicts: finiteNumber(snapshot.conflict_count),
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function searchPublishableResourceDirectory(input: PublishableResourceDirectorySearchInput = {}) {
  const pool = getPool();
  const snapshot = await getCurrentSnapshot();
  const limit = Math.min(Math.max(Number(input.limit ?? 24), 1), 60);
  const offset = Math.max(Number(input.offset ?? 0), 0);
  if (!snapshot) {
    return { total: 0, limit, offset, items: [], current_snapshot: null, projection_contract: PROJECTION_CONTRACT, availability: "unavailable" };
  }

  const params: unknown[] = [snapshot.snapshot_id];
  const where = ["i.snapshot_id=$1", "i.resolution_state='resolved'"];
  if (input.jurisdiction) {
    params.push(input.jurisdiction.toUpperCase());
    where.push(`coalesce(i.state_code,i.jurisdiction)=$${params.length}`);
  }
  if (input.category) {
    params.push(input.category);
    where.push(`${CATEGORY_SQL}=$${params.length}`);
  }
  if (input.query?.trim()) {
    params.push(`%${input.query.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(
      i.canonical_name ilike ${p} or coalesce(i.organization_name,'') ilike ${p} or coalesce(i.description,'') ilike ${p}
      or coalesce(i.eligibility_summary,'') ilike ${p} or coalesce(i.apply_notes,'') ilike ${p}
      or coalesce(i.phone,'') ilike ${p} or coalesce(i.email,'') ilike ${p} or coalesce(i.website_url,'') ilike ${p}
      or coalesce(i.address,'') ilike ${p} or coalesce(i.state_code,'') ilike ${p} or coalesce(i.jurisdiction,'') ilike ${p}
    )`);
  }
  const whereSql = where.join(" and ");
  const countResult = await pool.query(`select count(*)::int as total from public.luminari_resource_snapshot_identity_v1 i where ${whereSql}`, params);
  params.push(limit, offset);
  const rowsResult = await pool.query(`
    select i.*,${CATEGORY_SQL} as ui_category
      from public.luminari_resource_snapshot_identity_v1 i
     where ${whereSql}
     order by i.canonical_name asc,i.resource_entity_id asc
     limit $${params.length - 1} offset $${params.length}
  `, params);

  return {
    total: finiteNumber(countResult.rows[0]?.total),
    limit,
    offset,
    items: rowsResult.rows.map(row => mapResourceRow(row, snapshot)),
    current_snapshot: {
      snapshot_id: snapshot.snapshot_id,
      snapshot_version: snapshot.snapshot_version,
      receipt_hash: snapshot.receipt_hash,
      held_identity_conflicts: finiteNumber(snapshot.conflict_count),
    },
    projection_contract: PROJECTION_CONTRACT,
    availability: "available",
  };
}

export async function getPublishableResourceDirectoryDetail(resourceEntityId: string) {
  const pool = getPool();
  const snapshot = await getCurrentSnapshot();
  if (!snapshot) return null;
  const result = await pool.query(`
    select i.*,${CATEGORY_SQL} as ui_category
      from public.luminari_resource_snapshot_identity_v1 i
     where i.snapshot_id=$1 and i.resource_entity_id=$2::uuid and i.resolution_state='resolved'
     limit 1
  `, [snapshot.snapshot_id, resourceEntityId]);
  const row = result.rows[0];
  if (!row) return null;

  const [candidateResult, artifactResult, qualityResult] = await Promise.all([
    pool.query(`
      select c.candidate_key,c.run_id::text,c.artifact_key,c.candidate_type,c.source_locator,c.jurisdiction,c.state_code,
             c.section_name,c.name,c.organization_name,c.category,c.layer,c.phone,c.email,c.website_url,c.address,
             c.eligibility_summary,c.apply_notes,c.description,left(c.raw_excerpt,5000) as raw_excerpt,
             c.parser_version,c.candidate_hash,c.source_content_sha256,c.jurisdiction_resolution_state,c.candidate_state,c.payload
        from public.luminari_corpus_candidate_v1 c
       where c.candidate_key in (select jsonb_array_elements_text($1::jsonb))
       order by c.artifact_key,c.source_locator,c.candidate_key
       limit 100
    `, [JSON.stringify(row.candidate_keys ?? [])]),
    pool.query(`
      select artifact_key,bucket_id,object_name,artifact_role,jurisdiction_hint,semantic_family,generation_label,
             exact_duplicate_of,content_sha256,extracted_text_sha256,extraction_status,byte_size,mimetype,
             storage_created_at,storage_updated_at,observed_at
        from public.luminari_corpus_source_artifact_v1
       where artifact_key in (select jsonb_array_elements_text($1::jsonb))
       order by bucket_id,object_name
    `, [JSON.stringify(row.source_artifacts ?? [])]),
    pool.query(`
      select q.candidate_key,q.run_id::text,q.quality_version,q.artifact_key,q.source_locator,q.effective_name,
             q.state_code,q.jurisdiction,q.category,q.source_priority,q.quality_state,q.quality_reasons,q.evaluated_at
        from public.luminari_corpus_resource_quality_v1 q
       where q.candidate_key in (select jsonb_array_elements_text($1::jsonb))
       order by q.candidate_key,q.evaluated_at desc,q.quality_version
       limit 250
    `, [JSON.stringify(row.candidate_keys ?? [])]),
  ]);

  return {
    ...mapResourceRow(row, snapshot),
    identity: {
      identity_key: row.identity_key,
      normalized_name_key: row.normalized_name_key,
      resolution_state: row.resolution_state,
      canonical_candidate_key: row.canonical_candidate_key,
      candidate_count: finiteNumber(row.candidate_count),
      candidate_keys: row.candidate_keys ?? [],
      observed_domains: row.observed_domains ?? [],
      observed_phones: row.observed_phones ?? [],
      identity_receipt_hash: row.identity_receipt_hash,
    },
    provenance: {
      snapshot: {
        snapshot_id: snapshot.snapshot_id,
        snapshot_version: snapshot.snapshot_version,
        receipt_hash: snapshot.receipt_hash,
        activated_at: snapshot.activated_at,
        source_quality_lanes: snapshot.source_quality_lanes,
        held_identity_conflicts: finiteNumber(snapshot.conflict_count),
      },
      canonical_projection: row.provenance ?? {},
      quality_lanes: row.quality_lanes ?? [],
      candidate_variants: candidateResult.rows,
      source_artifacts: artifactResult.rows,
      quality_records: qualityResult.rows,
    },
    projection_contract: PROJECTION_CONTRACT,
  };
}
