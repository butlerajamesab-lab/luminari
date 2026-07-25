import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";

const uuidSchema = z.string().uuid();

export const omnidirectionalResolveInputSchema = z.object({
  start_node_ids: z.array(uuidSchema).min(1).max(100),
  ruleset_key: z.string().min(1).max(128).default("constitutional_default"),
  snapshot_hash: z.string().min(1).max(256).nullable().optional(),
  as_of: z.coerce.date().optional(),
});

export const omnidirectionalMaterializeInputSchema = omnidirectionalResolveInputSchema;

export const omnidirectionalHealthInputSchema = z.object({
  snapshot_hash: z.string().min(1).max(256).nullable().optional(),
  as_of: z.coerce.date().optional(),
});

export const actionFeasibilityInputSchema = z.object({
  evidence_completeness: z.number().min(0).max(1),
  deadline_slack: z.number().min(0).max(1),
  authority_strength: z.number().min(0).max(1),
  route_availability: z.number().min(0).max(1).default(1),
});

export type OmnidirectionalResolveInput = z.infer<typeof omnidirectionalResolveInputSchema>;
export type OmnidirectionalHealthInput = z.infer<typeof omnidirectionalHealthInputSchema>;
export type ActionFeasibilityInput = z.infer<typeof actionFeasibilityInputSchema>;

export interface OmnidirectionalTraversalRow {
  node_id: string;
  node_type: string;
  depth: number;
  path_node_ids: string[];
  path_edge_ids: string[];
  path_score: string | number;
  result_hash: string;
}

export interface OmnidirectionalHealthSnapshot {
  health_snapshot_id: string;
  snapshot_hash: string | null;
  as_of: Date | string;
  claim_count: string | number;
  claims_with_governing_authority: string | number;
  actionable_node_count: string | number;
  traceable_node_count: string | number;
  active_node_count: string | number;
  active_edge_count: string | number;
  coverage_ratio: string | number;
  actionability_ratio: string | number;
  traceability_ratio: string | number;
  unresolved_count: string | number;
  contradiction_edge_count: string | number;
  metrics_hash: string;
}

function toIsoDate(value?: Date): string {
  return (value ?? new Date()).toISOString();
}

function normalizeSnapshotHash(value?: string | null): string | null {
  return value?.trim() || null;
}

function normalizeTraversalRows(rows: unknown): OmnidirectionalTraversalRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row: any) => ({
    node_id: String(row.node_id),
    node_type: String(row.node_type),
    depth: Number(row.depth),
    path_node_ids: Array.isArray(row.path_node_ids) ? row.path_node_ids.map(String) : [],
    path_edge_ids: Array.isArray(row.path_edge_ids) ? row.path_edge_ids.map(String) : [],
    path_score: row.path_score,
    result_hash: String(row.result_hash),
  }));
}

/**
 * Resolve a deterministic, constrained, multi-start graph neighborhood.
 * The database function enforces typed traversal, temporal validity,
 * snapshot consistency, cycle prevention, and ruleset-scoped scoring.
 */
export async function resolveOmnidirectionalGraph(
  rawInput: OmnidirectionalResolveInput,
): Promise<OmnidirectionalTraversalRow[]> {
  const input = omnidirectionalResolveInputSchema.parse(rawInput);
  const snapshotHash = normalizeSnapshotHash(input.snapshot_hash);
  const asOf = toIsoDate(input.as_of);

  const result = await db.execute(sql`
    SELECT *
    FROM omnidirectional_resolve(
      ${input.start_node_ids}::uuid[],
      ${input.ruleset_key},
      ${snapshotHash},
      ${asOf}::timestamptz
    )
    ORDER BY path_score DESC, depth ASC, node_id ASC
  `);

  return normalizeTraversalRows(result.rows);
}

/**
 * Materialize ranked paths for replay, comparison, and regression checks.
 * Existing result hashes are retained and not duplicated.
 */
export async function materializeOmnidirectionalPaths(
  rawInput: OmnidirectionalResolveInput,
): Promise<{ paths_materialized: number }> {
  const input = omnidirectionalMaterializeInputSchema.parse(rawInput);
  const snapshotHash = normalizeSnapshotHash(input.snapshot_hash);
  const asOf = toIsoDate(input.as_of);

  const result = await db.execute(sql`
    SELECT omnidirectional_materialize_paths(
      ${input.start_node_ids}::uuid[],
      ${input.ruleset_key},
      ${snapshotHash},
      ${asOf}::timestamptz
    ) AS paths_materialized
  `);

  return {
    paths_materialized: Number((result.rows[0] as any)?.paths_materialized ?? 0),
  };
}

/**
 * Capture graph coverage, actionability, traceability, unresolved-path,
 * and contradiction metrics for Mission Control / constitutional audits.
 */
export async function captureOmnidirectionalHealth(
  rawInput: OmnidirectionalHealthInput = {},
): Promise<OmnidirectionalHealthSnapshot | null> {
  const input = omnidirectionalHealthInputSchema.parse(rawInput);
  const snapshotHash = normalizeSnapshotHash(input.snapshot_hash);
  const asOf = toIsoDate(input.as_of);

  const captured = await db.execute(sql`
    SELECT omnidirectional_capture_health(
      ${snapshotHash},
      ${asOf}::timestamptz
    ) AS health_snapshot_id
  `);

  const id = (captured.rows[0] as any)?.health_snapshot_id;
  if (!id) return null;

  const result = await db.execute(sql`
    SELECT *
    FROM omnidirectional_graph_health_snapshots
    WHERE health_snapshot_id = ${id}::uuid
    LIMIT 1
  `);

  return (result.rows[0] as OmnidirectionalHealthSnapshot | undefined) ?? null;
}

/**
 * Deterministic feasibility score for action nodes.
 * Weights are explicit and sum to 1. The function is pure and replayable.
 */
export function computeActionFeasibility(rawInput: ActionFeasibilityInput): number {
  const input = actionFeasibilityInputSchema.parse(rawInput);
  const score =
    input.evidence_completeness * 0.4
    + input.deadline_slack * 0.25
    + input.authority_strength * 0.25
    + input.route_availability * 0.1;

  return Number(score.toFixed(5));
}

/**
 * Fingerprint canonicalized traversal output independent of database row order.
 */
export function fingerprintTraversal(rows: OmnidirectionalTraversalRow[]): string {
  const canonical = rows
    .map((row) => ({
      node_id: row.node_id,
      node_type: row.node_type,
      depth: row.depth,
      path_node_ids: [...row.path_node_ids],
      path_edge_ids: [...row.path_edge_ids],
      path_score: String(row.path_score),
      result_hash: row.result_hash,
    }))
    .sort((a, b) => {
      if (a.node_id !== b.node_id) return a.node_id.localeCompare(b.node_id);
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.result_hash.localeCompare(b.result_hash);
    });

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
