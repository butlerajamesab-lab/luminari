/**
 * Engine 4: Global Systemic Harm Map
 * 
 * Builds an interactive network graph from:
 * - Harm index entities → nodes
 * - Litigation correlations → edges
 * - Signal patterns → edges
 * - Shared jurisdictions/industries → edges
 * 
 * Node types: entity, pattern, agency, jurisdiction, industry
 * Edge types: litigation_link, signal_correlation, shared_jurisdiction, shared_industry, enforcement_link
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
  harmScore: number;
  riskScore: number;
  status: string;
}

export interface MapEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  relationshipType: string;
  strengthScore: number;
  evidenceCount: number;
}

export interface HarmMapData {
  nodes: MapNode[];
  edges: MapEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    topRiskSectors: string[];
    topHarmEntities: string[];
  };
}

/**
 * Generate the harm map from existing engine data
 */
export async function generateHarmMap(): Promise<{ nodesCreated: number; edgesCreated: number; errors: string[] }> {
  const now = Date.now();
  const errors: string[] = [];
  let nodesCreated = 0;
  let edgesCreated = 0;

  try {
    // Clear existing map data for regeneration
    await db.execute(sql`DELETE FROM harm_map_edges`);
    await db.execute(sql`DELETE FROM harm_map_nodes`);

    // Step 1: Create entity nodes from harm index
    const entities = await db.execute(sql`
      SELECT e.id, e.entity_name, e.entity_type, e.industry_sector, e.jurisdiction,
             s.systemic_harm_score
      FROM harm_index_entities e
      LEFT JOIN harm_index_scores s ON s.entity_id = e.id 
        AND s.id = (SELECT MAX(s2.id) FROM harm_index_scores s2 WHERE s2.entity_id = e.id)
      ORDER BY s.systemic_harm_score DESC
      LIMIT 100
    `);

    const entityNodeMap = new Map<number, number>(); // entity_id -> node_id

    for (const entity of entities[0] as unknown as any[]) {
      const harmScore = Number(entity.systemic_harm_score) || 0;
      await db.execute(sql`
        INSERT INTO harm_map_nodes 
        (node_type, node_label, entity_id, jurisdiction, industry_sector, harm_score, risk_score, status, created_at)
        VALUES ('entity', ${entity.entity_name}, ${entity.id}, ${entity.jurisdiction}, 
                ${entity.industry_sector}, ${harmScore}, ${harmScore}, 'active', ${now})
      `);
      
      const nodeResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const nodeId = (nodeResult[0] as unknown as any[])[0]?.id;
      if (nodeId) {
        entityNodeMap.set(entity.id, nodeId);
        nodesCreated++;
      }
    }

    // Step 2: Create jurisdiction nodes
    const jurisdictions = await db.execute(sql`
      SELECT DISTINCT jurisdiction FROM harm_index_entities 
      WHERE jurisdiction IS NOT NULL AND jurisdiction != ''
    `);
    const jurisdictionNodeMap = new Map<string, number>();

    for (const j of jurisdictions[0] as unknown as any[]) {
      await db.execute(sql`
        INSERT INTO harm_map_nodes 
        (node_type, node_label, jurisdiction, harm_score, risk_score, status, created_at)
        VALUES ('jurisdiction', ${j.jurisdiction}, ${j.jurisdiction}, 0, 0, 'active', ${now})
      `);
      const nodeResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const nodeId = (nodeResult[0] as unknown as any[])[0]?.id;
      if (nodeId) {
        jurisdictionNodeMap.set(j.jurisdiction, nodeId);
        nodesCreated++;
      }
    }

    // Step 3: Create industry nodes
    const industries = await db.execute(sql`
      SELECT DISTINCT industry_sector FROM harm_index_entities 
      WHERE industry_sector IS NOT NULL AND industry_sector != ''
    `);
    const industryNodeMap = new Map<string, number>();

    for (const ind of industries[0] as unknown as any[]) {
      await db.execute(sql`
        INSERT INTO harm_map_nodes 
        (node_type, node_label, industry_sector, harm_score, risk_score, status, created_at)
        VALUES ('industry', ${ind.industry_sector}, ${ind.industry_sector}, 0, 0, 'active', ${now})
      `);
      const nodeResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
      const nodeId = (nodeResult[0] as unknown as any[])[0]?.id;
      if (nodeId) {
        industryNodeMap.set(ind.industry_sector, nodeId);
        nodesCreated++;
      }
    }

    // Step 4: Create edges — entity to jurisdiction
    for (const entity of entities[0] as unknown as any[]) {
      const entityNodeId = entityNodeMap.get(entity.id);
      if (!entityNodeId || !entity.jurisdiction) continue;
      const jurisdictionNodeId = jurisdictionNodeMap.get(entity.jurisdiction);
      if (!jurisdictionNodeId) continue;

      await db.execute(sql`
        INSERT INTO harm_map_edges 
        (source_node_id, target_node_id, relationship_type, strength_score, evidence_count, created_at)
        VALUES (${entityNodeId}, ${jurisdictionNodeId}, 'shared_jurisdiction', 50, 1, ${now})
      `);
      edgesCreated++;
    }

    // Step 5: Create edges — entity to industry
    for (const entity of entities[0] as unknown as any[]) {
      const entityNodeId = entityNodeMap.get(entity.id);
      if (!entityNodeId || !entity.industry_sector) continue;
      const industryNodeId = industryNodeMap.get(entity.industry_sector);
      if (!industryNodeId) continue;

      await db.execute(sql`
        INSERT INTO harm_map_edges 
        (source_node_id, target_node_id, relationship_type, strength_score, evidence_count, created_at)
        VALUES (${entityNodeId}, ${industryNodeId}, 'shared_industry', 50, 1, ${now})
      `);
      edgesCreated++;
    }

    // Step 6: Create edges from litigation links
    const litLinks = await db.execute(sql`
      SELECT ell.entity_id, ell.litigation_id, ell.confidence_score,
             lr.entity_name as lit_entity
      FROM entity_litigation_links ell
      JOIN litigation_registry lr ON lr.id = ell.litigation_id
      LIMIT 200
    `);

    for (const link of litLinks[0] as unknown as any[]) {
      // Find if both entities have nodes
      const sourceNode = await db.execute(sql`
        SELECT id FROM harm_map_nodes WHERE entity_id = ${link.entity_id} LIMIT 1
      `);
      if ((sourceNode[0] as unknown as any[]).length === 0) continue;

      const targetNode = await db.execute(sql`
        SELECT id FROM harm_map_nodes WHERE node_label = ${link.lit_entity} LIMIT 1
      `);
      if ((targetNode[0] as unknown as any[]).length === 0) continue;

      const sourceId = (sourceNode[0] as unknown as any[])[0].id;
      const targetId = (targetNode[0] as unknown as any[])[0].id;
      if (sourceId === targetId) continue;

      await db.execute(sql`
        INSERT INTO harm_map_edges 
        (source_node_id, target_node_id, relationship_type, strength_score, evidence_count, created_at)
        VALUES (${sourceId}, ${targetId}, 'litigation_link', ${Number(link.confidence_score) * 100 || 50}, 1, ${now})
      `);
      edgesCreated++;
    }

    // Save snapshot
    const topSectors = (industries[0] as unknown as any[]).slice(0, 5).map((i: any) => i.industry_sector);
    const topEntities = (entities[0] as unknown as any[]).slice(0, 5).map((e: any) => e.entity_name);

    await db.execute(sql`
      INSERT INTO harm_map_snapshots 
      (snapshot_date, node_count, edge_count, top_risk_sectors, top_harm_entities, summary, created_at)
      VALUES (${now}, ${nodesCreated}, ${edgesCreated}, 
              ${JSON.stringify(topSectors)}, ${JSON.stringify(topEntities)},
              ${`Generated ${nodesCreated} nodes and ${edgesCreated} edges`}, ${now})
    `);

  } catch (err: any) {
    errors.push(err.message || "Unknown error during harm map generation");
  }

  return { nodesCreated, edgesCreated, errors };
}

