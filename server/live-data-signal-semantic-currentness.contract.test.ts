import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260811161000_live_data_signal_semantic_currentness.sql', import.meta.url),
  'utf8',
);

describe('Atlas Domain 3 signal semantic currentness in Lighthouse', () => {
  it('preserves append-only signal evidence while collapsing only is_current', () => {
    expect(migration).toContain('live_data_signals is append-only except for the explicit is_current bit');
    expect(migration).toMatch(/set is_current = \(ranked\.current_rank = 1\)/);
    expect(migration).not.toMatch(/update public\.live_data_signals[\s\S]{0,220}set atlas_semantic_key/i);
  });

  it('content-addresses v2 projections by Atlas candidate version rather than detector run time', () => {
    expect(migration).toContain("'projection_contract','atlas_domain3_candidate_projection_v2'");
    expect(migration).toContain("'atlas_candidate_hash',v_atlas_candidate_hash");
    expect(migration).toContain("'atlas_semantic_key',v_semantic_key");
  });

  it('supersedes the prior semantic current row without rewriting immutable evidence', () => {
    expect(migration).toContain('live_data_signal_semantic_transition_v1');
    expect(migration).toContain('set is_current = false');
    expect(migration).toContain('set is_current = true');
    expect(migration).toContain("transition_reason in ('new_version','reactivated_version')");
  });

  it('accepts and validates Atlas candidate identifiers on new v2 rows', () => {
    expect(migration).toContain('atlas_candidate_id uuid');
    expect(migration).toContain('atlas_candidate_hash text');
    expect(migration).toContain('atlas_semantic_key text');
    expect(migration).toContain('atlas_semantic_key_mismatch');
    expect(migration).toContain('atlas_candidate_hash_invalid');
  });
});
