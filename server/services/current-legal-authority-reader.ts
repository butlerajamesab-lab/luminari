import { query_with_diagnostics } from "../db-legacy";

export type Legal_authority_reference = {
  object_ref: string;
  name: string | null;
  description: string | null;
  jurisdiction: string | null;
  state_code: string | null;
  jurisdiction_resolution_state: string | null;
  artifact_key: string;
  source_locator: string;
  source_content_sha256: string | null;
  source_candidate_hash: string;
  field_provenance: Record<string, unknown> | null;
  legal_catalog_ready: boolean;
  data_state: string;
  source_authority_text?: string | null;
  parent_resource_name?: string | null;
};

const reference_columns = `civic_object_uid,object_ref,source_object_type,object_class,target_surface,
  run_id::text,current_run_role,current_run_engine_version,current_run_completed_at,
  artifact_key,artifact_role,source_locator,source_content_sha256,source_candidate_hash,
  parser_version,jurisdiction,state_code,jurisdiction_resolution_state,section_name,name,organization_name,category,layer,
  description,statutory_authority,deadline,candidate_state,source_created_at,field_provenance,
  projection_state,projection_version,reconciled_at,data_state,legal_catalog_ready`;

export function build_legal_authority_page_query(input: {
  query?: string; jurisdiction?: string; limit?: number; offset?: number;
} = {}) {
  const params: unknown[] = [];
  const limit = Math.max(1, Math.min(250, Math.trunc(input.limit ?? 100)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const filters = ["object_class = 'legal_authority'"];
  if (input.query) {
    params.push(`%${input.query}%`);
    const parameter = `$${params.length}`;
    filters.push(`(coalesce(name,'') ilike ${parameter}
      or coalesce(description,'') ilike ${parameter}
      or coalesce(statutory_authority,'') ilike ${parameter}
      or coalesce(category,'') ilike ${parameter}
      or coalesce(layer,'') ilike ${parameter}
      or coalesce(jurisdiction,'') ilike ${parameter})`);
  }
  if (input.jurisdiction) {
    params.push(input.jurisdiction.toUpperCase());
    filters.push(`upper(coalesce(nullif(state_code,''),jurisdiction))=$${params.length}`);
  }
  params.push(limit, offset);
  return {
    params,
    sql: `with filtered as materialized (
      select ${reference_columns}
      from public.v_lighthouse_legal_authority_catalog_v2
      where ${filters.join(" and ")}
    ), visible_page as (
      select * from filtered where legal_catalog_ready is true
      order by name asc nulls last,object_ref asc
      limit $${params.length - 1} offset $${params.length}
    )
    select count(*)::int as inventory_total,
      count(*) filter (where legal_catalog_ready is true)::int as filtered_total,
      count(*) filter (where legal_catalog_ready is not true)::int as held_total,
      count(*) filter (where legal_catalog_ready is not true and data_state='jurisdiction_conflict')::int as jurisdiction_conflict_total,
      count(*) filter (where legal_catalog_ready is not true and data_state='jurisdiction_unresolved')::int as jurisdiction_unresolved_total,
      coalesce((select jsonb_agg(to_jsonb(p) order by p.name asc nulls last,p.object_ref asc)
        from visible_page p),'[]'::jsonb) as items
    from filtered`,
  };
}

export async function read_current_legal_authorities(input: {
  query?: string; jurisdiction?: string; limit?: number; offset?: number;
} = {}) {
  const query = build_legal_authority_page_query(input);
  const result = await query_with_diagnostics<Record<string, unknown>>(query.sql, query.params, { label: "legal_authority_page", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
  const row = result.rows[0];
  if (!row) throw new Error("Legal authority inventory did not return a result");
  const count = (value: unknown) => {
    if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error("Legal authority count was not returned");
    return Number(value);
  };
  return {
    total: count(row.filtered_total),
    inventory_total: count(row.inventory_total),
    held_total: count(row.held_total),
    jurisdiction_conflict_total: count(row.jurisdiction_conflict_total),
    jurisdiction_unresolved_total: count(row.jurisdiction_unresolved_total),
    limit: input.limit ?? 100,
    offset: input.offset ?? 0,
    items: row.items as Legal_authority_reference[],
    catalog: "current_legal_authority_catalog_v2",
    reference_kind: "source_authority_reference",
    window_only: true,
  };
}

export async function read_current_legal_authority(object_ref: string) {
  if (!object_ref.trim()) return null;
  const result = await query_with_diagnostics<Legal_authority_reference>(`
    select c.*, p.payload->>'authority' as source_authority_text,
      p.payload->>'parent_resource_name' as parent_resource_name
    from (select ${reference_columns}
      from public.v_lighthouse_legal_authority_catalog_v2
      where object_ref=$1 and object_class='legal_authority' and legal_catalog_ready is true) c
    left join lateral (
      select payload from public.luminari_corpus_candidate_v1 p
      where p.candidate_hash=c.source_candidate_hash and p.artifact_key=c.artifact_key
        and p.run_id::text=c.run_id and p.source_locator=c.source_locator
        and p.source_content_sha256=c.source_content_sha256
      order by p.created_at desc limit 1
    ) p on true`, [object_ref], { label: "legal_authority_detail", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
  if (result.rows.length > 1) throw new Error("Legal authority reference is ambiguous");
  return (result.rows[0] as Legal_authority_reference | undefined) ?? null;
}
