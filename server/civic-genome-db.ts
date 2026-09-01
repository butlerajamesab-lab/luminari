/**
 * Civic Genome — Database Read Layer
 *
 * Lighthouse is a read-only observer of the living civic genome.
 * Writes originate from Atlas/Rosetta ingestion pipelines; Lighthouse
 * consumes the five substrate tables as read-through views.
 *
 * Tables (all owned by the genome substrate migration):
 *   civic_genome_family
 *   civic_genome_bill
 *   civic_genome_event
 *   bill_lineage_edge
 *   family_momentum_snapshot
 */
import { getPool } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenomeFamily {
  family_id: string;
  family_key: string;
  family_label: string;
  policy_domain: string;
  family_status: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  first_enacted_at: string | null;
  last_event_at: string | null;
  active_state_count: number;
  introduced_state_count: number;
  enacted_state_count: number;
  failed_state_count: number;
  momentum_score: number;
  acceleration_score: number;
  collapse_score: number;
  signature_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GenomeBill {
  genome_bill_id: string;
  family_id: string;
  bill_id: string;
  state_code: string;
  session_key: string;
  source_bill_number: string;
  source_bill_title: string | null;
  source_bill_url: string | null;
  bill_status: string | null;
  introduced_at: string | null;
  last_action_at: string | null;
  enacted_at: string | null;
  effective_at: string | null;
  last_observed_at: string | null;
  lifecycle_temporal_contract: string | null;
  rosetta_extraction_run_id: string | null;
  structural_dna_hash: string;
  structural_dna_json: Record<string, unknown>;
  procedural_lifecycle_json: Record<string, unknown>;
  jurisdiction_lineage_json: Record<string, unknown>;
  constitutional_dependency_json: Record<string, unknown>;
  fiscal_effects_json: Record<string, unknown>;
  enforcement_graph_json: Record<string, unknown>;
  downstream_impact_graph_json: Record<string, unknown>;
  current_state_position: string;
  created_at: string;
  updated_at: string;
}

export interface GenomeEvent {
  event_id: string;
  family_id: string;
  genome_bill_id: string;
  bill_id: string;
  state_code: string;
  event_type: string;
  event_timestamp: string;
  prior_status: string | null;
  next_status: string | null;
  amendment_version: string | null;
  source_trace: unknown[];
  event_payload_json: Record<string, unknown>;
  created_at: string;
}

export interface GenomeLifecycleEventV2 {
  lifecycle_event_id: string;
  genome_bill_id: string;
  bill_id: string;
  state_code: string;
  source_bill_id: number;
  source_provider: string;
  source_event_key: string;
  source_sequence: number;
  source_duplicate_sequence: number;
  event_type: string;
  valid_at: string;
  effective_at: string | null;
  observed_at: string;
  state_position_after: string | null;
  action_text: string;
  chamber_code: string | null;
  importance: number | null;
  source_trace: unknown[];
  event_payload_json: Record<string, unknown>;
  source_input_hash: string;
  supersedes_lifecycle_event_id: string | null;
  created_at: string;
}

export interface GenomeLifecycleEventHistoryV3 extends GenomeLifecycleEventV2 {
  current_source_revision_id: string | null;
  current_source_revision_hash: string | null;
  current_revision_observed_at: string | null;
  canonical_status: "current" | "superseded" | "tombstone";
}

export interface GenomeBillTemporalFactsV2 {
  genome_bill_id: string;
  bill_id: string;
  family_id: string;
  state_code: string;
  source_bill_number: string;
  prefiled_at: string | null;
  introduced_at: string | null;
  enacted_at: string | null;
  effective_at: string | null;
  last_action_at: string;
  last_observed_at: string;
  last_action_text: string;
  current_state_position: string | null;
  source_event_count: number;
  source_event_set_hash: string;
  temporal_contract:
    | "civic_genome_event_time_v2"
    | "civic_genome_event_time_v3";
}

export interface LineageEdge {
  lineage_edge_id: string;
  family_id: string | null;
  from_bill_id: string;
  to_bill_id: string;
  relationship_type: string;
  confidence_score: number;
  evidence_json: Record<string, unknown>;
  created_at: string;
}

export interface MomentumSnapshot {
  momentum_snapshot_id: string;
  family_id: string;
  snapshot_date: string;
  active_state_count: number;
  introduced_state_count: number;
  enacted_state_count: number;
  failed_state_count: number;
  new_state_count: number;
  velocity_score: number;
  acceleration_score: number;
  collapse_score: number;
  created_at: string;
}

export interface EventTimeMomentumSnapshotV2 extends MomentumSnapshot {
  observed_at: string;
  chronology_basis: "source_event_time";
  methodology_version:
    | "civic_genome_momentum_event_time_v2"
    | "civic_genome_momentum_event_time_v3";
  source_event_ids: string[];
  input_hash: string;
}

function temporal_v2_unavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  return code === "42P01" || code === "42883" || code === "42703";
}

