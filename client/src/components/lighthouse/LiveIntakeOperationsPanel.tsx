import { Activity, CheckCircle2, Clock, Database, Loader2, RefreshCw, Shield, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-slate-800/70 bg-slate-950/30">
      <CardContent className="pt-4 pb-4">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-xl font-mono font-semibold text-slate-200">{value}</div>
      </CardContent>
    </Card>
  );
}

export function LiveIntakeOperationsPanel() {
  const { currentCaseId, currentCase } = useCase();
  const status = trpc.analyze.getIntakeSpineStatus.useQuery(
    { caseId: currentCaseId! },
    {
      enabled: !!currentCaseId,
      refetchInterval: 15_000,
      retry: false,
    },
  );

  if (!currentCaseId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">Universal Intake Spine — Live Case Status</span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
          Select a case to inspect its canonical Intake Spine state.
        </div>
      </div>
    );
  }

  if (status.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Intake Spine status…
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-400" />
          <span className="text-sm font-medium text-slate-200">Universal Intake Spine — Live Case Status</span>
        </div>
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          Intake Spine status unavailable: {status.error.message}
        </div>
      </div>
    );
  }

  const sessions = status.data ?? [];
  const liveSession = sessions.find(
    (session) => session.session_type === "live" && session.entry_channel === "upload",
  );
  const registeredSourceCount = liveSession?.registered_source_count ?? 0;
  const preservedSourceCount = liveSession?.preserved_source_count ?? 0;
  const sealedRunCount = liveSession?.sealed_layer_run_count ?? 0;
  const sealedLayerCount = liveSession?.sealed_layer_name_count ?? 0;
  const requiredLayerCount = liveSession?.required_layer_count ?? 0;
  const complete = liveSession?.execution_complete ?? false;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-medium text-slate-200">Universal Intake Spine — Live Case Status</span>
            <Badge variant="outline" className="text-[10px] border-blue-700/40 bg-blue-950/30 text-blue-300">canonical</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Read-only status from the same governed Intake Spine endpoint used by the case workspace. No stream-health or legacy engine-run data is substituted here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${status.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card className="border-slate-800/70 bg-slate-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-3">
            <span>{currentCase?.name ?? `Case #${currentCaseId}`}</span>
            <Badge variant="outline" className={complete ? "border-emerald-700/40 text-emerald-300" : "border-amber-700/40 text-amber-300"}>
              {complete ? `${requiredLayerCount}/${requiredLayerCount} layers sealed` : `${sealedLayerCount}/${requiredLayerCount} layers sealed`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {liveSession ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div><span className="text-slate-500">Legacy case ID:</span> <span className="font-mono text-slate-300">{currentCaseId}</span></div>
              <div><span className="text-slate-500">Session:</span> <span className="font-mono text-slate-300 break-all">{liveSession.intake_session_id}</span></div>
              <div><span className="text-slate-500">Session type:</span> <span className="text-slate-300">{liveSession.session_type}</span></div>
              <div><span className="text-slate-500">Entry channel:</span> <span className="text-slate-300">{liveSession.entry_channel}</span></div>
              <div><span className="text-slate-500">Session status:</span> <span className="text-slate-300">{liveSession.session_status}</span></div>
              <div><span className="text-slate-500">Completion state:</span> <span className="text-slate-300">{liveSession.completion_state}</span></div>
            </div>
          ) : (
            <div className="text-slate-500">No live upload-backed Intake Spine session is registered for this case.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Registered sources" value={registeredSourceCount} />
        <Metric label="Preserved sources" value={preservedSourceCount} />
        <Metric label="Sealed receipts" value={sealedRunCount} />
        <Metric label="Remaining layers" value={Math.max(0, requiredLayerCount - sealedLayerCount)} />
      </div>

      <Card className="border-slate-800/70 bg-slate-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {liveSession?.latest_receipt_hash ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock className="h-4 w-4 text-slate-500" />}
            Latest sealed receipt
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {liveSession?.latest_receipt_hash ? (
            <div><span className="text-slate-500">Receipt hash:</span> <span className="font-mono text-slate-300 break-all">{liveSession.latest_receipt_hash}</span></div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <Database className="h-4 w-4" /> No live layer receipt has been sealed for this case yet.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Activity className="h-3.5 w-3.5" /> This panel is observability only. Execution remains explicit in the case workspace.
      </div>
    </div>
  );
}
