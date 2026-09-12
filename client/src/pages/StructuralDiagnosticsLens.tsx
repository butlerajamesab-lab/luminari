import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { useWorldIndex } from "@/hooks/useWorldIndex";
import { diagnosticsView } from "@/lib/diagnosticsView";
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
  unclassified: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const SIGNAL_TYPE_ICONS: Record<string, typeof Activity> = {
  frequency_spike: BarChart3,
  geographic_cluster: MapPin,
  repeat_entity: Users,
  status_delay: Clock,
  trend_anomaly: TrendingUp,
};

export function formatTimeAgo(ts: number | string | Date | null): string {
  if (ts == null) return "Date not recorded";
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(time)) return "Date unresolved";
  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatRecordedConfidence(value: string | null): string {
  if (value == null || value.trim() === "") return "Not recorded";
  const confidence = Number(value);
  return Number.isFinite(confidence) ? `${(confidence * 100).toFixed(0)}%` : "Not recorded";
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

function DiagnosticsReadError({ error, hasData, retry, label }: { error: { message: string }; hasData: boolean; retry: () => void; label: string }) {
  return <div role="alert" className="mb-4 rounded-lg border border-red-500/30 p-3 text-sm">
    <p>{label} could not refresh. {hasData ? "The last successful result remains visible." : "Results are unavailable."}</p>
    <p className="text-muted-foreground">{error.message}</p>
    <Button size="sm" variant="outline" className="mt-2" onClick={retry}>Retry {label.toLowerCase()}</Button>
  </div>;
}

function DiagnosticsReferenceContext() {
  const worldIndex = useWorldIndex();
  if (worldIndex.isLoading) return <p role="status">Loading reference context…</p>;
  if (worldIndex.error) return <p role="alert">Reference context is unavailable: {worldIndex.error.message}</p>;
  return <p className="mt-2 text-muted-foreground">Bounded World Index sample: {worldIndex.counts.totalNodes} nodes ({worldIndex.counts.signals} signals, {worldIndex.counts.agencies} agencies, {worldIndex.counts.programs} programs).</p>;
}

export default function StructuralDiagnosticsLens() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  // ─── Context from Case Resolution handoff ───
  const { user } = useAuth();
  const handoffClaimType = params.get("claimType") || "";
  const handoffJurisdiction = params.get("jurisdiction") || "";
  const handoffDomain = params.get("domain") || "";
  const hasHandoff = !!(handoffClaimType || handoffJurisdiction);

  // ─── Filter state (initialized from URL params) ───
  const [filterClaimType, setFilterClaimType] = useState(handoffClaimType);
  const [filterJurisdiction, setFilterJurisdiction] = useState(handoffJurisdiction);
  const [filterDomain, setFilterDomain] = useState(handoffDomain);
  const [activeTab, setActiveTab] = useState<"barriers" | "doctrines" | "institutions" | "signals" | "paths" | "live">("barriers");
  const [showReferenceContext, setShowReferenceContext] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [expandedLiveGroup, setExpandedLiveGroup] = useState<string | null>(null);
  const [doctrineOffset, setDoctrineOffset] = useState(0);
  const [doctrineSearch, setDoctrineSearch] = useState("");
  const [doctrineSearchQuery, setDoctrineSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDoctrineSearchQuery(doctrineSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [doctrineSearch]);
  useEffect(() => {
    setDoctrineOffset(0);
  }, [filterClaimType, filterJurisdiction, filterDomain, doctrineSearchQuery]);

  // Sync URL params on mount (in case of navigation)
  useEffect(() => {
    setFilterClaimType(handoffClaimType);
    setFilterJurisdiction(handoffJurisdiction);
    setFilterDomain(handoffDomain);
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
    setDoctrineSearch("");
    setDoctrineSearchQuery("");
    setDoctrineOffset(0);
    // Also clear URL params
    navigate("/diagnostics", { replace: true });
  }

  // Load the selected lens only; unrelated reads must not delay this table.
  const barrierClusters = trpc.dualLens.getBarrierClusters.useQuery({ domain: filterDomain || undefined }, { enabled: activeTab === "barriers", select: diagnosticsView.barriers });
  const doctrineClusters = trpc.dualLens.getDoctrineClusters.useQuery({
    keywords: filterKeywords,
    search: doctrineSearchQuery,
    offset: doctrineOffset,
    limit: 100,
  }, { enabled: activeTab === "doctrines", select: diagnosticsView.doctrines });
  const institutions = trpc.dualLens.getAffectedInstitutions.useQuery({ domain: filterDomain || undefined }, { enabled: activeTab === "institutions", select: diagnosticsView.institutions });
  const signalPatterns = trpc.dualLens.getSignalPatterns.useQuery({ domain: filterDomain || undefined }, { enabled: activeTab === "signals", select: diagnosticsView.signals });
  const systemicPaths = trpc.dualLens.getSystemicPaths.useQuery({ domain: filterDomain || undefined }, { enabled: activeTab === "paths", select: diagnosticsView.paths });
  const [liveOffset, setLiveOffset] = useState(0);
  useEffect(() => setLiveOffset(0), [filterJurisdiction, filterDomain, filterClaimType]);
  const stats = trpc.dualLens.stats.useQuery(undefined, { select: diagnosticsView.stats });
  const detectedSignalsQuery = trpc.dualLens.getLiveSignalsForDiagnostics.useQuery({
    jurisdiction: filterJurisdiction || undefined,
    domain: filterDomain || undefined,
    offset: liveOffset,
    query: filterClaimType || undefined,
  }, { enabled: Boolean(user) && activeTab === "live", select: diagnosticsView.live });
  const liveSignalSummary = trpc.dualLens.getLiveSignalSummary.useQuery({ query: filterClaimType || undefined, jurisdiction: filterJurisdiction || undefined, domain: filterDomain || undefined }, { enabled: Boolean(user) && activeTab === "live", select: diagnosticsView.summary });
  const selectedQuery = { barriers: barrierClusters, doctrines: doctrineClusters, institutions, signals: signalPatterns, paths: systemicPaths, live: detectedSignalsQuery }[activeTab];

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
          const text = [b.barrier_type, b.name, b.description, b.domains ? JSON.stringify(b.domains) : ""].join(" ");
          return matchesFilter(text);
        });
        return filteredBarriers.length > 0 ? { ...cluster, count: filteredBarriers.length, barriers: filteredBarriers } : null;
      })
      .filter(Boolean) as typeof barrierClusters.data.clusters;
    return { clusters: filtered, totalBarriers: filtered.reduce((sum, c) => sum + c.count, 0) };
  }, [barrierClusters.data, filterKeywords, hasActiveFilter]);

  // Doctrine filtering happens before pagination on the server.
  const filteredDoctrineClusters = doctrineClusters.data;

  // Filter institutions
  const filteredInstitutions = useMemo(() => {
    if (!institutions.data || !hasActiveFilter) return institutions.data;
    const filtered = institutions.data.institutions.filter(inst => {
      const text = [inst.agency, inst.agencyShort, inst.domain].join(" ");
      return matchesFilter(text);
    });
    return { institutions: filtered, totalAgencies: institutions.data.totalAgencies };
  }, [institutions.data, filterKeywords, hasActiveFilter]);

  // Filter signal patterns
  const filteredSignalPatterns = useMemo(() => {
    if (!signalPatterns.data || !hasActiveFilter) return signalPatterns.data;
    const filtered = signalPatterns.data.patterns
      .map(pattern => {
        const filteredSignals = pattern.signals.filter((s: any) => {
          const text = [s.signal_type, s.domain, s.explanation].join(" ");
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
    return { paths: filtered, totalBarriers: systemicPaths.data.totalBarriers };
  }, [systemicPaths.data, filterKeywords, hasActiveFilter]);

  const liveSignalCount = user ? liveSignalSummary.data?.totalCurrent : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <SignalArtifactContext />
      </div>
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/signal-registry")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Signal Registry
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
                Source comparisons, reference catalogs, and current Atlas records
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
                      Reference search context for{" "}
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
                  {(activeTab === "live" ? liveSignalSummary.data?.jurisdictions ?? [] : ["j_alabama","j_american_samoa","j_arkansas","j_connecticut","j_guam","j_hawaii","j_kansas","j_louisiana","j_massachusetts","j_mississippi","j_montana","j_new_hampshire","j_north_carolina","j_north_dakota","j_northern_mariana_islands","j_oklahoma","j_puerto_rico","j_south_carolina","j_south_dakota","j_tennessee","j_us_virgin_islands","j_utah","j_wyoming"]).map(j => (
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
                  {(activeTab === "live" ? liveSignalSummary.data?.domains ?? [] : ["civil_rights","consumer_fraud","employment","employment_discrimination","fair_housing","food_nutrition","general","healthcare","housing","unemployment","wage_theft"]).map(d => (
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
                <span className="text-muted-foreground">Signal definitions:</span>{" "}
                <span className="font-medium">{stats.data.structuralDiagnostics.signals}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Barrier catalog records (all scopes):</span>{" "}
                <span className="font-medium">{stats.data.structuralDiagnostics.barriers}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Canonical Civic Graph Edges:</span>{" "}
                <span className="font-medium">{stats.data.graph.available ? stats.data.graph.edges : "Unavailable"}</span>
                {!stats.data.graph.available && stats.data.graph.reason && (
                  <p className="max-w-md text-xs text-amber-400" role="status">
                    {stats.data.graph.reason}
                  </p>
                )}
              </div>
              {liveSignalCount != null && (
                <div className="flex items-center gap-1.5">
                  <Satellite className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-muted-foreground">Current Domain 3 records:</span>{" "}
                  <span className="font-medium text-emerald-400">{liveSignalCount}</span>
                  {liveSignalSummary.data?.lastDetectedAt && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (latest: {formatTimeAgo(liveSignalSummary.data.lastDetectedAt)})
                    </span>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {stats.error && <DiagnosticsReadError error={stats.error} hasData={!!stats.data} retry={() => { void stats.refetch(); }} label="Summary" />}
        {selectedQuery?.error && <DiagnosticsReadError error={selectedQuery.error} hasData={!!selectedQuery.data} retry={() => { void selectedQuery.refetch(); }} label="Selected diagnostics table" />}
        {activeTab === "live" && liveSignalSummary.error && <DiagnosticsReadError error={liveSignalSummary.error} hasData={!!liveSignalSummary.data} retry={() => { void liveSignalSummary.refetch(); }} label="Live signal summary" />}
        <details className="mb-4 text-sm" onToggle={event => setShowReferenceContext(event.currentTarget.open)}>
          <summary className="cursor-pointer text-muted-foreground">Broader reference context</summary>
          {showReferenceContext && <DiagnosticsReferenceContext />}
        </details>
        <Tabs value={activeTab} onValueChange={value => {
          if (["barriers", "doctrines", "institutions", "signals", "paths", "live"].includes(value)) {
            setActiveTab(value as typeof activeTab);
          }
        }}>
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
              <Radio className="w-4 h-4" /> Signal Definitions
              {hasActiveFilter && filteredSignalPatterns && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredSignalPatterns.totalSignals}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="paths" className="gap-2">
              <Route className="w-4 h-4" /> Barrier References
              {hasActiveFilter && filteredSystemicPaths && (
                <Badge variant="outline" className="ml-1 text-[9px]">{filteredSystemicPaths.paths.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <Satellite className="w-4 h-4" /> Live Data
              {liveSignalCount != null && (
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
                  {filteredBarrierClusters.totalBarriers} civic barrier references
                  {hasActiveFilter && barrierClusters.data && filteredBarrierClusters.totalBarriers !== barrierClusters.data.totalBarriers && (
                    <span className="text-purple-400"> (filtered from {barrierClusters.data.totalBarriers})</span>
                  )}
                  {" "}grouped into {filteredBarrierClusters.clusters.length} clusters by type
                </p>
                <p className="text-xs text-muted-foreground">Catalog references are context; their presence does not establish a barrier in a case.</p>
                {!!barrierClusters.data?.operational_references.length && (
                  <details className="rounded border border-border/50 p-3 text-sm">
                    <summary>{barrierClusters.data.operational_references.length} operational ingestion references</summary>
                    <p className="my-2 text-xs text-muted-foreground">These records describe ingestion operations and are kept outside civic barrier counts and case alerts.</p>
                    {barrierClusters.data.operational_references.map(row => (
                      <div key={row.id} className="mb-2 text-xs"><strong>{row.name}</strong><p>{row.description}</p></div>
                    ))}
                  </details>
                )}
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
                                  {b.barrier_id}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{b.description}</p>
                              {b.what_it_blocks && (
                                <p className="text-xs text-orange-400 mt-1">
                                  Blocks: {typeof b.what_it_blocks === "string" ? b.what_it_blocks : JSON.stringify(b.what_it_blocks)}
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
            <Input aria-label="Search doctrines" placeholder="Search all doctrines" value={doctrineSearch}
              maxLength={100} onChange={event => setDoctrineSearch(event.target.value)} className="mb-4" />
            {doctrineClusters.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading doctrine analysis...</div>
            ) : filteredDoctrineClusters ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredDoctrineClusters.totalDoctrines} matching doctrines · Showing {filteredDoctrineClusters.returnedDoctrines} on this page
                  {" "}across {filteredDoctrineClusters.clusters.length} domains on this page
                  {filteredDoctrineClusters.doctrineEdgesAvailable ? `, connected by ${filteredDoctrineClusters.doctrineEdges} doctrine graph edges` : ` · doctrine graph connections are unavailable${filteredDoctrineClusters.doctrineEdgesUnavailableReason ? `: ${filteredDoctrineClusters.doctrineEdgesUnavailableReason}` : ""}`}
                </p>
                {filteredDoctrineClusters.clusters.length === 0 && (hasActiveFilter || doctrineSearchQuery) && (
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
                          {cluster.doctrines.map((d: any) => (
                            <div key={d.id} className="text-xs text-muted-foreground flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />
                              <span>{d.name}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" disabled={doctrineOffset === 0 || doctrineClusters.isFetching}
                    onClick={() => setDoctrineOffset(Math.max(0, doctrineOffset - 100))}>Previous doctrines</Button>
                  <span className="text-sm text-muted-foreground">Page {Math.floor(doctrineOffset / 100) + 1}</span>
                  <Button variant="outline" disabled={filteredDoctrineClusters.nextOffset == null || doctrineClusters.isFetching}
                    onClick={() => setDoctrineOffset(filteredDoctrineClusters.nextOffset ?? doctrineOffset)}>Next doctrines</Button>
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
                  {filteredInstitutions.institutions.length} institution authority references
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
                          <div className="text-xs text-muted-foreground max-w-sm">
                            <p>Recorded authority: {inst.statute || "Not recorded"}</p>
                            <p>Issue attribution: not established by this reference.</p>
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
                  {filteredSignalPatterns.totalSignals} signal definitions
                  {hasActiveFilter && signalPatterns.data && filteredSignalPatterns.totalSignals !== signalPatterns.data.totalSignals && (
                    <span className="text-purple-400"> (filtered from {signalPatterns.data.totalSignals})</span>
                  )}
                  {" "}grouped into {filteredSignalPatterns.patterns.length} definition types. These counts describe the catalog, not observed occurrences.
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
                        <Badge variant="outline">{pattern.count} definitions</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {pattern.signals.slice(0, 3).map((s: any) => (
                          <div key={s.id} className="text-xs text-muted-foreground p-2 rounded bg-background/50">
                            <span className="font-medium text-foreground">{s.domain}</span>
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
                  {filteredSystemicPaths.paths.length} barrier references
                  {hasActiveFilter && systemicPaths.data && filteredSystemicPaths.paths.length !== systemicPaths.data.paths.length && (
                    <span className="text-purple-400"> (filtered from {systemicPaths.data.paths.length})</span>
                  )}
                  {" "}from {filteredSystemicPaths.totalBarriers} civic barrier catalog records. A working route is not established by these references.
                </p>
                {filteredSystemicPaths.paths.length === 0 && hasActiveFilter && (
                  <Card className="border-border/30">
                    <CardContent className="py-8 text-center">
                      <Route className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No barrier references match the current filter.</p>
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
                            <span className="text-foreground font-medium">Recorded workaround:</span>{" "}
                            {path.reformPath || "Not recorded"}
                            <p className="mt-2">Recorded authorities: {path.authority_refs.join("; ") || "Not recorded"}</p>
                            <p>Reference status: {path.reference_scope.replace(/_/g, " ")}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="live">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Current Domain 3 records retain their recorded verification and governance states.
                Observation candidates are not promoted findings. Jurisdiction, domain, and claim-text filters apply before pagination; a text match does not establish a legal relationship.
              </p>
              {user && liveSignalSummary.data && (
                <p className="text-sm">
                  {liveSignalSummary.data.totalCurrent} current records · {liveSignalSummary.data.observation_candidates} observation candidates · {liveSignalSummary.data.promoted_signals} promoted signals
                </p>
              )}
              {!user ? <p>Sign in to inspect current detections and their source records.</p> : detectedSignalsQuery.isLoading ? <p>Loading current Domain 3 records...</p> : detectedSignalsQuery.data && (
                <>
                  <p className="text-sm text-muted-foreground">Showing {detectedSignalsQuery.data.returned} of {detectedSignalsQuery.data.total} matching records</p>
                  {detectedSignalsQuery.data.items.length === 0 && <p>No current Domain 3 records match this page and filter.</p>}
                  {detectedSignalsQuery.data.items.map(signal => (
                    <Card key={signal.record_id} className="bg-card/50 border-border/50">
                      <CardContent className="py-4 space-y-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <h2 className="font-medium">{signal.title}</h2>
                          <Badge variant="outline">{signal.governance_status ?? "Governance not recorded"}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{signal.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Verification: {signal.verification_state ?? "Not recorded"} · Recorded severity: {signal.severity ?? "Not recorded"} · Recorded confidence: {formatRecordedConfidence(signal.confidence_score)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {signal.jurisdiction_id ?? "Jurisdiction not recorded"} · {signal.dataset_name ?? signal.primary_stream_id ?? "Source not recorded"} · {formatTimeAgo(signal.detected_at)}
                        </p>
                        <details className="text-xs">
                          <summary>Recorded statistics and method</summary>
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({
                            statistics: signal.supporting_statistics, signal_hash: signal.signal_hash,
                            engine_id: signal.engine_id, engine_version: signal.engine_version,
                            rule_id: signal.detection_rule_id, rule_version: signal.detection_rule_version,
                            input_hash: signal.input_hash, source_freshness_at: signal.source_freshness_at,
                          }, null, 2)}</pre>
                        </details>
                        <a className="text-sm text-cyan-400 underline" href={signal.destination_path}>Inspect this artifact in Anomaly Viewfinder</a>
                      </CardContent>
                    </Card>
                  ))}
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button variant="outline" disabled={liveOffset === 0 || detectedSignalsQuery.isFetching} onClick={() => setLiveOffset(Math.max(0, liveOffset - 100))}>Previous records</Button>
                    <span className="text-sm">Page {Math.floor(liveOffset / 100) + 1}</span>
                    <Button variant="outline" disabled={detectedSignalsQuery.data.next_offset == null || detectedSignalsQuery.isFetching} onClick={() => setLiveOffset(detectedSignalsQuery.data!.next_offset ?? liveOffset)}>Next records</Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
