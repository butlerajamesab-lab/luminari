import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { architecture_layer_route, current_object_inspection_route } from "../../../shared/architecture-routes";
import CurrentCorpusConnections from "@/components/CurrentCorpusConnections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, XCircle, ArrowUpRight, Wrench, AlertTriangle } from "lucide-react";

function fmt(n: number) {
  return Number(n ?? 0).toLocaleString();
}

interface layer_table {
  name: string;
  label: string;
  count: number;
}

interface layer {
  id: string;
  name: string;
  description: string;
  order: number;
  tables: layer_table[];
  total_records: number;
  status: string;
  color: string;
}

interface connection {
  from: string;
  to: string;
  label: string;
  relationship_state: "configured_dependency";
  verified_edge_count: number | null;
}

function layer_route(layer: layer) {
  return architecture_layer_route(layer.id);
}

function status_badge(count: number) {
  if (count > 0) {
    return <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs">seeded</Badge>;
  }
  return <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">empty</Badge>;
}

function LayerCard({ layer, expanded, on_toggle }: { layer: layer; expanded: boolean; on_toggle: () => void }) {
  const populated_tables = layer.tables.filter(t => t.count > 0).length;
  const total_tables = layer.tables.length;

  return (
    <Card className="border cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/20" style={{ borderColor: `${layer.color}40`, background: `linear-gradient(135deg, ${layer.color}08 0%, ${layer.color}04 100%)` }} onClick={on_toggle}>
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
              <div className="text-lg font-bold text-white">{fmt(layer.total_records)}</div>
              <div className="text-xs text-muted-foreground">{populated_tables}/{total_tables} source tables</div>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total_tables > 0 ? (populated_tables / total_tables) * 100 : 0}%`, backgroundColor: layer.color }} />
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
                    <td className="text-right py-1.5">{status_badge(table.count)}</td>
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

function ConnectionMap({ connections, layers }: { connections: connection[]; layers: layer[] }) {
  const [, navigate] = useLocation();
  const layer_map = new Map(layers.map(l => [l.id, l]));

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle className="text-base text-white flex items-center gap-2"><ArrowRight className="h-4 w-4" />Cross-layer Connections</CardTitle>
        <p className="text-xs text-muted-foreground">Configured dependencies describe the intended architecture. Recorded object relationships and unresolved links are shown in the inspector above.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {connections.map((conn, i) => {
            const from = layer_map.get(conn.from);
            const to = layer_map.get(conn.to);
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs cursor-pointer" style={{ color: from?.color, borderColor: `${from?.color}40` }} onClick={() => from && navigate(layer_route(from))}>{from?.name?.split(" ")[0] ?? conn.from}</Badge>
                <ArrowRight className="h-3 w-3 text-white/30 shrink-0" />
                <Badge variant="outline" className="text-xs cursor-pointer" style={{ color: to?.color, borderColor: `${to?.color}40` }} onClick={() => to && navigate(layer_route(to))}>{to?.name?.split(" ")[0] ?? conn.to}</Badge>
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
  const { data, isLoading: is_loading } = trpc.architectureMap.get_architecture_overview.useQuery();
  const [expanded_layers, set_expanded_layers] = useState<Set<string>>(new Set());
  const [, navigate] = useLocation();

  if (is_loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!data) return <div className="p-6 text-muted-foreground">Failed to load architecture data.</div>;

  const { layers, connections, summary } = data as any;
  const seed_coverage_percent = summary.seed_coverage_percent ?? summary.completion_percent ?? 0;
  const total_layers = summary.total_layers ?? layers.length;
  const current_substrate = summary.current_substrate;

  const toggle_layer = (id: string) => {
    set_expanded_layers(prev => {
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
        <p className="text-sm text-muted-foreground">Structural blueprint of Luminari's configured legal-intelligence seed layers, with the live current-object substrate reported separately. {fmt(total_layers)} layers, {fmt(summary.total_tables)} source tables/views, {fmt(summary.total_records)} currently wired seed records.</p>
      </div>

      {current_substrate?.availability === "available" && (
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
                ["Current objects", current_substrate.total_current_objects],
                ["Typed ready", current_substrate.typed_ready],
                ["Jurisdiction ready", current_substrate.jurisdiction_ready],
                ["Access point", current_substrate.with_access_point],
                ["Direct access", current_substrate.direct_access_ready],
                ["Unresolved / held", current_substrate.unresolved_or_held],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <div className="text-lg font-bold text-cyan-100">{fmt(Number(value))}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <details className="rounded-lg border border-white/10 bg-black/10">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-cyan-100">
                Inspect all {fmt(current_substrate.object_classes?.length ?? 0)} current object classes
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 pt-1">
                {(current_substrate.object_classes ?? []).map((row: any) => (
                  <div key={`${row.object_class}:${row.target_surface}`} className="rounded-md border border-white/10 bg-white/[0.025] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium text-white break-words">{String(row.object_class).replace(/_/g, " ")}</div>
                      <div className="font-mono text-xs text-cyan-200 shrink-0">{fmt(row.object_count)}</div>
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-left text-[10px] text-cyan-200 hover:text-cyan-100"
                      onClick={() => navigate(current_object_inspection_route(row.object_class))}
                    >
                      Inspect records and connections
                    </button>
                    <div className="mt-1 text-[9px] text-white/40">{fmt(row.typed_ready_count)} typed · {fmt(row.jurisdiction_ready_count)} jurisdiction-ready</div>
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {current_substrate?.availability === "unavailable" && <p role="alert" className="text-amber-200">Current record counts could not be loaded. Their totals are unknown.</p>}

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
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-white">{total_layers}</div><div className="text-xs text-muted-foreground">Layers</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-white">{summary.total_tables}</div><div className="text-xs text-muted-foreground">Source Tables</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-400">{fmt(summary.total_records)}</div><div className="text-xs text-muted-foreground">Wired Records</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-emerald-400">{summary.populated_layers}/{total_layers}</div><div className="text-xs text-muted-foreground">Seeded Layers</div></CardContent></Card>
        <Card className="border-white/10"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-amber-400">{seed_coverage_percent}%</div><div className="text-xs text-muted-foreground">Seed Coverage</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => set_expanded_layers(new Set(layers.map((l: layer) => l.id)))} className="text-xs">Expand All</Button>
        <Button variant="outline" size="sm" onClick={() => set_expanded_layers(new Set())} className="text-xs">Collapse All</Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Seeded</span><span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Empty</span></div>
      </div>

      <div className="space-y-3">
        {layers.map((layer: layer) => <LayerCard key={layer.id} layer={layer} expanded={expanded_layers.has(layer.id)} on_toggle={() => toggle_layer(layer.id)} />)}
      </div>

      <CurrentCorpusConnections object_classes={(current_substrate?.object_classes ?? []).map((row: any) => String(row.object_class))} />

      <ConnectionMap connections={connections} layers={layers} />

      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2"><ExternalLink className="h-4 w-4" />Explore Layers</CardTitle>
          <p className="text-xs text-muted-foreground">Each layer opens the operational page that should draw from the same canonical source tables/views shown above.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {layers.map((layer: layer) => (
              <div key={layer.id} className="group rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 transition-all p-3 flex flex-col gap-2" style={{ borderColor: `${layer.color}30` }}>
                <div className="flex items-start justify-between gap-1">
                  <div><div className="text-sm font-medium text-white leading-tight">{layer.name}</div><div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{layer.tables.length} source tables/views</div></div>
                  <div className="text-lg font-bold shrink-0" style={{ color: layer.color }}>{fmt(layer.total_records)}</div>
                </div>
                <div className="flex gap-1.5 mt-auto">
                  <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs px-2 text-white/70 hover:text-white hover:bg-white/10" onClick={() => navigate(layer_route(layer))}><ArrowUpRight className="h-3 w-3 mr-1" />Open</Button>
                  <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs px-2 hover:bg-white/10" style={{ color: layer.color }} onClick={() => navigate(`/workshop?from=${encodeURIComponent(layer.name)}&layer=${encodeURIComponent(layer_route(layer))}`)}><Wrench className="h-3 w-3 mr-1" />Workshop</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
