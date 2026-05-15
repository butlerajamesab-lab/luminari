import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, FileText, Loader2, CheckCircle2, Clock,
  Download, Edit3, Send, Shield, ChevronDown, ChevronRight,
  Building2, Scale, Copy, AlertCircle, HandHeart, RefreshCw,
  Eye, XCircle, Inbox,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status Configuration ───

const FOIA_STATUS_CONFIG = {
  draft: { label: "Draft", icon: Edit3, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  ready: { label: "Ready to Send", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  submitted: { label: "Submitted", icon: Send, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  acknowledged: { label: "Acknowledged", icon: Eye, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  in_processing: { label: "In Processing", icon: Clock, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  records_produced: { label: "Records Received", icon: Inbox, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  partial_denial: { label: "Partial Denial", icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  denied: { label: "Denied", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  appeal_prepared: { label: "Appeal Prepared", icon: Scale, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  appeal_submitted: { label: "Appeal Submitted", icon: Send, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  closed: { label: "Closed", icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
} as const;

// ─── Warm Handoff Banner ───

function WarmHandoffBanner({ reasons }: { reasons: string[] }) {
  return (
    <Card className="bg-amber-500/5 border-amber-500/20">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <HandHeart className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-400">Recommendation: Consult Before Filing</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              The engine has identified factors that suggest consulting with a professional before submitting these requests.
            </p>
          </div>
        </div>
        <div className="pl-6 space-y-1.5">
          {reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <Shield className="h-3 w-3 text-amber-400/60 shrink-0 mt-0.5" />
              <p className="text-[10px] text-foreground/80 leading-relaxed">{reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Readiness Assessment Panel ───

function ReadinessPanel({
  caseId,
  onGenerate,
}: {
  caseId: number;
  onGenerate: () => void;
}) {
  const { data: readiness, isLoading } = trpc.foiaRequests.evaluate.useQuery({ caseId });
  const [showRequesterForm, setShowRequesterForm] = useState(false);
  const [requesterInfo, setRequesterInfo] = useState({
    name: "",
    email: "",
    address: "",
    phone: "",
  });

  const utils = trpc.useUtils();
  const generateAll = trpc.foiaRequests.generateAll.useMutation({
    onSuccess: (result) => {
      utils.foiaRequests.list.invalidate({ caseId });
      utils.foiaRequests.evaluate.invalidate({ caseId });
      utils.missingRecords.list.invalidate({ caseId });
      utils.missingRecords.summary.invalidate({ caseId });
      if (result.generated.length > 0) {
        toast.success(`Generated ${result.generated.length} FOIA request draft${result.generated.length !== 1 ? "s" : ""}.`);
      }
      if (result.skipped.length > 0) {
        toast.info(`${result.skipped.length} record${result.skipped.length !== 1 ? "s" : ""} skipped.`);
      }
      onGenerate();
    },
    onError: (err) => {
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="p-4 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Evaluating case readiness...</span>
        </CardContent>
      </Card>
    );
  }

  if (!readiness) return null;

  const { ready, criteria, warmHandoff, warmHandoffReasons, eligibleRecords } = readiness;

  if (!ready) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">Records Request Generator</p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            The engine can draft public records request letters for missing evidence. The following criteria must be met:
          </p>
          <div className="space-y-1 pl-1">
            <CriterionRow
              met={criteria.hasAnalyzedDocuments}
              label={`Analyzed documents (${criteria.analyzedDocumentCount} of ${criteria.documentCount})`}
            />
            <CriterionRow
              met={criteria.hasGapDetectionResults}
              label={`Gap detection completed (${criteria.criticalGapCount} critical, ${criteria.importantGapCount} important)`}
            />
            <CriterionRow
              met={criteria.hasFoiaEligibleGaps}
              label={`FOIA-eligible gaps found (${criteria.foiaEligibleGapCount} eligible)`}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <p className="text-xs font-medium text-foreground">Records Request Generator</p>
          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Ready
          </Badge>
        </div>

        <p className="text-[10px] text-muted-foreground">
          The engine has identified <strong className="text-foreground">{eligibleRecords.length}</strong> missing record{eligibleRecords.length !== 1 ? "s" : ""} eligible
          for public records requests. Draft letters will be generated for your review — nothing is sent automatically.
        </p>

        {warmHandoff && <WarmHandoffBanner reasons={warmHandoffReasons} />}

        {/* Eligible records preview */}
        <div className="space-y-1">
          {eligibleRecords.slice(0, 5).map((rec: any) => (
            <div key={rec.id} className="flex items-center gap-2 text-[10px]">
              <Scale className="h-3 w-3 text-primary/60" />
              <span className="text-foreground/80">{rec.label}</span>
              <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
                rec.severity === "critical"
                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}>
                {rec.severity}
              </Badge>
            </div>
          ))}
          {eligibleRecords.length > 5 && (
            <p className="text-[9px] text-muted-foreground pl-5">
              + {eligibleRecords.length - 5} more
            </p>
          )}
        </div>

        {/* Requester info toggle */}
        <button
          onClick={() => setShowRequesterForm(!showRequesterForm)}
          className="text-[10px] text-primary hover:underline flex items-center gap-1"
        >
          {showRequesterForm ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {showRequesterForm ? "Hide" : "Add"} your contact information (optional)
        </button>

        {showRequesterForm && (
          <div className="grid grid-cols-2 gap-2 pl-1">
            <div>
              <Label className="text-[9px] text-muted-foreground">Name</Label>
              <Input
                className="h-7 text-[11px]"
                placeholder="Your full name"
                value={requesterInfo.name}
                onChange={(e) => setRequesterInfo(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[9px] text-muted-foreground">Email</Label>
              <Input
                className="h-7 text-[11px]"
                placeholder="your@email.com"
                value={requesterInfo.email}
                onChange={(e) => setRequesterInfo(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[9px] text-muted-foreground">Address</Label>
              <Input
                className="h-7 text-[11px]"
                placeholder="Mailing address"
                value={requesterInfo.address}
                onChange={(e) => setRequesterInfo(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[9px] text-muted-foreground">Phone</Label>
              <Input
                className="h-7 text-[11px]"
                placeholder="Phone number"
                value={requesterInfo.phone}
                onChange={(e) => setRequesterInfo(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
        )}

        <Button
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            const info = Object.fromEntries(
              Object.entries(requesterInfo).filter(([, v]) => v.trim() !== "")
            );
            generateAll.mutate({
              caseId,
              requesterInfo: Object.keys(info).length > 0 ? info : undefined,
            });
          }}
          disabled={generateAll.isPending}
        >
          {generateAll.isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating drafts...</>
          ) : (
            <><FileText className="h-3 w-3 mr-1" /> Generate {eligibleRecords.length} Request Draft{eligibleRecords.length !== 1 ? "s" : ""}</>
          )}
        </Button>

        <p className="text-[8px] text-muted-foreground/60 text-center">
          Drafts are generated for your review. Nothing is sent to any agency automatically.
        </p>
      </CardContent>
    </Card>
  );
}

function CriterionRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {met ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
      ) : (
        <XCircle className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={met ? "text-foreground/80" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

// ─── Individual FOIA Request Card ───

function FoiaRequestCard({
  request,
  caseId,
}: {
  request: any;
  caseId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedLetter, setEditedLetter] = useState(request.letterContent ?? "");
  const utils = trpc.useUtils();

  const statusConfig = FOIA_STATUS_CONFIG[request.status as keyof typeof FOIA_STATUS_CONFIG]
    || FOIA_STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const updateStatus = trpc.foiaRequests.updateStatus.useMutation({
    onSuccess: () => {
      utils.foiaRequests.list.invalidate({ caseId });
      utils.missingRecords.list.invalidate({ caseId });
      utils.missingRecords.summary.invalidate({ caseId });
      toast.success("Status updated.");
    },
  });

  const updateLetter = trpc.foiaRequests.updateLetter.useMutation({
    onSuccess: () => {
      utils.foiaRequests.list.invalidate({ caseId });
      setEditing(false);
      toast.success("Letter updated.");
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

  const responseDue = request.responseDueAt
    ? new Date(request.responseDueAt).toLocaleDateString()
    : null;

  const isOverdue = request.responseDueAt
    && request.status === "submitted"
    && Date.now() > request.responseDueAt;

  return (
    <Card className={`${statusConfig.bg} transition-colors`}>
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <StatusIcon className={`h-4 w-4 ${statusConfig.color} shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">
                {request.agencyName ?? request.recordType}
              </span>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusConfig.bg}`}>
                {statusConfig.label}
              </Badge>
              {request.warmHandoff && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30">
                  <HandHeart className="h-2.5 w-2.5 mr-0.5" /> Consult recommended
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/30">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Overdue
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {request.recordType.replace(/_/g, " ")}
              {request.stateCode && ` · ${request.stateCode}`}
              {responseDue && ` · Response due: ${responseDue}`}
            </p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Warm handoff warning */}
        {expanded && request.warmHandoff && request.warmHandoffReason && (
          <div className="pl-6">
            <WarmHandoffBanner reasons={request.warmHandoffReason.split("\n\n")} />
          </div>
        )}

        {/* Expanded content */}
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
                </div>
              </div>
            )}

            {/* Letter content */}
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  className="text-[11px] min-h-[200px] font-mono"
                  value={editedLetter}
                  onChange={(e) => setEditedLetter(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="text-[10px] h-7"
                    onClick={() => updateLetter.mutate({
                      caseId,
                      requestId: request.id,
                      letterContent: editedLetter,
                    })}
                    disabled={updateLetter.isPending}
                  >
                    {updateLetter.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Changes"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-7"
                    onClick={() => {
                      setEditing(false);
                      setEditedLetter(request.letterContent ?? "");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              request.letterContent && (
                <div className="space-y-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Draft Letter</p>
                  <div className="bg-background/80 rounded-md p-3 border border-border/40 max-h-[300px] overflow-y-auto">
                    <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                      {request.letterContent}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7"
                      onClick={() => setEditing(true)}
                    >
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7"
                      onClick={handleCopyLetter}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7"
                      onClick={handleDownload}
                    >
                      <Download className="h-3 w-3 mr-1" /> Download
                    </Button>
                  </div>
                </div>
              )
            )}

            {/* Status update */}
            <div className="flex items-center gap-2">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Update Status:</p>
              <Select
                value={request.status}
                onValueChange={(val) =>
                  updateStatus.mutate({
                    caseId,
                    requestId: request.id,
                    status: val as any,
                  })
                }
              >
                <SelectTrigger className="h-6 text-[10px] w-[160px]">
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

            {/* Fingerprint (forensic detail) */}
            <p className="text-[8px] text-muted-foreground/40 font-mono">
              Fingerprint: {request.requestFingerprint?.slice(0, 16)}...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main FOIA Section ───

export function FoiaRequestSection({ caseId }: { caseId: number }) {
  const [showGenerator, setShowGenerator] = useState(true);
  const { data: requests, isLoading } = trpc.foiaRequests.list.useQuery({ caseId });

  const activeRequests = useMemo(
    () => (requests ?? []).filter((r: any) => !["closed"].includes(r.status)),
    [requests]
  );
  const closedRequests = useMemo(
    () => (requests ?? []).filter((r: any) => r.status === "closed"),
    [requests]
  );

  const hasRequests = requests && requests.length > 0;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Records Requests</h3>
        {hasRequests && (
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Readiness / Generator panel */}
      {showGenerator && (
        <ReadinessPanel
          caseId={caseId}
          onGenerate={() => setShowGenerator(false)}
        />
      )}

      {/* Show re-generate button if generator is hidden */}
      {!showGenerator && (
        <Button
          size="sm"
          variant="ghost"
          className="text-[10px] text-muted-foreground h-7"
          onClick={() => setShowGenerator(true)}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Check for new eligible records
        </Button>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Loading requests...</span>
        </div>
      )}

      {/* Active requests */}
      {activeRequests.length > 0 && (
        <div className="space-y-2">
          {activeRequests.map((request: any) => (
            <FoiaRequestCard key={request.id} request={request} caseId={caseId} />
          ))}
        </div>
      )}

      {/* Closed requests */}
      {closedRequests.length > 0 && (
        <details className="group">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
            {closedRequests.length} closed request{closedRequests.length !== 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2">
            {closedRequests.map((request: any) => (
              <FoiaRequestCard key={request.id} request={request} caseId={caseId} />
            ))}
          </div>
        </details>
      )}

      {/* Disclaimer */}
      <p className="text-[8px] text-muted-foreground/50 leading-relaxed">
        Request letters are generated as drafts for your review. The engine does not submit requests to any agency.
        You are responsible for reviewing, personalizing, and sending each request. Verify all agency contact
        information before submission.
      </p>
    </div>
  );
}
