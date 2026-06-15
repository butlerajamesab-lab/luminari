#!/usr/bin/env node
import "dotenv/config";
import { createPool } from "./lib/corpus-audit-utils.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, dryRun: true, limit: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Number.parseInt(arg.slice("--limit=".length), 10);
  }
  if (args.apply) args.dryRun = false;
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }
  return args;
}

const ENTITY_INSERT_SQL = `
  insert into public.luminari_resource_entities (
    canonical_id, source_family_key, source_table, source_pk, source_hash,
    resource_name, resource_type, resource_category, layer,
    jurisdiction, jurisdiction_scope, state, city,
    description, eligibility_summary, service_categories,
    domains, metadata,
    verification_status, promotion_status, provenance_status
  )
  select
    coalesce(program_id, 'staging_program_' || id::text),
    'address_audit_supplement',
    'registry_entity_staging_programs',
    id::text,
    md5(coalesce(organization_name,'') || '|' || coalesce(program_id,'') || '|' || id::text),
    organization_name,
    coalesce(resource_type, 'resource'),
    coalesce(resource_type, 'resource'),
    'registry_resource',
    coalesce(forensic_provenance->>'state_or_region', forensic_provenance->>'state'),
    'state',
    forensic_provenance->>'state',
    forensic_provenance->>'city',
    forensic_provenance->>'source_file',
    eligibility_summary,
    coalesce(service_categories, '{}'::text[]),
    '[]'::jsonb,
    jsonb_build_object(
      'source','registry_entity_staging_programs',
      'staging_id',id,
      'extraction_id',extraction_id,
      'program_id',program_id,
      'confidence_scores',confidence_scores,
      'geocoding_hints',geocoding_hints,
      'forensic_provenance',forensic_provenance,
      'promotion_note','scripted_staged_resource_promotion'
    ),
    case when forensic_provenance->>'source_file' is not null then 'source_attached' else 'unverified' end,
    case when promotion_ready then 'review_ready' else 'staged_review' end,
    'staging_provenance_attached'
  from public.registry_entity_staging_programs s
  where organization_name is not null
    and trim(organization_name) <> ''
    and not exists (
      select 1 from public.luminari_resource_entities r
      where r.source_table = 'registry_entity_staging_programs'
        and r.source_pk = s.id::text
    )
  order by id
`;

const LOCATION_INSERT_SQL = `
  insert into public.luminari_resource_locations (
    resource_entity_id, address_line1, city, state, postal_code, country,
    coordinate_quality, geocode_source, source_table, source_pk, metadata
  )
  select
    r.resource_entity_id,
    s.forensic_provenance->>'address_line',
    s.forensic_provenance->>'city',
    s.forensic_provenance->>'state',
    s.forensic_provenance->>'postal_code',
    'US',
    'address_ungeocoded',
    'staging_forensic_provenance',
    'registry_entity_staging_programs',
    s.id::text,
    jsonb_build_object('staging_id',s.id,'source','registry_entity_staging_programs')
  from public.registry_entity_staging_programs s
  join public.luminari_resource_entities r
    on r.source_table = 'registry_entity_staging_programs'
   and r.source_pk = s.id::text
  where s.forensic_provenance->>'address_line' is not null
    and trim(s.forensic_provenance->>'address_line') <> ''
    and not exists (
      select 1 from public.luminari_resource_locations l
      where l.source_table = 'registry_entity_staging_programs'
        and l.source_pk = s.id::text
    )
  order by s.id
`;

const CONTACT_INSERT_SQL = `
  with source_contacts as (
    select s.id, r.resource_entity_id, r.canonical_id, 'phone'::text as contact_type, s.phone as contact_value, 'phone'::text as label
    from public.registry_entity_staging_programs s
    join public.luminari_resource_entities r on r.source_table='registry_entity_staging_programs' and r.source_pk=s.id::text
    where s.phone is not null and trim(s.phone) <> ''
    union all
    select s.id, r.resource_entity_id, r.canonical_id, 'email', s.email, 'email'
    from public.registry_entity_staging_programs s
    join public.luminari_resource_entities r on r.source_table='registry_entity_staging_programs' and r.source_pk=s.id::text
    where s.email is not null and trim(s.email) <> ''
    union all
    select s.id, r.resource_entity_id, r.canonical_id, 'url', s.website_url, 'website'
    from public.registry_entity_staging_programs s
    join public.luminari_resource_entities r on r.source_table='registry_entity_staging_programs' and r.source_pk=s.id::text
    where s.website_url is not null and trim(s.website_url) <> ''
  )
  insert into public.luminari_resource_contact_points (
    resource_entity_id, canonical_id, contact_type, contact_value, label,
    is_primary, contact_quality, source_table, source_pk, source_hash, metadata
  )
  select
    resource_entity_id,
    canonical_id,
    contact_type,
    contact_value,
    label,
    true,
    'staged_verified_or_source_attached',
    'registry_entity_staging_programs',
    id::text,
    md5(contact_type || '|' || contact_value || '|' || id::text),
    jsonb_build_object('staging_id', id, 'source', 'registry_entity_staging_programs')
  from source_contacts sc
  where not exists (
    select 1 from public.luminari_resource_contact_points cp
    where cp.source_table='registry_entity_staging_programs'
      and cp.source_pk=sc.id::text
      and cp.contact_type=sc.contact_type
      and cp.contact_value=sc.contact_value
  )
`;

async function countPending(pool, relation, sourceTable) {
  const result = await pool.query(
    `select count(*)::int as count
       from public.registry_entity_staging_programs s
      where s.organization_name is not null
        and trim(s.organization_name) <> ''
        and not exists (
          select 1 from public.${relation} r
           where r.source_table = $1
             and r.source_pk = s.id::text
        )`,
    [sourceTable],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function insertAndCount(pool, sql, limit) {
  const limitedSql = `${sql}${limit ? ` limit ${limit}` : ""}`;
  const result = await pool.query(`with inserted as (${limitedSql} returning 1) select count(*)::int as inserted from inserted`);
  return Number(result.rows[0]?.inserted ?? 0);
}

async function main() {
  const args = parseArgs();
  const { pool, databaseStatus } = createPool("promote-staged-resources");
  if (!pool) throw new Error(databaseStatus);

  const startedAt = Date.now();
  try {
    const before = {
      pendingEntities: await countPending(pool, "luminari_resource_entities", "registry_entity_staging_programs"),
      pendingLocations: await countPending(pool, "luminari_resource_locations", "registry_entity_staging_programs"),
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ success: true, mode: "dry_run", before, runtime_ms: Date.now() - startedAt }, null, 2));
      return;
    }

    await pool.query("begin");
    const insertedEntities = await insertAndCount(pool, ENTITY_INSERT_SQL, args.limit);
    const insertedLocations = await insertAndCount(pool, LOCATION_INSERT_SQL, args.limit);
    const insertedContactPoints = await insertAndCount(pool, CONTACT_INSERT_SQL, args.limit);
    await pool.query("commit");

    console.log(JSON.stringify({
      success: true,
      mode: "apply",
      source_table: "registry_entity_staging_programs",
      target_tables: ["luminari_resource_entities", "luminari_resource_locations", "luminari_resource_contact_points"],
      insertedEntities,
      insertedLocations,
      insertedContactPoints,
      runtime_ms: Date.now() - startedAt,
    }, null, 2));
  } catch (error) {
    try { await pool.query("rollback"); } catch {}
    console.error(JSON.stringify({ success: false, error: error?.message ?? String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
