import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Clock, AlertTriangle, CheckCircle2, Send, Eye,
  Edit3, XCircle, Scale, Inbox, Building2, Copy, Download,
  ChevronDown, ChevronRight, HandHeart, Loader2, AlertCircle,
  Filter, RefreshCw, Timer, Shield, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";

// ─── Status Configuration ───

const FOIA_STATUS_CONFIG = {
  draft: { label: "Draft", icon: Edit3, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", step: 0 },
  ready: { label: "Ready to Send", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", step: 1 },
  submitted: { label: "Submitted", icon: Send, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", step: 2 },
  acknowledged: { label: "Acknowledged", icon: Eye, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", step: 3 },
  in_processing: { label: "In Processing", icon: Clock, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", step: 4 },
  records_produced: { label: "Records Received", icon: Inbox, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", step: 5 },
  partial_denial: { label: "Partial Denial", icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", step: 5 },
  denied: { label: "Denied", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", step: 5 },
  appeal_prepared: { label: "Appeal Prepared", icon: Scale, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", step: 6 },
  appeal_submitted: { label: "Appeal Submitted", icon: Send, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", step: 7 },
  closed: { label: "Closed", icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted/50 border-border", step: 8 },
} as const;

const LIFECYCLE_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "ready", label: "Ready" },
  { key: "submitted", label: "Submitted" },
  { key: "acknowledged", label: "Ack'd" },
  { key: "in_processing", label: "Processing" },
  { key: "response", label: "Response" },
  { key: "appeal", label: "Appeal" },
  { key: "closed", label: "Closed" },
];

function getLifecycleStep(status: string): number {
  const config = FOIA_STATUS_CONFIG[status as keyof typeof FOIA_STATUS_CONFIG];
  return config?.step ?? 0;
}

// ─── Lifecycle Timeline Component ───

function LifecycleTimeline({ status }: { status: string }) {
  const currentStep = getLifecycleStep(status);
  const isTerminal = ["records_produced", "partial_denial", "denied", "closed"].includes(status);
  const isDenied = ["denied", "partial_denial"].includes(status);
  const isAppeal = ["appeal_prepared", "appeal_submitted"].includes(status);

  return (
    <div className="flex items-center gap-0.5 w-full">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isActive = i <= currentStep;
        const isCurrent = i === currentStep;
        // Special coloring for denial/appeal
        let dotColor = "bg-muted-foreground/20";
        if (isActive && isDenied && i === 5) dotColor = "bg-red-400";
        else if (isActive && isAppeal && i >= 6) dotColor = "bg-amber-400";
        else if (isActive) dotColor = "bg-primary";

        let lineColor = "bg-muted-foreground/10";
        if (isActive && i < currentStep) lineColor = "bg-primary/40";

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className={`rounded-full transition-all ${
                  isCurrent ? "w-2.5 h-2.5 ring-2 ring-primary/30" : "w-1.5 h-1.5"
                } ${dotColor}`}
              />
              <span className={`text-[7px] leading-none ${
                isCurrent ? "text-foreground font-medium" : isActive ? "text-muted-foreground" : "text-muted-foreground/40"
              }`}>
                {step.label}
              </span>
            </div>
            {i < LIFECYCLE_STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-0.5 ${lineColor}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Deadline Badge ───

function DeadlineBadge({ deadline }: { deadline: { deadlineState: string; daysRemaining: number | null; daysOverdue: number | null } }) {
  if (deadline.deadlineState === "not_applicable") return null;

  if (deadline.deadlineState === "overdue") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/30 animate-pulse">
        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
        {deadline.daysOverdue}d overdue
      </Badge>
    );
  }

  if (deadline.deadlineState === "approaching") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
        <Timer className="h-2.5 w-2.5 mr-0.5" />
        {deadline.daysRemaining}d remaining
      </Badge>
    );
  }

  if (deadline.deadlineState === "pending") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
        <Clock className="h-2.5 w-2.5 mr-0.5" />
        {deadline.daysRemaining}d remaining
      </Badge>
    );
  }

  if (deadline.deadlineState === "met") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
        On time
      </Badge>
    );
  }

  if (deadline.deadlineState === "missed") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/30">
        <XCircle className="h-2.5 w-2.5 mr-0.5" />
        {deadline.daysOverdue}d late
      </Badge>
    );
  }

  return null;
}

// ─── Summary Cards ───

function SummaryCards({ requests }: { requests: any[] }) {
  const total = requests.length;
  const active = requests.filter(r => !["closed"].includes(r.status)).length;
  const overdue = requests.filter(r => r.deadline?.deadlineState === "overdue").length;
  const approaching = requests.filter(r => r.deadline?.deadlineState === "approaching").length;
  const warmHandoff = requests.filter(r => r.warmHandoff).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">Total Requests</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{active}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </CardContent>
      </Card>
      <Card className={overdue > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
        <CardContent className="p-3 text-center">
          <p className={`text-2xl font-bold ${overdue > 0 ? "text-red-400" : "text-muted-foreground"}`}>{overdue}</p>
          <p className="text-[10px] text-muted-foreground">Overdue</p>
        </CardContent>
      </Card>
      <Card className={approaching > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}>
        <CardContent className="p-3 text-center">
          <p className={`text-2xl font-bold ${approaching > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{approaching}</p>
          <p className="text-[10px] text-muted-foreground">Approaching</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 text-center">
          <p className={`text-2xl font-bold ${warmHandoff > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{warmHandoff}</p>
          <p className="text-[10px] text-muted-foreground">Consult Flagged</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Request Row (Global Dashboard) ───

function RequestRow({ request, showCase }: { request: any; showCase?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [, navigateTo] = useLocation();
  const utils = trpc.useUtils();

  const statusConfig = FOIA_STATUS_CONFIG[request.status as keyof typeof FOIA_STATUS_CONFIG]
    || FOIA_STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const updateStatus = trpc.foiaRequests.updateStatus.useMutation({
    onSuccess: () => {
      utils.foiaRequests.listAll.invalidate();
      utils.foiaRequests.list.invalidate({ caseId: request.caseId });
      toast.success("Status updated.");
    },
  });

  const handleCopyLetter = () => {
    if (request.letterContent) {
      navigator.clipboard.writeText(request.letterContent);
      toast.success("Letter copied to clipboard.");
    }
  };

  const handleDownload = () => {
    if (!request.letterContent) return;
    const blob = new Blob([request.letterContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foia-request-${request.recordType}-${request.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={`${statusConfig.bg} transition-colors`}>
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <StatusIcon className={`h-4 w-4 ${statusConfig.color} shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">
                {request.agencyName ?? request.recordType?.replace(/_/g, " ")}
              </span>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusConfig.bg}`}>
                {statusConfig.label}
              </Badge>
              <DeadlineBadge deadline={request.deadline} />
              {request.warmHandoff && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                  <HandHeart className="h-2.5 w-2.5 mr-0.5" /> Consult
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
              {showCase && request.caseName && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-2.5 w-2.5" />
                  {request.caseName}
                </span>
              )}
              <span>{request.recordType?.replace(/_/g, " ")}</span>
              {request.stateCode && <span>{request.stateCode}</span>}
              {request.statuteReference && (
                <span className="flex items-center gap-0.5">
                  <Scale className="h-2.5 w-2.5" />
                  {request.statuteReference}
                </span>
              )}
              {request.agencySubmissionMethods && (
                <span className="capitalize">{request.agencySubmissionMethods}</span>
              )}
            </div>
            {/* Lifecycle timeline */}
            <div className="pt-1">
              <LifecycleTimeline status={request.status} />
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="pl-6 space-y-3 border-t border-border/50 pt-2">
            {/* Agency info */}
            {request.agencyName && (
              <div className="bg-background/50 rounded-md p-2.5 border border-border/40 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 text-primary/60" />
                  <span className="text-[10px] font-medium text-foreground">{request.agencyName}</span>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
                  {request.agencyEmail && <span>{request.agencyEmail}</span>}
                  {request.agencyAddress && <span>{request.agencyAddress}</span>}
                  {request.agencyPortalUrl && (
                    <a href={request.agencyPortalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Portal
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Statute info */}
            {request.statuteLawName && (
              <div className="bg-background/50 rounded-md p-2.5 border border-border/40 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Scale className="h-3 w-3 text-primary/60" />
                  <span className="text-[10px] font-medium text-foreground">{request.statuteLawName}</span>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
                  {request.statuteReference && <span>Ref: {request.statuteReference}</span>}
                  {request.responseDeadlineDays && <span>Response: {request.responseDeadlineDays} days</span>}
                  {request.feeWaiverAvailable && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Fee waiver available
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[9px]">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="text-foreground">{new Date(request.createdAt).toLocaleDateString()}</p>
              </div>
              {request.submittedAt && (
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="text-foreground">{new Date(request.submittedAt).toLocaleDateString()}</p>
                </div>
              )}
              {request.responseDueAt && (
                <div>
                  <p className="text-muted-foreground">Response Due</p>
                  <p className={`font-medium ${
                    request.deadline?.deadlineState === "overdue" ? "text-red-400" :
                    request.deadline?.deadlineState === "approaching" ? "text-amber-400" : "text-foreground"
                  }`}>
                    {new Date(request.responseDueAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {request.responseReceivedAt && (
                <div>
                  <p className="text-muted-foreground">Response Received</p>
                  <p className="text-foreground">{new Date(request.responseReceivedAt).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {request.letterContent && (
                <>
                  <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => setLetterOpen(true)}>
                    <Eye className="h-3 w-3 mr-1" /> View Letter
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={handleCopyLetter}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={handleDownload}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                  {request.agencyEmail ? (
                    <Button
                      size="sm"
                      className="text-[10px] h-7 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        const subject = encodeURIComponent(`FOIA Request — ${request.agencyName || request.recordType?.replace(/_/g, ' ')}`);
                        const body = encodeURIComponent(request.letterContent || '');
                        window.open(`mailto:${request.agencyEmail}?subject=${subject}&body=${body}`, '_blank');
                        toast.success('Email client opened with FOIA letter pre-filled');
                      }}
                    >
                      <Send className="h-3 w-3 mr-1" /> Send via Email
                    </Button>
                  ) : request.agencyPortalUrl ? (
                    <Button
                      size="sm"
                      className="text-[10px] h-7 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        window.open(request.agencyPortalUrl!, '_blank');
                        toast.info('Opened agency portal — paste your FOIA letter there');
                      }}
                    >
                      <Send className="h-3 w-3 mr-1" /> Submit via Portal
                    </Button>
                  ) : null}
                </>
              )}
              {/* LumenSend actions */}
              {["denied", "partial_denial"].includes(request.status) && (
                <Button
                  size="sm"
                  className="text-[10px] h-7 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => navigateTo(`/lumensend?type=appeal&context=cda_denial&state=${request.stateCode || ''}`)}
                >
                  <Send className="h-3 w-3 mr-1" /> Appeal via LumenSend
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] h-7 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                onClick={() => navigateTo(`/lumensend?type=follow_up&state=${request.stateCode || ''}`)}
              >
                <Send className="h-3 w-3 mr-1" /> Follow Up
              </Button>
              <CommitToCase type="foia" itemId={request.id} label="Track in Case" />
              <FlagArea location="foia_tracking" targetId={request.id} targetType="foia_request" message={`Review FOIA: ${request.agencyName || 'request'}`} />
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[9px] text-muted-foreground">Status:</span>
                <Select
                  value={request.status}
                  onValueChange={(val) =>
                    updateStatus.mutate({
                      caseId: request.caseId,
                      requestId: request.id,
                      status: val as any,
                    })
                  }
                >
                  <SelectTrigger className="h-6 text-[10px] w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready to Send</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="in_processing">In Processing</SelectItem>
                    <SelectItem value="records_produced">Records Received</SelectItem>
                    <SelectItem value="partial_denial">Partial Denial</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="appeal_prepared">Appeal Prepared</SelectItem>
                    <SelectItem value="appeal_submitted">Appeal Submitted</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fingerprint */}
            <p className="text-[8px] text-muted-foreground/40 font-mono">
              Fingerprint: {request.requestFingerprint?.slice(0, 16)}...
            </p>
          </div>
        )}

        {/* Letter dialog */}
        <Dialog open={letterOpen} onOpenChange={setLetterOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm">
                Request Letter — {request.agencyName ?? request.recordType}
              </DialogTitle>
            </DialogHeader>
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-md p-4 border border-border/40">
              {request.letterContent}
            </pre>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" variant="outline" className="text-xs" onClick={handleCopyLetter}>
                <Copy className="h-3 w-3 mr-1" /> Copy to Clipboard
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" /> Download .txt
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Main FOIA Tracking Dashboard ───

export default function FoiaTracking() {
  const [statusFilter, setStatusFilter] = useState("all");
  const { currentCaseId } = useCase();

  const { data: allRequests, isLoading } = trpc.foiaRequests.listAll.useQuery(
    { statusFilter: statusFilter !== "all" ? statusFilter : undefined },
    { refetchInterval: 30000 }
  );

  // Trigger deadline check on mount
  const checkDeadlines = trpc.foiaRequests.checkDeadlines.useMutation();
  useEffect(() => {
    checkDeadlines.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group by case
  const groupedByCase = useMemo(() => {
    if (!allRequests) return {};
    const groups: Record<number, { caseName: string; requests: typeof allRequests }> = {};
    for (const req of allRequests) {
      if (!groups[req.caseId]) {
        groups[req.caseId] = { caseName: req.caseName ?? `Case #${req.caseId}`, requests: [] };
      }
      groups[req.caseId].requests.push(req);
    }
    return groups;
  }, [allRequests]);

  const caseIds = Object.keys(groupedByCase).map(Number);

  // Sort cases: overdue first, then approaching, then by most recent update
  const sortedCaseIds = useMemo(() => {
    return caseIds.sort((a, b) => {
      const aOverdue = groupedByCase[a].requests.filter(r => r.deadline?.deadlineState === "overdue").length;
      const bOverdue = groupedByCase[b].requests.filter(r => r.deadline?.deadlineState === "overdue").length;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      const aApproaching = groupedByCase[a].requests.filter(r => r.deadline?.deadlineState === "approaching").length;
      const bApproaching = groupedByCase[b].requests.filter(r => r.deadline?.deadlineState === "approaching").length;
      if (aApproaching !== bApproaching) return bApproaching - aApproaching;
      return 0;
    });
  }, [caseIds, groupedByCase]);

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">FOIA Request Tracker</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const requests = allRequests ?? [];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">FOIA Request Tracker</h1>
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-[10px] w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ready">Ready to Send</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="in_processing">In Processing</SelectItem>
              <SelectItem value="records_produced">Records Received</SelectItem>
              <SelectItem value="partial_denial">Partial Denial</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="appeal_prepared">Appeal Prepared</SelectItem>
              <SelectItem value="appeal_submitted">Appeal Submitted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards requests={requests} />

      {/* Empty state */}
      {requests.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No FOIA requests found.</p>
            <p className="text-xs text-muted-foreground/60">
              Generate requests from the Missing Records section in your case's Findings page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Requests grouped by case */}
      {sortedCaseIds.map(caseId => {
        const group = groupedByCase[caseId];
        const overdueCount = group.requests.filter(r => r.deadline?.deadlineState === "overdue").length;
        const approachingCount = group.requests.filter(r => r.deadline?.deadlineState === "approaching").length;

        return (
          <div key={caseId} className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-sm font-medium text-foreground">{group.caseName}</h2>
              <Badge variant="outline" className="text-[9px]">
                {group.requests.length} request{group.requests.length !== 1 ? "s" : ""}
              </Badge>
              {overdueCount > 0 && (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30">
                  {overdueCount} overdue
                </Badge>
              )}
              {approachingCount > 0 && (
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                  {approachingCount} approaching
                </Badge>
              )}
            </div>
            <div className="space-y-2 pl-1">
              {group.requests.map(request => (
                <RequestRow key={request.id} request={request} showCase={false} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Disclaimer */}
      <p className="text-[8px] text-muted-foreground/50 leading-relaxed text-center">
        This tracker monitors requests you have generated. The engine does not submit requests or communicate with agencies.
        Deadline calculations are based on statutory response periods and your reported submission date.
      </p>
    </div>
  );
}
