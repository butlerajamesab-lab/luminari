/**
 * TrendPressurePanel.tsx
 *
 * Panel 4 — Trend Pressure Dashboard
 * Reads from lighthouseTrends tRPC procedures → v_active_trends canonical view.
 * Shows temporal synthesis visibility: momentum, pressure index, growth rates.
 * Read-only. No writes. No local computation.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Loader2,
  Activity, BarChart3, MapPin, Calendar,
} from "lucide-react";

const MOMENTUM_COLORS: Record<string, string> = {
  accelerating: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rising: "bg-green-500/10 text-green-400 border-green-500/30",
  stable: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  declining: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  collapsing: "bg-red-500/10 text-red-400 border-red-500/30",
};

const MOMENTUM_ICONS: Record<string, React.ReactNode> = {
  accelerating: <TrendingUp className="h-3 w-3" />,
  rising: <TrendingUp className="h-3 w-3" />,
  stable: <Minus className="h-3 w-3" />,
  declining: <TrendingDown className="h-3 w-3" />,
  collapsing: <TrendingDown className="h-3 w-3" />,
};

function PressureBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct > 75 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : pct > 25 ? "bg-blue-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-300 w-8 text-right">{value}</span>
    </div>
  );
}

export function TrendPressurePanel() {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");

  const { data: summaryData } = trpc.lighthouseTrends.pressureSummary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const { data: trendsData, isLoading, refetch } = trpc.lighthouseTrends.list.useQuery(
    {
      jurisdiction: jurisdictionFilter !== "all" ? jurisdictionFilter : undefined,
      limit: 100,
    },
    { refetchInterval: 60_000 }
  );

  const trends = trendsData?.trends ?? [];
  const summary = summaryData;

  const jurisdictions = [...new Set(trends.map((t) => t.jurisdiction).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Active Trends</span>
              </div>
              <div className="text-2xl font-mono font-bold text-white">{summary.total_trends}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-950/40 border-red-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400 uppercase tracking-wide">Avg Pressure</span>
              </div>
              <div className="text-2xl font-mono font-bold text-red-300">{summary.avg_pressure}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-950/40 border-emerald-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-400 uppercase tracking-wide">Accelerating</span>
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-300">
                {(summary.by_momentum as Record<string, number>)?.["accelerating"] ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-violet-950/40 border-violet-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                <span className="text-xs text-violet-400 uppercase tracking-wide">Avg Confidence</span>
              </div>
              <div className="text-2xl font-mono font-bold text-violet-300">{summary.avg_confidence}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
          <SelectTrigger className="w-44 bg-slate-900 border-slate-700 text-sm">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jurisdictions</SelectItem>
            {jurisdictions.map((j) => (
              <SelectItem key={j} value={j}>{j}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isLoading}
          className="ml-auto border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Trend Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : trends.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">No active trends found.</div>
      ) : (
        <div className="space-y-2">
          {trends.map((t) => (
            <Card key={t.trend_id} className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-300 border-slate-600">
                        {t.trend_classification}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] gap-1 ${MOMENTUM_COLORS[t.momentum_direction] ?? "bg-slate-800 text-slate-400"}`}
                      >
                        {MOMENTUM_ICONS[t.momentum_direction]}
                        {t.momentum_direction}
                      </Badge>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {t.jurisdiction}
                      </span>
                      {t.domain && (
                        <span className="text-xs text-slate-500">{t.domain}</span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-20">Pressure</span>
                        <PressureBar value={t.pressure_index} max={100} />
                      </div>
                    </div>

                    {/* Growth Rates */}
                    {(t.growth_rate_7d != null || t.growth_rate_30d != null || t.growth_rate_90d != null) && (
                      <div className="flex gap-4 mt-2">
                        {t.growth_rate_7d != null && (
                          <div className="text-center">
                            <div className={`text-xs font-mono font-bold ${t.growth_rate_7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {t.growth_rate_7d >= 0 ? "+" : ""}{t.growth_rate_7d.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-600">7d</div>
                          </div>
                        )}
                        {t.growth_rate_30d != null && (
                          <div className="text-center">
                            <div className={`text-xs font-mono font-bold ${t.growth_rate_30d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {t.growth_rate_30d >= 0 ? "+" : ""}{t.growth_rate_30d.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-600">30d</div>
                          </div>
                        )}
                        {t.growth_rate_90d != null && (
                          <div className="text-center">
                            <div className={`text-xs font-mono font-bold ${t.growth_rate_90d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {t.growth_rate_90d >= 0 ? "+" : ""}{t.growth_rate_90d.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-600">90d</div>
                          </div>
                        )}
                        {t.projected_peak_date && (
                          <div className="text-center">
                            <div className="text-xs font-mono text-violet-400">
                              {new Date(t.projected_peak_date).toLocaleDateString()}
                            </div>
                            <div className="text-[9px] text-slate-600">peak</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-white">
                      {(t.current_confidence_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500">confidence</div>
                    <div className="text-xs font-mono text-slate-400 mt-1">
                      {t.current_signal_count} signals
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600 text-right">
        Read-only projection from v_active_trends · Lighthouse canonical view · No local computation
      </p>
    </div>
  );
}
