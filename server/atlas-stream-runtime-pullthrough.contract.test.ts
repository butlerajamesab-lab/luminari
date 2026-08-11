import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(new URL('./routes/atlas-domain3-receipt-router.ts', import.meta.url), 'utf8');
const queries = readFileSync(new URL('./canonical-atlas-stream-queries.ts', import.meta.url), 'utf8');
const unifiedRouter = readFileSync(new URL('./routers/unified-router.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260811135000_atlas_stream_runtime_projection.sql', import.meta.url), 'utf8');

describe('Atlas stream/runtime downstream projection', () => {
  it('stores a receipted snapshot in Lighthouse DB rather than making frontend calls to Atlas', () => {
    expect(route).toContain('post("/streams"');
    expect(route).toContain('register_atlas_stream_runtime_snapshot_v1');
    expect(queries).toContain('atlas_stream_runtime_projection_v1');
    expect(unifiedRouter).toContain('get_canonical_atlas_stream_metrics');
    expect(unifiedRouter).toContain('get_canonical_atlas_stream_summary');
  });

  it('keeps Atlas canonical ownership explicit while projecting runtime details', () => {
    for (const field of [
      'stream_id',
      'source_id',
      'jurisdiction_id',
      'module_hint',
      'governance_contract_id',
      'runnable',
      'adapter_name',
      'observation_count',
      'identity_bound_observation_count',
      'observation_classification_count',
      'last_run_status',
      'last_run_outcome',
      'last_error',
      'snapshot_hash',
      'observed_at',
    ]) expect(migration).toContain(field);
    expect(migration).toContain('Not an ownership table');
  });

  it('does not expose the projection table directly to public/anon/authenticated roles', () => {
    expect(migration).toMatch(/revoke all on public\.atlas_stream_runtime_projection_v1 from public, anon, authenticated/);
    expect(migration).toMatch(/revoke all on function public\.register_atlas_stream_runtime_snapshot_v1\(jsonb\)/);
  });
});
