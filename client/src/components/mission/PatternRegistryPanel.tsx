import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Users, GitBranch, RefreshCw, Loader2, TrendingUp, AlertTriangle } from "lucide-react";
import { useState } from "react";

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

export function PatternRegistryPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const utils = trpc.useUtils();

  const entityClusters = trpc.patternEngine.getEntityClusters.useQuery();
  const conductClusters = trpc.patternEngine.getConductClusters.useQuery();
  const systemicInferences = trpc.patternEngine.getSystemicInferences.useQuery();
  const caseLinks = trpc.patternEngine.getCaseLinks.useQuery();
  const aggregationRuns = trpc.patternEngine.getAggregationRuns.useQuery();

  const runAggregation = trpc.patternEngine.runFullAggregation.useMutation({
    onSuccess: () => {
      utils.patternEngine.getEntityClusters.invalidate();
      utils.patternEngine.getConductClusters.invalidate();
      utils.patternEngine.getSystemicInferences.invalidate();
      utils.patternEngine.getCaseLinks.invalidate();
      utils.patternEngine.getAggregationRuns.invalidate();
      setIsRunning(false);
    },
    onError: () => setIsRunning(false),
  });

  const handleRun = () => {
    setIsRunning(true);
    runAggregation.mutate();
  };

  const entities = entityClusters.data ?? [];
  const conducts = conductClusters.data ?? [];
  const inferences = systemicInferences.data ?? [];
  const links = caseLinks.data ?? [];
  const runs = aggregationRuns.data ?? [];
  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Network className="h-5 w-5 text-violet-400" />
            Pattern Registry
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Cross-case entity clusters, conduct patterns, and systemic inferences
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRun}
          disabled={isRunning || runAggregation.isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {(isRunning || runAggregation.isPending) ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Running...</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Run Aggregation</>
          )}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Entity Clusters" value={String(entities.length)} icon={<Users className="h-3.5 w-3.5" />} color="violet" />
        <MetricCard label="Conduct Patterns" value={String(conducts.length)} icon={<GitBranch className="h-3.5 w-3.5" />} color="amber" />
        <MetricCard label="Systemic Inferences" value={String(inferences.length)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="blue" />
        <MetricCard label="Case Links" value={String(links.length)} icon={<Network className="h-3.5 w-3.5" />} color="emerald" />
      </div>

      {/* Last run info */}
      {lastRun && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
          Last aggregation: <span className="text-slate-200">{new Date(lastRun.runAt ?? lastRun.createdAt ?? Date.now()).toLocaleString()}</span>
          {lastRun.entityClustersDetected != null && (
            <span className="ml-3">
              {lastRun.entityClustersDetected} entity clusters · {lastRun.conductClustersDetected ?? 0} conduct clusters
            </span>
          )}
        </div>
      )}

      {/* Entity Clusters */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            Entity Clusters ({entities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entityClusters.isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
          ) : entities.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-4">
              No entity clusters yet. Run aggregation to detect cross-case entity patterns.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entities.slice(0, 20).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-slate-200">{e.entityName}</span>
                    {e.entityType && <span className="text-xs text-slate-500 ml-2">{e.entityType}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-violet-700 text-violet-400">
                      {e.caseCount ?? (e.caseIds?.length ?? 0)} cases
                    </Badge>
                    {e.riskScore && Number(e.riskScore) > 70 && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conduct Clusters */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-amber-400" />
            Conduct Patterns ({conducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conductClusters.isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
          ) : conducts.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-4">
              No conduct patterns yet. Run aggregation to detect recurring misconduct types.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {conducts.slice(0, 20).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-slate-200">{c.conductType}</span>
                    {c.conductCategory && <span className="text-xs text-slate-500 ml-2">{c.conductCategory}</span>}
                    {c.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">
                    {c.caseCount ?? (c.caseIds?.length ?? 0)} cases
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Systemic Inferences */}
      {inferences.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              Systemic Inferences ({inferences.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {inferences.slice(0, 10).map((inf: any, i: number) => (
                <div key={i} className="py-2 border-b border-slate-800 last:border-0">
                  <p className="text-sm text-slate-300">{inf.inference ?? inf.description ?? JSON.stringify(inf)}</p>
                  {inf.confidence && (
                    <span className="text-xs text-slate-500">Confidence: {Math.round(Number(inf.confidence) * 100)}%</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
