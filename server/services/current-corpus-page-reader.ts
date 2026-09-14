import { query_with_diagnostics } from "../db";
import { ENV } from "../_core/env";
import { resource_source_access } from "./resource-source-access";

export async function read_current_graph_source(node_id: string) {
  const { rows } = await query_with_diagnostics<Record<string, any>>(
    `select n.node_id,n.source_content_sha256 as expected_sha256,
            a.bucket_id,a.object_name,a.storage_state,a.storage_updated_at,a.content_sha256,
            b.public as bucket_public,(o.id is not null) as object_present,
            o.updated_at as object_updated_at,
            (a.storage_updated_at = o.updated_at) as storage_version_matches
       from public.v_lighthouse_graph_nodes_v1 n
       left join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=n.artifact_key
       left join storage.buckets b on b.id=a.bucket_id
       left join storage.objects o on o.bucket_id=a.bucket_id and o.name=a.object_name
      where n.node_id=$1 limit 1`,
    [node_id],
    { label: "current_graph_bound_source_access", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
  const row = rows[0];
  return { node_id, source_access: resource_source_access(row, ENV.lighthouseSupabaseUrl, row?.expected_sha256) };
}

function bounded_page_size(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 250) : fallback;
}

function nonnegative_offset(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
}

type page_input = { limit?: number; offset?: number };

const MAX_IN_FLIGHT_PAGES = 64;
const in_flight_pages = new Map<string, Promise<unknown>>();

async function share_in_flight_page<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = in_flight_pages.get(key);
  if (existing) return existing as Promise<T>;
  const pending = read();
  if (in_flight_pages.size >= MAX_IN_FLIGHT_PAGES) return pending;
  in_flight_pages.set(key, pending);
  try { return await pending; }
  finally { if (in_flight_pages.get(key) === pending) in_flight_pages.delete(key); }
}

/** Resolve only the returned endpoints. Do not expand the full graph-node view
 * for each side of every edge: that view also hydrates action-source bindings.
 * A conflicting label/type remains unknown instead of multiplying edge rows.
 */
function endpoint_label_ctes(include_to: boolean) {
  return `,
     endpoint_ids as (
       select distinct from_node_id as node_id from page
       ${include_to ? "union select to_node_id from page" : ""}
     ), current_identity as materialized (
       select c.civic_object_uid,c.object_ref,c.object_class,c.name,c.organization_name,
              c.artifact_key,coalesce(nullif(c.state_code,''),nullif(c.jurisdiction,'')) as jurisdiction_code
         from public.v_lighthouse_civic_object_current_v1 c
        where ('object:' || c.civic_object_uid) in (select node_id from endpoint_ids)
           or ('artifact:' || md5(c.artifact_key)) in (select node_id from endpoint_ids)
           or ('jurisdiction:' || coalesce(nullif(c.state_code,''),nullif(c.jurisdiction,''))) in (select node_id from endpoint_ids)
     ), label_candidates as (
       select ('object:' || c.civic_object_uid) as node_id,
              coalesce(nullif(c.name,''),nullif(c.organization_name,''),c.object_class || ' ' || left(c.object_ref,16)) as label,
              c.object_class as node_type
         from current_identity c
       union
       select 'jurisdiction:' || c.jurisdiction_code,c.jurisdiction_code,'jurisdiction'
         from current_identity c where c.jurisdiction_code is not null
       union
       select 'artifact:' || md5(c.artifact_key),coalesce(nullif(a.object_name,''),c.artifact_key),'source_artifact'
         from current_identity c
         left join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=c.artifact_key
        where c.artifact_key is not null
     ), endpoint_labels as (
       select l.node_id,min(l.label) as label,min(l.node_type) as node_type
         from label_candidates l join endpoint_ids i on i.node_id=l.node_id
        group by l.node_id having count(*)=1
     )`;
}

