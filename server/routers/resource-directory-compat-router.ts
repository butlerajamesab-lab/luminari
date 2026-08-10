import { router, publicProcedure } from '../trpc';
import { query_with_diagnostics } from '../db';

type live_registry_resource_row = {
  resource_uid: string;
  realm: string;
  source_id: string | null;
  name: string;
  category: string | null;
  jurisdiction: string | null;
  organization: string | null;
  phone: string | null;
  website: string | null;
  eligibility: string | null;
  notes: string | null;
  coverage: string | null;
  created_at: Date | string | null;
  metadata: Record<string, unknown> | null;
};

type live_registry_resource_summary_row = {
  realm: string;
  rows: string | number;
};

function timestamp_to_iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function map_resource(row: live_registry_resource_row) {
  return {
    id: row.resource_uid,
    resourceUid: row.resource_uid,
    sourceId: row.source_id,
    realm: row.realm,
    name: row.name,
    category: row.category,
    jurisdiction: row.jurisdiction,
    organization: row.organization,
    phone: row.phone,
    website: row.website,
    eligibility: row.eligibility,
    notes: row.notes,
    coverage: row.coverage,
    metadata: row.metadata ?? {},
    createdAt: timestamp_to_iso(row.created_at),
    projectionState: 'live_registry_resource_projection' as const,
    deterministic: true,
  };
}

export const resourceDirectoryCompatRouter = router({
  getResources: publicProcedure.query(async () => {
    const [resourcesResult, summaryResult] = await Promise.all([
      query_with_diagnostics<live_registry_resource_row>(
        `select resource_uid, realm, source_id, name, category, jurisdiction,
                organization, phone, website, eligibility, notes, coverage,
                created_at, metadata
           from public.v_registry_resources_unified
          order by name, resource_uid
          limit 1000`,
        [],
        { label: 'resource_directory_live_registry_projection' },
      ),
      query_with_diagnostics<live_registry_resource_summary_row>(
        `select realm, count(*)::text as rows
           from public.v_registry_resources_unified
          group by realm
          order by realm`,
        [],
        { label: 'resource_directory_live_registry_summary' },
      ),
    ]);

    const by_realm = Object.fromEntries(
      summaryResult.rows.map((row) => [row.realm, Number(row.rows)]),
    );
    const total = Object.values(by_realm).reduce((sum, value) => sum + value, 0);

    return {
      resources: resourcesResult.rows.map(map_resource),
      summary: {
        source: 'v_registry_resources_unified',
        projection_state: 'live_registry_resource_projection',
        total_resources: total,
        returned_resources: resourcesResult.rows.length,
        by_realm,
        deterministic: true,
      },
    };
  }),
});
