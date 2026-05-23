import { useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, Search, Shield, ChevronDown,
  ChevronUp, Eye, FileText, AlertTriangle, Users,
  Scale, Clock, Sparkles, ExternalLink, Layers,
  Target, Building2, Lock, Zap, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Color Map ─── */
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string; accent: string; ring: string }> = {
  pink:    { bg: "bg-pink-500/5",    border: "border-pink-500/15",    text: "text-pink-400",    badge: "bg-pink-500/10 text-pink-300 border-pink-500/20",    accent: "#ec4899", ring: "ring-pink-500/20" },
  purple:  { bg: "bg-purple-500/5",  border: "border-purple-500/15",  text: "text-purple-400",  badge: "bg-purple-500/10 text-purple-300 border-purple-500/20",  accent: "#a855f7", ring: "ring-purple-500/20" },
  blue:    { bg: "bg-blue-500/5",    border: "border-blue-500/15",    text: "text-blue-400",    badge: "bg-blue-500/10 text-blue-300 border-blue-500/20",    accent: "#3b82f6", ring: "ring-blue-500/20" },
  yellow:  { bg: "bg-yellow-500/5",  border: "border-yellow-500/15",  text: "text-yellow-400",  badge: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",  accent: "#eab308", ring: "ring-yellow-500/20" },
  amber:   { bg: "bg-amber-500/5",   border: "border-amber-500/15",   text: "text-amber-400",   badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",   accent: "#f59e0b", ring: "ring-amber-500/20" },
  green:   { bg: "bg-green-500/5",   border: "border-green-500/15",   text: "text-green-400",   badge: "bg-green-500/10 text-green-300 border-green-500/20",   accent: "#22c55e", ring: "ring-green-500/20" },
  emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/15", text: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", accent: "#10b981", ring: "ring-emerald-500/20" },
  indigo:  { bg: "bg-indigo-500/5",  border: "border-indigo-500/15",  text: "text-indigo-400",  badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",  accent: "#6366f1", ring: "ring-indigo-500/20" },
  cyan:    { bg: "bg-cyan-500/5",    border: "border-cyan-500/15",    text: "text-cyan-400",    badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",    accent: "#06b6d4", ring: "ring-cyan-500/20" },
  red:     { bg: "bg-red-500/5",     border: "border-red-500/15",     text: "text-red-400",     badge: "bg-red-500/10 text-red-300 border-red-500/20",     accent: "#ef4444", ring: "ring-red-500/20" },
  violet:  { bg: "bg-violet-500/5",  border: "border-violet-500/15",  text: "text-violet-400",  badge: "bg-violet-500/10 text-violet-300 border-violet-500/20",  accent: "#8b5cf6", ring: "ring-violet-500/20" },
  orange:  { bg: "bg-orange-500/5",  border: "border-orange-500/15",  text: "text-orange-400",  badge: "bg-orange-500/10 text-orange-300 border-orange-500/20",  accent: "#f97316", ring: "ring-orange-500/20" },
  sky:     { bg: "bg-sky-500/5",     border: "border-sky-500/15",     text: "text-sky-400",     badge: "bg-sky-500/10 text-sky-300 border-sky-500/20",     accent: "#0ea5e9", ring: "ring-sky-500/20" },
  rose:    { bg: "bg-rose-500/5",    border: "border-rose-500/15",    text: "text-rose-400",    badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",    accent: "#f43f5e", ring: "ring-rose-500/20" },
  slate:   { bg: "bg-slate-500/5",   border: "border-slate-500/15",   text: "text-slate-400",   badge: "bg-slate-500/10 text-slate-300 border-slate-500/20",   accent: "#64748b", ring: "ring-slate-500/20" },
};

/* ─── Pipeline Card ─── */
function PipelineCard({
  pipeline,
  colors,
  onStart,
  expanded,
  onToggle,
}: {
  pipeline: {
    pipeline_id: string;
    description: string;
    aliases: string[];
    default_lenses: string[];
    situation_count: number;
    oversight_entities: string[];
    escalation_profile: Record<string, string>;
  };
  colors: typeof COLOR_MAP[string];
  onStart: (pipelineId: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = pipeline.pipeline_id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card className={cn("border transition-all duration-200 hover:shadow-md", colors.border, colors.bg)}>
      <CardContent className="p-0">
        {/* Header */}
        <button onClick={onToggle} className="w-full text-left p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground mb-1.5">{label}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {pipeline.description}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              <Badge variant="outline" className={cn("text-[10px] font-medium", colors.badge)}>
                {pipeline.situation_count} situations
              </Badge>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </button>

        {/* Expanded Detail */}
        {expanded && (
          <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
            {/* Aliases */}
            {pipeline.aliases.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Also Known As
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {pipeline.aliases.map((alias) => (
                    <Badge key={alias} variant="outline" className="text-[10px] bg-muted/30">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Lenses */}
            {pipeline.default_lenses.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Eye className="w-3 h-3" /> Analysis Lenses
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {pipeline.default_lenses.map((lens) => (
                    <Badge key={lens} variant="outline" className={cn("text-[10px]", colors.badge)}>
                      {lens.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Oversight */}
            {pipeline.oversight_entities.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Oversight Entities
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {pipeline.oversight_entities.map((entity) => (
                    <Badge key={entity} variant="outline" className="text-[10px] bg-muted/30">
                      {entity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Escalation */}
            {pipeline.escalation_profile && Object.keys(pipeline.escalation_profile).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" /> Escalation Path
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(pipeline.escalation_profile).map(([key, value], idx) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                        key === "emergency" ? "bg-red-500/20 text-red-400" : `${colors.bg} ${colors.text}`
                      )}>
                        {key === "emergency" ? "!" : String(idx + 1)}
                      </span>
                      <div className="min-w-0">
                        <span className="text-muted-foreground/60 block text-[10px] capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className="text-muted-foreground leading-tight">
                          {(value || "").replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action */}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onStart(pipeline.pipeline_id)}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Start Investigation
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStart(pipeline.pipeline_id)}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Learn More
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Category Landing Page ─── */
export default function CategoryLanding() {
  const [, params] = useRoute("/category/:categoryId");
  const categoryId = params?.categoryId || "";
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);

  const { data: category, isLoading } = trpc.categories.detail.useQuery(
    { categoryId },
    { enabled: !!categoryId }
  );

  const colors = useMemo(() => {
    return COLOR_MAP[category?.color || "slate"] || COLOR_MAP.slate;
  }, [category?.color]);

  const filteredPipelines = useMemo(() => {
    if (!category?.pipelines) return [];
    if (!searchQuery.trim()) return category.pipelines;
    const q = searchQuery.toLowerCase();
    return category.pipelines.filter(
      (p) =>
        p.pipeline_id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q)) ||
        p.default_lenses.some((l) => l.toLowerCase().includes(q))
    );
  }, [category?.pipelines, searchQuery]);

  const handleStartPipeline = (pipelineId: string) => {
    const label = pipelineId.replace(/_/g, " ");
    setLocation(`/intake?situation=${encodeURIComponent(`I need help with ${label}`)}&pipeline=${encodeURIComponent(pipelineId)}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading category data...</p>
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">Category Not Found</h2>
          <p className="text-muted-foreground">The category "{categoryId}" does not exist.</p>
          <Button onClick={() => setLocation("/welcome")} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className={cn("border-b", colors.border)} style={{ background: `linear-gradient(135deg, ${colors.accent}08, transparent)` }}>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button
            onClick={() => setLocation("/welcome")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-start gap-4">
            <span className="text-4xl">{category.icon}</span>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground mb-2">{category.label}</h1>
              <p className="text-muted-foreground leading-relaxed max-w-2xl">
                {category.description}
              </p>
              <div className="flex items-center gap-4 mt-4">
                <Badge variant="outline" className={cn("text-xs", colors.badge)}>
                  <Target className="w-3 h-3 mr-1" />
                  {category.pipeline_count} pipelines
                </Badge>
                <Badge variant="outline" className={cn("text-xs", colors.badge)}>
                  <Users className="w-3 h-3 mr-1" />
                  {category.situation_count} situations mapped
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <Button
            variant="outline"
            className="h-auto py-3 justify-start"
            onClick={() => setLocation("/guided-intake")}
          >
            <Sparkles className="w-4 h-4 mr-2 text-primary" />
            <div className="text-left">
              <div className="text-sm font-medium">Guided Intake</div>
              <div className="text-[10px] text-muted-foreground">Tell us what happened</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-3 justify-start"
            onClick={() => setLocation("/lighthouse")}
          >
            <MapPin className="w-4 h-4 mr-2 text-primary" />
            <div className="text-left">
              <div className="text-sm font-medium">Find Help</div>
              <div className="text-[10px] text-muted-foreground">Local resources & legal aid</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-3 justify-start"
            onClick={() => setLocation("/legal-library")}
          >
            <Scale className="w-4 h-4 mr-2 text-primary" />
            <div className="text-left">
              <div className="text-sm font-medium">Legal Library</div>
              <div className="text-[10px] text-muted-foreground">Statutes & case law</div>
            </div>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${category.label.toLowerCase()} pipelines...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Pipeline Grid */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Shield className={cn("w-5 h-5", colors.text)} />
            Investigation Pipelines
            <span className="text-sm font-normal text-muted-foreground">
              ({filteredPipelines.length})
            </span>
          </h2>

          {filteredPipelines.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No pipelines match "{searchQuery}"
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredPipelines.map((pipeline) => (
                <PipelineCard
                  key={pipeline.pipeline_id}
                  pipeline={pipeline}
                  colors={colors}
                  onStart={handleStartPipeline}
                  expanded={expandedPipeline === pipeline.pipeline_id}
                  onToggle={() =>
                    setExpandedPipeline(
                      expandedPipeline === pipeline.pipeline_id ? null : pipeline.pipeline_id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
            This is a forensic documentation tool, not legal advice. Every pipeline helps you
            organize evidence, identify patterns, and understand your rights — but always consult
            with a qualified attorney for legal guidance specific to your situation.
          </p>
        </div>
      </div>
    </div>
  );
}
