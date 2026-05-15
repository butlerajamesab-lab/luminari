import { useState, useCallback, useEffect } from "react";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FileText, Users, Lightbulb, Clock, Network, AlertTriangle, Upload, Quote, Headphones, ShieldAlert, Shield, Activity, ClipboardCheck, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, XCircle, TimerOff, FileWarning, HelpCircle, RotateCcw, Loader2, RefreshCw, FileX, Zap, Ban, FileCheck, Lock, Unlock, ShieldCheck, Layers, Lamp, MapPin, Eye, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ResourceDirectory } from "@/components/ResourceDirectory";
import { LegalResources } from "@/components/LegalResources";
import { ShareWithAdvocate } from "@/components/ShareWithAdvocate";
import { FoiaCaseSummary } from "@/components/FoiaCaseSummary";
import { PatternSignals } from "@/components/PatternSignals";
import { LensDebugPanel } from "@/components/LensDebugPanel";

function ExpandableSection({ title, icon: Icon, count, color, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="border border-border rounded-md">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${color} bg-muted/50`}>{count}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 border-t border-border">{children}</div>}
    </div>
  );
}

function IngestionIntegrityPanel({ caseId }: { caseId: number }) {
  const { data: audit, isLoading } = trpc.cases.ingestionAudit.useQuery(
    { caseId },
    { enabled: false, refetchInterval: 60000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Ingestion Integrity
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!audit || audit.intendedUploads.length === 0) return null;

  const s = audit.summary;
  const hasIssues = s.totalFailedFiles > 0 || s.totalExpiredUnprocessed > 0 || s.totalExtractionFailures > 0 || s.totalMissing > 0;

  return (
    <Card className={hasIssues ? "border-amber-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Ingestion Integrity
          {hasIssues && <span className="text-[10px] text-amber-400 font-normal ml-1">Issues detected</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-lg font-bold text-foreground">{s.totalIntendedFiles}</p>
            <p className="text-[10px] text-muted-foreground">Intended</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-lg font-bold text-emerald-400">{s.totalDocumentsCreated}</p>
            <p className="text-[10px] text-muted-foreground">Ingested</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-lg font-bold text-blue-400">{s.totalDuplicatesLinked}</p>
            <p className="text-[10px] text-muted-foreground">Duplicates</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${s.totalFailedFiles > 0 ? 'text-red-400' : 'text-foreground'}`}>{s.totalFailedFiles}</p>
            <p className="text-[10px] text-muted-foreground">Upload Failed</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${s.totalExpiredUnprocessed > 0 ? 'text-amber-400' : 'text-foreground'}`}>{s.totalExpiredUnprocessed}</p>
            <p className="text-[10px] text-muted-foreground">Expired</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${s.totalExtractionFailures > 0 ? 'text-orange-400' : 'text-foreground'}`}>{s.totalExtractionFailures}</p>
            <p className="text-[10px] text-muted-foreground">Extraction Err</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${s.totalMissing > 0 ? 'text-red-400' : 'text-foreground'}`}>{s.totalMissing}</p>
            <p className="text-[10px] text-muted-foreground">Missing</p>
          </div>
        </div>

        {/* Expandable detail sections */}
        <div className="space-y-2">
          <ExpandableSection title="Failed Uploads" icon={XCircle} count={s.totalFailedFiles} color="text-red-400">
            <div className="mt-2 space-y-1">
              {audit.failedUploads.map(f => (
                <div key={f.sessionId} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Session #{f.sessionId}</span>
                  <span>— {f.failedFiles}/{f.totalFiles} files failed</span>
                  <span className="text-[10px]">{new Date(f.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Expired Uploads" icon={TimerOff} count={s.totalExpiredUnprocessed} color="text-amber-400">
            <div className="mt-2 space-y-1">
              {audit.expiredUploads.map(e => (
                <div key={e.sessionId} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Session #{e.sessionId}</span>
                  <span>— {e.completedFiles}/{e.totalFiles} completed before expiry</span>
                  <span className="text-[10px]">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Extraction Failures" icon={FileWarning} count={s.totalExtractionFailures} color="text-orange-400">
            <div className="mt-2 space-y-1">
              {audit.extractionFailures.map(ef => (
                <div key={ef.id} className="text-xs text-muted-foreground py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">Doc #{ef.id}</span>
                    <span className="truncate max-w-[200px]">{ef.filename}</span>
                    <span className="text-red-400">{ef.status}</span>
                    <span>retries: {ef.retryCount}</span>
                  </div>
                  {ef.errorMessage && (
                    <p className="text-[10px] text-red-400/70 mt-0.5 truncate max-w-full">{ef.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Missing Documents" icon={HelpCircle} count={s.totalMissing} color="text-red-400">
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-muted-foreground mb-2">
                Files selected for upload that did not result in a document record or duplicate linkage.
              </p>
              {audit.missingDocuments.map(m => (
                <div key={m.sessionId} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Session #{m.sessionId}</span>
                  <span>— {m.missingCount} file(s) unaccounted</span>
                  <span className="text-[10px]">(total: {m.totalFiles}, created: {m.completedFiles}, dupes: {m.duplicateFiles}, failed: {m.failedFiles})</span>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Duplicates Linked" icon={CheckCircle2} count={s.totalDuplicatesLinked} color="text-blue-400">
            <div className="mt-2 space-y-1">
              {audit.duplicatesLinked.map(d => (
                <div key={d.sessionId} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Session #{d.sessionId}</span>
                  <span>— {d.count} duplicate(s) detected and linked</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </div>

        {/* Extraction Recovery Button */}
        {s.totalExtractionFailures > 0 && (
          <ExtractionRecoveryButton caseId={caseId} />
        )}
      </CardContent>
    </Card>
  );
}

/** Remediation Overview Panel — deterministic 5-class document state classification */
function RemediationOverviewPanel({ caseId }: { caseId: number }) {
  const { data: overview, isLoading } = trpc.cases.remediationOverview.useQuery(
    { caseId },
    { enabled: false, refetchInterval: 60000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Remediation Overview
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!overview || overview.counters.totalDocuments === 0) return null;

  const c = overview.counters;
  const bm = overview.batchMetrics;
  const hasIssues = c.manualReuploadRequired > 0 || c.autoRecoverable > 0 || c.missingUpload > 0;

  return (
    <Card className={hasIssues ? "border-amber-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Remediation Overview
          {hasIssues && <span className="text-[10px] text-amber-400 font-normal ml-1">Action required</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 5-class counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${c.manualReuploadRequired > 0 ? 'text-red-400' : 'text-foreground'}`}>{c.manualReuploadRequired}</p>
            <p className="text-[10px] text-muted-foreground">Manual Re-Upload</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${c.autoRecoverable > 0 ? 'text-orange-400' : 'text-foreground'}`}>{c.autoRecoverable}</p>
            <p className="text-[10px] text-muted-foreground">Auto-Recoverable</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${c.missingUpload > 0 ? 'text-amber-400' : 'text-foreground'}`}>{c.missingUpload}</p>
            <p className="text-[10px] text-muted-foreground">Missing Uploads</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className={`text-lg font-bold ${c.unsupportedValid > 0 ? 'text-blue-400' : 'text-foreground'}`}>{c.unsupportedValid}</p>
            <p className="text-[10px] text-muted-foreground">Unsupported (Valid)</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-lg font-bold text-emerald-400">{c.validComplete}</p>
            <p className="text-[10px] text-muted-foreground">Valid Complete</p>
          </div>
        </div>

        {/* Batch metrics bar */}
        <div className="p-3 rounded-md bg-muted/20 border border-border/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Batch Metrics</span>
            <span className="font-mono">Total: {bm.total}</span>
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-mono">{bm.resolved}</span>
              <span className="text-muted-foreground">Resolved</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400 font-mono">{bm.unresolved}</span>
              <span className="text-muted-foreground">Unresolved</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-orange-400 font-mono">{bm.systemErrors}</span>
              <span className="text-muted-foreground">System Errors</span>
            </div>
          </div>
          {bm.resolved + bm.unresolved + bm.systemErrors !== bm.total && (
            <p className="text-[10px] text-red-400 mt-1">
              Δ Metric mismatch: {bm.resolved} + {bm.unresolved} + {bm.systemErrors} ≠ {bm.total}
            </p>
          )}
        </div>

        {/* Detail lists */}
        <div className="space-y-2">
          <ExpandableSection title="Manual Re-Upload Required" icon={FileX} count={c.manualReuploadRequired} color="text-red-400">
            <div className="mt-2 space-y-1">
              {overview.documents.filter(d => d.remediationClass === 'manual_reupload_required').map(d => (
                <div key={d.id} className="text-xs text-muted-foreground py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">Doc #{d.id}</span>
                    <span className="truncate max-w-[200px]">{d.filename}</span>
                    <span className="text-red-400">{d.status}</span>
                    <span>retries: {d.retryCount}</span>
                    <span className="font-mono text-[10px]">snap: {d.snapshotId}</span>
                  </div>
                  {d.errorMessage && (
                    <p className="text-[10px] text-red-400/70 mt-0.5 truncate max-w-full">{d.errorMessage}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{d.classificationReason}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Auto-Recoverable" icon={Zap} count={c.autoRecoverable} color="text-orange-400">
            <div className="mt-2 space-y-1">
              {overview.documents.filter(d => d.remediationClass === 'auto_recoverable').map(d => (
                <div key={d.id} className="text-xs text-muted-foreground py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">Doc #{d.id}</span>
                    <span className="truncate max-w-[200px]">{d.filename}</span>
                    <span className="text-orange-400">{d.status}</span>
                    <span>retries: {d.retryCount}</span>
                    <span className="font-mono text-[10px]">snap: {d.snapshotId}</span>
                  </div>
                  {d.errorMessage && (
                    <p className="text-[10px] text-orange-400/70 mt-0.5 truncate max-w-full">{d.errorMessage}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{d.classificationReason}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Missing Uploads" icon={Ban} count={c.missingUpload} color="text-amber-400">
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-muted-foreground mb-2">
                Files selected for upload that were never ingested.
              </p>
              {overview.missingUploads.map(m => (
                <div key={m.sessionId} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Session #{m.sessionId}</span>
                  <span>— {m.missingCount} file(s) missing</span>
                  <span className="text-[10px]">(total: {m.totalFiles}, created: {m.completedFiles}, dupes: {m.duplicateFiles}, failed: {m.failedFiles})</span>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection title="Unsupported (Valid)" icon={FileCheck} count={c.unsupportedValid} color="text-blue-400">
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-muted-foreground mb-2">
                Extraction succeeded but no linking candidate found. This is analytical, not an ingestion error.
              </p>
              {overview.documents.filter(d => d.remediationClass === 'unsupported_valid').map(d => (
                <div key={d.id} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                  <span className="font-mono">Doc #{d.id}</span>
                  <span className="truncate max-w-[200px]">{d.filename}</span>
                  <span className="text-blue-400">{d.status}</span>
                  <span className="font-mono text-[10px]">snap: {d.snapshotId}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </div>
      </CardContent>
    </Card>
  );
}

/** Minimal extraction recovery control — retries retryable failures only */
function ExtractionRecoveryButton({ caseId }: { caseId: number }) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [result, setResult] = useState<{ totalQueued: number; totalSkipped: number; snapshotCreated: boolean } | null>(null);
  const utils = trpc.useUtils();

  // Get latest snapshot for this case
  const { data: snapshots } = trpc.snapshots.list.useQuery(
    { caseId },
    { enabled: false }
  );
  const latestSnapshot = snapshots?.[0];

  const recoveryMutation = trpc.cases.extractionRecovery.useMutation({
    onSuccess: (data) => {
      setResult({ totalQueued: data.totalQueued, totalSkipped: data.totalSkipped, snapshotCreated: data.snapshotCreated });
      setIsRecovering(false);
      // Refresh ingestion audit and documents
      utils.cases.ingestionAudit.invalidate();
      utils.cases.stats.invalidate();
    },
    onError: () => {
      setIsRecovering(false);
    },
  });

  const handleRecovery = useCallback(() => {
    if (!latestSnapshot) return;
    setIsRecovering(true);
    setResult(null);
    recoveryMutation.mutate({
      caseId,
      snapshotId: latestSnapshot.id,
      retryOnly: true,
    });
  }, [caseId, latestSnapshot, recoveryMutation]);

  if (!latestSnapshot) return null;

  return (
    <div className="pt-2 border-t border-border/30">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <p>Retry retryable extraction failures (transient errors only).</p>
          {latestSnapshot.status === 'sealed' && (
            <p className="text-amber-400/80 mt-0.5">Sealed snapshot — recovery will create a new snapshot version.</p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-4 shrink-0 text-xs"
          disabled={isRecovering}
          onClick={handleRecovery}
        >
          {isRecovering ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Recovering...</>
          ) : (
            <><RotateCcw className="h-3 w-3 mr-1" /> Retry Retryable Failures</>
          )}
        </Button>
      </div>
      {result && (
        <div className="mt-2 text-xs p-2 rounded bg-muted/30">
          <span className="text-emerald-400">{result.totalQueued} queued</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-muted-foreground">{result.totalSkipped} skipped</span>
          {result.snapshotCreated && (
            <span className="text-amber-400 ml-2">New snapshot created</span>
          )}
        </div>
      )}
    </div>
  );
}

function ProvenanceDriftWidget() {
  const { currentCaseId } = useCase();
  const { data: drift, isLoading } = trpc.documents.provenanceDrift.useQuery(
    { caseId: currentCaseId ?? undefined },
    { enabled: false, refetchInterval: 30000 }
  );

  if (isLoading || !drift || drift.totalFindings === 0) return null;

  const coverageColor = drift.provenanceCoverage >= 95 ? "text-emerald-400" :
    drift.provenanceCoverage >= 80 ? "text-amber-400" : "text-red-400";
  const coverageBg = drift.provenanceCoverage >= 95 ? "bg-emerald-400" :
    drift.provenanceCoverage >= 80 ? "bg-amber-400" : "bg-red-400";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Provenance Integrity
          <span className="text-[10px] font-normal text-muted-foreground/60">(this case)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Coverage bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Provenance Coverage</span>
            <span className={`text-sm font-mono font-bold ${coverageColor}`}>
              {drift.provenanceCoverage}%
            </span>
          </div>
          <Progress value={drift.provenanceCoverage} className={`h-1.5 [&>div]:${coverageBg}`} />
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-2 rounded-md bg-muted/30">
            <p className="text-lg font-bold text-foreground">{drift.linkedFindings}</p>
            <p className="text-[10px] text-muted-foreground">Linked</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30">
            <p className="text-lg font-bold text-foreground">{drift.unsupportedFindings}</p>
            <p className="text-[10px] text-muted-foreground">Unsupported</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30">
            <p className="text-lg font-bold text-foreground">{drift.avgClaimsPerFinding}</p>
            <p className="text-[10px] text-muted-foreground">Avg Claims/Finding</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30">
            <p className="text-lg font-bold text-foreground">{drift.unsupportedRate}%</p>
            <p className="text-[10px] text-muted-foreground">Unsupported Rate</p>
          </div>
        </div>

        {/* Runtime stats */}
        {drift.runtime && (drift.runtime.docsProcessed > 0 || drift.runtime.fallbackAttempts > 0) && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border pt-2">
            <Activity className="h-3 w-3 shrink-0" />
            <span>Runtime: {drift.runtime.docsProcessed} docs processed</span>
            {drift.runtime.fallbackAttempts > 0 && (
              <span>
                Fallback: {drift.runtime.fallbackHits}/{drift.runtime.fallbackAttempts} hits
                ({drift.fallbackMatcherHitRate}%)
              </span>
            )}
            {drift.avgProcessingTimeMs > 0 && (
              <span>{Math.round(drift.avgProcessingTimeMs / 1000)}s avg/doc</span>
            )}
          </div>
        )}

        {/* Drill-down link */}
        {drift.unsupportedFindings > 0 && (
          <div className="pt-2 border-t border-border">
            <a
              href="/provenance"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Shield className="h-3 w-3" />
              {drift.unsupportedFindings} unsupported — classify in Provenance Drill-Down
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Snapshot Lifecycle Banner ─── */
function SnapshotLifecycleBanner({ caseId }: { caseId: number }) {
  const { data: lifecycle, isLoading } = trpc.snapshots.lifecycle.useQuery(
    { caseId },
    { enabled: false, refetchInterval: 5000 }
  );
  const utils = trpc.useUtils();
  const sealMutation = trpc.snapshots.seal.useMutation({
    onSuccess: (result) => {
      toast.success(`Snapshot v${result.version} sealed successfully`);
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(`Seal failed: ${err.message}`),
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!lifecycle || !lifecycle.hasSnapshot) {
    return (
      <Card className="border-border bg-muted/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted/20">
              <Unlock className="h-4.5 w-4.5 text-muted-foreground/50" />
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">No Snapshot</span>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Upload evidence and run extraction to create the first corpus snapshot.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isOpen = lifecycle.status === 'open';
  const isSealed = lifecycle.status === 'sealed';

  return (
    <Card className={`${
      isSealed
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <CardContent className="p-4">
        {/* Banner Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
              isSealed ? 'bg-emerald-500/10' : 'bg-amber-500/10'
            }`}>
              {isSealed ? <Lock className="h-4.5 w-4.5 text-emerald-400" /> : <Unlock className="h-4.5 w-4.5 text-amber-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Snapshot v{lifecycle.version}
                </span>
                <Badge variant="outline" className={`text-[10px] font-mono uppercase ${
                  isSealed
                    ? 'text-emerald-400 border-emerald-500/30'
                    : 'text-amber-400 border-amber-500/30'
                }`}>
                  {lifecycle.status}
                </Badge>
                {isSealed && lifecycle.signature === 'valid' && (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 gap-1">
                    <ShieldCheck className="h-3 w-3" /> Signed
                  </Badge>
                )}
                {isSealed && lifecycle.signature === 'invalid' && (
                  <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30 gap-1">
                    <ShieldAlert className="h-3 w-3" /> Invalid Signature
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {lifecycle.gateStage && (
                  <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground border-border">
                    Gate: {lifecycle.gateStage}
                  </Badge>
                )}
                {lifecycle.extractionIntegrity === false && isOpen && (
                  <Badge variant="outline" className="text-[9px] font-mono text-red-400 border-red-500/30 gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" /> Integrity Incomplete
                  </Badge>
                )}
                {lifecycle.extractionIntegrity === true && isOpen && (
                  <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/30 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Integrity Verified
                  </Badge>
                )}
                {(lifecycle as any).resolutionSummary?.totalResolved > 0 && isOpen && (
                  <Badge variant="outline" className="text-[9px] font-mono text-cyan-400 border-cyan-500/30">
                    {(lifecycle as any).resolutionSummary.totalResolved} resolved
                  </Badge>
                )}
                <span className="text-[10px] font-mono text-muted-foreground">
                  ID: {lifecycle.snapshotId}
                </span>
                {lifecycle.lastUpdatedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(lifecycle.lastUpdatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Seal Button */}
          {isOpen && lifecycle.canSeal && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => sealMutation.mutate({ caseId })}
              disabled={sealMutation.isPending}
            >
              {sealMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              Seal Snapshot
            </Button>
          )}
        </div>

        {/* Stage Indicator (open snapshots only) */}
        {isOpen && lifecycle.stages && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Processing Stages — Gate: {lifecycle.gateStage}
              {lifecycle.extractionIntegrity === false && (
                <span className="ml-2 text-red-400 normal-case">⬤ Downstream blocked — extraction integrity incomplete</span>
              )}
            </div>
            {/* Active Error Breakdown + Resolution Summary */}
            {isOpen && ((lifecycle as any).activeErrorBreakdown?.total > 0 || (lifecycle as any).resolutionSummary?.totalResolved > 0) && (
              <div className="rounded-md border border-border/50 bg-muted/10 p-2.5 text-[10px] space-y-1.5">
                {(lifecycle as any).activeErrorBreakdown?.total > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-red-300">
                        {(lifecycle as any).activeErrorBreakdown.total} active error{(lifecycle as any).activeErrorBreakdown.total !== 1 ? 's' : ''} blocking gate
                      </span>
                      <span className="text-muted-foreground ml-1">
                        ({(lifecycle as any).activeErrorBreakdown.autoRecoverable > 0 && `${(lifecycle as any).activeErrorBreakdown.autoRecoverable} auto-recoverable`}
                        {(lifecycle as any).activeErrorBreakdown.autoRecoverable > 0 && (lifecycle as any).activeErrorBreakdown.manualReupload > 0 && ', '}
                        {(lifecycle as any).activeErrorBreakdown.manualReupload > 0 && `${(lifecycle as any).activeErrorBreakdown.manualReupload} manual re-upload`})
                      </span>
                    </div>
                  </div>
                )}
                {(lifecycle as any).resolutionSummary?.totalResolved > 0 && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-cyan-300">
                        {(lifecycle as any).resolutionSummary.totalResolved} document{(lifecycle as any).resolutionSummary.totalResolved !== 1 ? 's' : ''} resolved
                      </span>
                      <span className="text-muted-foreground ml-1">
                        ({[(lifecycle as any).resolutionSummary.superseded > 0 && `${(lifecycle as any).resolutionSummary.superseded} superseded`,
                          (lifecycle as any).resolutionSummary.corrupted > 0 && `${(lifecycle as any).resolutionSummary.corrupted} corrupted`,
                          (lifecycle as any).resolutionSummary.excluded > 0 && `${(lifecycle as any).resolutionSummary.excluded} excluded`
                        ].filter(Boolean).join(', ')})
                      </span>
                      <span className="text-muted-foreground/70 ml-1">— not blocking gate</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Explicit gate reason per stage */}
            {isOpen && (lifecycle as any).stageReasons && (
              <div className="text-[9px] text-muted-foreground/70 space-y-0.5">
                {Object.entries((lifecycle as any).stageReasons as Record<string, string>).map(([key, reason]) =>
                  reason ? (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="font-mono text-muted-foreground/50 w-20 shrink-0 capitalize">{key}:</span>
                      <span>{reason}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
            <div className="grid grid-cols-5 gap-2">
              {/* Stage 1: Extraction */}
              <StageCard
                label={lifecycle.stages.extraction.label}
                status={lifecycle.stages.extraction.status}
                detail={`${lifecycle.stages.extraction.completed} / ${lifecycle.stages.extraction.total}`}
                subDetail={lifecycle.stages.extraction.errors > 0 ? `${lifecycle.stages.extraction.errors} errors` : undefined}
                step={1}
              />
              {/* Stage 2: Claim Build */}
              <StageCard
                label={lifecycle.stages.claimBuild.label}
                status={lifecycle.stages.claimBuild.status}
                detail={lifecycle.stages.claimBuild.count > 0 ? `${lifecycle.stages.claimBuild.count} claims` : undefined}
                step={2}
              />
              {/* Stage 3: Correlation */}
              <StageCard
                label={lifecycle.stages.correlation.label}
                status={lifecycle.stages.correlation.status}
                detail={lifecycle.stages.correlation.count > 0 ? `${lifecycle.stages.correlation.count} links` : undefined}
                step={3}
              />
              {/* Stage 4: Findings */}
              <StageCard
                label={lifecycle.stages.findings.label}
                status={lifecycle.stages.findings.status}
                detail={lifecycle.stages.findings.count > 0 ? `${lifecycle.stages.findings.count} findings` : undefined}
                step={4}
              />
              {/* Stage 5: Ready to Seal */}
              <StageCard
                label={lifecycle.stages.readyToSeal.label}
                status={lifecycle.stages.readyToSeal.status}
                step={5}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StageCard({ label, status, detail, subDetail, step }: {
  label: string;
  status: 'complete' | 'running' | 'pending' | 'blocked';
  detail?: string;
  subDetail?: string;
  step: number;
}) {
  const colors = {
    complete: 'border-emerald-500/30 bg-emerald-500/5',
    running: 'border-blue-500/30 bg-blue-500/5',
    pending: 'border-border bg-muted/20',
    blocked: 'border-red-500/30 bg-red-500/5',
  };
  const iconColors = {
    complete: 'text-emerald-400',
    running: 'text-blue-400',
    pending: 'text-muted-foreground/50',
    blocked: 'text-red-400',
  };
  return (
    <div className={`rounded-md border p-2 ${colors[status]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-mono text-muted-foreground">{step}</span>
        {status === 'complete' && <CheckCircle2 className={`h-3 w-3 ${iconColors.complete}`} />}
        {status === 'running' && <Loader2 className={`h-3 w-3 ${iconColors.running} animate-spin`} />}
        {status === 'pending' && <Clock className={`h-3 w-3 ${iconColors.pending}`} />}
        {status === 'blocked' && <AlertTriangle className={`h-3 w-3 ${iconColors.blocked}`} />}
      </div>
      <div className="text-[10px] font-medium text-foreground">{label}</div>
      {detail && <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{detail}</div>}
      {subDetail && <div className="text-[9px] font-mono text-red-400 mt-0.5">{subDetail}</div>}
    </div>
  );
}

export default function Home() {
  const { currentCaseId, currentCase } = useCase();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading } = trpc.cases.stats.useQuery(
    { caseId: currentCaseId! },
    { enabled: false }
  );

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">No Case Selected</h2>
          <p className="text-muted-foreground max-w-md">
            Create a new case or select an existing one to begin your investigation.
          </p>
        </div>
        <Button onClick={() => setLocation("/cases")}>
          Manage Cases
        </Button>
      </div>
    );
  }

  const statCards = [
    { label: "Documents", value: stats?.documents ?? 0, icon: FileText, path: "/documents", color: "text-blue-400" },
    { label: "Entities", value: stats?.entities ?? 0, icon: Users, path: "/entities", color: "text-emerald-400" },
    { label: "Quotes", value: stats?.quotes ?? 0, icon: Quote, path: "/documents", color: "text-amber-400" },
    { label: "Claims", value: stats?.claims ?? 0, icon: AlertTriangle, path: "/findings", color: "text-orange-400" },
    { label: "Findings", value: stats?.findings ?? 0, icon: Lightbulb, path: "/findings", color: "text-purple-400" },
    { label: "Events", value: stats?.events ?? 0, icon: Clock, path: "/timeline", color: "text-cyan-400" },
    { label: "Relationships", value: stats?.relationships ?? 0, icon: Network, path: "/network", color: "text-pink-400" },
    { label: "Signal Flags", value: stats?.signalFlags ?? 0, icon: AlertTriangle, path: "/findings", color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {currentCase?.name || "Case Overview"}
          </h1>
          {currentCase?.description && (
            <p className="text-sm text-muted-foreground mt-1">{currentCase.description}</p>
          )}
        </div>
        <Button onClick={() => setLocation("/upload")} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Evidence
        </Button>
      </div>

      {/* ── Share, Checklist & Resources ── */}
      {currentCase && (
        <div className="space-y-4">
          <ShareWithAdvocate caseId={currentCaseId} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DocumentChecklist caseId={currentCaseId} pipelineType={(currentCase as any).pipelineType} />
            <ResourceDirectory pipelineType={(currentCase as any).pipelineType} />
          </div>
          <LegalResources pipelineType={(currentCase as any).pipelineType} />
        </div>
      )}

      {/* ── Lighthouse Orientation Card ── */}
      <Card className="bg-gradient-to-r from-amber-500/5 via-amber-400/5 to-transparent border-amber-500/20 hover:border-amber-500/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Lamp className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">The Lighthouse</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your orientation point. Find community resources, know your rights, discover opportunities, and explore the full platform.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-teal-400 hover:text-teal-300 gap-1"
                onClick={() => setLocation("/civic-map")}
              >
                <MapPin className="h-3 w-3" />
                <span className="hidden sm:inline">Map</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-amber-400/70 hover:text-amber-300 gap-1"
                onClick={() => setLocation("/viewfinder")}
              >
                <Eye className="h-3 w-3" />
                <span className="hidden sm:inline">Viewfinder</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5"
                onClick={() => setLocation("/lighthouse")}
              >
                Enter
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Snapshot Lifecycle Banner ── */}
      <SnapshotLifecycleBanner caseId={currentCaseId} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className="stat-card cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => setLocation(card.path)}
          >
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                  </div>
                  <card.icon className={`h-5 w-5 ${card.color} opacity-70`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Document Status Breakdown */}
      {stats?.documentStatus && Object.keys(stats.documentStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Document Processing Status <span className="text-[10px] font-normal text-muted-foreground/60">(this case)</span></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(stats.documentStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    status === "ready" ? "bg-emerald-400" :
                    status === "analyzing" ? "bg-amber-400" :
                    status === "extracting" ? "bg-blue-400" :
                    status === "error" ? "bg-red-400" :
                    "bg-muted-foreground"
                  }`} />
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  <span className="text-xs font-mono text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Read Aloud Feature Tip */}
      {stats && (stats.findings > 0 || stats.events > 0) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Listen to your evidence</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the <strong>Listen</strong> buttons on Findings, Timeline, Entities, and Document pages to have evidence read aloud with forensic attribution.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10" onClick={() => setLocation("/findings")}>
              <Headphones className="h-3.5 w-3.5" />
              Try it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Linkage Mismatch Warning ── */}
      {stats && (stats.entities ?? 0) > 0 && (stats.documents ?? 0) === 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-400">Linkage Mismatch Detected</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                This case has <strong>{stats.entities} entities</strong> but <strong>0 documents</strong>.
                Entities may have been created from documents uploaded to a different case.
                Verify your uploads are linked to the correct case.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => setLocation("/upload")}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Here
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Lens Debug Panel (Activation Trace) ── */}
      <LensDebugPanel caseId={currentCaseId} />

      {/* ── Pattern Signals (Cross-Case Intelligence) ── */}
      <PatternSignals caseId={currentCaseId} />

      {/* ── FOIA Requests Summary ── */}
      <FoiaCaseSummary caseId={currentCaseId} />

      {/* ── Ingestion Integrity Ledger ── */}
      <IngestionIntegrityPanel caseId={currentCaseId} />

      {/* ── Remediation Overview ── */}
      <RemediationOverviewPanel caseId={currentCaseId} />

      {/* ── Provenance Drift Metrics ── */}
      <ProvenanceDriftWidget />

      {/* Quick Actions */}
      {stats?.documents === 0 && (stats?.entities ?? 0) === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-foreground">No documents yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload PDFs, images, audio, or video files to begin analysis.
                The system will extract text, identify entities, and surface findings automatically.
              </p>
            </div>
            <Button onClick={() => setLocation("/upload")} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Your First Document
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
