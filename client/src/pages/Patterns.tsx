import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, ChevronDown, ChevronRight, ExternalLink, Users, Building2, FileX, AlertTriangle, Scale, ShieldAlert, Calendar } from "lucide-react";
import { useLocation } from "wouter";
import { caseWorkspacePath } from "@/lib/caseNavigation";
import PatternTrendChart from "@/components/PatternTrendChart";
import { useAuth } from "@/core/hooks/useAuth";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";

const PATTERN_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string; borderColor: string }> = {
  entity_recurrence: { label: "Entity Recurrence", icon: Users, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
  agency_behavior: { label: "Agency Behavior", icon: Building2, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
  denial_language_pattern: { label: "Denial Language", icon: Scale, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
  foia_denial_pattern: { label: "FOIA Denial", icon: FileX, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20" },
  record_gap_pattern: { label: "Record Gap", icon: AlertTriangle, color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/20" },
  regulatory_violation_pattern: { label: "Regulatory Violation", icon: ShieldAlert, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20" },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PatternDetailCard({ pattern }: {
  pattern: {
    patternId: number;
    patternType: string;
    description: string;
    occurrenceCount: number;
    caseCount: number;
    firstSeenAt: number;
    lastSeenAt: number;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: relatedCases, isLoading } = trpc.patterns.casesForPattern.useQuery(
    { patternId: pattern.patternId },
    { enabled: expanded }
  );
  const { data: patternFeedback } = trpc.operationalWorkflow.patternFeedback.useQuery(
    { patternType: pattern.patternType },
    { enabled: expanded }
  );
  const { data: relatedStatutes, isLoading: statutesLoading } = trpc.meaningLayer.patternRelatedStatutes.useQuery(
    { patternDescription: pattern.description, limit: 5 },
    { enabled: expanded }
  );
  const { data: precedents, isLoading: precedentsLoading } = trpc.meaningLayer.patternRelatedPrecedents.useQuery(
    { patternDescription: pattern.description, limit: 5 },
    { enabled: expanded }
  );
  const [, navigate] = useLocation();

  const meta = PATTERN_TYPE_META[pattern.patternType] || {
    label: pattern.patternType,
    icon: Network,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
  };
  const Icon = meta.icon;

  return (
    <Card className={`${meta.borderColor} border`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2 rounded-lg ${meta.bgColor} shrink-0 mt-0.5`}>
                <Icon className={`h-4 w-4 ${meta.color}`} />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-medium text-foreground leading-snug">
                  {pattern.description}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className={`text-[10px] ${meta.color} border-current/30`}>
                    {meta.label}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(pattern.firstSeenAt)}
                    {pattern.firstSeenAt !== pattern.lastSeenAt && ` — ${formatDate(pattern.lastSeenAt)}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">{pattern.caseCount}</div>
                <div className="text-[10px] text-muted-foreground">case{pattern.caseCount !== 1 ? "s" : ""}</div>
              </div>
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-3">
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Related Cases</h4>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : relatedCases && relatedCases.length > 0 ? (
              <div className="space-y-1">
                {relatedCases.map((c) => (
                  <button
                    key={c.caseId}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(caseWorkspacePath(c.caseId));
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-foreground truncate">{c.caseName}</span>
                      {c.pipelineType && (
                        <Badge variant="outline" className="text-[10px] shrink-0">{c.pipelineType}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {c.occurrenceCount} occurrence{c.occurrenceCount !== 1 ? "s" : ""}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No related cases found.</p>
            )}

            {/* Legal Grounding */}
            {relatedStatutes && relatedStatutes.count > 0 && (
              <div className="border-t border-border pt-3 mt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-2">
                  <Scale className="h-3 w-3" />
                  Applicable Laws
                </h4>
                <div className="space-y-1">
                  {relatedStatutes.statutes.slice(0, 3).map((statute) => (
                    <div key={statute.id} className="p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
                      <div className="text-xs font-medium text-blue-300">{statute.citation}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{statute.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Precedents */}
            {precedents && precedents.count > 0 && (
              <div className="border-t border-border pt-3 mt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-2">
                  <FileX className="h-3 w-3" />
                  Related Cases
                </h4>
                <div className="space-y-1">
                  {precedents.precedents.slice(0, 3).map((precedent) => (
                    <div key={precedent.id} className="p-2 rounded-md bg-purple-500/5 border border-purple-500/20">
                      <div className="text-xs font-medium text-purple-300">{precedent.citation}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{precedent.caseName}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback & Strategy Effectiveness */}
            {patternFeedback && (
              <div className="border-t border-border pt-3 mt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Strategy Effectiveness</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="p-2 rounded-md bg-muted/30 text-center">
                    <div className="text-sm font-semibold text-foreground">{patternFeedback.totalStrategies ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Strategies</div>
                  </div>
                  <div className="p-2 rounded-md bg-green-500/10 text-center">
                    <div className="text-sm font-semibold text-green-400">{patternFeedback.successRate ?? 0}%</div>
                    <div className="text-[10px] text-muted-foreground">Success Rate</div>
                  </div>
                  <div className="p-2 rounded-md bg-blue-500/10 text-center">
                    <div className="text-sm font-semibold text-blue-400">{patternFeedback.avgEffectiveness ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Avg Effectiveness</div>
                  </div>
                  <div className="p-2 rounded-md bg-purple-500/10 text-center">
                    <div className="text-sm font-semibold text-purple-400">{patternFeedback.avgSignalReduction ?? 0}%</div>
                    <div className="text-[10px] text-muted-foreground">Signal Reduction</div>
                  </div>
                </div>
                {patternFeedback.trendDirection && (
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                    <span>Trend: </span>
                    <Badge variant="outline" className={`text-[10px] ${
                      patternFeedback.trendDirection === 'improving' ? 'text-green-400 border-green-500/30' :
                      patternFeedback.trendDirection === 'worsening' ? 'text-red-400 border-red-500/30' :
                      'text-yellow-400 border-yellow-500/30'
                    }`}>
                      {patternFeedback.trendDirection}
                    </Badge>
                    {patternFeedback.pressureIndex != null && (
                      <span className="ml-2">Pressure Index: {patternFeedback.pressureIndex}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Patterns() {
  const { user } = useAuth();

  if (!user) {
    return (
      <PublicWalkthroughShell
        title="Cross-Case Patterns"
        description="The pattern-analysis workspace is open for walkthrough. Live case links, evidence relationships, legal grounding, and strategy feedback remain private."
        sections={["Pattern Taxonomy", "Trend Views", "Related Evidence", "Strategy Feedback"]}
      />
    );
  }

  return <AuthenticatedPatterns />;
}

function AuthenticatedPatterns() {
  const { data: summary, isLoading } = trpc.patterns.summary.useQuery();
  const [filterType, setFilterType] = useState<string | null>(null);

  const filteredPatterns = summary
    ? filterType
      ? summary.filter((p) => p.patternType === filterType)
      : summary
    : [];

  // Count patterns by type for filter badges
  const typeCounts: Record<string, number> = {};
  if (summary) {
    for (const p of summary) {
      typeCounts[p.patternType] = (typeCounts[p.patternType] || 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Network className="h-6 w-6 text-indigo-400" />
          Cross-Case Patterns
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Systemic patterns detected across your investigations. Each pattern links entities, agencies, or behaviors that appear in multiple cases.
        </p>
      </div>

      {/* Stats */}
      {!isLoading && summary && summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{summary.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Patterns</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">
                {new Set(summary.map(p => p.patternType)).size}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Pattern Types</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">
                {summary.reduce((acc, p) => acc + p.caseCount, 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Case Links</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">
                {summary.reduce((acc, p) => acc + p.occurrenceCount, 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Occurrences</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Type Filters */}
      {!isLoading && Object.keys(typeCounts).length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterType === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(null)}
            className="h-7 text-xs"
          >
            All ({summary?.length || 0})
          </Button>
          {Object.entries(typeCounts).map(([type, count]) => {
            const meta = PATTERN_TYPE_META[type];
            return (
              <Button
                key={type}
                variant={filterType === type ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType(filterType === type ? null : type)}
                className="h-7 text-xs"
              >
                {meta?.label || type} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Trend Chart */}
      {!isLoading && summary && summary.length > 0 && (
        <PatternTrendChart />
      )}

      {/* Pattern List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filteredPatterns.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <Network className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <h3 className="font-medium text-foreground">No patterns detected yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Cross-case patterns are detected automatically when evidence is processed across multiple cases.
                As you add more cases and run analyses, patterns will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPatterns.map((pattern) => (
            <PatternDetailCard key={pattern.patternId} pattern={pattern} />
          ))}
        </div>
      )}
    </div>
  );
}
