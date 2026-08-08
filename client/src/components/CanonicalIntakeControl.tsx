import { AlertCircle, CheckCircle2, Loader2, Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export type CanonicalIntakeControlProps = {
  caseId: number;
  compact?: boolean;
};

/**
 * One execution authority for user-triggered case reconstruction.
 *
 * Upload remains preservation-only. This component resolves the jurisdiction
 * from the case registry, declares the current as-of boundary, and invokes the
 * governed Universal Intake Spine explicitly. It does not invoke Viability,
 * Strategy, Assembly, Pattern, or any legacy document-analysis pipeline.
 */
export function CanonicalIntakeControl({ caseId, compact = false }: CanonicalIntakeControlProps) {
  const caseQuery = trpc.luminari.getCase.useQuery(
    { case_id: caseId },
    { enabled: Number.isFinite(caseId) && caseId > 0 },
  );
  const statusQuery = trpc.analyze.getIntakeSpineStatus.useQuery(
    { caseId },
    {
      enabled: Number.isFinite(caseId) && caseId > 0,
      refetchInterval: 15_000,
      retry: false,
    },
  );
  const runMutation = trpc.analyze.runIntakeSpine.useMutation();

  const liveSession = (statusQuery.data ?? []).find(
    (session) => session.session_type === "live" && session.entry_channel === "upload",
  );
  const jurisdiction =
    (caseQuery.data as any)?.registry?.jurisdiction?.code ||
    (caseQuery.data as any)?.registry?.jurisdiction?.abbreviation ||
    (caseQuery.data as any)?.registry?.jurisdiction?.name;
  const asOf = new Date().toISOString().slice(0, 10);
  const sealed = liveSession?.sealed_layer_run_count ?? 0;
  const sources = liveSession?.source_artifact_count ?? 0;

  async function runIntake() {
    if (!jurisdiction) {
      toast.error("A jurisdiction is required before Intake Spine execution.");
      return;
    }
    if (!liveSession) {
      toast.error("No live upload-backed Intake Spine session is registered for this case.");
      return;
    }

    try {
      const result = await runMutation.mutateAsync({
        caseId,
        jurisdiction: String(jurisdiction),
        asOf,
        intakeSessionId: liveSession.intake_session_id,
      });
      toast.success(
        `Intake Spine sealed ${result.receipts.length} layer receipt${result.receipts.length === 1 ? "" : "s"}.`,
      );
      await statusQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Intake Spine execution failed.");
    }
  }

  if (compact) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Universal Intake Spine</span>
                <Badge variant="outline" className="text-[9px]">canonical</Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {statusQuery.isLoading
                  ? "Reading preserved-source state…"
                  : liveSession
                    ? `${sources} preserved source${sources === 1 ? "" : "s"} · ${sealed}/14 sealed · as of ${asOf}`
                    : "No live upload-backed Intake Spine session is registered."}
              </p>
              {liveSession?.latest_receipt_hash && (
                <p className="mt-1 text-[9px] font-mono text-muted-foreground truncate">
                  latest receipt {liveSession.latest_receipt_hash}
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={runIntake}
              disabled={runMutation.isPending || statusQuery.isLoading || caseQuery.isLoading || !liveSession || sources === 0}
              className="shrink-0"
            >
              {runMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Intake…</>
              ) : sealed >= 14 ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Run Again</>
              ) : (
                <><Shield className="h-4 w-4 mr-2" />Run Intake Spine</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Universal Intake Spine
        </CardTitle>
        <CardDescription>
          Evidence is preserved first. Reconstruction runs only when explicitly started against the preserved source bytes and declared deterministic rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading Intake Spine state…
          </div>
        ) : liveSession ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><p className="text-muted-foreground">Preserved sources</p><p className="font-semibold text-base">{sources}</p></div>
            <div><p className="text-muted-foreground">Layer runs</p><p className="font-semibold text-base">{liveSession.layer_run_count}</p></div>
            <div><p className="text-muted-foreground">Sealed receipts</p><p className="font-semibold text-base">{sealed}</p></div>
            <div><p className="text-muted-foreground">As-of boundary</p><p className="font-semibold">{asOf}</p></div>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>No live upload-backed Intake Spine session is registered for this case yet.</AlertDescription>
          </Alert>
        )}

        {liveSession?.latest_receipt_hash && (
          <div className="rounded-md border border-border/50 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Latest sealed receipt</p>
            <code className="text-[10px] break-all">{liveSession.latest_receipt_hash}</code>
          </div>
        )}

        <Button
          onClick={runIntake}
          disabled={runMutation.isPending || !liveSession || sources === 0 || !jurisdiction}
          className="w-full"
        >
          {runMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running deterministic Intake Spine…</>
          ) : (
            "Run Intake Spine"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
