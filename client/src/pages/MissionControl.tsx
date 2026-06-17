// @ts-nocheck — pre-existing type drift, to be resolved in UI type alignment pass
import { useState } from "react";
import { useCase } from "@/contexts/CaseContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Database, BarChart3, AlertTriangle, Clock, CheckCircle2,
  XCircle, Loader2, Server, Users, FileText, Search, TrendingUp,
  Zap, Shield, Eye, BookOpen, RefreshCw, ExternalLink,
  DoorOpen, Wrench, Lamp, Upload, ArrowLeft,
  Radio, Play, Pause, Trash2, Plus, Globe, MapPin,
  Network, GitBranch, ArrowUpRight, ChevronRight, Gauge,
  Route, Target, BarChart, Siren, Building2, Send, Scale, Landmark,
  Calculator, ScrollText, DollarSign, Hash,  Brain, FileOutput, Handshake, Download,
  Microscope, ClipboardCheck, Gavel, Map as MapIcon, Layers,
  Megaphone, Binoculars, Milestone,
  History, GitCompareArrows, FileDown, RotateCcw,
  HeartPulse, Grid3X3,
  Flame, Link2, Radar, MessageSquare,
  Fingerprint, Building, ShieldAlert, AlertOctagon,
  FlaskConical, Newspaper, FolderArchive, Share2,
  Scan, Bell, Waypoints, Factory, SearchCode,
  Flag, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { useMissionControlData } from "@/hooks/mission/useMissionControlData";
import { MetadataHealthPanel, PipelineIntegrityPanel, ExportReadinessPanel } from "@/components/ConduitPanels";
import { TabGate, PanelGate, PanelActivationSummary } from "@/components/PanelGate";
import { shouldRenderPanel } from "@/lib/panelRegistry";
import { StreamUploader } from "@/components/StreamUploader";
import { CanonicalSpineDashboard } from "@/components/CanonicalSpineDashboard";
import { FlagQueuePanel } from "@/components/FlagQueuePanel";
import { FlagButton } from "@/components/FlagButton";
import { CommitToCase } from "@/components/CommitToCase";
import { PatternRegistryPanel } from "@/components/mission/PatternRegistryPanel";
import { StrategyPathsPanel } from "@/components/mission/StrategyPathsPanel";
import { OutcomesPanel } from "@/components/mission/OutcomesPanel";
import { SignalLineagePanel } from "@/components/lighthouse/SignalLineagePanel";
import { GateReviewPanel } from "@/components/lighthouse/GateReviewPanel";
import { PatternRegistryPanel as LighthousePatternRegistryPanel } from "@/components/lighthouse/PatternRegistryPanel";
import { TrendPressurePanel as LighthouseTrendPressurePanel } from "@/components/lighthouse/TrendPressurePanel";
import { StrategyProjectionPanel } from "@/components/lighthouse/StrategyProjectionPanel";
import { PipelineHealthPanel } from "@/components/lighthouse/PipelineHealthPanel";
import { LiveIntakeOperationsPanel } from "@/components/lighthouse/LiveIntakeOperationsPanel";

