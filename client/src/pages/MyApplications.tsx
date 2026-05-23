import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ArrowLeft, CheckCircle2, Clock, AlertTriangle,
  FileText, ExternalLink, Loader2, Plus,
  ChevronDown, ChevronUp, Trash2, Edit3,
  Calendar, Hash, MapPin, Sparkles,
  ClipboardList, XCircle, RefreshCw, Ban,
  Timer, CircleDot, Package, Shield, Search, Send,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Status Configuration ─── */

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}> = {
  not_started: {
    label: "Not Started",
    icon: CircleDot,
    color: "text-muted-foreground",
    bgColor: "bg-muted/30 border-border/50",
    description: "You've bookmarked this program but haven't started applying yet.",
  },
  gathering_docs: {
    label: "Gathering Documents",
    icon: FileText,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    description: "You're collecting the documents needed to apply.",
  },
  applied: {
    label: "Applied",
    icon: Package,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    description: "Your application has been submitted.",
  },
  waiting: {
    label: "Waiting for Decision",
    icon: Timer,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    description: "Your application is being reviewed.",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/30",
    description: "Congratulations! Your application was approved.",
  },
  denied: {
    label: "Denied",
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/30",
    description: "Your application was denied. You may be able to appeal.",
  },
  appealing: {
    label: "Appealing",
    icon: RefreshCw,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/30",
    description: "You're appealing the denial decision.",
  },
  expired: {
    label: "Expired",
    icon: Ban,
    color: "text-muted-foreground",
    bgColor: "bg-muted/20 border-border/30",
    description: "This application or benefit has expired.",
  },
};

const STATUS_ORDER = [
  "not_started", "gathering_docs", "applied", "waiting",
  "approved", "denied", "appealing", "expired",
];

/* ─── Application Card Component ─── */

