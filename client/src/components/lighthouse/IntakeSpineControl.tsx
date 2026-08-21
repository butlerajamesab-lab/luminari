import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function currentLocalDate(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function IntakeMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
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

  const status = trpc.analyze.getIntakeSpineStatus.useQuery(
    { caseId },
    { refetchInterval: 15_000, retry: false },
  );
  const runIntakeSpine = trpc.analyze.runIntakeSpine.useMutation();

  const selectedSession = (status.data ?? []).find(
    (session) =>
      session.session_type === "live" && session.entry_channel === "upload",
  );

  useEffect(() => {
    if (!jurisdiction && selectedSession?.last_governed_jurisdiction) {
      setJurisdiction(selectedSession.last_governed_jurisdiction);
    }
    if (selectedSession?.last_governed_rule_as_of) {
      setAsOf(selectedSession.last_governed_rule_as_of);
    }
  }, [selectedSession?.intake_session_id]);

  const canRun =
    !!selectedSession &&
    selectedSession.registered_source_count > 0 &&
    selectedSession.blocked_source_count === 0 &&
    jurisdiction.trim().length > 0 &&
    asOf.length > 0 &&
    !runIntakeSpine.isPending;

  const handleRun = async () => {
    if (!selectedSession || selectedSession.registered_source_count === 0) {
      toast.error("Add at least one document before reviewing your evidence.");
      return;
    }
    if (selectedSession.blocked_source_count > 0) {
      toast.error(
        "One or more documents need attention before the evidence review can continue.",
      );
      return;
    }
    if (!jurisdiction.trim()) {
      toast.error(
        "Confirm the case jurisdiction under Case settings before reviewing your evidence.",
      );
      return;
    }
    if (!asOf) {
      toast.error(
        "Confirm the review date under Case settings before reviewing your evidence.",
      );
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
        `Evidence review completed with ${result.receipts.length} sealed audit receipt${result.receipts.length === 1 ? "" : "s"}.`,
      );
      await status.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Evidence review could not be completed.");
    }
  };

  return (
    <Card
      id={`intake-spine-control-${caseId}`}
      className={cn("border-primary/30", className)}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Review your evidence
          </CardTitle>
          <Badge
            variant="outline"
            className="border-primary/30 text-primary text-[10px]"
          >
            private · preserved
          </Badge>
        </div>
        <CardDescription>
          Lighthouse keeps your original uploads intact. When you are ready,
          review the preserved evidence so the case can organize what you have,
          what may still be missing, and what comes next.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your evidence…
          </div>
        ) : status.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                We could not read the current evidence status. Nothing was
                changed.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={status.isFetching}
                onClick={() => void status.refetch()}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    status.isFetching && "animate-spin",
                  )}
                />
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        ) : !selectedSession ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Start with what you have.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No documents have been added to this case yet. One document is
                  enough to begin.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setLocation("/upload")}
              >
                <Upload className="h-3.5 w-3.5" />
                Add Documents
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <IntakeMetric
                label="Documents received"
                value={selectedSession.registered_source_count}
              />
              <IntakeMetric
                label="Safely preserved"
                value={selectedSession.preserved_source_count}
              />
              <IntakeMetric
                label="Evidence review"
                value={
                  selectedSession.execution_complete
                    ? "Complete"
                    : `${selectedSession.sealed_layer_name_count}/${selectedSession.required_layer_count}`
                }
              />
            </div>

            {selectedSession.blocked_source_count > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {selectedSession.blocked_source_count} document
                  {selectedSession.blocked_source_count === 1 ? " needs" : "s need"}
                  {" "}attention before the evidence review can continue. Your
                  original uploads remain preserved.
                </AlertDescription>
              </Alert>
            )}

            {selectedSession.projection_invalidated_at && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  New documents were added after the last review. Review the
                  evidence again to include the current document set.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full gap-2"
              disabled={!canRun}
              onClick={handleRun}
            >
              {runIntakeSpine.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedSession.execution_complete ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {runIntakeSpine.isPending
                ? "Reviewing preserved evidence…"
                : selectedSession.execution_complete
                  ? "Review Evidence Again"
                  : "Review My Evidence"}
            </Button>

            {!jurisdiction.trim() && (
              <p className="text-xs text-amber-300">
                Confirm the case jurisdiction below before starting the review.
              </p>
            )}

            <details
              className="rounded-md border border-border/60 bg-muted/10"
              open={!jurisdiction.trim()}
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                Case settings & audit details
              </summary>
              <div className="space-y-4 border-t border-border/50 p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  These settings preserve the exact jurisdiction and rule date
                  used for a reproducible review. Most people will not need to
                  change them after the first review.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`intake-jurisdiction-${caseId}`}>
                      Case jurisdiction
                    </Label>
                    <Input
                      id={`intake-jurisdiction-${caseId}`}
                      value={jurisdiction}
                      onChange={(event) => setJurisdiction(event.target.value)}
                      placeholder="e.g. WA, Federal, Tribal jurisdiction"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`intake-as-of-${caseId}`}>
                      Review rules as of
                    </Label>
                    <Input
                      id={`intake-as-of-${caseId}`}
                      type="date"
                      value={asOf}
                      onChange={(event) => setAsOf(event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                  <div>
                    <span className="block">Review layers</span>
                    <strong className="text-foreground">
                      {selectedSession.sealed_layer_name_count}/
                      {selectedSession.required_layer_count}
                    </strong>
                  </div>
                  <div>
                    <span className="block">Audit receipts</span>
                    <strong className="text-foreground">
                      {selectedSession.sealed_layer_run_count}
                    </strong>
                  </div>
                  <div>
                    <span className="block">Session status</span>
                    <strong className="text-foreground">
                      {selectedSession.session_status}
                    </strong>
                  </div>
                  <div>
                    <span className="block">Completion</span>
                    <strong className="text-foreground">
                      {selectedSession.completion_state}
                    </strong>
                  </div>
                </div>

                {selectedSession.latest_receipt_hash && (
                  <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                    <p className="mb-1 text-[10px] text-muted-foreground">
                      Latest audit receipt
                    </p>
                    <code className="block break-all text-[10px]">
                      {selectedSession.latest_receipt_hash}
                    </code>
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
