/**
 * PipelineHealthPanel.tsx
 *
 * Panel 6 — Pipeline Health Panel
 * Reads from lighthouseGovernance.pipelineHealth → v_pipeline_health canonical view.
 * Shows runtime/system observability: engine health, run seals, signal freshness.
 * Read-only. No writes. No local computation.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Loader2, Shield, GitBranch, TrendingUp,
  Target, Clock, Database, Zap, Lock, BarChart3,
} from "lucide-react";

const HEALTH_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  healthy: {
    bg: "bg-emerald-950/40 border-emerald-700/30",
    text: "text-emerald-400",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  },
  degraded: {
    bg: "bg-amber-950/40 border-amber-700/30",
    text: "text-amber-400",
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  },
  stale: {
    bg: "bg-orange-950/40 border-orange-700/30",
    text: "text-orange-400",
    icon: <Clock className="h-4 w-4 text-orange-400" />,
  },
  critical: {
    bg: "bg-red-950/40 border-red-700/30",
    text: "text-red-400",
    icon: <XCircle className="h-4 w-4 text-red-400" />,
  },
  no_data: {
    bg: "bg-slate-900/60 border-slate-700/50",
    text: "text-slate-400",
    icon: <Activity className="h-4 w-4 text-slate-400" />,
  },
};

function HealthCard({
  label,
  status,
  value,
  sub,
  icon,
}: {
  label: string;
  status: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  const style = HEALTH_COLORS[status] ?? HEALTH_COLORS.no_data;
  return (
    <Card className={`${style.bg}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className={`text-xs uppercase tracking-wide ${style.text}`}>{label}</span>
        </div>
        <div className={`text-2xl font-mono font-bold ${style.text}`}>{value}</div>
        {sub && <div className={`text-[10px] mt-0.5 ${style.text} opacity-70`}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EngineRow({
  name,
  health,
  lastRun,
  sealCount,
  icon,
}: {
  name: string;
  health: string;
  lastRun: string | null;
  sealCount: number;
  icon: React.ReactNode;
}) {
  const style = HEALTH_COLORS[health] ?? HEALTH_COLORS.no_data;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-slate-300">{name}</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>
          {health}
        </Badge>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Lock className="h-3 w-3" />
          {sealCount} seals
        </div>
        {lastRun && (
          <span className="text-[10px] text-slate-600">
            {new Date(lastRun).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

export function PipelineHealthPanel() {
  const { data, isLoading, refetch } = trpc.lighthouseGovernance.pipelineHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const health = data?.health;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-400" />
          <span className="text-sm text-slate-300 font-medium">Pipeline Health — v_pipeline_health</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isLoading}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-400 text-sm">Loading pipeline health...</span>
        </div>
      ) : !health ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Pipeline health data unavailable.
        </div>
      ) : (
        <>
          {/* Signal Layer */}
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
              <Database className="h-3.5 w-3.5" /> Signal Layer
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <HealthCard
                label="Total Signals"
                status="no_data"
                value={health.total_signals}
                icon={<Activity className="h-4 w-4 text-slate-400" />}
              />
              <HealthCard
                label="Gate Promoted"
                status="healthy"
                value={health.gate_promoted}
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              />
              <HealthCard
                label="Pending Review"
                status={health.pending_review > 0 ? "degraded" : "healthy"}
                value={health.pending_review}
                icon={<Clock className="h-4 w-4" />}
              />
              <HealthCard
                label="Freshness"
                status={health.signal_freshness}
                value={health.signal_freshness}
                icon={<Zap className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Gate Layer */}
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" /> Gate Layer
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <HealthCard
                label="Total Decisions"
                status="no_data"
                value={health.total_decisions}
                icon={<Shield className="h-4 w-4 text-slate-400" />}
              />
              <HealthCard
                label="Promoted"
                status="healthy"
                value={health.promoted}
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              />
              <HealthCard
                label="Staged/Held"
                status={health.staged_or_held > 5 ? "degraded" : "healthy"}
                value={health.staged_or_held}
                icon={<AlertTriangle className="h-4 w-4" />}
              />
              <HealthCard
                label="Avg Gate Score"
                status="no_data"
                value={health.avg_gate_score != null ? `${(health.avg_gate_score * 100).toFixed(0)}%` : "—"}
                icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
              />
            </div>
          </div>

          {/* Engine Layer */}
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Engine Layer
            </h3>
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <EngineRow
                  name="Pattern Engine"
                  health={health.pattern_engine_health}
                  lastRun={health.last_pattern_run}
                  sealCount={health.pattern_runs_sealed}
                  icon={<GitBranch className="h-4 w-4 text-blue-400" />}
                />
                <EngineRow
                  name="Trend Engine"
                  health="healthy"
                  lastRun={health.last_trend_run}
                  sealCount={health.trend_runs_sealed}
                  icon={<TrendingUp className="h-4 w-4 text-violet-400" />}
                />
                <EngineRow
                  name="Strategy Engine"
                  health="healthy"
                  lastRun={health.last_strategy_run}
                  sealCount={health.strategy_runs_sealed}
                  icon={<Target className="h-4 w-4 text-amber-400" />}
                />
              </CardContent>
            </Card>
          </div>

          {/* Output Layer */}
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> Output Layer
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <HealthCard
                label="Active Patterns"
                status="healthy"
                value={health.active_patterns}
                icon={<GitBranch className="h-4 w-4 text-blue-400" />}
              />
              <HealthCard
                label="Current Trends"
                status="healthy"
                value={health.current_trends}
                icon={<TrendingUp className="h-4 w-4 text-violet-400" />}
              />
              <HealthCard
                label="Active Strategies"
                status="healthy"
                value={health.active_strategies}
                icon={<Target className="h-4 w-4 text-amber-400" />}
              />
            </div>
          </div>

          {health.health_checked_at && (
            <p className="text-[10px] text-slate-600 text-right">
              Last checked: {new Date(health.health_checked_at).toLocaleString()} ·
              v_pipeline_health · Lighthouse canonical view
            </p>
          )}
        </>
      )}
    </div>
  );
}
