import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, Search, Shield, Target,
  Users, Layers, Sparkles, ChevronRight, Compass,
  Home, Briefcase, Heart, AlertTriangle, CreditCard,
  ShieldAlert, Scale, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Color Map ─── */
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  pink:    { bg: "bg-pink-500/5",    border: "border-pink-500/15",    text: "text-pink-400",    accent: "#ec4899" },
  purple:  { bg: "bg-purple-500/5",  border: "border-purple-500/15",  text: "text-purple-400",  accent: "#a855f7" },
  blue:    { bg: "bg-blue-500/5",    border: "border-blue-500/15",    text: "text-blue-400",    accent: "#3b82f6" },
  yellow:  { bg: "bg-yellow-500/5",  border: "border-yellow-500/15",  text: "text-yellow-400",  accent: "#eab308" },
  amber:   { bg: "bg-amber-500/5",   border: "border-amber-500/15",   text: "text-amber-400",   accent: "#f59e0b" },
  green:   { bg: "bg-green-500/5",   border: "border-green-500/15",   text: "text-green-400",   accent: "#22c55e" },
  emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/15", text: "text-emerald-400", accent: "#10b981" },
  indigo:  { bg: "bg-indigo-500/5",  border: "border-indigo-500/15",  text: "text-indigo-400",  accent: "#6366f1" },
  cyan:    { bg: "bg-cyan-500/5",    border: "border-cyan-500/15",    text: "text-cyan-400",    accent: "#06b6d4" },
  red:     { bg: "bg-red-500/5",     border: "border-red-500/15",     text: "text-red-400",     accent: "#ef4444" },
  violet:  { bg: "bg-violet-500/5",  border: "border-violet-500/15",  text: "text-violet-400",  accent: "#8b5cf6" },
  orange:  { bg: "bg-orange-500/5",  border: "border-orange-500/15",  text: "text-orange-400",  accent: "#f97316" },
  sky:     { bg: "bg-sky-500/5",     border: "border-sky-500/15",     text: "text-sky-400",     accent: "#0ea5e9" },
  rose:    { bg: "bg-rose-500/5",    border: "border-rose-500/15",    text: "text-rose-400",    accent: "#f43f5e" },
  slate:   { bg: "bg-slate-500/5",   border: "border-slate-500/15",   text: "text-slate-400",   accent: "#64748b" },
};

export default function CategoryExplorer() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories, isLoading } = trpc.categories.list.useQuery();

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.pipelines.some(
          (p) =>
            p.pipeline_id.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        )
    );
  }, [categories, searchQuery]);

  const totalPipelines = useMemo(
    () => categories?.reduce((sum, c) => sum + c.pipeline_count, 0) || 0,
    [categories]
  );
  const totalSituations = useMemo(
    () => categories?.reduce((sum, c) => sum + c.situation_count, 0) || 0,
    [categories]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 py-8">
            <button
              onClick={() => setLocation("/mudroom")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            Where is the obstacle showing up in your life right now?
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-2xl">
            You can explore more than one area if your situation overlaps. Browse all {categories?.length || 0} categories
            to find the right pipeline — or use{" "}
            <button
              onClick={() => setLocation("/guided-intake")}
              className="text-primary hover:underline"
            >
              Guided Intake
            </button>{" "}
            to let us figure it out together.
          </p>

          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-xs">
              <Layers className="w-3 h-3 mr-1" />
              {categories?.length || 0} categories
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Target className="w-3 h-3 mr-1" />
              {totalPipelines} pipelines
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              {totalSituations.toLocaleString()} situations mapped
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Situation strip */}
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-2.5">Situations people often explore here:</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Eviction notice", icon: Home, search: "eviction tenant housing" },
              { label: "Denied disability benefits", icon: ShieldAlert, search: "disability benefits denial" },
              { label: "Workplace retaliation", icon: Briefcase, search: "retaliation employment" },
              { label: "Medical bill dispute", icon: Heart, search: "medical billing insurance" },
              { label: "Child custody issue", icon: Users, search: "custody family" },
              { label: "Identity theft", icon: AlertTriangle, search: "identity theft fraud" },
              { label: "Wage theft", icon: CreditCard, search: "wage theft unpaid" },
              { label: "Police misconduct", icon: Scale, search: "police misconduct civil rights" },
            ].map((sit) => (
              <button
                key={sit.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                onClick={() => setSearchQuery(sit.search)}
              >
                <sit.icon className="w-3 h-3" />
                {sit.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search categories or pipelines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Not sure where to start?{" "}
          <button
            onClick={() => setLocation("/mudroom")}
            className="text-primary hover:underline"
          >
            Try the guided conversation
          </button>.
        </p>

        {/* Category Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCategories.map((cat) => {
            const colors = COLOR_MAP[cat.color] || COLOR_MAP.slate;
            return (
              <Card
                key={cat.category}
                className={cn(
                  "border cursor-pointer transition-all duration-200 hover:shadow-md group",
                  colors.border,
                  colors.bg
                )}
                onClick={() => setLocation(`/category/${cat.category}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="text-2xl">{cat.icon}</span>
                        <h3 className="text-base font-semibold text-foreground">{cat.label}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                        {cat.description}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xs font-medium", colors.text)}>
                          {cat.pipeline_count} pipelines
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cat.situation_count} situations
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredCategories.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No categories match "{searchQuery}"</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Not sure which category fits? Use{" "}
            <button
              onClick={() => setLocation("/guided-intake")}
              className="text-primary hover:underline"
            >
              Guided Intake
            </button>{" "}
            — describe what happened in your own words and we'll find the right pipeline.
          </p>
        </div>
      </div>
    </div>
  );
}
