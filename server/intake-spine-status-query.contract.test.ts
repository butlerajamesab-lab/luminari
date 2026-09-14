import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const analyze_router = readFileSync(
  fileURLToPath(new URL('./routers/analyze.ts', import.meta.url)),
  'utf8',
);

describe('intake spine status query', () => {
  it('aggregates each growing relation before joining it to the session', () => {
    const status_query = analyze_router.slice(
      analyze_router.indexOf('getIntakeSpineStatus:'),
      analyze_router.indexOf('getIntakeIntegrityProjection:', analyze_router.indexOf('getIntakeSpineStatus:')),
    );

    expect(status_query).toContain('left join lateral (');
    expect(status_query).toContain(') artifact_stats on true');
    expect(status_query).toContain(') layer_stats on true');
    expect(status_query).toContain(') audit_stats on true');
    expect(status_query).not.toContain('left join public.intake_artifacts ia');
    expect(status_query).not.toContain('left join public.intake_layer_runs ilr');
    expect(status_query).not.toContain('group by s.intake_session_id');
  });
});
