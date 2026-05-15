import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ScrollText,
  RefreshCw,
  FileText,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Download,
  BookOpen,
  Calendar,
  Quote,
  Lightbulb,
  ClipboardList,
  Send,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

// Source type icons and colors
const SOURCE_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  event: { icon: Calendar, color: "text-blue-400", label: "Event" },
  quote: { icon: Quote, color: "text-amber-400", label: "Quote" },
  claim: { icon: BookOpen, color: "text-emerald-400", label: "Claim" },
  finding: { icon: Lightbulb, color: "text-purple-400", label: "Finding" },
  foia_request: { icon: ClipboardList, color: "text-cyan-400", label: "FOIA Request" },
};

/** Source reference badge with tooltip */
function SourceBadge({ source, onNavigate }: {
  source: { type: string; id: number; label: string; documentId?: number; documentName?: string; page?: number; date?: string };
  onNavigate: (path: string) => void;
}) {
  const config = SOURCE_CONFIG[source.type] || { icon: FileText, color: "text-muted-foreground", label: source.type };
  const Icon = config.icon;

  const handleClick = () => {
    if (source.documentId) {
      onNavigate(`/documents/${source.documentId}`);
    } else if (source.type === "finding") {
      onNavigate("/findings");
    } else if (source.type === "foia_request") {
      onNavigate("/foia");
    } else if (source.type === "event") {
      onNavigate("/timeline");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted/50 hover:bg-muted transition-colors cursor-pointer border border-border/50"
        >
          <Icon className={`w-3 h-3 ${config.color}`} />
          <span className="text-muted-foreground">{config.label} #{source.id}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium text-xs">{source.label}</p>
        {source.documentName && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Source: {source.documentName}{source.page ? `, p.${source.page}` : ""}
          </p>
        )}
        {source.date && (
          <p className="text-xs text-muted-foreground">Date: {source.date}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Paragraph with inline source references */
function NarrativeParagraph({ text, sources, paragraphIndex, onNavigate }: {
  text: string;
  sources: { type: string; id: number; label: string; documentId?: number; documentName?: string; page?: number; date?: string }[];
  paragraphIndex: number;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="group relative">
      <div className="flex gap-3">
        <div className="text-xs text-muted-foreground/50 pt-1 w-6 text-right shrink-0 font-mono">
          {paragraphIndex + 1}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sources.map((source, i) => (
                <SourceBadge key={`${source.type}-${source.id}-${i}`} source={source} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Timeline preview section */
function TimelinePreview({ caseId }: { caseId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = trpc.caseNarrative.timeline.useQuery(
    { caseId },
    { enabled: expanded }
  );

  return (
    <Card className="border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Evidence Timeline Preview</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading timeline data...
            </div>
          ) : data ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {data.totalCount} evidence items across {data.groups.length} date groups
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.groups.map((group: any, gi: number) => (
                  <div key={gi}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </p>
                    <div className="ml-3 space-y-0.5 mt-1">
                      {group.items.slice(0, 5).map((item: any, ii: number) => {
                        const config = SOURCE_CONFIG[item.type] || { icon: FileText, color: "text-muted-foreground", label: item.type };
                        const Icon = config.icon;
                        return (
                          <div key={ii} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icon className={`w-3 h-3 ${config.color} shrink-0`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                        );
                      })}
                      {group.items.length > 5 && (
                        <p className="text-xs text-muted-foreground/60 ml-4">
                          +{group.items.length - 5} more items
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No timeline data available.</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function StatementOfFacts() {
  const { currentCase } = useCase();
  const [, navigate] = useLocation();
  const caseId = currentCase?.id;

  // Queries
  const narrativeQuery = trpc.caseNarrative.get.useQuery(
    { caseId: caseId! },
    { enabled: !!caseId }
  );
  const stalenessQuery = trpc.caseNarrative.staleness.useQuery(
    { caseId: caseId! },
    { enabled: !!caseId }
  );

  // Mutation
  const generateMutation = trpc.caseNarrative.generate.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Statement of Facts generated from ${result.timelineItemCount} evidence items.`);
        narrativeQuery.refetch();
        stalenessQuery.refetch();
      } else {
        toast.error(result.error || "Generation failed.");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleGenerate = () => {
    if (!caseId) return;
    generateMutation.mutate({ caseId });
  };

  const handleCopyToClipboard = () => {
    if (narrativeQuery.data?.content) {
      navigator.clipboard.writeText(narrativeQuery.data.content);
      toast.success("Copied to clipboard");
    }
  };

  if (!caseId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5" />
              Statement of Facts
            </CardTitle>
            <CardDescription>
              Select a case from the sidebar to generate a Statement of Facts.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const narrative = narrativeQuery.data;
  const staleness = stalenessQuery.data;
  const isStale = staleness?.isStale ?? false;
  const isGenerating = generateMutation.isPending;
  const sourceMap = narrative?.sourceMap as any[] | undefined;

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            Statement of Facts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological narrative reconstructed from case evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {narrative && (
            <>
              <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                <Download className="w-4 h-4 mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                onClick={() => navigate(`/lumensend?type=demand&context=statement_of_facts`)}
              >
                <Send className="w-4 h-4 mr-1" />
                Draft Demand Letter
              </Button>
            </>
          )}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            size="sm"
            variant={narrative ? "outline" : "default"}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : narrative ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1" />
                Regenerate
              </>
            ) : (
              <>
                <ScrollText className="w-4 h-4 mr-1" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Staleness warning */}
      {isStale && narrative && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-amber-400">New evidence has been added since this narrative was generated.</span>
              <span className="text-muted-foreground ml-1">
                ({staleness?.narrativeItemCount} items at generation, {staleness?.currentItemCount} now).
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 shrink-0"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Regenerating...</>
              ) : (
                <><RefreshCw className="w-3 h-3 mr-1" />Regenerate</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Timeline preview */}
      <TimelinePreview caseId={caseId} />

      {/* Narrative content */}
      {narrativeQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading narrative...</p>
          </CardContent>
        </Card>
      ) : narrative ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Statement of Facts — {currentCase?.name}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {narrative.timelineItemCount} sources
              </Badge>
            </div>
            <CardDescription>
              Generated {new Date(narrative.generatedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6 space-y-4">
            {sourceMap && sourceMap.length > 0 ? (
              sourceMap.map((entry: any, idx: number) => {
                // Match paragraph text from content by splitting
                const paragraphs = narrative.content.split("\n\n");
                const text = paragraphs[idx] || "";
                // Detect section headings (## Heading Name)
                if (text.startsWith("## ")) {
                  return (
                    <div key={idx} className="pt-4 pb-1">
                      <h3 className="text-base font-semibold text-foreground tracking-tight border-b border-border/50 pb-2">
                        {text.replace(/^##\s*/, "")}
                      </h3>
                    </div>
                  );
                }
                return (
                  <NarrativeParagraph
                    key={idx}
                    text={text}
                    sources={entry.sources || []}
                    paragraphIndex={idx}
                    onNavigate={navigate}
                  />
                );
              })
            ) : (
              // Fallback: render content as plain paragraphs
              narrative.content.split("\n\n").map((text: string, idx: number) => {
                if (text.startsWith("## ")) {
                  return (
                    <div key={idx} className="pt-4 pb-1">
                      <h3 className="text-base font-semibold text-foreground tracking-tight border-b border-border/50 pb-2">
                        {text.replace(/^##\s*/, "")}
                      </h3>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="flex gap-3">
                    <div className="text-xs text-muted-foreground/50 pt-1 w-6 text-right shrink-0 font-mono">
                      {idx + 1}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 flex-1">{text}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <ScrollText className="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No Statement of Facts yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate a chronological narrative from your case evidence.
                The system will assemble events, quotes, claims, findings, and FOIA requests
                into a structured statement with source references.
              </p>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ScrollText className="w-4 h-4 mr-1" />
                  Generate Statement of Facts
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Source legend */}
      {narrative && (
        <Card className="border-border/50">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Source Legend</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(SOURCE_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon className={`w-3 h-3 ${config.color}`} />
                    <span>{config.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
