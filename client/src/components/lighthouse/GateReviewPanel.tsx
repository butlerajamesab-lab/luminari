/**
 * GateReviewPanel.tsx
 *
 * Panel 2 — Gate Review Queue
 * Reads from lighthouseGovernance tRPC procedures → v_gate_decisions + v_staged_signals.
 * Shows all gate decisions with score breakdown, and staged signals pending review.
 * Read-only. No writes. No local computation.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield, CheckCircle2, XCircle, Clock, AlertTriangle,
  RefreshCw, Loader2, BarChart3, Eye,
} from "lucide-react";

const DECISION_COLORS: Record<string, string> = {
  PROMOTE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  STAGE: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  HOLD: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  REJECT: "bg-red-500/10 text-red-400 border-red-500/30",
  ESCALATE_REVIEW: "bg-violet-500/10 text-violet-400 border-violet-500/30",
};

function ScoreBar({ value, label, color = "bg-blue-500" }: { value: number; label: string; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-slate-500 w-28 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-slate-400 w-8 text-right font-mono">{pct}%</span>
    </div>
  );
}

export function GateReviewPanel() {
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: decisionsData, isLoading: decisionsLoading, refetch: refetchDecisions } =
    trpc.lighthouseGovernance.gateDecisions.useQuery(
      {
        decision: decisionFilter !== "all" ? (decisionFilter as any) : undefined,
        limit: 100,
      },
      { refetchInterval: 60_000 }
    );

  const { data: stagedData, isLoading: stagedLoading, refetch: refetchStaged } =
    trpc.lighthouseGovernance.stagedSignals.useQuery(undefined, {
      refetchInterval: 30_000,
    });

  const { data: summaryData } = trpc.lighthouseGovernance.decisionSummary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const decisions = decisionsData?.decisions ?? [];
  const staged = stagedData?.staged ?? [];
  const summary = summaryData ? {
    totalDecisions: summaryData.totalDecisions,
    promoted: summaryData.totalPromoted,
    staged: (summaryData.byDecision as Record<string, number>)["STAGE"] ?? 0,
    rejected: (summaryData.byDecision as Record<string, number>)["REJECT"] ?? 0,
  } : null;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wide">Total Decisions</span>
              </div>
              <div className="text-2xl font-mono font-bold text-white">{summary.totalDecisions}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-950/40 border-emerald-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-400 uppercase tracking-wide">Promoted</span>
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-300">{summary.promoted}</div>
              {summary.totalDecisions > 0 && (
                <div className="text-xs text-emerald-500 mt-0.5">
                  {Math.round((summary.promoted / summary.totalDecisions) * 100)}% rate
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-amber-950/40 border-amber-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-amber-400 uppercase tracking-wide">Staged</span>
              </div>
              <div className="text-2xl font-mono font-bold text-amber-300">{summary.staged}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-950/40 border-red-700/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400 uppercase tracking-wide">Rejected</span>
              </div>
              <div className="text-2xl font-mono font-bold text-red-300">{summary.rejected}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="decisions">
        <TabsList className="bg-slate-900 border border-slate-700/50">
          <TabsTrigger value="decisions" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" /> Gate Log
          </TabsTrigger>
          <TabsTrigger value="staged" className="gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            Staged Queue
            {staged.length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[9px] bg-amber-500 text-black">{staged.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Gate Decisions Log */}
        <TabsContent value="decisions" className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <Select value={decisionFilter} onValueChange={setDecisionFilter}>
              <SelectTrigger className="w-44 bg-slate-900 border-slate-700 text-sm">
                <SelectValue placeholder="Filter by decision" />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchDecisions()}
              disabled={decisionsLoading}
              className="ml-auto border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${decisionsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {decisionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {decisions.map((d) => (
                <Card key={d.gate_log_id} className="bg-slate-900/60 border-slate-700/50">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${DECISION_COLORS[d.decision] ?? ""}`}
                          >
                            {d.decision}
                          </Badge>
                          <span className="text-xs text-slate-300 font-medium truncate">{d.signal_type}</span>
                          <span className="text-xs text-slate-500">{d.jurisdiction_raw_value}</span>
                          <span className="text-xs text-slate-500">{d.source_system}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {d.gate_log_id.slice(0, 8)}…
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(d.evaluated_at).toLocaleString()}
                          </span>
                          {d.profile_name && (
                            <span className="text-[10px] text-slate-600">profile: {d.profile_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-white">
                            {(d.composite_score * 100).toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-slate-500">composite</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(expandedId === d.gate_log_id ? null : d.gate_log_id)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Score Breakdown */}
                    {expandedId === d.gate_log_id && (
                      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1.5">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" /> Score Breakdown
                        </div>
                        <ScoreBar value={d.score_provenance_confidence} label="Provenance Confidence" color="bg-blue-500" />
                        <ScoreBar value={d.score_source_trust_tier} label="Source Trust Tier" color="bg-cyan-500" />
                        <ScoreBar value={d.score_jurisdiction_validity} label="Jurisdiction Validity" color="bg-teal-500" />
                        <ScoreBar value={d.score_temporal_relevance} label="Temporal Relevance" color="bg-green-500" />
                        <ScoreBar value={d.score_schema_validity} label="Schema Validity" color="bg-emerald-500" />
                        <ScoreBar value={d.score_extraction_completeness} label="Extraction Completeness" color="bg-violet-500" />
                        <ScoreBar value={1 - d.score_duplicate_probability} label="Duplicate Resistance" color="bg-amber-500" />
                        <ScoreBar value={1 - d.score_contradiction_flags} label="Contradiction Resistance" color="bg-orange-500" />
                        {d.decision_reason && (
                          <div className="mt-2 text-[10px] text-slate-400 bg-slate-800/50 rounded p-2">
                            {d.decision_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {decisions.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">No gate decisions match the current filter.</div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Staged Queue */}
        <TabsContent value="staged" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{staged.length} signals pending review</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStaged()}
              disabled={stagedLoading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${stagedLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {stagedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : staged.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <div className="text-sm text-slate-400">No signals in staging queue</div>
              <div className="text-xs text-slate-600 mt-1">All signals have been reviewed or promoted</div>
            </div>
          ) : (
            <div className="space-y-2">
              {staged.map((s) => (
                <Card key={s.staging_id} className="bg-amber-950/20 border-amber-700/30">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${DECISION_COLORS[s.gate_decision] ?? ""}`}>
                            {s.gate_decision}
                          </Badge>
                          <span className="text-xs text-slate-300 font-medium">{s.signal_type}</span>
                          <span className="text-xs text-slate-500">{s.jurisdiction_raw_value}</span>
                          {s.severity && (
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
                              {s.severity}
                            </Badge>
                          )}
                        </div>
                        {s.decision_reason && (
                          <div className="text-[10px] text-slate-500 mt-1">{s.decision_reason}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono text-amber-300">{s.age_hours.toFixed(1)}h old</div>
                        <div className="text-[10px] text-slate-500">
                          {(s.confidence_score * 100).toFixed(0)}% conf
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-slate-600 text-right">
        Read-only projection from v_gate_decisions + v_staged_signals · Lighthouse canonical views · No local computation
      </p>
    </div>
  );
}