async function read_page(
  projection: string,
  order_by: string,
  params: unknown[],
  input: page_input,
  universe: string,
  endpoint_labels?: "both" | "from",
) {
  const limit = bounded_page_size(input.limit, 100);
  const offset = nonnegative_offset(input.offset);
  const values = [...params, limit, offset];
  // The total and window share one statement snapshot. An empty/out-of-range
  // window still reports the actual filtered total, never a fabricated zero.
  const page_select = endpoint_labels
    ? `select p.*,f.label as from_label,f.node_type as from_node_type${endpoint_labels === "both" ? ",t.label as to_label,t.node_type as to_node_type" : ""}
         from page p left join endpoint_labels f on f.node_id=p.from_node_id
         ${endpoint_labels === "both" ? "left join endpoint_labels t on t.node_id=p.to_node_id" : ""}
        order by ${order_by}`
    : "select * from page";
  const query = `with filtered as materialized (${projection}),
     page as materialized (select * from filtered order by ${order_by}
              limit $${values.length - 1} offset $${values.length})
     ${endpoint_labels ? endpoint_label_ctes(endpoint_labels === "both") : ""}
     select (select count(*)::int from filtered) as total,
            coalesce((select jsonb_agg(to_jsonb(p)) from (${page_select}) p),'[]'::jsonb) as items`;
  const result = await share_in_flight_page(JSON.stringify([query, values]), () =>
    query_with_diagnostics<{ total: number; items: Record<string, unknown>[] }>(
      query, values,
      { label: "current_corpus_connection_page", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
    ),
  );
  return {
    total: Number(result.rows[0]?.total ?? 0), limit, offset,
    items: result.rows[0]?.items ?? [], universe, window_only: true as const,
  };
}

export async function read_current_graph_node_page(input: page_input & {
  node_type?: string; node_id?: string; query?: string;
} = {}) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (input.node_type?.trim()) {
    params.push(input.node_type.trim());
    conditions.push(`node_type = $${params.length}`);
  }
  if (input.node_id?.trim()) {
    params.push(input.node_id.trim());
    conditions.push(`node_id = $${params.length}`);
  }
  if (input.query?.trim()) {
    params.push(`%${input.query.trim()}%`);
    const p = `$${params.length}`;
    conditions.push(`(coalesce(label,'') ilike ${p} or coalesce(jurisdiction_code,'') ilike ${p} or coalesce(source_locator,'') ilike ${p})`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return read_page(
    `select node_id,node_type,label,jurisdiction_code,node_origin,node_state,object_ref,
            artifact_key,source_locator,source_content_sha256,source_candidate_hash,metadata
       from public.v_lighthouse_graph_nodes_v1 ${where}`,
    "case when node_origin='civic_object' then 0 else 1 end,node_type,label,node_id",
    params, input, "v_lighthouse_graph_nodes_v1",
  );
}

export async function read_current_graph_edge_page(input: page_input & {
  edge_type?: string; node_id?: string; semantic_only?: boolean;
} = {}) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (input.edge_type?.trim()) {
    params.push(input.edge_type.trim());
    conditions.push(`e.edge_type = $${params.length}`);
  }
  if (input.node_id?.trim()) {
    params.push(input.node_id.trim());
    conditions.push(`(e.from_node_id = $${params.length} or e.to_node_id = $${params.length})`);
  }
  const source_view = input.semantic_only
    ? "public.v_lighthouse_graph_relationship_edges_v1"
    : "public.v_lighthouse_graph_edges_v2";
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return read_page(
    `select e.edge_id,e.from_node_id,e.to_node_id,e.edge_type,e.evidence_state,e.evidence_hash,e.metadata
       from ${source_view} e ${where}`,
    "edge_type,from_node_id,to_node_id,edge_id",
    params, input, source_view, "both",
  );
}

export async function read_current_unresolved_relationship_page(input: page_input & {
  relationship_type?: string; node_id?: string;
} = {}) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (input.relationship_type?.trim()) {
    params.push(input.relationship_type.trim());
    conditions.push(`u.intended_edge_type = $${params.length}`);
  }
  if (input.node_id?.trim()) {
    params.push(input.node_id.trim());
    conditions.push(`u.from_node_id = $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return read_page(
    `select u.declaration_id,u.from_node_id,u.intended_edge_type,u.source_field,u.target_reference,
            u.resolution_state,u.target_match_count,u.evidence_hash,u.metadata
       from public.v_lighthouse_graph_unresolved_relationships_v1 u ${where}`,
    "resolution_state,intended_edge_type,from_node_id,target_reference,declaration_id",
    params, input, "v_lighthouse_graph_unresolved_relationships_v1", "from",
  );
}
