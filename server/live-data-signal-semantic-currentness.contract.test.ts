import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const foundation = readFileSync(
  new URL('../supabase/migrations/20260811161132_live_data_signal_semantic_currentness.sql', import.meta.url),
  'utf8',
);
const reviewFixes = readFileSync(
  new URL('../supabase/migrations/20260812084726_live_data_signal_semantic_currentness_review_fixes.sql', import.meta.url),
  'utf8',
);

describe('Atlas Domain 3 signal semantic currentness in Lighthouse', () => {
  it('preserves append-only signal evidence while collapsing only is_current', () => {
    expect(foundation).toContain('live_data_signals is append-only except for the explicit is_current bit');
    expect(foundation).toMatch(/set is_current = \(ranked\.current_rank = 1\)/);
    expect(foundation).not.toMatch(/update public\.live_data_signals[\s\S]{0,220}set atlas_semantic_key/i);
  });

  it('content-addresses v2 projections by Atlas candidate version rather than detector run time', () => {
    expect(foundation).toContain("'projection_contract','atlas_domain3_candidate_projection_v2'");
    expect(foundation).toContain("'atlas_candidate_hash',v_atlas_candidate_hash");
    expect(foundation).toContain("'atlas_semantic_key',v_semantic_key");
  });

  it('aligns cross-category semantic identity with the Atlas owner', () => {
    expect(reviewFixes).toContain("p_detection_rule_id = 'atlas.domain3.cross_category_entity'");
    expect(reviewFixes).toMatch(/then ''[\s\S]*else coalesce\(p_primary_stream_id, ''\)/);
    expect(reviewFixes).toContain('atlas_semantic_key_mismatch');
  });

  it('serializes semantic registration and makes exact replay conflict-safe', () => {
    expect(reviewFixes).toContain('pg_advisory_xact_lock');
    expect(reviewFixes).toContain('hashtextextended(v_semantic_key, 0)');
    expect(reviewFixes).toMatch(/on conflict \(signal_hash\) do nothing/);
    expect(reviewFixes).toContain('live_data_signal_conflict_without_readback');
  });

  it('honors explicit predecessor identity for compatibility writers without weakening Atlas v2', () => {
    expect(reviewFixes).toContain("v_requested_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid");
    expect(reviewFixes).toContain('legacy_supersedes_id_not_found');
    expect(reviewFixes).toContain('legacy_supersedes_id_conflicts_with_semantic_current');
    expect(reviewFixes).toContain('atlas_v2_supersedes_id_not_permitted');
    expect(reviewFixes).toMatch(/supersedes_id,is_current,atlas_candidate_id/);
  });

  it('retains an append-only semantic transition ledger', () => {
    expect(foundation).toContain('live_data_signal_semantic_transition_v1');
    expect(foundation).toContain("transition_reason in ('new_version','reactivated_version')");
    expect(reviewFixes).toContain("v_transition_reason := 'reactivated_version'");
    expect(reviewFixes).toContain("v_transition_reason := 'new_version'");
  });
});
