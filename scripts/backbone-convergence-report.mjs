#!/usr/bin/env node
import "dotenv/config";
import { create_pool } from "./lib/corpus-audit-utils.mjs";
import { buildConvergenceReport } from "./lib/backbone-convergence.mjs";

const CANDIDATE_SOURCE = "luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx";

const CANDIDATE_SQL = `
  select
    disposition_id,
    target_identity->>'agency_id' as agency_id,
    target_identity->>'agency_role' as agency_role,
    target_identity->>'agency_role_name' as agency_role_name,
    target_identity->>'state_code' as state_code,
    target_identity->>'jurisdiction_key' as jurisdiction,
    target_identity->>'official_name' as official_name,
    target_identity->>'official_url' as official_url,
    disposition
  from public.substrate_candidate_disposition
  where source_file = $1
    and candidate_kind = 'normalized_resource'
    and target_identity ? 'agency_role'
  order by target_identity->>'state_code', target_identity->>'agency_role'
`;

const ENTITY_SQL = `
  select
    resource_entity_id,
    canonical_id,
    resource_name,
    resource_type,
    resource_category,
    jurisdiction,
    state,
    verification_status,
    promotion_status,
    metadata->>'official_url' as website
  from public.luminari_resource_entities
  where lower(coalesce(resource_name,'')) ~
    '(protection and advocacy|disability rights|developmental disabilities council|developmental disability council|vocational rehabilitation|division of rehabilitation|rehabilitation services|rehabilitation commission)'
`;

const REGISTRY_SQL = `
  select
    id,
    jurisdiction_id,
    name,
    agency,
    website,
    contact_phone_norm,
    contact_email_norm,
    'unverified'::text as verification_status,
    'legacy_registry'::text as promotion_status
  from public.registry_programs
  where lower(coalesce(name,'') || ' ' || coalesce(agency,'')) ~
    '(protection and advocacy|disability rights|developmental disabilities council|developmental disability council|vocational rehabilitation|division of rehabilitation|rehabilitation services|rehabilitation commission)'
`;

async function main() {
  const { pool, databaseStatus } = create_pool("backbone-convergence-report");
  if (!pool) throw new Error(databaseStatus);

  try {
    const [candidateResult, entityResult, registryResult] = await Promise.all([
      pool.query(CANDIDATE_SQL, [CANDIDATE_SOURCE]),
      pool.query(ENTITY_SQL),
      pool.query(REGISTRY_SQL),
    ]);

    const report = buildConvergenceReport(
      candidateResult.rows,
      entityResult.rows,
      registryResult.rows,
    );

    console.log(JSON.stringify({
      success: true,
      source_file: CANDIDATE_SOURCE,
      candidate_count: candidateResult.rowCount,
      entity_match_pool_count: entityResult.rowCount,
      registry_match_pool_count: registryResult.rowCount,
      ...report,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error?.message ?? String(error) }, null, 2));
  process.exitCode = 1;
});
