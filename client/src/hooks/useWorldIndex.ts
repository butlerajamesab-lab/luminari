/**
 * useWorldIndex — Single hook for the unified World Index.
 * All UI panels consume this instead of querying individual tables.
 * 
 * Provides:
 *  - nodes / edges (full set)
 *  - nodesByType(type) helper
 *  - edgesByType(type) helper
 *  - jurisdictions() helper
 *  - filterByJurisdiction(abbr) helper
 *  - isLoading / error
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export type WorldObjectType = "agency" | "program" | "jurisdiction" | "signal" | "workflow";
export type WorldRelType = "escalation" | "oversight" | "signal_link" | "program_access";

export interface WorldObject {
  id: string;
  type: WorldObjectType;
  jurisdiction: string;
  domain: string;
  source_table: string;
  source_id: string;
  metadata: any;
}

export interface WorldRelationship {
  id: string;
  from: string;
  to: string;
  type: WorldRelType;
  metadata: any;
}

export function useWorldIndex() {
  const { data, isLoading, error } = trpc.world.getIndex.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min — data doesn't change frequently
    refetchOnWindowFocus: false,
  });

  const nodes: WorldObject[] = data?.nodes ?? [];
  const edges: WorldRelationship[] = data?.edges ?? [];

  const nodesByType = useMemo(() => {
    const map: Record<string, WorldObject[]> = {};
    for (const n of nodes) {
      if (!map[n.type]) map[n.type] = [];
      map[n.type].push(n);
    }
    return map;
  }, [nodes]);

  const edgesByType = useMemo(() => {
    const map: Record<string, WorldRelationship[]> = {};
    for (const e of edges) {
      if (!map[e.type]) map[e.type] = [];
      map[e.type].push(e);
    }
    return map;
  }, [edges]);

  const jurisdictions = useMemo(
    () => (nodesByType["jurisdiction"] ?? []).sort((a, b) =>
      (a.metadata?.abbreviation ?? "").localeCompare(b.metadata?.abbreviation ?? "")
    ),
    [nodesByType]
  );

  const filterByJurisdiction = useMemo(() => {
    return (abbr: string | null) => {
      if (!abbr) return nodes;
      return nodes.filter(n => n.jurisdiction === abbr);
    };
  }, [nodes]);

  // Summary counts for quick stats
  const counts = useMemo(() => ({
    agencies: (nodesByType["agency"] ?? []).length,
    programs: (nodesByType["program"] ?? []).length,
    jurisdictions: (nodesByType["jurisdiction"] ?? []).length,
    signals: (nodesByType["signal"] ?? []).length,
    workflows: (nodesByType["workflow"] ?? []).length,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    oversightEdges: (edgesByType["oversight"] ?? []).length,
    programAccessEdges: (edgesByType["program_access"] ?? []).length,
    signalLinkEdges: (edgesByType["signal_link"] ?? []).length,
    escalationEdges: (edgesByType["escalation"] ?? []).length,
  }), [nodesByType, edgesByType, nodes, edges]);

  return {
    nodes,
    edges,
    nodesByType,
    edgesByType,
    jurisdictions,
    filterByJurisdiction,
    counts,
    isLoading,
    error,
  };
}
