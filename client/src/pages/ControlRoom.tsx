import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IntakeSpineControl } from "@/components/lighthouse/IntakeSpineControl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  FileText,
  Users,
  Clock,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  Target,
  Scale,
  Timer,
  Zap,
  Network,
  Eye,
  BarChart3,
  Layers,
  Activity,
  XCircle,
  CheckCircle2,
  Lightbulb,
  Search,
  BookOpen,
  Flag,
  Bookmark,
  Route,
  Gavel,
  Sparkles,
  Radio,
  Link2,
} from "lucide-react";

/* ─── Case Completeness Panel ─── */
function CaseCompletenessPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const { data: caseStateResponse, isLoading } = trpc.case_state.get.useQuery(
    { case_id: caseId },
    { refetchInterval: 15000 }
  );
  const state = caseStateResponse?.state;
  const { data: flags } = trpc.case_state.get_flags.useQuery(
    { case_id: caseId, status: "open" },
    { refetchInterval: 15000 }
  );

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            Case Commitment State
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const score = state?.completenessScore ?? 0;
  const breakdown = state?.completenessBreakdown as { missing: string[]; present: string[]; score: number } | null;
  const missing = breakdown?.missing ?? [];
  const present = breakdown?.present ?? [];
  const openFlagCount = Array.isArray(flags) ? flags.length : 0;

  const committedFindings = Array.isArray(state?.committedFindingIds) ? (state.committedFindingIds as number[]).length : 0;
  const committedBarriers = Array.isArray(state?.committedBarrierIds) ? (state.committedBarrierIds as number[]).length : 0;
  const committedBenefits = Array.isArray(state?.committedBenefitIds) ? (state.committedBenefitIds as number[]).length : 0;
  const committedStatutes = Array.isArray(state?.committedStatuteIds) ? (state.committedStatuteIds as number[]).length : 0;

  const scoreColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const progressColor = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card className="col-span-1 lg:col-span-3 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            Case Commitment State
          </CardTitle>
          <div className="flex items-center gap-2">
            {openFlagCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 gap-1">
                <Flag className="h-2.5 w-2.5" />
                {openFlagCount} open flag{openFlagCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold ${scoreColor}`}
            >
              {score}% complete
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Completeness bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Case Completeness</span>
            <span className={`text-xs font-semibold ${scoreColor}`}>{score}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Committed item counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-base font-semibold">{committedFindings}</p>
            <p className="text-[9px] text-muted-foreground">Findings</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-base font-semibold">{committedBarriers}</p>
            <p className="text-[9px] text-muted-foreground">Barriers</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-base font-semibold">{committedBenefits}</p>
            <p className="text-[9px] text-muted-foreground">Benefits</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-base font-semibold">{committedStatutes}</p>
            <p className="text-[9px] text-muted-foreground">Statutes</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center col-span-1">
            <p className="text-base font-semibold truncate text-xs">{state?.claimType ? state.claimType.replace(/_/g, " ") : "—"}</p>
            <p className="text-[9px] text-muted-foreground">Claim Type</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center col-span-1">
            <p className="text-[10px] font-medium truncate">{state?.proceduralPathLabel || "—"}</p>
            <p className="text-[9px] text-muted-foreground">Active Path</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center col-span-1">
            <p className="text-[10px] font-medium truncate">{state?.remedyStrategyLabel || "—"}</p>
            <p className="text-[9px] text-muted-foreground">Remedy Strategy</p>
          </div>
        </div>

        {/* Missing items */}
        {missing.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2">Missing to complete case</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((m, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Present items */}
        {present.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {present.map((p, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Open flags */}
        {openFlagCount > 0 && Array.isArray(flags) && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Open Flags ({openFlagCount})
            </p>
            <div className="space-y-1.5">
              {(flags as any[]).slice(0, 4).map((flag: any) => (
                <div key={flag.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
                  <Flag className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="flex-1 truncate">{flag.message}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{flag.location?.replace(/_/g, " ")}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto benefit notification */}
        {committedBenefits === 0 && score > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-emerald-300">Benefits not yet matched</p>
                  <p className="text-[10px] text-muted-foreground">Find programs you may qualify for and commit them to this case.</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] h-7 text-emerald-400 border-emerald-400/30 hover:bg-emerald-500/10 shrink-0"
                onClick={() => navigate('/benefits-navigator')}
              >
                Match Benefits
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {score === 0 && missing.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Bookmark className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No items committed to this case yet.</p>
            <p className="text-xs mt-1">Use the Commit to Case button on Findings, Barriers, Benefits, and more.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Evidence Summary Panel ─── */
function EvidenceSummaryPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = trpc.cases.stats.useQuery(
    { case_id: caseId },
    { refetchInterval: 30000 }
  );

  if (isLoading) {
    return (
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Evidence Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    { label: "Registered Sources", value: stats?.documents ?? 0, icon: FileText, path: "/documents" },
    { label: "Entities", value: stats?.entities ?? 0, icon: Users, path: "/entities" },
    { label: "Events", value: stats?.events ?? 0, icon: Clock, path: "/timeline" },
    { label: "Verification Records", value: stats?.findings ?? 0, icon: Shield, path: "/findings" },
    { label: "Structural Signals", value: stats?.signalFlags ?? 0, icon: AlertTriangle, path: "/viewfinder" },
    { label: "Claim Candidates", value: stats?.claims ?? 0, icon: Scale, path: "/claim-elements" },
  ];

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Evidence Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map(m => (
            <button
              key={m.label}
              onClick={() => navigate(m.path)}
              className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors text-left group"
            >
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 shrink-0">
                <m.icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold leading-none">{m.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 ml-auto transition-colors" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Strategy Paths Panel ─── */
function StrategyPathsPanel({ caseId }: { caseId: number }) {
  const actionPathProjection = trpc.analyze.getIntakeActionPathProjection.useQuery(
    { caseId },
    { refetchInterval: 15000, retry: false }
  );
  const isLoading = actionPathProjection.isLoading;
  const paths = useMemo(() => (actionPathProjection.data?.outputs ?? []).flatMap(output =>
    output.paths.map(path => ({
      ...path,
      id: path.path_id,
      pathLabel: path.workflow_name,
      pathStatus: path.status,
      recommendedForum: path.filing_destination,
      patternConfidence: null,
      estimatedStrength: null,
      patternNotes: path.authority,
    })),
  ), [actionPathProjection.data]);

  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  const expanded = paths.find(path => path.id === expandedPath);
  const elementLinks = (expanded?.prerequisites ?? []).map((elementName, index) => ({
    id: `${expanded?.id}:prerequisite:${index}`,
    elementName,
    supportStrength: null,
  }));
  const missingEvidence = (expanded?.unresolved_facts ?? []).map((description, index) => ({
    id: `${expanded?.id}:unresolved:${index}`,
    description,
    priority: "unresolved",
  }));

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Strategy Paths
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedPaths = [...paths].sort((a, b) => a.path_id.localeCompare(b.path_id));

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Strategy Paths
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {sortedPaths.length} path{sortedPaths.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {sortedPaths.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No governed action paths yet.</p>
            <p className="text-xs mt-1">Run the Universal Intake Spine to produce unranked Layer 14 candidates.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedPaths.map((path) => {
              const isExpanded = expandedPath === path.id;

              return (
                <Collapsible
                  key={path.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedPath(isExpanded ? null : path.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 shrink-0 mt-0.5">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium truncate">
                              {path.pathLabel}
                            </span>
                            <Badge
                              variant={path.pathStatus === "recommended" ? "default" : "outline"}
                              className="text-[9px] shrink-0"
                            >
                              {path.pathStatus}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Scale className="h-3 w-3" />
                              Candidate · unranked
                            </span>
                            {path.recommendedForum && (
                              <span className="flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {path.recommendedForum}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-11 mt-1 p-3 rounded-lg bg-muted/20 border border-border/30 space-y-3">
                          {/* Governed prerequisites */}
                      {elementLinks && elementLinks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Governed prerequisites
                          </p>
                          <div className="space-y-1">
                            {elementLinks.slice(0, 5).map((link: any) => (
                              <div key={link.id} className="flex items-center gap-2 text-xs">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                                <span className="truncate">{link.elementName}</span>
                                <span className="text-muted-foreground ml-auto shrink-0">required</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Missing evidence */}
                      {missingEvidence && missingEvidence.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Unresolved facts
                          </p>
                          <div className="space-y-1">
                            {missingEvidence.slice(0, 3).map((task: any) => (
                              <div key={task.id} className="flex items-center gap-2 text-xs">
                                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                                <span className="truncate">{task.description}</span>
                                <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                                  {task.priority}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                          {/* Authority */}
                      {path.patternNotes && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            Authority
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {path.patternNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Deadlines Panel ─── */
function DeadlinesPanel({ caseId }: { caseId: number }) {
  const actionPathProjection = trpc.analyze.getIntakeActionPathProjection.useQuery(
    { caseId },
    { refetchInterval: 30000, retry: false }
  );
  const isLoading = actionPathProjection.isLoading;
  const deadlines = useMemo(() => (actionPathProjection.data?.outputs ?? []).flatMap(output =>
    output.paths.flatMap(path => path.deadline_candidates.map((deadline, index) => ({
      id: `${path.path_id}:${deadline.registry_id}:${index}`,
      deadlineDate: null as string | null,
      claimType: path.claim_type_name,
      deadlineType: deadline.deadline_days === null
        ? "Rule requires a confirmed triggering date"
        : `${deadline.deadline_days} days from the governed trigger`,
      description: deadline.deadline_description,
      specialConsiderations: deadline.source_citation,
      tollingApplied: false,
    }))),
  ), [actionPathProjection.data]);

  if (isLoading) {
    return (
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const now = Date.now();
  const sortedDeadlines = [...(deadlines ?? [])].sort((a, b) => {
    const aDate = a.deadlineDate ? new Date(a.deadlineDate).getTime() : Infinity;
    const bDate = b.deadlineDate ? new Date(b.deadlineDate).getTime() : Infinity;
    return aDate - bDate;
  });

  function getUrgency(dateStr: string | null): "critical" | "warning" | "normal" {
    if (!dateStr) return "normal";
    const diff = new Date(dateStr).getTime() - now;
    const days = diff / (1000 * 60 * 60 * 24);
    if (days < 0) return "critical";
    if (days < 30) return "critical";
    if (days < 90) return "warning";
    return "normal";
  }

  const urgencyColors = {
    critical: "text-red-400 bg-red-500/10 border-red-500/30",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    normal: "text-muted-foreground bg-muted/40 border-border/50",
  };

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Deadlines
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[9px] opacity-70">Layer 14 candidates</Badge>
            <Badge variant="outline" className="text-[10px]">
              {sortedDeadlines.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedDeadlines.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Timer className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No governed deadline candidates yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDeadlines.map((d) => {
              const urgency = getUrgency(d.deadlineDate);
              const daysLeft = d.deadlineDate
                ? Math.ceil((new Date(d.deadlineDate).getTime() - now) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <div
                  key={d.id}
                  className={`p-2.5 rounded-lg border ${urgencyColors[urgency]} transition-colors`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{d.claimType || "Filing Deadline"}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">
                        {d.deadlineDate
                          ? new Date(d.deadlineDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Date pending"}
                      </p>
                    </div>
                    {daysLeft !== null && (
                      <Badge
                        variant={urgency === "critical" ? "destructive" : "outline"}
                        className="text-[9px] shrink-0"
                      >
                        {daysLeft < 0
                          ? `${Math.abs(daysLeft)}d overdue`
                          : daysLeft === 0
                            ? "Today"
                            : `${daysLeft}d left`}
                      </Badge>
                    )}
                  </div>
                  {d.deadlineType && (
                    <p className="text-[10px] opacity-60 mt-1">{d.deadlineType}{d.tollingApplied ? " (tolled)" : ""}</p>
                  )}
                  {(d as any).description && (
                    <p className="text-[10px] opacity-50 mt-0.5 line-clamp-2">{(d as any).description}</p>
                  )}
                  {(d as any).specialConsiderations && (
                    <p className="text-[10px] text-amber-400/70 mt-0.5 line-clamp-1">⚠ {(d as any).specialConsiderations}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Legistar Events — upcoming Seattle City Council meetings */}
        <LegistarEventsWidget />
      </CardContent>
    </Card>
  );
}

/* ─── Legistar Events Widget (inline in Deadlines panel) ─── */
function LegistarEventsWidget() {
  const { data, isLoading } = trpc.docket.legistarEvents.useQuery(
    { top: 3 },
    { refetchInterval: 10 * 60 * 1000 }
  );
  if (isLoading || !data || data.events.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
        <Radio className="h-3 w-3 text-sky-400" />
        Seattle Council — Recent Meetings
      </p>
      <div className="space-y-1.5">
        {data.events.map((e: any) => (
          <div key={e.id} className="p-2 rounded bg-muted/30 border border-border/30">
            <p className="text-[10px] font-medium text-foreground truncate">{e.body}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {e.location && ` · ${e.location.split("\n")[0]}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Next Actions Panel ─── */
function NextActionsPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const projection = trpc.analyze.getIntakeActionPathProjection.useQuery(
    { caseId },
    { refetchInterval: 15000, retry: false }
  );
  const isLoading = projection.isLoading;
  const packets = useMemo(() => (projection.data?.outputs ?? []).flatMap(output =>
    output.paths.flatMap(path => path.next_steps.map(step => ({
      id: `${path.path_id}:${step.step_number}`,
      packetName: step.action,
      packetType: path.workflow_name,
      forum: path.filing_destination,
      packetStatus: path.confirmation_state,
      owner: step.owner,
      dueRule: step.due_rule,
    }))),
  ), [projection.data]);

  if (isLoading) {
    return (
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Next Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Next Actions
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {packets.length} action{packets.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {packets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No governed next actions yet.</p>
            <p className="text-xs mt-1">Run the Universal Intake Spine to produce Layer 14 action candidates.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {packets.map((pkt: any) => (
              <div
                key={pkt.id}
                className="p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{pkt.packetName || pkt.packetType}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {pkt.forum || pkt.packetType} · {pkt.owner || "owner unresolved"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] shrink-0"
                  >
                    {pkt.packetStatus.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => navigate("/claim-elements")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View governed path
                  </Button>
                  {pkt.dueRule && <span className="text-[9px] text-muted-foreground">{pkt.dueRule}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Pattern Signals Panel ─── */
function PatternSignalsPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const projection = trpc.analyze.getIntakeStructuralSignalProjection.useQuery(
    { caseId },
    { refetchInterval: 30000, retry: false },
  );
  const infLoading = projection.isLoading;
  const patterns = (projection.data?.pattern_outputs ?? []).flatMap(output => output.patterns);
  const cascades = (projection.data?.cascade_outputs ?? []).flatMap(output => output.cascades);
  const inferences = patterns.map(pattern => ({
    id: pattern.pattern_id,
    inferenceText: pattern.match_basis,
    confidenceScore: null,
  }));
  const entityClusters: any[] = [];
  const conductClusters = cascades;
  const caseLinks: any[] = [];

  if (infLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Pattern Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const entityCount = entityClusters?.length ?? 0;
  const conductCount = conductClusters?.length ?? 0;
  const linkCount = caseLinks?.length ?? 0;
  const inferenceCount = inferences?.length ?? 0;
  const totalSignals = entityCount + conductCount + linkCount + inferenceCount;

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Pattern Signals
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => navigate("/viewfinder")}
          >
            Open Viewfinder
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {totalSignals === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No pattern signals detected yet.</p>
            <p className="text-xs mt-1">Run the Universal Intake Spine to execute Layers 10 and 11.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Signal summary row */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 rounded-lg bg-muted/40 text-center">
                <p className="text-lg font-semibold">{entityCount}</p>
                <p className="text-[9px] text-muted-foreground">Entity clusters</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 text-center">
                <p className="text-lg font-semibold">{conductCount}</p>
                <p className="text-[9px] text-muted-foreground">Cascade chains</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 text-center">
                <p className="text-lg font-semibold">{linkCount}</p>
                <p className="text-[9px] text-muted-foreground">Cross-case links</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 text-center">
                <p className="text-lg font-semibold">{inferenceCount}</p>
                <p className="text-[9px] text-muted-foreground">Pattern matches</p>
              </div>
            </div>

            {/* Top systemic inferences */}
            {inferences && inferences.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Deterministic structural matches
                </p>
                <div className="space-y-1.5">
                  {inferences.slice(0, 4).map((inf: any) => (
                    <button
                      key={inf.id}
                      onClick={() => navigate("/viewfinder")}
                      className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <Network className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs truncate flex-1">{inf.inferenceText}</span>
                      {inf.confidenceScore && (
                        <Badge variant="outline" className="text-[9px] shrink-0">
                          {Math.round(inf.confidenceScore * 100)}%
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Human-linked Signal Architecture artifacts ─── */
function LinkedSignalArtifactsPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const links = trpc.enforcementIntel.list_case_signal_artifacts.useQuery(
    { case_id: caseId },
    { refetchInterval: 30_000 },
  );

  return (
    <Card className="col-span-1 lg:col-span-3 border-amber-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4 text-amber-400" />
            Connected Signal Architecture Artifacts
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {links.data?.length ?? 0} context receipt{links.data?.length === 1 ? "" : "s"}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigate("/signal-registry")}>
              Browse architecture <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {links.isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : links.error ? (
          <p className="text-xs text-red-300">{links.error.message}</p>
        ) : links.data?.length ? (
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {links.data.map((link) => (
              <button
                type="button"
                key={link.link_id}
                onClick={() => navigate(link.destination_path)}
                className="w-full text-left rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      <Badge variant="outline" className="text-[9px] capitalize">{link.domain_code.replaceAll("_", " ")}</Badge>
                      <Badge variant="outline" className="text-[9px] capitalize">{link.relationship_type.replaceAll("_", " ")}</Badge>
                      <Badge variant="outline" className="text-[9px]">candidate context</Badge>
                    </div>
                    <p className="text-sm font-medium">{link.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 capitalize">{link.artifact_type.replaceAll("_", " ")} · home: {link.home_label}</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {link.reviewer_notes && <p className="text-xs text-muted-foreground mt-2">{link.reviewer_notes}</p>}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Link2 className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No Signal Architecture artifact is connected to this case.</p>
            <p className="text-xs mt-1">Connections are reviewer-created context, not findings.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Receipt-bound Verification Panel ─── */
function KeyFindingsPanel({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const projection = trpc.analyze.getIntakeVerificationProjection.useQuery(
    { caseId },
    { refetchInterval: 30000, retry: false }
  );
  const isLoading = projection.isLoading;
  const findings = useMemo(() => (projection.data?.outputs ?? []).flatMap(output =>
    output.records.map(record => {
      const [, attribute] = record.fact_key.split("|");
      return {
        id: `${output.output_hash}:${record.fact_key}`,
        title: (attribute || record.fact_key).replace(/_/g, " "),
        description: record.fact_key,
        severity: record.verification_state === "contradicted"
          ? "critical"
          : record.verification_state === "disputed" ? "high" : null,
        backingEvidence: record.source_refs,
        provenanceStatus: "linked",
        verificationState: record.verification_state,
        receiptHash: output.receipt_hash,
      };
    }),
  ), [projection.data]);

  if (isLoading) {
    return (
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Verification Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topFindings = (findings ?? []).slice(0, 8);

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Verification Records
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {(findings ?? []).length} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {topFindings.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No governed verification records yet.</p>
            <p className="text-xs mt-1">Register evidence, then explicitly run the Universal Intake Spine.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topFindings.map((f: any) => (
              <button
                key={f.id}
                onClick={() => navigate("/findings")}
                className="w-full text-left p-2.5 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 shrink-0 mt-0.5">
                    <Lightbulb className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.title || "Verification record"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {f.severity && (
                        <Badge
                          variant={f.severity === "critical" ? "destructive" : f.severity === "high" ? "default" : "outline"}
                          className="text-[9px]"
                        >
                          {f.severity}
                        </Badge>
                      )}
                      {f.backingEvidence && f.backingEvidence.length > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <BookOpen className="h-2.5 w-2.5" />
                          {f.backingEvidence.length} source statement{f.backingEvidence.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {f.provenanceStatus && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${
                          f.provenanceStatus === "linked" ? "text-emerald-400" : "text-amber-400"
                        }`}>
                          {f.provenanceStatus === "linked" ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                          {f.verificationState.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 mt-1 transition-colors" />
                </div>
              </button>
            ))}
            {(findings ?? []).length > 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => navigate("/findings")}
              >
                View all {(findings ?? []).length} verification records
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Main Control Room Page ─── */
export default function ControlRoom() {
  const { currentCaseId, currentCase } = useCase();
  const [, navigate] = useLocation();
  // Support both /cases/:id/control-room (URL param) and /control-room (global selector)
  const [matched, params] = useRoute("/cases/:id/control-room");
  const routeCaseId = matched && params?.id ? parseInt(params.id, 10) : null;
  const caseId = routeCaseId ?? currentCaseId;
  // useCase is imported at the top of the file

  if (!caseId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Select a case to open the Control Room.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => navigate("/cases")}
          >
            Go to Cases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Control Room
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentCase?.name || `Case #${caseId}`} — Operational hub for investigation, strategy, and action
          </p>
        </div>
      </div>

      {/* Canonical governed execution control */}
      <IntakeSpineControl caseId={caseId} />

      <Separator />

      {/* 6-Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Row 0: Case Commitment State — full width */}
        <CaseCompletenessPanel caseId={caseId} />

        {/* Row 1: Evidence + Strategy */}
        <EvidenceSummaryPanel caseId={caseId} />
        <StrategyPathsPanel caseId={caseId} />

        {/* Row 2: Findings + Deadlines + Actions */}
        <KeyFindingsPanel caseId={caseId} />
        <DeadlinesPanel caseId={caseId} />
        <NextActionsPanel caseId={caseId} />

        {/* Row 3: Pattern Signals (full width) */}
        <LinkedSignalArtifactsPanel caseId={caseId} />
        <PatternSignalsPanel caseId={caseId} />
      </div>
    </div>
  );
}
