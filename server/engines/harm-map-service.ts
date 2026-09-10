/**
 * Global Systemic Harm Map
 *
 * The governed Lighthouse graph is the canonical graph. The former runtime
 * attempted to rebuild a second, empty graph in harm_map_* tables and failed
 * on MySQL-only insert-id calls. Reading the governed projection preserves
 * provenance and immediately exposes the graph already populated by intake.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface MapNode {
  id: number;
  nodeType: string;
  nodeLabel: string;
  entityId: number | null;
  patternId: number | null;
  jurisdiction: string | null;
  industrySector: string | null;
  harmScore: number | null;
  riskScore: number | null;
  status: string;
  canonicalNodeId?: string;
  objectRef?: string | null;
  sourceLocator?: string | null;
}

export interface MapEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  relationshipType: string;
  strengthScore: number | null;
  evidenceCount: number | null;
  canonicalEdgeId?: string;
  evidenceState?: string | null;
}

export interface HarmMapData {
  nodes: MapNode[];
  edges: MapEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    projectedNodeCount: number;
    projectedEdgeCount: number;
    topRiskSectors: string[];
    topHarmEntities: string[];
    source: string;
    scoringAvailable: boolean;
  };
}

const numericId = (column: string) =>
  `(hashtextextended(${column}, 0) & 2147483647)::int`;

/**
 * Generation is now a non-destructive projection check. It never deletes the
 * canonical graph and never claims that a derived risk score exists.
 */
export async function generateHarmMap(): Promise<{
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
  projectionMode: "canonical_read";
  source: string;
}> {
  const [rows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM v_lighthouse_graph_nodes_v1) AS node_count,
      (SELECT COUNT(*)::int FROM v_lighthouse_graph_edges_v2) AS edge_count
  `);
  const counts = (rows as unknown as any[])[0] ?? {};
  return {
    nodesCreated: Number(counts.node_count) || 0,
    edgesCreated: Number(counts.edge_count) || 0,
    errors: [],
    projectionMode: "canonical_read",
    source: "v_lighthouse_graph_nodes_v1 + v_lighthouse_graph_edges_v2",
  };
}

/**
 * Return a bounded, deterministic graph for the browser. Counts describe the
 * full graph; the node/edge arrays are a render-safe projection.
 */
export async function getHarmMapData(): Promise<HarmMapData> {
  const [nodeRows] = await db.execute(sql.raw(`
    WITH selected_edges AS MATERIALIZED (
      SELECT * FROM public.v_lighthouse_graph_edges_v2
       ORDER BY CASE WHEN evidence_state IN ('verified','governed','current') THEN 0 ELSE 1 END,
                edge_id
       LIMIT 500
    ), selected_ids AS (
      SELECT from_node_id AS node_id FROM selected_edges
      UNION
      SELECT to_node_id AS node_id FROM selected_edges
    )
    SELECT ${numericId("n.node_id")} AS id,
           n.node_id AS canonical_node_id,
           n.node_type,
           n.label AS node_label,
           n.jurisdiction_code AS jurisdiction,
           n.node_state AS status,
           n.object_ref,
           n.source_locator
      FROM public.v_lighthouse_graph_nodes_v1 n
      JOIN selected_ids s ON s.node_id = n.node_id
     ORDER BY CASE WHEN n.node_state = 'active' THEN 0 ELSE 1 END, n.label, n.node_id
  `));

  const [edgeRows] = await db.execute(sql.raw(`
    WITH selected_edges AS MATERIALIZED (
      SELECT * FROM public.v_lighthouse_graph_edges_v2
       ORDER BY CASE WHEN evidence_state IN ('verified','governed','current') THEN 0 ELSE 1 END,
                edge_id
       LIMIT 500
    )
    SELECT ${numericId("e.edge_id")} AS id,
           e.edge_id AS canonical_edge_id,
           ${numericId("e.from_node_id")} AS source_node_id,
           ${numericId("e.to_node_id")} AS target_node_id,
           e.edge_type AS relationship_type,
           e.evidence_state
      FROM selected_edges e
     ORDER BY e.edge_id
  `));

  const [countRows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM v_lighthouse_graph_nodes_v1) AS node_count,
      (SELECT COUNT(*)::int FROM v_lighthouse_graph_edges_v2) AS edge_count
  `);

  const nodes = (nodeRows as unknown as any[]).map((row) => ({
    id: Number(row.id),
    nodeType: row.node_type || "civic_object",
    nodeLabel: row.node_label || row.canonical_node_id,
    entityId: null,
    patternId: null,
    jurisdiction: row.jurisdiction,
    industrySector: null,
    harmScore: null,
    riskScore: null,
    status: row.status || "current",
    canonicalNodeId: row.canonical_node_id,
    objectRef: row.object_ref,
    sourceLocator: row.source_locator,
  }));

  const edges = (edgeRows as unknown as any[]).map((row) => ({
    id: Number(row.id),
    sourceNodeId: Number(row.source_node_id),
    targetNodeId: Number(row.target_node_id),
    relationshipType: row.relationship_type || "related",
    strengthScore: null,
    evidenceCount: null,
    canonicalEdgeId: row.canonical_edge_id,
    evidenceState: row.evidence_state,
  }));

  const counts = (countRows as unknown as any[])[0] ?? {};
  return {
    nodes,
    edges,
    summary: {
      nodeCount: Number(counts.node_count) || 0,
      edgeCount: Number(counts.edge_count) || 0,
      projectedNodeCount: nodes.length,
      projectedEdgeCount: edges.length,
      topRiskSectors: [],
      topHarmEntities: [],
      source: "v_lighthouse_graph_nodes_v1 + v_lighthouse_graph_edges_v2",
      scoringAvailable: false,
    },
  };
}
