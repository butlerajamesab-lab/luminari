import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History,
  TrendingDown,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Square,
  ArrowLeft,
  Bell,
  BellOff,
} from "lucide-react";
import { Link } from "wouter";

function formatPercent(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : "—";
}

function formatRuntime(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value < 60000
    ? `${Math.round(value / 1000)}s`
    : `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
}

export default function ProvenanceHistory() {
  const [, setLocation] = useLocation();
  const { data: batchRuns, isLoading } = trpc.provenance.listBatchRuns.useQuery({ limit: 50 });
  const { data: alertHistory } = trpc.provenance.alertHistory.useQuery({ limit: 20 });

  // Trend deltas are comparisons between completed, non-empty runs only.
  // Running, aborted, and errored passes remain visible in the history table but
  // cannot be treated as comparable completed observations.
  const trends = useMemo(() => {
    const allRuns = [...(batchRuns ?? [])].sort((a, b) =>
      a.startedAt - b.startedAt || a.id - b.id,
    );
    const completedRuns = allRuns.filter(run => run.status === "completed");
    const comparableRuns = completedRuns.filter(run => run.totalFindings > 0);
    const comparisonPair = comparableRuns.slice(-2);

    let resolveRateDelta: number | null = null;
    let fallbackRateDelta: number | null = null;

    if (comparisonPair.length === 2) {
      const [previous, latest] = comparisonPair;
      const latestResolveRate = (latest.resolvedCount / latest.totalFindings) * 100;
      const previousResolveRate = (previous.resolvedCount / previous.totalFindings) * 100;
      const latestFallbackRate = ((latest.fallbackUsageCount ?? 0) / latest.totalFindings) * 100;
      const previousFallbackRate = ((previous.fallbackUsageCount ?? 0) / previous.totalFindings) * 100;
      resolveRateDelta = latestResolveRate - previousResolveRate;
      fallbackRateDelta = latestFallbackRate - previousFallbackRate;
    }

    return {
      totalRuns: allRuns.length,
      completedRuns: completedRuns.length,
      totalResolved: completedRuns.reduce((sum, run) => sum + run.resolvedCount, 0),
      resolveRateDelta,
      fallbackRateDelta,
    };
  }, [batchRuns]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/provenance">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Drill-Down
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <History className="h-5 w-5 text-blue-400" />
              Batch History
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              All batch passes remain visible; trend deltas use completed, non-empty runs only.
            </p>
          </div>
        </div>
      </div>

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-foreground">{trends.totalRuns}</p>
            <p className="text-[10px] text-muted-foreground">Recorded Batch Runs</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-foreground">{trends.completedRuns}</p>
            <p className="text-[10px] text-muted-foreground">Completed Runs</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-400">{trends.totalResolved}</p>
            <p className="text-[10px] text-muted-foreground">Resolved Results — Completed Runs</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            {trends.resolveRateDelta === null ? (
              <p className="text-2xl font-bold text-muted-foreground">N/A</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-foreground">
                  {trends.resolveRateDelta >= 0 ? "+" : ""}{trends.resolveRateDelta.toFixed(1)}%
                </p>
                {trends.resolveRateDelta >= 0
                  ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                  : <TrendingDown className="h-4 w-4 text-red-400" />}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Resolve Rate Δ — Last 2 Completed Runs
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            {trends.fallbackRateDelta === null ? (
              <p className="text-2xl font-bold text-muted-foreground">N/A</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-2xl font-bold text-foreground">
                  {trends.fallbackRateDelta >= 0 ? "+" : ""}{trends.fallbackRateDelta.toFixed(1)}%
                </p>
                {trends.fallbackRateDelta <= 0
                  ? <TrendingDown className="h-4 w-4 text-emerald-400" />
                  : <TrendingUp className="h-4 w-4 text-amber-400" />}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Fallback Rate Δ — Last 2 Completed Runs
            </p>
          </CardContent>
        </Card>
      </div>

      {trends.completedRuns < 2 && trends.totalRuns > 0 && (
        <Card className="border-dashed border-border bg-muted/10">
          <CardContent className="p-3 text-xs text-muted-foreground">
            Trend deltas are not evaluated yet. At least two completed batch runs with nonzero finding populations are required; running, aborted, and errored passes are never substituted.
          </CardContent>
        </Card>
      )}

      {/* Batch Runs Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Batch Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!batchRuns || batchRuns.length === 0) ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
              <p>No batch runs recorded yet. Run a batch from the Provenance Drill-Down page.</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/provenance")}>
                Go to Provenance Drill-Down
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">ID</th>
                    <th className="px-4 py-2 text-left font-medium">Started</th>
                    <th className="px-4 py-2 text-left font-medium">Terminal</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Resolved</th>
                    <th className="px-4 py-2 text-right font-medium">Remaining</th>
                    <th className="px-4 py-2 text-right font-medium">Errors</th>
                    <th className="px-4 py-2 text-right font-medium">Fallback %</th>
                    <th className="px-4 py-2 text-right font-medium">Runtime</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRuns.map((run) => {
                    const fallbackRate = run.totalFindings > 0
                      ? `${Math.round(((run.fallbackUsageCount ?? 0) / run.totalFindings) * 100)}%`
                      : "—";
                    const terminalAt = run.completedAt ?? run.abortedAt ?? null;

                    return (
                      <tr key={run.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-foreground">#{run.id}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {terminalAt !== null ? new Date(terminalAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{run.totalFindings}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-400">{run.resolvedCount}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-amber-400">{run.stillUnsupported}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-red-400">{run.errorCount}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-purple-400">{fallbackRate}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRuntime(run.runtimeMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert History */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            Alert History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!alertHistory || alertHistory.length === 0) ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <BellOff className="h-5 w-5" />
              No persisted provenance alert events. Thresholds: unsupported rate &gt; 5%, coverage &lt; 90%.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Triggered</th>
                    <th className="px-4 py-2 text-left font-medium">Batch</th>
                    <th className="px-4 py-2 text-right font-medium">Coverage</th>
                    <th className="px-4 py-2 text-right font-medium">Unsupported %</th>
                    <th className="px-4 py-2 text-right font-medium">Fallback %</th>
                    <th className="px-4 py-2 text-left font-medium">Notification</th>
                    <th className="px-4 py-2 text-left font-medium">Cooldown Until</th>
                  </tr>
                </thead>
                <tbody>
                  {alertHistory.map((alert) => {
                    const m = alert.metrics as any;
                    const batchId = Number(m?.batchId);
                    return (
                      <tr key={alert.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={`text-[9px] ${
                            alert.alertType === "PROVENANCE_DRIFT"
                              ? "text-amber-400 border-amber-400/30"
                              : "text-red-400 border-red-400/30"
                          }`}>
                            {alert.alertType.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(alert.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {Number.isSafeInteger(batchId) && batchId > 0 ? `#${batchId}` : "Manual / unspecified"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">
                          {formatPercent(m?.coverage)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-amber-400">
                          {formatPercent(m?.unsupportedRate)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-purple-400">
                          {formatPercent(m?.fallbackRate)}
                        </td>
                        <td className="px-4 py-2.5">
                          {alert.notificationSent
                            ? <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-400/30">Sent</Badge>
                            : <Badge variant="outline" className="text-[9px] text-muted-foreground border-border">Not sent</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(alert.cooldownUntil).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; color: string }> = {
    completed: { icon: CheckCircle, color: "text-emerald-400 border-emerald-400/30" },
    running: { icon: Clock, color: "text-blue-400 border-blue-400/30" },
    aborted: { icon: Square, color: "text-amber-400 border-amber-400/30" },
    error: { icon: XCircle, color: "text-red-400 border-red-400/30" },
  };
  const c = config[status] ?? config.error;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`text-[9px] gap-1 ${c.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {status}
    </Badge>
  );
}
