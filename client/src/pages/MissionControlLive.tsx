import { Link } from "wouter";
import { Activity, AlertTriangle, Database, ExternalLink, Loader2, Radio, RefreshCw, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function stateBadge(kind: "ok" | "loading" | "empty" | "error", label: string) {
  const className =
    kind === "ok"
      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      : kind === "loading"
        ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
        : kind === "error"
          ? "border-red-500/30 text-red-400 bg-red-500/10"
          : "border-amber-500/30 text-amber-400 bg-amber-500/10";
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

export default function MissionControlLive() {
  const systemHealth = trpc.adminDashboard.systemHealth.useQuery(undefined, QUERY_OPTIONS);
  const structuralSignals = trpc.adminDashboard.structuralSignals.useQuery(undefined, QUERY_OPTIONS);
  const workQueue = trpc.adminDashboard.workQueue.useQuery(undefined, QUERY_OPTIONS);

  const running = safeArray(workQueue.data?.running);
  const failed = safeArray(workQueue.data?.failed);
  const completed = safeArray(workQueue.data?.recentlyCompleted);
  const bySeverity = safeArray(structuralSignals.data?.bySeverity);
  const byCategory = safeArray(structuralSignals.data?.byCategory);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Live Stream Mission Control</h1>
              {stateBadge("ok", "stream surface")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Live/runtime surface only. This intentionally excludes guided case/intake panels so stream health can be checked without case-context noise.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild><Link href="/mission-control">Mission Control Home</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/intake">Guided Intake Control</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/full"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Full Dashboard</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" /> Runtime Health</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {systemHealth.isLoading ? stateBadge("loading", "loading") : systemHealth.error ? stateBadge("error", "api_error") : stateBadge("ok", "trusted_data")}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Total runs</span><span className="text-right font-mono">{systemHealth.data?.totalRuns ?? systemHealth.data?.total_runs ?? "—"}</span>
                <span>24h total</span><span className="text-right font-mono">{systemHealth.data?.last24h?.total ?? "—"}</span>
                <span>Success rate</span><span className="text-right font-mono">{systemHealth.data?.last24h?.successRate ?? systemHealth.data?.last24h?.success_rate ?? "—"}%</span>
              </div>
              {systemHealth.error && <p className="text-xs text-red-400">{systemHealth.error.message}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Radio className="h-4 w-4" /> Detected Signals</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {structuralSignals.isLoading ? stateBadge("loading", "loading") : structuralSignals.error ? stateBadge("error", "api_error") : stateBadge("ok", "trusted_data")}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Total findings</span><span className="text-right font-mono">{structuralSignals.data?.totalFindings ?? structuralSignals.data?.total_findings ?? "—"}</span>
                <span>Severity buckets</span><span className="text-right font-mono">{bySeverity.length}</span>
                <span>Type buckets</span><span className="text-right font-mono">{byCategory.length}</span>
              </div>
              {structuralSignals.error && <p className="text-xs text-red-400">{structuralSignals.error.message}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Runtime Queue</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {workQueue.isLoading ? stateBadge("loading", "loading") : workQueue.error ? stateBadge("error", "api_error") : stateBadge("ok", "trusted_data")}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Running</span><span className="text-right font-mono">{running.length}</span>
                <span>Failed</span><span className="text-right font-mono">{failed.length}</span>
                <span>Recently completed</span><span className="text-right font-mono">{completed.length}</span>
              </div>
              {workQueue.error && <p className="text-xs text-red-400">{workQueue.error.message}</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Live stream notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>This page is intentionally small: it should not pull guided intake, evidence, remedy, coalition, or campaign panels.</p>
            <p>If this page loads and the full dashboard does not, the remaining defect is in heavy convergence mounting, not the live stream tables themselves.</p>
          </CardContent>
        </Card>

        {(systemHealth.isLoading || structuralSignals.isLoading || workQueue.isLoading) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live stream summaries...</div>
        )}
        {(systemHealth.error || structuralSignals.error || workQueue.error) && (
          <div className="flex items-center gap-2 text-xs text-red-400"><AlertTriangle className="h-3.5 w-3.5" /> One or more live summary endpoints returned an error.</div>
        )}
      </div>
    </div>
  );
}
