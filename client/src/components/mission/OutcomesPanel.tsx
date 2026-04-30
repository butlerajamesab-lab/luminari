import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, TrendingUp, Building2, Loader2, BarChart3, Scale } from "lucide-react";

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400", violet: "text-violet-400", amber: "text-amber-400",
    emerald: "text-emerald-400", rose: "text-rose-400", slate: "text-slate-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}<span>{label}</span></div>
      <div className={`text-xl font-bold tabular-nums ${colorMap[color] ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function OutcomeBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500",
    blue: "bg-blue-500", slate: "bg-slate-500",
  };
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] ?? "bg-slate-500"} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-16 text-right tabular-nums">{value} ({pct}%)</span>
    </div>
  );
}

export function OutcomesPanel() {
  const litigationOutcomes = trpc.streams.litigationOutcomes.useQuery();
  const adminStats = trpc.streams.adminDecisionsStats.useQuery();
  const adminByAgency = trpc.streams.adminDecisionsOutcomesByAgency.useQuery({ limit: 10 });
  const outcomeDivergence = trpc.patternEngine.getOutcomeDivergence.useQuery({});

  const outcomes = litigationOutcomes.data ?? null;
  const stats = adminStats.data ?? null;
  const byAgency = adminByAgency.data ?? [];
  const divergence = outcomeDivergence.data ?? [];

  const totalLitigation = outcomes
    ? (outcomes.plaintiff_wins ?? 0) + (outcomes.defendant_wins ?? 0) + (outcomes.settlements ?? 0) + (outcomes.dismissed ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          Outcomes & Effectiveness
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Litigation outcomes, administrative decisions, and outcome divergence analysis
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Plaintiff Wins"
          value={String(outcomes?.plaintiff_wins ?? 0)}
          icon={<Scale className="h-3.5 w-3.5" />}
          color="emerald"
        />
        <MetricCard
          label="Settlements"
          value={String(outcomes?.settlements ?? 0)}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          color="blue"
        />
        <MetricCard
          label="Admin Decisions"
          value={String(stats?.totalDecisions ?? 0)}
          icon={<Building2 className="h-3.5 w-3.5" />}
          color="violet"
        />
        <MetricCard
          label="Reversal Rate"
          value={stats?.reversalRate != null ? `${Number(stats.reversalRate).toFixed(1)}%` : "—"}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          color="amber"
        />
      </div>

      {/* Litigation Outcomes Breakdown */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Scale className="h-4 w-4 text-emerald-400" />
            Litigation Outcomes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {litigationOutcomes.isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
          ) : totalLitigation === 0 ? (
            <div className="text-slate-500 text-sm text-center py-4">
              No litigation outcome data yet. Ingest case outcome records via the data streams.
            </div>
          ) : (
            <div className="space-y-3">
              <OutcomeBar label="Plaintiff Wins" value={outcomes?.plaintiff_wins ?? 0} total={totalLitigation} color="emerald" />
              <OutcomeBar label="Settlements" value={outcomes?.settlements ?? 0} total={totalLitigation} color="blue" />
              <OutcomeBar label="Defendant Wins" value={outcomes?.defendant_wins ?? 0} total={totalLitigation} color="rose" />
              <OutcomeBar label="Dismissed" value={outcomes?.dismissed ?? 0} total={totalLitigation} color="slate" />
              {outcomes?.pending != null && outcomes.pending > 0 && (
                <OutcomeBar label="Pending" value={outcomes.pending} total={totalLitigation} color="amber" />
              )}
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-500">
                Total: {totalLitigation.toLocaleString()} cases
                {outcomes?.avgDamagesAwarded != null && (
                  <span className="ml-3">Avg damages: ${Number(outcomes.avgDamagesAwarded).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Administrative Decisions by Agency */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-violet-400" />
            Administrative Outcomes by Agency
          </CardTitle>
        </CardHeader>
        <CardContent>
          {adminByAgency.isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
          ) : byAgency.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-4">
              No administrative decision data yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {byAgency.map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-slate-200">{a.agency}</span>
                    {a.program && <span className="text-xs text-slate-500 ml-2">{a.program}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{a.totalDecisions ?? a.count ?? 0} decisions</span>
                    {a.reversalRate != null && (
                      <Badge variant="outline" className={`text-xs ${Number(a.reversalRate) > 30 ? 'border-emerald-700 text-emerald-400' : 'border-slate-600 text-slate-400'}`}>
                        {Number(a.reversalRate).toFixed(1)}% reversed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outcome Divergence */}
      {divergence.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              Outcome Divergence ({divergence.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {divergence.slice(0, 10).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm text-slate-200">{d.claimType}</span>
                    {d.jurisdiction && <span className="text-xs text-slate-500 ml-2">{d.jurisdiction}</span>}
                  </div>
                  {d.divergenceScore != null && (
                    <Badge variant="outline" className={`text-xs ${Number(d.divergenceScore) > 50 ? 'border-rose-700 text-rose-400' : 'border-amber-700 text-amber-400'}`}>
                      {Number(d.divergenceScore).toFixed(0)} divergence
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totalLitigation === 0 && byAgency.length === 0 && !litigationOutcomes.isLoading && !adminByAgency.isLoading && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No outcome data yet.</p>
          <p className="text-slate-500 text-xs mt-1">Ingest litigation outcomes and administrative decisions via the Ingestion tab to populate this panel.</p>
        </div>
      )}
    </div>
  );
}
