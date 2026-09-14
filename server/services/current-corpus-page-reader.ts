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

/** Limit the existing classified projection to active receipt targets first.
 * Reading its whole catalog and then filtering receipts costs a full resource
 * scan. The classified view remains the authority for source/gate validation;
 * these ledger IDs are only lookup candidates, never permission to apply them.
 */
function reviewed_resource_ctes() {
  return `review_targets as materialized (
       select civic_object_uid from public.luminari_resource_transcription_revision_v1 r
        where operation='correct' and not exists (
          select 1 from public.luminari_resource_transcription_revision_v1 s where s.supersedes_revision_id=r.revision_id)
       union
       select civic_object_uid from public.luminari_resource_category_revision_v1 r
        where operation='classify' and not exists (
          select 1 from public.luminari_resource_category_revision_v1 s where s.supersedes_revision_id=r.revision_id)
     ), current_review_identity_counts as materialized (
       select civic_object_uid,count(*) as current_identity_count
         from public.v_lighthouse_civic_object_current_v1
        where civic_object_uid=any(coalesce((select array_agg(civic_object_uid) from review_targets),'{}'::text[]))
        group by civic_object_uid
     ), reviewed_resource_rows as materialized (
       select civic_object_uid,object_ref,run_id,artifact_key,source_content_sha256,source_candidate_hash,source_locator,
              name,organization_name,reviewed_primary_category,reviewed_category_memberships,
              source_transcription_correction,category_review,
              count(*) over(partition by civic_object_uid) as identity_count
         from public.v_lighthouse_resource_program_classified_v1
        where civic_object_uid=any(coalesce((select array_agg(civic_object_uid) from review_targets),'{}'::text[]))
          and person_facing_ready is true and object_class='resource'
          and (source_transcription_correction is not null or category_review is not null)
     ), reviewed_resources as (
       select r.* from reviewed_resource_rows r
         join current_review_identity_counts c using(civic_object_uid)
        where r.identity_count=1 and c.current_identity_count=1
     )`;
}

function reviewed_resource_binding(raw_alias: string, reviewed_alias: string, graph_node: boolean) {
  const uid = graph_node ? `${raw_alias}.node_id='object:' || ${reviewed_alias}.civic_object_uid`
    : `${raw_alias}.civic_object_uid=${reviewed_alias}.civic_object_uid and ${raw_alias}.run_id=${reviewed_alias}.run_id`;
  return `${uid}
      and ${raw_alias}.object_ref=${reviewed_alias}.object_ref
      and ${raw_alias}.artifact_key=${reviewed_alias}.artifact_key
      and ${raw_alias}.source_content_sha256=${reviewed_alias}.source_content_sha256
      and ${raw_alias}.source_candidate_hash=${reviewed_alias}.source_candidate_hash
      and ${raw_alias}.source_locator=${reviewed_alias}.source_locator`;
}

function reviewed_resource_label(raw_label: string, object_ref: string) {
  return `case when r.civic_object_uid is null then ${raw_label}
    else coalesce(nullif(r.name,''),nullif(r.organization_name,''),'resource ' || left(${object_ref},16)) end`;
}

function reviewed_resource_presentation(raw_label: string, raw_category: string) {
  return `case when r.civic_object_uid is null then null else jsonb_build_object(
    'recorded_label',${raw_label},'recorded_category',${raw_category},
    'reviewed_primary_category',r.reviewed_primary_category,
    'reviewed_category_memberships',r.reviewed_category_memberships,
    'source_transcription_correction',r.source_transcription_correction,'category_review',r.category_review) end`;
}

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
              c.artifact_key,c.run_id,c.source_content_sha256,c.source_candidate_hash,c.source_locator,c.category,
              coalesce(nullif(c.state_code,''),nullif(c.jurisdiction,'')) as jurisdiction_code
         from public.v_lighthouse_civic_object_current_v1 c
        where ('object:' || c.civic_object_uid) in (select node_id from endpoint_ids)
           or ('artifact:' || md5(c.artifact_key)) in (select node_id from endpoint_ids)
           or ('jurisdiction:' || coalesce(nullif(c.state_code,''),nullif(c.jurisdiction,''))) in (select node_id from endpoint_ids)
     ), label_candidates as (
       select ('object:' || c.civic_object_uid) as node_id,
              ${reviewed_resource_label("coalesce(nullif(c.name,''),nullif(c.organization_name,''),c.object_class || ' ' || left(c.object_ref,16))", "c.object_ref")} as label,
              c.object_class as node_type,
              ${reviewed_resource_presentation("coalesce(nullif(c.name,''),nullif(c.organization_name,''),c.object_class || ' ' || left(c.object_ref,16))", "c.category")} as presentation
         from current_identity c
         left join reviewed_resources r on ${reviewed_resource_binding("c", "r", false)}
       union
       select 'jurisdiction:' || c.jurisdiction_code,c.jurisdiction_code,'jurisdiction',null::jsonb
         from current_identity c where c.jurisdiction_code is not null
       union
       select 'artifact:' || md5(c.artifact_key),coalesce(nullif(a.object_name,''),c.artifact_key),'source_artifact',null::jsonb
         from current_identity c
         left join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=c.artifact_key
        where c.artifact_key is not null
     ), endpoint_labels as (
       select l.node_id,min(l.label) as label,min(l.node_type) as node_type,(jsonb_agg(l.presentation)->0) as presentation
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
    ? `select p.*,f.label as from_label,f.node_type as from_node_type,f.presentation as from_presentation${endpoint_labels === "both" ? ",t.label as to_label,t.node_type as to_node_type,t.presentation as to_presentation" : ""}
         from page p left join endpoint_labels f on f.node_id=p.from_node_id
         ${endpoint_labels === "both" ? "left join endpoint_labels t on t.node_id=p.to_node_id" : ""}
        order by ${order_by}`
    : "select * from page";
  const query = `with ${reviewed_resource_ctes()},filtered as materialized (${projection}),
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
    conditions.push(`(coalesce(label,'') ilike ${p} or coalesce(jurisdiction_code,'') ilike ${p} or coalesce(source_locator,'') ilike ${p}
      or coalesce(presentation->>'recorded_label','') ilike ${p}
      or coalesce(presentation->>'reviewed_primary_category','') ilike ${p}
      or coalesce((presentation->'reviewed_category_memberships')::text,'') ilike ${p})`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return read_page(
    `select * from (
       select n.node_id,n.node_type,${reviewed_resource_label("n.label", "n.object_ref")} as label,
              n.jurisdiction_code,n.node_origin,n.node_state,n.object_ref,n.artifact_key,n.source_locator,
              n.source_content_sha256,n.source_candidate_hash,n.metadata,
              ${reviewed_resource_presentation("n.label", "n.metadata->>'category'")} as presentation
         from public.v_lighthouse_graph_nodes_v1 n
         left join reviewed_resources r on ${reviewed_resource_binding("n", "r", true)}
      ) presented_nodes ${where}`,
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
