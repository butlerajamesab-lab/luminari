import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, XCircle, ArrowUpRight, Wrench, AlertTriangle } from "lucide-react";

function fmt(n: number) {
  return Number(n ?? 0).toLocaleString();
}

interface LayerTable {
  name: string;
  label: string;
  count: number;
}

interface Layer {
  id: string;
  name: string;
  description: string;
  order: number;
  tables: LayerTable[];
  totalRecords: number;
  status: string;
  color: string;
}

interface Connection {
  from: string;
  to: string;
  label: string;
  strength: number;
}

const LAYER_ROUTES: Record<string, string> = {
  statutes: "/legal-library",
  case_law: "/legal-library",
  claim_elements: "/litigation-barriers",
  proof_frameworks: "/enforcement-intel",
  enforcement: "/enforcement-pathway",
  regulatory: "/enforcement-intel",
  investigation: "/investigation-workflow",
  intelligence: "/signal-registry",
};

const TARGET_SURFACE_ROUTES: Record<string, string> = {
  resource_directory: "/resources",
  legal_library: "/legal-library",
  workflow_and_accountability: "/enforcement-pathway",
  signal_context: "/viewfinder",
  case_workspace: "/workbench",
  operator_context: "/architecture-map",
  typed_corpus: "/architecture-map",
};

function targetSurfaceRoute(targetSurface: unknown) {
  return TARGET_SURFACE_ROUTES[String(targetSurface ?? "")] ?? "/architecture-map";
}

function layerRoute(layer: Layer) {
  return LAYER_ROUTES[layer.id] ?? "/architecture";
}

function statusBadge(count: number) {
  if (count > 0) {
    return <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs">seeded</Badge>;
  }
  return <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">empty</Badge>;
}