function ApplicationCard({ app, onRefetch }: { app: any; onRefetch: () => void }) {
  const [, setLocation] = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(app.notes || "");
  const [confirmNumber, setConfirmNumber] = useState(app.confirmationNumber || "");
  const [deadlineLabel, setDeadlineLabel] = useState(app.deadlineLabel || "");
  const [deadlineDate, setDeadlineDate] = useState(
    app.nextDeadline ? new Date(app.nextDeadline).toISOString().split("T")[0] : ""
  );

  const statusConfig = STATUS_CONFIG[app.status] || STATUS_CONFIG.not_started;
  const StatusIcon = statusConfig.icon;

  const updateStatus = trpc.benefitApps.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      onRefetch();
    },
    onError: () => toast.error("Failed to update status"),
  });

  const updateNotes = trpc.benefitApps.updateNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      setEditingNotes(false);
      onRefetch();
    },
    onError: () => toast.error("Failed to save notes"),
  });

  const updateDeadline = trpc.benefitApps.updateDeadline.useMutation({
    onSuccess: () => {
      toast.success("Deadline updated");
      onRefetch();
    },
    onError: () => toast.error("Failed to update deadline"),
  });

  const markDoc = trpc.benefitApps.markDocumentSubmitted.useMutation({
    onSuccess: () => {
      toast.success("Document marked as submitted");
      onRefetch();
    },
    onError: () => toast.error("Failed to update document"),
  });

  const deleteApp = trpc.benefitApps.delete.useMutation({
    onSuccess: () => {
      toast.success("Application removed");
      onRefetch();
    },
    onError: () => toast.error("Failed to remove application"),
  });

  const handleStatusChange = (newStatus: string) => {
    const extra: any = {};
    if (newStatus === "applied" && !app.appliedAt) {
      extra.appliedAt = Date.now();
    }
    if (["approved", "denied"].includes(newStatus) && !app.decisionAt) {
      extra.decisionAt = Date.now();
    }
    updateStatus.mutate({ id: app.id, status: newStatus as any, ...extra });
  };

  const handleSaveDeadline = () => {
    const ts = deadlineDate ? new Date(deadlineDate).getTime() : null;
    updateDeadline.mutate({
      id: app.id,
      nextDeadline: ts,
      deadlineLabel: deadlineLabel || undefined,
    });
  };

  const docsNeeded = app.documentsNeeded || [];
  const docsSubmitted = app.documentsSubmitted || [];
  const docsRemaining = docsNeeded.filter((d: string) => !docsSubmitted.includes(d));
  const docProgress = docsNeeded.length > 0
    ? Math.round((docsSubmitted.length / docsNeeded.length) * 100)
    : 0;

  // Progress through the status pipeline
  const statusIndex = STATUS_ORDER.indexOf(app.status);
  const progressPercent = app.status === "approved" ? 100
    : app.status === "denied" ? 75
    : app.status === "expired" ? 0
    : Math.round(((statusIndex + 1) / 5) * 100);

  const isDeadlineSoon = app.nextDeadline && (app.nextDeadline - Date.now()) < 7 * 24 * 60 * 60 * 1000;
  const isDeadlinePast = app.nextDeadline && app.nextDeadline < Date.now();

  return (
    <Card className={cn(
      "transition-all duration-200 border",
      isExpanded
        ? "bg-card/80 border-primary/30 shadow-lg shadow-primary/5"
        : "bg-card/50 border-border/50 hover:border-border hover:bg-card/70",
    )}>
      <CardContent className="p-0">
        {/* Header — always visible */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={cn("mt-0.5 p-2 rounded-lg", statusConfig.bgColor)}>
                <StatusIcon className={cn("w-4 h-4", statusConfig.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground text-sm leading-tight">
                  {app.programName}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {statusConfig.description}
                </p>
                {app.stateCode && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 mt-1">
                    <MapPin className="w-2.5 h-2.5" />
                    {app.stateCode}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5 border", statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.label}
              </Badge>
              {isDeadlinePast && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border bg-red-500/15 border-red-500/30 text-red-400">
                  Overdue
                </Badge>
              )}
              {isDeadlineSoon && !isDeadlinePast && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border bg-amber-500/15 border-amber-500/30 text-amber-400">
                  Due Soon
                </Badge>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Progress</span>
              <span className="text-[10px] text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          {/* Deadline preview */}
          {app.nextDeadline && (
            <div className={cn(
              "mt-2 flex items-center gap-1.5 text-xs",
              isDeadlinePast ? "text-red-400" : isDeadlineSoon ? "text-amber-400" : "text-muted-foreground"
            )}>
              <Calendar className="w-3 h-3" />
              {app.deadlineLabel || "Deadline"}: {new Date(app.nextDeadline).toLocaleDateString()}
            </div>
          )}

          {/* Expand indicator */}
          <div className="flex items-center justify-center mt-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="border-t border-border/50 p-4 space-y-5" onClick={(e) => e.stopPropagation()}>
            {/* Status Update */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2">
                Update Status
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  const isActive = app.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={updateStatus.isPending}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all",
                        isActive
                          ? cn(cfg.bgColor, cfg.color, "font-medium")
                          : "bg-muted/20 border-border/30 text-muted-foreground hover:bg-muted/40 hover:border-border/50"
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confirmation Number */}
            {(app.status === "applied" || app.status === "waiting" || app.confirmationNumber) && (
              <div>
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-blue-400" />
                  Confirmation / Reference Number
                </h4>
                <div className="flex gap-2">
                  <Input
                    value={confirmNumber}
                    onChange={(e) => setConfirmNumber(e.target.value)}
                    placeholder="Enter your confirmation number..."
                    className="text-sm h-8 bg-background/50 border-border/50"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateStatus.mutate({
                        id: app.id,
                        status: app.status,
                        confirmationNumber: confirmNumber,
                      });
                    }}
                    disabled={updateStatus.isPending}
                    className="text-xs shrink-0"
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Document Checklist */}
            {docsNeeded.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Document Checklist ({docsSubmitted.length}/{docsNeeded.length})
                </h4>
                <Progress value={docProgress} className="h-1.5 mb-3" />
                <div className="space-y-1.5">
                  {docsNeeded.map((doc: string, i: number) => {
                    const isSubmitted = docsSubmitted.includes(doc);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (!isSubmitted) {
                            markDoc.mutate({ id: app.id, document: doc });
                          }
                        }}
                        disabled={isSubmitted || markDoc.isPending}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                          isSubmitted
                            ? "bg-green-500/5 border border-green-500/20"
                            : "bg-muted/20 border border-border/30 hover:bg-muted/40 hover:border-border/50 cursor-pointer"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                          isSubmitted
                            ? "bg-green-500/20 border-green-500/40"
                            : "border-border/60"
                        )}>
                          {isSubmitted && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                        </div>
                        <span className={cn(
                          "text-sm",
                          isSubmitted ? "text-green-400/80 line-through" : "text-foreground/80"
                        )}>
                          {doc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Deadline Management */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                Deadline / Reminder
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="text-sm h-8 bg-background/50 border-border/50"
                />
                <Input
                  value={deadlineLabel}
                  onChange={(e) => setDeadlineLabel(e.target.value)}
                  placeholder="e.g., Appeal deadline, Recertification..."
                  className="text-sm h-8 bg-background/50 border-border/50"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveDeadline}
                disabled={updateDeadline.isPending}
                className="text-xs mt-2"
              >
                {updateDeadline.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Calendar className="w-3 h-3 mr-1" />
                )}
                Save Deadline
              </Button>
            </div>

            {/* Notes */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                Personal Notes
              </h4>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this application..."
                    className="min-h-[80px] text-sm bg-background/50 border-border/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateNotes.mutate({ id: app.id, notes })}
                      disabled={updateNotes.isPending}
                      className="text-xs"
                    >
                      {updateNotes.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : null}
                      Save Notes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotes(app.notes || "");
                        setEditingNotes(false);
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="w-full text-left p-3 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors"
                >
                  {app.notes ? (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{app.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Click to add notes...</p>
                  )}
                </button>
              )}
            </div>

            {/* Application Link & Timestamps */}
            <div className="flex flex-wrap gap-2">
              {app.applicationUrl && (
                <a
                  href={app.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors border border-blue-500/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Application
                </a>
              )}
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground/60">
              {app.appliedAt && (
                <span>Applied: {new Date(app.appliedAt).toLocaleDateString()}</span>
              )}
              {app.decisionAt && (
                <span>Decision: {new Date(app.decisionAt).toLocaleDateString()}</span>
              )}
              <span>Added: {new Date(app.createdAt).toLocaleDateString()}</span>
            </div>

            {/* LumenSend — Appeal or Follow-up */}
            {["denied", "appealing"].includes(app.status) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("type", "appeal");
                  if (app.programId) params.set("programId", app.programId);
                  if (app.stateCode) params.set("state", app.stateCode);
                  setLocation(`/lumensend?${params.toString()}`);
                }}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Appeal This Denial via LumenSend
              </Button>
            )}
            {["waiting", "applied"].includes(app.status) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-amber-400"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("type", "follow_up");
                  if (app.stateCode) params.set("state", app.stateCode);
                  setLocation(`/lumensend?${params.toString()}`);
                }}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send Follow-Up via LumenSend
              </Button>
            )}

            {/* Denial Reason */}
            {app.status === "denied" && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <h4 className="text-xs font-semibold text-red-300 mb-1">Denial Reason</h4>
                {app.denialReason ? (
                  <p className="text-sm text-red-200/80">{app.denialReason}</p>
                ) : (
                  <Input
                    placeholder="Record the reason for denial (helps with appeals)..."
                    className="text-sm h-8 bg-transparent border-red-500/30 text-red-200/80 placeholder:text-red-300/40"
                    onBlur={(e) => {
                      if (e.target.value) {
                        updateStatus.mutate({
                          id: app.id,
                          status: "denied",
                          denialReason: e.target.value,
                        });
                      }
                    }}
                  />
                )}
              </div>
            )}

            {/* Delete */}
            <div className="pt-2 border-t border-border/30">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove from tracking
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>Remove Application?</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    This will remove <strong>{app.programName}</strong> from your tracked applications. This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-2 mt-4">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteApp.mutate({ id: app.id })}
                      >
                        Remove
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Summary Dashboard ─── */

