import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLocation } from "wouter";
import {
  FileText, Image, Video, Music, Upload, Search, File, RefreshCw,
  Loader2, AlertTriangle, CheckSquare, Square, Shield, XCircle,
  ChevronDown, ChevronRight, Zap, RotateCcw, Hammer, MoreVertical, Replace, Eye,
} from "lucide-react";
import ReplaceDocumentModalV2 from "@/components/ReplaceDocumentModalV2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";

const fileTypeIcon: Record<string, typeof FileText> = {
  pdf: FileText,
  image: Image,
  video: Video,
  audio: Music,
  text: FileText,
  other: File,
};

const statusColor: Record<string, string> = {
  uploaded: "bg-muted-foreground",
  extracting: "bg-blue-400",
  analyzing: "bg-amber-400",
  ready: "bg-emerald-400",
  error: "bg-red-400",
  retrying: "bg-orange-400",
  failed_permanent: "bg-red-600",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type CdaRole = "policy" | "denial" | "claim_summary" | null;

function QueueStatusBanner() {
  const { currentCaseId } = useCase();
  const { data: queueStatus } = trpc.documents.queueStatus.useQuery(
    { caseId: currentCaseId ?? undefined },
    { refetchInterval: 3000 }
  );

  if (!queueStatus) return null;
  const {
    queueDepth, activeWorkers, isProcessing, retryingCount,
    autoRecoverableCount, manualReuploadCount, systemErrorCount,
    processingRate,
  } = queueStatus;

  const hasFailures = (autoRecoverableCount ?? 0) > 0 || (manualReuploadCount ?? 0) > 0 || (systemErrorCount ?? 0) > 0;
  if (!isProcessing && queueDepth === 0 && retryingCount === 0 && !hasFailures) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-950/20">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {isProcessing ? (
            <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
          ) : (
            <RefreshCw className="h-4 w-4 text-blue-400 shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm text-blue-200/90 font-medium">
              {isProcessing
                ? `Processing ${activeWorkers} at a time. ${queueDepth} remaining.`
                : "Queue idle"}
            </p>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground">
                Queue: {queueDepth}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Active: {activeWorkers}
              </span>
              {retryingCount > 0 && (
                <span className="text-[10px] text-orange-400">
                  Retrying: {retryingCount}
                </span>
              )}
              {(autoRecoverableCount ?? 0) > 0 && (
                <span className="text-[10px] text-orange-400">
                  Auto-Recoverable: {autoRecoverableCount}
                </span>
              )}
              {(manualReuploadCount ?? 0) > 0 && (
                <span className="text-[10px] text-red-400">
                  Manual Re-Upload: {manualReuploadCount}
                </span>
              )}
              {(systemErrorCount ?? 0) > 0 && (
                <span className="text-[10px] text-amber-400">
                  System Errors: {systemErrorCount}
                </span>
              )}
              {processingRate > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Rate: {processingRate} docs/min
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Documents() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // CDA selection state
  const [cdaMode, setCdaMode] = useState(false);
  const [roleAssignments, setRoleAssignments] = useState<Record<number, CdaRole>>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Reset CDA selection when case changes
  useEffect(() => {
    setCdaMode(false);
    setRoleAssignments({});
  }, [currentCaseId]);

  const { data: docs, isLoading } = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  // Reanalyze scope summary
  const { data: scopeSummary } = trpc.documents.reanalyzeScopeSummary.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  // Gate Schema: snapshot lifecycle for action gating
  const { data: lifecycle } = trpc.snapshots.lifecycle.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000 }
  );
  const isSnapshotSealed = lifecycle?.hasSnapshot && lifecycle?.status === 'sealed';

  // Full rebuild confirmation modal
  const [showRebuildModal, setShowRebuildModal] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ id: number; name: string } | null>(null);

  // A) Analyze New Uploads Only
  const analyzeNewUploads = trpc.documents.analyzeNewUploads.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.totalQueued} new upload${data.totalQueued !== 1 ? 's' : ''} queued for analysis`);
      utils.documents.list.invalidate();
      utils.documents.reanalyzeScopeSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // B) Retry Failed Only
  const retryFailedOnly = trpc.documents.retryFailedOnly.useMutation({
    onSuccess: (data) => {
      if (data.totalQueued === 0) {
        toast.info('No retryable failures found');
      } else {
        toast.success(`${data.totalQueued} failed document${data.totalQueued !== 1 ? 's' : ''} queued for retry${data.snapshotCreated ? ' (new snapshot created)' : ''}`);
      }
      utils.documents.list.invalidate();
      utils.documents.reanalyzeScopeSummary.invalidate();
      utils.cases.ingestionAudit.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // C) Full Snapshot Rebuild
  const fullRebuild = trpc.documents.fullSnapshotRebuild.useMutation({
    onSuccess: (data) => {
      const passed = data.toneReports.filter((r: any) => r.report.passed).length;
      const failed = data.toneReports.length - passed;
      if (failed === 0) {
        toast.success(`Full rebuild complete — all ${data.totalDocs} documents passed tone validation`);
      } else {
        toast.warning(`Full rebuild complete — ${passed}/${data.totalDocs} passed, ${failed} with violations`);
      }
      setShowRebuildModal(false);
      utils.documents.list.invalidate();
      utils.documents.reanalyzeScopeSummary.invalidate();
    },
    onError: (err) => { toast.error(err.message); setShowRebuildModal(false); },
  });

  // Legacy mutations kept for backward compatibility
  const retryAll = trpc.documents.analyzeAll.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.queued} document${data.queued !== 1 ? "s" : ""} queued for analysis`);
      utils.documents.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reanalyzeAll = trpc.documents.reanalyzeAll.useMutation({
    onSuccess: (data) => {
      const passed = data.toneReports.filter((r: any) => r.report.passed).length;
      const failed = data.toneReports.length - passed;
      if (failed === 0) {
        toast.success(`Batch re-analysis complete — all ${data.totalDocs} documents passed tone validation`);
      } else {
        toast.warning(`Batch re-analysis complete — ${passed}/${data.totalDocs} passed, ${failed} with violations`);
      }
      utils.documents.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const isAnyActionPending = analyzeNewUploads.isPending || retryFailedOnly.isPending || fullRebuild.isPending;

  const startCdaRun = trpc.cda.startRun.useMutation({
    onSuccess: (data) => {
      toast.success(`CDA run started (Run #${data.runId})`);
      setCdaMode(false);
      setRoleAssignments({});
      setShowConfirmModal(false);
      // Auto-navigate to the run detail page
      setLocation(`/cda/${data.runId}`);
    },
    onError: (err) => {
      toast.error(err.message);
      setShowConfirmModal(false);
    },
  });

  const filtered = useMemo(() => {
    if (!docs) return [];
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter(d => d.filename.toLowerCase().includes(q) || d.documentType?.toLowerCase().includes(q));
  }, [docs, search]);

  const errorCount = useMemo(() => {
    if (!docs) return 0;
    return docs.filter(d => d.status === "error" || d.status === "uploaded").length;
  }, [docs]);

  // CDA role assignment helpers
  const assignRole = useCallback((docId: number, role: CdaRole) => {
    setRoleAssignments(prev => {
      const next = { ...prev };
      if (role === null) {
        delete next[docId];
        return next;
      }
      // If another doc already has this role, unassign it
      for (const [id, r] of Object.entries(next)) {
        if (r === role && Number(id) !== docId) {
          delete next[Number(id)];
        }
      }
      next[docId] = role;
      return next;
    });
  }, []);

  const cdaRoleState = useMemo(() => {
    const policyDocId = Object.entries(roleAssignments).find(([, r]) => r === "policy")?.[0];
    const denialDocId = Object.entries(roleAssignments).find(([, r]) => r === "denial")?.[0];
    const claimDocId = Object.entries(roleAssignments).find(([, r]) => r === "claim_summary")?.[0];

    return {
      policyDocId: policyDocId ? Number(policyDocId) : null,
      denialDocId: denialDocId ? Number(denialDocId) : null,
      claimDocId: claimDocId ? Number(claimDocId) : null,
      isComplete: !!(policyDocId && denialDocId && claimDocId),
      assignedCount: Object.keys(roleAssignments).length,
    };
  }, [roleAssignments]);

  const getDocById = useCallback((id: number) => {
    return docs?.find(d => d.id === id) ?? null;
  }, [docs]);

  const handleRunCda = () => {
    if (!cdaRoleState.isComplete || !currentCaseId) return;
    setShowConfirmModal(true);
  };

  const confirmRunCda = () => {
    if (!cdaRoleState.isComplete || !currentCaseId) return;
    startCdaRun.mutate({
      caseId: currentCaseId,
      policyDocId: cdaRoleState.policyDocId!,
      denialDocId: cdaRoleState.denialDocId!,
      claimSummaryDocId: cdaRoleState.claimDocId!,
    });
  };

  const readyDocs = useMemo(() => {
    if (!docs) return [];
    return docs.filter(d => d.status === "ready");
  }, [docs]);

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Reanalyze Intent Separation — Three Scoped Actions */}
          {docs && docs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isAnyActionPending || !!isSnapshotSealed}
                  className="gap-2"
                  title={isSnapshotSealed ? 'Snapshot is sealed — mutations blocked' : undefined}
                >
                  {isAnyActionPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isSnapshotSealed ? 'Sealed' : isAnyActionPending ? 'Processing...' : 'Analyze'}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuItem
                  onClick={() => analyzeNewUploads.mutate({ caseId: currentCaseId! })}
                  disabled={!scopeSummary?.analyzeNewUploads}
                  className="flex-col items-start gap-1 py-2.5"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Zap className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="font-medium">Analyze New Uploads</span>
                    {scopeSummary && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {scopeSummary.analyzeNewUploads}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-6">
                    Process newly uploaded documents only. Does not touch existing results.
                  </p>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => retryFailedOnly.mutate({ caseId: currentCaseId! })}
                  disabled={!scopeSummary?.retryFailed}
                  className="flex-col items-start gap-1 py-2.5"
                >
                  <div className="flex items-center gap-2 w-full">
                    <RotateCcw className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="font-medium">Retry Failed Documents</span>
                    {scopeSummary && (
                      <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/50 text-amber-300">
                        {scopeSummary.retryFailed}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-6">
                    Retry auto-recoverable failures only. Non-retryable errors are skipped.
                  </p>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => setShowRebuildModal(true)}
                  className="flex-col items-start gap-1 py-2.5"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Hammer className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="font-medium text-red-300">Full Snapshot Rebuild</span>
                    {scopeSummary && (
                      <Badge variant="outline" className="ml-auto text-[10px] border-red-500/50 text-red-300">
                        {scopeSummary.fullRebuild}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-6">
                    Re-extract all documents and rebuild correlations/findings. Requires confirmation.
                  </p>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* CDA Mode Toggle */}
          {readyDocs.length >= 3 && !cdaMode && (
            <Button
              variant="outline"
              onClick={() => setCdaMode(true)}
              className="gap-2 border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/20"
            >
              <Shield className="h-4 w-4" />
              Run CDA
            </Button>
          )}
          {cdaMode && (
            <Button
              variant="outline"
              onClick={() => { setCdaMode(false); setRoleAssignments({}); }}
              className="gap-2 border-muted-foreground/50"
            >
              <XCircle className="h-4 w-4" />
              Cancel CDA
            </Button>
          )}

          <Button onClick={() => setLocation("/upload")} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* Queue Visibility Banner */}
      <QueueStatusBanner />

      {/* CDA Role Assignment Banner */}
      {cdaMode && (
        <Card className="border-cyan-500/30 bg-cyan-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-medium text-cyan-200">Claim Denial Analysis — Assign Document Roles</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select exactly 3 documents and assign each a role. Only "ready" documents can be selected.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <RoleSlot
                    role="policy"
                    label="Policy"
                    docId={cdaRoleState.policyDocId}
                    doc={cdaRoleState.policyDocId ? getDocById(cdaRoleState.policyDocId) : null}
                    onClear={() => cdaRoleState.policyDocId && assignRole(cdaRoleState.policyDocId, null)}
                  />
                  <RoleSlot
                    role="denial"
                    label="Denial Letter"
                    docId={cdaRoleState.denialDocId}
                    doc={cdaRoleState.denialDocId ? getDocById(cdaRoleState.denialDocId) : null}
                    onClear={() => cdaRoleState.denialDocId && assignRole(cdaRoleState.denialDocId, null)}
                  />
                  <RoleSlot
                    role="claim_summary"
                    label="Claim Summary"
                    docId={cdaRoleState.claimDocId}
                    doc={cdaRoleState.claimDocId ? getDocById(cdaRoleState.claimDocId) : null}
                    onClear={() => cdaRoleState.claimDocId && assignRole(cdaRoleState.claimDocId, null)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {cdaRoleState.assignedCount}/3 roles assigned
                    {!cdaRoleState.isComplete && " — assign all 3 to proceed"}
                  </p>
                  <Button
                    size="sm"
                    disabled={!cdaRoleState.isComplete || startCdaRun.isPending}
                    onClick={handleRunCda}
                    className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    {startCdaRun.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                    Run Claim Denial Analysis
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scope Summary Banner */}
      {scopeSummary && (scopeSummary.processingFailed > 0 || scopeSummary.analyzeNewUploads > 0) && (
        <Card className="border-amber-500/50 bg-amber-950/20">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="text-sm text-amber-200/80 flex-1 space-y-1">
              {scopeSummary.analyzeNewUploads > 0 && (
                <p>
                  <strong className="text-blue-300">{scopeSummary.analyzeNewUploads}</strong> new upload{scopeSummary.analyzeNewUploads !== 1 ? 's' : ''} awaiting analysis.
                </p>
              )}
              {scopeSummary.processingFailed > 0 && (
                <p>
                  <button
                    onClick={() => setLocation('/extraction-failures')}
                    className="inline-flex items-center gap-1 text-amber-200 hover:text-amber-100 underline underline-offset-2 decoration-amber-500/50 hover:decoration-amber-400 transition-colors font-bold"
                  >
                    Extraction Failures: {scopeSummary.processingFailed}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  {' — '}
                  {scopeSummary.retryFailed > 0 && (
                    <span className="text-orange-300">{scopeSummary.retryFailed} auto-recoverable</span>
                  )}
                  {scopeSummary.retryFailed > 0 && scopeSummary.retryFailedNonRetryable > 0 && ', '}
                  {scopeSummary.retryFailedNonRetryable > 0 && (
                    <span className="text-red-300">{scopeSummary.retryFailedNonRetryable} manual re-upload</span>
                  )}
                </p>
              )}
              {scopeSummary.validComplete > 0 && (
                <p className="text-emerald-300/80">
                  Valid Complete: {scopeSummary.validComplete}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Rebuild Confirmation Modal */}
      <Dialog open={showRebuildModal} onOpenChange={setShowRebuildModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <Hammer className="h-5 w-5" />
              Full Snapshot Rebuild
            </DialogTitle>
            <DialogDescription>
              This will re-extract and rebuild all documents, correlations, and findings from scratch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 rounded-md bg-muted/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Documents to process</span>
                <span className="font-medium">{scopeSummary?.fullRebuild ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Currently valid</span>
                <span className="font-medium text-emerald-400">{scopeSummary?.validComplete ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Currently failed</span>
                <span className="font-medium text-amber-400">{scopeSummary?.processingFailed ?? '—'}</span>
              </div>
            </div>

            <div className="p-3 rounded-md border border-red-500/20 bg-red-950/10 space-y-1">
              <p className="text-xs text-red-300 font-medium">Warning</p>
              <p className="text-xs text-muted-foreground">
                This will consume significant provider capacity. Existing correlations and findings
                will be cleared and regenerated. This action cannot be undone.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRebuildModal(false)}
              disabled={fullRebuild.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => fullRebuild.mutate({ caseId: currentCaseId!, confirmed: true })}
              disabled={fullRebuild.isPending}
              className="gap-2"
            >
              {fullRebuild.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Hammer className="h-4 w-4" />
              )}
              {fullRebuild.isPending ? 'Rebuilding...' : 'Confirm Full Rebuild'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "No documents match your search" : "No documents uploaded yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const Icon = fileTypeIcon[doc.fileType] || File;
            const currentRole = roleAssignments[doc.id] ?? null;
            const isReady = doc.status === "ready";

            return (
              <Card
                key={doc.id}
                className={`transition-colors ${
                  cdaMode && currentRole
                    ? "border-cyan-500/50 bg-cyan-950/10"
                    : "hover:border-primary/30"
                } ${cdaMode ? "" : "cursor-pointer"}`}
                onClick={() => {
                  if (!cdaMode) setLocation(`/documents/${doc.id}`);
                }}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  {/* CDA mode: role selector */}
                  {cdaMode && (
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isReady ? (
                        <Select
                          value={currentRole ?? "none"}
                          onValueChange={(val) => {
                            assignRole(doc.id, val === "none" ? null : val as CdaRole);
                          }}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Assign role..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            <SelectItem value="policy">Policy</SelectItem>
                            <SelectItem value="denial">Denial Letter</SelectItem>
                            <SelectItem value="claim_summary">Claim Summary</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="w-[140px] h-8 flex items-center">
                          <span className="text-[10px] text-muted-foreground italic">Not ready</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatBytes(doc.fileSize)}</span>
                      {doc.documentType && (
                        <span className="text-[10px] text-muted-foreground">{doc.documentType}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {doc.sha256Hash.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cdaMode && currentRole && (
                      <Badge className="text-[10px] bg-cyan-600/20 text-cyan-300 border-cyan-500/30">
                        {currentRole === "claim_summary" ? "Claim Summary" : currentRole === "policy" ? "Policy" : "Denial"}
                      </Badge>
                    )}
                    {(doc as any).documentResolution && (doc as any).documentResolution !== 'active' && (
                      <Badge variant="outline" className="text-[10px] capitalize border-amber-500/30 text-amber-400">
                        {(doc as any).documentResolution}
                      </Badge>
                    )}
                    <div className={`h-2 w-2 rounded-full ${statusColor[doc.status] || "bg-muted-foreground"}`} />
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {doc.status}
                    </Badge>
                    {!cdaMode && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/documents/${doc.id}`)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setReplaceTarget({ id: doc.id, name: doc.filename })}>
                              <Replace className="h-3.5 w-3.5 mr-2" />
                              Replace Document
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* CDA Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-400" />
              Confirm Claim Denial Analysis
            </DialogTitle>
            <DialogDescription>
              Review the document assignments below. This will start a full CDA pipeline run.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {([
              ["Policy", cdaRoleState.policyDocId],
              ["Denial Letter", cdaRoleState.denialDocId],
              ["Claim Summary", cdaRoleState.claimDocId],
            ] as const).map(([label, docId]) => {
              const doc = docId ? getDocById(docId) : null;
              return (
                <div key={label} className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium truncate">{doc?.filename ?? "—"}</p>
                  </div>
                  {doc && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {doc.sha256Hash.slice(0, 8)}
                    </span>
                  )}
                  {doc ? (
                    <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              );
            })}

            <div className="p-3 rounded-md border border-cyan-500/20 bg-cyan-950/10">
              <p className="text-xs text-muted-foreground">
                This will start Claim Denial Analysis for this case. The pipeline processes
                T1–T9 stages and generates O1–O4 artifacts. Document hashes are locked at
                run creation — if documents change later, this run remains tied to the
                original content.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={startCdaRun.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRunCda}
              disabled={startCdaRun.isPending}
              className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {startCdaRun.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {startCdaRun.isPending ? "Starting..." : "Run Claim Denial Analysis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace Document Modal (Canonical V2) */}
      <ReplaceDocumentModalV2
        open={!!replaceTarget}
        onClose={() => setReplaceTarget(null)}
        documentId={replaceTarget?.id ?? 0}
        documentName={replaceTarget?.name ?? ''}
        onSuccess={() => {
          utils.documents.list.invalidate();
          utils.snapshots.lifecycle.invalidate();
          utils.documents.reanalyzeScopeSummary.invalidate();
        }}
      />
    </div>
  );
}

/** Role slot indicator in the CDA banner */
function RoleSlot({ role, label, docId, doc, onClear }: {
  role: CdaRole;
  label: string;
  docId: number | null;
  doc: any | null;
  onClear: () => void;
}) {
  return (
    <div className={`p-2 rounded-md border ${
      doc ? "border-cyan-500/40 bg-cyan-950/20" : "border-dashed border-muted-foreground/30"
    }`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      {doc ? (
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium truncate flex-1">{doc.filename}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors shrink-0"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Not assigned</p>
      )}
    </div>
  );
}
