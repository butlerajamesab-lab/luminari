/**
 * PatternRegistryPanel.tsx
 *
 * Panel 3 — Pattern Registry
 * Reads from lighthousePatterns tRPC procedures → v_active_patterns canonical view.
 * Shows clustering observability: all active patterns with signal counts, confidence, decay.
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
  GitBranch, RefreshCw, Loader2, Activity, BarChart3,
  MapPin, Calendar, Zap,
} from "lucide-react";

const DECAY_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  stable: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  decaying: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  dormant: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

export function PatternRegistryPanel() {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");

  const { data: summaryData } = trpc.lighthousePatterns.summary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const { data: patternsData, isLoading, refetch } = trpc.lighthousePatterns.list.useQuery(
    {
      jurisdiction: jurisdictionFilter !== "all" ? jurisdictionFilter : undefined,
      limit: 200,
    },
    { refetchInterval: 60_000 }
  );

  const patterns = patternsData?.patterns ?? [];
  const summary = summaryData;

  const jurisdictions = [...new Set(patterns.map((p) => p.jurisdiction).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Active Patterns</span>
              </div>
              <div className="text-2xl font-mono font-bold text-white">{summary.total_patterns}</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-950/40 border-blue-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-blue-400 uppercase tracking-wide">Total Signals</span>
              </div>
              <div className="text-2xl font-mono font-bold text-blue-300">{summary.total_signals}</div>
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
          <Card className="bg-teal-950/40 border-teal-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-teal-400" />
                <span className="text-xs text-teal-400 uppercase tracking-wide">Jurisdictions</span>
              </div>
              <div className="text-2xl font-mono font-bold text-teal-300">
                {Object.keys(summary.by_jurisdiction ?? {}).length}
              </div>
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

      {/* Pattern Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : patterns.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">No active patterns found.</div>
      ) : (
        <div className="space-y-2">
          {patterns.map((p) => (
            <Card key={p.pattern_id} className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{p.pattern_name}</span>
                      <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-300 border-slate-600">
                        {p.pattern_type}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${DECAY_COLORS[p.decay_status] ?? "bg-slate-800 text-slate-400"}`}
                      >
                        {p.decay_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {p.jurisdiction}
                      </span>
                      {p.domain && (
                        <span className="text-xs text-slate-500">{p.domain}</span>
                      )}
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Activity className="h-3 w-3" /> {p.signal_count} signals
                      </span>
                      {p.time_span_days != null && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {p.time_span_days}d span
                        </span>
                      )}
                    </div>
                    {p.harm_domains && p.harm_domains.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {p.harm_domains.slice(0, 4).map((d) => (
                          <Badge key={d} variant="outline" className="text-[9px] bg-red-500/5 text-red-400 border-red-500/20">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-white">
                      {(p.confidence_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500">confidence</div>
                    {p.geographic_spread != null && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        <Zap className="h-2.5 w-2.5 inline mr-0.5" />
                        {p.geographic_spread} spread
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600 text-right">
        Read-only projection from v_active_patterns · Lighthouse canonical view · No local computation
      </p>
    </div>
  );
}
