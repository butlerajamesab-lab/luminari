/**
 * StrategyProjectionPanel.tsx
 *
 * Panel 5 — Strategy Projection Panel
 * Reads from lighthouseStrategies tRPC procedures → v_active_strategies canonical view.
 * Shows downstream operational outputs: active strategies by urgency, scope, jurisdiction.
 * Read-only. No writes. No local computation.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
  Target, RefreshCw, Loader2, MapPin, Zap,
  AlertTriangle, BarChart3, Globe,
} from "lucide-react";

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const SCOPE_COLORS: Record<string, string> = {
  national: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  state: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  local: "bg-teal-500/10 text-teal-400 border-teal-500/30",
  cross_jurisdictional: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

export function StrategyProjectionPanel() {
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  const { data: summaryData } = trpc.lighthouseStrategies.summary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const { data: strategiesData, isLoading, refetch } = trpc.lighthouseStrategies.list.useQuery(
    {
      urgency: urgencyFilter !== "all" ? urgencyFilter : undefined,
      scope: scopeFilter !== "all" ? scopeFilter : undefined,
      limit: 200,
    },
    { refetchInterval: 60_000 }
  );

  const strategies = strategiesData?.strategies ?? [];
  const summary = summaryData;

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Active Strategies</span>
              </div>
              <div className="text-2xl font-mono font-bold text-white">{summary.total_strategies}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-950/40 border-red-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400 uppercase tracking-wide">Critical</span>
              </div>
              <div className="text-2xl font-mono font-bold text-red-300">
                {(summary.by_urgency as Record<string, number>)?.["critical"] ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-orange-950/40 border-orange-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-orange-400" />
                <span className="text-xs text-orange-400 uppercase tracking-wide">High Urgency</span>
              </div>
              <div className="text-2xl font-mono font-bold text-orange-300">
                {(summary.by_urgency as Record<string, number>)?.["high"] ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-violet-950/40 border-violet-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-violet-400" />
                <span className="text-xs text-violet-400 uppercase tracking-wide">Jurisdictions</span>
              </div>
              <div className="text-2xl font-mono font-bold text-violet-300">
                {Object.keys(summary.by_jurisdiction ?? {}).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-sm">
            <SelectValue placeholder="Urgency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-44 bg-slate-900 border-slate-700 text-sm">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="national">National</SelectItem>
            <SelectItem value="state">State</SelectItem>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="cross_jurisdictional">Cross-Jurisdictional</SelectItem>
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

      {/* Strategy Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : strategies.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">No active strategies found.</div>
      ) : (
        <div className="space-y-2">
          {strategies.map((s) => (
            <Card key={s.id} className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{s.strategy_name}</span>
                      {s.urgency_level && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${URGENCY_COLORS[s.urgency_level] ?? "bg-slate-800 text-slate-400"}`}
                        >
                          {s.urgency_level}
                        </Badge>
                      )}
                      {s.strategy_scope && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${SCOPE_COLORS[s.strategy_scope] ?? "bg-slate-800 text-slate-400"}`}
                        >
                          {s.strategy_scope}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {s.jurisdiction_scope && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {s.jurisdiction_scope}
                        </span>
                      )}
                      {s.domain && (
                        <span className="text-xs text-slate-500">{s.domain}</span>
                      )}
                      {s.pattern_id && (
                        <span className="text-[10px] text-slate-600 font-mono">
                          pattern: {s.pattern_id.slice(0, 8)}…
                        </span>
                      )}
                      {s.trend_id && (
                        <span className="text-[10px] text-slate-600 font-mono">
                          trend: {s.trend_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                    {s.recommended_actions && s.recommended_actions.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {s.recommended_actions.slice(0, 3).map((a: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[9px] bg-slate-800 text-slate-400 border-slate-600">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-white">
                      {(s.confidence_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500">confidence</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600 text-right">
        Read-only projection from v_active_strategies · Lighthouse canonical view · No local computation
      </p>
    </div>
  );
}
