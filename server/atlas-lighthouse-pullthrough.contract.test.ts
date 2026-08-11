import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const governanceRouter = readFileSync(new URL('./routers/signal-governance.ts', import.meta.url), 'utf8');
const adminDashboard = readFileSync(new URL('./routers/admin-dashboard.ts', import.meta.url), 'utf8');
const canonicalQueries = readFileSync(new URL('./canonical-live-signal-queries.ts', import.meta.url), 'utf8');
const dbDiagnosticServer = readFileSync(new URL('./_core/index.ts', import.meta.url), 'utf8');

describe('Atlas to Lighthouse current-state pull-through', () => {
  it('reads current governed signal presentation from live_data_signals, never detected_signals', () => {
    expect(governanceRouter).toContain('get_canonical_live_signals');
    expect(adminDashboard).toContain('get_canonical_live_signal_summary');
    expect(governanceRouter).not.toMatch(/FROM\s+detected_signals/i);
    expect(adminDashboard).not.toMatch(/FROM\s+detected_signals/i);
    expect(canonicalQueries).toContain('from public.live_data_signals');
    expect(canonicalQueries).toContain("historical_not_current");
  });

  it('preserves derivation provenance needed for Lighthouse drill-down', () => {
    for (const field of [
      'source_event_refs',
      'entity_resolution_status',
      'supporting_statistics',
      'evidence_refs',
      'detection_rule_id',
      'detection_rule_version',
      'engine_id',
      'engine_version',
      'input_hash',
      'signal_hash',
    ]) {
      expect(canonicalQueries).toContain(field);
    }
  });

  it('keeps the deep database diagnostic route on the declared Mission Control contract', () => {
    for (const field of [
      'database:',
      'database_url:',
      'database_version',
      'public_tables',
      'db_diagnostic:',
      'supabase_project:',
      'timestamp:',
    ]) {
      expect(dbDiagnosticServer).toContain(field);
    }
    expect(dbDiagnosticServer).toContain('app.get("/api/db-diagnostic", requireExpressAdmin');
  });
});
