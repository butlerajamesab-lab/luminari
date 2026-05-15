// @ts-nocheck — pre-existing type drift
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database, Shield, FileOutput, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Layers, Activity, BarChart3, Download,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Panel 1: Metadata Health
   ═══════════════════════════════════════════════════════════════ */

export function MetadataHealthPanel() {
  const { data, isLoading, refetch } = trpc.conduit.metadataHealth.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const scanMutation = trpc.conduit.scanSchema.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="Metadata health unavailable" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-400" />
          Metadata Health
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Re-scan Schema
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Tables Registered" value={data.tables.total} color="blue" />
        <MetricTile label="Fields Tracked" value={data.fields.total} color="emerald" />
        <MetricTile
          label="Coverage"
          value={`${data.drift.coverage}%`}
          color={data.drift.coverage >= 90 ? "emerald" : data.drift.coverage >= 70 ? "amber" : "red"}
        />
        <MetricTile
          label="Orphan Fields"
          value={data.drift.orphanFields}
          color={data.drift.orphanFields === 0 ? "emerald" : "red"}
        />
      </div>

      {/* Table Categories */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Tables by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {data.tables.byCategory.map((row: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                <span className="text-muted-foreground capitalize">{row.category}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant={row.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                    {row.status}
                  </Badge>
                  <span className="font-mono">{row.cnt}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Field Stats */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Field Dictionary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center p-2 rounded bg-muted/30">
              <div className="font-mono text-lg">{data.fields.stats.totalFields || data.fields.total}</div>
              <div className="text-muted-foreground">Total Fields</div>
            </div>
            <div className="text-center p-2 rounded bg-muted/30">
              <div className="font-mono text-lg">{data.fields.stats.pkFields || 0}</div>
              <div className="text-muted-foreground">Primary Keys</div>
            </div>
            <div className="text-center p-2 rounded bg-muted/30">
              <div className="font-mono text-lg">{data.fields.stats.indexedFields || 0}</div>
              <div className="text-muted-foreground">Indexed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drift Warnings */}
      {data.drift.unknownTables > 0 && (
        <div className="text-xs text-amber-400 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{data.drift.unknownTables} unregistered tables: {data.drift.unknownTableNames.join(', ')}</span>
        </div>
      )}

      {/* Conduit Events (24h) */}
      {data.events24h.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conduit Events (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data.events24h.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-mono">{e.event_type}</span>
                  <span className="font-mono">{e.cnt}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Panel 2: Pipeline Integrity
   ═══════════════════════════════════════════════════════════════ */

export function PipelineIntegrityPanel() {
  const { data, isLoading, refetch } = trpc.conduit.pipelineIntegrity.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="Pipeline integrity unavailable" />;

  const fmt = data.formatDistribution;
  const totalRuns = fmt.total || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-400" />
          Pipeline Integrity
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Output Format Distribution */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Total Runs" value={fmt.total} color="blue" />
        <MetricTile label="Deterministic" value={fmt.deterministic} color="emerald" />
        <MetricTile label="Legacy" value={fmt.legacy} color="amber" />
        <MetricTile label="No Refs" value={fmt.no_refs} color="red" />
      </div>

      {/* Deterministic Coverage Bar */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Deterministic Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round((fmt.deterministic / totalRuns) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{Math.round((fmt.deterministic / totalRuns) * 100)}% deterministic</span>
            <span>{fmt.deterministic}/{fmt.total} runs</span>
          </div>
        </CardContent>
      </Card>

      {/* Enforcement Results */}
      {data.enforcement.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enforcement (Recent Runs)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.enforcement.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <span className="font-mono text-muted-foreground truncate max-w-[200px]">{e.run_id}</span>
                  <div className="flex items-center gap-2">
                    {e.allPassed ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> PASS
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        <XCircle className="h-3 w-3 mr-1" /> {e.failedRules.length} FAIL
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backbone Counts */}
      {data.backboneCounts.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Backbone Population</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.backboneCounts.map((b: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground capitalize">{b.table_name.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{b.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Runs Table */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Engine Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="text-left py-1 pr-2">Engine</th>
                  <th className="text-left py-1 pr-2">Status</th>
                  <th className="text-left py-1 pr-2">Refs</th>
                  <th className="text-left py-1">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.slice(0, 15).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1 pr-2 font-mono">{r.engine_id}</td>
                    <td className="py-1 pr-2">
                      <Badge
                        variant={r.status === 'success' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2">
                      <Badge
                        variant={r.ref_format === 'deterministic' ? 'default' : r.ref_format === 'legacy' ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {r.ref_format}
                      </Badge>
                    </td>
                    <td className="py-1">
                      {r.has_snapshot ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Panel 3: Export Readiness
   ═══════════════════════════════════════════════════════════════ */

export function ExportReadinessPanel() {
  const { data, isLoading, refetch } = trpc.conduit.exportReadiness.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const exportMutation = trpc.conduit.generateAlphaExport.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="Export readiness unavailable" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileOutput className="h-5 w-5 text-emerald-400" />
          Export Readiness (Alpha Lake)
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricTile label="Total Snapshots" value={data.snapshots.length} color="blue" />
        <MetricTile label="Ready for Export" value={data.readySnapshots.length} color="emerald" />
        <MetricTile label="Alpha Exports" value={data.totalAlphaExports} color="violet" />
      </div>

      {/* Ready Snapshots */}
      {data.readySnapshots.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Export-Ready Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.readySnapshots.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <div>
                    <span className="font-mono">Snapshot #{s.snapshotId}</span>
                    <span className="text-muted-foreground ml-2">Case #{s.caseId}</span>
                    <span className="text-muted-foreground ml-2">{s.boundRuns} runs</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => exportMutation.mutate({ snapshotId: s.snapshotId })}
                    disabled={exportMutation.isPending}
                  >
                    {exportMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                    Export
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Snapshots */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="text-left py-1 pr-2">ID</th>
                  <th className="text-left py-1 pr-2">Case</th>
                  <th className="text-left py-1 pr-2">Status</th>
                  <th className="text-left py-1 pr-2">Runs</th>
                  <th className="text-left py-1">Success</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1 pr-2 font-mono">#{s.id}</td>
                    <td className="py-1 pr-2 font-mono">#{s.caseId}</td>
                    <td className="py-1 pr-2">
                      <Badge variant={s.status === 'sealed' ? 'default' : 'secondary'} className="text-[10px]">
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2 font-mono">{s.boundRuns}</td>
                    <td className="py-1 font-mono">{s.successRuns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Alpha Lake Exports */}
      {data.exports.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alpha Lake Exports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data.exports.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <div>
                    <span className="font-mono">Export #{e.id}</span>
                    <span className="text-muted-foreground ml-2">Snapshot #{e.snapshot_id}</span>
                  </div>
                  <Badge variant={e.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                    {e.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function MetricTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    red: "text-red-400",
    orange: "text-orange-400",
  };
  return (
    <div className="p-3 rounded-lg bg-muted/30 text-center">
      <div className={`text-xl font-mono font-semibold ${colorMap[color] || "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-48 bg-muted/50 rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg" />)}
      </div>
      <div className="h-32 bg-muted/30 rounded-lg" />
    </div>
  );
}

function PanelEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
