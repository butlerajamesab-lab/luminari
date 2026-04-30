import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, ChevronDown, ChevronRight, ExternalLink, Users, Building2, FileX, AlertTriangle, Scale, ShieldAlert, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const PATTERN_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  entity_recurrence: { label: "Entity Recurrence", icon: Users, color: "text-blue-400", bgColor: "bg-blue-500/10" },
  agency_behavior: { label: "Agency Behavior", icon: Building2, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  denial_language_pattern: { label: "Denial Language", icon: Scale, color: "text-red-400", bgColor: "bg-red-500/10" },
  foia_denial_pattern: { label: "FOIA Denial", icon: FileX, color: "text-orange-400", bgColor: "bg-orange-500/10" },
  record_gap_pattern: { label: "Record Gap", icon: AlertTriangle, color: "text-yellow-400", bgColor: "bg-yellow-500/10" },
  regulatory_violation_pattern: { label: "Regulatory Violation", icon: ShieldAlert, color: "text-purple-400", bgColor: "bg-purple-500/10" },
};

function PatternTypeIcon({ type, className }: { type: string; className?: string }) {
  const meta = PATTERN_TYPE_META[type];
  if (!meta) return <Network className={className} />;
  const Icon = meta.icon;
  return <Icon className={className} />;
}

function RelatedCasesPanel({ patternId, patternDescription }: { patternId: number; patternDescription: string }) {
  const { data: relatedCases, isLoading } = trpc.patterns.casesForPattern.useQuery({ patternId });
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!relatedCases || relatedCases.length === 0) {
    return <p className="text-xs text-muted-foreground pt-2">No related cases found.</p>;
  }

  return (
    <div className="pt-2 space-y-1.5">
      <p className="text-xs text-muted-foreground mb-2">{patternDescription}</p>
      {relatedCases.map((c) => (
        <button
          key={c.caseId}
          onClick={() => navigate(`/case/${c.caseId}`)}
          className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-foreground truncate">{c.caseName}</span>
            {c.pipelineType && (
              <Badge variant="outline" className="text-[10px] shrink-0">{c.pipelineType}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{c.occurrenceCount} occurrence{c.occurrenceCount !== 1 ? "s" : ""}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      ))}
    </div>
  );
}

function PatternCard({ pattern }: {
  pattern: {
    patternId: number;
    patternType: string;
    signature: string;
    description: string;
    occurrenceCount: number;
    firstSeenAt: number;
    lastSeenAt: number;
    caseOccurrences: {
      id: number;
      evidenceReferenceId: number;
      evidenceReferenceType: string;
      entityId: number | null;
      agencyId: number | null;
      createdAt: number;
    }[];
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = PATTERN_TYPE_META[pattern.patternType] || {
    label: pattern.patternType,
    icon: Network,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
  };

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-md ${meta.bgColor}`}>
            <PatternTypeIcon type={pattern.patternType} className={`h-3.5 w-3.5 ${meta.color}`} />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground block truncate">{pattern.description}</span>
            <span className="text-[11px] text-muted-foreground">{meta.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {pattern.occurrenceCount} case{pattern.occurrenceCount !== 1 ? "s" : ""}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <RelatedCasesPanel patternId={pattern.patternId} patternDescription={pattern.description} />
        </div>
      )}
    </div>
  );
}

export function PatternSignals({ caseId }: { caseId: number }) {
  const { data: patterns, isLoading } = trpc.patterns.forCase.useQuery(
    { caseId },
    { enabled: !!caseId }
  );
  const detectMutation = trpc.patterns.detect.useMutation({
    onSuccess: () => {
      utils.patterns.forCase.invalidate({ caseId });
      utils.patterns.countForCase.invalidate({ caseId });
    },
  });
  const utils = trpc.useUtils();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-indigo-400" />
            Pattern Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!patterns || patterns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-indigo-400" />
            Pattern Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Network className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm text-muted-foreground">No cross-case patterns detected yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Patterns are detected automatically when evidence is processed across multiple cases.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectMutation.mutate({ caseId })}
              disabled={detectMutation.isPending}
            >
              {detectMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Network className="h-3.5 w-3.5 mr-1.5" />
              )}
              Scan for Patterns
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-indigo-400" />
            Pattern Signals
            <Badge variant="secondary" className="text-[10px] ml-1">
              {patterns.length}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => detectMutation.mutate({ caseId })}
            disabled={detectMutation.isPending}
            className="h-7 text-xs"
          >
            {detectMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Network className="h-3 w-3 mr-1" />
            )}
            Rescan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {patterns.map((pattern) => (
            <PatternCard key={pattern.patternId} pattern={pattern} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
