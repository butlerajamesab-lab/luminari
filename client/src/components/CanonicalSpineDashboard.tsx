// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Network,
  RefreshCw,
  Radio,
  FileText,
  Globe,
  GitBranch,
  AlertTriangle,
} from "lucide-react";

function MetricTile({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return (
    <div className={`p-3 rounded-lg border ${colorMap[color] ?? colorMap.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold font-mono">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

export function CanonicalSpineDashboard() {
  const stateQuery = trpc.canonicalCore.currentState.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });
  const nodesQuery = trpc.canonicalCore.graphNodes.useQuery({ limit: 24 }, {
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const state = stateQuery.data;
  const nodes = nodesQuery.data ?? [];
  const signalDomains = state?.signal_domains ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Network className="h-5 w-5 text-violet-400" />
            Canonical Spine — Current Civic Graph
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Derived from current reconciled civic objects. Graph participation is a navigation layer, never a publication gate.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { stateQuery.refetch(); nodesQuery.refetch(); }}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricTile label="Source Artifacts" value={state?.source_artifacts ?? 0} icon={<FileText className="h-4 w-4" />} color="blue" />
        <MetricTile label="Candidates" value={state?.candidate_records ?? 0} icon={<Database className="h-4 w-4" />} color="blue" />
        <MetricTile label="Current Civic Objects" value={state?.current_civic_objects ?? 0} icon={<Globe className="h-4 w-4" />} color="emerald" />
        <MetricTile label="Graph Nodes" value={state?.graph_nodes ?? 0} icon={<Network className="h-4 w-4" />} color="violet" />
        <MetricTile label="Graph Edges" value={state?.graph_edges ?? 0} icon={<GitBranch className="h-4 w-4" />} color="orange" />
        <MetricTile label="Current Signals" value={state?.current_signals ?? 0} icon={<Radio className="h-4 w-4" />} color="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Object / Signal State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MetricTile label="Typed Ready" value={state?.typed_ready ?? 0} icon={<Database className="h-3 w-3" />} color="emerald" />
              <MetricTile label="Jurisdiction Ready" value={state?.jurisdiction_ready ?? 0} icon={<Globe className="h-3 w-3" />} color="blue" />
              <MetricTile label="Held / Unresolved" value={state?.unresolved_or_held ?? 0} icon={<AlertTriangle className="h-3 w-3" />} color="red" />
              <MetricTile label="Jurisdictions" value={state?.jurisdictions ?? 0} icon={<Globe className="h-3 w-3" />} color="violet" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Resources</span><div className="font-mono text-emerald-400">{Number(state?.resources ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Programs</span><div className="font-mono text-emerald-400">{Number(state?.programs ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Legal Authorities</span><div className="font-mono text-blue-400">{Number(state?.legal_authorities ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Workflows</span><div className="font-mono text-orange-400">{Number(state?.workflows ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Agencies / Oversight</span><div className="font-mono text-violet-400">{Number(state?.agencies ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Contacts</span><div className="font-mono text-blue-400">{Number(state?.contacts ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Documents</span><div className="font-mono">{Number(state?.documents ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">Findings</span><div className="font-mono">{Number(state?.findings ?? 0).toLocaleString()}</div></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded border border-border/50"><span className="text-muted-foreground">Intake Signals</span><div className="font-mono">{Number(signalDomains.intake ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded border border-border/50"><span className="text-muted-foreground">Legal Patterns</span><div className="font-mono">{Number(signalDomains.legal ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded border border-border/50"><span className="text-muted-foreground">Live Data Signals</span><div className="font-mono text-emerald-400">{Number(signalDomains.live_data ?? 0).toLocaleString()}</div></div>
              <div className="p-2 rounded border border-border/50"><span className="text-muted-foreground">Convergences</span><div className="font-mono">{Number(signalDomains.convergence ?? 0).toLocaleString()}</div></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Network className="h-4 w-4 text-violet-400" /> Current Civic Graph — Sample
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {Number(state?.graph_object_nodes ?? 0).toLocaleString()} object nodes
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {nodesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading derived graph nodes…</p>
            ) : nodes.length === 0 ? (
              <p className="text-xs text-red-300 py-4 text-center">No derived graph nodes returned. This is a canonical-spine failure, not an invitation to add nodes manually.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {nodes.map((node: any) => (
                  <div key={node.node_id} className="p-2 rounded bg-background/50 border border-border/50 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium truncate">{node.label}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{node.node_type}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                      <span>{node.jurisdiction_code ?? "national / unresolved"}</span>
                      <span>{node.node_origin}</span>
                      <span>{node.node_state}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate">{node.node_id}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground border border-border/50 rounded-lg p-3">
        Legacy manual world nodes: <span className="font-mono">{Number(state?.legacy_manual_world_nodes ?? 0).toLocaleString()}</span>. They are retained for compatibility, but they no longer define graph coverage or suppress canonical civic objects.
      </div>
    </div>
  );
}
