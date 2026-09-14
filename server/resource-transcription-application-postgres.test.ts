import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20260914215454_resource_transcription_correction_ledger.sql', import.meta.url),'utf8');
const application = readFileSync(new URL('../supabase/reviewed-data/20260914_colorado_resource_transcription.sql', import.meta.url),'utf8');
const receipts = JSON.parse(readFileSync(new URL('../docs/continuity/colorado-resource-transcription-receipts-20260914.json', import.meta.url),'utf8'));
// The fixture is constructed from the explicit original fields in the reviewed
// receipts. These tests validate application SQL, not the source documents.
// Exact DOCX coordinate/byte checks live in the separate offline verifier.
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create function public.luminari_stable_uuid_v1(text) returns uuid language sql immutable as 'select md5($1)::uuid';
    create table fixture_current (
      civic_object_uid text,object_ref text,run_id uuid,artifact_key text,source_content_sha256 text,
      source_candidate_hash text,source_locator text,object_class text,person_facing_ready boolean,
      name text,organization_name text,phone text,email text,website_url text,address text,
      eligibility_summary text,apply_notes text,description text,verification_status text,
      state_code text,deadline text,field_provenance jsonb);
    create view v_lighthouse_resource_program_catalog_v2 as select * from fixture_current;
    grant select on v_lighthouse_resource_program_catalog_v2 to service_role;`);
  const rows = receipts.map((r: any) => ({
    civic_object_uid:r.civic_object_uid,object_ref:r.object_ref,run_id:r.run_id,
    artifact_key:r.artifact_key,source_content_sha256:r.source_content_sha256,
    source_candidate_hash:r.source_candidate_hash,source_locator:r.source_locator,
    object_class:'resource',person_facing_ready:true,verification_status:'source_attached',
    state_code:'CO',deadline:'Unverified fixture deadline',field_provenance:{},...r.before_fields,
  }));
  await db.query('insert into fixture_current select * from jsonb_populate_recordset(null::fixture_current,$1::jsonb)',[JSON.stringify(rows)]);
  await db.exec(migration);
  return db;
}
async function count_receipts(db: PGlite) {
  return (await db.query('select count(*)::int as count from luminari_resource_transcription_revision_v1')).rows[0].count;
}
describe('exact24 resource correction application transaction', () => {
  it('applies all24 once, replays exactly, and rejects stale source/before values without reporting success', async () => {
    const db = await fixture();
    try {
      const first = await db.exec(application);
      expect((first.at(-1)!.rows[0] as any).colorado_transcription_application.current_applicable_receipts).toBe(24);
      const replay = await db.exec(application);
      expect((replay.at(-1)!.rows[0] as any).colorado_transcription_application.stored_receipts).toBe(24);
      for (const [field, changed] of [['name','Changed upstream'],['source_content_sha256','d'.repeat(64)]]) {
        const original = (await db.query(`select ${field} from fixture_current where object_ref=$1`,[receipts[0].object_ref])).rows[0][field];
        await db.query(`update fixture_current set ${field}=$1 where object_ref=$2`,[changed,receipts[0].object_ref]);
        await expect(db.exec(application)).rejects.toThrow(/(before_values_changed|current_binding_changed)/);
        await db.exec('rollback');
        expect(await count_receipts(db)).toBe(24);
        await db.query(`update fixture_current set ${field}=$1 where object_ref=$2`,[original,receipts[0].object_ref]);
      }
    } finally { await db.close(); }
  },30000);
  it('rolls back all24 inserts when a post-insert projection condition fails', async () => {
    const db = await fixture();
    try {
      await db.exec('alter view v_lighthouse_resource_program_transcribed_v1 rename to fixture_unmodified_wrapper');
      const cols = (await db.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name='fixture_unmodified_wrapper' order by ordinal_position`)).rows.map(r=>String(r.column_name));
      await db.exec(`create view v_lighthouse_resource_program_transcribed_v1 with(security_invoker=true) as
        select ${cols.map(k=>k==='phone'?"'Projection defect'::text as phone":k).join(',')}
        from fixture_unmodified_wrapper;
        grant select on v_lighthouse_resource_program_transcribed_v1 to service_role;`);
      await expect(db.exec(application)).rejects.toThrow('projection_mismatch');
      await db.exec('rollback');
      expect(await count_receipts(db)).toBe(0);
    } finally { await db.close(); }
  },30000);
});
