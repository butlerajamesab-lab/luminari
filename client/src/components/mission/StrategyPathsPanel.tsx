import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Route, TrendingUp, MapPin, Shield, Loader2, Clock, Target } from "lucide-react";

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

function StrengthBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

export function StrategyPathsPanel() {
  const outcomeAnalytics = trpc.patternEngine.getOutcomeAnalytics.useQuery({});
  const temporalTrends = trpc.patternEngine.getTemporalTrends.useQuery({});
  const geoHotspots = trpc.patternEngine.getGeographicHotspots.useQuery();
  const industryProfiles = trpc.patternEngine.getIndustryProfiles.useQuery();
  const defenseStrategies = trpc.patternEngine.getDefenseStrategies.useQuery({});
  const evidenceCorrelations = trpc.patternEngine.getEvidenceCorrelations.useQuery({});

  const outcomes = outcomeAnalytics.data ?? [];
  const trends = temporalTrends.data ?? [];
  const hotspots = geoHotspots.data ?? [];
  const industries = industryProfiles.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Route className="h-5 w-5 text-blue-400" />
          Strategy Paths
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Outcome analytics, temporal trends, geographic hotspots, and industry profiles
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Outcome Records" value={String(outcomes.length)} icon={<Target className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Temporal Trends" value={String(trends.length)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="Geo Hotspots" value={String(hotspots.length)} icon={<MapPin className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Industry Profiles" value={String(industries.length)} icon={<Shield className="h-3.5 w-3.5" />} color="emerald" />
      </div>

      {/* Outcome Analytics by Claim Type */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-400" />
            Outcome Analytics by Claim Type ({outcomes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outcomeAnalytics.isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
          ) : outcomes.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-4">
              No outcome analytics yet. Run the Pattern Engine aggregation to populate this data.
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {outcomes.map((o: any) => (
                <div key={o.id} className="border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-200">{o.claimType}</span>
                    <div className="flex items-center gap-2">
                      {o.jurisdiction && (
                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{o.jurisdiction}</Badge>
                      )}
                      {o.forum && (
                        <Badge variant="outline" className="text-xs border-blue-700 text-blue-400">{o.forum}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs text-slate-500 mb-2">
                    <div><span className="text-slate-400">Cases:</span> {o.totalCases ?? 0}</div>
                    {o.avgTimeToResolution && <div><span className="text-slate-400">Avg time:</span> {o.avgTimeToResolution}</div>}
                    {o.avgSettlementAmount && <div><span className="text-slate-400">Avg settlement:</span> ${Number(o.avgSettlementAmount).toLocaleString()}</div>}
                  </div>
                  {o.winRate != null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Win Rate</span>
                        <span className="text-emerald-400">{Number(o.winRate).toFixed(1)}%</span>
                      </div>
                      <StrengthBar value={Number(o.winRate)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Geographic Hotspots */}
      {hotspots.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-400" />
              Geographic Hotspots ({hotspots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {hotspots.slice(0, 10).map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm text-slate-200">{h.jurisdiction ?? h.region ?? "Unknown"}</span>
                    {h.claimType && <span className="text-xs text-slate-500 ml-2">{h.claimType}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{h.caseCount ?? 0} cases</span>
                    {h.densityScore != null && (
                      <Badge variant="outline" className={`text-xs ${Number(h.densityScore) > 70 ? 'border-rose-700 text-rose-400' : 'border-amber-700 text-amber-400'}`}>
                        {Number(h.densityScore).toFixed(0)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Temporal Trends */}
      {trends.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-400" />
              Temporal Trends ({trends.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {trends.slice(0, 10).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm text-slate-200">{t.claimType}</span>
                    {t.period && <span className="text-xs text-slate-500 ml-2">{t.period}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.caseCount != null && <span className="text-xs text-slate-400">{t.caseCount} cases</span>}
                    {t.trendDirection && (
                      <Badge variant="outline" className={`text-xs ${t.trendDirection === 'increasing' ? 'border-rose-700 text-rose-400' : t.trendDirection === 'decreasing' ? 'border-emerald-700 text-emerald-400' : 'border-slate-600 text-slate-400'}`}>
                        {t.trendDirection}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no data */}
      {outcomes.length === 0 && hotspots.length === 0 && trends.length === 0 && !outcomeAnalytics.isLoading && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center">
          <Route className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No strategy path data yet.</p>
          <p className="text-slate-500 text-xs mt-1">Run the Pattern Engine aggregation from the Patterns tab to populate outcome analytics, temporal trends, and geographic hotspots.</p>
        </div>
      )}
    </div>
  );
}
