import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useWorldIndex } from "@/hooks/useWorldIndex";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Brain,
  Building2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Radio,
  Route,
  Shield,
  ArrowLeft,
  X,
  Filter,
  Compass,
  Satellite,
  Activity,
  Clock,
  BarChart3,
  MapPin,
  TrendingUp,
  Users,
  Zap,
  BookOpen,
  Scale,
  Landmark,
  Info,
} from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { SignalArtifactContext } from "@/components/signal-architecture/SignalArtifactContext";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SIGNAL_TYPE_ICONS: Record<string, typeof Activity> = {
  frequency_spike: BarChart3,
  geographic_cluster: MapPin,
  repeat_entity: Users,
  status_delay: Clock,
  trend_anomaly: TrendingUp,
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Interpretation Context Panel ───
function InterpretationContextPanel({ context }: { context: any }) {
  if (!context) return null;

  const hasLaws = context.relatedLaws?.length > 0;
  const hasAgencies = context.relatedAgencies?.length > 0;
  const hasRisk = context.riskType || context.riskDescription;
  const hasScope = context.scopeClassification;
  const hasAction = context.actionRecommendation;

  if (!hasLaws && !hasAgencies && !hasRisk && !hasScope && !hasAction) return null;

  return (
    <div className="p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-medium text-indigo-300">Interpretation Context</span>
        {context.templateUsed && (
          <Badge variant="outline" className="text-[9px] text-indigo-400 border-indigo-500/30 py-0">
            Template-enriched
          </Badge>
        )}
      </div>

      {hasRisk && (
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] font-medium text-amber-300">{context.riskType}</span>
            {context.riskDescription && (
              <p className="text-[10px] text-muted-foreground">{context.riskDescription}</p>
            )}
          </div>
        </div>
      )}

      {hasLaws && (
        <div className="flex items-start gap-2">
          <Scale className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
          <div className="flex flex-wrap gap-1">
            {context.relatedLaws.map((law: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[9px] text-blue-400 border-blue-500/30 py-0 font-normal">
                {law}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {hasAgencies && (
        <div className="flex items-start gap-2">
          <Landmark className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
          <div className="flex flex-wrap gap-1">
            {context.relatedAgencies.map((agency: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[9px] text-cyan-400 border-cyan-500/30 py-0 font-normal">
                {agency}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {hasScope && (
        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 text-green-400 shrink-0" />
          <span className="text-[10px] text-green-300">Scope: {context.scopeClassification}</span>
        </div>
      )}

      {hasAction && (
        <div className="flex items-start gap-2">
          <Info className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-purple-300">{context.actionRecommendation}</p>
        </div>
      )}
    </div>
  );
}

export default function StructuralDiagnosticsLens() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  // ─── Context from Case Resolution handoff ───
  const handoffClaimType = params.get("claimType") || "";
  const handoffJurisdiction = params.get("jurisdiction") || "";
  const handoffDomain = params.get("domain") || "";
  const hasHandoff = !!(handoffClaimType || handoffJurisdiction);

  // ─── Filter state (initialized from URL params) ───
  const [filterClaimType, setFilterClaimType] = useState(handoffClaimType);
  const [filterJurisdiction, setFilterJurisdiction] = useState(handoffJurisdiction);
  const [filterDomain, setFilterDomain] = useState(handoffDomain);
  const [activeTab, setActiveTab] = useState("barriers");
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [expandedLiveGroup, setExpandedLiveGroup] = useState<string | null>(null);

  // Sync URL params on mount (in case of navigation)
  useEffect(() => {
    if (handoffClaimType) setFilterClaimType(handoffClaimType);
    if (handoffJurisdiction) setFilterJurisdiction(handoffJurisdiction);
    if (handoffDomain) setFilterDomain(handoffDomain);
  }, [handoffClaimType, handoffJurisdiction, handoffDomain]);

  const hasActiveFilter = !!(filterClaimType || filterJurisdiction || filterDomain);

  // ─── Build filter keywords for client-side filtering ───
  const filterKeywords = useMemo(() => {
    const words: string[] = [];
    if (filterClaimType) {
      words.push(...filterClaimType.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2));
    }
    if (filterJurisdiction) {
      words.push(filterJurisdiction.toLowerCase());
    }
    if (filterDomain) {
      words.push(...filterDomain.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2));
    }
    return words;
  }, [filterClaimType, filterJurisdiction, filterDomain]);

  function clearFilters() {
    setFilterClaimType("");
    setFilterJurisdiction("");
    setFilterDomain("");
    // Also clear URL params
    navigate("/diagnostics", { replace: true });
  }

  // ─── World Index (unified data source) ───
  const worldIndex = useWorldIndex();
  const worldSignals = useMemo(() => {
    const all = worldIndex.nodesByType["signal"] ?? [];
    if (!filterJurisdiction) return all;
    return all.filter(s => s.jurisdiction === filterJurisdiction);
  }, [worldIndex.nodesByType, filterJurisdiction]);
  const worldAgencies = worldIndex.nodesByType["agency"] ?? [];
  const worldPrograms = worldIndex.nodesByType["program"] ?? [];

  // ─── Queries ───
  const barrierClusters = trpc.dualLens.getBarrierClusters.useQuery({});
  const doctrineClusters = trpc.dualLens.getDoctrineClusters.useQuery({});
  const institutions = trpc.dualLens.getAffectedInstitutions.useQuery({});
  const signalPatterns = trpc.dualLens.getSignalPatterns.useQuery({});
  const systemicPaths = trpc.dualLens.getSystemicPaths.useQuery({});
  const stats = trpc.dualLens.stats.useQuery();

  // Live signals queries
  const detectedSignalsQuery = trpc.dualLens.getLiveSignalsForDiagnostics.useQuery({
    jurisdiction: filterJurisdiction || undefined,
    domain: filterDomain || undefined,
  });
  const liveSignalSummary = trpc.dualLens.getLiveSignalSummary.useQuery();

  // ─── Client-side filtering helpers ───
  function matchesFilter(text: string): boolean {
    if (!hasActiveFilter || filterKeywords.length === 0) return true;
    const lower = text.toLowerCase();
    return filterKeywords.some(kw => lower.includes(kw));
  }

  // Filter barrier clusters
  const filteredBarrierClusters = useMemo(() => {
    if (!barrierClusters.data || !hasActiveFilter) return barrierClusters.data;
    const filtered = barrierClusters.data.clusters
      .map(cluster => {
        const filteredBarriers = cluster.barriers.filter(b => {
          const text = [b.barrierType, b.name, b.description, b.domains ? JSON.stringify(b.domains) : ""].join(" ");
          return matchesFilter(text);
        });
        return filteredBarriers.length > 0 ? { ...cluster, count: filteredBarriers.length, barriers: filteredBarriers } : null;
      })
      .filter(Boolean) as typeof barrierClusters.data.clusters;
    return { clusters: filtered, totalBarriers: filtered.reduce((sum, c) => sum + c.count, 0) };
  }, [barrierClusters.data, filterKeywords, hasActiveFilter]);

  // Filter doctrine clusters
  const filteredDoctrineClusters = useMemo(() => {
    if (!doctrineClusters.data || !hasActiveFilter) return doctrineClusters.data;
    const filtered = doctrineClusters.data.clusters
      .map(cluster => {
        const filteredDoctrines = cluster.doctrines.filter(d => {
          const text = [d.name, d.description, d.domains ? JSON.stringify(d.domains) : ""].join(" ");
          return matchesFilter(text);
        });
        return filteredDoctrines.length > 0 ? { ...cluster, count: filteredDoctrines.length, doctrines: filteredDoctrines } : null;
      })
      .filter(Boolean) as typeof doctrineClusters.data.clusters;
    return { clusters: filtered, totalDoctrines: filtered.reduce((sum, c) => sum + c.count, 0), doctrineEdges: doctrineClusters.data.doctrineEdges };
  }, [doctrineClusters.data, filterKeywords, hasActiveFilter]);

  // Filter institutions
  const filteredInstitutions = useMemo(() => {
    if (!institutions.data || !hasActiveFilter) return institutions.data;
    const filtered = institutions.data.institutions.filter(inst => {
      const text = [inst.agency, inst.agencyShort, inst.domain].join(" ");
      return matchesFilter(text);
    });
    return { institutions: filtered, totalAgencies: institutions.data.totalAgencies, totalSignals: institutions.data.totalSignals };
  }, [institutions.data, filterKeywords, hasActiveFilter]);

  // Filter signal patterns
  const filteredSignalPatterns = useMemo(() => {
    if (!signalPatterns.data || !hasActiveFilter) return signalPatterns.data;
    const filtered = signalPatterns.data.patterns
      .map(pattern => {
        const filteredSignals = pattern.signals.filter((s: any) => {
          const text = [s.signalType, s.signalId, s.explanation].join(" ");
          return matchesFilter(text);
        });
        return filteredSignals.length > 0 ? { ...pattern, count: filteredSignals.length, signals: filteredSignals } : null;
      })
      .filter(Boolean) as typeof signalPatterns.data.patterns;
    return { patterns: filtered, totalSignals: filtered.reduce((sum, p) => sum + p.count, 0) };
  }, [signalPatterns.data, filterKeywords, hasActiveFilter]);

  // Filter systemic paths
  const filteredSystemicPaths = useMemo(() => {
    if (!systemicPaths.data || !hasActiveFilter) return systemicPaths.data;
    const filtered = systemicPaths.data.paths.filter(p => {
      const text = [p.barrier, p.doctrineLink, p.statuteLink, p.reformPath].join(" ");
      return matchesFilter(text);
    });
    return { paths: filtered, totalBarriers: systemicPaths.data.totalBarriers, totalDoctrines: systemicPaths.data.totalDoctrines };
  }, [systemicPaths.data, filterKeywords, hasActiveFilter]);

  // Filter live signals
  const filteredLiveSignals = useMemo(() => {
    if (!detectedSignalsQuery.data || !hasActiveFilter) return detectedSignalsQuery.data;
    const filtered = detectedSignalsQuery.data.groups
      .map(group => {
        const filteredSignals = group.signals.filter(s => {
          const text = [s.signalType, s.title, s.explanation, s.jurisdiction, s.domain].join(" ");
          return matchesFilter(text);
        });
        return filteredSignals.length > 0 ? { ...group, count: filteredSignals.length, signals: filteredSignals } : null;
      })
      .filter(Boolean) as typeof detectedSignalsQuery.data.groups;
    return {
      groups: filtered,
      totalSignals: filtered.reduce((sum, g) => sum + g.count, 0),
      uniqueTypes: filtered.length,
      uniqueDatasets: detectedSignalsQuery.data.uniqueDatasets,
    };
  }, [detectedSignalsQuery.data, filterKeywords, hasActiveFilter]);

  const liveSignalCount = liveSignalSummary.data?.totalActive ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <SignalArtifactContext />
      </div>
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/resolve")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Case Resolution
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">Structural Diagnostics</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Layers className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Structural Diagnostics</h1>
              <p className="text-sm text-muted-foreground">
                Systemic patterns, barrier clusters, institutional analysis, and live data signals
              </p>
            </div>
          </div>

          {/* Handoff context banner */}
          {hasHandoff && (
            <div className="mt-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Compass className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-purple-300">
                      Filtered from Case Resolution
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Showing systemic patterns related to{" "}
                      <span className="text-purple-400 font-medium">{handoffClaimType}</span>
                      {handoffJurisdiction && (
                        <> in <span className="text-purple-400 font-medium">{handoffJurisdiction}</span></>
                      )}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="w-3.5 h-3.5 mr-1" /> Clear Filter
                </Button>
              </div>
            </div>
          )}

          {/* Manual filter controls */}
          {!hasHandoff && (
            <div className="mt-4 flex items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterClaimType || "__all__"} onValueChange={v => setFilterClaimType(v === "__all__" ? "" : v)}>
                <SelectTrigger className="max-w-[200px] h-8 text-sm">
                  <SelectValue placeholder="Filter by claim type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All claim types</SelectItem>
                  <SelectItem value="benefits">Benefits</SelectItem>
                  <SelectItem value="civil_rights">Civil Rights</SelectItem>
                  <SelectItem value="employment">Employment</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="oversight">Oversight</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterJurisdiction || "__all__"} onValueChange={v => setFilterJurisdiction(v === "__all__" ? "" : v)}>
                <SelectTrigger className="max-w-[180px] h-8 text-sm">
                  <SelectValue placeholder="Jurisdiction..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All jurisdictions</SelectItem>
                  {["j_alabama","j_american_samoa","j_arkansas","j_connecticut","j_guam","j_hawaii","j_kansas","j_louisiana","j_massachusetts","j_mississippi","j_montana","j_new_hampshire","j_north_carolina","j_north_dakota","j_northern_mariana_islands","j_oklahoma","j_puerto_rico","j_south_carolina","j_south_dakota","j_tennessee","j_us_virgin_islands","j_utah","j_wyoming"].map(j => (
                    <SelectItem key={j} value={j}>{j.replace(/^j_/, "").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterDomain || "__all__"} onValueChange={v => setFilterDomain(v === "__all__" ? "" : v)}>
                <SelectTrigger className="max-w-[180px] h-8 text-sm">
                  <SelectValue placeholder="Domain..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All domains</SelectItem>
                  {["civil_rights","consumer_fraud","employment","employment_discrimination","fair_housing","food_nutrition","general","healthcare","housing","unemployment","wage_theft"].map(d => (
                    <SelectItem key={d} value={d}>{d.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-8">
                  <X className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          )}

          {/* Stats bar */}
          {stats.data && (
            <div className="flex gap-6 mt-4 text-sm flex-wrap">
              <div>
                <span className="text-muted-foreground">Doctrines:</span>{" "}
                <span className="font-medium">{stats.data.structuralDiagnostics.doctrines}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Signals:</span>{" "}
                <span className="font-medium">{stats.data.structuralDiagnostics.signals}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Barriers:</span>{" "}
                <span className="font-medium">{stats.data.structuralDiagnostics.barriers}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Graph Edges:</span>{" "}
                <span className="font-medium">{stats.data.graph.edges}</span>
              </div>
              {liveSignalCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Satellite className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-muted-foreground">Live Signals:</span>{" "}
                  <span className="font-medium text-emerald-400">{liveSignalCount}</span>
                  {liveSignalSummary.data?.lastDetectedAt && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (latest: {formatTimeAgo(liveSignalSummary.data.lastDetectedAt)})
                    </span>
                  )}
                </div>
              )}
              {!worldIndex.isLoading && (
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-muted-foreground">World Index:</span>{" "}
                  <span className="font-medium text-blue-400">{worldIndex.counts.totalNodes} nodes</span>
                  <span className="text-xs text-muted-foreground">({worldSignals.length} signals, {worldAgencies.length} agencies, {worldPrograms.length} programs)</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="barriers" className="gap-2">
              <AlertTriangle className="w-4 h-4" /> Barrier Clusters
              {hasActiveFilter && filteredBarrierClusters && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredBarrierClusters.totalBarriers}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="doctrines" className="gap-2">
              <Brain className="w-4 h-4" /> Doctrine Map
              {hasActiveFilter && filteredDoctrineClusters && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredDoctrineClusters.totalDoctrines}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="institutions" className="gap-2">
              <Building2 className="w-4 h-4" /> Institutions
              {hasActiveFilter && filteredInstitutions && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredInstitutions.institutions.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="signals" className="gap-2">
              <Radio className="w-4 h-4" /> Signal Patterns
              {hasActiveFilter && filteredSignalPatterns && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredSignalPatterns.totalSignals}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="paths" className="gap-2">
              <Route className="w-4 h-4" /> Systemic Paths
              {hasActiveFilter && filteredSystemicPaths && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredSystemicPaths.paths.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <Satellite className="w-4 h-4" /> Live Data
              {liveSignalCount > 0 && (
                <Badge className="ml-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {liveSignalCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Barrier Clusters */}
          <TabsContent value="barriers">
            {barrierClusters.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading barrier analysis...</div>
            ) : filteredBarrierClusters ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredBarrierClusters.totalBarriers} barriers
                  {hasActiveFilter && barrierClusters.data && filteredBarrierClusters.totalBarriers !== barrierClusters.data.totalBarriers && (
                    <span className="text-purple-400"> (filtered from {barrierClusters.data.totalBarriers})</span>
                  )}
                  {" "}grouped into {filteredBarrierClusters.clusters.length} clusters by type
                </p>
                {filteredBarrierClusters.clusters.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <AlertTriangle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No barrier clusters match the current filter.</p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear filter to see all</Button>
                    </CardContent>
                  </Card>
                )}
                {filteredBarrierClusters.clusters.map((cluster) => (
                  <Card key={cluster.type} className="bg-card/50 border-border/50">
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => setExpandedCluster(expandedCluster === cluster.type ? null : cluster.type)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedCluster === cluster.type ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div>
                            <CardTitle className="text-base">{cluster.type.replace(/_/g, " ")}</CardTitle>
                            <CardDescription>{cluster.count} barriers in this cluster</CardDescription>
                          </div>
                        </div>
                        <Badge className={SEVERITY_COLORS[cluster.severity] || SEVERITY_COLORS.low}>
                          {cluster.severity}
                        </Badge>
                      </div>
                    </CardHeader>
                    {expandedCluster === cluster.type && (
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {cluster.barriers.map((b: any) => (
                            <div key={b.id} className="p-3 rounded-lg bg-background/50 border border-border/30">
                              <div className="flex items-start justify-between mb-1">
                                <span className="font-medium text-sm">{b.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {b.barrierId}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{b.description}</p>
                              {b.whatItBlocks && (
                                <p className="text-xs text-orange-400 mt-1">
                                  Blocks: {typeof b.whatItBlocks === "string" ? b.whatItBlocks : JSON.stringify(b.whatItBlocks)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : null}
          </TabsContent>

          {/* Doctrine Map */}
          <TabsContent value="doctrines">
            {doctrineClusters.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading doctrine analysis...</div>
            ) : filteredDoctrineClusters ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredDoctrineClusters.totalDoctrines} doctrines
                  {hasActiveFilter && doctrineClusters.data && filteredDoctrineClusters.totalDoctrines !== doctrineClusters.data.totalDoctrines && (
                    <span className="text-purple-400"> (filtered from {doctrineClusters.data.totalDoctrines})</span>
                  )}
                  {" "}across {filteredDoctrineClusters.clusters.length} domains,
                  connected by {filteredDoctrineClusters.doctrineEdges} graph edges
                </p>
                {filteredDoctrineClusters.clusters.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No doctrine clusters match the current filter.</p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear filter to see all</Button>
                    </CardContent>
                  </Card>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredDoctrineClusters.clusters.map((cluster) => (
                    <Card key={cluster.category} className="bg-card/50 border-border/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-purple-400" />
                          <CardTitle className="text-sm capitalize">{cluster.category}</CardTitle>
                          <Badge variant="outline" className="ml-auto">{cluster.count}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {cluster.doctrines.slice(0, 5).map((d: any) => (
                            <div key={d.id} className="text-xs text-muted-foreground flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />
                              <span>{d.name}</span>
                            </div>
                          ))}
                          {cluster.doctrines.length > 5 && (
                            <div className="text-xs text-muted-foreground pl-4">
                              +{cluster.doctrines.length - 5} more
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* Affected Institutions */}
          <TabsContent value="institutions">
            {institutions.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading institutional analysis...</div>
            ) : filteredInstitutions ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredInstitutions.institutions.length} institutions with detected issues
                  {hasActiveFilter && institutions.data && filteredInstitutions.institutions.length !== institutions.data.institutions.length && (
                    <span className="text-purple-400"> (filtered from {institutions.data.institutions.length})</span>
                  )}
                  {" "}out of {filteredInstitutions.totalAgencies} total agencies
                </p>
                {filteredInstitutions.institutions.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <Building2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No institutions match the current filter.</p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear filter to see all</Button>
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-3">
                  {filteredInstitutions.institutions.map((inst) => (
                    <Card key={inst.id} className="bg-card/50 border-border/50">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Building2 className="w-5 h-5 text-amber-400" />
                            <div>
                              <div className="font-medium text-sm">{inst.agencyShort || inst.agency}</div>
                              <div className="text-xs text-muted-foreground">{inst.domain}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-center">
                              <div className="font-medium text-amber-400">{inst.signalCount}</div>
                              <div className="text-muted-foreground">Signals</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-red-400">{inst.barrierCount}</div>
                              <div className="text-muted-foreground">Barriers</div>
                            </div>
                            <div className="text-center">
                              <div className="font-bold text-orange-400">{inst.issueScore}</div>
                              <div className="text-muted-foreground">Score</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* Signal Patterns */}
          <TabsContent value="signals">
            {signalPatterns.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading signal analysis...</div>
            ) : filteredSignalPatterns ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredSignalPatterns.totalSignals} signals
                  {hasActiveFilter && signalPatterns.data && filteredSignalPatterns.totalSignals !== signalPatterns.data.totalSignals && (
                    <span className="text-purple-400"> (filtered from {signalPatterns.data.totalSignals})</span>
                  )}
                  {" "}grouped into {filteredSignalPatterns.patterns.length} pattern types
                </p>
                {filteredSignalPatterns.patterns.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <Radio className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No signal patterns match the current filter.</p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear filter to see all</Button>
                    </CardContent>
                  </Card>
                )}
                {filteredSignalPatterns.patterns.map((pattern) => (
                  <Card key={pattern.type} className="bg-card/50 border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-cyan-400" />
                          <CardTitle className="text-sm">{pattern.type.replace(/_/g, " ")}</CardTitle>
                        </div>
                        <Badge variant="outline">{pattern.count} signals</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {pattern.signals.slice(0, 3).map((s: any) => (
                          <div key={s.id} className="text-xs text-muted-foreground p-2 rounded bg-background/50">
                            <span className="font-medium text-foreground">{s.signalId}</span>
                            {" — "}
                            {s.explanation}
                          </div>
                        ))}
                        {pattern.signals.length > 3 && (
                          <div className="text-xs text-muted-foreground">+{pattern.signals.length - 3} more</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </TabsContent>

          {/* Systemic Paths */}
          <TabsContent value="paths">
            {systemicPaths.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading systemic analysis...</div>
            ) : filteredSystemicPaths ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredSystemicPaths.paths.length} systemic reform paths
                  {hasActiveFilter && systemicPaths.data && filteredSystemicPaths.paths.length !== systemicPaths.data.paths.length && (
                    <span className="text-purple-400"> (filtered from {systemicPaths.data.paths.length})</span>
                  )}
                  {" "}identified from {filteredSystemicPaths.totalBarriers} barriers
                </p>
                {filteredSystemicPaths.paths.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <Route className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No systemic paths match the current filter.</p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">Clear filter to see all</Button>
                    </CardContent>
                  </Card>
                )}
                {filteredSystemicPaths.paths.map((path, i) => (
                  <Card key={i} className="bg-card/50 border-border/50">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{path.barrier.replace(/_/g, " ")}</span>
                            <Badge className={SEVERITY_COLORS[path.severity] || SEVERITY_COLORS.medium}>
                              {path.severity}
                            </Badge>
                          </div>
                          <div className="flex gap-4 text-xs">
                            {path.doctrineLink && (
                              <div>
                                <span className="text-muted-foreground">Doctrine:</span>{" "}
                                <span className="text-purple-400">{path.doctrineLink}</span>
                              </div>
                            )}
                            {path.statuteLink && (
                              <div>
                                <span className="text-muted-foreground">Statute:</span>{" "}
                                <span className="text-cyan-400">{path.statuteLink}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="text-foreground font-medium">Reform path:</span>{" "}
                            {path.reformPath.length > 200 ? path.reformPath.slice(0, 200) + "..." : path.reformPath}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* LIVE DATA SIGNALS — from ingestion pipeline                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="live">
            {detectedSignalsQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading live data signals...</div>
            ) : (
              <div className="space-y-6">
                {/* Live Signal Summary Cards */}
                {liveSignalSummary.data && liveSignalSummary.data.totalActive > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-card/50 border-border/50">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Satellite className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-muted-foreground">Active Signals</span>
                        </div>
                        <div className="text-2xl font-bold text-emerald-400">{liveSignalSummary.data.totalActive}</div>
                      </CardContent>
                    </Card>
                    {Object.entries(liveSignalSummary.data.bySeverity).map(([severity, cnt]) => (
                      <Card key={severity} className="bg-card/50 border-border/50">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="w-4 h-4" />
                            <span className="text-xs text-muted-foreground capitalize">{severity}</span>
                          </div>
                          <div className="text-2xl font-bold">
                            <Badge className={`${SEVERITY_COLORS[severity]} text-lg px-2 py-0.5`}>{cnt}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Description */}
                <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-start gap-3">
                    <Satellite className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-300 mb-1">
                        Live Data Intelligence
                      </p>
                      <p className="text-xs text-muted-foreground">
                        These signals are automatically detected from government datasets ingested through the Luminari pipeline.
                        The system analyzes records for frequency spikes, geographic clustering, repeat entities, status delays,
                        and year-over-year trend anomalies. Each signal includes a plain-language explanation and supporting statistics.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Signal count summary */}
                {filteredLiveSignals && (
                  <p className="text-sm text-muted-foreground">
                    {filteredLiveSignals.totalSignals} live signals
                    {hasActiveFilter && detectedSignalsQuery.data && filteredLiveSignals.totalSignals !== detectedSignalsQuery.data.totalSignals && (
                      <span className="text-emerald-400"> (filtered from {detectedSignalsQuery.data.totalSignals})</span>
                    )}
                    {" "}across {filteredLiveSignals.uniqueTypes} detection types
                    {filteredLiveSignals.uniqueDatasets > 0 && (
                      <> from {filteredLiveSignals.uniqueDatasets} dataset{filteredLiveSignals.uniqueDatasets !== 1 ? "s" : ""}</>
                    )}
                  </p>
                )}

                {/* Empty state */}
                {filteredLiveSignals && filteredLiveSignals.totalSignals === 0 && (
                  <Card className="border-border/30">
                    <CardContent className="py-12 text-center">
                      <Satellite className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-2">
                        {hasActiveFilter
                          ? "No live signals match the current filter."
                          : "No live signals detected yet."}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        {hasActiveFilter
                          ? "Try broadening your filter criteria or clearing filters to see all signals."
                          : "Live signals will appear here after the ingestion pipeline processes government datasets. Admins can trigger ingestion from Mission Control."}
                      </p>
                      {hasActiveFilter && (
                        <Button variant="link" size="sm" onClick={clearFilters} className="mt-3">Clear filter to see all</Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Signal Groups */}
                {filteredLiveSignals && filteredLiveSignals.groups.map((group) => {
                  const IconComponent = SIGNAL_TYPE_ICONS[group.type] || Activity;
                  const isExpanded = expandedLiveGroup === group.type;

                  return (
                    <Card key={group.type} className="bg-card/50 border-border/50">
                      <CardHeader
                        className="cursor-pointer"
                        onClick={() => setExpandedLiveGroup(isExpanded ? null : group.type)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <IconComponent className="w-5 h-5 text-emerald-400" />
                            <div>
                              <CardTitle className="text-base capitalize">
                                {group.type.replace(/_/g, " ")}
                              </CardTitle>
                              <CardDescription>
                                {group.count} signal{group.count !== 1 ? "s" : ""} detected
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                            {group.count}
                          </Badge>
                        </div>
                      </CardHeader>
                      {isExpanded && (
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            {group.signals.map((signal) => (
                              <div
                                key={signal.id}
                                className="p-4 rounded-lg bg-background/50 border border-border/30 space-y-3"
                              >
                                {/* Signal header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      {signal.signalType === "repeat_entity" && (signal as any).entityRole && (
                                        <span className="text-[10px] text-muted-foreground font-medium">
                                          {(signal as any).entityRole === "business" || (signal as any).entityRole === "respondent" ? "Company:" : (signal as any).entityRole === "agency" ? "Agency:" : (signal as any).entityRole === "organization" ? "Organization:" : null}
                                        </span>
                                      )}
                                      <span className="font-medium text-sm">
                                        {(signal as any).canonicalEntityName && signal.signalType === "repeat_entity"
                                          ? (signal as any).canonicalEntityName
                                          : signal.title}
                                      </span>
                                      <Badge className={SEVERITY_COLORS[signal.severity] || SEVERITY_COLORS.medium}>
                                        {signal.severity}
                                      </Badge>
                                      {(signal as any).entityType && signal.signalType === "repeat_entity" && (
                                        <Badge variant="outline" className={`text-[10px] ${
                                          (signal as any).entityType === "corporation" ? "text-blue-400 border-blue-500/30" :
                                          (signal as any).entityType === "financial_institution" ? "text-emerald-400 border-emerald-500/30" :
                                          (signal as any).entityType === "telecom_company" ? "text-indigo-400 border-indigo-500/30" :
                                          (signal as any).entityType === "government_agency" ? "text-amber-400 border-amber-500/30" :
                                          (signal as any).entityType === "landlord_entity" ? "text-orange-400 border-orange-500/30" :
                                          (signal as any).entityType === "media_company" ? "text-pink-400 border-pink-500/30" :
                                          "text-gray-400 border-gray-500/30"
                                        }`}>
                                          {((signal as any).entityType as string).replace(/_/g, " ")}
                                        </Badge>
                                      )}
                                      {signal.matchesKnownPattern && (
                                        <Badge variant="outline" className="text-purple-400 border-purple-500/30 text-[10px]">
                                          Known Pattern
                                        </Badge>
                                      )}
                                    </div>
                                    {(signal as any).entityAliasesJson && (signal as any).entityAliasesJson.length > 0 && (
                                      <div className="text-[10px] text-muted-foreground">
                                        Also known as: {((signal as any).entityAliasesJson as string[]).join(", ")}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span>{signal.jurisdiction}</span>
                                      <span className="text-border">|</span>
                                      <span>{signal.domain.replace(/_/g, " ")}</span>
                                      <span className="text-border">|</span>
                                      <span>{signal.datasetName}</span>
                                      <span className="text-border">|</span>
                                      <span>{formatTimeAgo(signal.detectedAt)}</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-xs text-muted-foreground">Confidence</div>
                                    <div className="text-sm font-medium text-emerald-400">
                                      {(parseFloat(signal.confidenceScore) * 100).toFixed(0)}%
                                    </div>
                                  </div>
                                </div>

                                {/* Explanation */}
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {signal.explanation}
                                </p>

                                {/* Supporting Statistics */}
                                {signal.supportingStatistics && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="p-2 rounded bg-card/80 border border-border/20">
                                      <div className="text-[10px] text-muted-foreground">Records Analyzed</div>
                                      <div className="text-sm font-medium">
                                        {signal.supportingStatistics.recordsAnalyzed?.toLocaleString() ?? "—"}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded bg-card/80 border border-border/20">
                                      <div className="text-[10px] text-muted-foreground">Pattern Count</div>
                                      <div className="text-sm font-medium">
                                        {signal.supportingStatistics.patternCount?.toLocaleString() ?? "—"}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded bg-card/80 border border-border/20">
                                      <div className="text-[10px] text-muted-foreground">% Affected</div>
                                      <div className="text-sm font-medium">
                                        {signal.supportingStatistics.percentageAffected != null
                                          ? `${signal.supportingStatistics.percentageAffected}%`
                                          : "—"}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded bg-card/80 border border-border/20">
                                      <div className="text-[10px] text-muted-foreground">Jurisdictions</div>
                                      <div className="text-sm font-medium">
                                        {signal.supportingStatistics.jurisdictionsAffected?.length ?? 0}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Additional Metrics */}
                                {signal.supportingStatistics?.additionalMetrics && (
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(signal.supportingStatistics.additionalMetrics).map(([key, val]) => (
                                      <Badge key={key} variant="outline" className="text-[10px] font-normal">
                                        {key.replace(/([A-Z])/g, " $1").trim()}: {typeof val === "number" ? (val as number).toLocaleString() : String(val)}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {/* Interpretation Context */}
                                {signal.supportingStatistics?.interpretationContext && (
                                  <InterpretationContextPanel context={signal.supportingStatistics.interpretationContext} />
                                )}

                                {/* Pattern Summary */}
                                <div className="text-[11px] text-muted-foreground/70 italic border-t border-border/20 pt-2">
                                  {signal.patternSummary}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