// ─── Families ────────────────────────────────────────────────────────────────

export async function list_genome_families(opts?: {
  policy_domain?: string;
  family_status?: string;
  limit?: number;
  offset?: number;
}): Promise<GenomeFamily[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.policy_domain) {
    params.push(opts.policy_domain);
    conditions.push(`policy_domain = $${params.length}`);
  }
  if (opts?.family_status) {
    params.push(opts.family_status);
    conditions.push(`family_status = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await pool.query<GenomeFamily>(
    `select * from civic_genome_family
     ${where}
     order by momentum_score desc, last_event_at desc nulls last
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return rows;
}

export async function get_genome_family(
  family_id: string,
): Promise<GenomeFamily | null> {
  const pool = getPool();
  const { rows } = await pool.query<GenomeFamily>(
    `select * from civic_genome_family where family_id = $1 limit 1`,
    [family_id],
  );
  return rows[0] ?? null;
}

// ─── Bills ───────────────────────────────────────────────────────────────────

export async function list_genome_bills(opts?: {
  family_id?: string;
  state_code?: string;
  bill_status?: string;
  current_state_position?: string;
  limit?: number;
  offset?: number;
}): Promise<GenomeBill[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.family_id) {
    params.push(opts.family_id);
    conditions.push(`family_id = $${params.length}`);
  }
  if (opts?.state_code) {
    params.push(opts.state_code);
    conditions.push(`state_code = $${params.length}`);
  }
  if (opts?.bill_status) {
    params.push(opts.bill_status);
    conditions.push(`bill_status = $${params.length}`);
  }
  if (opts?.current_state_position) {
    params.push(opts.current_state_position);
    conditions.push(`current_state_position = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await pool.query<GenomeBill>(
    `select * from civic_genome_bill
     ${where}
     order by last_action_at desc nulls last, introduced_at desc nulls last
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return rows;
}

export async function get_genome_bill(
  genome_bill_id: string,
): Promise<GenomeBill | null> {
  const pool = getPool();
  const { rows } = await pool.query<GenomeBill>(
    `select * from civic_genome_bill where genome_bill_id = $1 limit 1`,
    [genome_bill_id],
  );
  return rows[0] ?? null;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function list_genome_events(opts?: {
  family_id?: string;
  genome_bill_id?: string;
  state_code?: string;
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<GenomeEvent[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.family_id) {
    params.push(opts.family_id);
    conditions.push(`family_id = $${params.length}`);
  }
  if (opts?.genome_bill_id) {
    params.push(opts.genome_bill_id);
    conditions.push(`genome_bill_id = $${params.length}`);
  }
  if (opts?.state_code) {
    params.push(opts.state_code);
    conditions.push(`state_code = $${params.length}`);
  }
  if (opts?.event_type) {
    params.push(opts.event_type);
    conditions.push(`event_type = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = Math.min(opts?.limit ?? 100, 500);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await pool.query<GenomeEvent>(
    `select * from civic_genome_event
     ${where}
     order by event_timestamp desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return rows;
}

export async function list_genome_lifecycle_events_v2(opts: {
  genome_bill_id: string;
  limit?: number;
}): Promise<GenomeLifecycleEventV2[]> {
  const pool = getPool();
  const limit = Math.min(opts.limit ?? 500, 2_000);

  try {
    const { rows } = await pool.query<GenomeLifecycleEventV2>(
      `select *
         from public.v_civic_genome_lifecycle_event_current_v3
        where genome_bill_id = $1
        order by valid_at desc, source_sequence desc, lifecycle_event_id desc
        limit $2`,
      [opts.genome_bill_id, limit],
    );
    return rows;
  } catch (error) {
    if (temporal_v2_unavailable(error)) return [];
    throw error;
  }
}

export async function list_genome_lifecycle_event_history_v3(opts: {
  genome_bill_id: string;
  limit?: number;
}): Promise<GenomeLifecycleEventHistoryV3[]> {
  const pool = getPool();
  const limit = Math.min(opts.limit ?? 2_000, 5_000);

  try {
    const { rows } = await pool.query<GenomeLifecycleEventHistoryV3>(
      `select *
         from public.v_civic_genome_lifecycle_event_history_v3
        where genome_bill_id = $1
        order by observed_at desc, created_at desc, lifecycle_event_id desc
        limit $2`,
      [opts.genome_bill_id, limit],
    );
    return rows;
  } catch (error) {
    if (temporal_v2_unavailable(error)) return [];
    throw error;
  }
}

export async function get_genome_bill_temporal_facts_v2(
  genome_bill_id: string,
): Promise<GenomeBillTemporalFactsV2 | null> {
  const pool = getPool();

  try {
    const { rows } = await pool.query<GenomeBillTemporalFactsV2>(
      `select *
         from public.v_civic_genome_bill_temporal_facts_v2
        where genome_bill_id = $1
        limit 1`,
      [genome_bill_id],
    );
    return rows[0] ?? null;
  } catch (error) {
    if (temporal_v2_unavailable(error)) return null;
    throw error;
  }
}

// ─── Lineage Edges ───────────────────────────────────────────────────────────

export async function list_lineage_edges(opts?: {
  family_id?: string;
  from_bill_id?: string;
  to_bill_id?: string;
  relationship_type?: string;
  limit?: number;
}): Promise<LineageEdge[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.family_id) {
    params.push(opts.family_id);
    conditions.push(`family_id = $${params.length}`);
  }
  if (opts?.from_bill_id) {
    params.push(opts.from_bill_id);
    conditions.push(`from_bill_id = $${params.length}`);
  }
  if (opts?.to_bill_id) {
    params.push(opts.to_bill_id);
    conditions.push(`to_bill_id = $${params.length}`);
  }
  if (opts?.relationship_type) {
    params.push(opts.relationship_type);
    conditions.push(`relationship_type = $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limit = Math.min(opts?.limit ?? 100, 500);
  params.push(limit);

  const { rows } = await pool.query<LineageEdge>(
    `select * from bill_lineage_edge
     ${where}
     order by confidence_score desc, created_at desc
     limit $${params.length}`,
    params,
  );
  return rows;
}

// ─── Momentum Snapshots ───────────────────────────────────────────────────────

export async function list_momentum_snapshots(opts: {
  family_id: string;
  limit?: number;
}): Promise<MomentumSnapshot[]> {
  const pool = getPool();
  const limit = Math.min(opts?.limit ?? 90, 365);
  const { rows } = await pool.query<MomentumSnapshot>(
    `select * from family_momentum_snapshot
     where family_id = $1
     order by snapshot_date desc
     limit $2`,
    [opts.family_id, limit],
  );
  return rows;
}

export async function list_event_time_momentum_snapshots_v2(opts: {
  family_id: string;
  observed_as_of?: string;
  limit?: number;
}): Promise<EventTimeMomentumSnapshotV2[]> {
  const pool = getPool();
  const limit = Math.min(opts.limit ?? 365, 2_000);
  const observed_as_of = opts.observed_as_of ?? new Date().toISOString();

  try {
    const { rows } = await pool.query<EventTimeMomentumSnapshotV2>(
      `select *
         from public.civic_genome_family_momentum_event_time_v2(
           $1::uuid,
           $2::timestamptz
         )
        order by snapshot_date desc
        limit $3`,
      [opts.family_id, observed_as_of, limit],
    );
    return rows;
  } catch (error) {
    if (temporal_v2_unavailable(error)) return [];
    throw error;
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface GenomeStats {
  total_families: number;
  active_families: number;
  total_bills: number;
  total_events: number;
  observed_state_count: number;
  cross_state_family_count: number;
  policy_domains: string[];
}

export async function get_genome_stats(): Promise<GenomeStats> {
  const pool = getPool();
  const { rows } = await pool.query<{
    total_families: string;
    active_families: string;
    total_bills: string;
    total_events: string;
    observed_state_count: string;
    cross_state_family_count: string;
  }>(
    `select
       (select count(*)::text from civic_genome_family) as total_families,
       (select count(*)::text from civic_genome_family where family_status = 'active') as active_families,
       (select count(*)::text from civic_genome_bill) as total_bills,
       (select count(*)::text from civic_genome_event) as total_events,
       (select count(distinct state_code)::text from civic_genome_bill) as observed_state_count,
       (
         select count(*)::text
           from (
             select family_id
               from civic_genome_bill
              group by family_id
             having count(distinct state_code) > 1
           ) cross_state_families
       ) as cross_state_family_count`,
  );
  const { rows: domain_rows } = await pool.query<{ policy_domain: string }>(
    `select distinct policy_domain from civic_genome_family order by policy_domain`,
  );
  const r = rows[0];
  return {
    total_families: parseInt(r.total_families, 10),
    active_families: parseInt(r.active_families, 10),
    total_bills: parseInt(r.total_bills, 10),
    total_events: parseInt(r.total_events, 10),
    observed_state_count: parseInt(r.observed_state_count, 10),
    cross_state_family_count: parseInt(r.cross_state_family_count, 10),
    policy_domains: domain_rows.map((d) => d.policy_domain),
  };
}
