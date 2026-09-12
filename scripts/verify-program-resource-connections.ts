/** Read-only verification of the production program/contact reader.
 * node --import tsx scripts/verify-program-resource-connections.ts [--snapshot file.json]
 * --fixture-sql prints a SELECT-only publication/identity regression query.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROGRAM_RESOURCE_BINDINGS_QUERY, connectProgramResources, loadProgramResources,
  type ProgramResourceBinding } from '../server/services/registry-program-resource-bindings';

function fixtureSql() {
  const cases = ['accepted', 'name_conflict', 'jurisdiction_conflict', 'hidden', 'unverified',
    'staged', 'no_provenance', 'canonical_conflict', 'extraction_conflict', 'duplicate',
    'crosswalk_conflict', 'crosswalk_ambiguous', 'crosswalk_not_best'];
  const programs: any[] = [], stages: any[] = [], extractions: any[] = [], entities: any[] = [];
  const publications: any[] = [], crosswalk: any[] = [];
  for (const [index, id] of cases.entries()) {
    const n = index + 1;
    const uuid = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
    programs.push({ id, name: 'Same exact name', jurisdiction_id: 'WA' });
    stages.push({ id: n, program_id: id, extraction_id: n, organization_name: 'Same exact name' });
    extractions.push({ id: n, program_id: id === 'extraction_conflict' ? 'other' : id,
      name: 'Same exact name', jurisdiction: 'WA', source_file: 'fixture.docx' });
    const entity = { resource_entity_id: uuid, canonical_id: id === 'canonical_conflict' ? 'other' : id,
      source_table: 'registry_entity_staging_programs', source_pk: String(n),
      resource_name: id === 'name_conflict' ? 'Different' : 'Same exact name',
      jurisdiction: id === 'jurisdiction_conflict' ? 'OR' : 'WA',
      promotion_status: id === 'staged' ? 'staged_review' : 'review_ready',
      provenance_status: id === 'no_provenance' ? 'missing' : 'staging_provenance_attached',
      verification_status: id === 'unverified' ? 'unverified' : 'source_attached' };
    entities.push(entity);
    if (id === 'duplicate') entities.push({ ...entity, resource_name: 'Conflicting second copy',
      resource_entity_id: '00000000-0000-0000-0000-000000000999' });
    if (id === 'hidden') publications.push({ resource_entity_id: uuid, publication_status: 'hidden' });
    if (id.startsWith('crosswalk_')) crosswalk.push({
      registry_program_id: id === 'crosswalk_conflict' ? 'other' : id,
      source_table: 'registry_entity_staging_programs', source_id: String(n),
      is_ambiguous: id === 'crosswalk_ambiguous', is_best_match: id !== 'crosswalk_not_best',
    });
  }
  const fixtures: Array<[string, string, any[]]> = [
    ['fixture_programs', 'registry_programs', programs],
    ['fixture_stages', 'registry_entity_staging_programs', stages],
    ['fixture_extractions', 'registry_entity_extraction_v4', extractions],
    ['fixture_entities', 'luminari_resource_entities', entities],
    ['fixture_publications', 'luminari_resource_publication_resolutions', publications],
    ['fixture_crosswalk', 'registry_programs_crosswalk', crosswalk],
    ['fixture_contacts', 'v_luminari_resource_contact_points_current_v3_13', []],
  ];
  let query = PROGRAM_RESOURCE_BINDINGS_QUERY.replace('$1', 'ARRAY(SELECT id FROM fixture_programs)');
  for (const [alias, table] of [...fixtures].sort((a, b) => b[1].length - a[1].length)) {
    query = query.replaceAll(`public.${table}`, alias);
  }
  return query.replace(/^\s*with /, `with ${fixtures.map(([alias, table, rows]) =>
    `${alias} as (select * from jsonb_populate_recordset(null::public.${table}, '${JSON.stringify(rows).replaceAll("'", "''")}'::jsonb))`).join(',\n')},\n`);
}

if (process.argv.includes('--fixture-sql')) {
  console.log(fixtureSql());
} else {
  const snapshotIndex = process.argv.indexOf('--snapshot');
  let programs: any[], bindings: ProgramResourceBinding[];
  if (snapshotIndex >= 0) {
    const snapshot = JSON.parse(readFileSync(process.argv[snapshotIndex + 1], 'utf8'));
    assert.equal(snapshot.query.trim(), PROGRAM_RESOURCE_BINDINGS_QUERY.trim(), 'Snapshot uses an older reader');
    ({ programs, bindings } = snapshot);
  } else {
    const { getPool } = await import('../server/db');
    const pool = getPool();
    try {
      const fixture = await pool.query(fixtureSql());
      assert.deepEqual(fixture.rows.map(row => row.registry_program_id), ['accepted']);
      programs = (await pool.query(`select id, name, contact,
        coalesce(nullif(contact_website_norm,''),nullif(website,'')) as website
        from public.registry_programs order by id`)).rows;
      bindings = [];
      for (let offset = 0; offset < programs.length; offset += 100) {
        const page = programs.slice(offset, offset + 100);
        const result = await pool.query(PROGRAM_RESOURCE_BINDINGS_QUERY, [page.map(row => row.id)]);
        bindings.push(...result.rows);
      }
    } finally { await pool.end(); }
  }
  const capturedPool = { query: async (query: string, values: unknown[]) => {
    assert.equal(query, PROGRAM_RESOURCE_BINDINGS_QUERY);
    return { rows: bindings.filter(binding => (values[0] as string[]).includes(binding.registry_program_id)) };
  } };
  const connected: any[] = await loadProgramResources(programs, capturedPool);
  assert.equal(connected.length, programs.length);
  assert.deepEqual(connected.map(row => row.id), programs.map(row => row.id));
  assert.equal(new Set(bindings.map(row => row.registry_program_id)).size, bindings.length);
  assert.equal(new Set(bindings.map(row => row.resource_entity_id)).size, bindings.length);
  assert.deepEqual(connected, connectProgramResources(programs, bindings));
  for (let i = 0; i < programs.length; i++) {
    for (const field of ['contact', 'website']) {
      if (programs[i][field]?.trim()) assert.equal(connected[i][field], programs[i][field]);
    }
  }
  console.log(JSON.stringify({
    verification_mode: snapshotIndex >= 0 ? 'production_reader_with_live_query_snapshot' : 'read_only_live_database',
    query_gate_fixture: snapshotIndex >= 0 ? 'run_separately_with_fixture_sql' : '13_cases_passed',
    input_programs: programs.length, output_programs: connected.length,
    connected_existing_identities: bindings.length,
    with_current_contacts: bindings.filter(row => row.contacts.length > 0).length,
    preserved_contact_records: bindings.reduce((sum, row) => sum + row.contacts.length, 0),
    filled_website_fields: connected.filter(row => row.enriched_fields?.includes('website')).length,
    filled_contact_fields: connected.filter(row => row.enriched_fields?.includes('contact')).length,
    new_programs: 0, writes_performed: 0,
  }, null, 2));
}
