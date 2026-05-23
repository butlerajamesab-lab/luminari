// @ts-nocheck
/**
 * Governance Dashboard — Constitutional Governance Layer Visibility
 * 
 * Read-only dashboard displaying the append-only, hash-chained governance log.
 * No interpretation layer — JSON displayed as-is.
 * 
 * Panels:
 * 1. Chain Status — real verification with VALID/INVALID indicator
 * 2. Feed — cursor-paginated log entries with filters
 * 3. Entry Detail — full metadata, raw JSON diff, hash chain, copy verification payload
 * 4. Snapshot History — list of cryptographic snapshots
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  ChevronDown, ChevronRight, ChevronLeft,
  Copy, Download, RefreshCw, Search,
  Clock, Hash, Link2, Eye, FileText,
  ArrowLeft, Loader2, CheckCircle2, XCircle,
  Lock, Fingerprint, Camera, AlertTriangle,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";

/* ═══════════════════════════════════════════════════════════════════
   Utility Functions
   ═══════════════════════════════════════════════════════════════════ */

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncateHash(hash: string, len = 12): string {
  if (!hash) return "—";
  if (hash.length <= len) return hash;
  return `${hash.slice(0, len / 2)}…${hash.slice(-len / 2)}`;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  threshold_change: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  data_stream_activation: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  data_stream_deactivation: "bg-red-500/15 text-red-400 border-red-500/30",
  data_stream_created: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  data_stream_deleted: "bg-red-500/15 text-red-400 border-red-500/30",
  data_stream_config_changed: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  signal_suppression: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  engine_toggle: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  engine_config_change: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  category_reclassification: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  version_change: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  population_rule_change: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  strategy_path_updated: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  pattern_candidate_status_changed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  pattern_strategy_boost: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
};

function getEventColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ═══════════════════════════════════════════════════════════════════
   Chain Status Panel
   ═══════════════════════════════════════════════════════════════════ */

