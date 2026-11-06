import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manager = readFileSync(new URL('./engines/data-stream-manager.ts', import.meta.url), 'utf8');

describe('Sovereign data-stream read path (canonical Atlas projection)', () => {
  it('reads stream runtime through the canonical Atlas projection reader, not the legacy registry reader', () => {
    expect(manager).toContain('get_canonical_atlas_stream_metrics');
    expect(manager).toContain('get_canonical_atlas_stream_summary');
    expect(manager).toContain('canonical-atlas-stream-queries');
    expect(manager).not.toContain('get_unified_ingestion_metrics');
    expect(manager).not.toContain('get_unified_ingestion_summary');
    expect(manager).not.toContain('from "../unified-queries"');
  });

  it('overlays signal counts from the canonical Domain 3 signal surface', () => {
    expect(manager).toContain('get_canonical_live_signal_summary');
    expect(manager).toContain('canonical-live-signal-queries');
    expect(manager).toContain('signal_summary.by_stream[stream.stream_id]');
    expect(manager).toContain('total_signals_generated: signal_summary.total_signals');
  });
});
