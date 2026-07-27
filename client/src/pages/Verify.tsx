// @ts-nocheck
/**
 * Public Verification Page — /verify
 * 
 * Fully public, read-only. No login required. No interpretation. No mutation.
 * 
 * Sections:
 * 1. Chain Status — VALID/BROKEN with verify button
 * 2. Recent Entries — last 25 with click-to-detail
 * 3. Entry Detail — full metadata + Copy Verification Payload
 * 4. Export — Download Governance Log (JSONL)
 * 5. Verifier Script — Downloadable verify.js
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, ShieldCheck, ShieldX,
  Copy, Download, RefreshCw,
  Clock, Hash, Eye, FileText,
  ChevronDown, ChevronRight,
  Loader2, CheckCircle2, XCircle,
  Terminal, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

/* ═══════════════════════════════════════════════════════════════════
   Utility Functions
   ═══════════════════════════════════════════════════════════════════ */

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function truncateHash(hash: string, len = 16): string {
  if (!hash || hash.length <= len) return hash;
  return hash.substring(0, len) + "...";
}

function parseScopeField(scope: string | null): { type: string; id: string } {
  if (!scope) return { type: "global", id: "" };
  const idx = scope.indexOf(":");
  if (idx === -1) return { type: scope, id: "" };
  return { type: scope.substring(0, idx), id: scope.substring(idx + 1) };
}

/* ═══════════════════════════════════════════════════════════════════
   Verifier Script Content — loaded from static file to avoid bundler
   processing Node.js code (require, process.exit, etc.)
   The actual script lives in client/public/verify.js and is fetched at runtime.
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   Section 1: Chain Status
   ═══════════════════════════════════════════════════════════════════ */

