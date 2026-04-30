/**
 * Lens Debug Panel — Session 15
 * 
 * Displays the full activation trace for a case's analytical lenses.
 * Read-only for evidence; never modifies pipeline outputs.
 * 
 * Sections:
 * 1. Header: pipeline type, category, registry version
 * 2. Stage Pipeline: visual funnel showing lens counts at each stage
 * 3. Active Lenses: expandable cards with source, signals, priority, confidence
 * 4. Conflict Resolution: events showing which lenses were eliminated and why
 * 5. Manual Overrides: toggle controls for activating/deactivating lenses
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Shield,
  Globe,
  Microscope,
  Zap,
  AlertTriangle,
  RotateCcw,
  Eye,
  EyeOff,
  Info,
  ArrowRight,
  GitBranch,
  Lock,
  Unlock,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──

interface ActivatedLens {
  lens_id: string;
  label: string;
  category: "structural" | "domain" | "interpretive";
  priority: number;
  activation_source: string;
  metadata_fields: string[];
  analysis_hooks: string[];
  ui_surfaces: string[];
  confidence: number | null;
  activation_signals: string[];
}

interface ConflictResolutionEvent {
  eliminated_lens_id: string;
  winner_lens_id: string;
  reason: "pairwise_conflict" | "mutual_exclusion";
  group: string | null;
  eliminated_priority: number;
  winner_priority: number;
}

interface ActivationSourceEntry {
  lens_id: string;
  source: string;
  step: string;
}

interface ActivationTrace {
  generated_at: number;
  case_id: number;
  resolved_pipeline_type: string | null;
  pipeline_category: string | null;
  intake_situation: string | null;
  pipeline_resolution: {
    original_input: string;
    canonical_id: string;
    resolution_method: string;
    is_canonical: boolean;
    is_preserved_legacy: boolean;
  } | null;
  registry_version: string;
  registry_hash: string;
  input_signals: string[];
  activation_sources: ActivationSourceEntry[];
  after_dedup: string[];
  added_by_dependency: string[];
  conflict_resolutions: ConflictResolutionEvent[];
  final_lenses: ActivatedLens[];
  stage_counts: {
    raw_activations: number;
    after_dedup: number;
    after_dependencies: number;
    after_conflicts: number;
    final: number;
  };
  lens_context: Record<string, unknown>;
}

// ── Helpers ──

const SOURCE_LABELS: Record<string, string> = {
  structural: "Structural (always-on)",
  domain_match: "Domain Match",
  signal_match: "Signal Match",
  manual: "Manual Override",
  dependency: "Dependency",
  category_default: "Category Default",
  intake_pre_lens: "Intake Pre-Lens",
};

const SOURCE_COLORS: Record<string, string> = {
  structural: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  domain_match: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  signal_match: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  manual: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  dependency: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  category_default: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  intake_pre_lens: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  structural: Shield,
  domain: Globe,
  interpretive: Microscope,
};

function confidenceBar(confidence: number | null) {
  if (confidence === null) return null;
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 70 ? "bg-amber-500" :
    pct >= 50 ? "bg-orange-500" :
    "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Stage Pipeline Visualization ──

function StagePipeline({ counts }: { counts: ActivationTrace["stage_counts"] }) {
  const stages = [
    { label: "Raw", count: counts.raw_activations, color: "bg-blue-500" },
    { label: "Dedup", count: counts.after_dedup, color: "bg-cyan-500" },
    { label: "+Deps", count: counts.after_dependencies, color: "bg-emerald-500" },
    { label: "Conflicts", count: counts.after_conflicts, color: "bg-amber-500" },
    { label: "Final", count: counts.final, color: "bg-primary" },
  ];

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="flex items-end gap-1.5 h-16">
      {stages.map((stage, i) => (
        <Tooltip key={stage.label}>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-xs font-mono text-muted-foreground">{stage.count}</span>
              <div
                className={`w-full rounded-t-sm transition-all ${stage.color}`}
                style={{ height: `${Math.max((stage.count / maxCount) * 40, 4)}px` }}
              />
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{stage.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{stage.label}: {stage.count} lenses</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ── Lens Card ──

function LensCard({ lens, isManuallyActive, onToggle }: {
  lens: ActivatedLens;
  isManuallyActive: boolean;
  onToggle: (lensId: string, active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = CATEGORY_ICONS[lens.category] || Microscope;
  const sourceStyle = SOURCE_COLORS[lens.activation_source] || SOURCE_COLORS.structural;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border border-border rounded-md bg-card/50 hover:bg-card/80 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 p-3 text-left">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">{lens.label}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${sourceStyle}`}>
                {SOURCE_LABELS[lens.activation_source] || lens.activation_source}
              </Badge>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {confidenceBar(lens.confidence)}
              <span className="text-xs font-mono text-muted-foreground w-6 text-right">P{lens.priority}</span>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-border space-y-2.5">
            {/* ID and Priority */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">ID:</span>
              <code className="font-mono text-foreground bg-muted/50 px-1.5 py-0.5 rounded">{lens.lens_id}</code>
              <span className="text-muted-foreground">Priority:</span>
              <span className="font-mono text-foreground">{lens.priority}</span>
              <span className="text-muted-foreground">Category:</span>
              <Badge variant="outline" className="text-[10px]">{lens.category}</Badge>
            </div>

            {/* Activation Signals */}
            {lens.activation_signals.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Activation Signals:</span>
                <div className="flex flex-wrap gap-1">
                  {lens.activation_signals.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                      <Zap className="h-2.5 w-2.5 mr-0.5" />{s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata Fields */}
            {lens.metadata_fields.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Metadata Fields:</span>
                <div className="flex flex-wrap gap-1">
                  {lens.metadata_fields.map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Hooks */}
            {lens.analysis_hooks.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Analysis Hooks:</span>
                <div className="flex flex-wrap gap-1">
                  {lens.analysis_hooks.map((h) => (
                    <Badge key={h} variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20">{h}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* UI Surfaces */}
            {lens.ui_surfaces.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">UI Surfaces:</span>
                <div className="flex flex-wrap gap-1">
                  {lens.ui_surfaces.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Override Toggle */}
            {lens.category !== "structural" && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <div className="flex items-center gap-2">
                  {isManuallyActive ? <Lock className="h-3.5 w-3.5 text-purple-400" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">Manual Override</span>
                </div>
                <Switch
                  checked={isManuallyActive}
                  onCheckedChange={(checked) => onToggle(lens.lens_id, checked)}
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Conflict Resolution Card ──

function ConflictCard({ event }: { event: ConflictResolutionEvent }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/5 border border-destructive/20 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-muted-foreground">
          <code className="font-mono text-destructive/80">{event.eliminated_lens_id}</code>
          <span className="mx-1 text-muted-foreground/60">(P{event.eliminated_priority})</span>
          eliminated by
          <code className="font-mono text-emerald-400 ml-1">{event.winner_lens_id}</code>
          <span className="mx-1 text-muted-foreground/60">(P{event.winner_priority})</span>
        </span>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {event.reason === "mutual_exclusion" ? `Group: ${event.group}` : "Pairwise"}
      </Badge>
    </div>
  );
}

// ── Main Panel ──

export function LensDebugPanel({ caseId }: { caseId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const { data, isLoading, error, refetch } = trpc.lenses.getActivationTrace.useQuery(
    { caseId },
    { enabled: !!caseId && expanded, refetchInterval: false }
  );

  const toggleManual = trpc.lenses.toggleManual.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Lens override updated");
    },
    onError: (err) => {
      toast.error(`Failed to update lens: ${err.message}`);
    },
  });

  const trace = data?.trace as ActivationTrace | undefined;

  // Track manual overrides
  const manualLensIds = useMemo(() => {
    if (!trace) return new Set<string>();
    return new Set(
      trace.final_lenses
        .filter((l) => l.activation_source === "manual")
        .map((l) => l.lens_id)
    );
  }, [trace]);

  const handleToggle = (lensId: string, active: boolean) => {
    if (!trace) return;
    const currentManual = trace.final_lenses
      .filter((l) => l.activation_source === "manual")
      .map((l) => l.lens_id);

    let newManual: string[];
    if (active) {
      newManual = [...new Set([...currentManual, lensId])];
    } else {
      newManual = currentManual.filter((id) => id !== lensId);
    }

    toggleManual.mutate({ caseId, lensIds: newManual });
  };

  const handleResetOverrides = () => {
    toggleManual.mutate({ caseId, lensIds: [] });
  };

  // Group lenses by category
  const groupedLenses = useMemo(() => {
    if (!trace) return { structural: [], domain: [], interpretive: [] };
    const groups: Record<string, ActivatedLens[]> = { structural: [], domain: [], interpretive: [] };
    for (const lens of trace.final_lenses) {
      (groups[lens.category] || groups.interpretive).push(lens);
    }
    return groups;
  }, [trace]);

  return (
    <Card className="border-primary/20">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Lens Debug Panel</CardTitle>
                {trace && (
                  <Badge variant="outline" className="text-[10px] ml-2">
                    {trace.final_lenses.length} active
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {trace && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    v{trace.registry_version}
                  </span>
                )}
                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error.message}
              </div>
            )}

            {trace && (
              <>
                {/* ── Header: Pipeline Info ── */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Pipeline Type</span>
                    <div className="font-mono text-foreground">
                      {trace.resolved_pipeline_type || "—"}
                      {trace.pipeline_resolution && !trace.pipeline_resolution.is_canonical && (
                        <span className="text-muted-foreground ml-1">
                          (from: {trace.pipeline_resolution.original_input})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Category</span>
                    <div className="font-mono text-foreground">{trace.pipeline_category || "—"}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Input Signals</span>
                    <div className="flex flex-wrap gap-1">
                      {trace.input_signals.length === 0 && <span className="text-muted-foreground italic">none</span>}
                      {trace.input_signals.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Registry</span>
                    <div className="font-mono text-foreground">
                      v{trace.registry_version}
                      <span className="text-muted-foreground ml-1 text-[10px]">
                        ({trace.registry_hash.slice(0, 8)}...)
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Stage Pipeline Visualization ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Activation Pipeline</span>
                    <span className="text-[10px] text-muted-foreground">
                      {trace.stage_counts.raw_activations} raw → {trace.stage_counts.final} final
                    </span>
                  </div>
                  <StagePipeline counts={trace.stage_counts} />
                </div>

                {/* ── Activation Sources (collapsible) ── */}
                {trace.activation_sources.length > 0 && (
                  <Collapsible open={showSources} onOpenChange={setShowSources}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
                        {showSources ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <GitBranch className="h-3 w-3" />
                        <span>Activation Sources ({trace.activation_sources.length})</span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                        {trace.activation_sources.map((src, i) => (
                          <div key={`${src.lens_id}-${i}`} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/30">
                            <code className="font-mono text-foreground flex-1 truncate">{src.lens_id}</code>
                            <Badge variant="outline" className={`text-[10px] ${SOURCE_COLORS[src.source] || ""}`}>
                              {src.step}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* ── Dependencies Added ── */}
                {trace.added_by_dependency.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Activity className="h-3 w-3" />
                      Added by Dependency ({trace.added_by_dependency.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {trace.added_by_dependency.map((id) => (
                        <Badge key={id} variant="outline" className="text-[10px] bg-slate-500/10 text-slate-400 border-slate-500/20">
                          {id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Conflict Resolution (collapsible) ── */}
                {trace.conflict_resolutions.length > 0 && (
                  <Collapsible open={showConflicts} onOpenChange={setShowConflicts}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
                        {showConflicts ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span>Conflict Resolutions ({trace.conflict_resolutions.length})</span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-1.5">
                        {trace.conflict_resolutions.map((event, i) => (
                          <ConflictCard key={i} event={event} />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* ── Active Lenses by Category ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Active Lenses</span>
                    <div className="flex items-center gap-2">
                      {manualLensIds.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={handleResetOverrides}
                          disabled={toggleManual.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset Overrides
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Structural */}
                  {groupedLenses.structural.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-blue-400" />
                        <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">
                          Structural ({groupedLenses.structural.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {groupedLenses.structural.map((lens) => (
                          <LensCard
                            key={lens.lens_id}
                            lens={lens}
                            isManuallyActive={manualLensIds.has(lens.lens_id)}
                            onToggle={handleToggle}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Domain */}
                  {groupedLenses.domain.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
                          Domain ({groupedLenses.domain.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {groupedLenses.domain.map((lens) => (
                          <LensCard
                            key={lens.lens_id}
                            lens={lens}
                            isManuallyActive={manualLensIds.has(lens.lens_id)}
                            onToggle={handleToggle}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interpretive */}
                  {groupedLenses.interpretive.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Microscope className="h-3 w-3 text-amber-400" />
                        <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                          Interpretive ({groupedLenses.interpretive.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {groupedLenses.interpretive.map((lens) => (
                          <LensCard
                            key={lens.lens_id}
                            lens={lens}
                            isManuallyActive={manualLensIds.has(lens.lens_id)}
                            onToggle={handleToggle}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Footer: Timestamp ── */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                  <span>Generated: {new Date(trace.generated_at).toLocaleString()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] gap-1"
                    onClick={() => refetch()}
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Refresh
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
