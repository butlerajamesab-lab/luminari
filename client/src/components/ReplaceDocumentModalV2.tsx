/**
 * ReplaceDocumentModalV2 — Canonical Replace Document Modal
 *
 * Single source of truth for all Replace actions across the application.
 * Invoked from: Integrity Dashboard, Document Detail, Extraction Failure Inspector,
 *               Documents list overflow menu, Upload duplicate confirmation.
 *
 * Features:
 * - Snapshot state pre-check (SEALED blocks modal with deterministic banner)
 * - Dual-mode: Select Existing Document OR Upload Replacement File
 * - Displays Snapshot ID, status, and GateStage
 * - Consistent behavior regardless of navigation origin
 */

import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Replace, Upload, RefreshCw, FileText, Loader2,
  XCircle, Link2, Shield, ShieldAlert, Lock, AlertTriangle,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";

export interface ReplaceDocumentModalV2Props {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** The document ID being replaced */
  documentId: number;
  /** The document filename (for display) */
  documentName: string;
  /** Optional callback after successful replacement */
  onSuccess?: (result: { replacementDocumentId: number }) => void;
}

export default function ReplaceDocumentModalV2({
  open,
  onClose,
  documentId,
  documentName,
  onSuccess,
}: ReplaceDocumentModalV2Props) {
  const { currentCaseId } = useCase();
  const utils = trpc.useUtils();

  // ── Local State ──
  const [mode, setMode] = useState<"select" | "upload">("select");
  const [replacementDocId, setReplacementDocId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setMode("select");
      setReplacementDocId("");
      setReason("");
      setReplaceFile(null);
      setUploading(false);
    }
  }, [open]);

  // ── Snapshot Lifecycle ──
  const { data: lifecycle } = trpc.snapshots.lifecycle.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId && open, refetchInterval: 5000 }
  );

  const isSealed = lifecycle?.hasSnapshot && lifecycle?.status === "sealed";
  const isOpen = lifecycle?.hasSnapshot && lifecycle?.status === "open";
  const snapshotId = lifecycle?.hasSnapshot ? lifecycle.snapshotId : null;
  const gateStage = lifecycle?.hasSnapshot ? (lifecycle as any).currentStage : null;

  // ── Replacement Candidates ──
  const { data: docs } = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId && open }
  );

  const replacementCandidates = useMemo(() => {
    if (!docs) return [];
    return docs.filter((d) => {
      const res = (d as any).documentResolution;
      return (!res || res === "active") && d.status === "ready" && d.id !== documentId;
    });
  }, [docs, documentId]);

  // ── Mutations ──
  const replaceMutation = trpc.documents.replaceDocument.useMutation({
    onSuccess: (data) => {
      toast.success(`Document superseded → linked to replacement #${data.replacementDocumentId}`);
      invalidateAll();
      onSuccess?.({ replacementDocumentId: data.replacementDocumentId });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const invalidateAll = useCallback(() => {
    utils.documents.list.invalidate();
    utils.documents.get.invalidate();
    utils.documents.listResolved.invalidate();
    utils.documents.reanalyzeScopeSummary.invalidate();
    utils.documents.replacementChain.invalidate();
    utils.snapshots.lifecycle.invalidate();
  }, [utils]);

  // ── Handlers ──
  const handleSelectReplace = () => {
    if (!replacementDocId) return;
    replaceMutation.mutate({
      originalDocumentId: documentId,
      replacementDocumentId: parseInt(replacementDocId),
      reason: reason.trim() || `Replaced via Replace Modal`,
    });
  };

  const handleUploadReplace = async () => {
    if (!replaceFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", replaceFile);
      const res = await fetch(`/api/upload/replace/${documentId}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Replacement upload failed");
      }
      toast.success(
        `Replaced document #${documentId} → new document #${data.newDocumentId} — extraction queued`
      );
      invalidateAll();
      onSuccess?.({ replacementDocumentId: data.newDocumentId });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mov,.webm,.mp3,.wav,.ogg,.m4a";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) setReplaceFile(f);
    };
    input.click();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="replace-document-modal-v2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-300">
            <Replace className="h-5 w-5" />
            Replace Document
          </DialogTitle>
          <DialogDescription>
            Supersede <strong>{documentName}</strong>. The original will be marked as
            superseded and linked to the replacement document.
          </DialogDescription>
        </DialogHeader>

        {/* ── Snapshot State Banner ── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
          <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 text-xs text-muted-foreground">
            {snapshotId ? (
              <span>
                Snapshot <span className="font-mono">#{snapshotId}</span>
                {" · "}
                <span className={isSealed ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
                  {isSealed ? "SEALED" : "OPEN"}
                </span>
                {gateStage && (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">Stage: {gateStage}</span>
                  </>
                )}
              </span>
            ) : (
              <span>No active snapshot</span>
            )}
          </div>
        </div>

        {/* ── SEALED State Block ── */}
        {isSealed ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-md bg-red-950/20 border border-red-500/30">
              <Lock className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">
                  Snapshot sealed. Replacement requires new snapshot version.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The current snapshot is sealed and immutable. To replace documents, create a new
                  snapshot version first.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {/* ── Mode Tabs ── */}
            <div className="flex gap-1 p-0.5 rounded-md bg-muted/50">
              <button
                className={`flex-1 text-xs font-medium py-1.5 px-3 rounded transition-colors ${
                  mode === "select"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("select")}
              >
                Select Existing
              </button>
              <button
                className={`flex-1 text-xs font-medium py-1.5 px-3 rounded transition-colors ${
                  mode === "upload"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("upload")}
              >
                Upload Replacement
              </button>
            </div>

            <div className="space-y-3 py-1">
              {mode === "select" ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Select Replacement Document
                    </label>
                    {replacementCandidates.length === 0 ? (
                      <div className="mt-1.5 p-3 rounded-md border border-dashed border-muted-foreground/30 text-center">
                        <p className="text-xs text-muted-foreground">
                          No ready documents available as replacements.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-1.5"
                          onClick={() => setMode("upload")}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload Instead
                        </Button>
                      </div>
                    ) : (
                      <Select value={replacementDocId} onValueChange={setReplacementDocId}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Choose a ready document..." />
                        </SelectTrigger>
                        <SelectContent>
                          {replacementCandidates.map((d) => (
                            <SelectItem key={d.id} value={d.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span className="truncate">{d.filename}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  #{d.id}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Reason (optional)
                    </label>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this document being replaced..."
                      className="mt-1.5"
                      rows={2}
                    />
                  </div>

                  {replacementDocId && (
                    <div className="p-3 rounded-md bg-cyan-950/20 border border-cyan-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-cyan-200 font-medium">Replacement Chain</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {documentName}{" "}
                        <span className="text-red-300">(superseded)</span> →{" "}
                        {replacementCandidates.find(
                          (d) => d.id === parseInt(replacementDocId)
                        )?.filename}{" "}
                        <span className="text-emerald-300">(active)</span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Upload Replacement File Mode */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Upload Replacement File
                    </label>
                    <div
                      className="mt-1.5 p-4 rounded-md border-2 border-dashed border-muted-foreground/30 text-center cursor-pointer hover:border-cyan-500/50 transition-colors"
                      onClick={handleFileSelect}
                    >
                      {replaceFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <FileText className="h-4 w-4 text-cyan-400" />
                          <span className="text-sm text-foreground">{replaceFile.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({(replaceFile.size / 1024).toFixed(1)} KB)
                          </span>
                          <button
                            className="ml-2 text-muted-foreground hover:text-red-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplaceFile(null);
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
                          <p className="text-xs text-muted-foreground">
                            Click to select a replacement file
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {replaceFile && (
                    <div className="p-3 rounded-md bg-cyan-950/20 border border-cyan-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-cyan-200 font-medium">Replacement Chain</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {documentName}{" "}
                        <span className="text-red-300">(superseded)</span> →{" "}
                        {replaceFile.name}{" "}
                        <span className="text-emerald-300">(new upload)</span>
                      </p>
                    </div>
                  )}

                  <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground">
                      The uploaded file will create a new document, supersede the original, link the
                      replacement chain, log an audit entry, and trigger extraction automatically.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* ── Footer Actions ── */}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {mode === "select" ? (
                <Button
                  className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
                  disabled={!replacementDocId || replaceMutation.isPending}
                  onClick={handleSelectReplace}
                >
                  {replaceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Replace className="h-4 w-4" />
                  )}
                  Replace & Supersede
                </Button>
              ) : (
                <Button
                  className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
                  disabled={!replaceFile || uploading}
                  onClick={handleUploadReplace}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload & Replace
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
