/**
 * LiveIntakeOperationsPanel.tsx
 *
 * Read-only Mission Control observability for canonical Lighthouse intake operations.
 * All aggregation, freshness, lag, queue, retry, and health-classification logic is computed
 * server-side by v_live_intake_operations and exposed through tRPC.
 */

import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  Loader2,
  Radio,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

const HEALTH_STYLES: Record<string, { badge: string; card: string; icon: ReactNode }> = {
  healthy: {
    badge: "border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
    card: "border-emerald-700/30 bg-emerald-950/20",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  },
  degraded: {
    badge: "border-amber-700/40 bg-amber-950/40 text-amber-300",
    card: "border-amber-700/30 bg-amber-950/20",
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  },
  stalled: {
    badge: "border-red-700/40 bg-red-950/40 text-red-300",
    card: "border-red-700/30 bg-red-950/20",
    icon: <XCircle className="h-4 w-4 text-red-400" />,
  },
  backlogged: {
    badge: "border-orange-700/40 bg-orange-950/40 text-orange-300",
    card: "border-orange-700/30 bg-orange-950/20",
    icon: <Database className="h-4 w-4 text-orange-400" />,
  },
  retrying: {
    badge: "border-violet-700/40 bg-violet-950/40 text-violet-300",
    card: "border-violet-700/30 bg-violet-950/20",
    icon: <RefreshCw className="h-4 w-4 text-violet-400" />,
  },
  quarantined: {
    badge: "border-red-800/60 bg-red-950/60 text-red-200",
    card: "border-red-800/50 bg-red-950/30",
    icon: <AlertOctagon className="h-4 w-4 text-red-300" />,
  },
};

