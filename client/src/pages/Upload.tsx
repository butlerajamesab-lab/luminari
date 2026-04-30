import { useCase } from "@/contexts/CaseContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { Upload as UploadIcon, FileText, CheckCircle, XCircle, X, Loader2, AlertTriangle, Lock, Shield, Clock, Timer, Link2, Info, RefreshCw } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type UploadResult = {
  filename: string;
  status: "pending" | "uploading" | "done" | "error" | "duplicate" | "replaced";
  error?: string;
  message?: string;
  id?: number;
  /** The existing document ID this file was linked to (server-side dedup) */
  linkedToId?: number;
  /** When a resolved/failed doc was overridden, the new document ID */
  replacedDocId?: number;
  /** Info about the resolved original that was overridden */
  resolvedOriginal?: { documentId: number; resolution: string; status: string };
};

type UploadSummary = {
  total: number;
  uploaded: number;
  duplicates: number;
  errors: number;
  overrides: number;
  caseDocumentCount: number;
  caseId: number;
};

/**
 * Upload Session History — shows recent upload sessions for the current case.
 * Displays status, progress, and timestamps. Expired sessions are clearly marked.
 */
function UploadSessionHistory({ caseId }: { caseId: number }) {
  const { data: sessions, isLoading } = trpc.uploadSessions.list.useQuery(
    { caseId },
    { refetchInterval: 5000 },
  );

  if (isLoading || !sessions || sessions.length === 0) return null;

  const statusIcon = (status: string) => {
    switch (status) {
      case "uploading": return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
      case "processing": return <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />;
      case "complete": return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-red-400" />;
      case "expired": return <Timer className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "uploading": return "Uploading";
      case "processing": return "Processing";
      case "complete": return "Complete";
      case "failed": return "Failed";
      case "expired": return "Expired (stale)";
      default: return status;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "uploading": return "text-primary";
      case "processing": return "text-amber-400";
      case "complete": return "text-emerald-400";
      case "failed": return "text-red-400";
      case "expired": return "text-muted-foreground";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Recent Upload Sessions
      </h2>
      <div className="space-y-2">
        {sessions.map(session => {
          const processed = session.completedFiles + session.failedFiles + session.duplicateFiles;
          const pct = session.totalFiles > 0 ? Math.round((processed / session.totalFiles) * 100) : 0;
          const time = new Date(session.updatedAt).toLocaleString();

          return (
            <Card key={session.id} className={`border-border/50 ${session.status === "expired" ? "opacity-60" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {statusIcon(session.status)}
                    <span className={`text-xs font-medium ${statusColor(session.status)}`}>
                      {statusLabel(session.status)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Session #{session.id}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{time}</span>
                </div>
                <Progress value={pct} className="h-1 mb-1" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {session.completedFiles} new
                    {session.duplicateFiles > 0 && ` · ${session.duplicateFiles} linked`}
                    {session.failedFiles > 0 && ` · ${session.failedFiles} failed`}
                  </span>
                  <span>{processed}/{session.totalFiles}</span>
                </div>
                {session.status === "expired" && (
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    This session was automatically expired due to inactivity.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Row-level status indicator with explicit state labeling */
function FileRowStatus({ result }: { result: UploadResult }) {
  switch (result.status) {
    case "pending":
      return (
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground">Queued</span>
        </div>
      );
    case "uploading":
      return (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          <span className="text-[10px] text-primary">Uploading…</span>
        </div>
      );
    case "done":
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-400 font-medium">New Document Created</span>
        </div>
      );
    case "duplicate":
      return (
        <div className="flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="text-[10px] text-cyan-400 font-medium">
            Duplicate Linked{result.linkedToId ? ` to Document ID ${result.linkedToId}` : ""}
          </span>
          {result.resolvedOriginal && (
            <span className="text-[10px] text-amber-400">
              (original was {result.resolvedOriginal.resolution} — sealed snapshot blocked override)
            </span>
          )}
        </div>
      );
    case "replaced":
      return (
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-400 font-medium">
            Override: Replaced resolved doc{result.replacedDocId ? ` #${result.replacedDocId}` : ""}
          </span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-[10px] text-red-400 font-medium">Error</span>
        </div>
      );
    default:
      return null;
  }
}

/** Tranche decision banner — contextual feedback based on upload outcome mix */
function TrancheBanner({ results }: { results: UploadResult[] }) {
  const finished = results.filter(r => r.status === "done" || r.status === "duplicate" || r.status === "error");
  if (finished.length === 0) return null;

  const newCount = results.filter(r => r.status === "done").length;
  const dupCount = results.filter(r => r.status === "duplicate").length;
  const errCount = results.filter(r => r.status === "error").length;
  const allDuplicates = dupCount > 0 && newCount === 0 && errCount === 0;
  const mixed = newCount > 0 && dupCount > 0;

  if (allDuplicates) {
    return (
      <div className="p-3 rounded-md border border-cyan-500/30 bg-cyan-500/5 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-cyan-400">All selected files already exist in this case.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dupCount} file{dupCount !== 1 ? "s" : ""} linked to existing documents. No new documents were created.
          </p>
        </div>
      </div>
    );
  }

  if (mixed) {
    return (
      <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {newCount} new document{newCount !== 1 ? "s" : ""} added. {dupCount} duplicate{dupCount !== 1 ? "s" : ""} linked.
          </p>
          {errCount > 0 && (
            <p className="text-xs text-red-400 mt-0.5">
              {errCount} file{errCount !== 1 ? "s" : ""} failed — review errors below.
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function Upload() {
  const { currentCaseId, currentCase } = useCase();
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const analyzeAll = trpc.documents.analyzeAll.useMutation();

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles(prev => [...prev, ...arr]);
    setResults(prev => [...prev, ...arr.map(f => ({ filename: f.name, status: "pending" as const }))]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setResults(prev => prev.filter((_, i) => i !== index));
  }, []);

  // File-size-aware chunking: >5MB files upload individually, ≤5MB group into batches of 3-5
  const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
  const SMALL_BATCH_SIZE = 5;
  const MAX_FILES_PER_REQUEST = 50; // Must match server-side MAX_BATCH_SIZE

  const buildUploadBatches = (fileList: File[]): { files: File[]; indices: number[] }[] => {
    const batches: { files: File[]; indices: number[] }[] = [];
    let smallBatch: { files: File[]; indices: number[] } = { files: [], indices: [] };

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.size > LARGE_FILE_THRESHOLD) {
        // Flush any pending small batch first
        if (smallBatch.files.length > 0) {
          batches.push(smallBatch);
          smallBatch = { files: [], indices: [] };
        }
        // Large file goes solo
        batches.push({ files: [f], indices: [i] });
      } else {
        smallBatch.files.push(f);
        smallBatch.indices.push(i);
        if (smallBatch.files.length >= SMALL_BATCH_SIZE) {
          batches.push(smallBatch);
          smallBatch = { files: [], indices: [] };
        }
      }
    }
    // Flush remaining small files
    if (smallBatch.files.length > 0) {
      batches.push(smallBatch);
    }
    return batches;
  };

  const createSession = trpc.uploadSessions.create.useMutation();
  const finalizeSession = trpc.uploadSessions.finalize.useMutation();

  const startUpload = async () => {
    if (!currentCaseId || files.length === 0) return;

    // Client-side batch cap check
    if (files.length > MAX_FILES_PER_REQUEST * 10) {
      toast.error(`Too many files (${files.length}). Maximum recommended is ${MAX_FILES_PER_REQUEST * 10} files total.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    const batches = buildUploadBatches(files);
    let completed = 0;
    let lastSummary: UploadSummary | null = null;

    // ── Create server-side upload session for multi-batch persistence ──
    let sessionId: number | null = null;
    if (batches.length > 1) {
      try {
        const result = await createSession.mutateAsync({
          caseId: currentCaseId,
          totalFiles: files.length,
        });
        sessionId = result.sessionId;
        // Persist to localStorage for navigation recovery
        const stored = JSON.parse(localStorage.getItem("activeUploadSessionIds") || "[]");
        stored.push(sessionId);
        localStorage.setItem("activeUploadSessionIds", JSON.stringify(stored));
        // Invalidate active sessions query so GlobalUploadIndicator picks it up
        utils.uploadSessions.getActive.invalidate();
      } catch {
        // Non-critical — upload still works without session tracking
      }
    }

    for (const batch of batches) {
      const formData = new FormData();
      // caseId is injected from the locked case context — not user-editable
      formData.append("caseId", currentCaseId.toString());
      if (sessionId) formData.append("sessionId", sessionId.toString());
      batch.files.forEach(f => formData.append("files", f));

      // Mark batch as uploading
      setResults(prev => prev.map((r, idx) =>
        batch.indices.includes(idx) ? { ...r, status: "uploading" } : r
      ));

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        // Safely parse response — proxy/nginx may return HTML on timeout or 413
        let data: any;
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          // Non-JSON response (likely proxy error page)
          const text = await res.text();
          const statusMsg = res.status === 413
            ? "Files too large — try uploading fewer files per batch"
            : res.status === 502 || res.status === 504
            ? "Server timeout — try uploading fewer files per batch"
            : `Server error (${res.status}): ${text.slice(0, 100)}`;
          throw new Error(statusMsg);
        }

        try {
          data = await res.json();
        } catch {
          throw new Error("Failed to parse server response");
        }

        if (!res.ok) {
          // Handle BATCH_LIMIT_EXCEEDED specifically
          if (data.error === "BATCH_LIMIT_EXCEEDED") {
            throw new Error(`Batch limit exceeded: max ${data.maxAllowed} files per request`);
          }
          throw new Error(data.error || "Upload failed");
        }

        // Capture summary from last batch
        if (data.summary) {
          lastSummary = data.summary;
        }

        // Mark results with explicit status differentiation
        setResults(prev => prev.map((r, idx) => {
          const batchPos = batch.indices.indexOf(idx);
          if (batchPos >= 0) {
            const docResult = data.documents?.[batchPos];
            if (docResult?.error) return { ...r, status: "error", error: docResult.error };
            if (docResult?.status === "duplicate") {
              return {
                ...r,
                status: "duplicate",
                message: docResult.message,
                id: docResult.id,
                linkedToId: docResult.id,
                resolvedOriginal: docResult.resolvedOriginal,
              };
            }
            // Scoped override: resolved/failed doc was replaced
            if (docResult?.status === "uploaded" && docResult?.message?.startsWith("Replaced resolved")) {
              return {
                ...r,
                status: "replaced",
                id: docResult.id,
                message: docResult.message,
                replacedDocId: docResult.replacedDocId,
              };
            }
            return { ...r, status: "done", id: docResult?.id };
          }
          return r;
        }));

        completed += batch.files.length;
        setProgress(Math.round((completed / files.length) * 100));
      } catch (err: any) {
        setResults(prev => prev.map((r, idx) =>
          batch.indices.includes(idx) ? { ...r, status: "error", error: err.message } : r
        ));
        completed += batch.files.length;
        setProgress(Math.round((completed / files.length) * 100));
      }
    }

    // ── Finalize upload session ──
    if (sessionId) {
      try {
        await finalizeSession.mutateAsync({ sessionId });
        // Clean up localStorage
        const stored = JSON.parse(localStorage.getItem("activeUploadSessionIds") || "[]") as number[];
        const updated = stored.filter(id => id !== sessionId);
        if (updated.length > 0) {
          localStorage.setItem("activeUploadSessionIds", JSON.stringify(updated));
        } else {
          localStorage.removeItem("activeUploadSessionIds");
        }
        utils.uploadSessions.getActive.invalidate();
      } catch {
        // Non-critical
      }
    }

    setUploading(false);
    utils.documents.list.invalidate();
    utils.cases.stats.invalidate();

    // Show blocking summary modal
    if (lastSummary) {
      setSummary(lastSummary);
      setShowSummary(true);
    } else {
      toast.success(`Upload complete: ${files.length} file(s) processed`);
    }

    // Auto-trigger analysis for uploaded documents
    try {
      await analyzeAll.mutateAsync({ caseId: currentCaseId });
      toast.info("AI analysis started — documents will be processed in the background.");
    } catch {
      // Non-critical — user can trigger manually
    }
  };

  const handleSummaryClose = () => {
    setShowSummary(false);
    setSummary(null);
  };

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const totalDone = results.filter(r => r.status === "done").length;
  const totalDuplicates = results.filter(r => r.status === "duplicate").length;
  const totalErrors = results.filter(r => r.status === "error").length;
  const uploadFinished = !uploading && results.length > 0 && results.every(r => r.status !== "pending" && r.status !== "uploading");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload Evidence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drag files or click to select. Supports PDF, images, audio, and video.
        </p>
      </div>

      {/* ── Case Lock Indicator ── */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Uploading to: <span className="text-primary">{currentCase?.name || `Case #${currentCaseId}`}</span>
              <span className="text-xs text-muted-foreground ml-2">(locked)</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              All files will be linked to this case. To change, select a different case from the sidebar.
            </p>
          </div>
          <Shield className="h-4 w-4 text-primary/50 shrink-0" />
        </CardContent>
      </Card>

      {/* Drop Zone */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mov,.webm,.mp3,.wav,.ogg,.m4a"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <UploadIcon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-foreground font-medium">Drop files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, images, audio, video — up to 100MB each</p>
      </div>

      {/* File List */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{results.length} file(s) selected</p>
            <div className="flex gap-2">
              {!uploading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setFiles([]); setResults([]); setProgress(0); }}
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                onClick={startUpload}
                disabled={uploading || results.every(r => r.status === "done" || r.status === "duplicate")}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
                {uploading ? "Uploading..." : "Upload All"}
              </Button>
            </div>
          </div>

          {uploading && <Progress value={progress} className="h-1.5" />}

          {/* ── Tranche Decision Banner (shown after upload completes) ── */}
          {uploadFinished && <TrancheBanner results={results} />}

          {/* ── Inline Summary Counters (shown after upload completes) ── */}
          {uploadFinished && (
            <div className="flex items-center gap-4 text-xs" data-testid="upload-inline-summary">
              <span className="text-muted-foreground">Files Selected: <span className="text-foreground font-medium">{results.length}</span></span>
              <span className="text-emerald-400">New: <span className="font-medium">{totalDone}</span></span>
              <span className="text-cyan-400">Linked: <span className="font-medium">{totalDuplicates}</span></span>
              <span className={totalErrors > 0 ? "text-red-400" : "text-muted-foreground"}>Errors: <span className="font-medium">{totalErrors}</span></span>
            </div>
          )}

          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-2 rounded-md ${
                r.status === "done" ? "bg-emerald-500/5" :
                r.status === "duplicate" ? "bg-cyan-500/5" :
                r.status === "error" ? "bg-red-500/5" :
                "bg-muted/30"
              }`}>
                <FileRowStatus result={r} />
                <span className="text-sm truncate flex-1">{r.filename}</span>
                {r.status === "error" && r.error && (
                  <span className="text-[10px] text-red-400 shrink-0 max-w-[200px] truncate">{r.error}</span>
                )}
                {(r.status === "done" || r.status === "duplicate") && r.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => setLocation(`/documents/${r.id}`)}
                  >
                    View
                  </Button>
                )}
                {r.status === "pending" && !uploading && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload Session History ── */}
      <UploadSessionHistory caseId={currentCaseId} />

      {/* ── Batch Upload Summary Modal (Blocking) ── */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Upload Summary
            </DialogTitle>
            <DialogDescription>
              Tranche report for {currentCase?.name || `Case #${currentCaseId}`}
            </DialogDescription>
          </DialogHeader>

          {summary && (
            <div className="space-y-4 py-2">
              {/* ── Explicit Summary Grid ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
                  <span className="text-sm text-muted-foreground">Files Selected</span>
                  <span className="text-sm font-bold text-foreground">{summary.total}</span>
                </div>
                <div className={`flex items-center justify-between p-2.5 rounded-md ${summary.uploaded > 0 ? "bg-emerald-500/10" : "bg-muted/50"}`}>
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    New Documents Created
                  </span>
                  <span className={`text-sm font-bold ${summary.uploaded > 0 ? "text-emerald-400" : "text-foreground"}`}>{summary.uploaded}</span>
                </div>
                <div className={`flex items-center justify-between p-2.5 rounded-md ${summary.duplicates > 0 ? "bg-cyan-500/10" : "bg-muted/50"}`}>
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                    Duplicates Linked
                  </span>
                  <span className={`text-sm font-bold ${summary.duplicates > 0 ? "text-cyan-400" : "text-foreground"}`}>{summary.duplicates}</span>
                </div>
                {(summary.overrides ?? 0) > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-teal-500/10">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-teal-400" />
                      Resolved Docs Overridden
                    </span>
                    <span className="text-sm font-bold text-teal-400">{summary.overrides}</span>
                  </div>
                )}
                <div className={`flex items-center justify-between p-2.5 rounded-md ${summary.errors > 0 ? "bg-red-500/10" : "bg-muted/50"}`}>
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    Errors
                  </span>
                  <span className={`text-sm font-bold ${summary.errors > 0 ? "text-red-400" : "text-foreground"}`}>{summary.errors}</span>
                </div>
              </div>

              {/* ── Tranche Decision Banner in Modal ── */}
              {summary.uploaded === 0 && summary.duplicates > 0 && summary.errors === 0 && (
                <div className="p-3 rounded-md border border-cyan-500/30 bg-cyan-500/5 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-cyan-400">All selected files already exist in this case.</p>
                </div>
              )}
              {summary.uploaded > 0 && summary.duplicates > 0 && (
                <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">
                    {summary.uploaded} new document{summary.uploaded !== 1 ? "s" : ""} added. {summary.duplicates} duplicate{summary.duplicates !== 1 ? "s" : ""} linked.
                  </p>
                </div>
              )}

              {/* Linkage Verification */}
              <div className={`p-3 rounded-md border ${
                summary.caseDocumentCount > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
              }`}>
                <div className="flex items-center gap-2">
                  {summary.caseDocumentCount > 0 ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  )}
                  <p className="text-sm font-medium text-foreground">
                    {summary.caseDocumentCount > 0
                      ? `${summary.caseDocumentCount} total document(s) in this case`
                      : "Warning: No documents linked to this case"
                    }
                  </p>
                </div>
                {summary.caseDocumentCount === 0 && (
                  <p className="text-xs text-red-400 mt-1 ml-6">
                    Upload completed but no documents were linked. Check for errors above.
                  </p>
                )}
              </div>

              {/* Error detail prompt */}
              {summary.errors > 0 && (
                <div className="p-3 rounded-md border border-red-500/30 bg-red-500/5">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <p className="text-sm font-medium text-red-400">
                      {summary.errors} file(s) failed to upload
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Review the file list for specific error details.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleSummaryClose}>
              Close
            </Button>
            <Button onClick={() => { handleSummaryClose(); setLocation("/documents"); }}>
              View Documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
