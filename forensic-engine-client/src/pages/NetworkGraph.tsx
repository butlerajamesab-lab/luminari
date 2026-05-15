import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Network, X, ExternalLink, Quote, FileText, Loader2, Upload } from "lucide-react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import ReadAloud from "@/components/ReadAloud";
import { formatRelationshipForReadAloud, formatQuoteForReadAloud } from "@/lib/forensicReadAloud";
import { deriveDocumentDisplayLabel } from "@/lib/documentLabel";
import { buildFromParam } from "@/lib/buildFromParam";

import ForceGraph2D from "react-force-graph-2d";

const entityTypeColors: Record<string, string> = {
  person: "#60a5fa",
  organization: "#f59e0b",
  location: "#34d399",
  document: "#a78bfa",
  date: "#fb923c",
  concept: "#f472b6",
  financial: "#22d3ee",
  legal: "#e879f9",
};

interface GraphNode {
  id: string;
  name: string;
  type: string;
  val: number;
  color: string;
  entityId: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  description?: string | null;
  relId: number;
  evidenceCount?: number;
}

export default function NetworkGraph() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const { data: entities } = trpc.entities.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const { data: relationships } = trpc.relationships.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  // Fetch evidence for selected link
  const { data: linkEvidence, isLoading: evidenceLoading } = trpc.relationships.evidence.useQuery(
    { relationshipId: selectedLink?.relId ?? 0 },
    { enabled: !!selectedLink?.relId }
  );

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 500),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build graph data
  const graphData = useMemo(() => {
    if (!entities || !relationships) return { nodes: [], links: [] };

    const connectionCount: Record<number, number> = {};
    relationships.forEach((r) => {
      connectionCount[r.sourceEntityId] = (connectionCount[r.sourceEntityId] || 0) + 1;
      connectionCount[r.targetEntityId] = (connectionCount[r.targetEntityId] || 0) + 1;
    });

    const nodes: GraphNode[] = entities.map((e) => ({
      id: `e-${e.id}`,
      name: e.name,
      type: e.type,
      val: Math.max(2, (connectionCount[e.id] || 0) * 2),
      color: entityTypeColors[e.type] || "#94a3b8",
      entityId: e.id,
    }));

    const nodeIds = new Set(nodes.map(n => n.id));

    const links: GraphLink[] = relationships
      .filter(r => nodeIds.has(`e-${r.sourceEntityId}`) && nodeIds.has(`e-${r.targetEntityId}`))
      .map((r) => ({
        source: `e-${r.sourceEntityId}`,
        target: `e-${r.targetEntityId}`,
        label: r.relationshipType,
        description: r.description,
        relId: r.id,
        evidenceCount: r.evidenceCount ?? 0,
      }));

    return { nodes, links };
  }, [entities, relationships]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNode);
    setSelectedLink(null);
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, []);

  const handleLinkClick = useCallback((link: any) => {
    setSelectedLink(link as GraphLink);
    setSelectedNode(null);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
  }, []);

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const hasData = entities && entities.length > 0 && relationships && relationships.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Network Graph</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {entities?.length || 0} entities, {relationships?.length || 0} connections
            {hasData && <span className="ml-2 text-xs">&mdash; click edges to see backing evidence</span>}
          </p>
        </div>
        {hasData && (
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(entityTypeColors).map(([type, color]) => {
              const count = entities?.filter(e => e.type === type).length || 0;
              if (count === 0) return null;
              return (
                <div key={type} className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground capitalize">{type} ({count})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!hasData ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Network className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">
                No network data yet. Upload and analyze documents to build the relationship graph.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {entities?.length || 0} entities, {relationships?.length || 0} relationships
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/upload")}>
              <Upload className="h-3.5 w-3.5" /> Upload Evidence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Graph */}
          <Card className="overflow-hidden">
            <div ref={containerRef} className="w-full" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                width={dimensions.width}
                height={dimensions.height}
                backgroundColor="transparent"
                nodeLabel={(node: any) => `${node.name} (${node.type})`}
                nodeColor={(node: any) => node.color}
                nodeRelSize={5}
                linkColor={(link: any) => {
                  // Highlight selected link
                  if (selectedLink && (link as GraphLink).relId === selectedLink.relId) {
                    return "rgba(96, 165, 250, 0.8)";
                  }
                  // Highlight links with evidence
                  if ((link as GraphLink).evidenceCount && (link as GraphLink).evidenceCount! > 0) {
                    return "rgba(148, 163, 184, 0.5)";
                  }
                  return "rgba(148, 163, 184, 0.25)";
                }}
                linkWidth={(link: any) => {
                  if (selectedLink && (link as GraphLink).relId === selectedLink.relId) return 3;
                  return 1.5;
                }}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkLabel={(link: any) => {
                  const l = link as GraphLink;
                  const evCount = l.evidenceCount || 0;
                  return `${l.label}${evCount > 0 ? ` (${evCount} quote${evCount !== 1 ? 's' : ''})` : ''}`;
                }}
                onNodeClick={handleNodeClick}
                onLinkClick={handleLinkClick}
                onBackgroundClick={handleBackgroundClick}
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  const label = node.name;
                  const fontSize = Math.max(10 / globalScale, 2);
                  ctx.font = `${fontSize}px Inter, sans-serif`;
                  
                  const radius = Math.sqrt(node.val) * 2.5;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                  ctx.fillStyle = node.color;
                  ctx.fill();
                  
                  // Selected ring
                  if (selectedNode && selectedNode.id === node.id) {
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 2 / globalScale;
                    ctx.stroke();
                  }
                  
                  // Label
                  if (globalScale > 0.8 || (selectedNode && selectedNode.id === node.id)) {
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                    ctx.fillText(label, node.x, node.y + radius + 2);
                  }
                }}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  // Draw evidence count badge on links that have evidence
                  const l = link as GraphLink;
                  if (!l.evidenceCount || l.evidenceCount === 0) return;
                  
                  const src = link.source;
                  const tgt = link.target;
                  if (!src || !tgt || typeof src.x !== 'number') return;
                  
                  const midX = (src.x + tgt.x) / 2;
                  const midY = (src.y + tgt.y) / 2;
                  
                  const fontSize = Math.max(8 / globalScale, 2);
                  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                  
                  // Badge background
                  const badgeRadius = Math.max(6 / globalScale, 2);
                  ctx.beginPath();
                  ctx.arc(midX, midY, badgeRadius, 0, 2 * Math.PI);
                  ctx.fillStyle = selectedLink?.relId === l.relId ? "rgba(96, 165, 250, 0.9)" : "rgba(148, 163, 184, 0.6)";
                  ctx.fill();
                  
                  // Badge text
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillStyle = "#ffffff";
                  ctx.fillText(String(l.evidenceCount), midX, midY);
                }}
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
              />
            </div>
          </Card>

          {/* Node Info Panel */}
          {selectedNode && (
            <Card className="absolute top-4 right-4 w-72 z-10 bg-background/95 backdrop-blur-sm border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: selectedNode.color }} />
                      <h3 className="text-sm font-semibold truncate">{selectedNode.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize mt-2">{selectedNode.type}</Badge>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => setLocation(`/entities/${selectedNode.entityId}?from=${encodeURIComponent(buildFromParam())}`)}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Entity Details
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setSelectedNode(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Edge Evidence Panel */}
          {selectedLink && (
            <Card className="absolute top-4 right-4 w-80 max-h-[calc(100vh-280px)] z-10 bg-background/95 backdrop-blur-sm border-primary/30 overflow-hidden flex flex-col">
              <CardContent className="p-4 flex flex-col gap-3 overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Connection Evidence</p>
                    <p className="text-sm font-medium mt-1 truncate">
                      {(selectedLink.source as any).name || "?"} &rarr; {(selectedLink.target as any).name || "?"}
                    </p>
                    <Badge variant="outline" className="text-[10px] mt-1.5">{selectedLink.label}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setSelectedLink(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Description */}
                {selectedLink.description && (
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <p className="text-xs text-muted-foreground leading-relaxed">{selectedLink.description}</p>
                    <ReadAloud text={selectedLink.description} forensicText={formatRelationshipForReadAloud(selectedLink.description, {}, {})} label="" />
                  </div>
                )}

                {/* Evidence Quotes */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Quote className="h-3 w-3 text-primary" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Backing Quotes
                    </p>
                  </div>

                  {evidenceLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground ml-2">Loading evidence...</span>
                    </div>
                  ) : linkEvidence && linkEvidence.length > 0 ? (
                    <div className="space-y-2">
                      {linkEvidence.map((ev) => (
                        <div key={ev.id} className="bg-card border border-border rounded-md p-2.5">
                          {/* Quote text */}
                          <p className="text-xs leading-relaxed italic text-foreground/90">
                            &ldquo;{ev.quoteText}&rdquo;
                          </p>
                          {/* Source attribution */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-[10px] text-muted-foreground truncate">
                              {deriveDocumentDisplayLabel(ev.documentFilename)}
                            </span>
                            {ev.pageNumber && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                p.{ev.pageNumber}
                              </Badge>
                            )}
                            {ev.statementOrigin && ev.statementOrigin !== "unknown" && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] h-4 px-1 ${
                                  ["sworn_testimony", "court_filing", "discovery_disclosure"].includes(ev.statementOrigin)
                                    ? "border-green-500/30 text-green-400"
                                    : "border-amber-500/30 text-amber-400"
                                }`}
                              >
                                {ev.statementOrigin.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </div>
                          {/* Explanation */}
                          {ev.explanation && (
                            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                              {ev.explanation}
                            </p>
                          )}
                          <ReadAloud text={ev.quoteText || ""} forensicText={ev.quoteText ? formatQuoteForReadAloud(ev.quoteText, { pageNumber: ev.pageNumber || undefined, documentName: ev.documentFilename || undefined }) : undefined} label="" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">
                        No backing quotes stored for this connection.
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        The relationship was identified by AI analysis but individual quote links were not preserved.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
