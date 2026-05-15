import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Merge,
  ScanSearch,
  Check,
  X,
  AlertTriangle,
  Loader2,
  User,
  Building,
  MapPin,
  ArrowRight,
  Shield,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const typeIcon: Record<string, typeof User> = {
  person: User,
  organization: Building,
  location: MapPin,
};

function confidenceBadge(confidence: number) {
  if (confidence >= 0.9) return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">High ({(confidence * 100).toFixed(0)}%)</Badge>;
  if (confidence >= 0.7) return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">Medium ({(confidence * 100).toFixed(0)}%)</Badge>;
  return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">Low ({(confidence * 100).toFixed(0)}%)</Badge>;
}

export default function EntityDedup() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | undefined>("pending");
  const [scanningInProgress, setScanningInProgress] = useState(false);

  const utils = trpc.useUtils();

  const { data: suggestions, isLoading } = trpc.dedup.suggestions.useQuery(
    { caseId: currentCaseId!, status: filter },
    { enabled: !!currentCaseId }
  );

  const { data: allEntities } = trpc.entities.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  // Build entity lookup map
  type EntityItem = { id: number; name: string; type: string; description: string | null; aliases: unknown; caseId: number };
  const entityMap = useMemo(() => {
    if (!allEntities) return new Map<number, EntityItem>();
    return new Map(allEntities.map(e => [e.id, e as EntityItem]));
  }, [allEntities]);

  const scanMutation = trpc.dedup.scan.useMutation({
    onMutate: () => setScanningInProgress(true),
    onSuccess: (result) => {
      setScanningInProgress(false);
      if (result.suggestionsFound > 0) {
        toast.success(`Scan complete: ${result.suggestionsFound} potential duplicate(s) found`);
      } else {
        toast.info("Scan complete: no duplicates detected");
      }
      utils.dedup.suggestions.invalidate();
    },
    onError: (err) => {
      setScanningInProgress(false);
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  const reviewMutation = trpc.dedup.review.useMutation({
    onSuccess: () => {
      utils.dedup.suggestions.invalidate();
      utils.entities.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Review failed: ${err.message}`);
    },
  });

  const handleApprove = (id: number, sourceName: string, targetName: string) => {
    toast.promise(
      reviewMutation.mutateAsync({ id, action: "approve" }),
      {
        loading: `Merging "${sourceName}" into "${targetName}"...`,
        success: `Merged successfully. "${sourceName}" absorbed into "${targetName}".`,
        error: "Merge failed",
      }
    );
  };

  const handleReject = (id: number) => {
    reviewMutation.mutate({ id, action: "reject" });
    toast.info("Suggestion dismissed");
  };

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const pendingCount = suggestions?.filter(s => s.status === "pending").length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/entities")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Merge className="h-5 w-5 text-primary" />
              Entity Deduplication
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and approve entity merge suggestions. No merges happen without your approval.
            </p>
          </div>
        </div>
        <Button
          onClick={() => scanMutation.mutate({ caseId: currentCaseId! })}
          disabled={scanningInProgress}
          size="sm"
          className="shrink-0"
        >
          {scanningInProgress ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4 mr-2" />
          )}
          {scanningInProgress ? "Scanning..." : "Scan for Duplicates"}
        </Button>
      </div>

      {/* Container awareness notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3 flex items-start gap-3">
          <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-primary">Container-Aware Deduplication</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Suggestions are scoped to entities within the same case and container. Cross-container merges are never proposed.
              All suggestions require manual review — approve to merge, or reject to dismiss.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {([
          { label: "Pending", value: "pending" as const, count: pendingCount },
          { label: "Approved", value: "approved" as const },
          { label: "Rejected", value: "rejected" as const },
          { label: "All", value: undefined },
        ]).map((tab) => (
          <Button
            key={tab.label}
            variant={filter === tab.value ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setFilter(tab.value)}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">
                {tab.count}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Suggestions list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted/50 rounded-lg animate-pulse" />)}
        </div>
      ) : !suggestions || suggestions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <ScanSearch className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {filter === "pending" ? "No pending suggestions" : `No ${filter || ""} suggestions`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {filter === "pending"
                  ? 'Click "Scan for Duplicates" to analyze entities for potential matches.'
                  : "Try a different filter to see other suggestions."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const source = entityMap.get(s.sourceEntityId);
            const target = entityMap.get(s.targetEntityId);
            const SourceIcon = typeIcon[source?.type || ""] || User;
            const TargetIcon = typeIcon[target?.type || ""] || User;
            const isPending = s.status === "pending";

            return (
              <Card key={s.id} className={`transition-colors ${isPending ? "border-amber-500/20" : s.status === "approved" ? "border-green-500/20 opacity-70" : "border-muted opacity-50"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      {confidenceBadge(s.confidence)}
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {source?.type || "unknown"}
                      </Badge>
                      {s.status !== "pending" && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.status === "approved" ? "text-green-400 border-green-500/30" : "text-muted-foreground"}`}
                        >
                          {s.status === "approved" ? "Merged" : "Dismissed"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Entity pair visualization */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Source (to be absorbed) */}
                    <div className="flex-1 p-2.5 rounded-md bg-destructive/5 border border-destructive/10">
                      <div className="flex items-center gap-2 mb-1">
                        <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">{source?.name ?? `Entity ${s.sourceEntityId}`}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Will be absorbed</p>
                    </div>

                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* Target (surviving) */}
                    <div className="flex-1 p-2.5 rounded-md bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2 mb-1">
                        <TargetIcon className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium truncate">{target?.name ?? `Entity ${s.targetEntityId}`}</span>
                      </div>
                      <p className="text-[10px] text-primary/70">Surviving entity</p>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        className="text-xs h-7 bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(s.id, source?.name || "Source", target?.name || "Target")}
                        disabled={reviewMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Approve Merge
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleReject(s.id)}
                        disabled={reviewMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                      <div className="flex-1" />
                      <span className="text-[10px] text-muted-foreground">
                        Merge will reassign all roles, relationships, and references
                      </span>
                    </div>
                  )}

                  {s.status === "approved" && s.reviewedAt && (
                    <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                      Merged on {new Date(s.reviewedAt).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
