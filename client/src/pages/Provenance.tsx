import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { useAuth } from "@/core/hooks/useAuth";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, RefreshCw, CheckCircle, Flag, ChevronDown, ChevronRight,
  FileText, Clock, AlertTriangle, Activity, Search, Loader2,
  Play, Square, RotateCcw, Zap, XCircle, History,
} from "lucide-react";
import { useLocation } from "wouter";
import { Link } from "wouter";

export default function Provenance() {
  const { user } = useAuth();
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [synthesisDialog, setSynthesisDialog] = useState<{ findingId: number; title: string } | null>(null);
  const [synthesisReason, setSynthesisReason] = useState("");
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: findings, isLoading } = trpc.provenance.listUnsupported.useQuery(
    { caseId: currentCaseId ?? undefined },
    { enabled: Boolean(user) }
  );

  const { data: metrics, isLoading: metricsLoading } = trpc.provenance.metrics.useQuery(
    { caseId: currentCaseId ?? undefined },
    { enabled: Boolean(user) }
  );

  const reRunMatching = trpc.provenance.reRunMatching.useMutation({
    onSuccess: (result, variables) => {
      if (result.matchedClaimIds.length > 0) {
        toast.success(`Matched ${result.matchedClaimIds.length} claims — finding is now linked`);
      } else {
        toast.info(`Re-run complete — ${result.candidateCount} candidates evaluated, no matches found`);
      }
      utils.provenance.listUnsupported.invalidate();
      utils.provenance.metrics.invalidate();
      utils.provenance.getDetail.invalidate({ findingId: variables.findingId });
      setActionInProgress(null);
    },
    onError: (err) => {
      toast.error(`Re-run failed: ${err.message}`);
      setActionInProgress(null);
    },
  });

  const markSynthesis = trpc.provenance.markSynthesis.useMutation({
    onSuccess: () => {
      toast.success("Finding classified as valid synthesis");
      setSynthesisDialog(null);
      setSynthesisReason("");
      utils.provenance.listUnsupported.invalidate();
      utils.provenance.metrics.invalidate();
      setActionInProgress(null);
    },
    onError: (err) => {
      toast.error(`Classification failed: ${err.message}`);
      setActionInProgress(null);
    },
  });

  const flagForReview = trpc.provenance.flagForReview.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Flagged for claim extraction review");
      utils.provenance.getDetail.invalidate({ findingId: variables.findingId });
      setActionInProgress(null);
    },
    onError: (err) => {
      toast.error(`Flag failed: ${err.message}`);
      setActionInProgress(null);
    },
  });

  // ─── Batch Re-Run State ───
  const [batchPolling, setBatchPolling] = useState(false);
  const { data: batchProgress, refetch: refetchBatch } = trpc.provenance.getBatchProgress.useQuery(
    undefined,
    {
      enabled: Boolean(user),
      refetchInterval: user && batchPolling ? 2000 : false,
    }
  );

  const activeBatchRunning = batchProgress?.isActive === true && batchProgress?.status === "running";

  // Sync polling state with batch status
  useEffect(() => {
    setBatchPolling(!!activeBatchRunning);
  }, [activeBatchRunning]);

  const startBatch = trpc.provenance.startBatchRerun.useMutation({
    onSuccess: (result) => {
      toast.success(`Batch re-run started: ${result.totalFindings} findings to process`);
      refetchBatch();
    },
    onError: (err) => toast.error(`Failed to start batch: ${err.message}`),
  });

  const abortBatch = trpc.provenance.abortBatchRerun.useMutation({
    onSuccess: () => {
      toast.info("Batch abort requested — will stop after current finding");
      refetchBatch();
    },
    onError: (err) => toast.error(`Abort failed: ${err.message}`),
  });

  const resumeBatch = trpc.provenance.resumeBatchRerun.useMutation({
    onSuccess: (result) => {
      toast.success(`Batch resumed: ${result.totalRemaining} findings remaining`);
      refetchBatch();
    },
    onError: (err) => toast.error(`Resume failed: ${err.message}`),
  });

  // Auto-refresh metrics/findings when batch completes
  useEffect(() => {
    if (batchProgress && !batchProgress.isActive && batchProgress.status !== "running") {
      utils.provenance.listUnsupported.invalidate();
      utils.provenance.metrics.invalidate();
    }
  }, [batchProgress?.isActive, batchProgress?.status]);

  if (!user) {
    return (
      <PublicWalkthroughShell
        title="Provenance Drill-Down"
        description="Walk through the source-linkage and audit workspace without exposing case findings, batch history, or review controls."
        sections={["Source linkage", "Provenance metrics", "Batch review"]}
      />
    );
  }

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const totalFindings = metrics?.totalFindings;
  const provenanceLoading = isLoading || metricsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Provenance Drill-Down
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audits source linkage for the legacy findings population. Zero findings and unrun analysis are never treated as verified provenance.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Link href="/provenance/history">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <History className="h-3.5 w-3.5" />
              Batch History & Alerts
            </Button>
          </Link>
          <ExportAuditButton />
        </div>
      </div>

      {/* ── Batch Re-Run Controls ── */}
      {findings && findings.length > 0 && (
        <div className="flex items-center gap-3">
          {!activeBatchRunning && (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={startBatch.isPending || (findings?.length ?? 0) === 0}
              onClick={() => startBatch.mutate()}
            >
              {startBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Re-Run All Unsupported
            </Button>
          )}
          {batchProgress && (batchProgress.status === "aborted" || batchProgress.status === "error") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={resumeBatch.isPending}
              onClick={() => resumeBatch.mutate({ batchId: batchProgress.id })}
            >
              {resumeBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Resume Batch
            </Button>
          )}
        </div>
      )}

      {/* ── Batch Progress Display ── */}
      {batchProgress && <BatchProgressPanel batch={batchProgress} onAbort={(id: number) => abortBatch.mutate({ batchId: id })} aborting={abortBatch.isPending} />}

      {/* ── Metrics Header ── */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            label="Total Findings"
            value={metrics.totalFindings}
            color={metrics.totalFindings > 0 ? "text-blue-400" : "text-muted-foreground"}
          />
          <MetricCard
            label="Unsupported Findings"
            value={metrics.unsupportedCount}
            color={metrics.totalFindings === 0 ? "text-muted-foreground" : metrics.unsupportedCount === 0 ? "text-emerald-400" : "text-amber-400"}
          />
          <MetricCard
            label="Unsupported Rate"
            value={metrics.totalFindings === 0 ? "N/A" : `${metrics.unsupportedRate}%`}
            color={metrics.totalFindings === 0 ? "text-muted-foreground" : metrics.unsupportedRate <= 5 ? "text-emerald-400" : metrics.unsupportedRate <= 15 ? "text-amber-400" : "text-red-400"}
          />
          <MetricCard
            label="Avg Candidates Evaluated"
            value={metrics.totalFindings === 0 ? "N/A" : metrics.avgCandidateClaimsEvaluated}
            color={metrics.totalFindings === 0 ? "text-muted-foreground" : "text-blue-400"}
          />
          <MetricCard
            label="Fallback Usage Rate"
            value={metrics.totalFindings === 0 ? "N/A" : `${metrics.fallbackUsageRate}%`}
            color={metrics.totalFindings === 0 ? "text-muted-foreground" : "text-purple-400"}
          />
        </div>
      )}

      {/* ── Findings Table ── */}
      {provenanceLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : totalFindings === 0 ? (
        <Card className="border-border bg-muted/10">
          <CardContent className="p-8 text-center">
            <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium text-foreground">No finding population to evaluate</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl mx-auto">
              This case currently has zero legacy findings. Provenance review has not produced a successful result because there are no findings to test for source linkage.
            </p>
          </CardContent>
        </Card>
      ) : totalFindings === undefined ? (
        <Card className="border-border bg-muted/10">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium text-foreground">Provenance state unavailable</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The finding population could not be established, so provenance health is not inferred.
            </p>
          </CardContent>
        </Card>
      ) : !findings || findings.length === 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <h3 className="font-medium text-foreground">All existing findings have provenance</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {totalFindings} finding{totalFindings === 1 ? "" : "s"} exist and none remain in an unsupported provenance state.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {/* Table header */}
          <div className="grid grid-cols-[40px_80px_1fr_120px_80px_80px_100px] gap-2 px-3 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            <span></span>
            <span>ID</span>
            <span>Finding</span>
            <span>Documents</span>
            <span>Candidates</span>
            <span>Fallback</span>
            <span>Created</span>
          </div>

          {findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              isExpanded={expandedId === f.id}
              onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
              onReRun={() => {
                setActionInProgress(f.id);
                reRunMatching.mutate({ findingId: f.id });
              }}
              onMarkSynthesis={() => setSynthesisDialog({ findingId: f.id, title: f.title })}
              onFlagReview={() => {
                setActionInProgress(f.id);
                flagForReview.mutate({ findingId: f.id });
              }}
              actionInProgress={actionInProgress === f.id}
            />
          ))}
        </div>
      )}

      {/* ── Synthesis Dialog ── */}
      <Dialog open={!!synthesisDialog} onOpenChange={() => { setSynthesisDialog(null); setSynthesisReason(""); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-amber-400" />
              Mark as Valid Synthesis
            </DialogTitle>
            <DialogDescription>
              Classify this finding as a valid analytical synthesis that does not require direct claim linkage.
              This action is audited and requires a reason.
            </DialogDescription>
          </DialogHeader>
          {synthesisDialog && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-sm text-foreground font-medium">{synthesisDialog.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Reason (mandatory)</label>
                <Textarea
                  value={synthesisReason}
                  onChange={(e) => setSynthesisReason(e.target.value)}
                  placeholder="Explain why this finding is a valid synthesis without direct claim provenance..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSynthesisDialog(null); setSynthesisReason(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!synthesisReason.trim() || markSynthesis.isPending}
              onClick={() => {
                if (synthesisDialog) {
                  setActionInProgress(synthesisDialog.findingId);
                  markSynthesis.mutate({ findingId: synthesisDialog.findingId, reason: synthesisReason.trim() });
                }
              }}
            >
              {markSynthesis.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Classification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Metric Card ───

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Finding Row (with expandable detail) ───

interface FindingRowProps {
  finding: {
    id: number;
    findingType: string;
    title: string;
    description: string;
    provenanceStatus: string;
    candidateClaimCount: number;
    fallbackTriggered: boolean;
    matchAttemptTimestamp: number | null;
    createdAt: number;
    documentIds: number[];
    documentLabels: string[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  onReRun: () => void;
  onMarkSynthesis: () => void;
  onFlagReview: () => void;
  actionInProgress: boolean;
}

function FindingRow({ finding, isExpanded, onToggle, onReRun, onMarkSynthesis, onFlagReview, actionInProgress }: FindingRowProps) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Row */}
      <div
        className="grid grid-cols-[40px_80px_1fr_120px_80px_80px_100px] gap-2 px-3 py-3 items-center cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center justify-center">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </span>
        <span className="text-xs font-mono text-muted-foreground">#{finding.id}</span>
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{finding.title}</p>
          <p className="text-[10px] text-muted-foreground truncate">{finding.description.slice(0, 200)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {finding.documentLabels.slice(0, 2).map((label, i) => (
            <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{label}</Badge>
          ))}
          {finding.documentLabels.length > 2 && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">+{finding.documentLabels.length - 2}</Badge>
          )}
        </div>
        <span className="text-xs font-mono text-center">{finding.candidateClaimCount}</span>
        <span className="text-center">
          {finding.fallbackTriggered ? (
            <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">Yes</Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">No</span>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(finding.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Expanded Detail Panel */}
      {isExpanded && <FindingDetailPanel findingId={finding.id} onReRun={onReRun} onMarkSynthesis={onMarkSynthesis} onFlagReview={onFlagReview} actionInProgress={actionInProgress} />}
    </div>
  );
}

// ─── Detail Panel ───

function FindingDetailPanel({ findingId, onReRun, onMarkSynthesis, onFlagReview, actionInProgress }: {
  findingId: number;
  onReRun: () => void;
  onMarkSynthesis: () => void;
  onFlagReview: () => void;
  actionInProgress: boolean;
}) {
  const [, setLocation] = useLocation();
  const { data: detail, isLoading } = trpc.provenance.getDetail.useQuery({ findingId });

  if (isLoading) {
    return (
      <div className="px-6 py-4 border-t border-border bg-muted/5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const { finding, candidateClaims, matchMetadata, auditLog } = detail;

  return (
    <div className="px-6 py-4 border-t border-border bg-muted/5 space-y-5">
      {/* Full Finding Text */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Full Finding</h4>
        <div className="p-3 rounded-md bg-background border border-border">
          <p className="text-sm font-medium text-foreground mb-1">{finding.title}</p>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{finding.description}</p>
          {finding.significance && (
            <p className="text-xs text-muted-foreground mt-2 italic">{finding.significance}</p>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="text-[9px]">{finding.findingType}</Badge>
          <Badge variant="outline" className="text-[9px]">{finding.confidence}</Badge>
          <Badge variant="outline" className="text-[9px]">{finding.evidentiaryWeight}</Badge>
          <Badge
            variant="outline"
            className={`text-[9px] ${finding.provenanceStatus === 'unsupported_synthesis' ? 'text-amber-400 border-amber-400/30' : 'text-red-400 border-red-400/30'}`}
          >
            {finding.provenanceStatus}
          </Badge>
        </div>
      </div>

      {/* Source Documents */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Source Documents</h4>
        <div className="flex flex-wrap gap-2">
          {candidateClaims.length > 0 ? (
            Array.from(new Set(candidateClaims.map(c => c.documentId))).map(docId => {
              const label = candidateClaims.find(c => c.documentId === docId)?.documentLabel || `Doc #${docId}`;
              return (
                <Button
                  key={docId}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setLocation(`/documents/${docId}`)}
                >
                  <FileText className="h-3 w-3" />
                  {label}
                </Button>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">No documents linked to this case's claims</p>
          )}
        </div>
      </div>

      {/* Candidate Claims */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Candidate Claims ({candidateClaims.length})
        </h4>
        {candidateClaims.length === 0 ? (
          <p className="text-xs text-muted-foreground">No candidate claims available in this case</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {candidateClaims.map(claim => (
              <div key={claim.id} className="p-2 rounded-md bg-background border border-border/50 flex items-start gap-2">
                <span className="text-[9px] font-mono text-muted-foreground shrink-0 mt-0.5">#{claim.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground truncate">{claim.claimText}</p>
                  <div className="flex gap-1 mt-0.5">
                    <Badge variant="outline" className="text-[8px] px-1 py-0">{claim.claimType}</Badge>
                    <span className="text-[8px] text-muted-foreground">{claim.documentLabel}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Match Metadata */}
      {matchMetadata && Object.keys(matchMetadata).length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Raw Match Metadata</h4>
          <pre className="p-3 rounded-md bg-background border border-border text-[10px] text-foreground/70 overflow-x-auto max-h-[150px]">
            {JSON.stringify(matchMetadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Audit Trail */}
      {auditLog.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Audit Trail ({auditLog.length})
          </h4>
          <div className="space-y-1">
            {auditLog.map(entry => (
              <div key={entry.id} className="p-2 rounded-md bg-background border border-border/50 flex items-center gap-3">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[8px] px-1 py-0">{entry.actionType}</Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {entry.previousStatus} → {entry.newStatus}
                    </span>
                  </div>
                  {entry.reason && <p className="text-[10px] text-foreground/70 mt-0.5 truncate">{entry.reason}</p>}
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={actionInProgress}
          onClick={onReRun}
        >
          {actionInProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-Run Matching
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
          disabled={actionInProgress || finding.provenanceStatus === 'unsupported_synthesis'}
          onClick={onMarkSynthesis}
        >
          <CheckCircle className="h-3 w-3" />
          Mark as Valid Synthesis
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs text-blue-400 border-blue-400/30 hover:bg-blue-500/10"
          disabled={actionInProgress}
          onClick={onFlagReview}
        >
          <Flag className="h-3 w-3" />
          Flag for Review
        </Button>
      </div>
    </div>
  );
}

// ─── Batch Progress Panel ───

interface BatchProgressPanelProps {
  batch: {
    id: number;
    status: string;
    isActive: boolean;
    totalFindings: number;
    processedCount: number;
    resolvedCount: number;
    errorCount: number;
    stillUnsupported: number;
    fallbackUsageCount: number;
    startedAt: number;
    completedAt: number | null;
    abortedAt: number | null;
    runtimeMs: number | null;
  };
  onAbort: (id: number) => void;
  aborting: boolean;
}

function BatchProgressPanel({ batch, onAbort, aborting }: BatchProgressPanelProps) {
  const isRunning = batch.status === "running";
  const isCompleted = batch.status === "completed";
  const isAborted = batch.status === "aborted";
  const isError = batch.status === "error";
  const progressPct = batch.totalFindings > 0 ? Math.round((batch.processedCount / batch.totalFindings) * 100) : 0;
  const fallbackRate = batch.processedCount > 0 ? Math.round((batch.fallbackUsageCount / batch.processedCount) * 100) : 0;
  const elapsed = batch.runtimeMs ?? (Date.now() - batch.startedAt);
  const elapsedStr = elapsed < 60000
    ? `${Math.round(elapsed / 1000)}s`
    : `${Math.floor(elapsed / 60000)}m ${Math.round((elapsed % 60000) / 1000)}s`;

  const borderColor = isRunning ? "border-blue-500/40" : isCompleted ? "border-emerald-500/40" : isAborted ? "border-amber-500/40" : "border-red-500/40";
  const bgColor = isRunning ? "bg-blue-500/5" : isCompleted ? "bg-emerald-500/5" : isAborted ? "bg-amber-500/5" : "bg-red-500/5";

  return (
    <Card className={`${borderColor} ${bgColor}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
            {isCompleted && <CheckCircle className="h-4 w-4 text-emerald-400" />}
            {isAborted && <Square className="h-4 w-4 text-amber-400" />}
            {isError && <XCircle className="h-4 w-4 text-red-400" />}
            <span className="text-sm font-medium text-foreground">
              Batch Re-Run #{batch.id}
            </span>
            <Badge variant="outline" className={`text-[9px] ${
              isRunning ? "text-blue-400 border-blue-400/30" :
              isCompleted ? "text-emerald-400 border-emerald-400/30" :
              isAborted ? "text-amber-400 border-amber-400/30" :
              "text-red-400 border-red-400/30"
            }`}>
              {batch.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs text-red-400 border-red-400/30 hover:bg-red-500/10"
                disabled={aborting}
                onClick={() => onAbort(batch.id)}
              >
                {aborting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                Abort
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{elapsedStr}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progressPct} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{batch.processedCount} / {batch.totalFindings} processed</span>
            <span>{progressPct}%</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <p className="text-lg font-bold text-emerald-400">{batch.resolvedCount}</p>
            <p className="text-[9px] text-muted-foreground">Resolved (linked)</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-400">{batch.stillUnsupported}</p>
            <p className="text-[9px] text-muted-foreground">Still Unsupported</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-400">{batch.errorCount}</p>
            <p className="text-[9px] text-muted-foreground">Errors</p>
          </div>
          <div>
            <p className="text-lg font-bold text-purple-400">{fallbackRate}%</p>
            <p className="text-[9px] text-muted-foreground">Fallback Usage</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-400">{batch.totalFindings - batch.processedCount}</p>
            <p className="text-[9px] text-muted-foreground">Remaining</p>
          </div>
        </div>

        {/* Completion summary — non-dismissable */}
        {(isCompleted || isAborted) && (
          <div className={`p-3 rounded-md border ${isCompleted ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <h4 className="text-xs font-medium text-foreground mb-1">
              {isCompleted ? "Batch Complete" : "Batch Aborted"}
            </h4>
            <p className="text-[10px] text-foreground/80">
              Processed {batch.processedCount} of {batch.totalFindings} findings in {elapsedStr}.{" "}
              {batch.resolvedCount} newly linked, {batch.errorCount} errors, {batch.stillUnsupported} still unsupported.{" "}
              Fallback matcher used in {fallbackRate}% of attempts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportAuditButton() {
  const { data, isLoading, refetch } = trpc.provenance.exportAuditTrail.useQuery(
    { limit: 10000 },
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await refetch();
    if (result.data) {
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provenance-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.data.count} audit entries`);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={handleExport}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      Export Audit CSV
    </Button>
  );
}
