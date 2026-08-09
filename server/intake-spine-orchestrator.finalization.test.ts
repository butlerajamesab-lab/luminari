import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { finalize_intake_spine_session_if_unchanged } from './intake-spine-orchestrator';

const orchestrator_source = readFileSync(
  fileURLToPath(new URL('./intake-spine-orchestrator.ts', import.meta.url)),
  'utf8',
);

const finalization_input = {
  intake_session_id: '11111111-1111-4111-8111-111111111111',
  session_row_version: '4242',
  jurisdiction: 'WA',
  as_of: '2026-08-08',
  required_layer_count: 14,
  sealed_receipt_count: 14,
};

function finalization_pool(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as Parameters<typeof finalize_intake_spine_session_if_unchanged>[0];
}

describe('intake spine session finalization', () => {
  it('loads only the primary live-upload runtime authority', () => {
    expect(orchestrator_source).toContain('join public.case_intake_links cil');
    expect(orchestrator_source).toContain('and cil.is_primary = true');
    expect(orchestrator_source).toContain("and cil.link_type = 'primary_projection'");
    expect(orchestrator_source).toContain("and s.session_type = 'live'");
    expect(orchestrator_source).toContain("and s.entry_channel = 'upload'");
  });

  it('completes only the session row version captured before execution', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ intake_session_id: finalization_input.intake_session_id }],
    });

    await finalize_intake_spine_session_if_unchanged(finalization_pool(query), finalization_input);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('and xmin::text = $6::text');
    expect(query.mock.calls[0][0]).toContain('returning intake_session_id');
    expect(query.mock.calls[0][1]).toEqual([
      finalization_input.intake_session_id,
      'WA',
      '2026-08-08',
      14,
      14,
      '4242',
    ]);
  });

  it('preserves evidence invalidation when the session changes during execution', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(
      finalize_intake_spine_session_if_unchanged(finalization_pool(query), finalization_input),
    ).rejects.toThrow('intake_spine_orchestrator_session_changed_during_execution');

    expect(query).toHaveBeenCalledTimes(1);
  });
});
