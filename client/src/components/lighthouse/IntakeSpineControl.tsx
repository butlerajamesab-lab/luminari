import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle2, Loader2, Shield, Upload } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function currentLocalDate(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

export function IntakeSpineControl({
  caseId,
  className,
}: {
  caseId: number;
  className?: string;
}) {
  const [, setLocation] = useLocation();
  const [jurisdiction, setJurisdiction] = useState("");
  const [asOf, setAsOf] = useState(currentLocalDate);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const status = trpc.analyze.getIntakeSpineStatus.useQuery(
    { caseId },
    { refetchInterval: 15_000, retry: false },
  );
  const runIntakeSpine = trpc.analyze.runIntakeSpine.useMutation();

  const liveUploadSessions = useMemo(
    () =>
      (status.data ?? []).filter(
        (session) => session.session_type === "live" && session.entry_channel === "upload",
      ),
    [status.data],
  );

  useEffect(() => {
    if (liveUploadSessions.length === 1) {
      setSelectedSessionId(liveUploadSessions[0].intake_session_id);
      return;
    }

    if (
      selectedSessionId &&
      !liveUploadSessions.some((session) => session.intake_session_id === selectedSessionId)
    ) {
      setSelectedSessionId(null);
    }
  }, [liveUploadSessions, selectedSessionId]);

  const selectedSession =
    liveUploadSessions.find((session) => session.intake_session_id === selectedSessionId) ??
    (liveUploadSessions.length === 1 ? liveUploadSessions[0] : null);
  const canRun =
    !!selectedSession &&
    selectedSession.source_artifact_count > 0 &&
    jurisdiction.trim().length > 0 &&
    asOf.length > 0 &&
    !runIntakeSpine.isPending;

  const handleRun = async () => {
    if (!selectedSession || selectedSession.source_artifact_count === 0) {
      toast.error("Preserve at least one source before Intake Spine execution.");
      return;
    }
    if (!jurisdiction.trim()) {
      toast.error("Declare the jurisdiction before Intake Spine execution.");
      return;
    }
    if (!asOf) {
      toast.error("Declare the rule as-of date before Intake Spine execution.");
      return;
    }

    try {
      const result = await runIntakeSpine.mutateAsync({
        caseId,
        intakeSessionId: selectedSession.intake_session_id,
        jurisdiction: jurisdiction.trim(),
        asOf,
      });
      toast.success(
        `Intake Spine sealed ${result.receipts.length} deterministic receipt${result.receipts.length === 1 ? "" : "s"}.`,
      );
      await status.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Intake Spine execution failed.");
    }
  };

  return (
    <Card id={`intake-spine-control-${caseId}`} className={cn("border-primary/30", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Universal Intake Spine
          </CardTitle>
          <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
            deterministic · governed
          </Badge>
        </div>
        <CardDescription>
          Evidence is preserved first. Reconstruction runs only when you explicitly start it against declared jurisdiction and rule-date inputs.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading canonical Intake Spine state…
          </div>
        ) : status.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Intake Spine status is unavailable.</AlertDescription>
          </Alert>
        ) : liveUploadSessions.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>No live upload-backed Intake Spine session is registered for this case.</span>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/upload")}>
                <Upload className="h-3.5 w-3.5" />
                Upload Evidence
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {liveUploadSessions.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor={`intake-session-${caseId}`}>Preserved source session</Label>
                <select
                  id={`intake-session-${caseId}`}
                  value={selectedSessionId ?? ""}
                  onChange={(event) => setSelectedSessionId(event.target.value || null)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Select a session</option>
                  {liveUploadSessions.map((session) => (
                    <option key={session.intake_session_id} value={session.intake_session_id}>
                      {session.source_label || session.intake_session_id} · {session.source_artifact_count} source{session.source_artifact_count === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedSession && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Preserved sources</p>
                  <p className="text-lg font-semibold">{selectedSession.source_artifact_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Layer runs</p>
                  <p className="text-lg font-semibold">{selectedSession.layer_run_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sealed receipts</p>
                  <p className="text-lg font-semibold">{selectedSession.sealed_layer_run_count}</p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`intake-jurisdiction-${caseId}`}>Declared jurisdiction</Label>
                <Input
                  id={`intake-jurisdiction-${caseId}`}
                  value={jurisdiction}
                  onChange={(event) => setJurisdiction(event.target.value)}
                  placeholder="e.g. WA, Federal, Tribal jurisdiction"
                  autoComplete="off"
                />
                <p className="text-[10px] text-muted-foreground">Required input; Lighthouse does not infer it.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`intake-as-of-${caseId}`}>Rule as-of date</Label>
                <Input
                  id={`intake-as-of-${caseId}`}
                  type="date"
                  value={asOf}
                  onChange={(event) => setAsOf(event.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Visible execution boundary for versioned rules.</p>
              </div>
            </div>

            <Button className="w-full gap-2" disabled={!canRun} onClick={handleRun}>
              {runIntakeSpine.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedSession && selectedSession.sealed_layer_run_count > 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {runIntakeSpine.isPending ? "Running deterministic Intake Spine…" : "Run Universal Intake Spine"}
            </Button>

            {selectedSession?.latest_receipt_hash && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                <p className="mb-1 text-[10px] text-muted-foreground">Latest sealed receipt</p>
                <code className="block break-all text-[10px]">{selectedSession.latest_receipt_hash}</code>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