function ChainStatusSection() {
  const chainQuery = trpc.constitutionalGovernance.verifyChain.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [verifying, setVerifying] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setManualResult(null);
    try {
      // Re-fetch the chain verification
      const result = await chainQuery.refetch();
      setManualResult(result.data);
      toast.success("Chain verification complete");
    } catch (err) {
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  }, [chainQuery]);

  const data = manualResult ?? chainQuery.data;
  const isValid = data?.valid;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Chain Integrity Status</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || chainQuery.isLoading}
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Verify Chain
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {chainQuery.isLoading && !data ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying chain integrity...
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex items-center gap-3">
              {isValid ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <ShieldCheck className="h-6 w-6 text-emerald-400" />
                  <span className="text-lg font-semibold text-emerald-400">VALID</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500/10 border border-red-500/30">
                  <ShieldX className="h-6 w-6 text-red-400" />
                  <span className="text-lg font-semibold text-red-400">BROKEN</span>
                </div>
              )}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Entries</div>
                <div className="text-xl font-mono font-semibold">{data.totalEntries}</div>
              </div>
              <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last Valid seq_no</div>
                <div className="text-xl font-mono font-semibold">{data.lastValidSeqNo}</div>
              </div>
            </div>

            {/* Break Point (if chain is broken) */}
            {!isValid && data.breakPoint && (
              <div className="p-4 rounded-md bg-red-500/5 border border-red-500/20 space-y-2">
                <div className="flex items-center gap-2 text-red-400 font-semibold">
                  <XCircle className="h-4 w-4" />
                  Break Point: seq_no {data.breakPoint.seqNo}
                </div>
                <div className="space-y-1 text-sm font-mono">
                  <div>
                    <span className="text-muted-foreground">expected: </span>
                    <span className="text-foreground break-all">{data.breakPoint.expected}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">actual:   </span>
                    <span className="text-red-400 break-all">{data.breakPoint.actual}</span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {data.breakPoint.reason}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Section 3: Entry Detail (used by Section 2)
   ═══════════════════════════════════════════════════════════════════ */

function EntryDetailPanel({ seqNo, onClose }: { seqNo: number; onClose: () => void }) {
  const { data: entry, isLoading } = trpc.constitutionalGovernance.publicEntryDetail.useQuery({ seqNo });

  const handleCopyPayload = useCallback(() => {
    if (!entry) return;
    const scope = parseScopeField(entry.scope);
    const payload = {
      seq_no: entry.seqNo,
      entry_hash: entry.entryHash,
      previous_hash: entry.previousHash,
      event_type: entry.eventType,
      component_type: entry.component,
      component_id: scope.id || entry.component,
      created_at: new Date(entry.createdAt).toISOString(),
      scope: { type: scope.type, id: scope.id },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Verification payload copied to clipboard");
  }, [entry]);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!entry) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 text-center text-muted-foreground">
          Entry not found.
        </CardContent>
      </Card>
    );
  }

  const scope = parseScopeField(entry.scope);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Entry Detail — seq_no {entry.seqNo}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyPayload}>
              <Copy className="h-4 w-4 mr-1" />
              Copy Verification Payload
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MetadataField label="seq_no" value={String(entry.seqNo)} mono />
            <MetadataField label="event_type" value={entry.eventType} />
            <MetadataField label="component_type" value={entry.component} />
            <MetadataField label="component_id" value={scope.id || "—"} />
            <MetadataField label="scope.type" value={scope.type} />
            <MetadataField label="scope.id" value={scope.id || "—"} />
            <MetadataField label="actor_role" value={entry.actorRole} />
            <MetadataField label="created_at" value={new Date(entry.createdAt).toISOString()} />
          </div>

          {/* Hash Chain */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Hash Chain</div>
            <div className="p-3 rounded-md bg-muted/20 border border-border/50 space-y-2 font-mono text-sm">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-28">entry_hash:</span>
                <span className="break-all text-foreground">{entry.entryHash}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-28">previous_hash:</span>
                <span className="break-all text-foreground">{entry.previousHash}</span>
              </div>
            </div>
          </div>

          {/* Actor Hash */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Actor</div>
            <div className="p-3 rounded-md bg-muted/20 border border-border/50 font-mono text-sm">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 w-28">actor_hash:</span>
                <span className="break-all text-foreground">{entry.actorHash}</span>
              </div>
            </div>
          </div>

          {/* Rationale */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Rationale</div>
            <div className="p-3 rounded-md bg-muted/20 border border-border/50 text-sm">
              {entry.rationale}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-2 rounded bg-muted/20 border border-border/30">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Section 2: Recent Entries
   ═══════════════════════════════════════════════════════════════════ */

function RecentEntriesSection({ onSelectEntry }: { onSelectEntry: (seqNo: number) => void }) {
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const { data, isLoading } = trpc.constitutionalGovernance.publicRecentEntries.useQuery(
    { limit: 25, cursor },
    { refetchOnWindowFocus: false }
  );

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Recent Governance Entries</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading entries...
          </div>
        ) : !data?.items?.length ? (
          <div className="text-center text-muted-foreground py-8">
            No governance entries recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="py-2 pr-3">seq_no</th>
                    <th className="py-2 pr-3">event_type</th>
                    <th className="py-2 pr-3">component</th>
                    <th className="py-2 pr-3 hidden md:table-cell">scope</th>
                    <th className="py-2 pr-3 hidden lg:table-cell">created_at</th>
                    <th className="py-2 pr-3">entry_hash</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => {
                    const scope = parseScopeField(entry.scope);
                    return (
                      <tr
                        key={entry.seqNo}
                        className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => onSelectEntry(entry.seqNo)}
                      >
                        <td className="py-2.5 pr-3 font-mono font-semibold">{entry.seqNo}</td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className="text-xs font-mono">
                            {entry.eventType}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{entry.component}</td>
                        <td className="py-2.5 pr-3 hidden md:table-cell text-xs text-muted-foreground">
                          {scope.type}{scope.id ? `:${scope.id}` : ""}
                        </td>
                        <td className="py-2.5 pr-3 hidden lg:table-cell text-xs text-muted-foreground">
                          {formatTimestamp(entry.createdAt)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                          {truncateHash(entry.entryHash)}
                        </td>
                        <td className="py-2.5">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Showing {data.items.length} entries
              </div>
              <div className="flex gap-2">
                {cursor && (
                  <Button variant="outline" size="sm" onClick={() => setCursor(undefined)}>
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    First Page
                  </Button>
                )}
                {data.hasMore && data.nextCursor && (
                  <Button variant="outline" size="sm" onClick={() => setCursor(data.nextCursor)}>
                    Load More
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Section 4: Export
   ═══════════════════════════════════════════════════════════════════ */

function ExportSection() {
  const [exporting, setExporting] = useState(false);
  const exportQuery = trpc.constitutionalGovernance.publicExportLog.useQuery(undefined, {
    enabled: false, // only fetch on demand
  });

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: "application/jsonl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `governance-log-${new Date().toISOString().split("T")[0]}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Governance log exported");
      }
    } catch (err) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }, [exportQuery]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Export</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download the full governance log as JSONL for external verification. 
            Each line is one JSON object, ordered by seq_no ascending. 
            Fields use snake_case naming for interoperability.
          </p>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download Governance Log (JSONL)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Section 5: Verifier Script
   ═══════════════════════════════════════════════════════════════════ */

function VerifierScriptSection() {
  const [expanded, setExpanded] = useState(false);
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadScript = useCallback(async () => {
    if (scriptContent) return scriptContent;
    setLoading(true);
    try {
      const res = await fetch("/verify.js");
      const text = await res.text();
      setScriptContent(text);
      return text;
    } catch {
      toast.error("Failed to load verifier script");
      return null;
    } finally {
      setLoading(false);
    }
  }, [scriptContent]);

  const handleDownload = useCallback(async () => {
    const text = await loadScript();
    if (!text) return;
    const blob = new Blob([text], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "verify.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Verifier script downloaded");
  }, [loadScript]);

  const handleExpand = useCallback(async () => {
    if (!expanded && !scriptContent) await loadScript();
    setExpanded(!expanded);
  }, [expanded, scriptContent, loadScript]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Verifier Script</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download the standalone verification script. It recomputes SHA-256 hashes 
            and verifies previous_hash linkage for every entry. Requires Node.js.
          </p>
          <div className="p-3 rounded-md bg-muted/20 border border-border/50 font-mono text-xs text-muted-foreground space-y-1">
            <div>$ node verify.js governance-log.jsonl</div>
            <div className="text-emerald-400">VALID — 4 entries verified</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download verify.js
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExpand}
              disabled={loading}
            >
              {expanded ? "Hide Source" : "View Source"}
              {expanded ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
          {expanded && scriptContent && (
            <div className="mt-3 p-4 rounded-md bg-muted/10 border border-border/50 overflow-x-auto">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre">{scriptContent}</pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════════ */

export default function Verify() {
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Home
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Public Verification</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Independent, read-only verification of governance chain integrity. No login required.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Section 1: Chain Status */}
        <ChainStatusSection />

        {/* Section 2: Recent Entries */}
        <RecentEntriesSection onSelectEntry={setSelectedEntry} />

        {/* Section 3: Entry Detail (shown when an entry is selected) */}
        {selectedEntry !== null && (
          <EntryDetailPanel
            seqNo={selectedEntry}
            onClose={() => setSelectedEntry(null)}
          />
        )}

        {/* Section 4 & 5: Export + Verifier Script */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ExportSection />
          <VerifierScriptSection />
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border/30">
          Luminari Forensic Engine — Governance Verification Layer
        </div>
      </div>
    </div>
  );
}
