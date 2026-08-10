import { router, publicProcedure } from '../trpc';
import { query_with_diagnostics } from '../db';

type unified_resource_row = {
  resource_uid: string;
  realm: string;
  source_id: string;
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

type resource_realm_count_row = {
  realm: string;
  count: number | string;
};

function to_iso_timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function map_resource(row: unified_resource_row) {
  return {
    id: row.resource_uid,
    resource_uid: row.resource_uid,
    source_id: row.source_id,
    source_table: row.realm,
    name: row.name,
    category: row.category ?? 'general_resource',
    jurisdiction: row.jurisdiction ?? 'NATIONAL',
    organization: row.organization,
    phone: row.phone,
    website: row.website,
    eligibility: row.eligibility,
    notes: row.notes,
    coverage: row.coverage,
    created_at: to_iso_timestamp(row.created_at),
    metadata: row.metadata ?? {},
    projection_state: 'live_registry_resource_projection' as const,
    deterministic: true,
  };
}

export const resourceDirectoryCompatRouter = router({
  getResources: publicProcedure.query(async () => {
    try {
      const [resourcesResult, countsResult] = await Promise.all([
        query_with_diagnostics<unified_resource_row>(
          `select resource_uid, realm, source_id, name, category, jurisdiction,
                  organization, phone, website, eligibility, notes, coverage,
                  created_at, metadata
             from public.v_registry_resources_unified
            order by name, resource_uid
            limit 500`,
          [],
          { label: 'resource_directory_live_registry_resources' },
        ),
        query_with_diagnostics<resource_realm_count_row>(
          `select realm, count(*)::text as count
             from public.v_registry_resources_unified
            group by realm
            order by realm`,
          [],
          { label: 'resource_directory_live_registry_resource_counts' },
        ),
      ]);

      const resources = resourcesResult.rows.map(map_resource);
      const by_realm = Object.fromEntries(
        countsResult.rows.map((row) => [row.realm, Number(row.count) || 0]),
      );
      const total = Object.values(by_realm).reduce((sum, value) => sum + value, 0);

      return {
        resources,
        summary: {
          source: 'v_registry_resources_unified',
          total_resources: total,
          returned_resources: resources.length,
          by_realm,
          deterministic: true,
          projection_state: 'live_registry_resource_projection',
        },
      };
    } catch (error) {
      console.error('[resourceDirectoryCompatRouter.getResources] live registry projection failed', error);
      return {
        resources: [],
        summary: {
          source: 'v_registry_resources_unified',
          total_resources: 0,
          returned_resources: 0,
          by_realm: {},
          deterministic: true,
          projection_state: 'unavailable',
          error: 'live_registry_resource_projection_failed',
        },
      };
    }
  }),
});