function styleFor(health: string | null | undefined) {
  return HEALTH_STYLES[health ?? ""] ?? {
    badge: "border-slate-700/50 bg-slate-900/60 text-slate-300",
    card: "border-slate-700/50 bg-slate-900/40",
    icon: <Activity className="h-4 w-4 text-slate-400" />,
  };
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString();
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  return `${(value / 3600).toFixed(1)}h`;
}

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function OperationMetric({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "slate" | "emerald" | "amber" | "red" | "blue" | "violet";
}) {
  const toneClass: Record<string, string> = {
    slate: "text-slate-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
    blue: "text-blue-300",
    violet: "text-violet-300",
  };

  return (
    <Card className="border-slate-800/70 bg-slate-950/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
          {icon}
          {label}
        </div>
        <div className={`mt-1 text-xl font-mono font-semibold ${toneClass[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StreamHealthCard({ row }: { row: any }) {
  const style = styleFor(row.health_classification);
  return (
    <Card className={`${style.card}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <Radio className="h-4 w-4 text-blue-400" />
              {row.stream_id}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
              Status: {row.stream_status ?? "unknown"}
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
            <span className="mr-1">{style.icon}</span>
            {row.health_classification ?? "unknown"}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-slate-500">Last signal</div>
            <div className="font-mono text-slate-300">{formatTimestamp(row.last_signal_at)}</div>
          </div>
          <div>
            <div className="text-slate-500">Signal age</div>
            <div className="font-mono text-slate-300">{formatSeconds(row.signal_age_seconds)}</div>
          </div>
          <div>
            <div className="text-slate-500">Scanned 24h</div>
            <div className="font-mono text-slate-300">{formatNumber(row.events_scanned_24h)}</div>
          </div>
          <div>
            <div className="text-slate-500">Promoted 24h</div>
            <div className="font-mono text-slate-300">{formatNumber(row.signals_promoted_24h)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EngineCadenceRow({ label, value, icon }: { label: string; value: string | null | undefined; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 py-2 last:border-0">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        {icon}
        {label}
      </div>
      <div className="font-mono text-xs text-slate-400">{formatTimestamp(value)}</div>
    </div>
  );
}

export function LiveIntakeOperationsPanel() {
  const { data, isLoading, refetch } = trpc.lighthouseOperations.liveIntakeOperations.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const operations = data?.operations ?? [];
  const critical = operations.filter((row: any) => row.health_classification === "stalled" || row.health_classification === "quarantined");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-medium text-slate-200">Live Intake Operations — v_live_intake_operations</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Canonical deterministic telemetry from Lighthouse; all operational aggregation is computed server-side.
          </p>
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
          <span className="ml-2 text-sm text-slate-400">Loading live intake operations...</span>
        </div>
      ) : operations.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 py-12 text-center text-sm text-slate-500">
          No live intake operations rows are available from Lighthouse.
        </div>
      ) : (
        <>
          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <Shield className="h-3.5 w-3.5" /> Stream health cards
            </h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {operations.map((row: any) => (
                <StreamHealthCard key={row.stream_id} row={row} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Freshness / lag metrics
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-freshness`} label={`${row.stream_id} age`} value={formatSeconds(row.signal_age_seconds)} icon={<Clock className="h-3.5 w-3.5" />} tone="amber" />
              ))}
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-lag`} label={`${row.stream_id} bridge lag`} value={formatSeconds(row.bridge_lag_seconds)} icon={<Zap className="h-3.5 w-3.5" />} tone="blue" />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <Database className="h-3.5 w-3.5" /> Queue pressure
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-staged`} label={`${row.stream_id} staged 24h`} value={formatNumber(row.signals_staged_24h)} icon={<Database className="h-3.5 w-3.5" />} tone="amber" />
              ))}
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-backlog`} label={`${row.stream_id} backlog`} value={formatNumber(row.staging_backlog_count)} icon={<AlertTriangle className="h-3.5 w-3.5" />} tone="red" />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <GitBranch className="h-3.5 w-3.5" /> Engine cadence
            </h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {operations.map((row: any) => (
                <Card key={`${row.stream_id}-cadence`} className="border-slate-800/70 bg-slate-950/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-300">{row.stream_id}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <EngineCadenceRow label="Detector heartbeat" value={row.last_detector_run_at} icon={<Radio className="h-4 w-4 text-blue-400" />} />
                    <EngineCadenceRow label="Pattern synthesis" value={row.last_pattern_run_at} icon={<GitBranch className="h-4 w-4 text-cyan-400" />} />
                    <EngineCadenceRow label="Trend cadence" value={row.last_trend_run_at} icon={<TrendingUp className="h-4 w-4 text-violet-400" />} />
                    <EngineCadenceRow label="Strategy projection" value={row.last_strategy_run_at} icon={<Target className="h-4 w-4 text-amber-400" />} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <AlertTriangle className="h-3.5 w-3.5" /> Failure / retry visibility
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-failed-promotions`} label={`${row.stream_id} failed promotions`} value={formatNumber(row.failed_promotions_24h)} icon={<XCircle className="h-3.5 w-3.5" />} tone="red" />
              ))}
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-retries`} label={`${row.stream_id} retries`} value={formatNumber(row.retry_count)} icon={<RefreshCw className="h-3.5 w-3.5" />} tone="violet" />
              ))}
              {operations.map((row: any) => (
                <OperationMetric key={`${row.stream_id}-rejected`} label={`${row.stream_id} rejected 24h`} value={formatNumber(row.signals_rejected_24h)} icon={<Shield className="h-3.5 w-3.5" />} tone="amber" />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <AlertOctagon className="h-3.5 w-3.5" /> Critical alerts
            </h3>
            {critical.length === 0 ? (
              <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-4 text-sm text-emerald-300">
                No streams are currently classified as stalled or quarantined.
              </div>
            ) : (
              <div className="space-y-2">
                {critical.map((row: any) => {
                  const style = styleFor(row.health_classification);
                  return (
                    <div key={`${row.stream_id}-critical`} className={`rounded-lg border p-4 ${style.card}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-200">
                          {style.icon}
                          {row.stream_id}
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${style.badge}`}>{row.health_classification}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400 md:grid-cols-4">
                        <span>Signal age: {formatSeconds(row.signal_age_seconds)}</span>
                        <span>Backlog: {formatNumber(row.staging_backlog_count)}</span>
                        <span>Retries: {formatNumber(row.retry_count)}</span>
                        <span>Failed promotions: {formatNumber(row.failed_promotions_24h)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
