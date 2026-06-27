/**
 * SignalLineagePanel.tsx
 *
 * Panel 1 — Signal Lineage Explorer
 * Reads exclusively from lighthouseLineage tRPC procedures → v_signal_lineage canonical view.
 * Proves determinism: every signal traceable from ingestion through gate to pattern/trend.
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
  GitBranch, Shield, Activity, CheckCircle2, XCircle,
  Clock, AlertTriangle, RefreshCw, Loader2, Link2, TrendingUp,
} from "lucide-react";

const DECISION_COLORS: Record<string, string> = {
  PROMOTE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  STAGE: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  HOLD: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  REJECT: "bg-red-500/10 text-red-400 border-red-500/30",
  ESCALATE_REVIEW: "bg-violet-500/10 text-violet-400 border-violet-500/30",
};

const DECISION_ICONS: Record<string, React.ReactNode> = {
  PROMOTE: <CheckCircle2 className="h-3.5 w-3.5" />,
  STAGE: <Clock className="h-3.5 w-3.5" />,
  HOLD: <AlertTriangle className="h-3.5 w-3.5" />,
  REJECT: <XCircle className="h-3.5 w-3.5" />,
  ESCALATE_REVIEW: <Shield className="h-3.5 w-3.5" />,
};

export function SignalLineagePanel() {
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [signalTypeFilter, setSignalTypeFilter] = useState<string>("all");

  const { data: coverageData, isLoading: coverageLoading } =
    trpc.lighthouseLineage.coverageStats.useQuery(undefined, {
      refetchInterval: 60_000,
    });

  const { data: lineageData, isLoading: lineageLoading, refetch } =
    trpc.lighthouseLineage.list.useQuery(
      {
        decision: decisionFilter !== "all" ? (decisionFilter as any) : undefined,
        signalType: signalTypeFilter !== "all" ? signalTypeFilter : undefined,
        limit: 100,
      },
      { refetchInterval: 60_000 }
    );

  const lineage = lineageData?.lineage ?? [];
  const coverage = coverageData;

  // Derive unique signal types from loaded data for filter
  const signalTypes = [...new Set(lineage.map((l) => l.signal_type).filter(Boolean))].sort();

  const isLoading = coverageLoading || lineageLoading;

  return (
    <div className="space-y-6">
      {/* Coverage Stats Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Total Signals</span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {coverageLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (coverage?.total_signals ?? 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-950/40 border-emerald-700/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-emerald-400 uppercase tracking-wide">Gate Promoted</span>
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-300">
              {coverageLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (coverage?.promoted ?? 0)}
            </div>
            {coverage && coverage.total_signals > 0 && (
              <div className="text-xs text-emerald-500 mt-0.5">{coverage.promotion_rate}% rate</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-blue-950/40 border-blue-700/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-blue-400 uppercase tracking-wide">Pattern Linked</span>
            </div>
            <div className="text-2xl font-mono font-bold text-blue-300">
              {coverageLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (coverage?.pattern_linked ?? 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-violet-950/40 border-violet-700/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-violet-400" />
              <span className="text-xs text-violet-400 uppercase tracking-wide">Full Chain</span>
            </div>
            <div className="text-2xl font-mono font-bold text-violet-300">
              {coverageLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (coverage?.full_chain ?? 0)}
            </div>
            {coverage && coverage.promoted > 0 && (
              <div className="text-xs text-violet-500 mt-0.5">{coverage.full_chain_rate}% of promoted</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-slate-400" />
          <Select value={decisionFilter} onValueChange={setDecisionFilter}>
            <SelectTrigger className="w-44 bg-slate-900 border-slate-700 text-sm">
              <SelectValue placeholder="Gate Decision" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Decisions</SelectItem>
              <SelectItem value="PROMOTE">PROMOTE</SelectItem>
              <SelectItem value="STAGE">STAGE</SelectItem>
              <SelectItem value="HOLD">HOLD</SelectItem>
              <SelectItem value="REJECT">REJECT</SelectItem>
              <SelectItem value="ESCALATE_REVIEW">ESCALATE_REVIEW</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {signalTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-400" />
            <Select value={signalTypeFilter} onValueChange={setSignalTypeFilter}>
              <SelectTrigger className="w-52 bg-slate-900 border-slate-700 text-sm">
                <SelectValue placeholder="Signal Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signal Types</SelectItem>
                {signalTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="ml-auto border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Lineage Table */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-400" />
            Signal Lineage Trace
            <span className="text-xs text-slate-500 font-normal ml-1">
              ({lineage.length} signals — v_signal_lineage)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lineageLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-400 text-sm">Loading lineage...</span>
            </div>
          ) : lineage.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No lineage records match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Signal ID</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Type</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Jurisdiction</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Gate Decision</th>
                    <th className="text-right py-2 px-3 text-slate-400 font-medium">Gate Score</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Pattern</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Trend</th>
                    <th className="text-right py-2 px-3 text-slate-400 font-medium">Confidence</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {lineage.map((l) => (
                    <tr
                      key={l.detected_signal_id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-2 px-3 font-mono text-slate-400 text-[10px]">
                        {l.detected_signal_id.slice(0, 8)}…
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {l.signal_type}
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {l.jurisdiction_raw_value}
                      </td>
                      <td className="py-2 px-3">
                        {l.gate_decision ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${DECISION_COLORS[l.gate_decision] ?? "bg-slate-800 text-slate-400"}`}
                          >
                            {DECISION_ICONS[l.gate_decision]}
                            {l.gate_decision}
                          </Badge>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">
                        {l.gate_composite_score != null
                          ? (l.gate_composite_score * 100).toFixed(0) + "%"
                          : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {l.pattern_name ? (
                          <span className="text-blue-400 truncate max-w-[120px] block">{l.pattern_name}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {l.trend_classification ? (
                          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-400 border-violet-500/30">
                            {l.trend_classification}
                          </Badge>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">
                        {(l.confidence_score * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {l.detected_at
                          ? new Date(l.detected_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Architecture note */}
      <p className="text-[10px] text-slate-600 text-right">
        Read-only projection from v_signal_lineage · Lighthouse canonical view · No local computation
      </p>
    </div>
  );
}