function ChainStatusPanel() {
  const { data: status, isLoading, refetch, isFetching } = trpc.governance.dashboardChainStatus.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );
  const verifyMutation = trpc.governance.dashboardVerifyChain.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Chain verification complete");
    },
    onError: (err) => toast.error(`Verification failed: ${err.message}`),
  });

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Verifying hash chain integrity...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const isValid = status.valid;

  return (
    <Card className={`border ${isValid ? "border-emerald-500/30" : "border-red-500/30"}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Chain integrity indicator */}
            <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${
              isValid ? "bg-emerald-500/10" : "bg-red-500/10"
            }`}>
              {isValid ? (
                <ShieldCheck className="h-7 w-7 text-emerald-400" />
              ) : (
                <ShieldX className="h-7 w-7 text-red-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">
                  Hash Chain {isValid ? "VALID" : "BROKEN"}
                </h3>
                <Badge variant="outline" className={
                  isValid
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                }>
                  {isValid ? "INTEGRITY VERIFIED" : "INTEGRITY FAILURE"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  {status.totalEntries} entries
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" />
                  Last seq: #{status.lastSeqNo}
                </span>
                {status.lastEntryAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Last entry: {formatTimeAgo(status.lastEntryAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending || isFetching}
            className="gap-1.5"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Verify Now
          </Button>
        </div>

        {/* Break point details if chain is broken */}
        {!isValid && status.breakPoint && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
              <AlertTriangle className="h-4 w-4" />
              Chain Break Detected at Sequence #{status.breakPoint.seqNo}
            </div>
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              <div><span className="text-red-400">Reason:</span> {status.breakPoint.reason}</div>
              <div><span className="text-red-400">Expected:</span> {truncateHash(status.breakPoint.expected, 24)}</div>
              <div><span className="text-red-400">Actual:</span> {truncateHash(status.breakPoint.actual, 24)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Entry Detail Panel
   ═══════════════════════════════════════════════════════════════════ */

function EntryDetailPanel({
  seqNo,
  onClose,
}: {
  seqNo: number;
  onClose: () => void;
}) {
  const { data: entry, isLoading } = trpc.governance.dashboardEntry.useQuery(
    { seqNo },
    { enabled: seqNo > 0 }
  );

  const copyVerificationPayload = useCallback(() => {
    if (!entry) return;
    const payload = {
      seqNo: entry.seqNo,
      eventType: entry.eventType,
      component: entry.component,
      scope: entry.scope,
      previousState: entry.previousState,
      newState: entry.newState,
      rationale: entry.rationale,
      actorHash: entry.actorHash,
      actorRole: entry.actorRole,
      previousHash: entry.previousHash,
      entryHash: entry.entryHash,
      createdAt: entry.createdAt,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Verification payload copied to clipboard");
  }, [entry]);

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading entry #{seqNo}...</span>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6">
          <Button variant="ghost" size="sm" onClick={onClose} className="mb-4">
            <ChevronRight className="h-4 w-4 mr-1" /> Close
          </Button>
          <p className="text-muted-foreground">Entry not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-background border-l border-border z-50 overflow-y-auto shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold">
                Governance Entry #{entry.seqNo}
              </h3>
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(entry.createdAt)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={copyVerificationPayload} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy Verification Payload
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Event Classification */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Event Classification
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Event Type</div>
              <Badge variant="outline" className={`${getEventColor(entry.eventType)} text-xs`}>
                {formatEventType(entry.eventType)}
              </Badge>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Component</div>
              <span className="text-sm font-mono">{entry.component}</span>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Scope</div>
              <span className="text-sm font-mono">{entry.scope || "—"}</span>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Actor</div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs">{entry.actorRole}</Badge>
                <span className="text-xs font-mono text-muted-foreground">{truncateHash(entry.actorHash, 16)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Rationale */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Rationale
          </h4>
          <div className="p-3 rounded-lg bg-card border border-border">
            <p className="text-sm leading-relaxed">{entry.rationale}</p>
          </div>
        </section>

        {/* Hash Chain */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Hash Chain
          </h4>
          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry Hash (SHA-256)</div>
              <code className="text-xs font-mono text-emerald-400 break-all">{entry.entryHash}</code>
            </div>
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-1 text-muted-foreground">
                <ChevronUp className="h-3 w-3" />
                <span className="text-[10px]">chains to</span>
                <ChevronUp className="h-3 w-3" />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Previous Hash</div>
              <code className="text-xs font-mono text-amber-400 break-all">{entry.previousHash}</code>
            </div>
          </div>
        </section>

        {/* Previous State */}
        {entry.previousState !== null && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Previous State (Before)
            </h4>
            <div className="p-3 rounded-lg bg-card border border-border overflow-x-auto">
              <pre className="text-xs font-mono text-red-400/80 whitespace-pre-wrap break-all">
                {typeof entry.previousState === "string"
                  ? entry.previousState
                  : JSON.stringify(entry.previousState, null, 2)}
              </pre>
            </div>
          </section>
        )}

        {/* New State */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            New State (After)
          </h4>
          <div className="p-3 rounded-lg bg-card border border-border overflow-x-auto">
            <pre className="text-xs font-mono text-emerald-400/80 whitespace-pre-wrap break-all">
              {typeof entry.newState === "string"
                ? entry.newState
                : JSON.stringify(entry.newState, null, 2)}
            </pre>
          </div>
        </section>

        {/* Raw Entry (Full JSON) */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Raw Entry
          </h4>
          <div className="p-3 rounded-lg bg-card border border-border overflow-x-auto">
            <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all">
              {JSON.stringify(entry, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Feed Panel
   ═══════════════════════════════════════════════════════════════════ */

function FeedPanel({
  onSelectEntry,
}: {
  onSelectEntry: (seqNo: number) => void;
}) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [componentFilter, setComponentFilter] = useState<string>("");
  const [cursorStack, setCursorStack] = useState<(number | undefined)[]>([undefined]);

  const currentCursor = cursorStack[cursorStack.length - 1];

  const { data: eventTypes } = trpc.governance.dashboardEventTypes.useQuery();
  const { data: components } = trpc.governance.dashboardComponents.useQuery();

  const [queryInput] = useState(() => ({
    limit: 50 as const,
  }));

  const { data: feed, isLoading, isFetching } = trpc.governance.dashboardFeed.useQuery(
    {
      limit: queryInput.limit,
      cursor: currentCursor,
      eventType: eventTypeFilter || undefined,
      componentType: componentFilter || undefined,
    },
    { keepPreviousData: true }
  );

  const handleNextPage = useCallback(() => {
    if (feed?.nextCursor) {
      setCursorStack(prev => [...prev, feed.nextCursor]);
    }
  }, [feed?.nextCursor]);

  const handlePrevPage = useCallback(() => {
    if (cursorStack.length > 1) {
      setCursorStack(prev => prev.slice(0, -1));
    }
  }, [cursorStack.length]);

  // Reset cursor when filters change
  useEffect(() => {
    setCursorStack([undefined]);
  }, [eventTypeFilter, componentFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>

        <Select value={eventTypeFilter || "__all__"} onValueChange={(v) => setEventTypeFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All event types</SelectItem>
            {(eventTypes || []).map((et: string) => (
              <SelectItem key={et} value={et}>
                {formatEventType(et)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={componentFilter || "__all__"} onValueChange={(v) => setComponentFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="All components" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All components</SelectItem>
            {(components || []).map((c: string) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(eventTypeFilter || componentFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setEventTypeFilter("");
              setComponentFilter("");
            }}
          >
            Clear filters
          </Button>
        )}

        {feed && (
          <span className="text-xs text-muted-foreground ml-auto">
            {feed.total} total entries
          </span>
        )}
      </div>

      {/* Feed entries */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-muted/30 rounded-lg" />
          ))}
        </div>
      ) : !feed || feed.items.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="pt-6 text-center">
            <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No governance log entries{(eventTypeFilter || componentFilter) ? " matching filters" : ""}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-1">
            {feed.items.map((entry: any) => (
              <button
                key={entry.seqNo}
                onClick={() => onSelectEntry(entry.seqNo)}
                className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-border hover:bg-card/50 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">#{entry.seqNo}</span>
                      <Badge variant="outline" className={`${getEventColor(entry.eventType)} text-[10px] px-1.5 py-0`}>
                        {formatEventType(entry.eventType)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{entry.component}</span>
                    </div>
                    <p className="text-sm text-foreground/80 truncate">{entry.rationale}</p>
                    {entry.scope && (
                      <span className="text-[10px] font-mono text-muted-foreground">{entry.scope}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatTimeAgo(entry.createdAt)}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{entry.actorRole}</Badge>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {truncateHash(entry.entryHash, 12)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={cursorStack.length <= 1}
              className="gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>

            <span className="text-xs text-muted-foreground">
              Page {cursorStack.length} {isFetching && "(loading...)"}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!feed?.hasMore}
              className="gap-1.5"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Snapshot History Panel
   ═══════════════════════════════════════════════════════════════════ */

function SnapshotHistoryPanel() {
  const { data: snapshots, isLoading, refetch } = trpc.governance.dashboardSnapshots.useQuery();
  const createSnapshot = trpc.governance.createSnapshot.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Cryptographic snapshot created");
    },
    onError: (err) => toast.error(`Snapshot failed: ${err.message}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Camera className="h-4 w-4 text-indigo-400" />
          Cryptographic Snapshots
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createSnapshot.mutate({})}
          disabled={createSnapshot.isPending}
          className="gap-1.5"
        >
          {createSnapshot.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          Create Snapshot
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse bg-muted/30 rounded-lg" />
          ))}
        </div>
      ) : !snapshots || snapshots.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="pt-6 text-center">
            <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No snapshots yet. Create one to establish a cryptographic checkpoint.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap: any) => (
            <Card key={snap.id} className="border-border/50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[10px]">
                        Up to #{snap.upToSeqNo}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {snap.entryCount} entries
                      </span>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      <span className="text-emerald-400/70">Root: </span>
                      {truncateHash(snap.hashChainRoot, 24)}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      <span className="text-amber-400/70">Sig: </span>
                      {truncateHash(snap.signature, 24)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">{formatTimestamp(snap.createdAt)}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <Fingerprint className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {snap.signedBy ? truncateHash(snap.signedBy, 12) : "—"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{snap.signatureAlgorithm}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Export Panel
   ═══════════════════════════════════════════════════════════════════ */

function ExportPanel() {
  const { data: exportData, isLoading, refetch } = trpc.governance.exportLog.useQuery(undefined, {
    enabled: false,
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: "application/x-ndjson" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `governance-log-${new Date().toISOString().slice(0, 10)}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Governance log exported as JSONL");
      }
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [refetch]);

  return (
    <Card className="border-border/50">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Export for External Verification</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Download the full governance log as JSONL. Each line is a self-contained entry with hash chain data.
              Third parties can independently verify chain integrity by recomputing SHA-256 hashes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="gap-1.5 shrink-0"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export JSONL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Dashboard
   ═══════════════════════════════════════════════════════════════════ */

export default function GovernanceDashboard() {
  const { isAuthenticated, user, loading } = useAuth();
  const [selectedEntrySeqNo, setSelectedEntrySeqNo] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The Governance Dashboard requires admin access.
            </p>
            <a href={getLoginUrl("/mission-control/governance")}>
              <Button>Sign In</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/mission-control">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Mission Control
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h1 className="text-lg font-semibold">Governance Dashboard</h1>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                CONSTITUTIONAL LAYER
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-[140px]">
            Append-only, hash-chained, transaction-coupled governance log. Read-only. No interpretation layer.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Chain Status */}
        <ChainStatusPanel />

        {/* Two-column layout: Feed + Snapshots/Export */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Feed (2/3 width) */}
          <div className="lg:col-span-2">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-400" />
                  Governance Log Feed
                </CardTitle>
                <CardDescription className="text-xs">
                  All control-plane mutations, ordered by sequence number (newest first).
                  Click any entry to view full details.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FeedPanel onSelectEntry={setSelectedEntrySeqNo} />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: Snapshots + Export (1/3 width) */}
          <div className="space-y-6">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-indigo-400" />
                  Snapshots & Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SnapshotHistoryPanel />
              </CardContent>
            </Card>

            <ExportPanel />

            {/* Constitutional Articles Reference */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-400" />
                  Constitutional Articles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 1</span>
                    <span>Append-only — no UPDATE or DELETE</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 2</span>
                    <span>Transaction coupling — same db.transaction()</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 3</span>
                    <span>Mandatory rationale — 3+ words, no filler</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 4</span>
                    <span>Hash chain integrity — SHA-256 linked</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 5</span>
                    <span>Actor privacy — hashed identities</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 6</span>
                    <span>Public verifiability — open endpoints</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 7</span>
                    <span>Cryptographic snapshots — signed checkpoints</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 8</span>
                    <span>Event type validation — closed enum</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 9</span>
                    <span>No bypass paths — all mutations governed</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 10</span>
                    <span>Sequence integrity — monotonic ordering</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 11</span>
                    <span>Export capability — JSONL for external audit</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400/70 font-mono shrink-0">Art. 12</span>
                    <span>Router registration — all routers governed</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Entry Detail Slide-over */}
      {selectedEntrySeqNo !== null && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedEntrySeqNo(null)}
          />
          <EntryDetailPanel
            seqNo={selectedEntrySeqNo}
            onClose={() => setSelectedEntrySeqNo(null)}
          />
        </>
      )}
    </div>
  );
}
