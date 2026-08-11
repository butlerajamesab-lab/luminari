import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const middleware = readFileSync(new URL('./_core/express-admin-middleware.ts', import.meta.url), 'utf8');

describe('DB diagnostic admin-gate response contract', () => {
  it('keeps authentication failures structurally compatible with the diagnostic client', () => {
    expect(middleware).toContain('isDatabaseDiagnosticRequest');
    for (const field of [
      'database:',
      'database_url:',
      'database_version:',
      'public_tables:',
      'db_diagnostic:',
      'supabase_project:',
      'timestamp:',
      'diagnostic_state: "auth_gate_failed"',
    ]) expect(middleware).toContain(field);
  });

  it('does not weaken the admin gate for non-diagnostic endpoints', () => {
    expect(middleware).toContain('administrator_required');
    expect(middleware).toContain('authentication_required');
    expect(middleware).toContain('res.locals.runtime_user = user');
    expect(middleware).toContain('return next()');
  });
});
