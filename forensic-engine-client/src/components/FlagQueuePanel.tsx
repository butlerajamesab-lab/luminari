import { useState } from "react";
import { Flag, CheckCircle2, XCircle, Eye, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ISSUE_TYPE_LABELS: Record<string, string> = {
  incorrect_data: "Incorrect Data",
  broken_link: "Broken Link",
  missing_info: "Missing Info",
  duplicate: "Duplicate",
  other: "Other",
};

const TARGET_TYPE_COLORS: Record<string, string> = {
  program: "text-blue-400",
  signal: "text-amber-400",
  finding: "text-orange-400",
  kb_table: "text-purple-400",
  oversight_body: "text-emerald-400",
  workflow: "text-cyan-400",
  other: "text-muted-foreground",
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FlagQueuePanel() {
  const [statusFilter, setStatusFilter] = useState<"open" | "reviewed" | "resolved" | "dismissed" | "all">("open");
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.issueReports.listOpen.useQuery(
    { status: statusFilter, limit: 50 },
    { refetchInterval: 30000 }
  );

  const { data: summary } = trpc.issueReports.summary.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const resolve = trpc.issueReports.resolve.useMutation({
    onSuccess: () => {
      utils.issueReports.listOpen.invalidate();
      utils.issueReports.summary.invalidate();
      toast.success("Flag updated");
    },
    onError: (e) => toast.error("Failed to update flag", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Flag className="h-5 w-5 text-orange-400" />
          Flag Queue
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Summary counts */}
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Open", value: summary.open, color: "text-orange-400" },
            { label: "Reviewed", value: summary.reviewed, color: "text-blue-400" },
            { label: "Resolved", value: summary.resolved, color: "text-emerald-400" },
            { label: "Dismissed", value: summary.dismissed, color: "text-muted-foreground" },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.label.toLowerCase() as any)}
              className={`p-2 rounded-lg border text-center transition-colors ${
                statusFilter === s.label.toLowerCase()
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/50 bg-card/50 hover:bg-card/70"
              }`}
            >
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(["open", "reviewed", "resolved", "dismissed", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
              statusFilter === s
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Flag list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-6">Loading flags...</div>
      ) : !data?.reports.length ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          <Flag className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No {statusFilter === "all" ? "" : statusFilter} flags
        </div>
      ) : (
        <div className="space-y-2">
          {data.reports.map((r: any) => (
            <Card key={r.id} className="bg-card/50 border-border/50">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                        {ISSUE_TYPE_LABELS[r.issue_type] ?? r.issue_type}
                      </Badge>
                      <span className={`text-xs font-medium capitalize ${TARGET_TYPE_COLORS[r.target_type] ?? "text-muted-foreground"}`}>
                        {r.target_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(Number(r.created_at))}</span>
                    </div>
                    {r.target_label && (
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{r.target_label}</p>
                    )}
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    )}
                    {r.reporter_name && (
                      <p className="text-xs text-muted-foreground/60 mt-1">by {r.reporter_name}</p>
                    )}
                  </div>
                  {r.status === "open" && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-500/10"
                        title="Mark resolved"
                        onClick={() => resolve.mutate({ id: r.id, status: "resolved" })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-blue-400 hover:bg-blue-500/10"
                        title="Mark reviewed"
                        onClick={() => resolve.mutate({ id: r.id, status: "reviewed" })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted/30"
                        title="Dismiss"
                        onClick={() => resolve.mutate({ id: r.id, status: "dismissed" })}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {data.total > data.reports.length && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Showing {data.reports.length} of {data.total} flags
            </p>
          )}
        </div>
      )}
    </div>
  );
}