/**
 * Get the current harm map data
 */
export async function getHarmMapData(): Promise<HarmMapData> {
  const nodes = await db.execute(sql`
    SELECT id, node_type, node_label, entity_id, pattern_id, jurisdiction,
           industry_sector, harm_score, risk_score, status
    FROM harm_map_nodes
    ORDER BY harm_score DESC
  `);

  const edges = await db.execute(sql`
    SELECT id, source_node_id, target_node_id, relationship_type, strength_score, evidence_count
    FROM harm_map_edges
  `);

  const snapshot = await db.execute(sql`
    SELECT top_risk_sectors, top_harm_entities
    FROM harm_map_snapshots
    ORDER BY snapshot_date DESC LIMIT 1
  `);

  const snapshotData = (snapshot[0] as unknown as any[])[0];

  return {
    nodes: (nodes[0] as unknown as any[]).map(n => ({
      id: n.id,
      nodeType: n.node_type,
      nodeLabel: n.node_label,
      entityId: n.entity_id,
      patternId: n.pattern_id,
      jurisdiction: n.jurisdiction,
      industrySector: n.industry_sector,
      harmScore: Number(n.harm_score) || 0,
      riskScore: Number(n.risk_score) || 0,
      status: n.status,
    })),
    edges: (edges[0] as unknown as any[]).map(e => ({
      id: e.id,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      relationshipType: e.relationship_type,
      strengthScore: Number(e.strength_score) || 0,
      evidenceCount: Number(e.evidence_count) || 0,
    })),
    summary: {
      nodeCount: (nodes[0] as unknown as any[]).length,
      edgeCount: (edges[0] as unknown as any[]).length,
      topRiskSectors: snapshotData?.top_risk_sectors ? (typeof snapshotData.top_risk_sectors === 'string' ? JSON.parse(snapshotData.top_risk_sectors) : snapshotData.top_risk_sectors) : [],
      topHarmEntities: snapshotData?.top_harm_entities ? (typeof snapshotData.top_harm_entities === 'string' ? JSON.parse(snapshotData.top_harm_entities) : snapshotData.top_harm_entities) : [],
    },
  };
}
