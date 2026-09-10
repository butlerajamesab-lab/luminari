import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation, useSearch } from "wouter";
import { Network, X, ExternalLink, FileText, Loader2, Search, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import ReadAloud from "@/components/ReadAloud";
import { formatQuoteForReadAloud } from "@/lib/forensicReadAloud";
import { deriveDocumentDisplayLabel } from "@/lib/documentLabel";
import { buildFromParam } from "@/lib/buildFromParam";
import {
  buildEvidenceGraph, evidenceForDocument, ENTITY_TYPE_COLORS,
  type EvidenceGraphNode, type EvidenceGraphLink, type GraphEntity,
  type GraphRelationship, type GraphEvidence,
} from "@/lib/evidenceGraph";
import ForceGraph2D from "react-force-graph-2d";

type SourceMention = {
  id: number;
  entityId: number;
  documentId: number;
  documentFilename: string | null;
  rawMention?: string;
  sourceContext?: string | null;
  sourceContextOffset?: number | null;
  bindingProvenanceRefs?: string[];
  canonical_artifact_key?: string;
  canonical_span_offset?: number;
};

const readable = (value: string) => value === "unknown" ? "Type not established" : value.replace(/_/g, " ");
function dependencyLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "Unspecified dependency";
  const record = value as Record<string, unknown>;
  for (const key of ["detail", "message", "reason", "dependency", "code", "type"]) {
    if (typeof record[key] === "string" && record[key]) return String(record[key]);
  }
  return "Unresolved governed dependency";
}
function safeTooltip(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export default function NetworkGraph() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const urlSearch = useSearch();
  const documentParam = new URLSearchParams(urlSearch).get("documentId");
  const selectedDocumentId = documentParam && /^\d+$/.test(documentParam) && Number.isSafeInteger(Number(documentParam)) && Number(documentParam) > 0
    ? Number(documentParam) : null;
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const fitPending = useRef(true);
  const previousCase = useRef(currentCaseId);
  const [selectedNode, setSelectedNode] = useState<EvidenceGraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<EvidenceGraphLink | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 });
  const [search, setSearch] = useState("");
  const [searchLimit, setSearchLimit] = useState(20);
  const [mentionLimit, setMentionLimit] = useState(12);
  const [excludedEntityTypes, setExcludedEntityTypes] = useState<Set<string>>(new Set());
  const [relationshipType, setRelationshipType] = useState<string | null>(null);
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [showRelationships, setShowRelationships] = useState(true);
  const [showDocumentMentions, setShowDocumentMentions] = useState(true);

  const entitiesQuery = trpc.entities.list.useQuery({ caseId: currentCaseId! }, { enabled: !!currentCaseId });
  const relationshipsQuery = trpc.relationships.list.useQuery({ caseId: currentCaseId! }, { enabled: !!currentCaseId });
  const projectionQuery = trpc.analyze.getIntakeRelationshipProjection.useQuery({ caseId: currentCaseId! }, { enabled: !!currentCaseId });
  const documentsQuery = trpc.documents.list.useQuery({ caseId: currentCaseId! }, { enabled: !!currentCaseId });
  const entities = (entitiesQuery.data ?? []) as GraphEntity[];
  const relationships = relationshipsQuery.data;
  const documents = documentsQuery.data ?? [];
  const selectedDocument = documents.find(document => document.id === selectedDocumentId);
  const documentRolesQuery = trpc.documents.entityRoles.useQuery(
    { documentId: selectedDocumentId ?? 0 },
    { enabled: !!selectedDocument && !!currentCaseId },
  );
  const selectedEntityId = selectedNode?.entityId ?? (selectedLink?.kind === "document_mention" ? selectedLink.entityId : undefined);
  const entityRolesQuery = trpc.entities.roles.useQuery(
    { entityId: selectedEntityId ?? 0 }, { enabled: selectedEntityId !== undefined && !!currentCaseId },
  );
  const sourceDocumentFilter = selectedLink?.kind === "document_mention" ? selectedLink.documentId : selectedDocumentId;
  const sourceMentions = ((entityRolesQuery.data ?? []) as SourceMention[])
    .filter(mention => !sourceDocumentFilter || mention.documentId === sourceDocumentFilter);

  const relationshipDependencies = useMemo(() => {
    const outputs = (projectionQuery.data?.outputs ?? []) as Array<{ unresolved_dependencies?: unknown[] }>;
    return [...new Set(outputs.flatMap(output => output.unresolved_dependencies ?? []).map(dependencyLabel))];
  }, [projectionQuery.data]);

  const projectedLinkEvidence = useMemo(() => {
    if (selectedLink?.kind !== "relationship" || !relationships) return null;
    const relationship = relationships.find(row => row.id === selectedLink.relId) as any;
    if (relationship?.projection_source !== "universal_intake_spine") return null;
    return evidenceForDocument(relationship, selectedDocumentId);
  }, [relationships, selectedLink, selectedDocumentId]);
  // Canonical edges already carry exact source-span proof; legacy positive IDs
  // alone use the legacy evidence endpoint.
  const { data: legacyLinkEvidence, isLoading: legacyEvidenceLoading } = trpc.relationships.evidence.useQuery(
    { relationshipId: selectedLink?.relId ?? 0 },
    { enabled: !!selectedLink?.relId && selectedLink.relId > 0 && projectedLinkEvidence === null },
  );
  const linkEvidence = (projectedLinkEvidence ?? legacyLinkEvidence ?? []) as GraphEvidence[];
  const evidenceLoading = projectedLinkEvidence === null && legacyEvidenceLoading;

  const graphData = useMemo(() => buildEvidenceGraph(
    (entitiesQuery.data ?? []) as GraphEntity[], (relationshipsQuery.data ?? []) as GraphRelationship[], documentsQuery.data ?? [],
    { documentId: selectedDocumentId, excludedEntityTypes, relationshipType, connectedOnly, showRelationships,
      showDocumentMentions, documentEntityIds: new Set((documentRolesQuery.data ?? []).map(role => role.entityId)) },
  ), [entitiesQuery.data, relationshipsQuery.data, documentsQuery.data, documentRolesQuery.data,
    selectedDocumentId, excludedEntityTypes, relationshipType, connectedOnly, showRelationships, showDocumentMentions]);
  const visibleEntities = graphData.nodes.filter(node => node.kind === "entity");
  const visibleRelationships = graphData.links.filter(link => link.kind === "relationship");
  const visibleMemberships = graphData.links.filter(link => link.kind === "document_mention");
  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? graphData.nodes.filter(node => node.kind === "entity" &&
      `${node.name} ${node.type}`.toLowerCase().includes(query)) : [];
  }, [graphData, search]);
  const entityTypes = [...new Set(entities.map(entity => entity.type))].sort();
  const scopedEntityIds = new Set((documentRolesQuery.data ?? []).map(role => role.entityId));
  const entityTypeCount = (type: string) => entities.filter(entity => entity.type === type &&
    (selectedDocumentId === null || entity.sourceDocumentIds?.includes(selectedDocumentId) || scopedEntityIds.has(entity.id))).length;
  const relationshipTypes = [...new Set((relationships ?? []).map(row => row.relationshipType))].sort();
  const graphLoading = entitiesQuery.isLoading || relationshipsQuery.isLoading || projectionQuery.isLoading || documentsQuery.isLoading
    || (!!selectedDocument && documentRolesQuery.isLoading);
  const graphError = entitiesQuery.error || relationshipsQuery.error || projectionQuery.error || documentsQuery.error
    || (selectedDocument ? documentRolesQuery.error : null);
  const invalidDocument = selectedDocumentId !== null && !documentsQuery.isLoading && !selectedDocument;

  useEffect(() => {
    setSelectedNode(null); setSelectedLink(null); setMentionLimit(12); fitPending.current = true;
  }, [currentCaseId, selectedDocumentId, excludedEntityTypes, relationshipType, connectedOnly, showRelationships, showDocumentMentions]);
  useEffect(() => {
    if (previousCase.current === currentCaseId) return;
    previousCase.current = currentCaseId;
    setSearch(''); setExcludedEntityTypes(new Set()); setRelationshipType(null); setConnectedOnly(false);
    setShowRelationships(true); setShowDocumentMentions(true); setLocation('/network');
  }, [currentCaseId, setLocation]);
  useEffect(() => { setSearchLimit(20); }, [search]);
  useEffect(() => { setMentionLimit(12); }, [selectedEntityId, sourceDocumentFilter]);
  useEffect(() => { fitPending.current = true; }, [graphData]);
  useEffect(() => {
    if ((selectedNode || selectedLink) && window.innerWidth < 768) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedNode, selectedLink]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setDimensions({ width: entry.contentRect.width, height: Math.max(400, entry.contentRect.height) });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [graphLoading, graphError, graphData.nodes.length]);

  const focusNode = useCallback((node: EvidenceGraphNode) => {
    fitPending.current = false;
    setSelectedNode(node); setSelectedLink(null);
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      graphRef.current?.centerAt(node.x, node.y, 500);
      graphRef.current?.zoom(2, 500);
    }
  }, []);
  const openDocument = (documentId: number) => setLocation(`/documents/${documentId}?from=${encodeURIComponent(buildFromParam())}`);
  const nodeName = (endpoint: string | EvidenceGraphNode) => typeof endpoint === "object" ? endpoint.name
    : graphData.nodes.find(node => node.id === endpoint)?.name ?? "Unknown endpoint";
  const resetFilters = () => {
    setExcludedEntityTypes(new Set()); setConnectedOnly(false); setRelationshipType(null); setSearch("");
  };

  if (!currentCaseId) return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <p className="text-muted-foreground">Select a case first</p>
    <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
  </div>;
  if (graphError) return <Card><CardContent className="p-6 space-y-2">
    <h1 className="text-lg font-semibold">Network Graph</h1>
    <p className="text-sm text-destructive">Graph evidence could not be loaded: {graphError.message}</p>
  </CardContent></Card>;

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Network Graph</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {entities.length} registered entities · {visibleEntities.length} shown · {visibleRelationships.length} explicit connections
        {showDocumentMentions && ` · ${visibleMemberships.length} document mentions`}
      </p>
    </div>

    <Card><CardContent className="p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium space-y-1.5">Evidence scope
          <select aria-label="Evidence scope" className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={selectedDocumentId ?? "all"} onChange={event => {
              const documentId = event.target.value;
              if (documentId !== "all") setShowDocumentMentions(true);
              setLocation(documentId === "all" ? "/network" : `/network?documentId=${documentId}`);
            }}>
            <option value="all">All case evidence</option>
            {documents.map(document => <option key={document.id} value={document.id}>{deriveDocumentDisplayLabel(document.filename)}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium space-y-1.5">Find a person or organization
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Find an entity" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, facility, or entity type" />
          </div>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <legend className="mb-2 font-medium">Layers and connections</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showRelationships} onChange={event => setShowRelationships(event.target.checked)} />Explicit relationships</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showDocumentMentions} onChange={event => setShowDocumentMentions(event.target.checked)} />Document mentions</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={connectedOnly} onChange={event => setConnectedOnly(event.target.checked)} />Connected entities only</label>
        <select aria-label="Relationship type" className="max-w-full rounded border bg-background px-2 py-1" value={relationshipType ?? "all"}
          onChange={event => setRelationshipType(event.target.value === "all" ? null : event.target.value)}>
          <option value="all">All relationship types</option>
          {relationshipTypes.map(type => <option key={type} value={type}>{readable(type)}</option>)}
        </select>
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <legend className="mb-2 font-medium">Entity types</legend>
        {entityTypes.map(type => <label key={type} className="flex items-center gap-1.5 capitalize">
          <input type="checkbox" checked={!excludedEntityTypes.has(type)} onChange={event => setExcludedEntityTypes(previous => {
            const next = new Set(previous); if (event.target.checked) next.delete(type); else next.add(type); return next;
          })} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENTITY_TYPE_COLORS[type] ?? '#94a3b8' }} />
          {readable(type)} ({entityTypeCount(type)})
        </label>)}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetFilters}>Reset filters</Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">Solid arrows show explicitly stated relationships. Dashed purple lines show where an entity is mentioned. People in the same document are not automatically related.</p>
      {search.trim() && <div className="rounded-md border p-2 space-y-1" aria-label="Entity search results">
        <p className="text-xs text-muted-foreground px-2 py-1">{searchResults.length} matches in the current view</p>
        <div className="max-h-52 overflow-y-auto">
          {searchResults.slice(0, searchLimit).map(node => <button key={node.id} type="button" onClick={() => focusNode(node)}
            className="w-full rounded px-2 py-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-primary">
            <span className="text-sm font-medium">{node.name}</span>
            <span className="block text-xs text-muted-foreground truncate">{readable(node.type)} · {node.sourceDocumentIds.map(id => documents.find(document => document.id === id)?.filename ?? `Document ${id}`).join(' · ') || 'Source-bound entity'}</span>
          </button>)}
        </div>
        {searchResults.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Try another name or reset the entity filters and evidence scope.</p>}
        {searchResults.length > searchLimit && <Button variant="ghost" size="sm" onClick={() => setSearchLimit(limit => limit + 20)}>Show more matches</Button>}
      </div>}
    </CardContent></Card>

    {graphLoading ? <Card><CardContent className="p-8 flex items-center justify-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading source-bound graph…</CardContent></Card>
      : invalidDocument ? <Card><CardContent className="p-6 space-y-3"><p className="text-sm">This document is not available in the selected case.</p><Button variant="outline" onClick={() => setLocation('/network')}>Show all case evidence</Button></CardContent></Card>
      : graphData.nodes.length === 0 ? <Card><CardContent className="p-8 flex flex-col items-center gap-3 text-center">
        <Network className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm">{entities.length ? 'No source-bound entities match these filters.' : 'No eligible sealed entity projection is available for this case.'}</p>
        <Button variant="outline" onClick={resetFilters}>Reset filters</Button>
      </CardContent></Card> : <>
        {graphData.availableRelationshipCount === 0 && <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
          {projectionQuery.data?.projection_state === 'canonical_projection' ? 'No explicit relationships are recorded in this view.' : 'The relationship layer has no eligible sealed projection yet.'} Source-bound entities remain visible; select one to inspect its evidence.
        </p>}
        <div className={`grid gap-4 ${selectedNode || selectedLink ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <Button variant="outline" size="sm" onClick={() => graphRef.current?.zoomToFit(400, 45)}><Scan className="mr-1.5 h-3.5 w-3.5" />Fit view</Button>
              <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.4, 300)}><ZoomIn className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.4, 300)}><ZoomOut className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground">Select a node or connection for its sources</span>
            </div>
            <div ref={containerRef} className="w-full h-[65vh] min-h-[400px] max-h-[700px]">
              <ForceGraph2D ref={graphRef} graphData={graphData} width={dimensions.width} height={dimensions.height}
                backgroundColor="transparent" nodeLabel={(node: any) => safeTooltip(`${node.name} (${readable(node.type)})`)} nodeColor={(node: any) => node.color}
                nodeRelSize={5} linkColor={(link: any) => selectedLink?.id === link.id ? '#60a5fa' : link.kind === 'document_mention' ? 'rgba(167,139,250,0.45)' : 'rgba(148,163,184,0.8)'}
                linkLineDash={(link: any) => link.kind === 'document_mention' ? [4, 3] : null}
                linkWidth={(link: any) => selectedLink?.id === link.id ? 3 : link.kind === 'document_mention' ? 1 : 2}
                linkDirectionalArrowLength={(link: any) => link.kind === 'relationship' ? 5 : 0} linkDirectionalArrowRelPos={1}
                linkLabel={(link: any) => safeTooltip(`${readable(link.label)}${link.kind === 'relationship' ? ` (${link.evidenceCount} source spans)` : ''}`)}
                onNodeClick={(node: any) => focusNode(node)}
                onLinkClick={(link: any) => { setSelectedLink(link); setSelectedNode(null); }}
                onBackgroundClick={() => { setSelectedNode(null); setSelectedLink(null); }}
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
                  const radius = Math.sqrt(node.val) * 2.5;
                  ctx.beginPath();
                  if (node.kind === 'document') ctx.rect(node.x - radius, node.y - radius, radius * 2, radius * 2);
                  else ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                  ctx.fillStyle = node.color; ctx.fill();
                  if (selectedNode?.id === node.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / scale; ctx.stroke(); }
                  if (scale > 1 || selectedNode?.id === node.id || graphData.nodes.length < 12) {
                    ctx.font = `${Math.max(11 / scale, 2)}px Inter, sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    const label = node.name.length > 44 ? `${node.name.slice(0, 41)}…` : node.name;
                    ctx.fillText(label, node.x, node.y + radius + 3);
                  }
                }}
                onEngineStop={() => { if (fitPending.current) { fitPending.current = false; graphRef.current?.zoomToFit(300, 45); } }}
                cooldownTicks={100} d3AlphaDecay={0.035} d3VelocityDecay={0.35} />
            </div>
          </Card>

          {(selectedNode || selectedLink) && <aside ref={panelRef} className="min-w-0 scroll-mt-4">
            <Card><CardContent className="p-4 space-y-4">
              <div className="flex items-start gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{selectedLink?.kind === 'relationship' ? 'Connection evidence' : selectedLink?.kind === 'document_mention' ? 'Document mention evidence' : selectedNode?.kind === 'document' ? 'Source document' : 'Entity evidence'}</p>
                  <h2 className="text-sm font-semibold break-words mt-1">{selectedNode?.name ?? (selectedLink ? `${nodeName(selectedLink.source)} → ${nodeName(selectedLink.target)}` : '')}</h2>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close evidence panel" className="shrink-0 h-7 w-7" onClick={() => { setSelectedNode(null); setSelectedLink(null); }}><X className="h-4 w-4" /></Button>
              </div>
              {selectedNode?.kind === 'document' && <>
                <p className="text-xs text-muted-foreground">Dashed lines identify mentions in this document. They do not assert relationships between its people or organizations.</p>
                <Button variant="outline" className="w-full" onClick={() => openDocument(selectedNode.documentId!)}><ExternalLink className="mr-2 h-4 w-4" />Open source document</Button>
              </>}
              {selectedNode?.kind === 'entity' && <>
                <Badge variant="outline" className="capitalize">{readable(selectedNode.type)}</Badge>
                <p className="text-xs text-muted-foreground">{selectedNode.sourceMentionCount} total source mentions · {selectedNode.sourceDocumentIds.length} documents · {selectedNode.explicitConnectionCount} explicit connections in this view</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setLocation(`/entities/${selectedNode.entityId}?from=${encodeURIComponent(buildFromParam())}`)}>View entity details</Button>
              </>}
              {selectedLink?.kind === 'relationship' && <>
                <Badge variant="outline">{readable(selectedLink.label)}</Badge>
                {selectedLink.description && <p className="text-xs text-muted-foreground">{selectedLink.description}</p>}
                <p className="text-xs font-medium">{linkEvidence.length} supporting source spans</p>
                {evidenceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="max-h-[65vh] overflow-y-auto space-y-3">
                  {linkEvidence.map(evidence => <div key={evidence.id} className="rounded border p-3 space-y-2">
                    <blockquote className="text-xs leading-relaxed whitespace-pre-wrap">{evidence.quoteText}</blockquote>
                    <p className="text-xs text-muted-foreground break-words">{deriveDocumentDisplayLabel(evidence.documentFilename)}</p>
                    {evidence.canonical_marker_offset !== undefined && <p className="text-[11px] text-muted-foreground">Source offset {evidence.canonical_marker_offset}</p>}
                    <Button variant="outline" size="sm" className="w-full" onClick={() => openDocument(evidence.documentId)}><FileText className="mr-1.5 h-3.5 w-3.5" />Open source document</Button>
                    <ReadAloud text={evidence.quoteText ?? ''} forensicText={evidence.quoteText ? formatQuoteForReadAloud(evidence.quoteText, { documentName: evidence.documentFilename ?? undefined }) : undefined} label="" />
                  </div>)}
                  {!linkEvidence.length && <p className="text-xs text-muted-foreground">No backing source spans are available for this connection.</p>}
                </div>}
              </>}
              {selectedEntityId !== undefined && <>
                <p className="text-xs font-medium">Source mentions{sourceDocumentFilter ? ' in this document' : ''} ({sourceMentions.length})</p>
                {entityRolesQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : entityRolesQuery.error ? <p className="text-xs text-destructive">Source mentions could not be loaded: {entityRolesQuery.error.message}</p> : <div className="max-h-[65vh] overflow-y-auto space-y-3">
                  {sourceMentions.slice(0, mentionLimit).map(mention => <div key={mention.id} className="rounded border p-3 space-y-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{mention.sourceContext ? 'Exact source context' : 'Exact source mention'}</p>
                    <blockquote className="whitespace-pre-wrap text-xs leading-relaxed">{mention.sourceContext || mention.rawMention || 'Mention text was not retained by this projection.'}</blockquote>
                    {mention.sourceContext && mention.rawMention && <p className="text-[11px] text-muted-foreground">Mention: “{mention.rawMention}”</p>}
                    <p className="text-xs text-muted-foreground break-words">{deriveDocumentDisplayLabel(mention.documentFilename)}</p>
                    {mention.canonical_span_offset !== undefined && <p className="text-[11px] text-muted-foreground">Source offset {mention.canonical_span_offset}</p>}
                    {!!mention.bindingProvenanceRefs?.length && <Badge variant="outline" className="text-[10px]">Reviewed author binding</Badge>}
                    <Button variant="outline" size="sm" className="w-full" onClick={() => openDocument(mention.documentId)}><FileText className="mr-1.5 h-3.5 w-3.5" />Open source document</Button>
                  </div>)}
                  {!sourceMentions.length && <p className="text-xs text-muted-foreground">No preserved source mentions are available in this scope.</p>}
                  {sourceMentions.length > mentionLimit && <Button variant="outline" size="sm" className="w-full" onClick={() => setMentionLimit(limit => limit + 12)}>Show more ({sourceMentions.length - mentionLimit} remaining)</Button>}
                </div>}
              </>}
            </CardContent></Card>
          </aside>}
        </div>
      </>}
    {relationshipDependencies.length > 0 && <details className="rounded-md border p-3 text-xs"><summary className="cursor-pointer font-medium">Unresolved relationship dependencies ({relationshipDependencies.length})</summary><ul className="mt-2 space-y-1 list-disc pl-4 text-muted-foreground">{relationshipDependencies.map(dependency => <li key={dependency}>{dependency}</li>)}</ul></details>}
  </div>;
}
