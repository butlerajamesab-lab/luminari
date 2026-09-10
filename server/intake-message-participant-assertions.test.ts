import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { load_verified_message_author_bindings } from './intake-message-participant-assertions';

const migration = readFileSync(fileURLToPath(new URL('../supabase/migrations/20260910021000_intake_message_participant_assertions.sql', import.meta.url)), 'utf8');
const case11Review = readFileSync(fileURLToPath(new URL('../supabase/verification/20260910021000_case_11_message_participant_assertion_review.sql', import.meta.url)), 'utf8');

describe('canonical message participant assertions', () => {
  it('is append-only, superseding, reviewed, source-bound, and not client-readable', () => {
    expect(migration).toContain('assertion_identity_sha256 text not null unique');
    expect(migration).toContain('supersedes_assertion_id uuid references');
    expect(migration).toContain('before update or delete');
    expect(migration).toContain("review_status in ('pending','verified','rejected')");
    expect(migration).toContain('artifact_id uuid not null references public.intake_artifacts');
    expect(migration).toContain('participant assertion artifact scope mismatch');
    expect(migration).toContain('participant assertion case scope mismatch');
    expect(migration).toContain('participant assertion supersession scope mismatch');
    expect(migration).toContain('participant assertion identity hash mismatch');
    expect(migration).toContain('intake_message_participant_assertion_identity_v1');
    expect(migration).toContain('append_reviewed_intake_message_participant_assertion_v1');
    expect(migration).toContain('explicit reviewed participant assertion receipt required');
    expect(migration).toContain('source-bound participant assertion evidence required');
    expect(migration).toContain('grant execute on function public.append_reviewed_intake_message_participant_assertion_v1');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table public.intake_message_participant_assertions from authenticated');
    expect(migration).toContain('revoke all on function public.validate_intake_message_participant_assertion_scope_v1() from public');
    expect(migration).toContain('revoke all on function public.reject_intake_message_participant_assertion_mutation_v1() from public');
    expect(migration).toContain('grant select on table public.intake_message_participant_assertions to service_role');
  });

  it('rejects null review receipts and missing evidence before attempting an insert', () => {
    expect(migration).not.toContain('pg_catalog.nullif(');
    expect(migration).toContain("v_contact text := nullif(pg_catalog.btrim(p_source_contact_name), '')");
    expect(migration).toContain("p_review_status is null or p_review_status not in ('verified', 'rejected')");
    expect(migration).toContain("pg_catalog.jsonb_typeof(p_review_receipt) is distinct from 'object'");
    expect(migration).toContain("review_receipt is not null and jsonb_typeof(review_receipt) = 'object'");
    expect(migration).toContain("pg_catalog.jsonb_typeof(p_evidence) is distinct from 'object'");
    expect(migration).toContain("pg_catalog.jsonb_typeof(p_evidence->'source_refs') is distinct from 'array'");
    expect(migration).toContain("if pg_catalog.jsonb_array_length(p_evidence->'source_refs') = 0 then");
  });

  it('removes any default service-role table write grants before granting read access', () => {
    const revoke = migration.indexOf('revoke all on table public.intake_message_participant_assertions from service_role;');
    const select = migration.indexOf('grant select on table public.intake_message_participant_assertions to service_role;');
    expect(revoke).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(revoke);
    expect(migration).not.toMatch(/grant\s+(?:all|insert|update|delete|truncate)\b[^;]*intake_message_participant_assertions[^;]*to service_role/i);
  });

  it('ships no inferred case-11 mapping and keeps its reviewed execution path inert', () => {
    expect(case11Review).toContain("v_assertions jsonb := '[]'::jsonb");
    expect(case11Review).toContain('case 11 participant assertions require completed evidence review');
    expect(case11Review).toContain('append_reviewed_intake_message_participant_assertion_v1');
    expect(case11Review.trimEnd()).toMatch(/rollback;$/);
  });

  it('loads only current verified assertions in the exact session/case/artifact scope', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      artifact_key: 'sha256:one', message_direction: 'received', source_contact_name: 'Cheryl',
      author_canonical_name: 'Cheryl Morgan', provenance_ref: 'assertion:one',
    }] });
    const result = await load_verified_message_author_bindings('session-id', 'case-id', { query } as any);
    expect(query.mock.calls[0][0]).toContain("assertion.review_status = 'verified'");
    expect(query.mock.calls[0][0]).toContain('successor.supersedes_assertion_id = assertion.assertion_id');
    expect(query.mock.calls[0][1]).toEqual(['session-id', 'case-id']);
    expect(result).toEqual([expect.objectContaining({ verification_state: 'verified', artifact_key: 'sha256:one' })]);
  });
});
