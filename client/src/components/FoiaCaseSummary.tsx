import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Clock, AlertTriangle, CheckCircle2, Send,
  Eye, Edit3, XCircle, Scale, Inbox, Building2,
  ChevronRight, HandHeart, Timer, AlertCircle, ClipboardList,
} from "lucide-react";
import { useLocation } from "wouter";

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  draft: { label: "Draft", icon: Edit3, color: "text-amber-400" },
  ready: { label: "Ready", icon: CheckCircle2, color: "text-emerald-400" },
  submitted: { label: "Submitted", icon: Send, color: "text-blue-400" },
  acknowledged: { label: "Ack'd", icon: Eye, color: "text-blue-400" },
  in_processing: { label: "Processing", icon: Clock, color: "text-violet-400" },
  records_produced: { label: "Received", icon: Inbox, color: "text-emerald-400" },
  partial_denial: { label: "Partial Denial", icon: AlertCircle, color: "text-amber-400" },
  denied: { label: "Denied", icon: XCircle, color: "text-red-400" },
  appeal_prepared: { label: "Appeal Prep", icon: Scale, color: "text-amber-400" },
  appeal_submitted: { label: "Appeal Sent", icon: Send, color: "text-violet-400" },
  closed: { label: "Closed", icon: CheckCircle2, color: "text-muted-foreground" },
};

export function FoiaCaseSummary({ caseId }: { caseId: number }) {
  const [, setLocation] = useLocation();
  const { data: summary, isLoading } = trpc.foiaRequests.caseSummary.useQuery(
    { caseId },
    { enabled: !!caseId }
  );

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  if (!summary || summary.total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            FOIA Requests
            <Badge variant="outline" className="text-[9px] ml-1">{summary.total}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-[10px] h-6 gap-1 text-primary"
            onClick={() => setLocation("/foia")}
          >
            View All <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status breakdown */}
        <div className="flex gap-3 flex-wrap">
          {Object.entries(summary.byStatus).map(([status, count]) => {
            const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
            const Icon = config.icon;
            return (
              <div key={status} className="flex items-center gap-1.5">
                <Icon className={`h-3 w-3 ${config.color}`} />
                <span className="text-[10px] text-muted-foreground">{config.label}</span>
                <span className="text-[10px] font-mono text-foreground">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Alerts row */}
        {(summary.overdueCount > 0 || summary.approachingCount > 0 || summary.warmHandoffCount > 0) && (
          <div className="flex gap-2 flex-wrap">
            {summary.overdueCount > 0 && (
              <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30 animate-pulse">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                {summary.overdueCount} overdue
              </Badge>
            )}
            {summary.approachingCount > 0 && (
              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                <Timer className="h-2.5 w-2.5 mr-0.5" />
                {summary.approachingCount} deadline{summary.approachingCount !== 1 ? "s" : ""} approaching
              </Badge>
            )}
            {summary.warmHandoffCount > 0 && (
              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                <HandHeart className="h-2.5 w-2.5 mr-0.5" />
                {summary.warmHandoffCount} flagged for consultation
              </Badge>
            )}
          </div>
        )}

        {/* Mini request list (top 3) */}
        <div className="space-y-1.5">
          {summary.requests.slice(0, 3).map((req: any) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.draft;
            const Icon = config.icon;
            return (
              <div key={req.id} className="flex items-center gap-2 text-[10px]">
                <Icon className={`h-3 w-3 ${config.color} shrink-0`} />
                <span className="text-foreground truncate flex-1">
                  {req.agencyName ?? req.recordType?.replace(/_/g, " ")}
                </span>
                <Badge variant="outline" className="text-[8px] px-1 py-0">
                  {config.label}
                </Badge>
              </div>
            );
          })}
          {summary.total > 3 && (
            <p className="text-[9px] text-muted-foreground/60 pl-5">
              +{summary.total - 3} more request{summary.total - 3 !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