function SummaryDashboard({ summary, deadlines }: { summary: any; deadlines: any[] }) {
  const totalApps = summary?.total || 0;
  const activeApps = (summary?.byStatus?.not_started || 0) +
    (summary?.byStatus?.gathering_docs || 0) +
    (summary?.byStatus?.applied || 0) +
    (summary?.byStatus?.waiting || 0) +
    (summary?.byStatus?.appealing || 0);
  const approvedApps = summary?.byStatus?.approved || 0;
  const deniedApps = summary?.byStatus?.denied || 0;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{totalApps}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{activeApps}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{approvedApps}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-400">{deniedApps}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Denied</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Deadlines */}
      {deadlines && deadlines.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deadlines.map((d: any, i: number) => {
              const daysUntil = Math.ceil((d.nextDeadline - Date.now()) / (1000 * 60 * 60 * 24));
              const isPast = daysUntil < 0;
              return (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background/30">
                  <div>
                    <p className="text-sm text-foreground/90">{d.programName}</p>
                    <p className="text-xs text-muted-foreground">{d.deadlineLabel || "Deadline"}</p>
                  </div>
                  <div className={cn(
                    "text-xs font-medium",
                    isPast ? "text-red-400" : daysUntil <= 7 ? "text-amber-400" : "text-muted-foreground"
                  )}>
                    {isPast
                      ? `${Math.abs(daysUntil)} days overdue`
                      : daysUntil === 0
                        ? "Today"
                        : daysUntil === 1
                          ? "Tomorrow"
                          : `${daysUntil} days`
                    }
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Main My Applications Page ─── */

export default function MyApplications() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: apps, isLoading, refetch } = trpc.benefitApps.list.useQuery(
    undefined,
    { enabled: !!user },
  );

  const { data: summary } = trpc.benefitApps.summary.useQuery(
    undefined,
    { enabled: !!user },
  );

  const { data: deadlines } = trpc.benefitApps.upcomingDeadlines.useQuery(
    undefined,
    { enabled: !!user },
  );

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    if (statusFilter === "all") return apps;
    return apps.filter((a: any) => a.status === statusFilter);
  }, [apps, statusFilter]);

  // Not logged in
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="bg-card/50 border-border/50 max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 text-primary/40 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Sign In Required</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in to track your benefit applications, manage documents, and set deadline reminders.
            </p>
            <Button onClick={() => window.location.href = getLoginUrl()}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/benefits")}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Benefits Navigator
            </Button>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                My Applications
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track your benefit applications, manage documents, and stay on top of deadlines.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/benefits")}
              className="shrink-0 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Find More Programs
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading your applications...</span>
          </div>
        ) : apps && apps.length > 0 ? (
          <>
            {/* Summary Dashboard */}
            <SummaryDashboard summary={summary} deadlines={deadlines || []} />

            {/* Status Filter */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Filter:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px] h-8 text-sm bg-background/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Applications ({apps.length})</SelectItem>
                  {STATUS_ORDER.map((s) => {
                    const count = apps.filter((a: any) => a.status === s).length;
                    if (count === 0) return null;
                    return (
                      <SelectItem key={s} value={s}>
                        {STATUS_CONFIG[s].label} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Application Cards */}
            <div className="space-y-3">
              {filteredApps.map((app: any) => (
                <ApplicationCard key={app.id} app={app} onRefetch={refetch} />
              ))}
            </div>

            {filteredApps.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  No applications match the selected filter.
                </p>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No Applications Yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Use the Benefits Navigator to find programs you may be eligible for,
              then track your applications here. We'll help you stay organized with
              document checklists and deadline reminders.
            </p>
            <Button onClick={() => navigate("/benefits")}>
              <Search className="w-4 h-4 mr-1.5" />
              Find Benefits
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
