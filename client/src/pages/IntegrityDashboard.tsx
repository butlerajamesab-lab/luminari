import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  AlertTriangle, FileText, RotateCcw,
  Loader2, MoreVertical, Eye, Ban, FileX, Replace, Shield,
  CheckCircle2, Upload, ChevronRight, Link2,
  ShieldCheck, ShieldAlert, ArrowRight, Info,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ReplaceDocumentModalV2 from "@/components/ReplaceDocumentModalV2";

type ModalState =
  | { type: "none" }
  | { type: "corrupted"; docId: number; docName: string }
  | { type: "excluded"; docId: number; docName: string }
  | { type: "replace"; docId: number; docName: string }
  | { type: "metadata"; docId: number; docName: string };

export default function IntegrityDashboard() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState("blocking");
  const utils = trpc.useUtils();

  // ── Data Queries ──

  const { data: intakeIntegrity, isLoading: intakeIntegrityLoading } = trpc.analyze.getIntakeIntegrityProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000 }
  );

  const { data: lifecycle, isLoading: lifecycleLoading } = trpc.snapshots.lifecycle.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000 }
  );

  const { data: docs, isLoading: docsLoading } = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const { data: resolvedDocs } = trpc.documents.listResolved.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const isSealed = lifecycle?.hasSnapshot && lifecycle?.status === "sealed";
  const snapshotId = lifecycle?.hasSnapshot ? lifecycle.snapshotId : null;

  // ── Categorized Legacy Document Buckets ──

  const categorized = useMemo(() => {
    if (!docs) return null;
    const allActive = docs.filter(d => {
      const res = (d as any).documentResolution;
      return !res || res === "active";
    });
    const inSnapshot = snapshotId
      ? allActive.filter(d => d.snapshotId === snapshotId)
      : [];

    const failedPermanent = inSnapshot.filter(d => d.status === "failed_permanent");
    const errorRetryable = inSnapshot.filter(d => d.status === "error");
    const corrupted = (resolvedDocs || []).filter(d => (d as any).documentResolution === "corrupted");
    const excluded = (resolvedDocs || []).filter(d => (d as any).documentResolution === "excluded");
    const superseded = (resolvedDocs || []).filter(d => (d as any).documentResolution === "superseded");

    // Blocking here is intentionally legacy snapshot/extraction state only.
    const blocking = [...failedPermanent, ...errorRetryable];

    return {
      blocking,
      failedPermanent,
      errorRetryable,
      corrupted,
      excluded,
      superseded,
      totalActive: inSnapshot.length,
      totalResolved: (resolvedDocs || []).length,
    };
  }, [docs, resolvedDocs, snapshotId]);

  // Search filter for the active tab
  const filterBySearch = useCallback((items: any[]) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((d: any) =>
      d.filename?.toLowerCase().includes(q) ||
      d.errorMessage?.toLowerCase().includes(q)
    );
  }, [search]);

  // ── Mutations ──

  const retryMutation = trpc.documents.analyze.useMutation({
    onSuccess: () => {
      toast.success("Document queued for retry");
      utils.documents.list.invalidate();
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markCorruptedMutation = trpc.documents.markCorrupted.useMutation({
    onSuccess: () => {
      toast.success("Document marked as corrupted");
      setModal({ type: "none" });
      setReason("");
      utils.documents.list.invalidate();
      utils.documents.listResolved.invalidate();
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markExcludedMutation = trpc.documents.markExcluded.useMutation({
    onSuccess: () => {
      toast.success("Document marked as excluded");
      setModal({ type: "none" });
      setReason("");
      utils.documents.list.invalidate();
      utils.documents.listResolved.invalidate();
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Handlers ──

  const handleRetry = useCallback(
    (docId: number, caseId: number) => {
      retryMutation.mutate({ documentId: docId, caseId });
    },
    [retryMutation]
  );

  const handleSubmitCorrupted = () => {
    if (modal.type !== "corrupted") return;
    markCorruptedMutation.mutate({ documentId: modal.docId, reason: reason.trim() });
  };

  const handleSubmitExcluded = () => {
    if (modal.type !== "excluded") return;
    markExcludedMutation.mutate({ documentId: modal.docId, reason: reason.trim() });
  };

  // ── No case selected ──

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const isLoading = lifecycleLoading || docsLoading;
  const canonicalState = intakeIntegrity?.projection_state;
  const canonicalBlocked = canonicalState === "blocked";
  const canonicalVerified = canonicalState === "verified";

  const canonicalStateLabel = canonicalState === "verified"
    ? "Verified"
    : canonicalState === "blocked"
      ? "Blocked"
      : canonicalState === "partial"
        ? "Partial"
        : canonicalState === "not_run"
          ? "Not run"
          : canonicalState === "no_evidence"
            ? "No evidence"
            : "Loading";

  const canonicalStateDescription = canonicalState === "verified"
    ? "Every registered Intake source artifact has a sealed Layer 3 evidence-preservation receipt and verified SHA-256 match."
    : canonicalState === "blocked"
      ? "At least one sealed Layer 3 result is quarantined or references missing bytes. Integrity is not satisfied."
      : canonicalState === "partial"
        ? "Layer 3 has verified only part of the registered Intake source-artifact population. Integrity remains incomplete."
        : canonicalState === "not_run"
          ? "Evidence is registered, but current-contract Layer 3 evidence preservation has not been executed. Zero errors is not treated as health."
          : canonicalState === "no_evidence"
            ? "No Intake source artifacts are registered for this case, so evidence integrity has no population to evaluate."
            : "Loading the receipt-bound Intake evidence-preservation state.";

  // ── Legacy Gate Impact Summary ──

  const gateImpact = useMemo(() => {
    if (!lifecycle?.hasSnapshot) return null;
    const breakdown = (lifecycle as any).activeErrorBreakdown;
    const resolution = (lifecycle as any).resolutionSummary;
    const reasons = (lifecycle as any).stageReasons;
    return { breakdown, resolution, reasons };
  }, [lifecycle]);

  // ── Row Action Component ──

  const DocRow = ({ doc, showResolution }: { doc: any; showResolution?: boolean }) => {
    const statusColor = doc.status === "failed_permanent"
      ? "text-red-400"
      : doc.status === "error"
        ? "text-amber-400"
        : "text-muted-foreground";
    const statusLabel = doc.status === "failed_permanent"
      ? "Failed Permanent"
      : doc.status === "error"
        ? "Error (Retryable)"
        : doc.status;
    const resLabel = (doc as any).documentResolution;

    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/30 transition-colors group">
        <FileText className={`h-4 w-4 shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setLocation(`/documents/${doc.id}`)}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block text-left w-full"
          >
            {doc.filename}
          </button>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
            {showResolution && resLabel && resLabel !== "active" && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {resLabel}
              </Badge>
            )}
            {doc.errorMessage && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                — {doc.errorMessage}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isSealed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(doc.status === "error" || doc.status === "failed_permanent") && (
                  <DropdownMenuItem onClick={() => handleRetry(doc.id, doc.caseId)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    Retry Extraction
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => {
                  setModal({ type: "replace", docId: doc.id, docName: doc.filename });
                  setReason("");
                }}>
                  <Replace className="h-3.5 w-3.5 mr-2" />
                  Replace Document
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  setModal({ type: "corrupted", docId: doc.id, docName: doc.filename });
                  setReason("");
                }}>
                  <FileX className="h-3.5 w-3.5 mr-2 text-red-400" />
                  Mark Corrupted
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setModal({ type: "excluded", docId: doc.id, docName: doc.filename });
                  setReason("");
                }}>
                  <Ban className="h-3.5 w-3.5 mr-2 text-amber-400" />
                  Mark Excluded
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setModal({ type: "metadata", docId: doc.id, docName: doc.filename })}>
                  <Eye className="h-3.5 w-3.5 mr-2" />
                  View Metadata
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLocation(`/documents/${doc.id}`)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  // ── Resolved Doc Row (read-only actions) ──

  const ResolvedDocRow = ({ doc }: { doc: any }) => {
    const resLabel = (doc as any).documentResolution;
    const resReason = (doc as any).resolutionReason;
    const replacedBy = (doc as any).replacedByDocumentId;
    const badgeColor = resLabel === "superseded"
      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
      : resLabel === "corrupted"
        ? "bg-red-500/10 text-red-400 border-red-500/30"
        : "bg-amber-500/10 text-amber-400 border-amber-500/30";

    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/30 transition-colors group">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setLocation(`/documents/${doc.id}`)}
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors truncate block text-left w-full"
          >
            {doc.filename}
          </button>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${badgeColor}`}>
              {resLabel}
            </Badge>
            {resReason && (
              <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                {resReason}
              </span>
            )}
            {replacedBy && (
              <button
                onClick={() => setLocation(`/documents/${replacedBy}`)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Link2 className="h-3 w-3" />
                #{replacedBy}
              </button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setLocation(`/documents/${doc.id}`)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            {canonicalBlocked ? (
              <ShieldAlert className="h-5 w-5 text-red-400" />
            ) : canonicalVerified ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            ) : (
              <Shield className="h-5 w-5 text-muted-foreground" />
            )}
            Integrity & Resolutions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Canonical Intake Layer 3: {canonicalStateLabel}
            {lifecycle?.hasSnapshot ? ` · Legacy snapshot #${snapshotId} ${lifecycle.status?.toUpperCase()}` : " · Legacy snapshot not active"}
          </p>
        </div>
        {!isSealed && (
          <Button variant="outline" size="sm" onClick={() => setLocation("/upload")} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload Replacement
          </Button>
        )}
      </div>

      {/* Canonical Universal Intake Spine Layer 3 */}
      <Card className={canonicalBlocked
        ? "border-red-500/30 bg-red-950/10"
        : canonicalVerified
          ? "border-emerald-500/30 bg-emerald-950/10"
          : "border-border bg-muted/10"}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {intakeIntegrityLoading ? (
                <Loader2 className="h-5 w-5 mt-0.5 animate-spin text-muted-foreground shrink-0" />
              ) : canonicalBlocked ? (
                <ShieldAlert className="h-5 w-5 mt-0.5 text-red-400 shrink-0" />
              ) : canonicalVerified ? (
                <ShieldCheck className="h-5 w-5 mt-0.5 text-emerald-400 shrink-0" />
              ) : (
                <Shield className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold">Canonical evidence preservation</h2>
                  <Badge variant="outline" className="text-[10px]">{canonicalStateLabel}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {canonicalStateDescription}
                </p>
              </div>
            </div>
          </div>

          {intakeIntegrity && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="text-lg font-semibold">{intakeIntegrity.source_artifact_count}</p>
                <p className="text-[10px] text-muted-foreground">Registered sources</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="text-lg font-semibold">{intakeIntegrity.projected_artifact_count}</p>
                <p className="text-[10px] text-muted-foreground">Layer 3 receipts</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="text-lg font-semibold">{intakeIntegrity.preserved_count}</p>
                <p className="text-[10px] text-muted-foreground">Preserved</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="text-lg font-semibold">{intakeIntegrity.quarantined_count}</p>
                <p className="text-[10px] text-muted-foreground">Quarantined</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="text-lg font-semibold">{intakeIntegrity.referenced_missing_count}</p>
                <p className="text-[10px] text-muted-foreground">Referenced missing</p>
              </div>
            </div>
          )}

          {intakeIntegrity && intakeIntegrity.artifacts.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {intakeIntegrity.artifacts.map((artifact) => (
                <div key={artifact.artifact_id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{artifact.filename || artifact.artifact_key}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {artifact.integrity_status ?? "not_run"}
                  </Badge>
                  {artifact.receipt_hash && (
                    <code className="hidden md:block text-[9px] text-muted-foreground shrink-0">
                      {artifact.receipt_hash.slice(0, 12)}…
                    </code>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-medium">Legacy snapshot processing state</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          These extraction and resolution controls are preserved for the legacy snapshot workflow. They do not substitute for the receipt-bound Intake Layer 3 result above.
        </p>
      </div>

      {/* Legacy Gate Impact Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Active Errors Blocking */}
        <Card className={!lifecycle?.hasSnapshot
          ? "border-border bg-muted/10"
          : categorized && categorized.blocking.length > 0
            ? "border-red-500/30 bg-red-950/10"
            : "border-emerald-500/30 bg-emerald-950/10"}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`h-4 w-4 ${
                !lifecycle?.hasSnapshot
                  ? "text-muted-foreground"
                  : categorized && categorized.blocking.length > 0
                    ? "text-red-400"
                    : "text-emerald-400"
              }`} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Errors</span>
            </div>
            <p className="text-2xl font-bold">
              {lifecycle?.hasSnapshot ? categorized?.blocking.length ?? 0 : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {!lifecycle?.hasSnapshot
                ? "not evaluated — no active legacy snapshot"
                : categorized && categorized.blocking.length > 0
                  ? "blocking legacy extraction"
                  : "no active legacy extraction errors observed"}
            </p>
            {gateImpact?.breakdown && gateImpact.breakdown.total > 0 && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {gateImpact.breakdown.autoRecoverable > 0 && (
                  <p>{gateImpact.breakdown.autoRecoverable} auto-recoverable</p>
                )}
                {gateImpact.breakdown.manualReupload > 0 && (
                  <p>{gateImpact.breakdown.manualReupload} manual re-upload</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resolved Documents */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resolved</span>
            </div>
            <p className="text-2xl font-bold">
              {categorized?.totalResolved ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              legacy documents resolved (not blocking)
            </p>
            {gateImpact?.resolution && gateImpact.resolution.totalResolved > 0 && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {gateImpact.resolution.superseded > 0 && <p>{gateImpact.resolution.superseded} superseded</p>}
                {gateImpact.resolution.corrupted > 0 && <p>{gateImpact.resolution.corrupted} corrupted</p>}
                {gateImpact.resolution.excluded > 0 && <p>{gateImpact.resolution.excluded} excluded</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gate Stage */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gate Stage</span>
            </div>
            <p className="text-2xl font-bold">
              {lifecycle?.hasSnapshot ? (lifecycle as any).gateStage ?? "—" : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {lifecycle?.hasSnapshot && (lifecycle as any).extractionIntegrity === false
                ? "legacy extraction integrity incomplete"
                : lifecycle?.hasSnapshot && (lifecycle as any).extractionIntegrity === true
                  ? "legacy extraction integrity passed"
                  : "not evaluated — no active legacy snapshot"}
            </p>
            {gateImpact?.reasons?.extraction && (lifecycle as any).extractionIntegrity === false && (
              <p className="text-xs text-red-400/80 mt-2 truncate">
                {gateImpact.reasons.extraction}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gate Stage Reasons (when blocking) */}
      {gateImpact?.reasons && categorized && categorized.blocking.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-950/10">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/80 space-y-1">
                <p className="font-medium">Gate Blocking Reasons:</p>
                {gateImpact.reasons.extraction && <p>Extraction: {gateImpact.reasons.extraction}</p>}
                {gateImpact.reasons.claimBuild && <p>Claim Build: {gateImpact.reasons.claimBuild}</p>}
                {gateImpact.reasons.correlation && <p>Correlation: {gateImpact.reasons.correlation}</p>}
                {gateImpact.reasons.findings && <p>Findings: {gateImpact.reasons.findings}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy Tabbed Document Lists */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Legacy Snapshot Documents</CardTitle>
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 h-8 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="blocking" className="gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Blocking
                {categorized && categorized.blocking.length > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[10px] ml-1">
                    {categorized.blocking.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="failed_permanent" className="gap-1.5">
                Failed Permanent
                {categorized && categorized.failedPermanent.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] ml-1">
                    {categorized.failedPermanent.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="retryable" className="gap-1.5">
                Auto-Recoverable
                {categorized && categorized.errorRetryable.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] ml-1">
                    {categorized.errorRetryable.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="gap-1.5">
                Resolved
                {categorized && categorized.totalResolved > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] ml-1">
                    {categorized.totalResolved}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Blocking Tab */}
            <TabsContent value="blocking" className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !lifecycle?.hasSnapshot ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <Shield className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Legacy extraction gate not evaluated.</p>
                  <p className="text-xs text-muted-foreground">No active legacy snapshot exists. This state is neutral, not healthy.</p>
                </div>
              ) : categorized && categorized.blocking.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-200">No active legacy extraction errors in this snapshot.</p>
                  <p className="text-xs text-muted-foreground">This statement applies only to the active legacy snapshot and does not replace Intake Layer 3 verification.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filterBySearch(categorized?.blocking ?? []).map((doc: any) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Failed Permanent Tab */}
            <TabsContent value="failed_permanent" className="mt-0">
              {categorized && categorized.failedPermanent.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No permanently failed documents in the active legacy snapshot.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filterBySearch(categorized?.failedPermanent ?? []).map((doc: any) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Auto-Recoverable Tab */}
            <TabsContent value="retryable" className="mt-0">
              {categorized && categorized.errorRetryable.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No auto-recoverable errors in the active legacy snapshot.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filterBySearch(categorized?.errorRetryable ?? []).map((doc: any) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Resolved Tab */}
            <TabsContent value="resolved" className="mt-0">
              {categorized && categorized.totalResolved === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <Info className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No resolved legacy documents.</p>
                </div>
              ) : (
                <>
                  {/* Sub-sections for resolved types */}
                  {categorized && categorized.superseded.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                        Superseded ({categorized.superseded.length})
                      </p>
                      <div className="divide-y divide-border">
                        {filterBySearch(categorized.superseded).map((doc: any) => (
                          <ResolvedDocRow key={doc.id} doc={doc} />
                        ))}
                      </div>
                    </div>
                  )}
                  {categorized && categorized.corrupted.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                        Corrupted ({categorized.corrupted.length})
                      </p>
                      <div className="divide-y divide-border">
                        {filterBySearch(categorized.corrupted).map((doc: any) => (
                          <ResolvedDocRow key={doc.id} doc={doc} />
                        ))}
                      </div>
                    </div>
                  )}
                  {categorized && categorized.excluded.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
                        Excluded ({categorized.excluded.length})
                      </p>
                      <div className="divide-y divide-border">
                        {filterBySearch(categorized.excluded).map((doc: any) => (
                          <ResolvedDocRow key={doc.id} doc={doc} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Modals ── */}

      {/* Mark Corrupted Modal */}
      <Dialog open={modal.type === "corrupted"} onOpenChange={(open) => !open && setModal({ type: "none" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileX className="h-4 w-4 text-red-400" />
              Mark as Corrupted
            </DialogTitle>
            <DialogDescription>
              Mark <strong>{modal.type === "corrupted" ? modal.docName : ""}</strong> as corrupted.
              This removes it from active extraction counting. Requires a reason (min 10 characters).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Describe why this document is corrupted (min 10 characters)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ type: "none" })}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleSubmitCorrupted}
              disabled={reason.trim().length < 10 || markCorruptedMutation.isPending}
            >
              {markCorruptedMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Mark Corrupted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Excluded Modal */}
      <Dialog open={modal.type === "excluded"} onOpenChange={(open) => !open && setModal({ type: "none" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-400" />
              Mark as Excluded
            </DialogTitle>
            <DialogDescription>
              Exclude <strong>{modal.type === "excluded" ? modal.docName : ""}</strong> from active analysis.
              This removes it from active extraction counting. Requires a reason (min 10 characters).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Describe why this document should be excluded (min 10 characters)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ type: "none" })}>Cancel</Button>
            <Button
              onClick={handleSubmitExcluded}
              disabled={reason.trim().length < 10 || markExcludedMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {markExcludedMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Mark Excluded
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace Document Modal (Canonical V2) */}
      <ReplaceDocumentModalV2
        open={modal.type === "replace"}
        onClose={() => setModal({ type: "none" })}
        documentId={modal.type === "replace" ? modal.docId : 0}
        documentName={modal.type === "replace" ? modal.docName : ""}
        onSuccess={() => {
          utils.documents.list.invalidate();
          utils.snapshots.lifecycle.invalidate();
          utils.documents.reanalyzeScopeSummary.invalidate();
        }}
      />

      {/* Metadata Modal */}
      <Dialog open={modal.type === "metadata"} onOpenChange={(open) => !open && setModal({ type: "none" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Document Metadata
            </DialogTitle>
          </DialogHeader>
          {modal.type === "metadata" && (
            <MetadataView docId={modal.docId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Metadata viewer sub-component */
function MetadataView({ docId }: { docId: number }) {
  const { currentCaseId } = useCase();
  const { data: docs } = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const doc = docs?.find((d) => d.id === docId);
  if (!doc) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const fields = [
    ["ID", doc.id],
    ["Filename", doc.filename],
    ["Status", doc.status],
    ["Resolution", (doc as any).documentResolution ?? "active"],
    ["Resolution Reason", (doc as any).resolutionReason ?? "—"],
    ["Replaced By", (doc as any).replacedByDocumentId ?? "—"],
    ["SHA-256", doc.sha256Hash ?? "—"],
    ["MIME Type", doc.mimeType ?? "—"],
    ["File Size", doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "—"],
    ["Page Count", doc.pageCount ?? "—"],
    ["Snapshot ID", doc.snapshotId ?? "—"],
    ["Created", doc.createdAt ? new Date(doc.createdAt).toLocaleString() : "—"],
    ["Error", doc.errorMessage ?? "—"],
  ];

  return (
    <div className="space-y-1.5 text-sm">
      {fields.map(([label, value]) => (
        <div key={label as string} className="flex gap-3">
          <span className="text-muted-foreground w-32 shrink-0 text-right">{label as string}</span>
          <span className="font-mono text-xs break-all">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}