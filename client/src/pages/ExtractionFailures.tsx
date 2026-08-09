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
import { useLocation } from "wouter";
import {
  ArrowLeft, AlertTriangle, FileText,
  Loader2, MoreVertical, Eye, Ban, FileX, Replace, Shield,
  CheckCircle2, Upload, ChevronRight,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import ReplaceDocumentModalV2 from "@/components/ReplaceDocumentModalV2";

type ModalState =
  | { type: "none" }
  | { type: "corrupted"; docId: number; docName: string }
  | { type: "excluded"; docId: number; docName: string }
  | { type: "replace"; docId: number; docName: string }
  | { type: "metadata"; docId: number; docName: string };

export default function ExtractionFailures() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  // Fetch all documents for this case
  const { data: docs, isLoading } = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const { data: intakeIntegrity, isLoading: integrityLoading } = trpc.analyze.getIntakeIntegrityProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000 }
  );

  const integrityByDocumentId = useMemo(() => new Map(
    (intakeIntegrity?.artifacts ?? [])
      .filter(artifact => artifact.legacy_document_id !== null)
      .map(artifact => [artifact.legacy_document_id!, artifact]),
  ), [intakeIntegrity]);

  // Canonical Layer 3 exceptions only. Legacy analyzer errors are historical
  // state and are not a second evidence-integrity authority.
  const failedDocs = useMemo(() => {
    if (!docs) return [];
    return docs.filter((d) => {
      const isActive = (d as any).documentResolution === "active" || !(d as any).documentResolution;
      const integrityStatus = integrityByDocumentId.get(d.id)?.integrity_status;
      return isActive && (integrityStatus === "quarantined" || integrityStatus === "referenced_missing");
    });
  }, [docs, integrityByDocumentId]);


  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return failedDocs;
    const q = search.toLowerCase();
    return failedDocs.filter(
      (d) =>
        d.filename.toLowerCase().includes(q) ||
        integrityByDocumentId.get(d.id)?.unresolved_dependencies.some(dependency =>
          JSON.stringify(dependency).toLowerCase().includes(q)
        )
    );
  }, [failedDocs, search, integrityByDocumentId]);

  // ── Mutations ──

  const markCorruptedMutation = trpc.documents.markCorrupted.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Document marked as corrupted`);
      setModal({ type: "none" });
      setReason("");
      utils.documents.list.invalidate();
      utils.analyze.getIntakeIntegrityProjection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markExcludedMutation = trpc.documents.markExcluded.useMutation({
    onSuccess: () => {
      toast.success(`Document marked as excluded`);
      setModal({ type: "none" });
      setReason("");
      utils.documents.list.invalidate();
      utils.analyze.getIntakeIntegrityProjection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmitCorrupted = () => {
    if (modal.type !== "corrupted") return;
    markCorruptedMutation.mutate({
      documentId: modal.docId,
      reason: reason.trim(),
    });
  };

  const handleSubmitExcluded = () => {
    if (modal.type !== "excluded") return;
    markExcludedMutation.mutate({
      documentId: modal.docId,
      reason: reason.trim(),
    });
  };


  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>
          Manage Cases
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/documents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Evidence Integrity Exceptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {failedDocs.length} blocked canonical source{failedDocs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/upload")} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Upload Replacement
        </Button>
      </div>

      {intakeIntegrity?.projection_state === "blocked" && (
        <Card className="border-red-500/30 bg-red-950/20">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div className="text-sm text-red-200/80 flex-1">
              <strong>Canonical preservation is blocked.</strong> These source-byte verification
              exceptions block governed downstream projections. Replace the source or explicitly
              resolve it as corrupted/excluded.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !integrityLoading && failedDocs.length === 0 && (
        <Card className="border-emerald-500/30 bg-emerald-950/20">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-200">No canonical integrity exceptions</p>
              <p className="text-xs text-muted-foreground mt-1">
                {intakeIntegrity?.projection_state === "not_run"
                  ? "Sources are registered; preservation verification will occur in the explicit governed Intake Spine run."
                  : "All projected source artifacts are preservation-verified or explicitly resolved."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/documents")}>
              Back to Documents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      {failedDocs.length > 0 && (
        <div className="relative">
          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename or integrity exception..."
            className="pl-9"
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-md animate-pulse" />
          ))}
        </div>
      )}

      {/* Document list */}
      <div className="space-y-2">
        {filtered.map((doc) => (
          <Card key={doc.id} className="border-red-500/20 hover:border-red-500/40 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="h-9 w-9 rounded-md bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FileX className="h-4 w-4 text-red-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{doc.filename}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        doc.status === "failed_permanent"
                          ? "text-red-400 border-red-500/30"
                          : "text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {doc.status === "failed_permanent" ? "permanent failure" : "error"}
                    </Badge>
                  </div>

                  {/* Error message */}
                  {doc.errorMessage && (
                    <p className="text-xs text-red-300/70 mt-1 line-clamp-2">
                      {doc.errorMessage}
                    </p>
                  )}

                  {/* Metadata row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{doc.id}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {doc.sha256Hash.slice(0, 12)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(doc.fileSize / 1024).toFixed(1)} KB
                    </span>
                    {doc.retryCount > 0 && (
                      <span className="text-[10px] text-amber-400">
                        {doc.retryCount} retries
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* More actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          setModal({ type: "replace", docId: doc.id, docName: doc.filename });
                          setReason("");
                        }}
                        className="gap-2"
                      >
                        <Replace className="h-4 w-4 text-cyan-400" />
                        <div>
                          <p className="font-medium">Replace Document</p>
                          <p className="text-[10px] text-muted-foreground">Supersede with another doc</p>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => {
                          setModal({ type: "corrupted", docId: doc.id, docName: doc.filename });
                          setReason("");
                        }}
                        className="gap-2"
                      >
                        <FileX className="h-4 w-4 text-red-400" />
                        <div>
                          <p className="font-medium text-red-300">Mark Corrupted</p>
                          <p className="text-[10px] text-muted-foreground">Remove from active corpus</p>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => {
                          setModal({ type: "excluded", docId: doc.id, docName: doc.filename });
                          setReason("");
                        }}
                        className="gap-2"
                      >
                        <Ban className="h-4 w-4 text-amber-400" />
                        <div>
                          <p className="font-medium text-amber-300">Mark Excluded</p>
                          <p className="text-[10px] text-muted-foreground">Exclude from analysis</p>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() =>
                          setModal({ type: "metadata", docId: doc.id, docName: doc.filename })
                        }
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">View Metadata</p>
                          <p className="text-[10px] text-muted-foreground">Full document details</p>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => setLocation(`/documents/${doc.id}`)}
                        className="gap-2"
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Open Document Detail</p>
                          <p className="text-[10px] text-muted-foreground">Full document view</p>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Mark Corrupted Modal ── */}
      <Dialog
        open={modal.type === "corrupted"}
        onOpenChange={(open) => {
          if (!open) setModal({ type: "none" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <FileX className="h-5 w-5" />
              Mark as Corrupted
            </DialogTitle>
            <DialogDescription>
              This removes <strong>{modal.type === "corrupted" ? modal.docName : ""}</strong> from
              the active source set. It will no longer block canonical preservation integrity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Reason (minimum 10 characters)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why this document is corrupted..."
                className="mt-1.5"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {reason.trim().length}/10 characters minimum
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModal({ type: "none" })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 10 || markCorruptedMutation.isPending}
              onClick={handleSubmitCorrupted}
              className="gap-2"
            >
              {markCorruptedMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileX className="h-4 w-4" />
              )}
              Mark Corrupted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mark Excluded Modal ── */}
      <Dialog
        open={modal.type === "excluded"}
        onOpenChange={(open) => {
          if (!open) setModal({ type: "none" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-300">
              <Ban className="h-5 w-5" />
              Mark as Excluded
            </DialogTitle>
            <DialogDescription>
              This excludes <strong>{modal.type === "excluded" ? modal.docName : ""}</strong> from
              governed execution. It will no longer participate in canonical projections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Reason (minimum 10 characters)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why this document should be excluded..."
                className="mt-1.5"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {reason.trim().length}/10 characters minimum
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModal({ type: "none" })}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={reason.trim().length < 10 || markExcludedMutation.isPending}
              onClick={handleSubmitExcluded}
            >
              {markExcludedMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              Mark Excluded
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Replace Document Modal (Canonical V2) ── */}
      <ReplaceDocumentModalV2
        open={modal.type === "replace"}
        onClose={() => setModal({ type: "none" })}
        documentId={modal.type === "replace" ? modal.docId : 0}
        documentName={modal.type === "replace" ? modal.docName : ""}
        onSuccess={() => {
          utils.documents.list.invalidate();
          utils.analyze.getIntakeIntegrityProjection.invalidate();
          utils.analyze.getIntakeSpineStatus.invalidate();
        }}
      />

      {/* ── Metadata Modal ── */}
      <MetadataModal
        open={modal.type === "metadata"}
        docId={modal.type === "metadata" ? modal.docId : 0}
        onClose={() => setModal({ type: "none" })}
      />
    </div>
  );
}

function MetadataModal({
  open,
  docId,
  onClose,
}: {
  open: boolean;
  docId: number;
  onClose: () => void;
}) {
  const { data: doc } = trpc.documents.get.useQuery(
    { id: docId },
    { enabled: open && docId > 0 }
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            Document Metadata
          </DialogTitle>
        </DialogHeader>
        {doc ? (
          <div className="space-y-3 py-2">
            <MetaRow label="ID" value={`#${doc.id}`} />
            <MetaRow label="Filename" value={doc.filename} />
            <MetaRow label="File Type" value={doc.fileType} />
            <MetaRow label="Size" value={`${(doc.fileSize / 1024).toFixed(1)} KB`} />
            <MetaRow label="Status" value={doc.status} />
            <MetaRow label="Resolution" value={(doc as any).documentResolution ?? "active"} />
            <MetaRow label="SHA-256" value={doc.sha256Hash} mono />
            <MetaRow label="Retry Count" value={String(doc.retryCount)} />
            <MetaRow label="Page Count" value={doc.pageCount ? String(doc.pageCount) : "—"} />
            <MetaRow label="Created" value={new Date(doc.createdAt).toLocaleString()} />
            {doc.errorMessage && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Error Message
                </p>
                <div className="p-2 rounded bg-red-950/20 border border-red-500/20">
                  <p className="text-xs text-red-300/80 whitespace-pre-wrap">{doc.errorMessage}</p>
                </div>
              </div>
            )}
            {(doc as any).resolutionReason && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Resolution Reason
                </p>
                <div className="p-2 rounded bg-muted/30">
                  <p className="text-xs text-foreground/80">{(doc as any).resolutionReason}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={`text-xs text-foreground text-right break-all ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
