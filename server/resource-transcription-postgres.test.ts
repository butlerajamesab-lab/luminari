import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20260914215454_resource_transcription_correction_ledger.sql', import.meta.url), 'utf8');
const source_hash = 'a'.repeat(64);
const candidate_hash = 'b'.repeat(64);
let db: PGlite;
const revision_id = '11111111-1111-1111-1111-111111111111';
const run_id = '22222222-2222-2222-2222-222222222222';
const base_fields = { name: 'Phone 303-111-1111', phone: null, description: 'Own source notes. Neighbor organization.' };
const correct_fields = { name: 'Example service', phone: '303-111-1111', description: 'Own source notes.' };
const record = {
  revision_id, operation: 'correct', civic_object_uid: 'corpus:example', object_ref: 'example',
  run_id, artifact_key: 'fixture.docx', source_content_sha256: source_hash,
  source_candidate_hash: candidate_hash, source_locator: 'lines:1-4',
  before_fields: base_fields, after_fields: correct_fields,
  source_span: { part: 'word/document.xml', xpath_start: '/w:document/w:body/w:p[1]', xpath_end: '/w:document/w:body/w:p[4]' },
  source_text: 'Example service\n303-111-1111\nOwn source notes.',
  review_ledger_sha256: 'c'.repeat(64), reviewed_by: 'fixture reviewer',
  review_method: 'individual_source_transcription', review_scope: 'source_assertion_only', review_note: 'Fixture only.',
};
async function append(overrides: Record<string, unknown> = {}) {
  const payload = { ...record, ...overrides };
  return db.query(`insert into public.luminari_resource_transcription_revision_v1
    (revision_id,supersedes_revision_id,operation,civic_object_uid,object_ref,resource_entity_id,run_id,
     artifact_key,source_content_sha256,source_candidate_hash,source_locator,before_fields,after_fields,
     source_span,source_text,review_ledger_sha256,reviewed_by,review_method,review_scope,review_note)
    select revision_id,supersedes_revision_id,operation,civic_object_uid,object_ref,
      public.luminari_stable_uuid_v1(object_ref),run_id,artifact_key,source_content_sha256,source_candidate_hash,
      source_locator,before_fields,after_fields,source_span,source_text,review_ledger_sha256,reviewed_by,
      review_method,review_scope,review_note
    from jsonb_populate_record(null::public.luminari_resource_transcription_revision_v1,$1::jsonb)
    on conflict (revision_id) do nothing`, [JSON.stringify(payload)]);
}
async function projected() {
  return (await db.query('select * from public.v_lighthouse_resource_program_transcribed_v1')).rows[0] as any;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create function public.luminari_stable_uuid_v1(text) returns uuid language sql immutable as 'select md5($1)::uuid';
    create table public.fixture_current (
      civic_object_uid text,object_ref text,run_id uuid,artifact_key text,source_content_sha256 text,
      source_candidate_hash text,source_locator text,object_class text,person_facing_ready boolean,
      name text,organization_name text,phone text,email text,website_url text,address text,
      eligibility_summary text,apply_notes text,description text,verification_status text,
      state_code text,deadline text,field_provenance jsonb);
    create view public.v_lighthouse_resource_program_catalog_v2 as select * from public.fixture_current;
    grant select on public.v_lighthouse_resource_program_catalog_v2 to service_role;
    insert into public.fixture_current values (
      'corpus:example','example','${run_id}','fixture.docx','${source_hash}','${candidate_hash}',
      'lines:1-4','resource',true,'Phone 303-111-1111','Phone 303-111-1111',null,null,null,null,
      'Original eligibility','Original apply notes','Own source notes. Neighbor organization.',
      'source_attached','CO','Unverified deadline','{}');`);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db.close(); });

describe('exact-source resource transcription in PostgreSQL', () => {
  it('applies only reviewed display/contact/transcription fields and preserves identity, raw source and verification', async () => {
    await db.exec('set role service_role');
    await append();
    const row = await projected();
    expect(row.name).toBe('Example service');
    expect(row.phone).toBe('303-111-1111');
    expect(row.description).toBe('Own source notes.');
    expect(row.object_ref).toBe('example');
    expect(row.source_locator).toBe('lines:1-4');
    expect(row.verification_status).toBe('source_attached');
    expect(row.person_facing_ready).toBe(true);
    expect(row.deadline).toBe('Unverified deadline');
    expect(row.source_transcription_correction.review_scope).toBe('source_assertion_only');
    await db.exec('reset role');
    expect((await db.query('select description from fixture_current')).rows[0].description).toBe(base_fields.description);
  });
  it('replays the exact receipt without duplicating it', async () => {
    await append();
    await expect(append({ review_note: 'A different receipt under the same ID' })).rejects.toThrow('conflicting_receipt_replay');
    expect((await db.query('select count(*)::int as count from luminari_resource_transcription_revision_v1')).rows[0].count).toBe(1);
  });
  it('rejects unsupported text, legal/identity fields, mismatched before values and source changes', async () => {
    const successor = { revision_id: '33333333-3333-3333-3333-333333333333', supersedes_revision_id: revision_id };
    await expect(append({ ...successor, after_fields: { ...correct_fields, name: 'Invented organization' } })).rejects.toThrow('literal_source_required');
    await expect(append({ ...successor, before_fields: { deadline: 'Unverified deadline' }, after_fields: { deadline: '30 days' } })).rejects.toThrow('field_not_permitted');
    await expect(append({ ...successor, before_fields: { ...base_fields, name: 'Changed before' } })).rejects.toThrow('before_value_changed');
    await expect(append({ ...successor, source_content_sha256: 'd'.repeat(64) })).rejects.toThrow('predecessor_binding_mismatch');
    await expect(append({ ...successor, review_scope: 'independently_verified' })).rejects.toThrow();
  });
  it('fails closed on current hash/run/before-value drift and on held resources without falling back', async () => {
    for (const [field, changed, restored] of [
      ['source_content_sha256', 'd'.repeat(64), source_hash],
      ['source_candidate_hash', 'e'.repeat(64), candidate_hash],
      ['run_id', '44444444-4444-4444-4444-444444444444', run_id],
      ['source_locator', 'lines:5-8', 'lines:1-4'],
      ['name', 'Changed upstream', base_fields.name],
    ]) {
      await db.query(`update fixture_current set ${field}=$1`, [changed]);
      expect((await projected()).source_transcription_correction).toBeNull();
      await db.query(`update fixture_current set ${field}=$1`, [restored]);
    }
    await db.exec('update fixture_current set person_facing_ready=false');
    expect((await projected()).source_transcription_correction).toBeNull();
    expect((await projected()).person_facing_ready).toBe(false);
    await expect(append({ revision_id: '33333333-3333-3333-3333-333333333333', supersedes_revision_id: revision_id })).rejects.toThrow('exact_published_target_required');
    await db.exec('update fixture_current set person_facing_ready=true');
  });
  it('denies public reads/writes and rejects update, delete and truncate even by the owner', async () => {
    await db.exec('set role anon');
    await expect(projected()).rejects.toThrow('permission denied');
    await expect(append()).rejects.toThrow('permission denied');
    await db.exec('reset role');
    await expect(db.exec('update luminari_resource_transcription_revision_v1 set reviewed_by=\'other\'')).rejects.toThrow('append_only');
    await expect(db.exec('delete from luminari_resource_transcription_revision_v1')).rejects.toThrow('append_only');
    await expect(db.exec('truncate luminari_resource_transcription_revision_v1')).rejects.toThrow('append_only');
  });
  it('retracts through an appended event without deleting evidence or reviving the older correction', async () => {
    const retract_id = '55555555-5555-5555-5555-555555555555';
    await append({ revision_id: retract_id, supersedes_revision_id: revision_id, operation: 'retract', after_fields: {} });
    expect((await projected()).name).toBe(base_fields.name);
    expect((await projected()).source_transcription_correction).toBeNull();
    expect((await db.query('select count(*)::int as count from luminari_resource_transcription_revision_v1')).rows[0].count).toBe(2);
    await expect(append({ revision_id: '66666666-6666-6666-6666-666666666666', supersedes_revision_id: revision_id })).rejects.toThrow('unique constraint');
  });
  it('allows a service-role correction, successor and retraction with only SELECT/INSERT privileges', async () => {
    const first_id = '77777777-7777-7777-7777-777777777777';
    const successor_id = '88888888-8888-8888-8888-888888888888';
    const retract_id = '99999999-9999-9999-9999-999999999999';
    const target = { object_ref: 'service-chain', civic_object_uid: 'corpus:service-chain' };
    await db.exec(`insert into fixture_current select
      'corpus:service-chain','service-chain',run_id,artifact_key,source_content_sha256,
      source_candidate_hash,source_locator,object_class,person_facing_ready,name,organization_name,
      phone,email,website_url,address,eligibility_summary,apply_notes,description,verification_status,
      state_code,deadline,field_provenance from fixture_current where object_ref='example'`);
    const active = async () => (await db.query(`select * from
      v_lighthouse_resource_program_transcribed_v1 where object_ref='service-chain'`)).rows[0] as any;
    await db.exec('set role service_role');
    try {
      const privileges = (await db.query(`select
        has_table_privilege(current_user,'luminari_resource_transcription_revision_v1','SELECT') as can_read,
        has_table_privilege(current_user,'luminari_resource_transcription_revision_v1','INSERT') as can_insert,
        has_table_privilege(current_user,'luminari_resource_transcription_revision_v1','UPDATE') as can_update,
        has_table_privilege(current_user,'luminari_resource_transcription_revision_v1','DELETE') as can_delete`)).rows[0];
      expect(privileges).toEqual({can_read:true,can_insert:true,can_update:false,can_delete:false});
      await append({ ...target, revision_id: first_id });
      expect((await active()).source_transcription_correction.revision_id).toBe(first_id);
      await append({ ...target, revision_id: successor_id, supersedes_revision_id: first_id,
        review_note: 'A subsequent source transcription review with unchanged source evidence.' });
      expect((await active()).source_transcription_correction.revision_id).toBe(successor_id);
      await append({ ...target, revision_id: retract_id, supersedes_revision_id: successor_id,
        operation: 'retract', after_fields: {} });
      expect((await active()).source_transcription_correction).toBeNull();
      expect((await active()).name).toBe(base_fields.name);
      expect((await db.query(`select count(*)::int as count from
        luminari_resource_transcription_revision_v1 where object_ref='service-chain'`)).rows[0].count).toBe(3);
      await expect(append({ ...target, revision_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        supersedes_revision_id: first_id })).rejects.toThrow('unique constraint');
    } finally {
      await db.exec('reset role');
    }
  });

});
