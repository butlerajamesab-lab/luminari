import { useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  Radio,
  Search,
  Server,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const HEALTH_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

const DEFERRED_OVERVIEW_QUERY_OPTIONS = {
  enabled: false,
  staleTime: 5 * 60_000,
  gcTime: 15 * 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

function statusBadge(kind: "ok" | "loading" | "empty" | "warning" | "error", label: string) {
  const className =
    kind === "ok"
      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      : kind === "loading"
        ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
        : kind === "warning"
          ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
          : kind === "error"
            ? "border-red-500/30 text-red-400 bg-red-500/10"
            : "border-border text-muted-foreground";
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function MetricCard({ label, value, icon, tone = "default" }: { label: string; value: string | number; icon: React.ReactNode; tone?: "default" | "ok" | "warning" | "error" | "blue" }) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/5 text-amber-300"
        : tone === "error"
          ? "border-red-500/20 bg-red-500/5 text-red-300"
          : tone === "blue"
            ? "border-blue-500/20 bg-blue-500/5 text-blue-300"
            : "border-border bg-card/50 text-foreground";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}<span>{label}</span></div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}

function PanelEmpty({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground py-4 text-center">{label}</div>;
}

function DeferredPanel({ label, onLoad, isLoading }: { label: string; onLoad: () => void; isLoading: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button variant="outline" size="sm" onClick={onLoad} disabled={isLoading}>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1" />}
        Load overview data
      </Button>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 bg-muted rounded w-1/3" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-muted rounded-lg" />)}
      </div>
    </div>
  );
}