function LayerCard({ layer, expanded, onToggle }: { layer: Layer; expanded: boolean; onToggle: () => void }) {
  const populatedTables = layer.tables.filter(t => t.count > 0).length;
  const totalTables = layer.tables.length;

  return (
    <Card className="border cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/20" style={{ borderColor: `${layer.color}40`, background: `linear-gradient(135deg, ${layer.color}08 0%, ${layer.color}04 100%)` }} onClick={onToggle}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: layer.color }}>L{layer.order}</div>
            <div className="min-w-0">
              <CardTitle className="text-base text-white truncate">{layer.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{layer.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {layer.status === "populated" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
            <div className="text-right">
              <div className="text-lg font-bold text-white">{fmt(layer.totalRecords)}</div>
              <div className="text-xs text-muted-foreground">{populatedTables}/{totalTables} source tables</div>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${totalTables > 0 ? (populatedTables / totalTables) * 100 : 0}%`, backgroundColor: layer.color }} />
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="border-t border-white/10 pt-3 mt-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left pb-2 font-medium">Source table / view</th>
                  <th className="text-right pb-2 font-medium">Rows</th>
                  <th className="text-right pb-2 font-medium">Seed status</th>
                </tr>
              </thead>
              <tbody>
                {layer.tables.map(table => (
                  <tr key={table.name} className="border-t border-white/5">
                    <td className="py-1.5"><code className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/80">{table.name}</code></td>
                    <td className="text-right py-1.5 font-mono text-white/80">{fmt(table.count)}</td>
                    <td className="text-right py-1.5">{statusBadge(table.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ConnectionMap({ connections, layers }: { connections: Connection[]; layers: Layer[] }) {
  const [, navigate] = useLocation();
  const layerMap = new Map(layers.map(l => [l.id, l]));

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle className="text-base text-white flex items-center gap-2"><ArrowRight className="h-4 w-4" />Cross-Layer Connections</CardTitle>
        <p className="text-xs text-muted-foreground">These are configured architecture dependencies, not proof of national corpus completion.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {connections.map((conn, i) => {
            const from = layerMap.get(conn.from);
            const to = layerMap.get(conn.to);
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs cursor-pointer" style={{ color: from?.color, borderColor: `${from?.color}40` }} onClick={() => from && navigate(layerRoute(from))}>{from?.name?.split(" ")[0] ?? conn.from}</Badge>
                <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
                <Badge variant="outline" className="text-xs cursor-pointer" style={{ color: to?.color, borderColor: `${to?.color}40` }} onClick={() => to && navigate(layerRoute(to))}>{to?.name?.split(" ")[0] ?? conn.to}</Badge>
                <span className="text-xs text-muted-foreground truncate flex-1">{conn.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArchitectureMap() {
  const { data, isLoading } = trpc.architectureMap.getArchitectureOverview.useQuery();
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!data) return <div className="p-6 text-muted-foreground">Failed to load architecture data.</div>;

  const { layers, connections, summary } = data as any;
  const seedCoveragePercent = summary.seedCoveragePercent ?? summary.completionPercent ?? 0;
  const totalLayers = summary.totalLayers ?? summary.total_layers ?? layers.length;
  const currentSubstrate = summary.currentSubstrate;

  const toggleLayer = (id: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Layers className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Library Architecture Map</h1>
        </div>
        <p className="text-sm text-muted-foreground">Structural blueprint of Luminari's configured legal-intelligence seed layers, with the live current-object substrate reported separately. {fmt(totalLayers)} layers, {fmt(summary.totalTables)} source tables/views, {fmt(summary.totalRecords)} currently wired seed records.</p>
      </div>

      {currentSubstrate?.availability === "available" && (
        <Card className="border-cyan-400/20 bg-cyan-400/5">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base text-cyan-100">Current Node Substrate</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Live source-reconciled civic objects and their intended UI surfaces. These counts do not inflate the governed legal seed layers below.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/resources")}>Resource Directory</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/viewfinder")}>Anomaly Viewfinder</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                ["Current objects", currentSubstrate.totalCurrentObjects],
                ["Typed ready", currentSubstrate.typedReady],
                ["Jurisdiction ready", currentSubstrate.jurisdictionReady],
                ["Access point", currentSubstrate.withAccessPoint],
                ["Direct access", currentSubstrate.directAccessReady],
                ["Unresolved / held", currentSubstrate.unresolvedOrHeld],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <div className="text-lg font-bold text-cyan-100">{fmt(Number(value))}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <details className="rounded-lg border border-white/10 bg-black/10">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-cyan-100">
                Route all {fmt(currentSubstrate.objectClasses?.length ?? 0)} current object classes
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 pt-1">
                {(currentSubstrate.objectClasses ?? []).map((row: any) => (
                  <div key={`${row.objectClass}:${row.targetSurface}`} className="rounded-md border border-white/10 bg-white/[0.025] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium text-white break-words">{String(row.objectClass).replace(/_/g, " ")}</div>
                      <div className="font-mono text-xs text-cyan-200 shrink-0">{fmt(row.objectCount)}</div>
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-left text-[10px] text-cyan-200 hover:text-cyan-100"
                      onClick={() => navigate(targetSurfaceRoute(row.targetSurface))}
                    >
                      → {String(row.targetSurface).replace(/_/g, " ")}
                    </button>
                    <div className="mt-1 text-[9px] text-white/40">{fmt(row.typedReadyCount)} typed · {fmt(row.jurisdictionReadyCount)} jurisdiction-ready</div>
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-400/20 bg-amber-400/5">
        <CardContent className="p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-amber-200">Seed coverage only — not national completion</div>
            <p className="text-xs text-muted-foreground mt-1">This page reports whether configured architecture layers are wired to populated source tables. Full Lighthouse population requires tens of thousands of verified civic, legal, resource, contact, workflow, benefit, oversight, and routing records.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-white">{totalLayers}</div><div className="text-xs text-muted-foreground">Layers</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-white">{summary.totalTables}</div><div className="text-xs text-muted-foreground">Source Tables</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-400">{fmt(summary.totalRecords)}</div><div className="text-xs text-muted-foreground">Wired Records</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-emerald-400">{summary.populatedLayers}/{totalLayers}</div><div className="text-xs text-muted-foreground">Seeded Layers</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-amber-400">{seedCoveragePercent}%</div><div className="text-xs text-muted-foreground">Seed Coverage</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setExpandedLayers(new Set(layers.map((l: Layer) => l.id)))} className="text-xs">Expand All</Button>
        <Button variant="outline" size="sm" onClick={() => setExpandedLayers(new Set())} className="text-xs">Collapse All</Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Seeded</span><span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Empty</span></div>
      </div>

      <div className="space-y-3">
        {layers.map((layer: Layer) => <LayerCard key={layer.id} layer={layer} expanded={expandedLayers.has(layer.id)} onToggle={() => toggleLayer(layer.id)} />)}
      </div>

      <ConnectionMap connections={connections} layers={layers} />

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2"><ExternalLink className="h-4 w-4" />Explore Layers</CardTitle>
          <p className="text-xs text-muted-foreground">Each layer opens the operational page that should draw from the same canonical source tables/views shown above.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {layers.map((layer: Layer) => (
              <div key={layer.id} className="group rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 transition-all p-3 flex flex-col gap-2" style={{ borderColor: `${layer.color}30` }}>
                <div className="flex items-start justify-between gap-1">
                  <div><div className="text-sm font-medium text-white leading-tight">{layer.name}</div><div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{layer.tables.length} source tables/views</div></div>
                  <div className="text-lg font-bold shrink-0" style={{ color: layer.color }}>{fmt(layer.totalRecords)}</div>
                </div>
                <div className="flex gap-1.5 mt-auto">
                  <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs px-2 text-white/70 hover:text-white hover:bg-white/10" onClick={() => navigate(layerRoute(layer))}><ArrowUpRight className="h-3 w-3 mr-1" />Open</Button>
                  <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs px-2 hover:bg-white/10" style={{ color: layer.color }} onClick={() => navigate(`/workshop?from=${encodeURIComponent(layer.name)}&layer=${encodeURIComponent(layerRoute(layer))}`)}><Wrench className="h-3 w-3 mr-1" />Workshop</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
