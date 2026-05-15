// @ts-nocheck
/**
 * CanonicalSpineDashboard — Surfaces the 5-table canonical spine in Mission Control.
 * Shows: signal flow logs (L7), world nodes (L10), enforcement status, dead-end audit,
 * and remedy path creation.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database, Activity, Globe, Route, Shield, AlertTriangle,
  Loader2, CheckCircle2, XCircle, Zap, Eye, Network,
  Plus, RefreshCw, ChevronRight,
} from "lucide-react";

function MetricTile({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <div className={`p-3 rounded-lg border ${colorMap[color] ?? colorMap.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold font-mono">{value}</div>
    </div>
  );
}

export function CanonicalSpineDashboard() {
  const { data: status, isLoading, refetch } = trpc.canonicalSpine.status.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: deadEnds, refetch: refetchDeadEnds } = trpc.canonicalSpine.auditDeadEnds.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: flowLogs } = trpc.canonicalSpine.flowLogs.useQuery({ limit: 20 });
  const { data: worldNodes } = trpc.canonicalSpine.worldNodes.list.useQuery({ limit: 20 });

  const [showCreateNode, setShowCreateNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({
    biomeType: "",
    nodeName: "",
    latitude: "",
    longitude: "",
    accessProtocol: "",
    capacityStatus: "AVAILABLE" as "AVAILABLE" | "LIMITED" | "FULL",
    resourceLinks: "",
    validFor: "",
    activeRemedy: false,
  });

  const createNodeMut = trpc.canonicalSpine.worldNodes.create.useMutation({
    onSuccess: () => {
      refetch();
      refetchDeadEnds();
      setShowCreateNode(false);
      setNodeForm({
        biomeType: "", nodeName: "", latitude: "", longitude: "",
        accessProtocol: "", capacityStatus: "AVAILABLE", resourceLinks: "", validFor: "", activeRemedy: false,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const deadEndCount = deadEnds?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Network className="h-5 w-5 text-violet-400" />
          Canonical Spine — Implementation Package
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">
            L1→L11
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchDeadEnds(); }}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricTile label="Ingested Records (L1-L2)" value={status?.ingestedRecords ?? 0} icon={<Database className="h-4 w-4" />} color="blue" />
        <MetricTile label="Detected Signals (L3-L4)" value={status?.detectedSignals ?? 0} icon={<Zap className="h-4 w-4" />} color="emerald" />
        <MetricTile label="Flow Logs (L7)" value={status?.signalFlowLogs ?? 0} icon={<Eye className="h-4 w-4" />} color="violet" />
        <MetricTile label="World Nodes (L10)" value={status?.worldNodes ?? 0} icon={<Globe className="h-4 w-4" />} color="orange" />
        <MetricTile label="Remedy Paths (L8-L11)" value={status?.canonicalRemedyPaths ?? 0} icon={<Route className="h-4 w-4" />} color="amber" />
      </div>

      {/* Enforcement Status */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" /> Enforcement Rules — Active
            </CardTitle>
            <Badge variant={deadEndCount > 0 ? "destructive" : "default"} className="text-xs">
              {deadEndCount > 0 ? `${deadEndCount} Dead Ends` : "All Clear"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Signal Flow: Read-Only</span>
            </div>
            <div className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">No Dead Ends Guard</span>
            </div>
            <div className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">World Node Validation</span>
            </div>
            <div className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Deterministic Pipeline</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dead-End Audit */}
      {deadEndCount > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Dead-End Signals — No Remedy Path or Block Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(deadEnds ?? []).slice(0, 20).map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-background/50">
                  <span className="font-mono text-muted-foreground">{d.signal_id}</span>
                  <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                    {d.signal_type ?? "unknown"}
                  </Badge>
                </div>
              ))}
            </div>
            {deadEndCount > 20 && (
              <p className="text-xs text-muted-foreground mt-2">...and {deadEndCount - 20} more</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signal Flow Logs (L7 — Read-Only) */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4 text-violet-400" /> Signal Flow Logs (L7 — Read-Only)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(flowLogs ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No flow logs yet. Logs are auto-generated when signals are detected via the canonical spine.
                </p>
              ) : (
                (flowLogs ?? []).map((log: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-background/50 border border-border/50 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-violet-400">{log.signal_id_sfl}</span>
                      <span className="text-muted-foreground">{new Date(log.processed_at).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {log.vector_path}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">density: {log.flow_density}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* World Nodes (L10) */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-orange-400" /> Sovereign Nodes (L10)
              </CardTitle>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateNode(!showCreateNode)}>
                <Plus className="h-3 w-3 mr-1" /> Add Node
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showCreateNode && (
              <div className="mb-4 p-3 rounded-lg bg-background/50 border border-primary/30 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Biome Type *" value={nodeForm.biomeType} onChange={e => setNodeForm(p => ({ ...p, biomeType: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Node Name *" value={nodeForm.nodeName} onChange={e => setNodeForm(p => ({ ...p, nodeName: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Latitude" value={nodeForm.latitude} onChange={e => setNodeForm(p => ({ ...p, latitude: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Longitude" value={nodeForm.longitude} onChange={e => setNodeForm(p => ({ ...p, longitude: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-2">L10 Metadata Contract:</div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Access Protocol *" value={nodeForm.accessProtocol} onChange={e => setNodeForm(p => ({ ...p, accessProtocol: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                  <select value={nodeForm.capacityStatus} onChange={e => setNodeForm(p => ({ ...p, capacityStatus: e.target.value as any }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm">
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="LIMITED">LIMITED</option>
                    <option value="FULL">FULL</option>
                  </select>
                  <input placeholder="Resource Links (comma-sep)" value={nodeForm.resourceLinks} onChange={e => setNodeForm(p => ({ ...p, resourceLinks: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Valid For (ontology keys, comma-sep) *" value={nodeForm.validFor} onChange={e => setNodeForm(p => ({ ...p, validFor: e.target.value }))} className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={nodeForm.activeRemedy} onChange={e => setNodeForm(p => ({ ...p, activeRemedy: e.target.checked }))} />
                    Active Remedy
                  </label>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!nodeForm.biomeType || !nodeForm.nodeName || !nodeForm.accessProtocol || !nodeForm.validFor || createNodeMut.isPending}
                  onClick={() => {
                    createNodeMut.mutate({
                      biomeType: nodeForm.biomeType,
                      nodeName: nodeForm.nodeName,
                      latitude: nodeForm.latitude ? parseFloat(nodeForm.latitude) : undefined,
                      longitude: nodeForm.longitude ? parseFloat(nodeForm.longitude) : undefined,
                      metadataL10: {
                        access_protocol: nodeForm.accessProtocol,
                        capacity_status: nodeForm.capacityStatus,
                        resource_links: nodeForm.resourceLinks.split(",").map(s => s.trim()).filter(Boolean),
                        valid_for: nodeForm.validFor.split(",").map(s => s.trim()).filter(Boolean),
                      },
                      activeRemedy: nodeForm.activeRemedy,
                    });
                  }}
                >
                  {createNodeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Create World Node
                </Button>
                {createNodeMut.error && (
                  <p className="text-xs text-red-400">{createNodeMut.error.message}</p>
                )}
              </div>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(worldNodes ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No world nodes yet. Create sovereign nodes to enable LATERAL remedy routing.
                </p>
              ) : (
                (worldNodes ?? []).map((node: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-background/50 border border-border/50 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-orange-400">{node.node_name_wn}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{node.biome_type}</Badge>
                        <Badge variant={node.active_remedy ? "default" : "secondary"} className="text-[10px]">
                          {node.active_remedy ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    {node.metadataL10 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">{node.metadataL10.capacity_status}</Badge>
                        <Badge variant="outline" className="text-[10px]">{node.metadataL10.access_protocol}</Badge>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