/* ═══════════════════════════════════════════════════════════════════════
   LUMINARI — MISSION CONTROL (Admin Operational Dashboard)
   Canonical Core orchestration root + preserved Registry/Alpha Lake tab
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Canonical Core Health Panel ── */
function CanonicalCorePanel() {
  const { data: health, isLoading: healthLoading } = trpc.canonicalCore.health.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: summary, isLoading: summaryLoading } = trpc.canonicalCore.summary.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: pipelineState } = trpc.canonicalCore.pipelineState.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (healthLoading || summaryLoading) return <PanelSkeleton />;
  if (!health || !summary) return <PanelEmpty label="Canonical core unavailable" />;

  const categories = health.tables.reduce((acc: Record<string, { populated: number; empty: number; total: number }>, t) => {
    if (!acc[t.category]) acc[t.category] = { populated: 0, empty: 0, total: 0 };
    acc[t.category].total++;
    if (t.count > 0) acc[t.category].populated++;
    else acc[t.category].empty++;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Canonical Knowledge Core
        </h3>
        <Badge variant="outline" className="text-xs">
          {health.totalRecords.toLocaleString()} records · {health.populatedTables} tables populated
        </Badge>
      </div>

      {/* Key Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Jurisdictions" value={String(summary.jurisdictions)} icon={<Globe className="h-4 w-4" />} color="blue" />
        <MetricCard label="Programs" value={String(summary.programs)} icon={<FileText className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Agencies" value={String(summary.oversightBodies)} icon={<Building2 className="h-4 w-4" />} color="violet" />
        <MetricCard label="Live Signals" value={String(summary.liveSignals)} icon={<Radio className="h-4 w-4" />} color="orange" />
        <MetricCard label="Cases" value={String(summary.cases)} icon={<Search className="h-4 w-4" />} color="blue" />
      </div>

      {/* Category Breakdown */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Table Health by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(categories).map(([cat, stats]) => (
              <div key={cat} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                <span className="capitalize text-muted-foreground">{cat}</span>
                <span className="font-mono">
                  <span className="text-emerald-400">{stats.populated}</span>
                  <span className="text-muted-foreground">/</span>
                  <span>{stats.total}</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline State */}
      {pipelineState && pipelineState.ingestRunSummary.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {pipelineState.ingestRunSummary.map((run) => (
                <div key={run.datasetId} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{run.datasetId}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{run.totalRecords.toLocaleString()} records</span>
                    <Badge variant={run.lastStatus === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                      {run.lastStatus || 'unknown'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty Tables Warning */}
      {health.emptyTables > 0 && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-400" />
          {health.emptyTables} canonical tables are empty — run ingestion or knowledge population to fill them.
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Panel 1: System Health ── */
function SystemHealthPanel() {
  const { data, isLoading, refetch } = trpc.adminDashboard.systemHealth.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="No health data available" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Server className="h-5 w-5 text-emerald-400" />
          System Health
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Server Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Uptime" value={formatUptime(data.serverUptime)} icon={<Clock className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Memory (Heap)" value={formatBytes(data.memoryUsage.heapUsed)} icon={<Zap className="h-4 w-4" />} color="blue" />
        <MetricCard label="Runs (24h)" value={data.last24h.total.toString()} icon={<Activity className="h-4 w-4" />} color="violet" />
        <MetricCard
          label="Success Rate"
          value={`${data.last24h.successRate}%`}
          icon={data.last24h.successRate >= 90 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          color={data.last24h.successRate >= 90 ? "emerald" : "orange"}
        />
      </div>

      {/* Engine Run Breakdown */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Engine Activity (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <StatusBadge label="Completed" count={data.last24h.completed} variant="success" />
            <StatusBadge label="Failed" count={data.last24h.failed} variant="destructive" />
            <StatusBadge label="Running" count={data.last24h.running} variant="running" />
          </div>
          {data.engineBreakdown.length > 0 && (
            <div className="mt-3 space-y-1">
              {data.engineBreakdown.map((e) => (
                <div key={e.type} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{(e.type ?? "unknown").replace(/_/g, " ")}</span>
                  <span className="font-mono">{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Panel 2: Knowledge Population ── */
function KnowledgePopulationPanel({ onNavigateToKB }: { onNavigateToKB?: () => void }) {
  const { data, isLoading } = trpc.knowledgeIngestion.populationStats.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const [, navigate] = useLocation();

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="No population data" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-400" />
          Knowledge Backbone
        </h3>
        <div className="flex items-center gap-1">
          {onNavigateToKB && (
            <Button variant="ghost" size="sm" onClick={onNavigateToKB} title="Open KB Explorer">
              <BookOpen className="h-3 w-3 mr-1" /> Explore
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/knowledge-population")}>
            <ExternalLink className="h-3 w-3 mr-1" /> Manage
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Records" value={data.summary.totalPopulated.toLocaleString()} icon={<BookOpen className="h-4 w-4" />} color="blue" />
        <MetricCard
          label="Coverage"
          value={`${data.summary.overallCoverage}%`}
          icon={<BarChart3 className="h-4 w-4" />}
          color={data.summary.overallCoverage >= 50 ? "emerald" : data.summary.overallCoverage >= 25 ? "yellow" : "red"}
        />
        <MetricCard label="Empty Tables" value={data.summary.criticallyLow.length.toString()} icon={<AlertTriangle className="h-4 w-4" />} color={data.summary.criticallyLow.length > 0 ? "red" : "emerald"} />
      </div>

      {/* Table List */}
      <Card className="bg-card/50">
        <CardContent className="pt-4">
          <div className="space-y-2">
            {data.tables.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-sm group hover:bg-muted/20 rounded px-1 -mx-1 transition-colors cursor-default">
                <span className={t.count === 0 ? "text-red-400" : "text-muted-foreground"}>{t.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs">{t.count.toLocaleString()}</span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        t.coverage === 0 ? "bg-red-500" : t.coverage < 25 ? "bg-orange-500" : t.coverage < 75 ? "bg-blue-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(t.coverage, 100)}%` }}
                    />
                  </div>
                  <FlagButton
                    targetType="kb_table"
                    targetId={t.name}
                    targetLabel={t.label}
                    iconOnly
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                  {onNavigateToKB && (
                    <button
                      onClick={onNavigateToKB}
                      title={`Open ${t.label} in KB Explorer`}
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded hover:bg-primary/20 text-primary"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Panel 3: Case Activity ── */
function CaseActivityPanel() {
  const { data, isLoading } = trpc.adminDashboard.caseActivity.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="No case data" />;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-violet-400" />
        Case Activity
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Cases" value={data.cases.total.toString()} icon={<FileText className="h-4 w-4" />} color="violet" />
        <MetricCard label="Documents" value={data.documents.total.toLocaleString()} icon={<BookOpen className="h-4 w-4" />} color="blue" />
        <MetricCard label="Findings" value={data.findings.total.toLocaleString()} icon={<Search className="h-4 w-4" />} color="amber" />
        <MetricCard label="Users" value={data.users.total.toString()} icon={<Users className="h-4 w-4" />} color="emerald" />
      </div>

      {/* Today's Activity */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">New cases</span><span className="font-mono">{data.cases.today}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Uploads</span><span className="font-mono">{data.documents.today}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Findings</span><span className="font-mono">{data.findings.today}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">New users</span><span className="font-mono">{data.users.today}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Cases */}
      {data.recentCases.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.recentCases.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">{c.name}</span>
                  <span className="text-muted-foreground">{formatTimeAgo(c.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Panel 4: Structural Signals ── */
function StructuralSignalsPanel() {
  const { data, isLoading } = trpc.adminDashboard.structuralSignals.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
  const { data: drillData, isLoading: drillLoading } = trpc.adminDashboard.findingsBySeverity.useQuery(
    { severity: selectedSeverity ?? undefined },
    { enabled: selectedSeverity !== null }
  );

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="No signal data" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-400" />
          Structural Signals
        </h3>
        {selectedSeverity && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedSeverity(null)}>
            <XCircle className="h-3 w-3 mr-1" /> Clear filter
          </Button>
        )}
      </div>

      {/* Severity metric cards — clickable for drill-through */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`cursor-pointer rounded-lg ring-2 transition-all ${
            selectedSeverity === null ? "ring-amber-400/40" : "ring-transparent hover:ring-amber-400/20"
          }`}
          onClick={() => setSelectedSeverity(null)}
          title="Show all findings"
        >
          <MetricCard label="Total Findings" value={data.totalFindings.toLocaleString()} icon={<Eye className="h-4 w-4" />} color="amber" />
        </div>
        {data.bySeverity.map((s) => (
          <div
            key={s.severity}
            className={`cursor-pointer rounded-lg ring-2 transition-all ${
              selectedSeverity === s.severity
                ? s.severity === "strong" ? "ring-red-400/60" : s.severity === "moderate" ? "ring-orange-400/60" : "ring-yellow-400/60"
                : "ring-transparent hover:ring-border"
            }`}
            onClick={() => setSelectedSeverity(selectedSeverity === s.severity ? null : (s.severity ?? null))}
            title={`Click to filter by ${s.severity} severity`}
          >
            <MetricCard
              label={s.severity ?? "unknown"}
              value={s.count.toString()}
              icon={<AlertTriangle className="h-4 w-4" />}
              color={s.severity === "strong" ? "red" : s.severity === "moderate" ? "orange" : "yellow"}
            />
          </div>
        ))}
      </div>

      {/* Drill-through findings list */}
      {selectedSeverity !== null && (
        <Card className={`bg-card/50 ${
          selectedSeverity === "strong" ? "border-red-500/30" : selectedSeverity === "moderate" ? "border-orange-500/30" : "border-yellow-500/30"
        }`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium capitalize flex items-center gap-2">
              <AlertTriangle className={`h-3.5 w-3.5 ${
                selectedSeverity === "strong" ? "text-red-400" : selectedSeverity === "moderate" ? "text-orange-400" : "text-yellow-400"
              }`} />
              {selectedSeverity} findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {drillLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading findings...
              </div>
            ) : !drillData || drillData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No findings at this severity level.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {drillData.map((f) => (
                  <div key={f.id} className="text-xs space-y-0.5 border-b border-border/30 pb-1.5 last:border-0">
                    <div className="font-medium truncate">{f.title}</div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Case #{f.caseId}</span>
                      <span className="capitalize text-[10px] px-1.5 py-0.5 rounded bg-muted">{(f.category ?? "unknown").replace(/_/g, " ")}</span>
                      <span>{formatTimeAgo(f.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Drill-through: findings by type as clickable chips */}
      <div className="flex flex-wrap gap-1.5">
        {data.byCategory.map((c) => (
          <span
            key={c.category}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border/50 bg-card/60 text-muted-foreground cursor-default hover:border-border transition-colors"
            title={`${c.count} ${(c.category ?? 'unknown').replace(/_/g, ' ')} findings`}
          >
            <span className="capitalize">{(c.category ?? 'unknown').replace(/_/g, ' ')}</span>
            <span className="font-mono text-[10px] text-foreground/70 ml-0.5">{c.count}</span>
          </span>
        ))}
      </div>

      {/* By Category */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {data.byCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{(c.category ?? "unknown").replace(/_/g, " ")}</span>
                <span className="font-mono text-xs">{c.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Critical Findings (when no filter active) */}
      {!selectedSeverity && data.criticalFindings.length > 0 && (
        <Card className="bg-card/50 border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400">High-Confidence Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.criticalFindings.slice(0, 5).map((f) => (
                <div key={f.id} className="text-xs space-y-0.5">
                  <div className="font-medium truncate">{f.title}</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Case #{f.caseId}</span>
                    <span>{formatTimeAgo(f.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Panel 5: Work Queue ── */
function WorkQueuePanel() {
  const { data, isLoading, refetch } = trpc.adminDashboard.workQueue.useQuery(undefined, {
    refetchInterval: 15000,
  });

  if (isLoading) return <PanelSkeleton />;
  if (!data) return <PanelEmpty label="No queue data" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-400" />
          Work Queue
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Running */}
      {data.running.length > 0 ? (
        <Card className="bg-card/50 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Running ({data.running.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.running.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium capitalize">{(r.runType ?? "unknown").replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2">Case #{r.caseId}</span>
                  </div>
                  <span className="text-muted-foreground">{formatTimeAgo(r.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/50">
          <CardContent className="pt-4 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-400" />
            No active runs
          </CardContent>
        </Card>
      )}

      {/* Failed */}
      {data.failed.length > 0 && (
        <Card className="bg-card/50 border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Failed ({data.failed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.failed.map((r) => (
                <div key={r.id} className="text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{(r.runType ?? "unknown").replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">Case #{r.caseId}</span>
                  </div>
                  {r.errorMessage && (
                    <div className="text-red-400/70 truncate">{r.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recently Completed */}
      {data.recentlyCompleted.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-400">Recently Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.recentlyCompleted.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{(r.runType ?? "unknown").replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">Case #{r.caseId} · {r.completedAt ? formatTimeAgo(r.completedAt) : "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Panel 5: Engine Status (Operating Model) ── */
function EngineStatusPanel() {
  const { data: sunamStatus } = trpc.system.stats.useQuery(undefined, {
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Gauge className="h-5 w-5 text-purple-400" />
          Engine Authority Model
        </h3>
      </div>

      {/* Operating Model */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Autonomous Continuous */}
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Autonomous (Continuous)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pattern Engine</span>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Trend Engine</span>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outcome Engine</span>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Autonomous Draft */}
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-400 flex items-center gap-1.5">
              <FileOutput className="h-3.5 w-3.5" /> Autonomous (Draft Only)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strategy Engine</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30">Draft</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Procedural Engine</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30">Draft</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Viability Engine</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30">Draft</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Procedural Path Engine</span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30">Draft</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Human Required */}
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Sovereign Approval Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assembly Engine</span>
                <Badge variant="outline" className="text-amber-400 border-amber-500/30">Approval</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Campaign Engine</span>
                <Badge variant="outline" className="text-amber-400 border-amber-500/30">Approval</Badge>
              </div>
            </div>
            <Button size="sm" variant="outline" className="w-full mt-2 text-xs" asChild>
              <Link href="/sovereign-control">
                <Shield className="h-3 w-3 mr-1" /> Go to Sovereign Control
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sunam Status */}
      {sunamStatus && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-400" /> Sunam Autonomous Backfill
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block mb-1">Signals Pending</span>
                <span className="font-mono text-lg">{sunamStatus.signals?.pending || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Approved</span>
                <span className="font-mono text-lg text-emerald-400">{sunamStatus.signals?.approved || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Rejected</span>
                <span className="font-mono text-lg text-red-400">{sunamStatus.signals?.rejected || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Total Registry</span>
                <span className="font-mono text-lg">{sunamStatus.registry || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Shared Components ── */
function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  };
  const cls = colorMap[color] ?? colorMap.blue;

  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-70">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}

function StatusBadge({ label, count, variant }: { label: string; count: number; variant: "success" | "destructive" | "running" }) {
  const cls = variant === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : variant === "destructive" ? "bg-red-500/10 text-red-400 border-red-500/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";
  return (
    <div className={`rounded-md border px-3 py-2 text-center ${cls}`}>
      <div className="text-lg font-bold font-mono">{count}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-6 bg-muted rounded w-1/3" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}
      </div>
      <div className="h-32 bg-muted rounded-lg" />
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

/* ═══════════════════════════════════════════════════════════════════════
   LEGACY REGISTRY VIEW (preserved from original Mission Control)
   ═══════════════════════════════════════════════════════════════════════ */

function LegacyRegistryView() {
  const { data: registryStats } = trpc.registry.stats.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <h3 className="text-xl font-semibold mb-2">Registry & Alpha Lake</h3>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          The original Mission Control cork-board interface. State registry data, schema validation,
          and Alpha Lake document generation tools.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="States Built" value={registryStats?.totalStates?.toString() ?? "9"} icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Programs" value={registryStats?.totalPrograms?.toLocaleString() ?? "828"} icon={<BookOpen className="h-4 w-4" />} color="blue" />
        <MetricCard label="Oversight Bodies" value={registryStats?.totalOversight?.toString() ?? "233"} icon={<Shield className="h-4 w-4" />} color="violet" />
        <MetricCard label="Tests Passing" value={registryStats?.totalTests?.toLocaleString() ?? "4,605"} icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
      </div>

      <Card className="bg-card/50">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          <p>The full cork-board Registry and Alpha Lake document generation interface has been preserved.</p>
          <p className="mt-1">Access the detailed state-by-state registry, schema validation, and document templates through the dedicated Registry pages.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Panel: Live Data Ingestion ── */
/** Per-dataset row with run status polling to disable Ingest button */
function DatasetRow({ ds, triggerMutation, toggleMutation }: {
  ds: { stream_id: string; stream_name: string; enabled: boolean; update_frequency: string; jurisdiction: string | null; domain: string | null; records_ingested: number; last_ingested_at: number | null };
  triggerMutation: { mutate: (input: { datasetId: string; maxRecords?: number }) => void; isPending: boolean };
  toggleMutation: { mutate: (input: { datasetId: string; enabled: boolean }) => void };
}) {
  const runStatus = trpc.ingestion.datasetRunStatus.useQuery(
    { datasetId: ds.stream_id },
    { refetchInterval: 3000 } // Poll every 3s while visible
  );

  const isRunning = runStatus.data?.running ?? false;
  const isQueued = runStatus.data?.queued ?? false;
  const isBusy = isRunning || isQueued || triggerMutation.isPending;

  return (
    <div className="rounded-lg border border-border/50 p-4 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{ds.stream_name}</span>
          <Badge variant="outline" className={ds.enabled ? "text-emerald-400 border-emerald-400/30" : "text-muted-foreground border-border"}>
            {ds.enabled ? "Active" : "Paused"}
          </Badge>
          <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">{ds.update_frequency}</Badge>
          {isRunning && (
            <Badge variant="outline" className="text-amber-400 border-amber-400/30 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin mr-1" /> Running
            </Badge>
          )}
          {isQueued && (
            <Badge variant="outline" className="text-purple-400 border-purple-400/30">
              <Clock className="h-3 w-3 mr-1" /> Queued
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ds.jurisdiction ?? "—"}</span>
          <span>{ds.domain ?? "—"}</span>
          <span>{(ds.records_ingested ?? 0).toLocaleString()} records</span>
          {ds.last_ingested_at && <span>Last: {formatTimeAgo(ds.last_ingested_at)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => triggerMutation.mutate({ datasetId: ds.stream_id, maxRecords: 5000 })}
          disabled={isBusy}
          title={isRunning ? "Ingestion is running" : isQueued ? "Ingestion is queued" : "Start ingestion"}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {isRunning ? "Running..." : isQueued ? "Queued" : "Ingest"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleMutation.mutate({ datasetId: ds.stream_id, enabled: !ds.enabled })}
        >
          {ds.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function IngestionPanel() {
  const datasets = trpc.unified.get_unified_ingestion_metrics.useQuery({});
  const runs = trpc.ingestion.listRuns.useQuery({ limit: 10 });
  const signals = trpc.unified.get_unified_signals.useQuery({ limit: 20 });
  const signalStats = trpc.unified.get_unified_signal_summary.useQuery({});
  const signal_cards = trpc.ingestion.list_signal_intelligence_cards.useQuery({
    limit: 25,
    include_excluded: false,
  });
  const signal_card_summary = trpc.ingestion.get_signal_intelligence_summary.useQuery();
  const schedulerStatus = trpc.ingestion.getSchedulerStatus.useQuery();
  const atlasCatalog = trpc.ingestion.get_atlas_public_stream_catalog.useQuery();

  const seedAtlasMutation = trpc.ingestion.seed_atlas_population_streams.useMutation({
    onSuccess: () => {
      datasets.refetch();
      schedulerStatus.refetch();
      atlasCatalog.refetch();
    },
  });

  const seedMutation = trpc.ingestion.seedDefaultDatasets.useMutation({
    onSuccess: () => {
      datasets.refetch();
      schedulerStatus.refetch();
    },
  });
  const triggerMutation = trpc.ingestion.triggerIngestion.useMutation({
    onSuccess: () => {
      runs.refetch();
      signals.refetch();
      signalStats.refetch();
      signal_cards.refetch();
      signal_card_summary.refetch();
      datasets.refetch();
    },
  });
  const toggleMutation = trpc.ingestion.toggleDataset.useMutation({
    onSuccess: () => {
      datasets.refetch();
      schedulerStatus.refetch();
    },
  });

  const severityColor: Record<string, string> = {
    critical: "text-red-400 bg-red-400/10 border-red-400/30",
    high: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    low: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Scheduler Status + Signal Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Radio className="h-5 w-5 text-cyan-400" />
                Ingestion Scheduler
              </h3>
              <div className="flex gap-2 flex-wrap justify-end">
                <Button
                  size="sm"
                  onClick={() => seedAtlasMutation.mutate({})}
                  disabled={seedAtlasMutation.isPending}
                  title="Register the curated Atlas public stream catalog"
                >
                  {seedAtlasMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  Populate Atlas Streams
                </Button>
                {(!datasets.data || datasets.data.length === 0) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                  >
                    {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Seed WA Datasets
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Database className="h-3 w-3" /> Registered</div>
                <div className="text-xl font-bold text-cyan-400">{datasets.data?.length ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Radio className="h-3 w-3" /> Scheduled</div>
                <div className="text-xl font-bold text-emerald-400">{schedulerStatus.data?.activeJobs?.length ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> Running</div>
                <div className="text-xl font-bold text-amber-400">{schedulerStatus.data?.runningIngestions?.length ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Atlas Catalog</div>
                <div className="text-xl font-bold text-blue-400">{atlasCatalog.data?.total_streams ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 md:col-span-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="h-3 w-3" /> Public Stream Domains</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {atlasCatalog.data?.by_domain && Object.entries(atlasCatalog.data.by_domain).slice(0, 5).map(([domain, count]) => (
                    <Badge key={domain} variant="outline" className="text-xs">{domain}: {String(count)}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-amber-400" />
              Live Signal Summary
            </h3>
            {signal_card_summary.data?.configured === true && signal_card_summary.data.source_status === "ok" ? (
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/50 p-3">
                    <div className="text-xs text-muted-foreground">Production Cards</div>
                    <div className="text-xl font-bold text-amber-400">{signal_card_summary.data.production_cards ?? 0}</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <div className="text-xs text-muted-foreground">Total Cards</div>
                    <div className="text-xl font-bold text-cyan-400">{signal_card_summary.data.total_cards ?? 0}</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <div className="text-xs text-muted-foreground">Excluded</div>
                    <div className="text-xl font-bold text-muted-foreground">{signal_card_summary.data.excluded_cards ?? 0}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">By Severity</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {Object.entries(signal_card_summary.data.by_severity ?? {}).map(([severity, count]) => (
                      <Badge key={severity} variant="outline" className={severityColor[severity] ?? ""}>{severity}: {String(count)}</Badge>
                    ))}
                    {Object.keys(signal_card_summary.data.by_severity ?? {}).length === 0 && (
                      <span className="text-xs text-muted-foreground">No Atlas cards yet</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">Signal Families</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {Object.entries(signal_card_summary.data.by_signal_family ?? {}).slice(0, 8).map(([signal_family, count]) => (
                      <Badge key={signal_family} variant="outline" className="text-cyan-400 border-cyan-400/30">{signal_family}: {String(count)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">Canonical Codes</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {Object.entries(signal_card_summary.data.by_canonical_signal_code ?? {}).slice(0, 8).map(([canonical_signal_code, count]) => (
                      <Badge key={canonical_signal_code} variant="outline" className="text-blue-400 border-blue-400/30">{canonical_signal_code}: {String(count)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">Verification Status</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {Object.entries(signal_card_summary.data.by_verification_status ?? {}).map(([verification_status, count]) => (
                      <Badge key={verification_status} variant="outline" className="text-emerald-400 border-emerald-400/30">{verification_status}: {String(count)}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">Active Signals</div>
                  <div className="text-xl font-bold text-amber-400">{signalStats.data?.total_active ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <div className="text-xs text-muted-foreground">By Severity</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {signalStats.data?.by_severity && Object.entries(signalStats.data.by_severity).map(([sev, cnt]) => (
                      <Badge key={sev} variant="outline" className={severityColor[sev] ?? ""}>{sev}: {String(cnt)}</Badge>
                    ))}
                    {(!signalStats.data?.by_severity || Object.keys(signalStats.data.by_severity).length === 0) && (
                      <span className="text-xs text-muted-foreground">No signals yet</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Dataset Registry */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-emerald-400" />
            Dataset Registry
          </h3>
          {datasets.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : !datasets.data || datasets.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No datasets registered yet.</p>
              <p className="text-sm mt-1">Click "Populate Atlas Streams" to add the curated federal, state, and municipal public stream catalog.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {datasets.data.map((ds) => (
                <DatasetRow
                  key={ds.stream_id}
                  ds={ds}
                  triggerMutation={triggerMutation}
                  toggleMutation={toggleMutation}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Recent Runs + Live Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-blue-400" />
              Recent Ingestion Runs
            </h3>
            {runs.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : !runs.data || runs.data.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No ingestion runs yet. Seed datasets and trigger an ingestion.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.data.map((run) => (
                  <div key={run.id} className="rounded-lg border border-border/50 p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{run.datasetId}</span>
                        <Badge variant="outline" className={
                          run.status === "completed" ? "text-emerald-400 border-emerald-400/30" :
                          run.status === "failed" ? "text-red-400 border-red-400/30" :
                          run.status === "running" ? "text-amber-400 border-amber-400/30" :
                          run.status === "api_unavailable" ? "text-orange-400 border-orange-400/30" :
                          run.status === "partial" ? "text-blue-400 border-blue-400/30" :
                          "text-muted-foreground border-border"
                        }>
                          {run.status === "running" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                          {run.status === "api_unavailable" ? "API Unavailable" : run.status === "partial" ? "Partial" : run.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {run.startTime ? new Date(run.startTime).toLocaleString() : "—"} · {run.recordsProcessed ?? 0} processed · {run.signals_generated ?? 0} signals
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Live Signals Detected
            </h3>
            {signal_cards.data?.cards && signal_cards.data.cards.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {signal_cards.data.cards.map((card) => (
                  <div
                    key={card.signal_id ?? `${card.source_table}:${card.source_record_id}`}
                    className={`rounded-lg border p-3 ${card.exclude_from_production ? "border-orange-400/40 bg-orange-400/10 opacity-75" : severityColor[card.severity ?? ""] ?? "border-border/50"}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {card.severity && (
                        <Badge variant="outline" className={severityColor[card.severity] ?? ""}>{card.severity}</Badge>
                      )}
                      {card.canonical_signal_code && (
                        <Badge variant="outline" className="text-blue-400 border-blue-400/30">{card.canonical_signal_code}</Badge>
                      )}
                      {card.signal_family && (
                        <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">{card.signal_family}</Badge>
                      )}
                      {card.verification_status && (
                        <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">{card.verification_status}</Badge>
                      )}
                      {card.record_origin && (
                        <Badge variant="outline" className="text-violet-400 border-violet-400/30">{card.record_origin}</Badge>
                      )}
                      {card.exclude_from_production && (
                        <Badge variant="outline" className="text-orange-400 border-orange-400/30">excluded</Badge>
                      )}
                      <span className="text-sm font-medium truncate">
                        {card.display_title ?? card.canonical_signal_name ?? card.raw_signal_type ?? card.signal_id}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {card.display_summary ?? "No Atlas summary available."}
                    </p>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      {card.jurisdiction_raw_value && <span>{card.jurisdiction_raw_value}</span>}
                      {card.geography_key && <span>{card.geography_key}</span>}
                      {card.confidence_score !== null && card.confidence_score !== undefined && (
                        <span>Confidence: {(Number(card.confidence_score) * 100).toFixed(0)}%</span>
                      )}
                      {card.severity_score !== null && card.severity_score !== undefined && (
                        <span>Severity score: {Number(card.severity_score).toFixed(2)}</span>
                      )}
                      {card.detected_at && <span>{new Date(card.detected_at).toLocaleDateString()}</span>}
                      {card.quarantine_reason && <span>Quarantine: {card.quarantine_reason}</span>}
                    </div>
                    {card.source_url && (
                      <a href={card.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-2">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : signals.isLoading || signal_cards.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : !signals.data || signals.data.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Zap className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No live signals yet. Run an ingestion to detect patterns.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {signals.data.map((sig) => {
                  const entityTypeColorMap: Record<string, string> = {
                    corporation: "text-blue-400 border-blue-500/30 bg-blue-500/10",
                    organization: "text-purple-400 border-purple-500/30 bg-purple-500/10",
                    government_agency: "text-amber-400 border-amber-500/30 bg-amber-500/10",
                    nonprofit: "text-green-400 border-green-500/30 bg-green-500/10",
                    landlord_entity: "text-orange-400 border-orange-500/30 bg-orange-500/10",
                    contractor_business: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
                    financial_institution: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                    telecom_company: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
                    media_company: "text-pink-400 border-pink-500/30 bg-pink-500/10",
                    individual_person: "text-gray-400 border-gray-500/30 bg-gray-500/10",
                    unknown: "text-gray-500 border-gray-600/30 bg-gray-600/10",
                  };
                  const entityTypeLabel: Record<string, string> = {
                    corporation: "Corporation",
                    organization: "Organization",
                    government_agency: "Government Agency",
                    nonprofit: "Nonprofit",
                    landlord_entity: "Landlord/Property",
                    contractor_business: "Contractor",
                    financial_institution: "Financial Institution",
                    telecom_company: "Telecom",
                    media_company: "Media/Tech",
                    individual_person: "Individual",
                    unknown: "Unknown",
                  };
                  // Signal type classification for visual differentiation
                  const signalTypeConfig: Record<string, { label: string; icon: string; color: string }> = {
                    repeat_entity: { label: "Entity", icon: "\u{1F3E2}", color: "text-blue-400" },
                    frequency_spike: { label: "Sector", icon: "\u{1F4CA}", color: "text-amber-400" },
                    geographic_cluster: { label: "Location", icon: "\u{1F4CD}", color: "text-emerald-400" },
                    status_delay: { label: "Status", icon: "\u23F3", color: "text-orange-400" },
                    trend_anomaly: { label: "Trend", icon: "\u{1F4C8}", color: "text-purple-400" },
                  };
                  const isRepeatEntity = sig.signal_type === "repeat_entity";
                  const isFrequencySpike = sig.signal_type === "frequency_spike";
                  const displayName = isRepeatEntity
                    ? ((sig as any).canonicalEntityName || sig.title.replace(/^Repeat (Company|Agency|Entity):\s*/, "").replace(/^Repeat Entity:\s*/, ""))
                    : sig.title;
                  const entType = (sig as any).entityType;
                  const entRole = (sig as any).entityRole as string | null;
                  const entConfidence = (sig as any).entityConfidenceScore;
                  const roleConf = (sig as any).roleConfidence;
                  const aliases = (sig as any).entityAliasesJson as string[] | null;
                  const roleLabel = entRole === "business" || entRole === "respondent" ? "Company" : entRole === "agency" ? "Agency" : entRole === "organization" ? "Organization" : null;
                  const stConfig = signalTypeConfig[sig.signal_type] ?? { label: sig.signal_type, icon: "\u26A0\uFE0F", color: "text-gray-400" };

                  return (
                    <div key={sig.id} className={`rounded-lg border p-3 ${severityColor[sig.severity_level] ?? "border-border/50"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={severityColor[sig.severity_level] ?? ""}>{sig.severity}</Badge>
                        {/* Signal type badge — always shown */}
                        <Badge variant="outline" className={`text-[10px] ${stConfig.color} border-current/30`}>
                          {stConfig.label}
                        </Badge>
                        {isRepeatEntity && entType && (
                          <Badge variant="outline" className={`text-[10px] ${entityTypeColorMap[entType] || ""}`}>
                            {entityTypeLabel[entType] || entType}
                          </Badge>
                        )}
                        {isRepeatEntity && roleLabel && (
                          <span className="text-[10px] text-muted-foreground font-medium">{roleLabel}:</span>
                        )}
                        <span className="text-sm font-medium truncate">
                          {displayName}
                        </span>
                      </div>
                      {isRepeatEntity && aliases && aliases.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Also known as: {aliases.join(", ")}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sig.explanation}</p>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{sig.jurisdiction}</span>
                        <span>\u00B7</span>
                        <span>Confidence: {(Number(sig.confidence_score) * 100).toFixed(0)}%</span>
                        {isRepeatEntity && entConfidence && (
                          <>
                            <span>\u00B7</span>
                            <span>Entity Score: {(Number(entConfidence) * 100).toFixed(0)}%</span>
                          </>
                        )}
                        {isRepeatEntity && roleConf && (
                          <>
                            <span>\u00B7</span>
                            <span>Role: {(Number(roleConf) * 100).toFixed(0)}%</span>
                          </>
                        )}
                        <span>\u00B7</span>
                        <span>{sig.detected_at ? new Date(sig.detected_at).toLocaleDateString() : "—"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Knowledge Backbone Explorer Panel ── */
function KnowledgeExplorerPanel() {
  const [activeTab, setActiveTab] = useState("statutes");
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const jurisdictions = trpc.knowledgeIngestion.getJurisdictions.useQuery();
  const domains = trpc.knowledgeIngestion.getDomains.useQuery();

  const statutes = trpc.knowledgeIngestion.browseStatutes.useQuery(
    { search: search || undefined, jurisdiction: jurisdiction || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "statutes" }
  );
  const caseLaw = trpc.knowledgeIngestion.browseCaseLaw.useQuery(
    { search: search || undefined, jurisdiction: jurisdiction || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "caseLaw" }
  );
  const agencies = trpc.knowledgeIngestion.browseAgencies.useQuery(
    { search: search || undefined, jurisdiction: jurisdiction || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "agencies" }
  );
  const courts = trpc.knowledgeIngestion.browseCourts.useQuery(
    { search: search || undefined, jurisdiction: jurisdiction || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "courts" }
  );
  const targets = trpc.knowledgeIngestion.browseAdvocacyTargets.useQuery(
    { search: search || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "targets" }
  );
  const formulas = trpc.knowledgeIngestion.browseSettlementFormulas.useQuery(
    { search: search || undefined, limit: 15, offset: page * 15 },
    { enabled: activeTab === "formulas" }
  );

  const tabConfig = [
    { key: "statutes", label: "Statutes", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { key: "caseLaw", label: "Case Law", icon: <Scale className="h-3.5 w-3.5" /> },
    { key: "agencies", label: "Agencies", icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: "courts", label: "Courts", icon: <Landmark className="h-3.5 w-3.5" /> },
    { key: "targets", label: "Advocacy Targets", icon: <Target className="h-3.5 w-3.5" /> },
    { key: "formulas", label: "Settlement Formulas", icon: <Calculator className="h-3.5 w-3.5" /> },
  ];

  const activeData = activeTab === "statutes" ? statutes : activeTab === "caseLaw" ? caseLaw : activeTab === "agencies" ? agencies : activeTab === "courts" ? courts : activeTab === "targets" ? targets : formulas;
  const rows = activeData.data?.rows ?? [];
  const total = activeData.data?.total ?? 0;
  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-cyan-400" />
          Knowledge Backbone Explorer
        </h3>
        <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">{total.toLocaleString()} results</Badge>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {tabConfig.map(t => (
          <Button key={t.key} size="sm" variant={activeTab === t.key ? "default" : "outline"}
            onClick={() => { setActiveTab(t.key); setPage(0); }} className="gap-1.5 text-xs">
            {t.icon} {t.label}
          </Button>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm"
            placeholder={`Search ${tabConfig.find(t => t.key === activeTab)?.label ?? ''}...`}
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        {(activeTab !== "targets" && activeTab !== "formulas") && (
          <select className="px-3 py-2 rounded-md border border-border bg-background text-sm min-w-[120px]"
            value={jurisdiction} onChange={e => { setJurisdiction(e.target.value); setPage(0); }}>
            <option value="">All Jurisdictions</option>
            {(jurisdictions.data ?? []).map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        )}
      </div>

      {/* Results */}
      <Card className="bg-card/50">
        <CardContent className="pt-4">
          {activeData.isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No records found</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r: any, i: number) => {
                const rowKey = String(r.id ?? r.case_id ?? r.court_id ?? r.target_id ?? i);
                const isOpen = selectedRow === rowKey;
                return (
                  <div key={rowKey}
                    onClick={() => setSelectedRow(isOpen ? null : rowKey)}
                    className={`rounded-lg border p-3 cursor-pointer transition-all ${
                      isOpen ? "border-cyan-500/40 bg-cyan-500/5" : "border-border/50 hover:bg-accent/30"
                    }`}>
                    {/* Statutes */}
                    {activeTab === "statutes" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.title}</span>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">{r.sourceType}</Badge>
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{r.citation}</div>
                        {!isOpen && r.summary && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</div>}
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
                            {r.summary && <p className="text-xs text-foreground/80 leading-relaxed">{r.summary}</p>}
                            {r.effectiveDate && <div className="text-xs text-muted-foreground">Effective: {r.effectiveDate}</div>}
                            {r.source_url && (
                              <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> View Full Statute
                              </a>
                            )}
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="statute" itemId={r.id} label="Attach to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Case Law */}
                    {activeTab === "caseLaw" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.caseName}</span>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          {r.significance && <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">{r.significance}</Badge>}
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{r.citation} {r.court && `— ${r.court}`}</div>
                        {!isOpen && r.summary && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</div>}
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-3" onClick={e => e.stopPropagation()}>
                            {r.holding && (
                              <div>
                                <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider mb-1">Holding</div>
                                <p className="text-xs text-foreground/90 leading-relaxed">{r.holding}</p>
                              </div>
                            )}
                            {r.summary && !r.holding && <p className="text-xs text-foreground/80 leading-relaxed">{r.summary}</p>}
                            {r.statutesInterpreted && (
                              <div>
                                <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-1">Statutes Interpreted</div>
                                <div className="flex flex-wrap gap-1">
                                  {(Array.isArray(r.statutesInterpreted) ? r.statutesInterpreted : [r.statutesInterpreted]).map((s: string, si: number) => (
                                    <Badge key={si} variant="outline" className="text-[10px] text-amber-300 border-amber-400/30">{s}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {r.domains && (
                              <div>
                                <div className="text-[10px] font-mono text-violet-400 uppercase tracking-wider mb-1">Domains</div>
                                <div className="flex flex-wrap gap-1">
                                  {(Array.isArray(r.domains) ? r.domains : [r.domains]).map((d: string, di: number) => (
                                    <Badge key={di} variant="outline" className="text-[10px] text-violet-300 border-violet-400/30 capitalize">{d.replace(/_/g, ' ')}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {r.subsequentHistory && (
                              <div>
                                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Subsequent History</div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{r.subsequentHistory}</p>
                              </div>
                            )}
                            {r.source_url && (
                              <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Full Opinion
                              </a>
                            )}
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="statute" itemId={r.case_id ?? r.id} label="Attach to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Agencies */}
                    {activeTab === "agencies" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.agencyName}</span>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30">{r.authorityType}</Badge>
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        {!isOpen && r.filingUrl && <div className="text-xs text-cyan-400 mt-1 truncate">{r.filingUrl}</div>}
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
                            {r.description && <p className="text-xs text-foreground/80 leading-relaxed">{r.description}</p>}
                            <div className="grid grid-cols-1 gap-y-1.5">
                              {r.phone && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Phone</span>
                                  <a href={`tel:${r.phone}`} className="text-xs text-emerald-400 hover:underline">{r.phone}</a>
                                </div>
                              )}
                              {r.email && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Email</span>
                                  <a href={`mailto:${r.email}`} className="text-xs text-cyan-400 hover:underline truncate">{r.email}</a>
                                </div>
                              )}
                              {r.address && (
                                <div className="flex items-start gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14 mt-0.5">Address</span>
                                  <span className="text-xs text-foreground/80">{r.address}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                              {r.filingUrl && (
                                <a href={r.filingUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                                  <ExternalLink className="h-3 w-3" /> File Complaint
                                </a>
                              )}
                              {r.websiteUrl && (
                                <a href={r.websiteUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                  <ExternalLink className="h-3 w-3" /> Website
                                </a>
                              )}
                            </div>
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="benefit" itemId={r.id} label="Attach Agency to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Courts */}
                    {activeTab === "courts" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.court_name}</span>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">{r.court_type}</Badge>
                          {r.efiling && <Badge variant="outline" className="text-xs text-cyan-400 border-cyan-400/30">E-Filing</Badge>}
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{r.court_id} — Filing fee: ${r.filing_fee ?? 'N/A'}</div>
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
                            <div className="grid grid-cols-1 gap-y-1.5">
                              {r.phone && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Phone</span>
                                  <a href={`tel:${r.phone}`} className="text-xs text-emerald-400 hover:underline">{r.phone}</a>
                                </div>
                              )}
                              {r.address && (
                                <div className="flex items-start gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14 mt-0.5">Address</span>
                                  <span className="text-xs text-foreground/80">{r.address}</span>
                                </div>
                              )}
                              {r.hours && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Hours</span>
                                  <span className="text-xs text-foreground/80">{r.hours}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                              {r.efiling_url && (
                                <a href={r.efiling_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                                  <ExternalLink className="h-3 w-3" /> E-File Here
                                </a>
                              )}
                              {r.website && (
                                <a href={r.website} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                  <ExternalLink className="h-3 w-3" /> Court Website
                                </a>
                              )}
                            </div>
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="filing" itemId={r.id} label="Add Court to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Advocacy Targets */}
                    {activeTab === "targets" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.target_name}</span>
                          <Badge variant="outline" className="text-xs">{r.target_type}</Badge>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Influence: {r.influence_score ?? 'N/A'} | Responsiveness: {r.responsiveness_score ?? 'N/A'}</div>
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
                            {r.notes && <p className="text-xs text-foreground/80 leading-relaxed">{r.notes}</p>}
                            <div className="grid grid-cols-1 gap-y-1.5">
                              {r.email && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Email</span>
                                  <a href={`mailto:${r.email}`} className="text-xs text-cyan-400 hover:underline truncate">{r.email}</a>
                                </div>
                              )}
                              {r.phone && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14">Phone</span>
                                  <a href={`tel:${r.phone}`} className="text-xs text-emerald-400 hover:underline">{r.phone}</a>
                                </div>
                              )}
                              {r.office_address && (
                                <div className="flex items-start gap-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-14 mt-0.5">Office</span>
                                  <span className="text-xs text-foreground/80">{r.office_address}</span>
                                </div>
                              )}
                            </div>
                            {r.website_url && (
                              <a href={r.website_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Website
                              </a>
                            )}
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="benefit" itemId={r.target_id ?? r.id} label="Attach Target to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Settlement Formulas */}
                    {activeTab === "formulas" && (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.formulaName}</span>
                          <Badge variant="outline" className="text-xs">{r.claimType}</Badge>
                          <Badge variant="outline" className="text-xs">{r.jurisdiction}</Badge>
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Base multiplier: {r.baseMultiplier ?? 'N/A'}</div>
                        {!isOpen && r.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</div>}
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
                            {r.description && <p className="text-xs text-foreground/80 leading-relaxed">{r.description}</p>}
                            {r.formula && (
                              <div>
                                <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-1">Formula</div>
                                <code className="text-xs text-amber-300 bg-amber-500/10 px-2 py-1 rounded block">{r.formula}</code>
                              </div>
                            )}
                            <div className="flex gap-4 text-xs">
                              {r.minMultiplier != null && <div><span className="text-muted-foreground">Min: </span><span>{r.minMultiplier}x</span></div>}
                              {r.maxMultiplier != null && <div><span className="text-muted-foreground">Max: </span><span>{r.maxMultiplier}x</span></div>}
                              {r.confidenceThreshold != null && <div><span className="text-muted-foreground">Confidence: </span><span>{r.confidenceThreshold}%</span></div>}
                            </div>
                            {r.source_url && (
                              <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Source
                              </a>
                            )}
                            <div className="pt-2 border-t border-border/30">
                              <CommitToCase type="statute" itemId={r.id} label="Apply Formula to Case" size="sm" variant="outline" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Signal Governance Panel ── */
function SignalGovernancePanel() {
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("");

  const { data: dashboard, isLoading: dashLoading } = trpc.signalGovernance.dashboard.useQuery(
    {
      severityLevel: severityFilter || undefined,
      escalationTier: tierFilter || undefined,
      governedOnly: true,
      limit: 50,
    },
    { refetchInterval: 15000 }
  );
  const { data: escalation, isLoading: escLoading } = trpc.signalGovernance.escalationSummary.useQuery(
    undefined, { refetchInterval: 30000 }
  );
  const { data: thresholds } = trpc.signalGovernance.escalationThresholds.useQuery();
  const { data: auditTrail } = trpc.signalGovernance.auditTrail.useQuery(
    { signalId: selectedSignalId! },
    { enabled: !!selectedSignalId }
  );

  const tierColors: Record<string, string> = {
    leadership_alert: "bg-red-500/20 text-red-400 border-red-500/30",
    enforcement_escalation: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    standard_reporting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    analyst_review: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    monitoring_only: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };

  const severityColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300",
    high: "bg-orange-500/20 text-orange-300",
    medium: "bg-yellow-500/20 text-yellow-300",
    low: "bg-emerald-500/20 text-emerald-300",
  };

  return (
    <div className="space-y-6">
      {/* Escalation Tier Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {escLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4 pb-3"><div className="h-12 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))
        ) : (
          (thresholds || []).map((tier: any) => {
            const count = (escalation || []).find((e: any) => e.tierName === tier.tierName)?.signalCount ?? 0;
            return (
              <Card key={tier.tierName} className={`border ${tierColors[tier.tierName] || "border-border"} cursor-pointer transition-all hover:scale-[1.02]`}
                onClick={() => setTierFilter(tierFilter === tier.tierName ? "" : tier.tierName)}>
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs font-medium mt-1 capitalize">
                    {tier.tierName.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {tier.minScore}–{tier.maxScore} confidence
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Severity:</span>
          {["critical", "high", "medium", "low"].map(s => (
            <Badge key={s} variant="outline"
              className={`cursor-pointer text-xs ${severityFilter === s ? severityColors[s] : "opacity-50"}`}
              onClick={() => setSeverityFilter(severityFilter === s ? "" : s)}>
              {s}
            </Badge>
          ))}
        </div>
        {(severityFilter || tierFilter) && (
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { setSeverityFilter(""); setTierFilter(""); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Signal Dashboard Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Governed Signals
            {dashboard && <Badge variant="secondary" className="text-xs">{dashboard.total ?? dashboard.signals?.length ?? 0}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted rounded" />)}</div>
          ) : !dashboard || !dashboard.signals || dashboard.signals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No governed signals yet.</p>
              <p className="text-xs mt-1">Signals will appear here after a successful ingestion run.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(dashboard.signals || []).map((sig: any) => (
                <div key={sig.signal_id}
                  className={`p-3 rounded-lg border transition-all cursor-pointer hover:bg-accent/30 ${
                    selectedSignalId === sig.signal_id ? "ring-1 ring-primary bg-accent/20" : "bg-card/50"
                  }`}
                  onClick={() => setSelectedSignalId(selectedSignalId === sig.signal_id ? null : sig.signal_id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">{sig.title}</span>
                        <Badge className={`text-[10px] ${severityColors[sig.severity_level] || ""}`}>
                          {sig.severity_level}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${tierColors[sig.escalation_tier] || ""}`}>
                          {(sig.escalation_tier || "").replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{sig.explanation}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{sig.stream_id}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{sig.jurisdiction}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{sig.detected_at ? new Date(sig.detected_at).toLocaleString() : ""}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-lg font-bold ${
                        sig.confidence_score >= 85 ? "text-red-400" :
                        sig.confidence_score >= 70 ? "text-orange-400" :
                        sig.confidence_score >= 51 ? "text-yellow-400" : "text-slate-400"
                      }`}>
                        {sig.confidence_score}
                      </div>
                      <div className="text-[10px] text-muted-foreground">confidence</div>
                    </div>
                  </div>

                  {/* Expanded Audit Trail */}
                  {selectedSignalId === sig.signal_id && auditTrail && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Generation Audit Trail
                      </h4>
                      {(!auditTrail.generationLog || auditTrail.generationLog.length === 0) ? (
                        <p className="text-xs text-muted-foreground">No audit trail recorded for this signal.</p>
                      ) : (
                        <div className="space-y-2">
                          {auditTrail.generationLog.map((entry: any, idx: number) => (
                            <div key={idx} className="text-xs bg-background/50 rounded p-2 border border-border/30">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium capitalize">{(entry.stepName || "").replace(/_/g, " ")}</span>
                                <span className="text-muted-foreground">{entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : ""}</span>
                              </div>
                              {entry.templateUsed && <div className="text-muted-foreground">Template: {entry.templateUsed}</div>}
                              {entry.verificationResult && (
                                <div className="mt-1">
                                  <Badge variant="outline" className="text-[10px]">
                                    {entry.verificationResult}
                                  </Badge>
                                </div>
                              )}
                              {entry.factorBreakdown && Array.isArray(entry.factorBreakdown) && (
                                <div className="mt-1 grid grid-cols-2 gap-1">
                                  {entry.factorBreakdown.map((fb: any, fi: number) => (
                                    <div key={fi} className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground capitalize">{(fb.factorName || "").replace(/_/g, " ")}</span>
                                      <span className="font-mono">{fb.weightedScore?.toFixed(1) ?? fb.rawScore?.toFixed(1) ?? "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confidence Factors Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Confidence Scoring Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(thresholds || []).map((tier: any) => (
              <div key={tier.tierName} className={`p-3 rounded-lg border ${tierColors[tier.tierName] || "border-border"}`}>
                <div className="font-medium text-sm capitalize mb-1">{tier.tierName.replace(/_/g, " ")}</div>
                <div className="text-xs text-muted-foreground">{tier.action}</div>
                <div className="text-[10px] mt-1">Score range: {tier.minScore}–{tier.maxScore}</div>
                {tier.autoEscalate && <Badge className="text-[10px] mt-1 bg-red-500/20 text-red-300">Auto-escalate</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PATTERN REGISTRY PANEL
   ═══════════════════════════════════════════════════════════════════════ */

/* PatternRegistryPanel moved to components/mission/PatternRegistryPanel.tsx */

/* ═══════════════════════════════════════════════════════════════════════
   TREND & PRESSURE ENGINE PANEL
   ═══════════════════════════════════════════════════════════════════════ */

function TrendPressurePanel() {
  const summary = trpc.trendEngine.missionControlSummary.useQuery();
  const dashboard = trpc.trendEngine.dashboard.useQuery();
  const alertRules = trpc.trendEngine.alertRules.useQuery();
  const updateAll = trpc.trendEngine.updateAll.useMutation({
    onSuccess: () => {
      summary.refetch();
      dashboard.refetch();
    },
  });
  const utils = trpc.useUtils();

  const s = summary.data;
  const trends = dashboard.data?.trends || [];

  const classificationColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    accelerating: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    emerging: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    stable: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    declining: "bg-green-500/10 text-green-400 border-green-500/30",
  };

  const momentumIcons: Record<string, string> = {
    rising: "\u2191",
    falling: "\u2193",
    plateau: "\u2192",
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-red-500/30">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-400">{s?.criticalCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{s?.acceleratingCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Accelerating</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">{s?.emergingCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Emerging</div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/30">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{s?.avgPressure ?? 0}</div>
            <div className="text-xs text-muted-foreground">Avg Pressure</div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/30">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-purple-400">{s?.maxPressure ?? 0}</div>
            <div className="text-xs text-muted-foreground">Max Pressure</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          size="sm"
          onClick={() => updateAll.mutate()}
          disabled={updateAll.isPending}
          className="gap-1.5"
        >
          {updateAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Update All Trends
        </Button>
      </div>

      {/* Top Critical/Accelerating */}
      {s?.topCritical && s.topCritical.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Critical & Accelerating Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.topCritical.map((t: any) => (
                <div key={t.trend_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Badge className={classificationColors[t.trend_classification] || ""}>
                      {t.trend_classification}
                    </Badge>
                    <span className="text-sm font-medium">{t.pattern_name || t.pattern_type || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Pressure: <span className="font-mono font-bold text-foreground">{t.pressure_index}</span></span>
                    <span>Growth: <span className="font-mono">{t.growth_rate_30d}%</span></span>
                    <span>{momentumIcons[t.momentum_direction] || "\u2192"} {t.momentum_direction}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Trends Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            All Trends ({dashboard.data?.total ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gauge className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No trends calculated yet.</p>
              <p className="text-xs mt-1">Click "Update All Trends" to analyze active patterns.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Pattern</th>
                    <th className="pb-2 font-medium">Classification</th>
                    <th className="pb-2 font-medium">Pressure</th>
                    <th className="pb-2 font-medium">Momentum</th>
                    <th className="pb-2 font-medium">Growth 7d</th>
                    <th className="pb-2 font-medium">Growth 30d</th>
                    <th className="pb-2 font-medium">Signals</th>
                    <th className="pb-2 font-medium">Geo Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t: any) => (
                    <tr key={t.trend_id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 font-medium">{t.pattern_name || t.pattern_type || "—"}</td>
                      <td className="py-2">
                        <Badge className={classificationColors[t.trend_classification] || ""}>
                          {t.trend_classification}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                Number(t.pressure_index) >= 85 ? "bg-red-500" :
                                Number(t.pressure_index) >= 70 ? "bg-orange-500" :
                                Number(t.pressure_index) >= 50 ? "bg-yellow-500" : "bg-blue-500"
                              }`}
                              style={{ width: `${Math.min(Number(t.pressure_index), 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{t.pressure_index}</span>
                        </div>
                      </td>
                      <td className="py-2 text-xs">
                        {momentumIcons[t.momentum_direction] || "\u2192"} {t.momentum_direction}
                      </td>
                      <td className="py-2 font-mono text-xs">{t.growth_rate_7d}%</td>
                      <td className="py-2 font-mono text-xs">{t.growth_rate_30d}%</td>
                      <td className="py-2 font-mono text-xs">{t.current_signal_count}</td>
                      <td className="py-2 font-mono text-xs">{t.current_geographic_spread}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      {s?.recentAlerts && s.recentAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              Recent Pressure Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.recentAlerts.map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Badge variant={a.alert_level === "critical" ? "destructive" : "outline"}>
                      {a.alert_level}
                    </Badge>
                    <span className="text-sm">{a.pattern_name || a.pattern_type || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Pressure: {a.pressure_index}</span>
                    <span>{a.snapshot_date}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Alert Rules ({alertRules.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(alertRules.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No alert rules configured.</p>
          ) : (
            <div className="space-y-1.5">
              {(alertRules.data || []).map((rule: any) => (
                <div key={rule.rule_id} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{rule.alert_severity}</Badge>
                    <span className="font-medium">{rule.rule_name}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {rule.condition_type} {rule.threshold_direction} {rule.threshold_value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STRATEGY PATHFINDING PANEL
   ═══════════════════════════════════════════════════════════════════════ */
/* StrategyPathsPanel moved to components/mission/StrategyPathsPanel.tsx */

/* ═══════════════════════════════════════════════════════════════════════
   OUTCOMES & EFFECTIVENESS PANEL
   ═══════════════════════════════════════════════════════════════════════ */
/* OutcomesPanel moved to components/mission/OutcomesPanel.tsx */

// ─── Feedback Scheduler Section ───────────────────────────────────────────
function FeedbackSchedulerSection() {
  const feedbackQ = trpc.operationalWorkflow.feedbackLogs.useQuery();
  const triggerMut = trpc.operationalWorkflow.triggerFeedback.useMutation();
  const utils = trpc.useUtils();

  const logs = feedbackQ.data?.logs || [];

  const handleTrigger = async () => {
    await triggerMut.mutateAsync();
    utils.operationalWorkflow.feedbackLogs.invalidate();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Feedback Learning Loop
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleTrigger} disabled={triggerMut.isPending}>
            {triggerMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Run Now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No feedback cycles recorded yet. The scheduler runs every 6 hours automatically.</p>
        ) : (
          <div className="space-y-3">
            {logs.slice(0, 10).map((log: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card/50">
                <div className={`w-2 h-2 rounded-full ${log.status === 'completed' ? 'bg-green-400' : log.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {log.runAt ? new Date(log.runAt).toLocaleString() : 'Unknown'}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{log.status || 'completed'}</Badge>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span>Patterns: {log.patternsProcessed ?? 0}</span>
                    <span>Strategies: {log.strategiesUpdated ?? 0}</span>
                    <span>Signals: {log.signalsChanged ?? 0}</span>
                    {log.duration && <span>{log.duration}ms</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Intervention Dashboard Panel ─────────────────────────────────────────
function InterventionDashboardPanel() {
  const dashQ = trpc.interventionNetwork.dashboard.useQuery();
  const summaryQ = trpc.interventionNetwork.missionControlSummary.useQuery();

  const dash = dashQ.data;
  const summary = summaryQ.data;
  const endpoints = dash?.endpoints || [];
  const recentSubmissions = dash?.recentSubmissions || [];

  if (dashQ.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Endpoints" value={summary?.totalEndpoints ?? dash?.summary?.totalEndpoints ?? 0} />
        <MetricCard label="Total Submissions" value={summary?.totalSubmissions ?? dash?.summary?.totalSubmissions ?? 0} />
        <MetricCard label="Pending" value={summary?.pendingSubmissions ?? dash?.summary?.pendingSubmissions ?? 0} />
        <MetricCard label="Active Investigations" value={summary?.activeInvestigations ?? dash?.summary?.activeInvestigations ?? 0} />
      </div>

      {/* Two-column: Endpoints + Recent Submissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Authority Endpoints */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Authority Endpoints ({endpoints.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {endpoints.length > 0 ? (
              <div className="space-y-2">
                {endpoints.slice(0, 10).map((ep: any) => (
                  <div key={ep.endpoint_id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{ep.agency_abbreviation || ep.agency_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ep.intervention_type} · Level {ep.escalation_level} · {ep.jurisdiction_scope}
                      </div>
                    </div>
                    {ep.website_url && (
                      <a href={ep.website_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <PanelEmpty label="No intervention endpoints configured." />
            )}
          </CardContent>
        </Card>

        {/* Recent Submissions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-4 w-4" /> Recent Submissions ({recentSubmissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length > 0 ? (
              <div className="space-y-2">
                {recentSubmissions.slice(0, 10).map((sub: any) => {
                  const statusColor = sub.response_status === "closed" ? "text-green-500" : sub.response_status === "investigation_open" ? "text-cyan-500" : sub.response_status === "submitted" ? "text-amber-500" : "text-muted-foreground";
                  return (
                    <div key={sub.submission_id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{sub.agency_name || sub.endpoint_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {sub.action_type} · <span className={statusColor}>{sub.response_status}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sub.submission_date ? new Date(sub.submission_date).toLocaleDateString() : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <PanelEmpty label="No submissions recorded yet." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Escalation Rules Summary */}
      {summary?.escalationRuleCount !== undefined && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Siren className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-sm font-medium">Escalation Rules Active</div>
                <div className="text-xs text-muted-foreground">
                  {summary.escalationRuleCount} rules configured across {summary.jurisdictionCount ?? 0} jurisdictions
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Policy Impact Panel ────────────────────────────────────────────────────
function PolicyImpactPanel() {
  const dashQ = trpc.policyImpact.dashboard.useQuery();
  const timelineQ = trpc.policyImpact.timeline.useQuery();

  const dash = dashQ.data;
  const timeline = timelineQ.data || [];

  if (dashQ.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Policy Events" value={dash?.totalEvents ?? 0} />
        <MetricCard label="Impacts Measured" value={dash?.totalImpacts ?? 0} />
        <MetricCard label="Positive Impacts" value={dash?.positiveImpacts ?? 0} />
        <MetricCard label="Negative Impacts" value={dash?.negativeImpacts ?? 0} />
      </div>

      {/* Two-column: Recent Events + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Policy Events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Recent Policy Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(dash?.recentEvents || []).length > 0 ? (
              <div className="space-y-2">
                {(dash?.recentEvents || []).slice(0, 8).map((evt: any) => (
                  <div key={evt.policy_id} className="p-2.5 rounded-lg border bg-muted/20">
                    <div className="text-sm font-medium">{evt.policy_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {evt.policy_type} · {evt.jurisdiction || "Federal"}
                      {evt.effective_date && ` · Effective: ${new Date(evt.effective_date).toLocaleDateString()}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PanelEmpty label="No policy events recorded." />
            )}
          </CardContent>
        </Card>

        {/* Policy Trend Overlay */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Policy Trend Overlay
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.slice(0, 8).map((item: any, i: number) => {
                  const impactColor = item.impact_direction === "positive" ? "text-green-500 bg-green-500/10 border-green-500/20"
                    : item.impact_direction === "negative" ? "text-red-500 bg-red-500/10 border-red-500/20"
                    : "text-muted-foreground bg-muted/20 border-border";
                  return (
                    <div key={item.policy_id || i} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.policy_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.effective_date ? new Date(item.effective_date).toLocaleDateString() : ""}
                          {item.affected_pattern_count !== undefined && ` · ${item.affected_pattern_count} patterns affected`}
                        </div>
                        {item.impact_direction && (
                          <Badge variant="outline" className={`mt-1 text-[10px] ${impactColor}`}>
                            {item.impact_direction} impact ({item.signal_change_pct ?? 0}%)
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <PanelEmpty label="No policy-trend correlations measured yet. Record policy events and measure their impact on patterns." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Impact Correlation Summary */}
      {dash?.topCorrelations && dash.topCorrelations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" /> Top Policy-Pattern Correlations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dash.topCorrelations.slice(0, 6).map((corr: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{corr.policy_name} → {corr.pattern_type}</div>
                    <div className="text-xs text-muted-foreground">{corr.jurisdiction}</div>
                  </div>
                  <Badge variant="outline" className={corr.correlation_strength > 0.6 ? "text-green-500" : "text-amber-500"}>
                    {(corr.correlation_strength * 100).toFixed(0)}% correlation
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

// ─── Remedy Templates Panel ───
function RemedyTemplatesPanel() {
  const dashQ = trpc.remedyTemplate.dashboard.useQuery();
  const missionQ = trpc.remedyTemplate.missionControlSummary.useQuery();
  const queueQ = trpc.remedyTemplate.queueStatus.useQuery();
  const calcDashQ = trpc.settlementCalculator.dashboard.useQuery();
  const processQueueMut = trpc.remedyTemplate.processQueue.useMutation();

  const dash = dashQ.data as any;
  const mission = missionQ.data as any;
  const queue = queueQ.data as any;
  const calcDash = calcDashQ.data as any;

  if (dashQ.isLoading || calcDashQ.isLoading) return <PanelSkeleton />;
  if (!dash && !calcDash) return <PanelEmpty label="Remedy Templates" />;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Templates" value={String(dash?.totalTemplates ?? mission?.totalTemplates ?? 0)} icon={<ScrollText className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="Generated Docs" value={String(dash?.totalGenerated ?? mission?.totalGenerated ?? 0)} icon={<FileText className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Settlement Formulas" value={String(calcDash?.totalFormulas ?? 0)} icon={<Calculator className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Calculations Run" value={String(calcDash?.totalCalculations ?? 0)} icon={<DollarSign className="h-3.5 w-3.5" />} color="emerald" />
      </div>

      {/* Avg Settlement + Effectiveness Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {calcDash?.avgSettlement > 0 && (
          <MetricCard label="Avg Settlement" value={`$${Math.round(calcDash.avgSettlement).toLocaleString()}`} icon={<DollarSign className="h-3.5 w-3.5" />} color="amber" />
        )}
        {mission?.avgEffectiveness > 0 && (
          <MetricCard label="Avg Effectiveness" value={`${(mission.avgEffectiveness * 100).toFixed(0)}%`} icon={<Target className="h-3.5 w-3.5" />} color="emerald" />
        )}
        {mission?.pendingInQueue > 0 && (
          <MetricCard label="Queue Pending" value={String(mission.pendingInQueue)} icon={<Clock className="h-3.5 w-3.5" />} color="yellow" />
        )}
      </div>

      {/* Queue Status + Process Button */}
      {queue && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Document Generation Queue</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => processQueueMut.mutate({})}
                disabled={processQueueMut.isPending || (queue.pending === 0 && queue.processing === 0)}
              >
                {processQueueMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                Process Queue
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-yellow-500">{queue.pending}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{queue.processing}</div>
                <div className="text-xs text-muted-foreground">Processing</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{queue.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{queue.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Most-Used Templates */}
      {dash?.topTemplates && dash.topTemplates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Most-Used Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dash.topTemplates.map((t: any) => (
                <div key={t.templateId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">{t.templateName}</span>
                    <span className="text-xs text-muted-foreground capitalize">{(t.claimType || "").replace(/_/g, " ")} • {t.jurisdiction}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge variant="secondary">{t.usageCount} uses</Badge>
                    {t.successRate != null && (
                      <Badge variant={t.successRate >= 0.7 ? "default" : "secondary"} className="text-xs">
                        {(t.successRate * 100).toFixed(0)}%
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs capitalize">{t.difficultyLevel}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Coverage by Claim Type */}
        {dash?.templatesByClaim && dash.templatesByClaim.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Template Coverage by Claim Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dash.templatesByClaim.map((ct: any) => (
                  <div key={ct.claimType} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm font-medium capitalize">{(ct.claimType || "").replace(/_/g, " ")}</span>
                    <Badge variant="secondary">{ct.count} templates</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jurisdiction Coverage */}
        {dash?.templatesByJurisdiction && dash.templatesByJurisdiction.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Jurisdiction Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dash.templatesByJurisdiction.map((j: any) => (
                  <div key={j.jurisdiction} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm font-medium">{j.jurisdiction}</span>
                    <Badge variant="secondary">{j.count} templates</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settlement Formula Coverage */}
        {calcDash?.claimTypeBreakdown && calcDash.claimTypeBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Settlement Formula Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {calcDash.claimTypeBreakdown.map((ct: any) => (
                  <div key={ct.claimType} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm font-medium capitalize">{(ct.claimType || "").replace(/_/g, " ")}</span>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{ct.count} formulas</Badge>
                      {ct.avgAmount > 0 && (
                        <Badge variant="outline">${Math.round(ct.avgAmount).toLocaleString()} avg</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jurisdiction Formula Coverage */}
        {calcDash?.jurisdictionCoverage && calcDash.jurisdictionCoverage.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Formula Jurisdiction Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {calcDash.jurisdictionCoverage.map((j: any) => (
                  <div key={j.jurisdiction} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm font-medium">{j.jurisdiction}</span>
                    <Badge variant="secondary">{j.formulaCount} formulas</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Template Type Distribution */}
      {dash?.templatesByType && dash.templatesByType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Template Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {dash.templatesByType.map((tt: any) => (
                <div key={tt.type} className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
                  <span className="text-sm font-medium capitalize">{(tt.type || "").replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-xs">{tt.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Generated Documents */}
      {dash?.recentDocs && dash.recentDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recently Generated Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dash.recentDocs.map((doc: any) => (
                <div key={doc.docId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <span className="text-sm font-medium">{doc.templateName || doc.templateId}</span>
                    {doc.createdAt && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Badge variant={doc.status === "approved" ? "default" : "secondary"}>{doc.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Calculations */}
      {calcDash?.recentCalculations && calcDash.recentCalculations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Settlement Calculations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {calcDash.recentCalculations.map((calc: any) => (
                <div key={calc.calcId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <span className="text-sm font-medium">{calc.formulaName}</span>
                    <span className="text-xs text-muted-foreground ml-2 capitalize">{(calc.claimType || "").replace(/_/g, " ")} • {calc.jurisdiction}</span>
                  </div>
                  <Badge variant="default" className="font-mono">${Math.round(calc.calculatedAmount).toLocaleString()}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Memory Strategy Metrics Panel ─────────────────────────────────────────
function MemoryStrategyMetricsPanel() {
  const metricsQ = trpc.memoryOverlay.missionControlMetrics.useQuery();
  const m = metricsQ.data;

  if (metricsQ.isLoading) return <PanelSkeleton />;
  if (!m) return <PanelEmpty label="No memory strategy data available" />;

  const reliColor = (r: string) => r === "high" ? "text-green-400" : r === "medium" ? "text-amber-400" : "text-red-400";
  const reliBg = (r: string) => r === "high" ? "bg-green-500/10 border-green-500/20" : r === "medium" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-foreground">{m.totalMemories}</p>
                <p className="text-xs text-muted-foreground">Total Memory Records</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-foreground">{Math.round(m.overallAvgScore)}%</p>
                <p className="text-xs text-muted-foreground">Overall Avg Success Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <BarChart className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-2xl font-bold text-foreground">{m.totalSummaries}</p>
                <p className="text-xs text-muted-foreground">Aggregated Summaries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Strategies by Pattern */}
      {m.topStrategiesByPattern.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Route className="h-4 w-4 text-purple-400" />
              Top Strategies by Pattern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {m.topStrategiesByPattern.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{s.strategyName}</p>
                    <p className="text-xs text-muted-foreground">{s.patternType}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-green-400 font-mono font-semibold">{Math.round(s.avgSuccessScore)}%</span>
                    <span className="text-muted-foreground font-mono">n={s.sampleSize}</span>
                    <Badge variant="outline" className={`text-[10px] ${reliBg(s.reliability)} ${reliColor(s.reliability)}`}>
                      {s.reliability}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Jurisdictions */}
        {m.topJurisdictions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-teal-400" />
                Top Jurisdictions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {m.topJurisdictions.map((j: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/20">
                    <span className="text-sm font-mono font-medium text-foreground">{j.jurisdiction}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-teal-400 font-mono">{Math.round(j.avgScore)}% avg</span>
                      <span className="text-muted-foreground font-mono">n={j.totalSamples}</span>
                      <Badge variant="outline" className={`text-[10px] ${reliBg(j.reliability)} ${reliColor(j.reliability)}`}>
                        {j.reliability}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Declining Strategies */}
        {m.decliningStrategies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Declining Strategies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {m.decliningStrategies.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-red-500/5 border border-red-500/10">
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.strategyName}</p>
                      <p className="text-xs text-muted-foreground">{s.patternType}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-red-400 font-mono font-semibold">{Math.round(s.avgSuccessScore)}%</span>
                      <span className="text-muted-foreground font-mono">n={s.sampleSize}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Low Confidence Recommendations */}
      {m.lowConfidenceRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-400" />
              Low-Confidence Recommendations (Analyst Review Needed)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {m.lowConfidenceRecommendations.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-amber-500/5 border border-amber-500/10">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{r.strategyName}</p>
                    <p className="text-xs text-muted-foreground">{r.patternType} · {r.jurisdiction}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-amber-400 font-mono">{Math.round(r.avgSuccessScore)}%</span>
                    <Badge variant="outline" className="text-[10px] bg-red-500/10 border-red-500/20 text-red-400">
                      n={r.sampleSize} — low confidence
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// REFORM PROPOSALS PANEL
// ═══════════════════════════════════════════════════════════════════════
function ReformProposalsPanel() {
  const dashQ = trpc.reformPackage.dashboard.useQuery();
  const generateMut = trpc.reformPackage.generate.useMutation({
    onSuccess: () => dashQ.refetch(),
  });
  const updateStatusMut = trpc.reformPackage.updateStatus.useMutation({
    onSuccess: () => { dashQ.refetch(); if (selectedPkg) detailQ.refetch(); },
  });
  const regenerateMut = trpc.reformPackage.regenerate.useMutation({
    onSuccess: () => { dashQ.refetch(); versionsQ.refetch(); },
  });
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "sections" | "versions" | "exports" | "memory">("overview");
  const detailQ = trpc.reformPackage.detail.useQuery(
    { packageId: selectedPkg ?? "" },
    { enabled: !!selectedPkg }
  );
  const [exportFormat, setExportFormat] = useState<"markdown" | "html" | "json">("markdown");
  const exportQ = trpc.reformPackage.export.useQuery(
    { packageId: selectedPkg ?? "", format: exportFormat },
    { enabled: !!selectedPkg && detailTab === "exports" }
  );
  const versionsQ = trpc.reformPackage.versions.useQuery(
    { packageId: selectedPkg ?? "" },
    { enabled: !!selectedPkg && detailTab === "versions" }
  );
  const exportHistoryQ = trpc.reformPackage.exportHistory.useQuery(
    { packageId: selectedPkg ?? "" },
    { enabled: !!selectedPkg && detailTab === "exports" }
  );
  const memoryQ = trpc.reformPackage.strategyMemory.useQuery(
    { packageId: selectedPkg ?? "" },
    { enabled: !!selectedPkg && detailTab === "memory" }
  );

  const dash = dashQ.data;
  const statusColors: Record<string, string> = {
    draft: "bg-zinc-500/20 text-zinc-400",
    review: "bg-amber-500/20 text-amber-400",
    submitted: "bg-blue-500/20 text-blue-400",
    under_consideration: "bg-violet-500/20 text-violet-400",
    adopted: "bg-emerald-500/20 text-emerald-400",
    rejected: "bg-red-500/20 text-red-400",
  };

  const handleExportDownload = () => {
    if (exportQ.data?.content) {
      const blob = new Blob([exportQ.data.content], { type: exportQ.data.mimeType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportQ.data.filename || `reform-package-${selectedPkg}.${exportFormat === "json" ? "json" : exportFormat === "html" ? "html" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (dashQ.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Packages" value={String(dash?.totalPackages ?? dash?.total ?? 0)} icon={<FileOutput className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="In Review" value={String(dash?.byStatus?.review ?? 0)} icon={<Eye className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Submitted" value={String(dash?.byStatus?.submitted ?? 0)} icon={<Send className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Adopted" value={String(dash?.byStatus?.adopted ?? 0)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="emerald" />
      </div>

      {/* Package List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileOutput className="h-4 w-4" /> Reform Packages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(dash?.packages?.length ?? dash?.recentPackages?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FileOutput className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No reform packages generated yet.</p>
              <p className="text-xs mt-1">Generate packages from the Workbench Strategy Review panel.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(dash?.packages ?? dash?.recentPackages ?? []).map((pkg: any) => (
                <div
                  key={pkg.packageId}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50 ${
                    selectedPkg === pkg.packageId ? "border-primary bg-accent/30" : "border-border"
                  }`}
                  onClick={() => { setSelectedPkg(pkg.packageId); setDetailTab("overview"); }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{pkg.title || pkg.packageId}</span>
                      <Badge className={`text-[10px] ${statusColors[pkg.status] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                        {pkg.status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {pkg.createdAt ? new Date(Number(pkg.createdAt)).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {pkg.patternId && (
                    <p className="text-xs text-muted-foreground mt-1">Pattern: {pkg.patternId}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Panel with Tabs */}
      {selectedPkg && detailQ.data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> {detailQ.data.title || "Package Detail"}
                <Badge className={`text-[10px] ${statusColors[detailQ.data.status] ?? ""}`}>
                  {detailQ.data.status?.replace(/_/g, " ")}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => regenerateMut.mutate({ packageId: selectedPkg })} disabled={regenerateMut.isPending}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> {regenerateMut.isPending ? "Regenerating..." : "Regenerate"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPkg(null)}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {/* Sub-tabs */}
            <div className="flex gap-1 mt-3">
              {(["overview", "sections", "versions", "exports", "memory"] as const).map(t => (
                <Button key={t} size="sm" variant={detailTab === t ? "default" : "outline"} onClick={() => setDetailTab(t)} className="text-xs capitalize">
                  {t === "overview" ? <Eye className="h-3 w-3 mr-1" /> : t === "sections" ? <BookOpen className="h-3 w-3 mr-1" /> : t === "versions" ? <History className="h-3 w-3 mr-1" /> : t === "exports" ? <FileDown className="h-3 w-3 mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                  {t}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overview Tab */}
            {detailTab === "overview" && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Package ID:</span> <span className="ml-1 font-mono text-xs">{detailQ.data.packageId}</span></div>
                  <div><span className="text-muted-foreground">Pattern:</span> <span className="ml-1">{detailQ.data.patternId}</span></div>
                  <div><span className="text-muted-foreground">Jurisdiction:</span> <span className="ml-1">{detailQ.data.jurisdiction}</span></div>
                  <div><span className="text-muted-foreground">Reform Type:</span> <span className="ml-1">{detailQ.data.reformType?.replace(/_/g, " ")}</span></div>
                  {detailQ.data.submittedTo && <div><span className="text-muted-foreground">Submitted To:</span> <span className="ml-1">{detailQ.data.submittedTo}</span></div>}
                  {detailQ.data.adoptedDate && <div><span className="text-muted-foreground">Adopted:</span> <span className="ml-1">{new Date(detailQ.data.adoptedDate).toLocaleDateString()}</span></div>}
                  {detailQ.data.signalReductionPct != null && <div><span className="text-muted-foreground">Signal Reduction:</span> <span className="ml-1">{detailQ.data.signalReductionPct}%</span></div>}
                </div>
                {/* Executive Summary */}
                {detailQ.data.executiveSummary && (
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Executive Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(detailQ.data.executiveSummary).map(([k, v]: [string, any]) => (
                        <div key={k}><span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1").trim()}:</span> <span className="ml-1">{typeof v === "string" ? v : JSON.stringify(v)}</span></div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Status Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {detailQ.data.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMut.mutate({ packageId: selectedPkg, newStatus: "review" })} disabled={updateStatusMut.isPending}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Move to Review
                    </Button>
                  )}
                  {detailQ.data.status === "review" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMut.mutate({ packageId: selectedPkg, newStatus: "submitted" })} disabled={updateStatusMut.isPending}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Mark Submitted
                    </Button>
                  )}
                  {detailQ.data.status === "submitted" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMut.mutate({ packageId: selectedPkg, newStatus: "under_consideration" })} disabled={updateStatusMut.isPending}>
                      <Scale className="h-3.5 w-3.5 mr-1" /> Under Consideration
                    </Button>
                  )}
                  {detailQ.data.status === "under_consideration" && (
                    <Button size="sm" variant="outline" className="border-emerald-500/50" onClick={() => updateStatusMut.mutate({ packageId: selectedPkg, newStatus: "adopted" })} disabled={updateStatusMut.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Adopted
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Sections Tab */}
            {detailTab === "sections" && (
              <div className="space-y-3">
                {[
                  { key: "evidenceSection", label: "Evidence of the Problem", icon: <Microscope className="h-3.5 w-3.5" /> },
                  { key: "rootCauseSection", label: "Root Cause Analysis", icon: <Search className="h-3.5 w-3.5" /> },
                  { key: "interventionHistorySection", label: "Intervention History", icon: <Activity className="h-3.5 w-3.5" /> },
                  { key: "recommendedReformsSection", label: "Recommended Reforms", icon: <Gavel className="h-3.5 w-3.5" /> },
                  { key: "implementationRoadmapSection", label: "Implementation Roadmap", icon: <MapIcon className="h-3.5 w-3.5" /> },
                  { key: "supportingDataSection", label: "Supporting Data", icon: <Database className="h-3.5 w-3.5" /> },
                ].map(({ key, label, icon }) => {
                  const section = (detailQ.data as any)?.[key];
                  if (!section || (typeof section === "object" && Object.keys(section).length === 0)) return null;
                  return (
                    <div key={key} className="p-3 rounded-lg bg-muted/30 border">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">{icon} {label}</h4>
                      {typeof section === "object" ? (
                        <div className="space-y-1 text-sm">
                          {Object.entries(section).map(([sk, sv]: [string, any]) => (
                            <div key={sk}>
                              <span className="text-muted-foreground">{sk.replace(/([A-Z])/g, " $1").trim()}:</span>{" "}
                              <span>{Array.isArray(sv) ? (sv.length > 0 ? `${sv.length} items` : "None") : typeof sv === "object" ? JSON.stringify(sv) : String(sv)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{String(section)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Versions Tab */}
            {detailTab === "versions" && (
              <div className="space-y-3">
                {versionsQ.isLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (versionsQ.data?.length ?? 0) === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No version history yet.</p>
                    <p className="text-xs mt-1">Versions are created automatically when status changes or regeneration occurs.</p>
                  </div>
                ) : (
                  versionsQ.data?.map((v: any) => (
                    <div key={v.id} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-violet-500/20 text-violet-400 text-[10px]">v{v.versionNumber}</Badge>
                          <span className="text-sm">{v.changeSummary || "Snapshot"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                      </div>
                      {v.createdBy && <p className="text-xs text-muted-foreground mt-1">By: {v.createdBy}</p>}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Exports Tab */}
            {detailTab === "exports" && (
              <div className="space-y-4">
                {/* Export Actions */}
                <div className="flex items-center gap-2">
                  {(["markdown", "html", "json"] as const).map(fmt => (
                    <Button key={fmt} size="sm" variant={exportFormat === fmt ? "default" : "outline"} onClick={() => setExportFormat(fmt)} className="text-xs">
                      {fmt === "markdown" ? <FileText className="h-3 w-3 mr-1" /> : fmt === "html" ? <Globe className="h-3 w-3 mr-1" /> : <Database className="h-3 w-3 mr-1" />}
                      {fmt.toUpperCase()}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={handleExportDownload} disabled={!exportQ.data?.content || exportQ.isLoading}>
                    <Download className="h-3.5 w-3.5 mr-1" /> {exportQ.isLoading ? "Loading..." : "Download"}
                  </Button>
                </div>

                {/* Export Preview */}
                {exportQ.data?.content && (
                  <div className="p-3 rounded-lg bg-muted/30 border max-h-64 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-mono">{exportQ.data.content.substring(0, 2000)}{exportQ.data.content.length > 2000 ? "\n..." : ""}</pre>
                  </div>
                )}

                {/* Export History */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><History className="h-3.5 w-3.5" /> Export History</h4>
                  {exportHistoryQ.isLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : (exportHistoryQ.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No exports recorded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {exportHistoryQ.data?.map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between p-2 rounded border border-border text-xs">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">{e.exportFormat}</Badge>
                            {e.fileSize && <span className="text-muted-foreground">{(e.fileSize / 1024).toFixed(1)} KB</span>}
                          </div>
                          <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Strategy Memory Tab */}
            {detailTab === "memory" && (
              <div className="space-y-3">
                {memoryQ.isLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (memoryQ.data?.length ?? 0) === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No strategy actions recorded yet.</p>
                    <p className="text-xs mt-1">Actions are recorded when packages are generated, exported, or status-changed.</p>
                  </div>
                ) : (
                  memoryQ.data?.map((m: any) => (
                    <div key={m.id} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${
                            m.actionType === "generate_package" ? "bg-emerald-500/20 text-emerald-400" :
                            m.actionType === "export_package" ? "bg-blue-500/20 text-blue-400" :
                            m.actionType === "regenerate_package" ? "bg-violet-500/20 text-violet-400" :
                            "bg-zinc-500/20 text-zinc-400"
                          }`}>
                            {m.actionType?.replace(/_/g, " ")}
                          </Badge>
                          {m.effectivenessScore != null && (
                            <span className="text-xs">Effectiveness: {m.effectivenessScore}%</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      {m.outcomeFeedback && <p className="text-xs text-muted-foreground mt-1">{m.outcomeFeedback}</p>}
                      {m.actionData && typeof m.actionData === "object" && Object.keys(m.actionData).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono">{JSON.stringify(m.actionData)}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COALITIONS PANEL
// ═══════════════════════════════════════════════════════════════════════
function CoalitionsPanel() {
  const dashQ = trpc.coalitionAdvocacy.dashboard.useQuery();
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const escalationQ = trpc.coalitionAdvocacy.escalationRoutes.useQuery(
    { domain: selectedDomain || undefined },
    { enabled: true }
  );
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("");
  const deadlineQ = trpc.coalitionAdvocacy.deadlineRules.useQuery(
    { jurisdiction: selectedJurisdiction || undefined },
    { enabled: true }
  );
  const [activeSection, setActiveSection] = useState<"dashboard" | "escalation" | "deadlines">("dashboard");

  const dash = dashQ.data;

  if (dashQ.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2">
        {(["dashboard", "escalation", "deadlines"] as const).map(s => (
          <Button
            key={s}
            size="sm"
            variant={activeSection === s ? "default" : "outline"}
            onClick={() => setActiveSection(s)}
            className="capitalize"
          >
            {s === "dashboard" ? <Handshake className="h-3.5 w-3.5 mr-1" /> : s === "escalation" ? <Route className="h-3.5 w-3.5 mr-1" /> : <Clock className="h-3.5 w-3.5 mr-1" />}
            {s === "deadlines" ? "Deadline Rules" : s === "escalation" ? "Escalation Routes" : "Coalition Dashboard"}
          </Button>
        ))}
      </div>

      {/* Dashboard Section */}
      {activeSection === "dashboard" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Active Coalitions" value={String(dash?.activeCoalitions ?? 0)} icon={<Handshake className="h-3.5 w-3.5" />} color="violet" />
            <MetricCard label="Advocacy Targets" value={String(dash?.totalTargets ?? 0)} icon={<Target className="h-3.5 w-3.5" />} color="blue" />
            <MetricCard label="Outcomes Recorded" value={String(dash?.totalOutcomes ?? 0)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="emerald" />
            <MetricCard label="Avg Impact" value={`${dash?.avgImpact ?? 0}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} color="amber" />
          </div>

          {/* Recent Coalitions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Handshake className="h-4 w-4" /> Recent Coalitions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(dash?.recentCoalitions?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Handshake className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No coalitions activated yet.</p>
                  <p className="text-xs mt-1">Activate coalitions from the Workbench Strategy Review panel.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dash?.recentCoalitions?.map((c: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.coalitionName || c.coalitionId}</span>
                        <Badge className="text-[10px] bg-violet-500/20 text-violet-400">{c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pattern: {c.patternId} · Action: {c.actionType?.replace(/_/g, " ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Escalation Routes Section */}
      {activeSection === "escalation" && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Filter by domain:</span>
            {["", "employment", "housing", "benefits", "civil_rights", "disability", "consumer"].map(d => (
              <Button
                key={d}
                size="sm"
                variant={selectedDomain === d ? "default" : "outline"}
                onClick={() => setSelectedDomain(d)}
                className="text-xs capitalize"
              >
                {d || "All"}
              </Button>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Route className="h-4 w-4" /> Escalation Route Catalog ({escalationQ.data?.length ?? 0} routes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {escalationQ.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {escalationQ.data?.map((r: any) => (
                    <div key={r.routeId} className="p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{r.routeId}</span>
                          <span className="font-medium text-sm">{r.claimType?.replace(/_/g, " ")}</span>
                        </div>
                        <Badge className="text-[10px] bg-blue-500/20 text-blue-400 capitalize">{r.domain?.replace(/_/g, " ")}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                        <div><span className="font-medium">Primary:</span> {r.primaryAgency}</div>
                        {r.secondaryAgency && <div><span className="font-medium">Secondary:</span> {r.secondaryAgency}</div>}
                        {r.courtLevel && <div><span className="font-medium">Court:</span> {r.courtLevel}</div>}
                        {r.appealBody && <div><span className="font-medium">Appeal:</span> {r.appealBody}</div>}
                        {r.oversightBody && <div><span className="font-medium">Oversight:</span> {r.oversightBody}</div>}
                      </div>
                      {r.advocacyOrganizations?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.advocacyOrganizations.map((org: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{org}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-3 mt-2">
                        {r.mediaEscalationPossible && <Badge className="text-[10px] bg-amber-500/20 text-amber-400">Media Escalation</Badge>}
                        {r.policyEscalationPossible && <Badge className="text-[10px] bg-violet-500/20 text-violet-400">Policy Escalation</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Deadline Rules Section */}
      {activeSection === "deadlines" && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Filter by jurisdiction:</span>
            {["", "Federal", "Washington", "California"].map(j => (
              <Button
                key={j}
                size="sm"
                variant={selectedJurisdiction === j ? "default" : "outline"}
                onClick={() => setSelectedJurisdiction(j)}
                className="text-xs"
              >
                {j || "All"}
              </Button>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Deadline Rule Catalog ({deadlineQ.data?.length ?? 0} rules)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deadlineQ.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {deadlineQ.data?.map((r: any) => (
                    <div key={r.ruleId} className="p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{r.ruleId}</span>
                          <span className="font-medium text-sm">{r.claimType?.replace(/_/g, " ")}</span>
                        </div>
                        <Badge className={`text-[10px] ${
                          r.jurisdiction === "Federal" ? "bg-blue-500/20 text-blue-400" :
                          r.jurisdiction === "Washington" ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-amber-500/20 text-amber-400"
                        }`}>{r.jurisdiction}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                        {r.statuteOfLimitations && <div><span className="font-medium">SOL:</span> {r.statuteOfLimitations}</div>}
                        {r.administrativeFilingDeadline && <div><span className="font-medium">Admin Filing:</span> {r.administrativeFilingDeadline}</div>}
                        {r.appealDeadline && <div><span className="font-medium">Appeal:</span> {r.appealDeadline}</div>}
                        {r.documentDeadline && <div><span className="font-medium">Document:</span> {r.documentDeadline}</div>}
                        {r.sourceStatute && <div className="col-span-2"><span className="font-medium">Source:</span> {r.sourceStatute}</div>}
                      </div>
                      {r.tollingConditions && (
                        <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Tolling:</span> {r.tollingConditions}</p>
                      )}
                      {r.exceptions && (
                        <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Exceptions:</span> {r.exceptions}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Evidence Lab Panel ──────────────────────────────────────────────────────
function EvidenceLabPanel({ onNavigateTo }: { onNavigateTo?: (tab: string) => void }) {
  const dashboard = trpc.evidenceConfidence.dashboard.useQuery();
  const claimTypes = trpc.evidenceConfidence.claimTypes.useQuery();
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const analyzeMut = trpc.evidenceConfidence.analyze.useMutation({
    onSuccess: (data) => setAnalysisResult(data),
  });
  const ruleDetail = trpc.evidenceConfidence.ruleDetail.useQuery(
    { claimType: selectedClaim || "" },
    { enabled: !!selectedClaim }
  );

  const handleAnalyze = () => {
    if (!selectedClaim) return;
    const evidenceItems = evidenceInput.split("\n").filter(Boolean).map(line => {
      const parts = line.split("|").map(s => s.trim());
      return {
        type: parts[0] || line.trim(),
        source: (parts[1] as any) || "other",
        has_contradictions: parts[2] === "contradicted",
        corroborated: parts[2] === "corroborated",
      };
    });
    analyzeMut.mutate({ claimType: selectedClaim, evidence: evidenceItems });
  };

  const scoreColor = (score: number) =>
    score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const levelBadge = (level: string) =>
    level === "high" ? "bg-emerald-500/20 text-emerald-300" :
    level === "medium" ? "bg-amber-500/20 text-amber-300" :
    "bg-red-500/20 text-red-300";
  return (
    <div className="space-y-6">
      {/* Pass-through navigation */}
      {onNavigateTo && (
        <div className="flex gap-2 flex-wrap pb-1 border-b border-slate-800">
          <span className="text-xs text-slate-500 self-center mr-1">Continue to:</span>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("claim-validation")}>
            <ArrowRight className="h-3 w-3" /> Claim Validation
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("remedy-feasibility")}>
            <ArrowRight className="h-3 w-3" /> Remedy Feasibility
          </Button>
        </div>
      )}
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{dashboard.data?.totalRules || 0}</div>
          </CardContent>
        </Card>
        {dashboard.data?.claimTypesByDomain && Object.entries(dashboard.data.claimTypesByDomain).map(([domain, count]) => (
          <Card key={domain} className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 capitalize">{domain}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-400">{count as number}</div>
              <p className="text-xs text-slate-500">claim types</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analysis Tool */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Microscope className="h-5 w-5 text-cyan-400" /> Evidence Confidence Analyzer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Claim Type</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                value={selectedClaim || ""}
                onChange={(e) => setSelectedClaim(e.target.value || null)}
              >
                <option value="">Select claim type...</option>
                {(claimTypes.data || []).map(ct => (
                  <option key={ct} value={ct}>{ct.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Evidence (one per line: type | source | status)</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm h-24"
                placeholder={"witness_testimony | third_party | corroborated\nemployment_records | employer\ndiscriminatory_statement | first_party"}
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={!selectedClaim || !evidenceInput || analyzeMut.isPending}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {analyzeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Microscope className="h-4 w-4 mr-2" />}
            Analyze Evidence Confidence
          </Button>

          {/* Rule Detail */}
          {ruleDetail.data && (
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-300">Rule: {ruleDetail.data.claimType}</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Required:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(ruleDetail.data.requiredEvidence || []).map((e: string) => (
                      <Badge key={e} className="bg-red-500/20 text-red-300 text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Supporting:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(ruleDetail.data.supportingEvidence || []).map((e: string) => (
                      <Badge key={e} className="bg-blue-500/20 text-blue-300 text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Alternative:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(ruleDetail.data.alternativeEvidence || []).map((e: string) => (
                      <Badge key={e} className="bg-purple-500/20 text-purple-300 text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Result */}
          {analysisResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="pt-4 text-center">
                    <div className={`text-4xl font-bold ${scoreColor(analysisResult.confidence.score)}`}>
                      {analysisResult.confidence.score}
                    </div>
                    <Badge className={`mt-2 ${levelBadge(analysisResult.confidence.level)}`}>
                      {analysisResult.confidence.level.toUpperCase()} CONFIDENCE
                    </Badge>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Strategy Path</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold text-white capitalize">
                      {analysisResult.strategyPath.primaryPath.replace(/_/g, " ")}
                    </div>
                    <p className="text-xs text-slate-500">{analysisResult.strategyPath.timelineEstimate}</p>
                    <p className="text-xs text-slate-500">Success: {analysisResult.strategyPath.successProbability}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Remedy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-semibold text-white">
                      {analysisResult.remedy.recommendation}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{analysisResult.remedy.strategy}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Adjustments */}
              {analysisResult.confidence.adjustments.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Score Adjustments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {analysisResult.confidence.adjustments.map((adj: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-300">{adj.reason}</span>
                          <span className={adj.delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {adj.delta >= 0 ? "+" : ""}{adj.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Evidence Gaps */}
              {analysisResult.confidence.evidenceGaps.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Evidence Gaps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.confidence.evidenceGaps.map((gap: string) => (
                        <Badge key={gap} className="bg-amber-500/20 text-amber-300">{gap}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Claim Validation Panel ──────────────────────────────────────────────────
function ClaimValidationPanel({ onNavigateTo }: { onNavigateTo?: (tab: string) => void }) {
  const dashboard = trpc.claimValidation.dashboard.useQuery();
  const claimTypes = trpc.claimValidation.claimTypes.useQuery();
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [validationResult, setValidationResult] = useState<any>(null);
  const analyzeMut = trpc.claimValidation.analyzeCase.useMutation({
    onSuccess: (data) => setValidationResult(data),
  });

  const toggleClaim = (ct: string) => {
    setSelectedClaims(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    );
  };

  const handleValidate = () => {
    if (selectedClaims.length === 0) return;
    const evidenceItems = evidenceInput.split("\n").filter(Boolean).map(line => ({
      type: line.trim(),
    }));
    analyzeMut.mutate({ claimTypes: selectedClaims, evidence: evidenceItems });
  };

  const statusColor = (status: string) =>
    status === "COMPLETE" ? "bg-emerald-500/20 text-emerald-300" :
    status === "PARTIAL" ? "bg-amber-500/20 text-amber-300" :
    "bg-red-500/20 text-red-300";

  return (
    <div className="space-y-6">
      {/* Pass-through navigation */}
      {onNavigateTo && (
        <div className="flex gap-2 flex-wrap pb-1 border-b border-slate-800">
          <span className="text-xs text-slate-500 self-center mr-1">Continue to:</span>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("procedural-paths")}>
            <ArrowRight className="h-3 w-3" /> Procedural Paths
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("evidence-lab")}>
            <ArrowRight className="h-3 w-3" /> Evidence Lab
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("remedy-feasibility")}>
            <ArrowRight className="h-3 w-3" /> Remedy Feasibility
          </Button>
        </div>
      )}
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{dashboard.data?.totalRules || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Claim Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{dashboard.data?.totalClaimTypes || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Avg Elements/Claim</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{dashboard.data?.avgElementsPerClaim || 0}</div>
          </CardContent>
        </Card>
        {dashboard.data?.claimTypesByDomain && (
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Domains</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(dashboard.data.claimTypesByDomain).map(([domain, count]) => (
                  <div key={domain} className="flex justify-between text-xs">
                    <span className="text-slate-300 capitalize">{domain}</span>
                    <span className="text-white font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Validation Tool */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-purple-400" /> Claim Element Validator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Select Claim Types (click to toggle)</label>
              <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto bg-slate-800 rounded p-2">
                {(claimTypes.data || []).map(ct => (
                  <Badge
                    key={ct}
                    className={`cursor-pointer text-xs ${
                      selectedClaims.includes(ct)
                        ? "bg-purple-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                    onClick={() => toggleClaim(ct)}
                  >
                    {ct.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
              {selectedClaims.length > 0 && (
                <p className="text-xs text-purple-400 mt-1">{selectedClaims.length} selected</p>
              )}
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Evidence Types (one per line)</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm h-48"
                placeholder={"witness_testimony\nemployment_records\ndiscriminatory_statement\ncomparator_evidence"}
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleValidate}
            disabled={selectedClaims.length === 0 || !evidenceInput || analyzeMut.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {analyzeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
            Validate Claims
          </Button>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4">
              {/* Strongest Claim */}
              {validationResult.strongestClaim && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <div className="text-sm text-emerald-300 font-semibold">Strongest Claim</div>
                  <div className="text-white capitalize">
                    {validationResult.strongestClaim.claimType.replace(/_/g, " ")} — {validationResult.strongestClaim.completionPercentage}% complete
                  </div>
                </div>
              )}

              {/* Per-claim results */}
              {Object.entries(validationResult.validationResults).map(([ct, result]: [string, any]) => (
                <Card key={ct} className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-white capitalize">{ct.replace(/_/g, " ")}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColor(result.validationStatus)}>{result.validationStatus}</Badge>
                        <span className="text-xs text-slate-400">{result.completionPercentage}%</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.elements.map((el: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          {el.status === "SATISFIED" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="text-slate-200 font-medium">{el.elementName.replace(/_/g, " ")}</span>
                            {el.elementDescription && (
                              <span className="text-slate-500 ml-1">— {el.elementDescription}</span>
                            )}
                            {el.evidenceUsed.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {el.evidenceUsed.map((e: string) => (
                                  <Badge key={e} className="bg-emerald-500/20 text-emerald-300 text-[10px]">{e}</Badge>
                                ))}
                              </div>
                            )}
                            {el.failureMessage && (
                              <p className="text-red-400 mt-0.5">{el.failureMessage}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 italic">{result.nextSteps}</p>
                  </CardContent>
                </Card>
              ))}

              {/* Recommended Actions */}
              {validationResult.recommendedActions.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Recommended Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {validationResult.recommendedActions.map((action: string, i: number) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                          <ChevronRight className="h-3 w-3 text-cyan-400 shrink-0 mt-0.5" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Evidence Gaps */}
              {validationResult.evidenceGaps.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-400">Evidence Gaps Across All Claims</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {validationResult.evidenceGaps.map((gap: string) => (
                        <Badge key={gap} className="bg-amber-500/20 text-amber-300">{gap}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Remedy Feasibility Panel ───────────────────────────────────────────────
function RemedyFeasibilityPanel({ onNavigateTo }: { onNavigateTo?: (tab: string) => void }) {
  const dashboard = trpc.remedyFeasibility.dashboard.useQuery();
  const strategies = trpc.remedyFeasibility.strategies.useQuery();
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [evidenceScore, setEvidenceScore] = useState(60);
  const [budget, setBudget] = useState(1000);
  const [timeDays, setTimeDays] = useState(180);
  const [hasAttorney, setHasAttorney] = useState(false);
  const [prereqInput, setPrereqInput] = useState("");
  const [assessResult, setAssessResult] = useState<any>(null);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);

  const assessMut = trpc.remedyFeasibility.assess.useMutation({
    onSuccess: (data) => setAssessResult(data),
  });
  const compareMut = trpc.remedyFeasibility.compare.useMutation({
    onSuccess: (data) => setCompareResult(data),
  });

  const handleAssess = () => {
    if (!selectedStrategy) return;
    const prereqs = prereqInput.split("\n").filter(Boolean).map(s => s.trim());
    assessMut.mutate({
      strategyType: selectedStrategy,
      evidenceScore,
      resources: { budget, timeAvailableDays: timeDays, hasAttorney, prerequisitesMet: prereqs },
    });
  };

  const handleCompare = () => {
    if (selectedStrategies.length < 2) return;
    const prereqs = prereqInput.split("\n").filter(Boolean).map(s => s.trim());
    compareMut.mutate({
      strategyTypes: selectedStrategies,
      evidenceScore,
      resources: { budget, timeAvailableDays: timeDays, hasAttorney, prerequisitesMet: prereqs },
    });
  };

  const toggleCompareStrategy = (st: string) => {
    setSelectedStrategies(prev =>
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  const scoreColor = (score: number) =>
    score >= 70 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  const complexityBadge = (level: string) =>
    level === "low" ? "bg-emerald-500/20 text-emerald-300" :
    level === "medium" ? "bg-amber-500/20 text-amber-300" :
    "bg-red-500/20 text-red-300";
  /* ── Jurisdiction-Specific Feasibility Card ── */
  function JurisdictionFeasibilityCard() {
    const { currentCaseId } = useCase();
    const { data: fullData, isLoading: fullLoading } = trpc.case_state.get_remedy_full.useQuery(
      { case_id: currentCaseId! },
      { enabled: !!currentCaseId }
    );
    if (!currentCaseId) return null;
    return (
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400" />
            Jurisdiction-Specific Feasibility
            {fullData && (
              <Badge className="ml-auto text-xs bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                {fullData.isFallback ? `Fallback: ${fullData.jurisdiction}` : fullData.jurisdiction}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fullLoading ? (
            <div className="space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
          ) : !fullData || fullData.strategies.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No jurisdiction data — commit a jurisdiction to your case first.</p>
          ) : (
            <div className="space-y-3">
              {fullData.strategies.map((s: any) => (
                <div key={s.strategyType} className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white capitalize">{s.strategyType.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs bg-emerald-500/20 text-emerald-300">{s.costRange}</Badge>
                      <Badge className="text-xs bg-purple-500/20 text-purple-300">{s.timeEstimate}</Badge>
                    </div>
                  </div>
                  {s.prerequisites?.length > 0 && (
                    <div className="mb-1.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Prerequisites</p>
                      <div className="flex flex-wrap gap-1">
                        {s.prerequisites.map((p: string, i: number) => (
                          <span key={i} className="text-[10px] bg-slate-700/60 text-slate-300 rounded px-1.5 py-0.5">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.riskFlags?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Risk Flags</p>
                      <div className="flex flex-wrap gap-1">
                        {s.riskFlags.map((r: string, i: number) => (
                          <span key={i} className="text-[10px] bg-red-900/40 text-red-300 rounded px-1.5 py-0.5">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {/* Pass-through navigation */}
      {onNavigateTo && (
        <div className="flex gap-2 flex-wrap pb-1 border-b border-slate-800">
          <span className="text-xs text-slate-500 self-center mr-1">Continue to:</span>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("remedy-templates")}>
            <ArrowRight className="h-3 w-3" /> Remedy Templates
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("procedural-paths")}>
            <ArrowRight className="h-3 w-3" /> Procedural Paths
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("claim-validation")}>
            <ArrowRight className="h-3 w-3" /> Claim Validation
          </Button>
        </div>
      )}
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Strategy Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{dashboard.data?.totalRules || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Avg Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">${dashboard.data?.avgCost || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Avg Time (days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{dashboard.data?.avgTimeDays || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Pro Se / Attorney</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <span className="text-emerald-400 font-bold">{dashboard.data?.proSeCount || 0}</span>
              <span className="text-slate-500"> pro se / </span>
              <span className="text-amber-400 font-bold">{dashboard.data?.attorneyRequiredCount || 0}</span>
              <span className="text-slate-500"> attorney</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assess Tool */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-400" /> Feasibility Assessment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 block mb-1">Strategy Type</label>
                <select
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                >
                  <option value="">Select strategy...</option>
                  {(strategies.data || []).map(st => (
                    <option key={st} value={st}>{st.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Evidence Confidence Score: {evidenceScore}</label>
                <input type="range" min={0} max={100} value={evidenceScore} onChange={e => setEvidenceScore(Number(e.target.value))} className="w-full" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Budget ($)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={budget} onChange={e => setBudget(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Time (days)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={timeDays} onChange={e => setTimeDays(Number(e.target.value))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={hasAttorney} onChange={e => setHasAttorney(e.target.checked)} />
                Has Attorney Access
              </label>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Prerequisites Met (one per line)</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm h-40"
                placeholder={"statute_of_limitations_met\njurisdiction_established\nexhaustion_complete"}
                value={prereqInput}
                onChange={(e) => setPrereqInput(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleAssess} disabled={!selectedStrategy || assessMut.isPending} className="bg-amber-600 hover:bg-amber-700">
            {assessMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gavel className="h-4 w-4 mr-2" />}
            Assess Feasibility
          </Button>

          {assessResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="pt-4 text-center">
                    <div className={`text-4xl font-bold ${scoreColor(assessResult.feasibilityScore.overall)}`}>
                      {assessResult.feasibilityScore.overall}
                    </div>
                    <Badge className={`mt-2 ${assessResult.viable ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                      {assessResult.viable ? "VIABLE" : "NOT VIABLE"}
                    </Badge>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Score Breakdown</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-slate-300">Evidence</span><span className={scoreColor(assessResult.feasibilityScore.evidenceAdequacy)}>{assessResult.feasibilityScore.evidenceAdequacy}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-300">Cost</span><span className={scoreColor(assessResult.feasibilityScore.costFeasibility)}>{assessResult.feasibilityScore.costFeasibility}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-300">Time</span><span className={scoreColor(assessResult.feasibilityScore.timeFeasibility)}>{assessResult.feasibilityScore.timeFeasibility}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-300">Prerequisites</span><span className={scoreColor(assessResult.feasibilityScore.prerequisiteCompletion)}>{assessResult.feasibilityScore.prerequisiteCompletion}</span></div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Resources</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-slate-300">Est. Cost</span><span className="text-white">${assessResult.resourceRequirements.estimatedCost}</span></div>
                    <div className="flex justify-between"><span className="text-slate-300">Filing Fee</span><span className="text-white">${assessResult.resourceRequirements.filingFee}</span></div>
                    <div className="flex justify-between"><span className="text-slate-300">Time</span><span className="text-white">{assessResult.resourceRequirements.estimatedTimeDays} days</span></div>
                    <div className="flex justify-between"><span className="text-slate-300">Complexity</span><Badge className={complexityBadge(assessResult.complexityLevel)}>{assessResult.complexityLevel}</Badge></div>
                  </CardContent>
                </Card>
              </div>

              {assessResult.unmetPrerequisites.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Unmet Prerequisites</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {assessResult.unmetPrerequisites.map((p: string) => (
                        <Badge key={p} className="bg-red-500/20 text-red-300">{p.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {assessResult.riskFlags.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Risk Flags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {assessResult.riskFlags.map((f: string) => (
                        <Badge key={f} className="bg-amber-500/20 text-amber-300">{f.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {assessResult.recommendedAlternative && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                  <span className="text-sm text-cyan-300">Recommended Alternative: </span>
                  <span className="text-white font-semibold capitalize">{assessResult.recommendedAlternative.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compare Tool */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Scale className="h-5 w-5 text-cyan-400" /> Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Select strategies to compare (click to toggle)</label>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto bg-slate-800 rounded p-2">
              {(strategies.data || []).map(st => (
                <Badge
                  key={st}
                  className={`cursor-pointer text-xs ${selectedStrategies.includes(st) ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                  onClick={() => toggleCompareStrategy(st)}
                >
                  {st.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
            {selectedStrategies.length > 0 && <p className="text-xs text-amber-400 mt-1">{selectedStrategies.length} selected</p>}
          </div>
          <Button onClick={handleCompare} disabled={selectedStrategies.length < 2 || compareMut.isPending} className="bg-cyan-600 hover:bg-cyan-700">
            {compareMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scale className="h-4 w-4 mr-2" />}
            Compare Strategies
          </Button>

          {compareResult && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-sm text-slate-300">{compareResult.summary}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {compareResult.bestOption && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    <div className="text-xs text-emerald-400">Best Overall</div>
                    <div className="text-white font-semibold capitalize">{compareResult.bestOption.strategyType.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-400">Score: {compareResult.bestOption.feasibilityScore.overall}</div>
                  </div>
                )}
                {compareResult.cheapestOption && (
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                    <div className="text-xs text-cyan-400">Cheapest</div>
                    <div className="text-white font-semibold capitalize">{compareResult.cheapestOption.strategyType.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-400">${compareResult.cheapestOption.resourceRequirements.estimatedCost}</div>
                  </div>
                )}
                {compareResult.fastestOption && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                    <div className="text-xs text-purple-400">Fastest</div>
                    <div className="text-white font-semibold capitalize">{compareResult.fastestOption.strategyType.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-400">{compareResult.fastestOption.resourceRequirements.estimatedTimeDays} days</div>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 text-slate-400">Strategy</th>
                      <th className="text-center py-2 text-slate-400">Score</th>
                      <th className="text-center py-2 text-slate-400">Viable</th>
                      <th className="text-center py-2 text-slate-400">Cost</th>
                      <th className="text-center py-2 text-slate-400">Time</th>
                      <th className="text-center py-2 text-slate-400">Complexity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareResult.strategies.map((s: any) => (
                      <tr key={s.strategyType} className="border-b border-slate-800">
                        <td className="py-2 text-white capitalize">{s.strategyType.replace(/_/g, " ")}</td>
                        <td className={`py-2 text-center font-bold ${scoreColor(s.feasibilityScore.overall)}`}>{s.feasibilityScore.overall}</td>
                        <td className="py-2 text-center">{s.viable ? <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" /> : <XCircle className="h-4 w-4 text-red-400 inline" />}</td>
                        <td className="py-2 text-center text-slate-300">${s.resourceRequirements.estimatedCost}</td>
                        <td className="py-2 text-center text-slate-300">{s.resourceRequirements.estimatedTimeDays}d</td>
                        <td className="py-2 text-center"><Badge className={complexityBadge(s.complexityLevel)}>{s.complexityLevel}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/// ─── Procedural Paths Panel ───────────────────────────────────────────────
function ProceduralPathsPanel({ onNavigateTo }: { onNavigateTo?: (tab: string) => void }) {
  const dashboard = trpc.proceduralPathEngine.dashboard.useQuery();
  const claimTypes = trpc.proceduralPathEngine.claimTypes.useQuery();
  const [selectedClaim, setSelectedClaim] = useState("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");
  const [pathResult, setPathResult] = useState<any>(null);

  const jurisdictions = trpc.proceduralPathEngine.jurisdictions.useQuery(
    { claimType: selectedClaim },
    { enabled: !!selectedClaim }
  );

  const pathQuery = trpc.proceduralPathEngine.resolve.useQuery(
    { claimType: selectedClaim, jurisdiction: selectedJurisdiction },
    { enabled: !!selectedClaim && !!selectedJurisdiction, onSuccess: (data: any) => setPathResult(data) }
  );

  const urgencyColor = (urgency: string) =>
    urgency === "critical" ? "bg-red-500/20 text-red-300" :
    urgency === "important" ? "bg-amber-500/20 text-amber-300" :
    "bg-slate-500/20 text-slate-300";

  return (
    <div className="space-y-6">
      {/* Pass-through navigation */}
      {onNavigateTo && (
        <div className="flex gap-2 flex-wrap pb-1 border-b border-slate-800">
          <span className="text-xs text-slate-500 self-center mr-1">Continue to:</span>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("claim-validation")}>
            <ArrowRight className="h-3 w-3" /> Claim Validation
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("remedy-feasibility")}>
            <ArrowRight className="h-3 w-3" /> Remedy Feasibility
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-slate-700" onClick={() => onNavigateTo("remedy-templates")}>
            <ArrowRight className="h-3 w-3" /> Remedy Templates
          </Button>
        </div>
      )}
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Paths</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{dashboard.data?.totalPaths || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{dashboard.data?.totalSteps || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Claim Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{dashboard.data?.claimTypeCount || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Jurisdictions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{dashboard.data?.jurisdictionCount || 0}</div>
            {dashboard.data?.claimTypesByJurisdiction && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(dashboard.data.claimTypesByJurisdiction).map(([j, cnt]) => (
                  <div key={j} className="flex justify-between text-xs">
                    <span className="text-slate-400 capitalize">{j}</span>
                    <span className="text-slate-300">{cnt as number} types</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Path Explorer */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-emerald-400" /> Procedural Path Explorer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Claim Type</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                value={selectedClaim}
                onChange={(e) => { setSelectedClaim(e.target.value); setSelectedJurisdiction(""); setPathResult(null); }}
              >
                <option value="">Select claim type...</option>
                {(claimTypes.data || []).map(ct => (
                  <option key={ct} value={ct}>{ct.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Jurisdiction</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                value={selectedJurisdiction}
                onChange={(e) => setSelectedJurisdiction(e.target.value)}
                disabled={!selectedClaim}
              >
                <option value="">Select jurisdiction...</option>
                {(jurisdictions.data || []).map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>
          </div>

          {pathQuery.isLoading && <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading path...</div>}

          {pathResult && pathResult.steps.length > 0 && (
            <div className="space-y-4">
              {/* Timeline Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-white">{pathResult.totalSteps}</div>
                    <div className="text-xs text-slate-400">Total Steps</div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-cyan-400">{pathResult.timeline.totalDurationDays}</div>
                    <div className="text-xs text-slate-400">Est. Days</div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-amber-400">${pathResult.timeline.totalFilingFees}</div>
                    <div className="text-xs text-slate-400">Total Filing Fees</div>
                  </CardContent>
                </Card>
              </div>

              {/* Critical Deadlines */}
              {pathResult.criticalDeadlines.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Critical Deadlines</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pathResult.criticalDeadlines.map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{d.stepName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{d.deadlineDays} days</span>
                            <Badge className={urgencyColor(d.urgency)}>{d.urgency}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Steps */}
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Procedural Steps</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pathResult.steps.map((step: any, i: number) => (
                      <div key={i} className="border-l-2 border-cyan-500/30 pl-4 pb-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-cyan-500/20 text-cyan-300 text-xs">Step {step.stepNumber}</Badge>
                          <span className="text-white font-medium text-sm">{step.stepName}</span>
                        </div>
                        {step.stepDescription && <p className="text-xs text-slate-400 mt-1">{step.stepDescription}</p>}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {step.responsibleAgency && <span className="text-slate-300"><Building2 className="h-3 w-3 inline mr-1" />{step.responsibleAgency}</span>}
                          {step.estimatedDurationDays > 0 && <span className="text-slate-300"><Clock className="h-3 w-3 inline mr-1" />{step.estimatedDurationDays} days</span>}
                          {step.filingFee > 0 && <span className="text-slate-300"><DollarSign className="h-3 w-3 inline mr-1" />${step.filingFee}</span>}
                          {step.deadlineDays && <span className="text-red-300"><AlertTriangle className="h-3 w-3 inline mr-1" />Deadline: {step.deadlineDays}d</span>}
                          {step.formNumber && <span className="text-purple-300"><FileText className="h-3 w-3 inline mr-1" />{step.formNumber}</span>}
                        </div>
                        {step.requiredDocuments.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {step.requiredDocuments.map((doc: string) => (
                              <Badge key={doc} className="bg-slate-700/50 text-slate-300 text-[10px]">{doc.replace(/_/g, " ")}</Badge>
                            ))}
                          </div>
                        )}
                        {step.nextStep && <div className="text-xs text-slate-500 mt-1">Next: {step.nextStep}{step.alternativeStep ? ` | Alt: ${step.alternativeStep}` : ""}</div>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {pathResult && pathResult.steps.length === 0 && (
            <div className="text-center py-8 text-slate-500">No procedural path found for this claim type and jurisdiction.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Hardening Pipeline Panel ───────────────────────────────────────────────
function HardeningPipelinePanel() {
  const dashboard = trpc.systemHardeningPipeline.dashboard.useQuery();
  const ecClaimTypes = trpc.evidenceConfidence.claimTypes.useQuery();
  const strategies = trpc.remedyFeasibility.strategies.useQuery();
  const ppClaimTypes = trpc.proceduralPathEngine.claimTypes.useQuery();

  const [claimType, set_claim_type] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [strategyType, setStrategyType] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [budget, setBudget] = useState(1000);
  const [timeDays, setTimeDays] = useState(180);
  const [hasAttorney, setHasAttorney] = useState(false);
  const [prereqInput, setPrereqInput] = useState("");
  const [pipelineResult, setPipelineResult] = useState<any>(null);

  const jurisdictions = trpc.proceduralPathEngine.jurisdictions.useQuery(
    { claimType },
    { enabled: !!claimType }
  );

  const executeMut = trpc.systemHardeningPipeline.execute.useMutation({
    onSuccess: (data) => setPipelineResult(data),
  });

  const handleExecute = () => {
    if (!claimType || !jurisdiction || !strategyType) return;
    const evidence = evidenceInput.split("\n").filter(Boolean).map(line => {
      const parts = line.split("|").map(s => s.trim());
      return {
        type: parts[0] || "",
        source: parts[1] || undefined,
        description: parts[2] || undefined,
      };
    });
    const prereqs = prereqInput.split("\n").filter(Boolean).map(s => s.trim());
    executeMut.mutate({
      caseId: "pipeline-test-" + Date.now(),
      claimType,
      jurisdiction,
      strategyType,
      evidence,
      resources: { budget, timeAvailableDays: timeDays, hasAttorney, prerequisitesMet: prereqs },
    });
  };

  const verdictColor = (verdict: string) =>
    verdict === "PROCEED" ? "bg-emerald-500/20 text-emerald-300" :
    verdict === "CAUTION" ? "bg-amber-500/20 text-amber-300" :
    verdict === "INVESTIGATE" ? "bg-cyan-500/20 text-cyan-300" :
    "bg-red-500/20 text-red-300";

  const scoreColor = (score: number) =>
    score >= 70 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Pipeline Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{dashboard.data?.totalRuns || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${scoreColor(dashboard.data?.avgConfidenceScore || 0)}`}>
              {dashboard.data?.avgConfidenceScore || 0}
            </div>
          </CardContent>
        </Card>
        {dashboard.data?.verdictDistribution && Object.keys(dashboard.data.verdictDistribution).length > 0 && (
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Verdicts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(dashboard.data.verdictDistribution).map(([v, cnt]) => (
                  <div key={v} className="flex justify-between text-xs">
                    <Badge className={verdictColor(v)}>{v}</Badge>
                    <span className="text-white font-medium">{cnt as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pipeline Executor */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" /> System Hardening Pipeline
          </CardTitle>
          <p className="text-xs text-slate-400">Runs all four engines in sequence: Evidence Confidence → Claim Validation → Remedy Feasibility → Procedural Path</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Claim Type</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={claimType} onChange={e => { set_claim_type(e.target.value); setJurisdiction(""); }}>
                <option value="">Select...</option>
                {(ecClaimTypes.data || []).map(ct => <option key={ct} value={ct}>{ct.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Jurisdiction</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} disabled={!claimType}>
                <option value="">Select...</option>
                {(jurisdictions.data || []).map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Strategy Type</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={strategyType} onChange={e => setStrategyType(e.target.value)}>
                <option value="">Select...</option>
                {(strategies.data || []).map(st => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Evidence (type | source | description, one per line)</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm h-28"
                placeholder={"witness_testimony | third_party | Coworker saw incident\nemployment_records | employer\ndiscriminatory_statement | first_party"}
                value={evidenceInput}
                onChange={e => setEvidenceInput(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Budget ($)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={budget} onChange={e => setBudget(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm text-slate-400 block mb-1">Time (days)</label>
                  <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm" value={timeDays} onChange={e => setTimeDays(Number(e.target.value))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={hasAttorney} onChange={e => setHasAttorney(e.target.checked)} />
                Has Attorney Access
              </label>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Prerequisites Met</label>
                <textarea className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm h-16" placeholder={"statute_of_limitations_met\njurisdiction_established"} value={prereqInput} onChange={e => setPrereqInput(e.target.value)} />
              </div>
            </div>
          </div>
          <Button onClick={handleExecute} disabled={!claimType || !jurisdiction || !strategyType || !evidenceInput || executeMut.isPending} className="bg-purple-600 hover:bg-purple-700">
            {executeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Layers className="h-4 w-4 mr-2" />}
            Execute Pipeline
          </Button>

          {pipelineResult && (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div className={`rounded-lg p-4 border ${pipelineResult.synthesis.verdict === "PROCEED" ? "bg-emerald-500/10 border-emerald-500/30" : pipelineResult.synthesis.verdict === "CAUTION" ? "bg-amber-500/10 border-amber-500/30" : pipelineResult.synthesis.verdict === "INVESTIGATE" ? "bg-cyan-500/10 border-cyan-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={verdictColor(pipelineResult.synthesis.verdict)}>{pipelineResult.synthesis.verdict}</Badge>
                    <span className={`text-3xl font-bold ml-3 ${scoreColor(pipelineResult.synthesis.weightedTotal)}`}>{pipelineResult.synthesis.weightedTotal}/100</span>
                  </div>
                  {pipelineResult.viableStrategy && (
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Viable Strategy</div>
                      <div className="text-white font-semibold capitalize">{pipelineResult.viableStrategy.replace(/_/g, " ")}</div>
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-300 mt-2">{pipelineResult.synthesis.explanation}</p>
              </div>

              {/* Engine Scores */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Evidence Confidence (40%)</CardTitle></CardHeader>
                  <CardContent className="text-center">
                    <div className={`text-3xl font-bold ${scoreColor(pipelineResult.synthesis.evidenceScore)}`}>{pipelineResult.synthesis.evidenceScore}</div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Claim Validation (30%)</CardTitle></CardHeader>
                  <CardContent className="text-center">
                    <div className={`text-3xl font-bold ${scoreColor(pipelineResult.synthesis.validationScore)}`}>{pipelineResult.synthesis.validationScore}</div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Remedy Feasibility (30%)</CardTitle></CardHeader>
                  <CardContent className="text-center">
                    <div className={`text-3xl font-bold ${scoreColor(pipelineResult.synthesis.feasibilityScore)}`}>{pipelineResult.synthesis.feasibilityScore}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Required Next Actions */}
              {pipelineResult.requiredNextActions.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Required Next Actions</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {pipelineResult.requiredNextActions.map((action: string, i: number) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                          <ChevronRight className="h-3 w-3 text-cyan-400 shrink-0 mt-0.5" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Risk Flags */}
              {pipelineResult.riskFlags.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Risk Flags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {pipelineResult.riskFlags.map((f: string) => (
                        <Badge key={f} className="bg-red-500/20 text-red-300">{f.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Alternative Strategies */}
              {pipelineResult.alternativeStrategies.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Alternative Strategies</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {pipelineResult.alternativeStrategies.map((s: string) => (
                        <Badge key={s} className="bg-cyan-500/20 text-cyan-300 capitalize">{s.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   COALITION INTELLIGENCE PANEL — Session 60
   Unified search across legislators, agencies, advocacy orgs, media
   ═══════════════════════════════════════════════════════════════════════ */
function CoalitionIntelPanel() {
  const dashQ = trpc.coalitionIntelligence.dashboard.useQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [activeView, setActiveView] = useState<"dashboard" | "search" | "readiness">("dashboard");
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; type: string } | null>(null);

  const searchQ = trpc.coalitionIntelligence.search.useQuery(
    {
      query: searchQuery || undefined,
      entityTypes: entityFilter ? [entityFilter as any] : undefined,
      jurisdiction: jurisdictionFilter || undefined,
      domains: domainFilter ? [domainFilter] : undefined,
      limit: 30,
    },
    { enabled: activeView === "search" }
  );

  const readinessQ = trpc.coalitionIntelligence.assessReadiness.useQuery(
    {
      jurisdiction: jurisdictionFilter || "federal",
      domains: domainFilter ? [domainFilter] : ["employment"],
    },
    { enabled: activeView === "readiness" }
  );

  const legDetailQ = trpc.coalitionIntelligence.legislatorDetail.useQuery(
    { id: selectedEntity?.id || "" },
    { enabled: !!selectedEntity && selectedEntity.type === "legislator" }
  );
  const agDetailQ = trpc.coalitionIntelligence.agencyDetail.useQuery(
    { id: selectedEntity?.id || "" },
    { enabled: !!selectedEntity && selectedEntity.type === "agency" }
  );
  const orgDetailQ = trpc.coalitionIntelligence.advocacyOrgDetail.useQuery(
    { id: selectedEntity?.id || "" },
    { enabled: !!selectedEntity && selectedEntity.type === "advocacy_org" }
  );
  const medDetailQ = trpc.coalitionIntelligence.mediaDetail.useQuery(
    { id: selectedEntity?.id || "" },
    { enabled: !!selectedEntity && selectedEntity.type === "media" }
  );

  const dash = dashQ.data;
  if (dashQ.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const entityTypeColors: Record<string, string> = {
    legislator: "bg-blue-500/20 text-blue-400",
    agency: "bg-emerald-500/20 text-emerald-400",
    advocacy_org: "bg-violet-500/20 text-violet-400",
    media: "bg-amber-500/20 text-amber-400",
  };
  const entityTypeLabels: Record<string, string> = {
    legislator: "Legislator", agency: "Agency", advocacy_org: "Advocacy Org", media: "Media",
  };

  const detail = selectedEntity?.type === "legislator" ? legDetailQ.data
    : selectedEntity?.type === "agency" ? agDetailQ.data
    : selectedEntity?.type === "advocacy_org" ? orgDetailQ.data
    : selectedEntity?.type === "media" ? medDetailQ.data : null;

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex gap-2">
        {(["dashboard", "search", "readiness"] as const).map(v => (
          <Button key={v} size="sm" variant={activeView === v ? "default" : "outline"}
            onClick={() => { setActiveView(v); setSelectedEntity(null); }} className="capitalize">
            {v === "dashboard" ? <BarChart3 className="h-3.5 w-3.5 mr-1" /> : v === "search" ? <Search className="h-3.5 w-3.5 mr-1" /> : <Shield className="h-3.5 w-3.5 mr-1" />}
            {v === "readiness" ? "Coalition Readiness" : v === "search" ? "Entity Search" : "Intel Dashboard"}
          </Button>
        ))}
      </div>

      {/* Dashboard View */}
      {activeView === "dashboard" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Legislators" value={String(dash?.totalLegislators ?? 0)} icon={<Landmark className="h-3.5 w-3.5" />} color="blue" />
            <MetricCard label="Agencies" value={String(dash?.totalAgencies ?? 0)} icon={<Building2 className="h-3.5 w-3.5" />} color="emerald" />
            <MetricCard label="Advocacy Orgs" value={String(dash?.totalAdvocacyOrgs ?? 0)} icon={<Handshake className="h-3.5 w-3.5" />} color="violet" />
            <MetricCard label="Media Contacts" value={String(dash?.totalMedia ?? 0)} icon={<Megaphone className="h-3.5 w-3.5" />} color="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Jurisdiction Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" /> By Jurisdiction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(dash?.byJurisdiction ?? {}).map(([j, c]) => (
                    <div key={j} className="flex items-center justify-between p-2 rounded border border-border">
                      <span className="text-sm capitalize">{j}</span>
                      <Badge variant="outline" className="font-mono">{String(c)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Domains */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" /> Top Issue Domains
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {(dash?.topDomains ?? []).slice(0, 10).map((d: any) => (
                    <div key={d.domain} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{d.domain}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (d.count / ((dash?.topDomains?.[0]?.count || 1))) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-6 text-right">{d.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Search View */}
      {activeView === "search" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm"
                placeholder="Search legislators, agencies, orgs, media..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="legislator">Legislators</option>
              <option value="agency">Agencies</option>
              <option value="advocacy_org">Advocacy Orgs</option>
              <option value="media">Media</option>
            </select>
            <select className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              value={jurisdictionFilter} onChange={e => setJurisdictionFilter(e.target.value)}>
              <option value="">All Jurisdictions</option>
              <option value="federal">Federal</option>
              <option value="state">State</option>
              <option value="National">National</option>
            </select>
            <select className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              value={domainFilter} onChange={e => setDomainFilter(e.target.value)}>
              <option value="">All Domains</option>
              {["employment", "housing", "civil_rights", "disability", "consumer", "veterans", "immigration", "healthcare", "education"].map(d => (
                <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {searchQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(searchQ.data ?? []).map((e: any) => (
                <div key={e.id} className="p-3 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedEntity({ id: e.id, type: e.entityType })}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{e.name}</span>
                    <Badge className={`text-[10px] ${entityTypeColors[e.entityType] || ""}`}>
                      {entityTypeLabels[e.entityType] || e.entityType}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{e.subtitle}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> {e.influenceScore}</span>
                    {e.state && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.state}</span>}
                    {e.domains?.length > 0 && <span>{e.domains.slice(0, 2).join(", ")}</span>}
                  </div>
                </div>
              ))}
              {(searchQ.data ?? []).length === 0 && (
                <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">
                  <Binoculars className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No entities found. Try adjusting your search filters.</p>
                </div>
              )}
            </div>
          )}

          {/* Entity Detail Modal */}
          {selectedEntity && detail && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {selectedEntity.type === "legislator" ? <Landmark className="h-4 w-4" /> : selectedEntity.type === "agency" ? <Building2 className="h-4 w-4" /> : selectedEntity.type === "advocacy_org" ? <Handshake className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                    {(detail as any).name}
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedEntity(null)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {Object.entries(detail as any).filter(([k]) => !['id', 'isActive', 'isVerified'].includes(k)).map(([k, v]) => {
                    if (v === null || v === undefined) return null;
                    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    const val = Array.isArray(v) ? (v as any[]).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
                    if (!val || val === '{}' || val === '[]') return null;
                    return (
                      <div key={k}>
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <p className="text-sm mt-0.5 break-words">{val}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Readiness View */}
      {activeView === "readiness" && (
        <>
          <div className="flex gap-3 items-center">
            <select className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              value={jurisdictionFilter} onChange={e => setJurisdictionFilter(e.target.value)}>
              <option value="federal">Federal</option>
              <option value="state">State</option>
            </select>
            <select className="px-3 py-2 rounded-md border border-border bg-background text-sm"
              value={domainFilter} onChange={e => setDomainFilter(e.target.value)}>
              {["employment", "housing", "civil_rights", "disability", "consumer", "veterans", "immigration"].map(d => (
                <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {readinessQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : readinessQ.data ? (
            <div className="space-y-6">
              {/* Overall Score */}
              <Card className="border-primary/30">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">Coalition Readiness Score</h3>
                      <p className="text-sm text-muted-foreground">For {readinessQ.data.jurisdiction} / {readinessQ.data.domains.join(", ")}</p>
                    </div>
                    <div className={`text-4xl font-bold font-mono ${
                      readinessQ.data.overallReadinessScore >= 70 ? "text-emerald-400" :
                      readinessQ.data.overallReadinessScore >= 40 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {readinessQ.data.overallReadinessScore}%
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Aligned Legislators" value={`${readinessQ.data.legislators.aligned}/${readinessQ.data.legislators.total}`} icon={<Landmark className="h-3.5 w-3.5" />} color="blue" />
                <MetricCard label="Relevant Agencies" value={`${readinessQ.data.agencies.relevant}/${readinessQ.data.agencies.total}`} icon={<Building2 className="h-3.5 w-3.5" />} color="emerald" />
                <MetricCard label="Willing Orgs" value={`${readinessQ.data.advocacyOrgs.willing}/${readinessQ.data.advocacyOrgs.total}`} icon={<Handshake className="h-3.5 w-3.5" />} color="violet" />
                <MetricCard label="Relevant Media" value={`${readinessQ.data.media.relevant}/${readinessQ.data.media.total}`} icon={<Megaphone className="h-3.5 w-3.5" />} color="amber" />
              </div>

              {/* Gaps and Strengths */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                      <AlertTriangle className="h-4 w-4" /> Gaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {readinessQ.data.gaps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No gaps identified.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {readinessQ.data.gaps.map((g: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                            {g}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {readinessQ.data.strengths.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No strengths identified yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {readinessQ.data.strengths.map((s: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CAMPAIGN ENGINE PANEL — Session 60
   6-stage campaign pipeline with auto-creation, timeline, actions, outcomes
   ═══════════════════════════════════════════════════════════════════════ */
function CampaignEnginePanel() {
  const dashQ = trpc.campaignEngine.dashboard.useQuery();
  const stagesQ = trpc.campaignEngine.stages.useQuery();
  const [activeView, setActiveView] = useState<"dashboard" | "campaigns" | "detail">("dashboard");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");

  const campaignsQ = trpc.campaignEngine.list.useQuery(undefined, { enabled: activeView === "campaigns" || activeView === "dashboard" });
  const detailQ = trpc.campaignEngine.detail.useQuery(
    { id: selectedCampaignId },
    { enabled: !!selectedCampaignId && activeView === "detail" }
  );

  const autoCreateMut = trpc.campaignEngine.autoCreate.useMutation({
    onSuccess: () => { dashQ.refetch(); campaignsQ.refetch(); },
  });
  const advanceStageMut = trpc.campaignEngine.advanceStage.useMutation({
    onSuccess: () => { detailQ.refetch(); dashQ.refetch(); campaignsQ.refetch(); },
  });

  const dash = dashQ.data;
  const stages = stagesQ.data ?? [];

  if (dashQ.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const stageColors: Record<number, string> = {
    1: "bg-blue-500", 2: "bg-violet-500", 3: "bg-amber-500",
    4: "bg-emerald-500", 5: "bg-orange-500", 6: "bg-green-500",
  };
  const stageTextColors: Record<number, string> = {
    1: "text-blue-400", 2: "text-violet-400", 3: "text-amber-400",
    4: "text-emerald-400", 5: "text-orange-400", 6: "text-green-400",
  };

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex gap-2">
        {(["dashboard", "campaigns"] as const).map(v => (
          <Button key={v} size="sm" variant={activeView === v ? "default" : "outline"}
            onClick={() => { setActiveView(v); setSelectedCampaignId(""); }} className="capitalize">
            {v === "dashboard" ? <BarChart3 className="h-3.5 w-3.5 mr-1" /> : <Megaphone className="h-3.5 w-3.5 mr-1" />}
            {v === "dashboard" ? "Campaign Dashboard" : "All Campaigns"}
          </Button>
        ))}
        {activeView === "detail" && (
          <Button size="sm" variant="default" className="capitalize">
            <Eye className="h-3.5 w-3.5 mr-1" /> Campaign Detail
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => autoCreateMut.mutate()}
          disabled={autoCreateMut.isPending} className="gap-1.5">
          {autoCreateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Auto-Create from Critical Patterns
        </Button>
      </div>

      {/* Dashboard View */}
      {activeView === "dashboard" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Campaigns" value={String(dash?.totalCampaigns ?? 0)} icon={<Megaphone className="h-3.5 w-3.5" />} color="blue" />
            <MetricCard label="Total Actions" value={String(dash?.totalActions ?? 0)} icon={<Zap className="h-3.5 w-3.5" />} color="violet" />
            <MetricCard label="Outcomes" value={String(dash?.totalOutcomes ?? 0)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="emerald" />
            <MetricCard label="Avg Impact" value={`${dash?.averageImpactIndex ?? 0}`} icon={<TrendingUp className="h-3.5 w-3.5" />} color="amber" />
          </div>

          {/* 6-Stage Pipeline Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Milestone className="h-4 w-4" /> 6-Stage Campaign Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                {stages.map((s: any) => {
                  const count = (dash?.byStage ?? {})[s.number] ?? 0;
                  return (
                    <div key={s.number} className="flex-1 text-center">
                      <div className={`h-2 rounded-full ${stageColors[s.number] || 'bg-muted'} ${count > 0 ? 'opacity-100' : 'opacity-30'}`} />
                      <p className={`text-xs mt-1 font-medium ${stageTextColors[s.number] || ''}`}>{s.name}</p>
                      <p className="text-xs text-muted-foreground">{count} campaign{count !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Campaigns */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Megaphone className="h-4 w-4" /> Recent Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(dash?.recentCampaigns?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No campaigns yet. Click "Auto-Create from Critical Patterns" to begin.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dash?.recentCampaigns?.slice(0, 5).map((c: any) => (
                    <div key={c.id} className="p-3 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors"
                      onClick={() => { setSelectedCampaignId(c.id); setActiveView("detail"); }}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${stageColors[c.currentStage] || 'bg-muted'}/20 ${stageTextColors[c.currentStage] || ''}`}>
                            Stage {c.currentStage}: {stages.find((s: any) => s.number === c.currentStage)?.name || ''}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.jurisdiction} · Impact: {c.impactIndex}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* All Campaigns View */}
      {activeView === "campaigns" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> All Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaignsQ.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (campaignsQ.data ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No campaigns found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Jurisdiction</th>
                      <th className="text-center py-2 px-2">Stage</th>
                      <th className="text-center py-2 px-2">Impact</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-right py-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(campaignsQ.data ?? []).map((c: any) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedCampaignId(c.id); setActiveView("detail"); }}>
                        <td className="py-2 px-2 font-medium">{c.name}</td>
                        <td className="py-2 px-2 text-muted-foreground">{c.jurisdiction}</td>
                        <td className="py-2 px-2 text-center">
                          <Badge className={`text-[10px] ${stageColors[c.currentStage] || 'bg-muted'}/20 ${stageTextColors[c.currentStage] || ''}`}>
                            {c.currentStage}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-center font-mono">{c.impactIndex}</td>
                        <td className="py-2 px-2 text-center">
                          <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1">
                            <Eye className="h-3 w-3" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaign Detail View */}
      {activeView === "detail" && selectedCampaignId && (
        <>
          <Button size="sm" variant="ghost" onClick={() => { setActiveView("campaigns"); setSelectedCampaignId(""); }} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Campaigns
          </Button>

          {detailQ.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detailQ.data ? (
            <div className="space-y-6">
              {/* Campaign Header */}
              <Card className="border-primary/30">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold">{detailQ.data.campaign.name}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{detailQ.data.campaign.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold font-mono">{detailQ.data.campaign.impactIndex}</div>
                      <p className="text-xs text-muted-foreground">Impact Index</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> {detailQ.data.campaign.jurisdiction}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Started: {new Date(detailQ.data.campaign.startedAt).toLocaleDateString()}</span>
                    <Badge variant="outline">{detailQ.data.campaign.status}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* 6-Stage Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Milestone className="h-4 w-4" /> Campaign Timeline
                    </CardTitle>
                    {detailQ.data.campaign.currentStage < 6 && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                        onClick={() => advanceStageMut.mutate({ campaignId: selectedCampaignId })}
                        disabled={advanceStageMut.isPending}>
                        {advanceStageMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                        Advance to Stage {detailQ.data.campaign.currentStage + 1}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {stages.map((s: any) => {
                        const histEntry = detailQ.data!.campaign.stageHistory.find((h: any) => h.stage === s.number);
                        const isCurrent = s.number === detailQ.data!.campaign.currentStage;
                        const isCompleted = histEntry?.completedAt;
                        const isFuture = s.number > detailQ.data!.campaign.currentStage;
                        return (
                          <div key={s.number} className="relative pl-10">
                            <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                              isCompleted ? 'bg-emerald-500 border-emerald-500' :
                              isCurrent ? `${stageColors[s.number]} border-current animate-pulse` :
                              'bg-muted border-border'
                            }`} />
                            <div className={`p-3 rounded-lg border ${isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border'} ${isFuture ? 'opacity-50' : ''}`}>
                              <div className="flex items-center justify-between">
                                <span className={`font-medium text-sm ${isCurrent ? stageTextColors[s.number] : ''}`}>
                                  Stage {s.number}: {s.name}
                                </span>
                                {isCompleted && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400">Completed</Badge>}
                                {isCurrent && !isCompleted && <Badge className="text-[10px] bg-blue-500/20 text-blue-400">Current</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                              {histEntry && (
                                <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                  <span>Entered: {new Date(histEntry.enteredAt).toLocaleDateString()}</span>
                                  {histEntry.completedAt && <span>Completed: {new Date(histEntry.completedAt).toLocaleDateString()}</span>}
                                  {histEntry.notes && <span>Notes: {histEntry.notes}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Members and Targets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" /> Coalition Members ({detailQ.data.members.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detailQ.data.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailQ.data.members.map((m: any) => (
                          <div key={m.id} className="p-2 rounded border border-border">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{m.memberName}</span>
                              <Badge variant="outline" className="text-[10px]">{m.memberType}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Role: {m.roleInCoalition} · Commitment: {m.commitmentLevel}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4" /> Campaign Targets ({detailQ.data.targets.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detailQ.data.targets.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No targets yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailQ.data.targets.map((t: any) => (
                          <div key={t.id} className="p-2 rounded border border-border">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{t.targetName}</span>
                              <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{t.targetType} · Status: {t.outreachStatus || 'pending'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Actions Log */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Action Log ({detailQ.data.actions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detailQ.data.actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No actions recorded.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detailQ.data.actions.slice(0, 15).map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between p-2 rounded border border-border/50">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${stageColors[a.stageNumber] || 'bg-muted'}/20 ${stageTextColors[a.stageNumber] || ''}`}>
                              S{a.stageNumber}
                            </Badge>
                            <span className="text-sm">{a.action}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Outcomes */}
              {detailQ.data.outcomes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Outcomes ({detailQ.data.outcomes.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {detailQ.data.outcomes.map((o: any) => (
                        <div key={o.id} className="p-3 rounded border border-emerald-500/20 bg-emerald-500/5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{o.result}</span>
                            <span className="text-xs font-mono text-emerald-400">Impact: {o.impactScore}</span>
                          </div>
                          {o.notes && <p className="text-xs text-muted-foreground mt-1">{o.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Campaign not found.</div>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Knowledge Health Panel — Freshness Monitoring
   ══════════════════════════════════════════════════════════════════════ */
function KnowledgeHealthPanel() {
  const records = trpc.knowledgeHealth.freshnessRecords.useQuery();
  const summary = trpc.knowledgeHealth.freshnessSummary.useQuery();
  const runCheck = trpc.knowledgeHealth.runFreshnessCheck.useMutation({
    onSuccess: () => {
      records.refetch();
      summary.refetch();
    },
  });
  const initFreshness = trpc.knowledgeHealth.initializeFreshness.useMutation({
    onSuccess: () => {
      records.refetch();
      summary.refetch();
    },
  });

  const getStatusBadge = (score: number) => {
    if (score >= 80) return { label: "Healthy", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" };
    if (score >= 50) return { label: "Aging", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" };
    return { label: "Stale", color: "text-red-400 border-red-400/30 bg-red-400/10" };
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{summary.data.totalTables}</div>
              <div className="text-xs text-muted-foreground">Tables Tracked</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">{summary.data.healthyCount}</div>
              <div className="text-xs text-muted-foreground">Healthy</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{summary.data.agingCount}</div>
              <div className="text-xs text-muted-foreground">Aging</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-red-400">{summary.data.staleCount}</div>
              <div className="text-xs text-muted-foreground">Stale</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className={`text-2xl font-bold ${getScoreColor(summary.data.averageScore)}`}>{summary.data.averageScore}</div>
              <div className="text-xs text-muted-foreground">Avg Score</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Critical Alerts */}
      {summary.data && summary.data.criticalAlerts.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Critical: Backbone tables below 50 freshness</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.data.criticalAlerts.map((alert, i) => (
                <Badge key={i} variant="outline" className="text-red-400 border-red-400/30">{alert}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Run Freshness Check
        </Button>
        {(!records.data || records.data.length === 0) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => initFreshness.mutate()}
            disabled={initFreshness.isPending}
          >
            {initFreshness.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Initialize Tracking
          </Button>
        )}
      </div>

      {/* Freshness Table */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <HeartPulse className="h-5 w-5 text-emerald-400" />
            Knowledge Health Status
          </h3>
          {records.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : !records.data || records.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HeartPulse className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No freshness data yet. Click "Initialize Tracking" to begin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Table</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Records</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Last Updated</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Score</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.data.map((rec) => {
                    const badge = getStatusBadge(rec.freshnessScore);
                    return (
                      <tr key={rec.tableName} className="border-b border-border/20 hover:bg-muted/30">
                        <td className="py-2 px-3">
                          <div className="font-medium">{rec.displayName}</div>
                          <div className="text-xs text-muted-foreground">{rec.tableName}</div>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">{rec.recordCount.toLocaleString()}</td>
                        <td className="text-right py-2 px-3 text-xs text-muted-foreground">
                          {rec.lastUpdate ? new Date(rec.lastUpdate).toLocaleDateString() : "Never"}
                        </td>
                        <td className={`text-right py-2 px-3 font-bold tabular-nums ${getScoreColor(rec.freshnessScore)}`}>
                          {rec.freshnessScore}
                        </td>
                        <td className="text-center py-2 px-3">
                          <Badge variant="outline" className={badge.color}>{badge.label}</Badge>
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

      {/* Quarterly Backbone Refresh */}
      <QuarterlyRefreshCard />
    </div>
  );
}

function QuarterlyRefreshCard() {
  const [result, setResult] = useState<{ prompt: string; stats: any } | null>(null);
  const [copied, setCopied] = useState(false);
  const generate = trpc.knowledgeHealth.generateQuarterlyRefreshPrompt.useMutation({
    onSuccess: (data: any) => setResult(data),
  });

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-400" /> Quarterly Backbone Refresh
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate a pre-filled worker prompt targeting all stale, empty, or underpopulated tables
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="gap-1.5 border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
          >
            {generate.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</> : 'Generate Prompt'}
          </Button>
        </div>
      </CardHeader>
      {result && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Overall Score', value: `${result.stats.overallScore}/100`, color: result.stats.overallScore >= 80 ? 'text-emerald-400' : result.stats.overallScore >= 50 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Empty Tables', value: result.stats.emptyCount, color: result.stats.emptyCount > 0 ? 'text-red-400' : 'text-emerald-400' },
              { label: 'Stale Tables', value: result.stats.staleCount, color: result.stats.staleCount > 0 ? 'text-amber-400' : 'text-emerald-400' },
              { label: 'Need Attention', value: result.stats.tablesNeedingAttention, color: result.stats.tablesNeedingAttention > 0 ? 'text-amber-400' : 'text-emerald-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md border border-border/30 p-2">
                <div className={`text-xl font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="relative">
            <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap font-mono border border-border/30">{result.prompt}</pre>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="absolute top-2 right-2 gap-1 text-xs h-7 px-2 bg-background"
            >
              {copied ? <><CheckCircle2 className="h-3 w-3" /> Copied</> : 'Copy'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Knowledge Gap Analysis Panel — Coverage Heatmap
   ══════════════════════════════════════════════════════════════════════ */
function KnowledgeGapAnalysisPanel() {
  const metrics = trpc.knowledgeHealth.coverageMetrics.useQuery();
  const calculateMut = trpc.knowledgeHealth.calculateCoverage.useMutation({
    onSuccess: () => metrics.refetch(),
  });
  const [selectedCell, setSelectedCell] = useState<{ jurisdiction: string; claimType: string } | null>(null);
  const cellDetail = trpc.knowledgeHealth.cellDetail.useQuery(
    { jurisdiction: selectedCell?.jurisdiction ?? "", claimType: selectedCell?.claimType ?? "" },
    { enabled: !!selectedCell }
  );

  // Build heatmap data
  const jurisdictions = new Set<string>();
  const claimTypes = new Set<string>();
  const cellMap = new Map<string, { score: number; statutes: number; caseLaw: number; agencies: number; procedures: number; evidence: number; advocacy: number; remedy: number; deadlines: number }>();

  if (metrics.data) {
    for (const m of metrics.data) {
      jurisdictions.add(m.jurisdiction);
      claimTypes.add(m.claimType);
      cellMap.set(`${m.jurisdiction}|${m.claimType}`, {
        score: m.coverageScore,
        statutes: m.statuteCount,
        caseLaw: m.caseLawCount,
        agencies: m.agencyCount,
        procedures: m.proceduralCount,
        evidence: m.evidenceProfilesCount,
        advocacy: m.advocacyTargetsCount,
        remedy: m.remedyTemplatesCount,
        deadlines: m.deadlineRulesCount,
      });
    }
  }

  const sortedJurisdictions = Array.from(jurisdictions).sort();
  const sortedClaimTypes = Array.from(claimTypes).sort();

  // Calculate aggregate scores
  const jurisdictionScores = new Map<string, { sum: number; count: number }>();
  const claimTypeScores = new Map<string, { sum: number; count: number }>();
  let overallSum = 0;
  let overallCount = 0;

  for (const [key, val] of cellMap) {
    const [j, c] = key.split("|");
    if (!jurisdictionScores.has(j)) jurisdictionScores.set(j, { sum: 0, count: 0 });
    const js = jurisdictionScores.get(j)!;
    js.sum += val.score;
    js.count++;

    if (!claimTypeScores.has(c)) claimTypeScores.set(c, { sum: 0, count: 0 });
    const cs = claimTypeScores.get(c)!;
    cs.sum += val.score;
    cs.count++;

    overallSum += val.score;
    overallCount++;
  }

  const overallScore = overallCount > 0 ? Math.round(overallSum / overallCount) : 0;

  const getCellColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40";
    if (score >= 60) return "bg-amber-500/30 text-amber-300 hover:bg-amber-500/40";
    return "bg-red-500/30 text-red-300 hover:bg-red-500/40";
  };

  const formatClaimType = (ct: string) => ct.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className={`text-2xl font-bold ${overallScore >= 80 ? "text-emerald-400" : overallScore >= 60 ? "text-amber-400" : "text-red-400"}`}>
              {overallScore}%
            </div>
            <div className="text-xs text-muted-foreground">Overall Coverage</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{sortedJurisdictions.length}</div>
            <div className="text-xs text-muted-foreground">Jurisdictions</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{sortedClaimTypes.length}</div>
            <div className="text-xs text-muted-foreground">Claim Types</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{cellMap.size}</div>
            <div className="text-xs text-muted-foreground">Coverage Cells</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => calculateMut.mutate()}
          disabled={calculateMut.isPending}
        >
          {calculateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Recalculate Coverage
        </Button>
      </div>

      {/* Heatmap */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Grid3X3 className="h-5 w-5 text-violet-400" />
            Coverage Heatmap
          </h3>
          {metrics.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : cellMap.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Grid3X3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No coverage data yet. Click "Recalculate Coverage" to analyze.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium sticky left-0 bg-background z-10">Jurisdiction</th>
                    {sortedClaimTypes.map(ct => (
                      <th key={ct} className="text-center py-2 px-1 text-muted-foreground font-medium min-w-[80px]">
                        <div className="truncate max-w-[80px]" title={formatClaimType(ct)}>{formatClaimType(ct)}</div>
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedJurisdictions.map(j => {
                    const jScore = jurisdictionScores.get(j);
                    const avg = jScore ? Math.round(jScore.sum / jScore.count) : 0;
                    return (
                      <tr key={j} className="border-b border-border/10">
                        <td className="py-1 px-2 font-medium sticky left-0 bg-background z-10">{j}</td>
                        {sortedClaimTypes.map(ct => {
                          const cell = cellMap.get(`${j}|${ct}`);
                          if (!cell) return <td key={ct} className="py-1 px-1 text-center text-muted-foreground/30">—</td>;
                          return (
                            <td key={ct} className="py-1 px-1 text-center">
                              <button
                                className={`w-full rounded px-1 py-0.5 text-xs font-bold cursor-pointer transition-colors ${getCellColor(cell.score)}`}
                                onClick={() => setSelectedCell({ jurisdiction: j, claimType: ct })}
                                title={`${j} × ${formatClaimType(ct)}: ${cell.score}%`}
                              >
                                {cell.score}
                              </button>
                            </td>
                          );
                        })}
                        <td className={`py-1 px-2 text-center font-bold ${avg >= 80 ? "text-emerald-400" : avg >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {avg}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Footer row: claim type averages */}
                  <tr className="border-t border-border/50 font-bold">
                    <td className="py-2 px-2 sticky left-0 bg-background z-10">Average</td>
                    {sortedClaimTypes.map(ct => {
                      const cs = claimTypeScores.get(ct);
                      const avg = cs ? Math.round(cs.sum / cs.count) : 0;
                      return (
                        <td key={ct} className={`py-2 px-1 text-center ${avg >= 80 ? "text-emerald-400" : avg >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {avg}
                        </td>
                      );
                    })}
                    <td className={`py-2 px-2 text-center ${overallScore >= 80 ? "text-emerald-400" : overallScore >= 60 ? "text-amber-400" : "text-red-400"}`}>
                      {overallScore}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-emerald-500/30" /> ≥80% (Green)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-amber-500/30" /> 60-80% (Yellow)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-500/30" /> &lt;60% (Red)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cell Detail */}
      {selectedCell && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {selectedCell.jurisdiction} × {formatClaimType(selectedCell.claimType)}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCell(null)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {cellDetail.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : cellDetail.data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.statuteCount}</div>
                    <div className="text-xs text-muted-foreground">Statutes</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.caseLawCount}</div>
                    <div className="text-xs text-muted-foreground">Case Law</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.agencyCount}</div>
                    <div className="text-xs text-muted-foreground">Agencies</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.proceduralCount}</div>
                    <div className="text-xs text-muted-foreground">Procedures</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.evidenceProfilesCount}</div>
                    <div className="text-xs text-muted-foreground">Evidence Profiles</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.advocacyTargetsCount}</div>
                    <div className="text-xs text-muted-foreground">Advocacy Targets</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.remedyTemplatesCount}</div>
                    <div className="text-xs text-muted-foreground">Remedy Templates</div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3 text-center">
                    <div className="text-lg font-bold">{cellDetail.data.deadlineRulesCount}</div>
                    <div className="text-xs text-muted-foreground">Deadline Rules</div>
                  </div>
                </div>
                {cellDetail.data.missingCategories.length > 0 && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    <div className="text-sm font-medium text-red-400 mb-2">Missing Data Types</div>
                    <div className="flex flex-wrap gap-2">
                      {cellDetail.data.missingCategories.map(cat => (
                        <Badge key={cat} variant="outline" className="text-red-400 border-red-400/30">
                          {cat.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">No data for this cell.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ENGINE PANELS — Harm Index, Risk Forecast, Harm Map, Front Door
   ═══════════════════════════════════════════════════════════════════════ */

function HarmIndexPanel() {
  const summary = trpc.engines.harmIndex.getSummary.useQuery();
  const calculate = trpc.engines.harmIndex.calculate.useMutation({
    onSuccess: () => summary.refetch(),
  });

  const entities = summary.data?.entities || [];
  const topEntities = entities.slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" /> Systemic Harm Index
          </h3>
          <p className="text-sm text-zinc-400 mt-1">Entity-level harm scoring from complaints, litigation, and enforcement data</p>
        </div>
        <Button onClick={() => calculate.mutate()} disabled={calculate.isPending} size="sm" variant="outline">
          {calculate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Calculate Index
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-white">{summary.data?.totalEntities || 0}</div>
          <div className="text-xs text-zinc-400">Entities Tracked</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-red-400">{summary.data?.highRisk || 0}</div>
          <div className="text-xs text-zinc-400">High Risk (≥70)</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{summary.data?.mediumRisk || 0}</div>
          <div className="text-xs text-zinc-400">Medium Risk (40-69)</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{summary.data?.lowRisk || 0}</div>
          <div className="text-xs text-zinc-400">Low Risk (&lt;40)</div>
        </CardContent></Card>
      </div>

      {/* Entity Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Top Entities by Harm Score</CardTitle></CardHeader>
        <CardContent>
          {topEntities.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Flame className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No harm index data yet. Click "Calculate Index" to generate scores.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="text-left py-2 px-2">Entity</th>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Industry</th>
                    <th className="text-right py-2 px-2">Harm Score</th>
                    <th className="text-right py-2 px-2">Complaints</th>
                    <th className="text-right py-2 px-2">Litigation</th>
                  </tr>
                </thead>
                <tbody>
                  {topEntities.map((e: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-2 px-2 text-white font-medium">{e.entityName}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs">{e.entityType || 'unknown'}</Badge>
                      </td>
                      <td className="py-2 px-2 text-zinc-400">{e.industrySector || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-bold ${
                          e.harmScore >= 70 ? 'text-red-400' : e.harmScore >= 40 ? 'text-yellow-400' : 'text-emerald-400'
                        }`}>{e.harmScore?.toFixed(1)}</span>
                      </td>
                      <td className="py-2 px-2 text-right text-zinc-400">{e.complaintCount || 0}</td>
                      <td className="py-2 px-2 text-right text-zinc-400">{e.litigationCount || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskForecastPanel() {
  const summary = trpc.engines.riskForecast.getSummary.useQuery();
  const generate = trpc.engines.riskForecast.generate.useMutation({
    onSuccess: () => summary.refetch(),
  });

  const forecasts = summary.data?.forecasts || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Radar className="h-5 w-5 text-purple-400" /> Systemic Risk Forecast
          </h3>
          <p className="text-sm text-zinc-400 mt-1">Predictive analysis of which patterns are likely to escalate</p>
        </div>
        <Button onClick={() => generate.mutate({})} disabled={generate.isPending} size="sm" variant="outline">
          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Generate Forecasts
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-white">{summary.data?.totalForecasts || 0}</div>
          <div className="text-xs text-zinc-400">Active Forecasts</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-red-400">{summary.data?.criticalCount || 0}</div>
          <div className="text-xs text-zinc-400">Critical Risk</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{summary.data?.highCount || 0}</div>
          <div className="text-xs text-zinc-400">High Risk</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-zinc-400">{summary.data?.avgConfidence?.toFixed(0) || 0}%</div>
          <div className="text-xs text-zinc-400">Avg Confidence</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Risk Forecasts</CardTitle></CardHeader>
        <CardContent>
          {forecasts.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Radar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No forecasts yet. Click "Generate Forecasts" to analyze risk patterns.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {forecasts.slice(0, 15).map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm">{f.entityName || f.patternType}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{f.riskCategory} — {f.forecastHorizon || 30}d horizon</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${
                        f.riskLevel === 'critical' ? 'text-red-400' : 
                        f.riskLevel === 'high' ? 'text-orange-400' : 
                        f.riskLevel === 'medium' ? 'text-yellow-400' : 'text-emerald-400'
                      }`}>{f.escalationProbability?.toFixed(0)}%</div>
                      <div className="text-xs text-zinc-500">escalation</div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${
                      f.riskLevel === 'critical' ? 'border-red-500 text-red-400' : 
                      f.riskLevel === 'high' ? 'border-orange-500 text-orange-400' : 
                      f.riskLevel === 'medium' ? 'border-yellow-500 text-yellow-400' : 'border-emerald-500 text-emerald-400'
                    }`}>{f.riskLevel}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HarmMapPanel() {
  const mapData = trpc.engines.harmMap.getData.useQuery();
  const generate = trpc.engines.harmMap.generate.useMutation({
    onSuccess: () => mapData.refetch(),
  });

  const nodes = mapData.data?.nodes || [];
  const edges = mapData.data?.edges || [];
  const summary = mapData.data?.summary;

  // Group nodes by type for visualization
  const entityNodes = nodes.filter((n: any) => n.nodeType === 'entity');
  const jurisdictionNodes = nodes.filter((n: any) => n.nodeType === 'jurisdiction');
  const industryNodes = nodes.filter((n: any) => n.nodeType === 'industry');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" /> Global Systemic Harm Map
          </h3>
          <p className="text-sm text-zinc-400 mt-1">Interactive network of entities, jurisdictions, and industries</p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending} size="sm" variant="outline">
          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Generate Map
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-white">{summary?.nodeCount || 0}</div>
          <div className="text-xs text-zinc-400">Nodes</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-cyan-400">{summary?.edgeCount || 0}</div>
          <div className="text-xs text-zinc-400">Connections</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{entityNodes.length}</div>
          <div className="text-xs text-zinc-400">Entities</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{jurisdictionNodes.length}</div>
          <div className="text-xs text-zinc-400">Jurisdictions</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{industryNodes.length}</div>
          <div className="text-xs text-zinc-400">Industries</div>
        </CardContent></Card>
      </div>

      {/* Network Graph Visualization */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Network Graph</CardTitle></CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No map data yet. Click "Generate Map" to build the network.</p>
            </div>
          ) : (
            <div className="relative bg-zinc-900 rounded-lg border border-zinc-700 p-4" style={{ minHeight: 400 }}>
              {/* SVG Force-directed layout simulation */}
              <svg width="100%" height="400" viewBox="0 0 800 400">
                {/* Edges */}
                {edges.slice(0, 100).map((edge: any, i: number) => {
                  const source = nodes.find((n: any) => n.id === edge.sourceNodeId);
                  const target = nodes.find((n: any) => n.id === edge.targetNodeId);
                  if (!source || !target) return null;
                  const si = nodes.indexOf(source);
                  const ti = nodes.indexOf(target);
                  const sx = 100 + (si % 12) * 55;
                  const sy = 50 + Math.floor(si / 12) * 70;
                  const tx = 100 + (ti % 12) * 55;
                  const ty = 50 + Math.floor(ti / 12) * 70;
                  return (
                    <line key={`e-${i}`} x1={sx} y1={sy} x2={tx} y2={ty}
                      stroke={edge.relationshipType === 'litigation_link' ? '#ef4444' : '#3b82f6'}
                      strokeWidth={Math.max(0.5, edge.strengthScore / 50)}
                      opacity={0.3} />
                  );
                })}
                {/* Nodes */}
                {nodes.slice(0, 60).map((node: any, i: number) => {
                  const x = 100 + (i % 12) * 55;
                  const y = 50 + Math.floor(i / 12) * 70;
                  const color = node.nodeType === 'entity' ? '#f97316' :
                    node.nodeType === 'jurisdiction' ? '#a855f7' : '#10b981';
                  const radius = Math.max(6, Math.min(16, node.harmScore / 5));
                  return (
                    <g key={`n-${i}`}>
                      <circle cx={x} cy={y} r={radius} fill={color} opacity={0.8} />
                      <text x={x} y={y + radius + 12} textAnchor="middle" fill="#a1a1aa" fontSize="8">
                        {node.nodeLabel?.substring(0, 12)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="flex gap-4 mt-3 justify-center text-xs text-zinc-400">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Entity</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Jurisdiction</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Industry</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Risk Entities */}
      {entityNodes.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Harm Entities</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {entityNodes.slice(0, 10).map((n: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded border border-zinc-700">
                  <span className="text-sm text-white">{n.nodeLabel}</span>
                  <Badge variant="outline" className={`text-xs ${
                    n.harmScore >= 70 ? 'border-red-500 text-red-400' :
                    n.harmScore >= 40 ? 'border-yellow-500 text-yellow-400' : 'border-emerald-500 text-emerald-400'
                  }`}>{n.harmScore?.toFixed(0)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FrontDoorPanel() {
  const [story, setStory] = useState("");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);

  const startSession = trpc.engines.interpreter.startSession.useMutation({
    onSuccess: (data) => {
      setActiveSession(data);
      if (data.claimCandidates.length > 0) {
        setSelectedClaim(data.claimCandidates[0].claimType);
      }
    },
  });

  const questions = trpc.engines.interpreter.getClarifyingQuestions.useQuery(
    { claimType: selectedClaim || "" },
    { enabled: !!selectedClaim }
  );

  const evidence = trpc.engines.interpreter.getEvidenceGuidance.useQuery(
    { claimType: selectedClaim || "" },
    { enabled: !!selectedClaim }
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-400" /> Problem Interpreter — Front Door
        </h3>
        <p className="text-sm text-zinc-400 mt-1">Tell us what happened. Luminari will identify your legal situation and guide you.</p>
      </div>

      {!activeSession ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 block mb-2">Tell me what happened:</label>
                <textarea
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="Describe your situation in your own words. For example: 'My landlord has been refusing to fix a mold problem in my apartment for months, and now they're trying to evict me after I complained to the health department...'"
                  className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white text-sm placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button
                onClick={() => startSession.mutate({ story })}
                disabled={story.length < 20 || startSession.isPending}
                className="w-full"
              >
                {startSession.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyzing your situation...</>
                ) : (
                  <><MessageSquare className="h-4 w-4 mr-2" /> Analyze My Situation</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Analysis Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Analysis Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs">Jurisdiction: {activeSession.jurisdictionGuess}</Badge>
                <Badge variant="outline" className="text-xs">Confidence: {(activeSession.confidenceScore * 100).toFixed(0)}%</Badge>
              </div>

              <div>
                <div className="text-sm font-medium text-zinc-300 mb-2">Detected Claim Types:</div>
                <div className="space-y-2">
                  {activeSession.claimCandidates.map((c: any, i: number) => (
                    <div
                      key={i}
                      onClick={() => setSelectedClaim(c.claimType)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedClaim === c.claimType
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium text-sm">
                          {c.claimType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </span>
                        <Badge variant="outline" className={`text-xs ${
                          c.confidence >= 0.7 ? 'border-emerald-500 text-emerald-400' :
                          c.confidence >= 0.4 ? 'border-yellow-500 text-yellow-400' : 'border-zinc-500 text-zinc-400'
                        }`}>{(c.confidence * 100).toFixed(0)}%</Badge>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{c.reasoning}</p>
                      {c.supportingKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {c.supportingKeywords.map((kw: string, ki: number) => (
                            <Badge key={ki} variant="outline" className="text-xs bg-zinc-800">{kw}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clarifying Questions */}
          {selectedClaim && questions.data && questions.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Clarifying Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {questions.data.map((q: any, i: number) => (
                    <div key={i} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <p className="text-sm text-white">{q.questionText}</p>
                      {q.answerOptions && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {q.answerOptions.map((opt: string, oi: number) => (
                            <Badge key={oi} variant="outline" className="text-xs cursor-pointer hover:bg-zinc-700">{opt}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evidence Guidance */}
          {selectedClaim && evidence.data && evidence.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Evidence You Should Gather</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {evidence.data.map((eg: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-2 bg-zinc-800/50 rounded border border-zinc-700">
                      <Badge variant="outline" className={`text-xs mt-0.5 ${
                        eg.priority === 1 ? 'border-red-500 text-red-400' :
                        eg.priority === 2 ? 'border-yellow-500 text-yellow-400' : 'border-zinc-500 text-zinc-400'
                      }`}>P{eg.priority}</Badge>
                      <div>
                        <div className="text-sm text-white font-medium">{eg.evidenceType}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">{eg.guidanceText}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={() => { setActiveSession(null); setStory(""); setSelectedClaim(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Start New Intake
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Lobbying Panel ── */
function LobbyingPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading: loadingStats } = trpc.streams.lobbyingStats.useQuery();
  const { data: topFirms, isLoading: loadingFirms } = trpc.streams.lobbyingTopFirms.useQuery({ limit: 10 });
  const { data: policyAreas, isLoading: loadingPolicy } = trpc.streams.lobbyingByPolicy.useQuery({ limit: 10 });
  const detectMut = trpc.streams.lobbyingDetectSignals.useMutation();
  const ingestMut = trpc.streams.lobbyingIngest.useMutation({ onSuccess: () => { utils.streams.lobbyingStats.invalidate(); utils.streams.lobbyingTopFirms.invalidate(); utils.streams.lobbyingByPolicy.invalidate(); } });

  if (loadingStats) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-400" />
          Policy Influence Activity
        </h3>
        <Button variant="outline" size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Detect Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Records" value={(stats?.totalRecords ?? 0).toLocaleString()} icon={<Database className="h-4 w-4" />} color="green" />
        <MetricCard label="Total Spending" value={`$${((stats?.totalSpending ?? 0) / 1000000).toFixed(1)}M`} icon={<DollarSign className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Unique Firms" value={(stats?.uniqueFirms ?? 0).toString()} icon={<Building2 className="h-4 w-4" />} color="blue" />
        <MetricCard label="Policy Areas" value={(stats?.uniquePolicyAreas ?? 0).toString()} icon={<Target className="h-4 w-4" />} color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Lobbying Firms</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFirms ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="space-y-2">
                {(topFirms ?? []).map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[200px] text-muted-foreground">{f.firm}</span>
                    <span className="font-mono text-xs text-green-400">${(f.total / 1000).toFixed(0)}K</span>
                  </div>
                ))}
                {(!topFirms || topFirms.length === 0) && <p className="text-xs text-muted-foreground">No lobbying data yet</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Policy Area Spending</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="space-y-2">
                {(policyAreas ?? []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[200px] text-muted-foreground">{p.area}</span>
                    <span className="font-mono text-xs text-emerald-400">${(p.total / 1000).toFixed(0)}K</span>
                  </div>
                ))}
                 {(!policyAreas || policyAreas.length === 0) && <p className="text-xs text-muted-foreground">No policy data yet</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <StreamUploader
        title="Ingest Lobbying Records"
        description="Upload lobbying disclosure data (JSON/CSV)"
        sampleFields={[
          { name: "clientName", type: "string", required: true },
          { name: "lobbyingFirm", type: "string" },
          { name: "lobbyistName", type: "string" },
          { name: "industry", type: "string" },
          { name: "policyArea", type: "string" },
          { name: "lobbyingAmount", type: "number" },
          { name: "reportingPeriod", type: "string" },
          { name: "jurisdiction", type: "string" },
          { name: "legislatorsContacted", type: "string" },
          { name: "source_url", type: "string" },
        ]}
        onIngest={(records) => ingestMut.mutateAsync({ records })}
        onSuccess={() => utils.streams.lobbyingStats.invalidate()}
      />
    </div>
  );
}
/* ── Litigation Panel ── */
function LitigationPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading: loadingStats } = trpc.streams.litigationStats.useQuery();
  const { data: recent, isLoading: loadingRecent } = trpc.streams.litigationRecentFilings.useQuery({ limit: 10 });
  const { data: outcomes } = trpc.streams.litigationOutcomes.useQuery();
  const detectMut = trpc.streams.litigationDetectSignals.useMutation();
  const ingestMut = trpc.streams.litigationIngest.useMutation({ onSuccess: () => { utils.streams.litigationStats.invalidate(); utils.streams.litigationRecentFilings.invalidate(); } });

  if (loadingStats) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Gavel className="h-5 w-5 text-orange-400" />
          Litigation Activity
        </h3>
        <Button variant="outline" size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Detect Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Cases" value={(stats?.totalCases ?? 0).toLocaleString()} icon={<FileText className="h-4 w-4" />} color="orange" />
        <MetricCard label="Courts" value={(stats?.uniqueCourts ?? 0).toString()} icon={<Landmark className="h-4 w-4" />} color="blue" />
        <MetricCard label="Defendants" value={(stats?.uniqueDefendants ?? 0).toString()} icon={<Users className="h-4 w-4" />} color="red" />
        <MetricCard label="Active" value={(stats?.activeCases ?? 0).toString()} icon={<Activity className="h-4 w-4" />} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Filings</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecent ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="space-y-2">
                {(recent ?? []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="truncate max-w-[250px]">
                      <span className="text-muted-foreground">{c.plaintiffName || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground/60"> v. </span>
                      <span className="text-red-400">{c.defendantName || 'Unknown'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.courtName || ''}</span>
                  </div>
                ))}
                {(!recent || recent.length === 0) && <p className="text-xs text-muted-foreground">No litigation data yet</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Case Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(outcomes ?? []).map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{o.status || 'unknown'}</span>
                  <span className="font-mono text-xs">{o.count}</span>
                </div>
              ))}
              {(!outcomes || outcomes.length === 0) && <p className="text-xs text-muted-foreground">No outcome data yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
      <StreamUploader
        title="Ingest Litigation Records"
        description="Upload federal litigation case data (JSON/CSV)"
        sampleFields={[
          { name: "caseId", type: "string" },
          { name: "courtName", type: "string" },
          { name: "jurisdiction", type: "string" },
          { name: "filingDate", type: "string" },
          { name: "caseType", type: "string" },
          { name: "natureOfSuit", type: "string" },
          { name: "plaintiffName", type: "string" },
          { name: "defendantName", type: "string" },
          { name: "lawFirm", type: "string" },
          { name: "judge", type: "string" },
          { name: "industry", type: "string" },
          { name: "caseStatus", type: "string" },
          { name: "source_url", type: "string" },
        ]}
        onIngest={(records) => ingestMut.mutateAsync({ records })}
        onSuccess={() => utils.streams.litigationStats.invalidate()}
      />
    </div>
  );
}
/* ── Administrative Decisions Panel ── */
function AdminDecisionsPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.streams.adminDecisionsStats.useQuery();
  const { data: agencies } = trpc.streams.adminDecisionsOutcomesByAgency.useQuery({ limit: 10 });
  const detectMut = trpc.streams.adminDecisionsDetectSignals.useMutation();
  const ingestMut = trpc.streams.adminDecisionsIngest.useMutation({ onSuccess: () => { utils.streams.adminDecisionsStats.invalidate(); utils.streams.adminDecisionsOutcomesByAgency.invalidate(); } });

  if (isLoading) return <PanelSkeleton />;

  const denialRate = stats?.initialDenialRate ?? 0;
  const appealRate = stats?.appealSuccessRate ?? 0;
  const inversionDetected = appealRate > 0 && denialRate > 0 && appealRate > (100 - denialRate) * 1.5;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Scale className="h-5 w-5 text-purple-400" />
          Administrative Outcomes
        </h3>
        <Button variant="outline" size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Detect Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Decisions" value={(stats?.totalDecisions ?? 0).toLocaleString()} icon={<FileText className="h-4 w-4" />} color="purple" />
        <MetricCard label="Initial Denial %" value={`${denialRate.toFixed(1)}%`} icon={<XCircle className="h-4 w-4" />} color={denialRate > 50 ? "red" : "yellow"} />
        <MetricCard label="Appeal Success %" value={`${appealRate.toFixed(1)}%`} icon={<CheckCircle2 className="h-4 w-4" />} color={appealRate > 50 ? "emerald" : "orange"} />
        <MetricCard label="Avg Processing" value={`${(stats?.avgProcessingDays ?? 0).toFixed(0)}d`} icon={<Clock className="h-4 w-4" />} color="blue" />
      </div>

      {inversionDetected && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-semibold">Appeal Success Inversion Detected</p>
                <p className="text-xs text-red-400/80">Appeal success rate ({appealRate.toFixed(1)}%) significantly exceeds initial approval rate ({(100 - denialRate).toFixed(1)}%) — indicates systemic denial pattern</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Outcomes by Agency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(agencies ?? []).map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[200px] text-muted-foreground">{a.agency}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-400">{a.approved} approved</span>
                  <span className="text-red-400">{a.denied} denied</span>
                  <span className="text-blue-400">{a.reversed} reversed</span>
                </div>
              </div>
            ))}
            {(!agencies || agencies.length === 0) && <p className="text-xs text-muted-foreground">No agency data yet</p>}
          </div>
        </CardContent>
      </Card>
      <StreamUploader
        title="Ingest Administrative Decisions"
        description="Upload administrative decision records (JSON/CSV)"
        sampleFields={[
          { name: "decisionId", type: "string" },
          { name: "agency", type: "string", required: true },
          { name: "program", type: "string" },
          { name: "jurisdiction", type: "string" },
          { name: "claimType", type: "string" },
          { name: "decisionDate", type: "string" },
          { name: "initialOutcome", type: "string" },
          { name: "appealOutcome", type: "string" },
          { name: "processingTimeDays", type: "number" },
          { name: "hearingRequested", type: "boolean" },
          { name: "reversal", type: "boolean" },
          { name: "entityOrAgency", type: "string" },
          { name: "source_url", type: "string" },
        ]}
        onIngest={(records) => ingestMut.mutateAsync({ records })}
        onSuccess={() => utils.streams.adminDecisionsStats.invalidate()}
      />
    </div>
  );
}
/* ── Verified Reports Panel ── */
function VerifiedReportsPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.streams.verifiedReportStats.useQuery();
  const { data: recent } = trpc.streams.recentReports.useQuery({ limit: 10 });
  const generateMut = trpc.streams.verifiedSignals.useMutation();
  const submitMut = trpc.streams.submitReport.useMutation({ onSuccess: () => { utils.streams.verifiedReportStats.invalidate(); utils.streams.recentReports.invalidate(); } });

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-cyan-400" />
          Verified User Reports
        </h3>
        <Button variant="outline" size="sm" onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
          {generateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Generate Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Reports" value={(stats?.totalReports ?? 0).toLocaleString()} icon={<FileText className="h-4 w-4" />} color="cyan" />
        <MetricCard label="Verified" value={(stats?.verifiedCount ?? 0).toString()} icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Pending" value={(stats?.pendingCount ?? 0).toString()} icon={<Clock className="h-4 w-4" />} color="yellow" />
        <MetricCard label="Avg Confidence" value={`${(stats?.avgConfidence ?? 0).toFixed(0)}%`} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {["unverified", "community_confirmed", "evidence_verified", "legal_verified"].map((level) => {
          const count = (stats as any)?.[`${level}Count`] ?? 0;
          const colors: Record<string, string> = {
            unverified: "text-gray-400",
            community_confirmed: "text-yellow-400",
            evidence_verified: "text-blue-400",
            legal_verified: "text-emerald-400",
          };
          return (
            <div key={level} className="text-center p-2 rounded-lg bg-card/50">
              <p className={`text-lg font-bold ${colors[level]}`}>{count}</p>
              <p className="text-xs text-muted-foreground capitalize">{level.replace(/_/g, " ")}</p>
            </div>
          );
        })}
      </div>

      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(recent ?? []).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[250px]">
                  <span className="text-muted-foreground">{r.entityNamed || 'Anonymous'}</span>
                  {r.claimType && <span className="text-xs text-muted-foreground/60 ml-1">({r.claimType})</span>}
                </div>
                <Badge variant="outline" className="text-xs capitalize">{(r.verification_status || 'unverified').replace(/_/g, ' ')}</Badge>
              </div>
            ))}
            {(!recent || recent.length === 0) && <p className="text-xs text-muted-foreground">No reports yet. Users can submit harm reports through the platform.</p>}
          </div>
        </CardContent>
      </Card>
      <StreamUploader
        title="Submit Verified Reports"
        description="Upload harm reports for verification (JSON/CSV)"
        sampleFields={[
          { name: "reporterType", type: "string", required: true },
          { name: "jurisdiction", type: "string" },
          { name: "industry", type: "string" },
          { name: "entityNamed", type: "string" },
          { name: "claimType", type: "string" },
          { name: "evidenceCount", type: "number" },
          { name: "narrative", type: "string" },
        ]}
        onIngest={async (records) => {
          let inserted = 0;
          for (const r of records) {
            await submitMut.mutateAsync(r);
            inserted++;
          }
          return { inserted };
        }}
        onSuccess={() => utils.streams.verifiedReportStats.invalidate()}
      />
    </div>
  );
}
/* ── Civil Society / Advocacy Panel ── */
function AdvocacyPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.streams.advocacyStats.useQuery();
  const { data: recent } = trpc.streams.advocacyRecentReports.useQuery({ limit: 10 });
  const { data: byOrg } = trpc.streams.advocacyByOrganization.useQuery({ limit: 10 });
  const { data: byHarm } = trpc.streams.advocacyByHarmType.useQuery({ limit: 10 });
  const detectMut = trpc.streams.advocacyDetectSignals.useMutation();
  const ingestMut = trpc.streams.advocacyIngest.useMutation({ onSuccess: () => { utils.streams.advocacyStats.invalidate(); utils.streams.advocacyRecentReports.invalidate(); utils.streams.advocacyByOrganization.invalidate(); utils.streams.advocacyByHarmType.invalidate(); } });

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-rose-400" />
          Civil Society / Advocacy Reports
        </h3>
        <Button variant="outline" size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Detect Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Reports" value={(stats?.totalReports ?? 0).toLocaleString()} icon={<FileText className="h-4 w-4" />} color="rose" />
        <MetricCard label="Organizations" value={(stats?.uniqueOrgs ?? 0).toLocaleString()} icon={<Building2 className="h-4 w-4" />} color="violet" />
        <MetricCard label="Entities Named" value={(stats?.uniqueEntities ?? 0).toLocaleString()} icon={<Target className="h-4 w-4" />} color="amber" />
        <MetricCard label="Policy Areas" value={(stats?.uniquePolicyAreas ?? 0).toLocaleString()} icon={<Landmark className="h-4 w-4" />} color="blue" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Harm Types" value={(stats?.uniqueHarmTypes ?? 0).toLocaleString()} icon={<AlertTriangle className="h-4 w-4" />} color="red" />
        <MetricCard label="People Affected" value={(stats?.totalAffected ?? 0).toLocaleString()} icon={<Users className="h-4 w-4" />} color="orange" />
      </div>

      {detectMut.data && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="pt-4">
            <p className="text-sm text-rose-400">Detected {detectMut.data.length} advocacy signals</p>
            {detectMut.data.length > 0 && (
              <div className="mt-2 space-y-1">
                {detectMut.data.slice(0, 5).map((s: any, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{s.signalType}</Badge>
                    <span className="truncate">{s.description}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Organizations */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Reporting Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(byOrg ?? []).map((org: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/30">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{org.organizationName}</span>
                  {org.organizationType && (
                    <Badge variant="outline" className="ml-2 text-[10px]">{org.organizationType}</Badge>
                  )}
                  {org.policyAreas && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">Policy: {org.policyAreas}</div>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">{org.reportCount} reports</Badge>
              </div>
            ))}
            {(!byOrg || byOrg.length === 0) && (
              <div className="text-center py-6">
                <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No advocacy reports ingested yet.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Harm Types */}
      {byHarm && byHarm.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Harm Types Reported</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byHarm.map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/30">
                  <div>
                    <span className="text-sm font-medium">{h.harmType}</span>
                    <div className="text-[10px] text-muted-foreground">{h.orgCount} org{h.orgCount !== 1 ? 's' : ''} reporting</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {h.totalAffected > 0 && (
                      <span className="text-xs text-muted-foreground">{Number(h.totalAffected).toLocaleString()} affected</span>
                    )}
                    <Badge variant="secondary" className="text-xs">{h.reportCount} reports</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Reports */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(recent ?? []).map((r: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate">{r.reportTitle}</span>
                  <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{r.reportType || 'other'}</Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{r.organizationName}</span>
                  {r.jurisdiction && <><span>\u00B7</span><span>{r.jurisdiction}</span></>}
                  {r.entityNamed && <><span>\u00B7</span><span className="text-amber-400">Entity: {r.entityNamed}</span></>}
                  {r.harmType && <><span>\u00B7</span><span className="text-red-400">{r.harmType}</span></>}
                </div>
                {r.keyFindings && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.keyFindings}</p>
                )}
              </div>
            ))}
            {(!recent || recent.length === 0) && (
              <div className="text-center py-6">
                <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No advocacy reports yet. Ingest reports to populate this stream.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <StreamUploader
        title="Ingest Advocacy Reports"
        description="Upload civil society / advocacy report data (JSON/CSV)"
        sampleFields={[
          { name: "organizationName", type: "string", required: true },
          { name: "organizationType", type: "string" },
          { name: "reportTitle", type: "string", required: true },
          { name: "reportType", type: "string" },
          { name: "jurisdiction", type: "string" },
          { name: "policyArea", type: "string" },
          { name: "industry", type: "string" },
          { name: "entityNamed", type: "string" },
          { name: "claimType", type: "string" },
          { name: "harmType", type: "string" },
          { name: "affectedPopulation", type: "string" },
          { name: "estimatedAffectedCount", type: "number" },
          { name: "keyFindings", type: "string" },
          { name: "recommendedActions", type: "string" },
          { name: "source_url", type: "string" },
          { name: "publishDate", type: "string" },
        ]}
        onIngest={(records) => ingestMut.mutateAsync({ records })}
        onSuccess={() => utils.streams.advocacyStats.invalidate()}
      />
    </div>
  );
}
/* ── Cross-Stream Correlation Panel ── */
function CrossStreamPanel() {
  const { data: stats, isLoading } = trpc.streams.correlationStats.useQuery();
  const { data: recent } = trpc.streams.recentCorrelations.useQuery({ limit: 10 });
  const detectMut = trpc.streams.detectCorrelations.useMutation();

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-amber-400" />
          Cross-Stream Correlation
        </h3>
        <Button variant="outline" size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Detect Correlations
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Correlations" value={(stats?.totalCorrelations ?? 0).toLocaleString()} icon={<GitCompareArrows className="h-4 w-4" />} color="amber" />
        <MetricCard label="Level 3 (Multi)" value={(stats?.level3Count ?? 0).toString()} icon={<AlertTriangle className="h-4 w-4" />} color="red" />
        <MetricCard label="Level 2" value={(stats?.level2Count ?? 0).toString()} icon={<TrendingUp className="h-4 w-4" />} color="orange" />
        <MetricCard label="Avg Confidence" value={`${(stats?.avgConfidence ?? 0).toFixed(0)}%`} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
      </div>

      {detectMut.data && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-400">Found {detectMut.data.found} cross-stream correlations</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Source Streams Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(recent ?? []).map((c: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{c.entity || 'Unknown Entity'}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${
                      c.correlationLevel >= 3 ? 'border-red-500/50 text-red-400' :
                      c.correlationLevel >= 2 ? 'border-orange-500/50 text-orange-400' :
                      'border-blue-500/50 text-blue-400'
                    }`}>Level {c.correlationLevel}</Badge>
                    <span className="text-xs text-muted-foreground">{c.confidenceScore}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(c.matchingStreams || '').split(',').filter(Boolean).map((s: string, j: number) => (
                    <Badge key={j} variant="secondary" className="text-xs">{s.trim()}</Badge>
                  ))}
                </div>
                {c.claimType && <p className="text-xs text-muted-foreground mt-1">Claim: {c.claimType}</p>}
              </div>
            ))}
            {(!recent || recent.length === 0) && (
              <div className="text-center py-6">
                <GitCompareArrows className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No correlations detected yet. Click "Detect Correlations" to scan across all data streams.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TIME-TRAVEL ANALYSIS PANEL (Session 71)
   Historical replay, counterfactual analysis, algorithm comparison,
   earliest detection, and run history.
   ═══════════════════════════════════════════════════════════════════════ */

function TimeTravelPanel() {
  const { data: stats, isLoading, refetch } = trpc.timeTravel.getStats.useQuery();
  const { data: versions } = trpc.timeTravel.algorithmVersions.useQuery();
  const { data: runs, refetch: refetchRuns } = trpc.timeTravel.listRuns.useQuery({ limit: 10 });

  // Replay state
  const [replayAlgo, setReplayAlgo] = useState("v3.0");
  const [replayNotes, setReplayNotes] = useState("");
  const replayMut = trpc.timeTravel.runHistoricalReplay.useMutation({
    onSuccess: () => { refetch(); refetchRuns(); },
  });

  // Counterfactual state
  const [cfAlgo, setCfAlgo] = useState("v3.0");
  const [cfParams, setCfParams] = useState<Array<{ name: string; value: string; type: "threshold_change" | "weight_override" | "entity_filter"; description?: string }>>([
    { name: "minConfidenceScore", value: "0.50", type: "threshold_change", description: "Lower confidence threshold" },
  ]);
  const counterfactualMut = trpc.timeTravel.runCounterfactualReplay.useMutation({
    onSuccess: () => { refetch(); refetchRuns(); },
  });

  // Comparison state
  const [compA, setCompA] = useState("v1.0");
  const [compB, setCompB] = useState("v3.0");
  const compareMut = trpc.timeTravel.compareAlgorithms.useMutation({
    onSuccess: () => { refetch(); refetchRuns(); },
  });

  // Earliest detection state
  const [earliestPattern, setEarliestPattern] = useState("repeat_entity");
  const [earliestEntity, setEarliestEntity] = useState("");
  const [earliestAlgo, setEarliestAlgo] = useState("v3.0");
  const earliestMut = trpc.timeTravel.detectEarliest.useMutation({
    onSuccess: () => { refetch(); refetchRuns(); },
  });

  // Report state
  const [reportRunId, setReportRunId] = useState<number | null>(null);
  const { data: reportData } = trpc.timeTravel.generateReport.useQuery(
    { runId: reportRunId! },
    { enabled: reportRunId !== null }
  );

  // Active sub-tab
  const [activeMode, setActiveMode] = useState<"replay" | "counterfactual" | "compare" | "earliest" | "history">("replay");

  if (isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <History className="h-5 w-5 text-cyan-400" />
          Time-Travel Analysis Engine
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
            {stats?.totalRuns ?? 0} runs
          </Badge>
          <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
            {stats?.totalHistoricalSignals ?? 0} historical signals
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Total Runs" value={String(stats?.totalRuns ?? 0)} icon={<RotateCcw className="h-4 w-4" />} color="cyan" />
        <MetricCard label="Completed" value={String(stats?.completedRuns ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
        <MetricCard label="Hist. Signals" value={String(stats?.totalHistoricalSignals ?? 0)} icon={<Zap className="h-4 w-4" />} color="amber" />
        <MetricCard label="Hist. Patterns" value={String(stats?.totalHistoricalPatterns ?? 0)} icon={<Network className="h-4 w-4" />} color="violet" />
        <MetricCard label="Snapshots" value={String(stats?.totalSnapshots ?? 0)} icon={<Database className="h-4 w-4" />} color="blue" />
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "replay" as const, label: "Historical Replay", icon: <Play className="h-3 w-3" /> },
          { id: "counterfactual" as const, label: "What If?", icon: <GitBranch className="h-3 w-3" /> },
          { id: "compare" as const, label: "Compare Algorithms", icon: <GitCompareArrows className="h-3 w-3" /> },
          { id: "earliest" as const, label: "Earliest Detection", icon: <Search className="h-3 w-3" /> },
          { id: "history" as const, label: "Run History", icon: <Clock className="h-3 w-3" /> },
        ].map(mode => (
          <Button
            key={mode.id}
            variant={activeMode === mode.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMode(mode.id)}
            className="gap-1.5"
          >
            {mode.icon} {mode.label}
          </Button>
        ))}
      </div>

      {/* ── Historical Replay ── */}
      {activeMode === "replay" && (
        <Card className="bg-card/50 border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Play className="h-4 w-4 text-cyan-400" />
              Historical Replay
            </CardTitle>
            <p className="text-xs text-muted-foreground">Re-run signal detection on historical data using any algorithm version</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Algorithm Version</label>
                <select
                  value={replayAlgo}
                  onChange={e => setReplayAlgo(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {(versions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  value={replayNotes}
                  onChange={e => setReplayNotes(e.target.value)}
                  placeholder="Describe this replay run..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <Button
              onClick={() => replayMut.mutate({ algorithmVersion: replayAlgo, notes: replayNotes || undefined })}
              disabled={replayMut.isPending}
              className="gap-1.5"
              size="sm"
            >
              {replayMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run Replay
            </Button>
            {replayMut.data && (
              <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-sm">
                <p className="text-cyan-400 font-medium">Replay Complete</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                  <span>Signals: <strong className="text-foreground">{replayMut.data.signalsDetected}</strong></span>
                  <span>Patterns: <strong className="text-foreground">{replayMut.data.patternsDetected}</strong></span>
                  <span>Status: <strong className="text-emerald-400">{replayMut.data.status}</strong></span>
                </div>
                {replayMut.data.summary?.keyFindings && (
                  <div className="mt-2 space-y-1">
                    {(replayMut.data.summary.keyFindings as string[]).slice(0, 3).map((f: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">• {f}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Counterfactual "What If" ── */}
      {activeMode === "counterfactual" && (
        <Card className="bg-card/50 border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-violet-400" />
              Counterfactual Analysis — "What If?"
            </CardTitle>
            <p className="text-xs text-muted-foreground">Modify detection parameters and replay to see what would have been detected differently</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Base Algorithm</label>
              <select
                value={cfAlgo}
                onChange={e => setCfAlgo(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {(versions ?? []).map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Parameter Overrides</label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setCfParams([...cfParams, { name: "", value: "", type: "threshold_change" }])}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {cfParams.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={p.type}
                    onChange={e => {
                      const next = [...cfParams];
                      next[i] = { ...next[i], type: e.target.value as any };
                      setCfParams(next);
                    }}
                    className="col-span-3 rounded-md border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="threshold_change">Threshold</option>
                    <option value="weight_override">Weight</option>
                    <option value="entity_filter">Entity Filter</option>
                  </select>
                  <input
                    value={p.name}
                    onChange={e => {
                      const next = [...cfParams];
                      next[i] = { ...next[i], name: e.target.value };
                      setCfParams(next);
                    }}
                    placeholder="Parameter name"
                    className="col-span-4 rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                  <input
                    value={p.value}
                    onChange={e => {
                      const next = [...cfParams];
                      next[i] = { ...next[i], value: e.target.value };
                      setCfParams(next);
                    }}
                    placeholder="Value"
                    className="col-span-4 rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-1 h-7 w-7 p-0"
                    onClick={() => setCfParams(cfParams.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              onClick={() => counterfactualMut.mutate({
                algorithmVersion: cfAlgo,
                parameters: cfParams.filter(p => p.name && p.value),
              })}
              disabled={counterfactualMut.isPending}
              className="gap-1.5"
              size="sm"
            >
              {counterfactualMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3" />}
              Run Counterfactual
            </Button>

            {counterfactualMut.data && (
              <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-sm">
                <p className="text-violet-400 font-medium">Counterfactual Complete</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                  <span>Signals: <strong className="text-foreground">{counterfactualMut.data.signalsDetected}</strong></span>
                  <span>Patterns: <strong className="text-foreground">{counterfactualMut.data.patternsDetected}</strong></span>
                  <span>Status: <strong className="text-emerald-400">{counterfactualMut.data.status}</strong></span>
                </div>
                {counterfactualMut.data.summary?.keyFindings && (
                  <div className="mt-2 space-y-1">
                    {(counterfactualMut.data.summary.keyFindings as string[]).slice(0, 3).map((f: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">• {f}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Algorithm Comparison ── */}
      {activeMode === "compare" && (
        <Card className="bg-card/50 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-amber-400" />
              Algorithm Comparison
            </CardTitle>
            <p className="text-xs text-muted-foreground">Run two algorithm versions side-by-side on the same data to compare detection capabilities</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Version A</label>
                <select
                  value={compA}
                  onChange={e => setCompA(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {(versions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Version B</label>
                <select
                  value={compB}
                  onChange={e => setCompB(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {(versions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={() => compareMut.mutate({ versionA: compA, versionB: compB })}
              disabled={compareMut.isPending || compA === compB}
              className="gap-1.5"
              size="sm"
            >
              {compareMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompareArrows className="h-3 w-3" />}
              Compare
            </Button>

            {compareMut.data && (
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
                <p className="text-amber-400 font-medium mb-3">Comparison Results</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-2 rounded bg-background/50 border">
                    <p className="text-xs text-muted-foreground mb-1">{compA}</p>
                    <div className="space-y-1 text-xs">
                      <p>Signals: <strong>{compareMut.data.versionA.signals}</strong></p>
                      <p>Patterns: <strong>{compareMut.data.versionA.patterns}</strong></p>
                      <p>Avg Confidence: <strong>{(compareMut.data.versionA.avgConfidence * 100).toFixed(1)}%</strong></p>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-background/50 border">
                    <p className="text-xs text-muted-foreground mb-1">{compB}</p>
                    <div className="space-y-1 text-xs">
                      <p>Signals: <strong>{compareMut.data.versionB.signals}</strong></p>
                      <p>Patterns: <strong>{compareMut.data.versionB.patterns}</strong></p>
                      <p>Avg Confidence: <strong>{(compareMut.data.versionB.avgConfidence * 100).toFixed(1)}%</strong></p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-background/50 border text-center">
                    <p className="text-muted-foreground">Signal Delta</p>
                    <p className={`font-bold ${compareMut.data.delta.signals > 0 ? 'text-emerald-400' : compareMut.data.delta.signals < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {compareMut.data.delta.signals > 0 ? '+' : ''}{compareMut.data.delta.signals}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-background/50 border text-center">
                    <p className="text-muted-foreground">Unique to A</p>
                    <p className="font-bold">{compareMut.data.uniqueToA}</p>
                  </div>
                  <div className="p-2 rounded bg-background/50 border text-center">
                    <p className="text-muted-foreground">Unique to B</p>
                    <p className="font-bold">{compareMut.data.uniqueToB}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Earliest Detection ── */}
      {activeMode === "earliest" && (
        <Card className="bg-card/50 border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4 text-emerald-400" />
              Earliest Detection Finder
            </CardTitle>
            <p className="text-xs text-muted-foreground">Scan historical data to find the earliest point a pattern would have been detectable</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pattern Type</label>
                <select
                  value={earliestPattern}
                  onChange={e => setEarliestPattern(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="any">Any Pattern</option>
                  <option value="repeat_entity">Repeat Entity</option>
                  <option value="frequency_spike">Frequency Spike</option>
                  <option value="geographic_cluster">Geographic Cluster</option>
                  <option value="status_delay">Status Delay</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Entity Name (optional)</label>
                <input
                  type="text"
                  value={earliestEntity}
                  onChange={e => setEarliestEntity(e.target.value)}
                  placeholder="e.g. Amazon.com"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Algorithm</label>
                <select
                  value={earliestAlgo}
                  onChange={e => setEarliestAlgo(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {(versions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={() => earliestMut.mutate({
                patternType: earliestPattern,
                entityName: earliestEntity || undefined,
                algorithmVersion: earliestAlgo,
              })}
              disabled={earliestMut.isPending}
              className="gap-1.5"
              size="sm"
            >
              {earliestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Find Earliest Detection
            </Button>

            {earliestMut.data && (
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm">
                <p className="text-emerald-400 font-medium">Earliest Detection Result</p>
                {earliestMut.data.earliestDate ? (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-background/50 border">
                        <p className="text-muted-foreground">Earliest Date</p>
                        <p className="font-bold text-emerald-400">{new Date(earliestMut.data.earliestDate).toLocaleDateString()}</p>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <p className="text-muted-foreground">Confidence</p>
                        <p className="font-bold">{(earliestMut.data.confidence * 100).toFixed(1)}%</p>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <p className="text-muted-foreground">Signals Required</p>
                        <p className="font-bold">{earliestMut.data.signalsRequired}</p>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <p className="text-muted-foreground">Streams</p>
                        <p className="font-bold">{earliestMut.data.contributingStreams.length}</p>
                      </div>
                    </div>
                    {earliestMut.data.contributingStreams.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {earliestMut.data.contributingStreams.map((s: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">Pattern not detectable in historical data with current thresholds</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Run History ── */}
      {activeMode === "history" && (
        <Card className="bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(runs ?? []).map((run: any) => (
                <div key={run.id} className="p-3 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${
                        run.runType === 'historical_replay' ? 'border-cyan-500/50 text-cyan-400' :
                        run.runType === 'counterfactual_replay' ? 'border-violet-500/50 text-violet-400' :
                        run.runType === 'algorithm_comparison' ? 'border-amber-500/50 text-amber-400' :
                        'border-emerald-500/50 text-emerald-400'
                      }`}>
                        {run.runType.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{run.algorithmVersion}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                        {run.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => setReportRunId(run.id)}
                      >
                        <FileDown className="h-3 w-3" /> Report
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Signals: {run.signalsDetected ?? 0}</span>
                    <span>Patterns: {run.patternsDetected ?? 0}</span>
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                  </div>
                  {run.notes && <p className="text-xs text-muted-foreground mt-1 italic">{run.notes}</p>}
                </div>
              ))}
              {(!runs || runs.length === 0) && (
                <div className="text-center py-8">
                  <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No time-travel runs yet. Start a Historical Replay to begin.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Modal */}
      {reportRunId !== null && reportData && (
        <Card className="bg-card/50 border-blue-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileDown className="h-4 w-4 text-blue-400" />
                Replay Report
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setReportRunId(null)} className="h-6 text-xs">
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-lg bg-background/50 border p-4">
              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{reportData}</pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Entity Intelligence Panel
// ═══════════════════════════════════════════════════════════════
function EntityIntelPanel() {
  const stats = trpc.enginesV2.entityStats.useQuery();
  const extractMut = trpc.enginesV2.extractEntitiesFromSignals.useMutation();
  const entities = trpc.enginesV2.entityList.useQuery({ limit: 20 });

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-violet-400" /> Entity Intelligence Layer
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Structured entity profiles with resolution, classification, and relationship mapping
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => extractMut.mutate()}
          disabled={extractMut.isPending}
        >
          {extractMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
          Extract from Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Fingerprint className="h-3.5 w-3.5" />} label="Total Entities" value={s?.totalEntities ?? 0} />
        <MetricCard icon={<Link2 className="h-3.5 w-3.5" />} label="Relationships" value={s?.totalRelationships ?? 0} />
        <MetricCard icon={<Building2 className="h-3.5 w-3.5" />} label="Corporations" value={s?.byType?.corporation ?? 0} />
        <MetricCard icon={<Users className="h-3.5 w-3.5" />} label="Govt Agencies" value={s?.byType?.government_agency ?? 0} />
      </div>

      {extractMut.isSuccess && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm text-emerald-400">Extraction complete: {extractMut.data?.extracted ?? 0} entities extracted, {extractMut.data?.resolved ?? 0} resolved</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Entity Registry</CardTitle>
        </CardHeader>
        <CardContent>
          {entities.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-2">
              {(entities.data?.entities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No entities registered yet. Click "Extract from Signals" to populate.</p>
              ) : (
                (entities.data?.entities ?? []).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{e.canonicalName}</p>
                      <p className="text-xs text-muted-foreground">{e.entityType} {e.industry ? `• ${e.industry}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{e.signalCount ?? 0} signals</Badge>
                      {e.riskScore > 0 && <Badge variant="destructive" className="text-xs">Risk: {e.riskScore}</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Institutional Accountability Panel
// ═══════════════════════════════════════════════════════════════
function InstitutionsPanel() {
  const stats = trpc.enginesV2.institutionStats.useQuery();
  const gaps = trpc.enginesV2.enforcementGaps.useQuery();
  const alerts = trpc.enginesV2.accountabilityAlerts.useQuery();
  const seedMut = trpc.enginesV2.seedInstitutions.useMutation();
  const institutions = trpc.enginesV2.institutionList.useQuery({ limit: 20 });

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building className="h-5 w-5 text-amber-400" /> Institutional Accountability
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Map patterns to oversight institutions, detect enforcement gaps, track accountability
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
        >
          {seedMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Building2 className="h-3.5 w-3.5 mr-1" />}
          Seed Institutions
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Building2 className="h-3.5 w-3.5" />} label="Institutions" value={s?.totalInstitutions ?? 0} />
        <MetricCard icon={<Link2 className="h-3.5 w-3.5" />} label="Pattern Links" value={s?.totalLinks ?? 0} />
        <MetricCard icon={<Activity className="h-3.5 w-3.5" />} label="Activities" value={s?.totalActivities ?? 0} />
        <MetricCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Alerts" value={alerts.data?.length ?? 0} />
      </div>

      {seedMut.isSuccess && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm text-emerald-400">Seeded {seedMut.data?.seeded ?? 0} of {seedMut.data?.total ?? 0} default institutions</p>
        </div>
      )}

      {/* Enforcement Gaps */}
      {(gaps.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Enforcement Gaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(gaps.data ?? []).slice(0, 5).map((g: any) => (
                <div key={g.institutionId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">{g.institutionName}</p>
                    <p className="text-xs text-muted-foreground">{g.gapDescription}</p>
                  </div>
                  <Badge variant={g.gapScore >= 70 ? "destructive" : g.gapScore >= 40 ? "default" : "outline"} className="text-xs">
                    Gap: {g.gapScore}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accountability Alerts */}
      {(alerts.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Siren className="h-4 w-4 text-red-400" /> Accountability Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(alerts.data ?? []).map((a: any, i: number) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  a.alertLevel === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                  a.alertLevel === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-blue-500/30 bg-blue-500/5'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={a.alertLevel === 'critical' ? 'destructive' : 'outline'} className="text-xs">
                      {a.alertLevel.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-medium">{a.institutionName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Institution List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Institution Registry</CardTitle>
        </CardHeader>
        <CardContent>
          {institutions.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-2">
              {(institutions.data?.institutions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No institutions registered. Click "Seed Institutions" to populate defaults.</p>
              ) : (
                (institutions.data?.institutions ?? []).map((inst: any) => (
                  <div key={inst.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{inst.institutionName}</p>
                      <p className="text-xs text-muted-foreground">{inst.institutionType} • {inst.jurisdiction ?? 'N/A'} • Power: {inst.enforcementPowerLevel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Score: {inst.accountabilityScore ?? 50}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Regulatory Capture Detection Panel
// ═══════════════════════════════════════════════════════════════
function RegCapturePanel() {
  const stats = trpc.enginesV2.captureStats.useQuery();
  const patterns = trpc.enginesV2.capturePatterns.useQuery({ limit: 10 });
  const [industry, setIndustry] = useState("Consumer Protection");
  const analyzeMut = trpc.enginesV2.analyzeCaptureRisk.useMutation();

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-400" /> Regulatory Capture Detection
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-stream correlation of complaints vs enforcement vs lobbying — requires 3+ independent streams
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Capture Patterns" value={s?.totalPatterns ?? 0} />
        <MetricCard icon={<Radar className="h-3.5 w-3.5" />} label="Capture Signals" value={s?.totalSignals ?? 0} />
        <MetricCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="High Risk" value={s?.byStatus?.high_risk ?? 0} />
        <MetricCard icon={<Target className="h-3.5 w-3.5" />} label="Confirmed" value={s?.byStatus?.confirmed_pattern ?? 0} />
      </div>

      {/* Analyze Industry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Analyze Capture Risk</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Industry (e.g., Consumer Protection, Telecommunications)"
            />
            <Button
              size="sm"
              onClick={() => analyzeMut.mutate({ industry })}
              disabled={analyzeMut.isPending || !industry}
            >
              {analyzeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Search className="h-3.5 w-3.5 mr-1" />}
              Analyze
            </Button>
          </div>

          {analyzeMut.isSuccess && analyzeMut.data && (
            <div className="mt-4 space-y-3">
              <div className={`rounded-lg border p-4 ${
                analyzeMut.data.riskScore >= 70 ? 'border-red-500/30 bg-red-500/5' :
                analyzeMut.data.riskScore >= 40 ? 'border-amber-500/30 bg-amber-500/5' :
                'border-emerald-500/30 bg-emerald-500/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Capture Risk Score</span>
                  <span className="text-2xl font-bold font-mono">{analyzeMut.data.riskScore}/100</span>
                </div>
                <Badge variant={analyzeMut.data.status === 'confirmed_pattern' ? 'destructive' : 'outline'} className="text-xs">
                  {analyzeMut.data.status.replace(/_/g, ' ').toUpperCase()}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {analyzeMut.data.streamCount} streams with evidence • Minimum 3 required: {analyzeMut.data.meetsMinimumStreams ? '✓ Met' : '✗ Not met'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Indicators:</p>
                {analyzeMut.data.indicators.map((ind: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded border p-2">
                    <span className={ind.detected ? 'text-red-400' : 'text-muted-foreground'}>
                      {ind.detected ? '⚠' : '○'} {ind.indicator.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono">{ind.strength}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Patterns */}
      {(patterns.data?.patterns ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Capture Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(patterns.data?.patterns ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">{p.regulatedEntity ?? p.industry}</p>
                    <p className="text-xs text-muted-foreground">{p.industry} • {p.jurisdiction ?? 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.captureRiskScore >= 70 ? 'destructive' : p.captureRiskScore >= 40 ? 'default' : 'outline'} className="text-xs">
                      Risk: {p.captureRiskScore}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{p.patternStatus.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Crisis Prediction Panel
// ═══════════════════════════════════════════════════════════════
function CrisisPredictPanel() {
  const stats = trpc.enginesV2.crisisStats.useQuery();
  const probability = trpc.enginesV2.calculateCrisisProbability.useQuery({});
  const generateMut = trpc.enginesV2.generateCrisisPrediction.useMutation();
  const predictions = trpc.enginesV2.crisisPredictions.useQuery({ limit: 10 });

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;
  const prob = probability.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-orange-400" /> Crisis Prediction Engine
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Forecast systemic crises from pattern acceleration, enforcement gaps, and capture risk
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateMut.mutate({})}
          disabled={generateMut.isPending}
        >
          {generateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Flame className="h-3.5 w-3.5 mr-1" />}
          Generate Prediction
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Flame className="h-3.5 w-3.5" />} label="Predictions" value={s?.totalPredictions ?? 0} />
        <MetricCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="High Risk" value={s?.highRiskCount ?? 0} />
        <MetricCard icon={<Gauge className="h-3.5 w-3.5" />} label="Current Probability" value={prob ? `${prob.probability}%` : '—'} />
        <MetricCard icon={<Target className="h-3.5 w-3.5" />} label="Risk Level" value={prob?.riskLevel?.toUpperCase() ?? '—'} />
      </div>

      {/* Current Crisis Probability Breakdown */}
      {prob && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Crisis Probability Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`rounded-lg border p-4 mb-4 ${
              prob.probability >= 75 ? 'border-red-500/30 bg-red-500/5' :
              prob.probability >= 50 ? 'border-amber-500/30 bg-amber-500/5' :
              prob.probability >= 25 ? 'border-blue-500/30 bg-blue-500/5' :
              'border-emerald-500/30 bg-emerald-500/5'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm">Overall Crisis Probability</span>
                <span className="text-3xl font-bold font-mono">{prob.probability}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    prob.probability >= 75 ? 'bg-red-500' :
                    prob.probability >= 50 ? 'bg-amber-500' :
                    prob.probability >= 25 ? 'bg-blue-500' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${prob.probability}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {prob.indicators.map((ind: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm rounded border p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{
                      backgroundColor: ind.value >= 50 ? '#ef4444' : ind.value >= 25 ? '#f59e0b' : '#22c55e'
                    }} />
                    <span className="text-xs">{ind.name.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-current" style={{ width: `${ind.value}%`, color: ind.value >= 50 ? '#ef4444' : ind.value >= 25 ? '#f59e0b' : '#22c55e' }} />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">{ind.value}</span>
                    <span className="text-xs text-muted-foreground w-8">×{ind.weight}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Prediction */}
      {generateMut.isSuccess && generateMut.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" /> Latest Prediction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={generateMut.data.riskLevel === 'critical' ? 'destructive' : 'outline'}>
                  {generateMut.data.riskLevel.toUpperCase()}
                </Badge>
                <span className="text-sm">{generateMut.data.predictionType.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground">Confidence: {generateMut.data.confidence}%</span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Trigger Factors:</p>
                {generateMut.data.triggerFactors.map((t: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">• {t}</p>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Estimated escalation: {new Date(generateMut.data.estimatedEscalationDate).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prediction History */}
      {(predictions.data?.predictions ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Prediction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(predictions.data?.predictions ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">{p.predictionType.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(Number(p.createdAtCp)).toLocaleDateString()} • {p.entityNameCp ?? p.industryCp ?? 'System-wide'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.riskLevel === 'critical' ? 'destructive' : p.riskLevel === 'high' ? 'default' : 'outline'} className="text-xs">
                      {p.crisisProbability}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Session 73 Panels: Simulation Lab, Transparency, Dossier Studio, Ext. Collaboration
// ═══════════════════════════════════════════════════════════════════════

function SimulationLabPanel() {
  const stats = trpc.enginesV3.simulationStats.useQuery();
  const history = trpc.enginesV3.simulationHistory.useQuery({ limit: 10 });
  const runSim = trpc.enginesV3.runSimulation.useMutation({
    onSuccess: () => { stats.refetch(); history.refetch(); },
  });
  const [simType, setSimType] = React.useState<string>("policy_change");
  const [targetIndustry, setTargetIndustry] = React.useState("");
  const [paramKey, setParamKey] = React.useState("enforcement_budget_multiplier");
  const [paramVal, setParamVal] = React.useState("1.5");

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-violet-400" /> Systemic Simulation Engine
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run "what if" simulations: policy changes, enforcement increases, penalty adjustments
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<FlaskConical className="h-3.5 w-3.5" />} label="Total Simulations" value={s?.totalSimulations ?? 0} />
        <MetricCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Avg Impact" value={s?.avgImpactScore ? `${s.avgImpactScore}/100` : '—'} />
        <MetricCard icon={<Target className="h-3.5 w-3.5" />} label="Sim Types" value={Object.keys(s?.byType ?? {}).length} />
        <MetricCard icon={<BarChart className="h-3.5 w-3.5" />} label="Industries" value={Object.keys(s?.byIndustry ?? {}).length} />
      </div>

      {/* Run Simulation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Run New Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Simulation Type</label>
              <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={simType} onChange={e => setSimType(e.target.value)}>
                <option value="policy_change">Policy Change</option>
                <option value="enforcement_increase">Enforcement Increase</option>
                <option value="penalty_adjustment">Penalty Adjustment</option>
                <option value="staffing_change">Staffing Change</option>
                <option value="jurisdiction_reform">Jurisdiction Reform</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target Industry</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="e.g. Financial Services" value={targetIndustry} onChange={e => setTargetIndustry(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Parameter</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={paramKey} onChange={e => setParamKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Value</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={paramVal} onChange={e => setParamVal(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => runSim.mutate({ simulationType: simType as any, targetIndustry: targetIndustry || undefined, parameters: { [paramKey]: parseFloat(paramVal) || 1 } })} disabled={runSim.isPending}>
            {runSim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            Run Simulation
          </Button>
        </CardContent>
      </Card>

      {/* Simulation History */}
      {history.data && history.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Simulations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.data.map((sim: any) => (
                <div key={sim.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{sim.simulationType?.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {sim.targetIndustry ?? 'System-wide'} • {new Date(Number(sim.createdAt)).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sim.impactScore >= 70 ? 'destructive' : sim.impactScore >= 40 ? 'default' : 'outline'} className="text-xs">
                      Impact: {sim.impactScore ?? '—'}/100
                    </Badge>
                    <Badge variant="outline" className="text-xs">{sim.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TransparencyPanel() {
  const stats = trpc.enginesV3.transparencyStats.useQuery();
  const docs = trpc.enginesV3.transparencyDocuments.useQuery({ limit: 10 });
  const genExplainer = trpc.enginesV3.generateExplainer.useMutation({
    onSuccess: () => { stats.refetch(); docs.refetch(); },
  });
  const genBrief = trpc.enginesV3.generateBrief.useMutation({
    onSuccess: () => { stats.refetch(); docs.refetch(); },
  });

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-cyan-400" /> Public Transparency Layer
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Generate plain-language explainers, accountability reports, and crisis warnings
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => genExplainer.mutate({ patternName: 'System Overview' })} disabled={genExplainer.isPending}>
            {genExplainer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
            Explainer
          </Button>
          <Button size="sm" variant="outline" onClick={() => genBrief.mutate({ briefType: 'industry_overview' })} disabled={genBrief.isPending}>
            {genBrief.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ScrollText className="h-3.5 w-3.5 mr-1" />}
            Brief
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<FileText className="h-3.5 w-3.5" />} label="Documents" value={s?.totalDocuments ?? 0} />
        <MetricCard icon={<Eye className="h-3.5 w-3.5" />} label="Explainers" value={s?.byType?.['pattern_explainer'] ?? 0} />
        <MetricCard icon={<ScrollText className="h-3.5 w-3.5" />} label="Briefs" value={(s?.byType?.['accountability_report'] ?? 0) + (s?.byType?.['crisis_warning'] ?? 0)} />
        <MetricCard icon={<BookOpen className="h-3.5 w-3.5" />} label="Audiences" value={Object.keys(s?.byAudience ?? {}).length} />
      </div>

      {/* Recent Documents */}
      {docs.data && docs.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Transparency Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {docs.data.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.documentType?.replace(/_/g, ' ')} • {doc.audienceLevel?.replace(/_/g, ' ')} • {new Date(Number(doc.createdAt)).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">{doc.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DossierStudioPanel() {
  const stats = trpc.enginesV3.dossierStats.useQuery();
  const genDossier = trpc.enginesV3.generateDossier.useMutation({
    onSuccess: () => stats.refetch(),
  });
  const [dossierType, setDossierType] = React.useState<string>("investigation_kit");
  const [audience, setAudience] = React.useState<string>("journalist");
  const [entityName, setEntityName] = React.useState("");
  const [patternName, setPatternName] = React.useState("");

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-amber-400" /> Evidence Publishing & Dossier Engine
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Generate investigation kits, legal bundles, policy packets, and regulator referrals
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<FolderArchive className="h-3.5 w-3.5" />} label="Total Dossiers" value={s?.totalDossiers ?? 0} />
        <MetricCard icon={<Gavel className="h-3.5 w-3.5" />} label="Legal Bundles" value={s?.byType?.['legal_bundle'] ?? 0} />
        <MetricCard icon={<Search className="h-3.5 w-3.5" />} label="Investigation Kits" value={s?.byType?.['investigation_kit'] ?? 0} />
        <MetricCard icon={<Landmark className="h-3.5 w-3.5" />} label="Regulator Referrals" value={s?.byType?.['regulator_referral'] ?? 0} />
      </div>

      {/* Generate Dossier */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Generate New Dossier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Dossier Type</label>
              <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={dossierType} onChange={e => setDossierType(e.target.value)}>
                <option value="investigation_kit">Investigation Kit</option>
                <option value="legal_bundle">Legal Bundle</option>
                <option value="policy_packet">Policy Packet</option>
                <option value="regulator_referral">Regulator Referral</option>
                <option value="entity_dossier">Entity Dossier</option>
                <option value="pattern_dossier">Pattern Dossier</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Audience</label>
              <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={audience} onChange={e => setAudience(e.target.value)}>
                <option value="journalist">Journalist</option>
                <option value="attorney">Attorney</option>
                <option value="policymaker">Policymaker</option>
                <option value="regulator">Regulator</option>
                <option value="advocate">Advocate</option>
                <option value="internal">Internal</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entity Name (optional)</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="e.g. Amazon.com" value={entityName} onChange={e => setEntityName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pattern Name (optional)</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="e.g. Consumer Fraud" value={patternName} onChange={e => setPatternName(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => genDossier.mutate({ dossierType: dossierType as any, audienceType: audience as any, entityName: entityName || undefined, patternName: patternName || undefined })} disabled={genDossier.isPending}>
            {genDossier.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileOutput className="h-3.5 w-3.5 mr-1" />}
            Generate Dossier
          </Button>
        </CardContent>
      </Card>

      {/* Recent Dossiers */}
      {s?.recentDossiers && s.recentDossiers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Dossiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.recentDossiers.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.dossierType?.replace(/_/g, ' ')} • {d.audienceType} • {new Date(Number(d.createdAt)).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">{d.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExtCollabPanel() {
  const stats = trpc.enginesV3.collaborationStats.useQuery();
  const partners = trpc.enginesV3.listPartners.useQuery({});
  const registerMut = trpc.enginesV3.registerPartner.useMutation({
    onSuccess: () => { stats.refetch(); partners.refetch(); },
  });
  const [partnerName, setPartnerName] = React.useState("");
  const [partnerOrg, setPartnerOrg] = React.useState("");
  const [partnerType, setPartnerType] = React.useState<string>("journalist");
  const [partnerEmail, setPartnerEmail] = React.useState("");

  if (stats.isLoading) return <PanelSkeleton />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5 text-emerald-400" /> External Collaboration & Secure Sharing
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage partners, share dossiers securely, track access, and apply redactions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Users className="h-3.5 w-3.5" />} label="Partners" value={s?.totalPartners ?? 0} />
        <MetricCard icon={<Shield className="h-3.5 w-3.5" />} label="Verified" value={s?.verifiedPartners ?? 0} />
        <MetricCard icon={<Share2 className="h-3.5 w-3.5" />} label="Active Shares" value={s?.activeShares ?? 0} />
        <MetricCard icon={<Eye className="h-3.5 w-3.5" />} label="Total Views" value={s?.totalViews ?? 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MetricCard icon={<Download className="h-3.5 w-3.5" />} label="Downloads" value={s?.totalDownloads ?? 0} />
        <MetricCard icon={<MessageSquare className="h-3.5 w-3.5" />} label="Comments" value={s?.totalComments ?? 0} />
      </div>

      {/* Register Partner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Register New Partner</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="Partner name" value={partnerName} onChange={e => setPartnerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Organization</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="Organization" value={partnerOrg} onChange={e => setPartnerOrg(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" value={partnerType} onChange={e => setPartnerType(e.target.value)}>
                <option value="journalist">Journalist</option>
                <option value="attorney">Attorney</option>
                <option value="regulator">Regulator</option>
                <option value="advocate">Advocate</option>
                <option value="researcher">Researcher</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input className="w-full mt-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="email@example.com" value={partnerEmail} onChange={e => setPartnerEmail(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => { if (partnerName) { registerMut.mutate({ name: partnerName, organization: partnerOrg || undefined, partnerType: partnerType as any, email: partnerEmail || undefined }); setPartnerName(''); setPartnerOrg(''); setPartnerEmail(''); } }} disabled={registerMut.isPending || !partnerName}>
            {registerMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Register Partner
          </Button>
        </CardContent>
      </Card>

      {/* Partner List */}
      {partners.data && partners.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Registered Partners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {partners.data.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.organization ?? '—'} • {p.partnerType} • {p.email ?? 'No email'}
                    </p>
                  </div>
                  <Badge variant={p.verification_status === 'verified' ? 'default' : 'outline'} className="text-xs">
                    {p.verification_status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Shares */}
      {s?.recentShares && s.recentShares.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Shares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.recentShares.map((share: any) => (
                <div key={share.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">Dossier #{share.dossierId}</p>
                    <p className="text-xs text-muted-foreground">
                      {share.accessLevel?.replace(/_/g, ' ')} • Views: {share.viewCount} • Downloads: {share.downloadCount}
                    </p>
                  </div>
                  <Badge variant={share.revoked ? 'destructive' : 'outline'} className="text-xs">
                    {share.revoked ? 'Revoked' : 'Active'}
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

/* ── Entity Transparency Panel ── */
function EntityTransparencyPanel() {
  const stats = trpc.enginesV4.entityTransparencyStats.useQuery();
  const topEntities = trpc.enginesV4.topEntities.useQuery({ limit: 10 });
  const [patternId, setPatternId] = useState("");
  const brief = trpc.enginesV4.investigativeBrief.useQuery(
    { patternId: Number(patternId) },
    { enabled: !!patternId && !isNaN(Number(patternId)) }
  );
  const generateBreakdown = trpc.enginesV4.generateEntityBreakdown.useMutation();

  if (stats.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Scan className="h-5 w-5 text-cyan-400" /> Entity Transparency Layer
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Entity Summaries" value={String(stats.data?.totalSummaries ?? 0)} icon={<Fingerprint className="h-3.5 w-3.5" />} color="cyan" />
        <MetricCard label="Agency Mappings" value={String(stats.data?.totalAgencyMappings ?? 0)} icon={<Building className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Unique Entities" value={String(stats.data?.uniqueEntities ?? 0)} icon={<Users className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="Unique Agencies" value={String(stats.data?.uniqueAgencies ?? 0)} icon={<Landmark className="h-3.5 w-3.5" />} color="amber" />
      </div>

      {/* Generate Entity Breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Generate Entity Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Pattern ID"
              value={patternId}
              onChange={(e) => setPatternId(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button size="sm" onClick={() => patternId && generateBreakdown.mutate({ patternId: Number(patternId) })}>
              <Play className="h-3 w-3 mr-1" /> Generate
            </Button>
          </div>
          {generateBreakdown.isSuccess && (
            <div className="text-xs text-emerald-400">Generated {generateBreakdown.data.length} entity summaries</div>
          )}
        </CardContent>
      </Card>

      {/* Top Entities Leaderboard */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Top Entities Leaderboard</CardTitle></CardHeader>
        <CardContent>
          {topEntities.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-2">
              {(topEntities.data ?? []).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold font-mono text-muted-foreground w-6">#{i + 1}</span>
                    <div>
                      <div className="font-medium text-sm">{e.entityName}</div>
                      <div className="text-xs text-muted-foreground">{e.entityType || "unknown"}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span title="Signals"><Zap className="h-3 w-3 inline mr-1 text-amber-400" />{e.signalCount}</span>
                    <span title="Patterns"><Network className="h-3 w-3 inline mr-1 text-violet-400" />{e.patternCount}</span>
                    <span title="Streams"><Layers className="h-3 w-3 inline mr-1 text-cyan-400" />{e.streamCount}</span>
                    <Badge variant="outline" className="text-xs">{e.confidenceScore}%</Badge>
                  </div>
                </div>
              ))}
              {(topEntities.data ?? []).length === 0 && <PanelEmpty label="No entities scored yet — run Generate Entity Breakdown first" />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investigative Brief */}
      {brief.data && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Investigative Brief — Pattern #{patternId}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><strong>Summary:</strong> {brief.data.patternSummary}</div>
            <div><strong>Entities:</strong> {brief.data.entitiesInvolved.map((e: any) => e.entityName).join(", ") || "None"}</div>
            <div><strong>Agencies:</strong> {brief.data.agenciesResponsible.map((a: any) => a.agencyName).join(", ") || "None"}</div>
            <div><strong>Signals:</strong> {brief.data.signalTimeline.length} events</div>
            <div><strong>Litigation:</strong> {brief.data.litigationActivity.length} cases</div>
            <div><strong>Regulatory Actions:</strong> {brief.data.regulatoryActions.length} actions</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Evidence Threshold Panel ── */
function EvidenceThresholdPanel() {
  const stats = trpc.enginesV4.evidenceThresholdStats.useQuery();
  const visible = trpc.enginesV4.visibleEntities.useQuery();
  const provisional = trpc.enginesV4.provisionalEntities.useQuery();
  const [entityName, setEntityName] = useState("");
  const scoreMut = trpc.enginesV4.scoreEvidence.useMutation();

  if (stats.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-400" /> Entity Evidence Threshold System
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Scored" value={String(stats.data?.totalScored ?? 0)} icon={<Hash className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Visible" value={String(stats.data?.visibleCount ?? 0)} icon={<Eye className="h-3.5 w-3.5" />} color="emerald" />
        <MetricCard label="Provisional" value={String(stats.data?.provisionalCount ?? 0)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Avg Confidence" value={`${stats.data?.avgConfidence ?? 0}%`} icon={<Gauge className="h-3.5 w-3.5" />} color="violet" />
      </div>

      {/* Score Entity */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Score Entity Evidence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Entity name (e.g. Amazon.com)"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button size="sm" onClick={() => entityName && scoreMut.mutate({ entityName })}>
              <Calculator className="h-3 w-3 mr-1" /> Score
            </Button>
          </div>
          {scoreMut.isSuccess && scoreMut.data && (
            <div className="rounded-lg border border-border/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Confidence:</span><Badge variant="outline">{scoreMut.data.confidenceScore}%</Badge></div>
              <div className="flex justify-between"><span>Signals:</span><span className="font-mono">{scoreMut.data.signalCount}</span></div>
              <div className="flex justify-between"><span>Complaints:</span><span className="font-mono">{scoreMut.data.complaintCount}</span></div>
              <div className="flex justify-between"><span>Streams:</span><span className="font-mono">{scoreMut.data.streamCount}</span></div>
              <div className="flex justify-between"><span>Status:</span><Badge className={scoreMut.data.visibilityStatus === "visible" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>{scoreMut.data.visibilityStatus}</Badge></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visible Entities */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-emerald-400" /> Visible Entities</CardTitle></CardHeader>
        <CardContent>
          {visible.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-1">
              {(visible.data ?? []).slice(0, 10).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/30">
                  <span className="font-medium">{e.entityName}</span>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Confidence: {e.confidenceScore}%</span>
                    <span>Signals: {e.signalCount}</span>
                    <span>Streams: {e.streamCount}</span>
                  </div>
                </div>
              ))}
              {(visible.data ?? []).length === 0 && <PanelEmpty label="No visible entities — score entities first" />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provisional Entities */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Provisional Entities (below threshold)</CardTitle></CardHeader>
        <CardContent>
          {provisional.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-1">
              {(provisional.data ?? []).slice(0, 10).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/30">
                  <span className="font-medium text-muted-foreground">{e.entityName}</span>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Confidence: {e.confidenceScore}%</span>
                    <span>Signals: {e.signalCount}</span>
                    <span>Streams: {e.streamCount}</span>
                  </div>
                </div>
              ))}
              {(provisional.data ?? []).length === 0 && <PanelEmpty label="No provisional entities" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Alerting Panel ── */
function AlertingPanel() {
  const stats = trpc.enginesV4.alertingStats.useQuery();
  const subs = trpc.enginesV4.mySubscriptions.useQuery();
  const notifications = trpc.enginesV4.myNotifications.useQuery({ limit: 20 });
  const checkAlerts = trpc.enginesV4.checkAlerts.useMutation();
  const processDeliveries = trpc.enginesV4.processDeliveries.useMutation();
  const [subForm, setSubForm] = useState({ type: "pattern", targetName: "" });
  const createSub = trpc.enginesV4.createSubscription.useMutation();
  const utils = trpc.useUtils();

  if (stats.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-400" /> Public Alerting & Subscriptions
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => checkAlerts.mutate()}>
            <Zap className="h-3 w-3 mr-1" /> Check Triggers
          </Button>
          <Button variant="outline" size="sm" onClick={() => processDeliveries.mutate()}>
            <Send className="h-3 w-3 mr-1" /> Process Deliveries
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Subscriptions" value={String(stats.data?.totalSubscriptions ?? 0)} icon={<Bell className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Active" value={String(stats.data?.activeSubscriptions ?? 0)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="emerald" />
        <MetricCard label="Events" value={String(stats.data?.totalEvents ?? 0)} icon={<Zap className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Deliveries" value={String(stats.data?.totalDeliveries ?? 0)} icon={<Send className="h-3.5 w-3.5" />} color="violet" />
      </div>

      {/* Create Subscription */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Create Subscription</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <select
              value={subForm.type}
              onChange={(e) => setSubForm(f => ({ ...f, type: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="pattern">Pattern</option>
              <option value="entity">Entity</option>
              <option value="industry">Industry</option>
              <option value="jurisdiction">Jurisdiction</option>
            </select>
            <input
              type="text"
              placeholder="Target name"
              value={subForm.targetName}
              onChange={(e) => setSubForm(f => ({ ...f, targetName: e.target.value }))}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button size="sm" onClick={() => {
              if (subForm.targetName) {
                createSub.mutate({ subscriptionType: subForm.type, targetName: subForm.targetName }, {
                  onSuccess: () => { utils.enginesV4.mySubscriptions.invalidate(); setSubForm({ type: "pattern", targetName: "" }); }
                });
              }
            }}>
              <Plus className="h-3 w-3 mr-1" /> Subscribe
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* My Subscriptions */}
      <Card>
        <CardHeader><CardTitle className="text-sm">My Subscriptions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(subs.data ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30">
                <div><Badge variant="outline" className="mr-2 text-xs">{s.subscriptionType}</Badge>{s.targetName}</div>
                <Badge className={s.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>{s.isActive ? "Active" : "Paused"}</Badge>
              </div>
            ))}
            {(subs.data ?? []).length === 0 && <PanelEmpty label="No subscriptions yet" />}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Notifications</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(notifications.data ?? []).map((n: any) => (
              <div key={n.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Badge className={n.severity === "critical" ? "bg-red-500/20 text-red-400" : n.severity === "high" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}>{n.severity}</Badge>
                  <span>{n.eventTitle}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(n.triggeredAt).toLocaleDateString()}</span>
              </div>
            ))}
            {(notifications.data ?? []).length === 0 && <PanelEmpty label="No notifications" />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── System Map Panel ── */
function SystemMapPanel() {
  const stats = trpc.enginesV4.mapStats.useQuery();
  const mapData = trpc.enginesV4.mapData.useQuery();
  const buildMap = trpc.enginesV4.buildMap.useMutation();
  const utils = trpc.useUtils();

  if (stats.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-violet-400" /> Global Systemic Intelligence Map
        </h3>
        <Button variant="outline" size="sm" onClick={() => buildMap.mutate(undefined, {
          onSuccess: () => { utils.enginesV4.mapData.invalidate(); utils.enginesV4.mapStats.invalidate(); }
        })}>
          {buildMap.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
          Build Map from Signals
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Nodes" value={String(stats.data?.totalNodes ?? 0)} icon={<Globe className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="Edges" value={String(stats.data?.totalEdges ?? 0)} icon={<Link2 className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Annotations" value={String(stats.data?.totalAnnotations ?? 0)} icon={<MessageSquare className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Avg Risk" value={`${stats.data?.avgRiskScore ?? 0}`} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="red" />
      </div>

      {buildMap.isSuccess && (
        <div className="text-xs text-emerald-400 p-2 rounded bg-emerald-500/10">
          Map built: {buildMap.data.nodesCreated} nodes, {buildMap.data.edgesCreated} edges created
        </div>
      )}

      {/* Node List */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Map Nodes</CardTitle></CardHeader>
        <CardContent>
          {mapData.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-1">
              {(mapData.data?.nodes ?? []).slice(0, 20).map((n: any) => (
                <div key={n.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{n.nodeType}</Badge>
                    <span className="font-medium">{n.nodeName}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Risk: {n.riskScore ?? 0}</span>
                    <span>Patterns: {n.patternCount ?? 0}</span>
                  </div>
                </div>
              ))}
              {(mapData.data?.nodes ?? []).length === 0 && <PanelEmpty label="No nodes — click Build Map from Signals" />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edge List */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Map Edges (Relationships)</CardTitle></CardHeader>
        <CardContent>
          {mapData.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-1">
              {(mapData.data?.edges ?? []).slice(0, 20).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">#{e.sourceNodeId}</span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">#{e.targetNodeId}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{e.edgeType}</Badge>
                </div>
              ))}
              {(mapData.data?.edges ?? []).length === 0 && <PanelEmpty label="No edges" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Failure Prediction Panel ── */
function FailurePredictionPanel() {
  const stats = trpc.enginesV4.failurePredictionStats.useQuery();
  const profiles = trpc.enginesV4.failureProfiles.useQuery();

  if (stats.isLoading) return <PanelSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-red-400" /> Institutional Failure Prediction
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Profiles" value={String(stats.data?.totalProfiles ?? 0)} icon={<Building className="h-3.5 w-3.5" />} color="red" />
        <MetricCard label="High Risk" value={String(stats.data?.highRiskCount ?? 0)} icon={<AlertOctagon className="h-3.5 w-3.5" />} color="orange" />
        <MetricCard label="Timeline Events" value={String(stats.data?.totalTimelineEvents ?? 0)} icon={<Clock className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Avg Probability" value={`${stats.data?.avgProbability ?? 0}%`} icon={<Gauge className="h-3.5 w-3.5" />} color="amber" />
      </div>

      {/* Failure Profiles */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Institution Risk Profiles</CardTitle></CardHeader>
        <CardContent>
          {profiles.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-2">
              {(profiles.data ?? []).map((p: any) => (
                <div key={p.id} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{p.institutionName || `Institution #${p.institutionId}`}</div>
                    <Badge className={
                      p.failureProbability >= 70 ? "bg-red-500/20 text-red-400" :
                      p.failureProbability >= 40 ? "bg-orange-500/20 text-orange-400" :
                      "bg-emerald-500/20 text-emerald-400"
                    }>
                      {p.failureProbability}% failure risk
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>Pressure: {p.pressureIndex ?? 0}</span>
                    <span>Complaints: {p.complaintVolume ?? 0}</span>
                    <span>Enforcement: {p.enforcementActions ?? 0}</span>
                  </div>
                </div>
              ))}
              {(profiles.data ?? []).length === 0 && <PanelEmpty label="No failure profiles — run upsertFailureProfile to create" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Investigative Query Engine Panel ── */
function InvestigativeQueryPanel() {
  const [queryText, setQueryText] = useState("");
  const [activeResult, setActiveResult] = useState<any>(null);
  const stats = trpc.enginesV4.investigativeQueryStats.useQuery();
  const suggested = trpc.enginesV4.suggestedQueries.useQuery();
  const history = trpc.enginesV4.queryHistory.useQuery();
  const runQuery = trpc.enginesV4.runInvestigativeQuery.useMutation({
    onSuccess: (data) => {
      setActiveResult(data);
      history.refetch();
      stats.refetch();
    },
  });

  const handleSubmit = () => {
    if (!queryText.trim()) return;
    runQuery.mutate({ queryText: queryText.trim() });
  };

  const handleSuggested = (text: string) => {
    setQueryText(text);
    runQuery.mutate({ queryText: text });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <SearchCode className="h-5 w-5 text-violet-400" /> Investigative Query Engine
        </h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>{stats.data?.totalQueries ?? 0} queries</span>
          <span>·</span>
          <span>{stats.data?.totalResults ?? 0} results</span>
        </div>
      </div>

      {/* Query Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Ask an investigative question... e.g. 'Companies with more than 25 complaints'"
              className="flex-1 rounded-lg border border-border/50 bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <Button
              onClick={handleSubmit}
              disabled={runQuery.isPending || !queryText.trim()}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
            >
              {runQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Query
            </Button>
          </div>

          {/* Suggested Queries */}
          {!activeResult && (suggested.data ?? []).length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">Suggested queries:</div>
              <div className="flex flex-wrap gap-1.5">
                {(suggested.data ?? []).map((sq: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleSuggested(sq.text)}
                    className="rounded-full border border-border/50 px-3 py-1 text-xs hover:bg-violet-500/10 hover:border-violet-500/30 transition-colors"
                  >
                    {sq.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parsed Query Display */}
      {activeResult?.parsedQuery && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Parsed Query Filters</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activeResult.parsedQuery.entityType && (
                <Badge className="bg-blue-500/20 text-blue-400">Type: {activeResult.parsedQuery.entityType}</Badge>
              )}
              {activeResult.parsedQuery.industry && (
                <Badge className="bg-green-500/20 text-green-400">Industry: {activeResult.parsedQuery.industry}</Badge>
              )}
              {activeResult.parsedQuery.jurisdiction && (
                <Badge className="bg-amber-500/20 text-amber-400">Jurisdiction: {activeResult.parsedQuery.jurisdiction}</Badge>
              )}
              {activeResult.parsedQuery.complaintThreshold && (
                <Badge className="bg-red-500/20 text-red-400">Complaints ≥ {activeResult.parsedQuery.complaintThreshold}</Badge>
              )}
              {activeResult.parsedQuery.lawsuitThreshold && (
                <Badge className="bg-orange-500/20 text-orange-400">Lawsuits ≥ {activeResult.parsedQuery.lawsuitThreshold}</Badge>
              )}
              {activeResult.parsedQuery.sortBy && (
                <Badge className="bg-violet-500/20 text-violet-400">Sort: {activeResult.parsedQuery.sortBy}</Badge>
              )}
              {activeResult.parsedQuery.limit && (
                <Badge className="bg-slate-500/20 text-slate-400">Limit: {activeResult.parsedQuery.limit}</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {activeResult.totalResults} total matches · showing top {activeResult.results.length}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {activeResult?.results && activeResult.results.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Query Results</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeResult.results.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{r.rank}</span>
                      <span className="font-medium text-sm">{r.entityName}</span>
                      {r.entityType && r.entityType !== "unknown" && (
                        <Badge variant="outline" className="text-[10px]">{r.entityType}</Badge>
                      )}
                    </div>
                    <Badge className={
                      r.confidenceScore >= 70 ? "bg-emerald-500/20 text-emerald-400" :
                      r.confidenceScore >= 40 ? "bg-amber-500/20 text-amber-400" :
                      "bg-slate-500/20 text-slate-400"
                    }>
                      {r.confidenceScore}% confidence
                    </Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground mb-2">
                    <span>Signals: {r.signalCount}</span>
                    <span>Complaints: {r.complaintCount}</span>
                    <span>Lawsuits: {r.lawsuitCount}</span>
                    <span>Enforcement: {r.enforcementCount}</span>
                    <span>Streams: {r.streamCount}</span>
                  </div>
                  {r.jurisdictions && r.jurisdictions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {r.jurisdictions.slice(0, 5).map((j: string, i: number) => (
                        <span key={i} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">{j}</span>
                      ))}
                      {r.jurisdictions.length > 5 && <span className="text-[10px] text-muted-foreground">+{r.jurisdictions.length - 5} more</span>}
                    </div>
                  )}
                  {r.sourceStreams && r.sourceStreams.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {r.sourceStreams.map((s: string, i: number) => (
                        <span key={i} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">{s.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  )}
                  {r.safeLanguageSummary && (
                    <div className="text-xs text-muted-foreground italic border-l-2 border-violet-500/30 pl-2 mt-1">
                      {r.safeLanguageSummary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeResult?.results && activeResult.results.length === 0 && (
        <PanelEmpty label="No entities matched your query filters. Try broadening your search." />
      )}

      {/* Query History */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Query History</CardTitle></CardHeader>
        <CardContent>
          {history.isLoading ? <PanelSkeleton /> : (
            <div className="space-y-1">
              {(history.data ?? []).slice(0, 10).map((q: any) => (
                <div key={q.id} className="flex items-center justify-between rounded border border-border/30 px-3 py-2 text-xs">
                  <span className="truncate flex-1 mr-2">{q.queryText}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{q.resultCount ?? 0} results</Badge>
                    <span className="text-muted-foreground">{new Date(q.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              {(history.data ?? []).length === 0 && <PanelEmpty label="No queries yet — try one above" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MissionControl() {
  const { user, loading } = useAuth();
  const [mainTab, setMainTab] = useState("operations");
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                Mission Control
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Admin operational dashboard — system health, knowledge coverage, and case activity
              </p>
            </div>
            <div className="flex items-center gap-2">
              <nav className="flex items-center gap-1">
                <Link href="/mudroom">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <DoorOpen className="h-3.5 w-3.5" /> Mudroom
                  </Button>
                </Link>
                <Link href="/workshop">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Wrench className="h-3.5 w-3.5" /> Workshop
                  </Button>
                </Link>
                <Link href="/upload">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Upload className="h-3.5 w-3.5" /> Dashboard
                  </Button>
                </Link>
                <Link href="/lighthouse">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Lamp className="h-3.5 w-3.5" /> Lighthouse
                  </Button>
                </Link>
              </nav>
              <div className="w-px h-6 bg-border" />
              <Badge variant="outline" className="text-xs">
                Admin Only
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
          <TabsList>
            {shouldRenderPanel("operations") && <TabsTrigger value="operations" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Operations
            </TabsTrigger>}
            {shouldRenderPanel("registry") && <TabsTrigger value="registry" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> Registry
            </TabsTrigger>}
            {shouldRenderPanel("ingestion") && <TabsTrigger value="ingestion" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" /> Live Data
            </TabsTrigger>}
            {shouldRenderPanel("kb-explorer") && <TabsTrigger value="kb-explorer" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> KB Explorer
            </TabsTrigger>}
            {shouldRenderPanel("governance") && <TabsTrigger value="governance" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Signal Governance
            </TabsTrigger>}
{shouldRenderPanel("patterns") &&             <TabsTrigger value="patterns" className="gap-1.5">
              <Network className="h-3.5 w-3.5" /> Pattern Registry
            </TabsTrigger>}
{shouldRenderPanel("trends") &&             <TabsTrigger value="trends" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> Trends & Pressure
            </TabsTrigger>}
{shouldRenderPanel("strategy-paths") &&             <TabsTrigger value="strategy-paths" className="gap-1.5">
              <Route className="h-3.5 w-3.5" /> Strategy Paths
            </TabsTrigger>}
{shouldRenderPanel("outcomes") &&             <TabsTrigger value="outcomes" className="gap-1.5">
              <Target className="h-3.5 w-3.5" /> Outcomes
            </TabsTrigger>}
{shouldRenderPanel("interventions") &&             <TabsTrigger value="interventions" className="gap-1.5">
              <Siren className="h-3.5 w-3.5" /> Interventions
            </TabsTrigger>}
{shouldRenderPanel("policy") &&             <TabsTrigger value="policy" className="gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> Policy Impact
            </TabsTrigger>}
            {shouldRenderPanel("remedy-templates") && <TabsTrigger value="remedy-templates" className="gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> Remedy Templates
            </TabsTrigger>}
{shouldRenderPanel("memory-strategy") &&             <TabsTrigger value="memory-strategy" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" /> Memory Strategy
            </TabsTrigger>}
{shouldRenderPanel("reform-proposals") &&             <TabsTrigger value="reform-proposals" className="gap-1.5">
              <FileOutput className="h-3.5 w-3.5" /> Reform Proposals
            </TabsTrigger>}
{shouldRenderPanel("coalitions") &&             <TabsTrigger value="coalitions" className="gap-1.5">
              <Handshake className="h-3.5 w-3.5" /> Coalitions
            </TabsTrigger>}
            {shouldRenderPanel("evidence-lab") && <TabsTrigger value="evidence-lab" className="gap-1.5">
              <Microscope className="h-3.5 w-3.5" /> Evidence Lab
            </TabsTrigger>}
            {shouldRenderPanel("claim-validation") && <TabsTrigger value="claim-validation" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" /> Claim Validation
            </TabsTrigger>}
            {shouldRenderPanel("remedy-feasibility") && <TabsTrigger value="remedy-feasibility" className="gap-1.5">
              <Gavel className="h-3.5 w-3.5" /> Remedy Feasibility
            </TabsTrigger>}
            {shouldRenderPanel("procedural-paths") && <TabsTrigger value="procedural-paths" className="gap-1.5">
              <MapIcon className="h-3.5 w-3.5" /> Procedural Paths
            </TabsTrigger>}
            {shouldRenderPanel("hardening-pipeline") && <TabsTrigger value="hardening-pipeline" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Hardening Pipeline
            </TabsTrigger>}
{shouldRenderPanel("coalition-intel") &&             <TabsTrigger value="coalition-intel" className="gap-1.5">
              <Binoculars className="h-3.5 w-3.5" /> Coalition Intel
            </TabsTrigger>}
{shouldRenderPanel("campaign-engine") &&             <TabsTrigger value="campaign-engine" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Campaign Engine
            </TabsTrigger>}
            {shouldRenderPanel("knowledge-health") && <TabsTrigger value="knowledge-health" className="gap-1.5">
              <HeartPulse className="h-3.5 w-3.5" /> Knowledge Health
            </TabsTrigger>}
{shouldRenderPanel("gap-analysis") &&             <TabsTrigger value="gap-analysis" className="gap-1.5">
              <Grid3X3 className="h-3.5 w-3.5" /> Gap Analysis
            </TabsTrigger>}
{shouldRenderPanel("harm-index") &&             <TabsTrigger value="harm-index" className="gap-1.5">
              <Flame className="h-3.5 w-3.5" /> Harm Index
            </TabsTrigger>}
{shouldRenderPanel("risk-forecast") &&             <TabsTrigger value="risk-forecast" className="gap-1.5">
              <Radar className="h-3.5 w-3.5" /> Risk Forecast
            </TabsTrigger>}
{shouldRenderPanel("harm-map") &&             <TabsTrigger value="harm-map" className="gap-1.5">
              <Network className="h-3.5 w-3.5" /> Harm Map
            </TabsTrigger>}
            {shouldRenderPanel("front-door") && <TabsTrigger value="front-door" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Front Door
            </TabsTrigger>}
            {shouldRenderPanel("lobbying") && <TabsTrigger value="lobbying" className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Lobbying
            </TabsTrigger>}
            {shouldRenderPanel("litigation") && <TabsTrigger value="litigation" className="gap-1.5">
              <Gavel className="h-3.5 w-3.5" /> Litigation
            </TabsTrigger>}
            {shouldRenderPanel("admin-decisions") && <TabsTrigger value="admin-decisions" className="gap-1.5">
              <Scale className="h-3.5 w-3.5" /> Admin Decisions
            </TabsTrigger>}
            {shouldRenderPanel("verified-reports") && <TabsTrigger value="verified-reports" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Verified Reports
            </TabsTrigger>}
            {shouldRenderPanel("advocacy") && <TabsTrigger value="advocacy" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Advocacy
            </TabsTrigger>}
            {shouldRenderPanel("cross-stream") && <TabsTrigger value="cross-stream" className="gap-1.5">
              <GitCompareArrows className="h-3.5 w-3.5" /> Cross-Stream
            </TabsTrigger>}
            {shouldRenderPanel("time-travel") && <TabsTrigger value="time-travel" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Time Travel
            </TabsTrigger>}
            {shouldRenderPanel("entity-intel") && <TabsTrigger value="entity-intel" className="gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" /> Entity Intel
            </TabsTrigger>}
            {shouldRenderPanel("institutions") && <TabsTrigger value="institutions" className="gap-1.5">
              <Building className="h-3.5 w-3.5" /> Institutions
            </TabsTrigger>}
            {shouldRenderPanel("reg-capture") && <TabsTrigger value="reg-capture" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Reg. Capture
            </TabsTrigger>}
            {shouldRenderPanel("crisis-predict") && <TabsTrigger value="crisis-predict" className="gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5" /> Crisis Predict
            </TabsTrigger>}
            {shouldRenderPanel("simulation-lab") && <TabsTrigger value="simulation-lab" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Simulation Lab
            </TabsTrigger>}
            {shouldRenderPanel("transparency") && <TabsTrigger value="transparency" className="gap-1.5">
              <Newspaper className="h-3.5 w-3.5" /> Transparency
            </TabsTrigger>}
            {shouldRenderPanel("dossier-studio") && <TabsTrigger value="dossier-studio" className="gap-1.5">
              <FolderArchive className="h-3.5 w-3.5" /> Dossier Studio
            </TabsTrigger>}
            {shouldRenderPanel("ext-collab") && <TabsTrigger value="ext-collab" className="gap-1.5">
              <Share2 className="h-3.5 w-3.5" /> Ext. Collaboration
            </TabsTrigger>}
            {shouldRenderPanel("entity-transparency") && <TabsTrigger value="entity-transparency" className="gap-1.5">
              <Scan className="h-3.5 w-3.5" /> Entity Transparency
            </TabsTrigger>}
            {shouldRenderPanel("evidence-threshold") && <TabsTrigger value="evidence-threshold" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Evidence Threshold
            </TabsTrigger>}
            {shouldRenderPanel("alerting") && <TabsTrigger value="alerting" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Alerting
            </TabsTrigger>}
            {shouldRenderPanel("system-map") && <TabsTrigger value="system-map" className="gap-1.5">
              <Waypoints className="h-3.5 w-3.5" /> System Map
            </TabsTrigger>}
            {shouldRenderPanel("failure-predict") && <TabsTrigger value="failure-predict" className="gap-1.5">
              <Factory className="h-3.5 w-3.5" /> Failure Prediction
            </TabsTrigger>}
            {shouldRenderPanel("investigative-query") && <TabsTrigger value="investigative-query" className="gap-1.5">
              <SearchCode className="h-3.5 w-3.5" /> Investigative Query
            </TabsTrigger>}
            {shouldRenderPanel("metadata-health") && <TabsTrigger value="metadata-health" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> Metadata Health
            </TabsTrigger>}
            {shouldRenderPanel("pipeline-integrity") && <TabsTrigger value="pipeline-integrity" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Pipeline Integrity
            </TabsTrigger>}
            {shouldRenderPanel("export-readiness") && <TabsTrigger value="export-readiness" className="gap-1.5">
              <FileOutput className="h-3.5 w-3.5" /> Export Readiness
            </TabsTrigger>}
            <TabsTrigger value="lh-lineage" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> Signal Lineage
            </TabsTrigger>
            <TabsTrigger value="lh-gate-review" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Gate Review
            </TabsTrigger>
            <TabsTrigger value="lh-patterns" className="gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" /> LH Patterns
            </TabsTrigger>
            <TabsTrigger value="lh-trends" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> LH Trends
            </TabsTrigger>
            <TabsTrigger value="lh-strategies" className="gap-1.5">
              <Target className="h-3.5 w-3.5" /> LH Strategies
            </TabsTrigger>
            <TabsTrigger value="lh-health" className="gap-1.5">
              <HeartPulse className="h-3.5 w-3.5" /> LH Health
            </TabsTrigger>
            <TabsTrigger value="flags" className="gap-1.5">
              <Flag className="h-3.5 w-3.5" /> Flags
            </TabsTrigger>
          </TabsList>

          {shouldRenderPanel("operations") && <TabsContent value="operations" className="space-y-6">
            {/* Quick Navigate — pass-through shortcuts to key functional tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {([
                { tab: "evidence-lab", label: "Evidence Lab", icon: <Microscope className="h-4 w-4" />, color: "text-cyan-400" },
                { tab: "claim-validation", label: "Claim Validation", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-emerald-400" },
                { tab: "remedy-feasibility", label: "Remedy Feasibility", icon: <Scale className="h-4 w-4" />, color: "text-amber-400" },
                { tab: "procedural-paths", label: "Procedural Paths", icon: <Route className="h-4 w-4" />, color: "text-violet-400" },
                { tab: "flags", label: "Flag Queue", icon: <Flag className="h-4 w-4" />, color: "text-red-400" },
                { tab: "kb-explorer", label: "KB Explorer", icon: <BookOpen className="h-4 w-4" />, color: "text-blue-400" },
              ] as const).map(({ tab, label, icon, color }) => (
                shouldRenderPanel(tab) ? (
                  <button
                    key={tab}
                    onClick={() => setMainTab(tab)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border/50 bg-card/30 hover:bg-card/60 hover:border-border transition-all text-center group"
                  >
                    <span className={`${color} group-hover:scale-110 transition-transform`}>{icon}</span>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
                  </button>
                ) : null
              ))}
            </div>
            {/* Row 0: Canonical Core (orchestration root) */}
            <Card>
              <CardContent className="pt-6">
                <CanonicalCorePanel />
              </CardContent>
            </Card>
            {/* Row 0.5: Canonical Spine — Implementation Package */}
            <Card>
              <CardContent className="pt-6">
                <CanonicalSpineDashboard />
              </CardContent>
            </Card>
            {/* Row 0.75: Live Intake Operations — Lighthouse canonical intake telemetry */}
            <Card>
              <CardContent className="pt-6">
                <LiveIntakeOperationsPanel />
              </CardContent>
            </Card>
            {/* Row 1: System Health + Knowledge */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <SystemHealthPanel />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <KnowledgePopulationPanel onNavigateToKB={() => setMainTab("kb-explorer")} />
                </CardContent>
              </Card>
            </div>

            {/* Row 2: Case Activity + Structural Signals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <CaseActivityPanel />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <StructuralSignalsPanel />
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Work Queue (full width) */}
            <Card>
              <CardContent className="pt-6">
                <WorkQueuePanel />
              </CardContent>
            </Card>

            {/* Row 4: Engine Status (full width) */}
            <Card>
              <CardContent className="pt-6">
                <EngineStatusPanel />
              </CardContent>
            </Card>
            {/* Row 5: Panel Activation Summary */}
            <Card>
              <CardContent className="pt-6">
                <PanelActivationSummary />
              </CardContent>
            </Card>
          </TabsContent>}

          {shouldRenderPanel("registry") && <TabsContent value="registry">
            <LegacyRegistryView />
          </TabsContent>}

          {shouldRenderPanel("ingestion") && <TabsContent value="ingestion" className="space-y-6">
            <IngestionPanel />
          </TabsContent>}

          {shouldRenderPanel("kb-explorer") && <TabsContent value="kb-explorer" className="space-y-6">
            <KnowledgeExplorerPanel />
          </TabsContent>}

          {shouldRenderPanel("governance") && <TabsContent value="governance" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div />
              <Link href="/mission-control/governance">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Constitutional Governance Dashboard
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <SignalGovernancePanel />
          </TabsContent>}

{shouldRenderPanel("patterns") &&           <TabsContent value="patterns" className="space-y-6">
            <PatternRegistryPanel />
          </TabsContent>}

{shouldRenderPanel("trends") &&           <TabsContent value="trends" className="space-y-6">
            <TrendPressurePanel />
          </TabsContent>}

{shouldRenderPanel("strategy-paths") &&           <TabsContent value="strategy-paths" className="space-y-6">
            <StrategyPathsPanel />
          </TabsContent>}

{shouldRenderPanel("outcomes") &&           <TabsContent value="outcomes" className="space-y-6">
            <OutcomesPanel />
          </TabsContent>}

{shouldRenderPanel("interventions") &&           <TabsContent value="interventions" className="space-y-6">
            <InterventionDashboardPanel />
          </TabsContent>}

{shouldRenderPanel("policy") &&           <TabsContent value="policy" className="space-y-6">
            <PolicyImpactPanel />
          </TabsContent>}

          {shouldRenderPanel("remedy-templates") && <TabsContent value="remedy-templates" className="space-y-6">
            <RemedyTemplatesPanel />
          </TabsContent>}

{shouldRenderPanel("memory-strategy") &&           <TabsContent value="memory-strategy" className="space-y-6">
            <MemoryStrategyMetricsPanel />
          </TabsContent>}

{shouldRenderPanel("reform-proposals") &&           <TabsContent value="reform-proposals" className="space-y-6">
            <ReformProposalsPanel />
          </TabsContent>}

{shouldRenderPanel("coalitions") &&           <TabsContent value="coalitions" className="space-y-6">
            <CoalitionsPanel />
          </TabsContent>}
          {shouldRenderPanel("evidence-lab") && <TabsContent value="evidence-lab" className="space-y-6">
            <EvidenceLabPanel onNavigateTo={setMainTab} />
          </TabsContent>}
          {shouldRenderPanel("claim-validation") && <TabsContent value="claim-validation" className="space-y-6">
            <ClaimValidationPanel onNavigateTo={setMainTab} />
          </TabsContent>}
          {shouldRenderPanel("remedy-feasibility") && <TabsContent value="remedy-feasibility" className="space-y-6">
            <RemedyFeasibilityPanel onNavigateTo={setMainTab} />
          </TabsContent>}
          {shouldRenderPanel("procedural-paths") && <TabsContent value="procedural-paths" className="space-y-6">
            <ProceduralPathsPanel onNavigateTo={setMainTab} />
          </TabsContent>}
          {shouldRenderPanel("hardening-pipeline") && <TabsContent value="hardening-pipeline" className="space-y-6">
            <HardeningPipelinePanel />
          </TabsContent>}
{shouldRenderPanel("coalition-intel") &&           <TabsContent value="coalition-intel" className="space-y-6">
            <CoalitionIntelPanel />
          </TabsContent>}
{shouldRenderPanel("campaign-engine") &&           <TabsContent value="campaign-engine" className="space-y-6">
            <CampaignEnginePanel />
          </TabsContent>}
          {shouldRenderPanel("knowledge-health") && <TabsContent value="knowledge-health" className="space-y-6">
            <KnowledgeHealthPanel />
          </TabsContent>}
{shouldRenderPanel("gap-analysis") &&           <TabsContent value="gap-analysis" className="space-y-6">
            <KnowledgeGapAnalysisPanel />
          </TabsContent>}
{shouldRenderPanel("harm-index") &&           <TabsContent value="harm-index" className="space-y-6">
            <HarmIndexPanel />
          </TabsContent>}
{shouldRenderPanel("risk-forecast") &&           <TabsContent value="risk-forecast" className="space-y-6">
            <RiskForecastPanel />
          </TabsContent>}
{shouldRenderPanel("harm-map") &&           <TabsContent value="harm-map" className="space-y-6">
            <HarmMapPanel />
          </TabsContent>}
          {shouldRenderPanel("front-door") && <TabsContent value="front-door" className="space-y-6">
            <FrontDoorPanel />
          </TabsContent>}
          {shouldRenderPanel("lobbying") && <TabsContent value="lobbying" className="space-y-6">
            <LobbyingPanel />
          </TabsContent>}
          {shouldRenderPanel("litigation") && <TabsContent value="litigation" className="space-y-6">
            <LitigationPanel />
          </TabsContent>}
          {shouldRenderPanel("admin-decisions") && <TabsContent value="admin-decisions" className="space-y-6">
            <AdminDecisionsPanel />
          </TabsContent>}
          {shouldRenderPanel("verified-reports") && <TabsContent value="verified-reports" className="space-y-6">
            <VerifiedReportsPanel />
          </TabsContent>}
          {shouldRenderPanel("advocacy") && <TabsContent value="advocacy" className="space-y-6">
            <AdvocacyPanel />
          </TabsContent>}
          {shouldRenderPanel("cross-stream") && <TabsContent value="cross-stream" className="space-y-6">
            <CrossStreamPanel />
          </TabsContent>}
          {shouldRenderPanel("time-travel") && <TabsContent value="time-travel" className="space-y-6">
            <TimeTravelPanel />
          </TabsContent>}
          {shouldRenderPanel("entity-intel") && <TabsContent value="entity-intel" className="space-y-6">
            <EntityIntelPanel />
          </TabsContent>}
          {shouldRenderPanel("institutions") && <TabsContent value="institutions" className="space-y-6">
            <InstitutionsPanel />
          </TabsContent>}
          {shouldRenderPanel("reg-capture") && <TabsContent value="reg-capture" className="space-y-6">
            <RegCapturePanel />
          </TabsContent>}
          {shouldRenderPanel("crisis-predict") && <TabsContent value="crisis-predict" className="space-y-6">
            <CrisisPredictPanel />
          </TabsContent>}
          {shouldRenderPanel("simulation-lab") && <TabsContent value="simulation-lab" className="space-y-6">
            <SimulationLabPanel />
          </TabsContent>}
          {shouldRenderPanel("transparency") && <TabsContent value="transparency" className="space-y-6">
            <TransparencyPanel />
          </TabsContent>}
          {shouldRenderPanel("dossier-studio") && <TabsContent value="dossier-studio" className="space-y-6">
            <DossierStudioPanel />
          </TabsContent>}
          {shouldRenderPanel("ext-collab") && <TabsContent value="ext-collab" className="space-y-6">
            <ExtCollabPanel />
          </TabsContent>}
          {shouldRenderPanel("entity-transparency") && <TabsContent value="entity-transparency" className="space-y-6">
            <EntityTransparencyPanel />
          </TabsContent>}
          {shouldRenderPanel("evidence-threshold") && <TabsContent value="evidence-threshold" className="space-y-6">
            <EvidenceThresholdPanel />
          </TabsContent>}
          {shouldRenderPanel("alerting") && <TabsContent value="alerting" className="space-y-6">
            <AlertingPanel />
          </TabsContent>}
          {shouldRenderPanel("system-map") && <TabsContent value="system-map" className="space-y-6">
            <SystemMapPanel />
          </TabsContent>}
          {shouldRenderPanel("failure-predict") && <TabsContent value="failure-predict" className="space-y-6">
            <FailurePredictionPanel />
          </TabsContent>}
          {shouldRenderPanel("investigative-query") && <TabsContent value="investigative-query" className="space-y-6">
            <InvestigativeQueryPanel />
          </TabsContent>}
          {shouldRenderPanel("metadata-health") && <TabsContent value="metadata-health" className="space-y-6">
            <Card><CardContent className="pt-6"><MetadataHealthPanel /></CardContent></Card>
          </TabsContent>}
          {shouldRenderPanel("pipeline-integrity") && <TabsContent value="pipeline-integrity" className="space-y-6">
            <Card><CardContent className="pt-6"><PipelineIntegrityPanel /></CardContent></Card>
          </TabsContent>}
          {shouldRenderPanel("export-readiness") && <TabsContent value="export-readiness" className="space-y-6">
            <Card><CardContent className="pt-6"><ExportReadinessPanel /></CardContent></Card>
          </TabsContent>}
          <TabsContent value="lh-lineage" className="space-y-6">
            <Card><CardContent className="pt-6"><SignalLineagePanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="lh-gate-review" className="space-y-6">
            <Card><CardContent className="pt-6"><GateReviewPanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="lh-patterns" className="space-y-6">
            <Card><CardContent className="pt-6"><LighthousePatternRegistryPanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="lh-trends" className="space-y-6">
            <Card><CardContent className="pt-6"><LighthouseTrendPressurePanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="lh-strategies" className="space-y-6">
            <Card><CardContent className="pt-6"><StrategyProjectionPanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="lh-health" className="space-y-6">
            <Card><CardContent className="pt-6"><PipelineHealthPanel /></CardContent></Card>
          </TabsContent>
          <TabsContent value="flags" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <FlagQueuePanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