export default function MissionControlContainmentShell() {
  const [overviewRequested, setOverviewRequested] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const systemHealth = trpc.adminDashboard.systemHealth.useQuery(undefined, HEALTH_QUERY_OPTIONS);
  const knowledgePopulation = trpc.knowledgeIngestion.populationStats.useQuery(undefined, DEFERRED_OVERVIEW_QUERY_OPTIONS);
  const caseActivity = trpc.adminDashboard.caseActivity.useQuery(undefined, DEFERRED_OVERVIEW_QUERY_OPTIONS);
  const structuralSignals = trpc.adminDashboard.structuralSignals.useQuery(undefined, DEFERRED_OVERVIEW_QUERY_OPTIONS);
  const workQueue = trpc.adminDashboard.workQueue.useQuery(undefined, DEFERRED_OVERVIEW_QUERY_OPTIONS);

  const loadOverview = async () => {
    if (overviewLoading) return;
    setOverviewRequested(true);
    setOverviewLoading(true);
    try {
      // Deliberately sequential: each procedure already performs bounded internal
      // queries, so the canonical entry must not create a second fan-out layer.
      await knowledgePopulation.refetch();
      await caseActivity.refetch();
      await structuralSignals.refetch();
      await workQueue.refetch();
    } finally {
      setOverviewLoading(false);
    }
  };

  const knowledgeSummary = knowledgePopulation.data?.summary;
  const knowledgeTables = safeArray(knowledgePopulation.data?.tables);
  const populatedTables = knowledgeTables.filter((table: any) => Number(table?.count ?? 0) > 0);
  const emptyTables = knowledgeTables.filter((table: any) => Number(table?.count ?? 0) === 0);
  const lowTables = knowledgeTables.filter((table: any) => Number(table?.coverage ?? 0) > 0 && Number(table?.coverage ?? 0) < 25);
  const running = safeArray(workQueue.data?.running);
  const failed = safeArray(workQueue.data?.failed);
  const completed = safeArray(workQueue.data?.recentlyCompleted);
  const bySeverity = safeArray(structuralSignals.data?.bySeverity);
  const byCategory = safeArray(structuralSignals.data?.byCategory);
  const criticalFindings = safeArray(structuralSignals.data?.criticalFindings);

  const anyOverviewError = Boolean(
    systemHealth.error ||
    (overviewRequested && (knowledgePopulation.error || caseActivity.error || structuralSignals.error || workQueue.error)),
  );

  const deferred = (label: string) => (
    <DeferredPanel label={label} onLoad={() => void loadOverview()} isLoading={overviewLoading} />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" /> Mission Control
              </h1>
              {anyOverviewError
                ? statusBadge("warning", "partial")
                : overviewLoading
                  ? statusBadge("loading", "loading overview")
                  : overviewRequested
                    ? statusBadge("ok", "overview loaded")
                    : statusBadge("ok", "health check")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Admin operational overview. The canonical entry keeps the health path hot and loads deeper counts sequentially on request.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant={overviewRequested ? "outline" : "default"} size="sm" onClick={() => void loadOverview()} disabled={overviewLoading}>
              {overviewLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1" />}
              {overviewRequested ? "Refresh Overview" : "Load Overview Data"}
            </Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/knowledge-population"><BookOpen className="h-3.5 w-3.5 mr-1" /> Knowledge Population</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/ingestion-control"><Radio className="h-3.5 w-3.5 mr-1" /> Ingestion Control</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/full"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Full Mission Control</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4 text-emerald-400" /> System Health</CardTitle></CardHeader>
            <CardContent>
              {systemHealth.isLoading ? <PanelSkeleton /> : systemHealth.error ? (
                <PanelEmpty label={`System health error: ${systemHealth.error.message}`} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Uptime" value={`${Math.floor(Number(systemHealth.data?.serverUptime ?? 0) / 60)}m`} icon={<Clock className="h-4 w-4" />} tone="ok" />
                  <MetricCard label="Runs 24h" value={systemHealth.data?.last24h?.total ?? 0} icon={<Activity className="h-4 w-4" />} tone="blue" />
                  <MetricCard label="Failed" value={systemHealth.data?.last24h?.failed ?? 0} icon={<XCircle className="h-4 w-4" />} tone={(systemHealth.data?.last24h?.failed ?? 0) > 0 ? "warning" : "ok"} />
                  <MetricCard label="Success" value={`${systemHealth.data?.last24h?.successRate ?? systemHealth.data?.last24h?.success_rate ?? 100}%`} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-blue-400" /> Knowledge Backbone</CardTitle>
                <Button variant="ghost" size="sm" asChild><Link href="/admin/knowledge-population">Manage</Link></Button>
              </div>
            </CardHeader>
            <CardContent>
              {!overviewRequested ? deferred("Load the bounded knowledge, case, signal, and queue summaries when needed.") : knowledgePopulation.isFetching ? <PanelSkeleton /> : knowledgePopulation.error ? (
                <PanelEmpty label={`Knowledge backbone error: ${knowledgePopulation.error.message}`} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Records" value={(knowledgeSummary?.totalPopulated ?? populatedTables.reduce((sum: number, table: any) => sum + Number(table?.count ?? 0), 0)).toLocaleString()} icon={<BookOpen className="h-4 w-4" />} tone="blue" />
                    <MetricCard label="Coverage" value={`${knowledgeSummary?.overallCoverage ?? 0}%`} icon={<BarChart3 className="h-4 w-4" />} tone={(knowledgeSummary?.overallCoverage ?? 0) > 0 ? "ok" : "warning"} />
                    <MetricCard label="Populated" value={populatedTables.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
                    <MetricCard label="Empty" value={emptyTables.length} icon={<AlertTriangle className="h-4 w-4" />} tone={emptyTables.length > 0 ? "warning" : "ok"} />
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 bg-card/40">
                    <div className="text-xs text-muted-foreground mb-2">Visible insertion evidence</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                      {knowledgeTables.slice(0, 16).map((table: any) => (
                        <div key={table.name} className="flex items-center justify-between text-xs rounded bg-muted/30 px-2 py-1">
                          <span className="truncate">{table.label ?? table.name}</span>
                          <span className="font-mono text-foreground">{Number(table.count ?? 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {lowTables.length > 0 && <div className="mt-2 text-xs text-amber-400">{lowTables.length} tables are under 25% coverage.</div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-violet-400" /> Case Activity</CardTitle></CardHeader>
            <CardContent>
              {!overviewRequested ? deferred("Case activity remains deferred on first paint.") : caseActivity.isFetching ? <PanelSkeleton /> : caseActivity.error ? <PanelEmpty label={`Case activity error: ${caseActivity.error.message}`} /> : (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Cases" value={caseActivity.data?.cases?.total ?? 0} icon={<FileText className="h-4 w-4" />} />
                  <MetricCard label="Documents" value={caseActivity.data?.documents?.total ?? 0} icon={<BookOpen className="h-4 w-4" />} tone="blue" />
                  <MetricCard label="Findings" value={caseActivity.data?.findings?.total ?? 0} icon={<Search className="h-4 w-4" />} tone="warning" />
                  <MetricCard label="Users" value={caseActivity.data?.users?.total ?? 0} icon={<Shield className="h-4 w-4" />} tone="ok" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-amber-400" /> Structural Signals</CardTitle></CardHeader>
            <CardContent>
              {!overviewRequested ? deferred("Structural-signal aggregation remains deferred on first paint.") : structuralSignals.isFetching ? <PanelSkeleton /> : structuralSignals.error ? <PanelEmpty label={`Structural signal error: ${structuralSignals.error.message}`} /> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="Total" value={structuralSignals.data?.totalFindings ?? structuralSignals.data?.total_findings ?? 0} icon={<Shield className="h-4 w-4" />} tone="warning" />
                    <MetricCard label="Severity" value={bySeverity.length} icon={<AlertTriangle className="h-4 w-4" />} tone="blue" />
                    <MetricCard label="Types" value={byCategory.length} icon={<Database className="h-4 w-4" />} tone="blue" />
                  </div>
                  {criticalFindings.length > 0 && <div className="text-xs text-red-400">{criticalFindings.length} high-confidence findings require review.</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" /> Work Queue</CardTitle></CardHeader>
          <CardContent>
            {!overviewRequested ? deferred("Work-queue history remains deferred on first paint.") : workQueue.isFetching ? <PanelSkeleton /> : workQueue.error ? <PanelEmpty label={`Work queue error: ${workQueue.error.message}`} /> : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard label="Running" value={running.length} icon={<Loader2 className="h-4 w-4" />} tone={running.length > 0 ? "blue" : "ok"} />
                <MetricCard label="Failed" value={failed.length} icon={<XCircle className="h-4 w-4" />} tone={failed.length > 0 ? "error" : "ok"} />
                <MetricCard label="Completed" value={completed.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-purple-400" /> Engine Authority Model</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="font-medium text-emerald-300">Autonomous</div><div className="text-xs text-muted-foreground mt-1">Pattern, Trend, Outcome</div></div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3"><div className="font-medium text-blue-300">Draft Only</div><div className="text-xs text-muted-foreground mt-1">Strategy, Procedural, Viability</div></div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><div className="font-medium text-amber-300">Approval</div><div className="text-xs text-muted-foreground mt-1">Assembly, Campaign</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Panel Activation</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Deep-dive panels remain accessible, but are not mounted on the canonical overview screen.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link href="/mission-control/full">Full Mission Control</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/mission-control/live">Live Monitor</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/mission-control/intake">Intake Monitor</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/mission-control/governance">Governance</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/architecture-map">Architecture Map</Link></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {anyOverviewError && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" /> One or more overview endpoints returned an error. The dashboard remains visible so the failing surface can be isolated.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
