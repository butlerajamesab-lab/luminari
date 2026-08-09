import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  Replace,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ReplaceDocumentModalV2 from "@/components/ReplaceDocumentModalV2";

type ResolutionModal =
  | { type: "none" }
  | { type: "replace"; docId: number; docName: string }
  | { type: "corrupted" | "excluded"; docId: number; docName: string };

function Metric({ label, value, tone = "default" }: {
  label: string;
  value: number;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default function IntegrityDashboard() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<ResolutionModal>({ type: "none" });
  const [reason, setReason] = useState("");

  const integrity = trpc.analyze.getIntakeIntegrityProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000, retry: false },
  );
  const documents = trpc.documents.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId },
  );

  const documentById = useMemo(
    () => new Map((documents.data ?? []).map(document => [document.id, document])),
    [documents.data],
  );

  const invalidate = () => {
    void utils.documents.list.invalidate();
    void utils.documents.listResolved.invalidate();
    void utils.analyze.getIntakeIntegrityProjection.invalidate();
    void utils.analyze.getIntakeSpineStatus.invalidate();
  };

  const markCorrupted = trpc.documents.markCorrupted.useMutation({
    onSuccess: () => {
      toast.success("Source marked corrupted");
      setModal({ type: "none" });
      setReason("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const markExcluded = trpc.documents.markExcluded.useMutation({
    onSuccess: () => {
      toast.success("Source excluded from governed execution");
      setModal({ type: "none" });
      setReason("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (!currentCaseId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  if (integrity.isLoading || documents.isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (integrity.error || !integrity.data) {
    return (
      <Card className="border-red-500/30 bg-red-950/20">
        <CardContent className="p-6 text-sm text-red-300">
          Canonical evidence-integrity state is unavailable. No legacy snapshot state was substituted.
        </CardContent>
      </Card>
    );
  }

  const projection = integrity.data;
  const pendingCount = projection.source_artifact_count - projection.projected_artifact_count;
  const blockedCount = projection.quarantined_count + projection.referenced_missing_count;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Integrity Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Receipt-bound Universal Intake Spine Layer 3 state for the live upload session.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/control-room")}>Universal Intake Spine</Button>
          <Button onClick={() => setLocation("/upload")} className="gap-2"><Upload className="h-4 w-4" />Upload Evidence</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Registered sources" value={projection.source_artifact_count} />
        <Metric label="Preservation verified" value={projection.preserved_count} tone="good" />
        <Metric label="Pending governed run" value={pendingCount} />
        <Metric label="Blocked" value={blockedCount} tone={blockedCount > 0 ? "bad" : "good"} />
      </div>

      {projection.projection_state === "not_run" && (
        <Card className="border-blue-500/30 bg-blue-950/20">
          <CardContent className="p-4 text-sm text-blue-200/80">
            Sources are registered, but preservation verification has not run. Declare jurisdiction and rule date in Control Room, then run the governed Intake Spine once.
          </CardContent>
        </Card>
      )}
      {projection.projection_state === "blocked" && (
        <Card className="border-red-500/30 bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-200/80">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            One or more source artifacts failed byte availability or SHA-256 verification. Governed projections fail closed until the source is replaced or explicitly resolved.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Live source registry</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {projection.artifacts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No source artifacts registered.</div>
          ) : projection.artifacts.map(artifact => {
            const document = artifact.legacy_document_id ? documentById.get(artifact.legacy_document_id) : null;
            const status = artifact.integrity_status ?? "registered";
            const blocked = status === "quarantined" || status === "referenced_missing";
            return (
              <div key={artifact.artifact_id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{artifact.filename || artifact.artifact_key}</p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{artifact.source_sha256 || "SHA-256 unavailable"}</p>
                  {artifact.receipt_hash && <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">receipt {artifact.receipt_hash}</p>}
                </div>
                <Badge variant="outline" className={blocked ? "border-red-500/40 text-red-300" : status === "preserved" ? "border-emerald-500/40 text-emerald-300" : "border-blue-500/40 text-blue-300"}>
                  {status.replace(/_/g, " ")}
                </Badge>
                {document && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setModal({ type: "replace", docId: document.id, docName: document.filename })}>
                      <Replace className="h-3.5 w-3.5" />Replace
                    </Button>
                    {blocked && (
                      <Button variant="ghost" size="sm" className="gap-1 text-amber-300" onClick={() => { setReason(""); setModal({ type: "excluded", docId: document.id, docName: document.filename }); }}>
                        <Ban className="h-3.5 w-3.5" />Resolve
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ReplaceDocumentModalV2
        open={modal.type === "replace"}
        onClose={() => setModal({ type: "none" })}
        documentId={modal.type === "replace" ? modal.docId : 0}
        documentName={modal.type === "replace" ? modal.docName : ""}
        onSuccess={invalidate}
      />

      <Dialog open={modal.type === "corrupted" || modal.type === "excluded"} onOpenChange={open => !open && setModal({ type: "none" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal.type === "corrupted" ? "Mark Source Corrupted" : "Exclude Source"}</DialogTitle>
            <DialogDescription>
              This records an explicit resolution for <strong>{modal.type !== "none" ? modal.docName : ""}</strong>. The historical source and audit chain remain intact.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason (minimum 10 characters)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ type: "none" })}>Cancel</Button>
            <Button
              disabled={reason.trim().length < 10 || markCorrupted.isPending || markExcluded.isPending}
              onClick={() => {
                if (modal.type === "corrupted") markCorrupted.mutate({ documentId: modal.docId, reason: reason.trim() });
                if (modal.type === "excluded") markExcluded.mutate({ documentId: modal.docId, reason: reason.trim() });
              }}
            >
              {markCorrupted.isPending || markExcluded.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirm Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
