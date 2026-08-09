import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acquire_intake_spine_execution_lease,
  finalize_intake_spine_session_if_unchanged,
} from './intake-spine-orchestrator';

const orchestrator_source = readFileSync(
  fileURLToPath(new URL('./intake-spine-orchestrator.ts', import.meta.url)),
  'utf8',
);
const execution_lease_migration = readFileSync(
  fileURLToPath(
    new URL(
      '../supabase/migrations/20260809054837_fence_intake_spine_execution_leases.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

const finalization_input = {
  intake_session_id: '11111111-1111-4111-8111-111111111111',
  session_row_version: '4242',
  jurisdiction: 'WA',
  as_of: '2026-08-08',
  required_layer_count: 14,
  sealed_receipt_count: 14,
  execution_lease_token: '22222222-2222-4222-8222-222222222222',
};

function finalization_pool(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as Parameters<
    typeof finalize_intake_spine_session_if_unchanged
  >[0];
}

describe('intake spine session finalization', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads only the primary live-upload runtime authority', () => {
    expect(orchestrator_source).toContain('join public.case_intake_links cil');
    expect(orchestrator_source).toContain('and cil.is_primary = true');
    expect(orchestrator_source).toContain(
      "and cil.link_type = 'primary_projection'",
    );
    expect(orchestrator_source).toContain("and s.session_type = 'live'");
    expect(orchestrator_source).toContain("and s.entry_channel = 'upload'");
  });

  it('completes only the session row version captured before execution', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ completed: true }],
    });

    await finalize_intake_spine_session_if_unchanged(
      finalization_pool(query),
      finalization_input,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'public.complete_intake_spine_execution_v1',
    );
    expect(query.mock.calls[0][1]).toEqual([
      finalization_input.intake_session_id,
      '4242',
      finalization_input.execution_lease_token,
      'WA',
      '2026-08-08',
      14,
      14,
    ]);
  });

  it('preserves evidence invalidation when the session changes during execution', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(
      finalize_intake_spine_session_if_unchanged(
        finalization_pool(query),
        finalization_input,
      ),
    ).rejects.toThrow(
      'intake_spine_orchestrator_session_changed_during_execution',
    );

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('uses short pool queries for a durable lease instead of a guarded client checkout', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ renewed: true }] })
      .mockResolvedValueOnce({ rows: [{ released: true }] });
    const connect = vi.fn();

    const lease = await acquire_intake_spine_execution_lease(
      { query, connect } as unknown as Parameters<
        typeof acquire_intake_spine_execution_lease
      >[0],
      finalization_input.intake_session_id,
      {
        lease_token: finalization_input.execution_lease_token,
        lease_seconds: 120,
        heartbeat_interval_ms: 30_000,
      },
    );

    expect(query.mock.calls[0][0]).toContain(
      'public.acquire_intake_spine_execution_lease_v1',
    );
    expect(connect).not.toHaveBeenCalled();
    expect(orchestrator_source).not.toContain('pg_try_advisory_lock');
    expect(orchestrator_source).not.toContain('pg_advisory_unlock');
    expect(
      orchestrator_source.indexOf(
        'const execution_lease = await acquire_intake_spine_execution_lease(',
      ),
    ).toBeLessThan(
      orchestrator_source.indexOf(
        'const session_result = await pool.query<session_row>',
      ),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(query.mock.calls[1][0]).toContain(
      'public.renew_intake_spine_execution_lease_v1',
    );
    lease.assert_active();

    await lease.release();
    await lease.release();
    expect(query.mock.calls[2][0]).toContain(
      'public.release_intake_spine_execution_lease_v1',
    );
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects a concurrent execution before it can persist layer outputs', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ acquired: false }] });

    await expect(
      acquire_intake_spine_execution_lease(
        { query } as unknown as Parameters<
          typeof acquire_intake_spine_execution_lease
        >[0],
        finalization_input.intake_session_id,
        { lease_token: finalization_input.execution_lease_token },
      ),
    ).rejects.toThrow(
      'intake_spine_orchestrator_execution_already_in_progress',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a heartbeat reports that the fencing lease was lost', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ renewed: false }] })
      .mockResolvedValueOnce({ rows: [{ released: false }] });

    const lease = await acquire_intake_spine_execution_lease(
      { query } as unknown as Parameters<
        typeof acquire_intake_spine_execution_lease
      >[0],
      finalization_input.intake_session_id,
      {
        lease_token: finalization_input.execution_lease_token,
        heartbeat_interval_ms: 30_000,
      },
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(lease.assert_active).toThrow(
      'intake_spine_orchestrator_execution_lease_lost',
    );
    await lease.release();
  });

  it('retries transient heartbeat errors without surrendering a still-valid lease', async () => {
    vi.useFakeTimers();
    const console_error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockRejectedValueOnce(new Error('transient pool timeout'))
      .mockResolvedValueOnce({ rows: [{ released: true }] });

    const lease = await acquire_intake_spine_execution_lease(
      { query } as unknown as Parameters<
        typeof acquire_intake_spine_execution_lease
      >[0],
      finalization_input.intake_session_id,
      {
        lease_token: finalization_input.execution_lease_token,
        heartbeat_interval_ms: 30_000,
      },
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(lease.assert_active).not.toThrow();
    expect(console_error).toHaveBeenCalledTimes(1);
    await lease.release();
    console_error.mockRestore();
  });

  it('backs every layer write and final completion with the durable database fence', () => {
    expect(execution_lease_migration).toContain(
      'create table if not exists public.intake_spine_execution_leases',
    );
    expect(execution_lease_migration).toContain(
      'alter table public.intake_spine_execution_leases enable row level security',
    );
    expect(execution_lease_migration).toContain(
      'create or replace function public.register_intake_layer_execution_v4',
    );
    expect(execution_lease_migration).toContain(
      'lease.lease_token = p_execution_lease_token',
    );
    expect(execution_lease_migration).toContain(
      'lease.expires_at > pg_catalog.clock_timestamp()',
    );
    expect(execution_lease_migration).toContain('for update;');
    expect(execution_lease_migration).toContain(
      'create or replace function public.complete_intake_spine_execution_v1',
    );
    expect(execution_lease_migration).toContain(
      'revoke all on function public.register_intake_layer_execution_v3',
    );
  });
});
