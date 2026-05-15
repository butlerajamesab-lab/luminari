/**
 * CDA Run Detail — /cda/:id
 *
 * Renders O1–O4 markdown sections, T7 resolution stats,
 * run_complete flag, and one-liner framing summary.
 * Read-only. No editing. No procedural queue. No DRG.
 */

import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  FileText,
  BarChart3,
  Shield,
  Flag,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

// ─── Status helpers ───

function getStatusBadge(status: string) {
  if (status === "complete") return { icon: CheckCircle2, color: "text-emerald-400 border-emerald-400/30", label: "Complete" };
  if (status === "incomplete") return { icon: AlertTriangle, color: "text-amber-400 border-amber-400/30", label: "Incomplete" };
  if (status.startsWith("error")) return { icon: XCircle, color: "text-red-400 border-red-400/30", label: "Error" };
  return { icon: Clock, color: "text-blue-400 border-blue-400/30", label: status.replace(/_/g, " ") };
}

// ─── Markdown renderer with forensic styling ───

function ForensicMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-headings:text-foreground prose-headings:font-semibold prose-headings:border-b prose-headings:border-border prose-headings:pb-2 prose-headings:mb-4
      prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
      prose-p:text-muted-foreground prose-p:leading-relaxed
      prose-strong:text-foreground
      prose-table:border prose-table:border-border
      prose-th:bg-muted/30 prose-th:text-xs prose-th:font-medium prose-th:uppercase prose-th:tracking-wider prose-th:p-2 prose-th:text-left prose-th:border prose-th:border-border
      prose-td:p-2 prose-td:text-sm prose-td:border prose-td:border-border prose-td:text-muted-foreground
      prose-li:text-muted-foreground prose-li:text-sm
      prose-code:text-primary prose-code:bg-muted/30 prose-code:px-1 prose-code:rounded prose-code:text-xs
      prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/10 prose-blockquote:py-1 prose-blockquote:px-4
    ">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

// ─── T7 Stats Card ───

function T7StatsPanel({ runId }: { runId: number }) {
  const { data: stats } = trpc.cda.getT7Stats.useQuery({ runId });

  if (!stats) return null;

  const matchTypes = [
    { key: "supported", label: "Supported", color: "bg-emerald-500/20 text-emerald-400" },
    { key: "partially_supported", label: "Partially Supported", color: "bg-amber-500/20 text-amber-400" },
    { key: "unsupported", label: "Unsupported", color: "bg-red-500/20 text-red-400" },
    { key: "ambiguous", label: "Ambiguous", color: "bg-purple-500/20 text-purple-400" },
    { key: "not_assessable", label: "Not Assessable", color: "bg-muted text-muted-foreground" },
    { key: "not_assessed", label: "Not Yet Assessed", color: "bg-muted text-muted-foreground" },
  ];

  const resolutionMethods = [
    { key: "deterministic", label: "Deterministic", color: "bg-blue-500/20 text-blue-400" },
    { key: "llm_assisted", label: "LLM Assisted", color: "bg-violet-500/20 text-violet-400" },
    { key: "fallback_ambiguous", label: "Fallback Ambiguous", color: "bg-orange-500/20 text-orange-400" },
    { key: "pending", label: "Pending", color: "bg-muted text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">T7 Resolution Statistics</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {stats.totalComparisons} total comparison{stats.totalComparisons !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Match Type Distribution */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Match Type</p>
          {matchTypes.map(({ key, label, color }) => {
            const count = stats.byMatchType[key] ?? 0;
            if (count === 0) return null;
            const pct = stats.totalComparisons > 0 ? Math.round((count / stats.totalComparisons) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${color} border-0 min-w-[100px] justify-center`}>
                  {label}
                </Badge>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color.split(" ")[0]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Resolution Method Distribution */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Resolution Method</p>
          {resolutionMethods.map(({ key, label, color }) => {
            const count = stats.byResolutionMethod[key] ?? 0;
            if (count === 0) return null;
            const pct = stats.totalComparisons > 0 ? Math.round((count / stats.totalComparisons) * 100) : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${color} border-0 min-w-[100px] justify-center`}>
                  {label}
                </Badge>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color.split(" ")[0]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── One-Liner Framing ───

function FramingSummary({ runId }: { runId: number }) {
  const { data } = trpc.cda.getFramingSummary.useQuery({ runId });

  if (!data) return null;

  return (
    <div className="border border-border rounded-lg bg-muted/10 px-4 py-3">
      <p className="text-sm text-foreground">
        This denial references{" "}
        <span className="font-semibold text-primary">{data.clauseCount} clause{data.clauseCount !== 1 ? "s" : ""}</span>
        {" "}and leaves{" "}
        <span className="font-semibold text-amber-400">{data.gapCount} evidence gap{data.gapCount !== 1 ? "s" : ""}</span>
        {data.criticalGapCount > 0 && (
          <span className="text-red-400"> ({data.criticalGapCount} critical)</span>
        )}
        .
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
        Derived from S6/S7 — not legal advice, not an advisory opinion
      </p>
    </div>
  );
}

// ─── Main Component ───

export default function CdaRunDetail() {
  const { user } = useAuth();
  const [, params] = useRoute("/cda/:id");
  const [, setLocation] = useLocation();
  const runId = params?.id ? parseInt(params.id, 10) : 0;

  const { data: bundle, isLoading } = trpc.cda.getRunBundle.useQuery(
    { runId },
    { enabled: !!user && runId > 0 }
  );

  const [activeTab, setActiveTab] = useState("o1");

  const handleDownload = () => {
    window.open(`/api/cda/export/${runId}`, "_blank");
    toast.info(`Downloading CDA run #${runId} bundle.`);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!bundle || !bundle.run) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/cda")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to runs
        </Button>
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">Run not found or access denied.</p>
        </div>
      </div>
    );
  }

  const { run, artifacts } = bundle;
  const sb = getStatusBadge(run.status);
  const StatusIcon = sb.icon;
  const flags = (run.activeFailureFlags as string[] | null) ?? [];
  const isTerminal = ["complete", "incomplete"].includes(run.status) || run.status.startsWith("error");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/cda")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold">CDA Run #{run.id}</h1>
            <Badge variant="outline" className={`${sb.color} gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {sb.label}
            </Badge>
            {run.endConditionMet && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 gap-1">
                <Shield className="h-3 w-3" /> End Condition Met
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-11">
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
            <span className="font-mono">Spec {run.specVersion}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTerminal && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Export Bundle
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setLocation(`/lumensend?type=appeal&context=cda_denial&contextId=${runId}&state=`)}
              >
                <Send className="h-4 w-4 mr-2" /> Appeal This Denial
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Failure Flags */}
      {flags.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Flag className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Active Failure Flags</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {flags.map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs text-amber-400 border-amber-400/30">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {typeof run.errorMessage === 'string' && run.errorMessage && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Error</span>
          </div>
          <p className="text-xs text-red-300 font-mono">{String(run.errorMessage)}</p>
        </div>
      )}

      {/* One-Liner Framing */}
      <FramingSummary runId={runId} />

      {/* T7 Stats */}
      <T7StatsPanel runId={runId} />

      {/* O1–O4 Artifact Tabs */}
      {artifacts ? (
        <div className="border border-border rounded-lg">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b border-border px-4">
              <TabsList className="bg-transparent h-10 gap-1">
                <TabsTrigger value="o1" className="text-xs data-[state=active]:bg-muted">
                  <FileText className="h-3 w-3 mr-1.5" />
                  O1: Claim Ledger
                </TabsTrigger>
                <TabsTrigger value="o2" className="text-xs data-[state=active]:bg-muted">
                  <BarChart3 className="h-3 w-3 mr-1.5" />
                  O2: Comparison Matrix
                </TabsTrigger>
                <TabsTrigger value="o3" className="text-xs data-[state=active]:bg-muted">
                  <AlertTriangle className="h-3 w-3 mr-1.5" />
                  O3: Gaps & Contradictions
                </TabsTrigger>
                <TabsTrigger value="o4" className="text-xs data-[state=active]:bg-muted">
                  <Shield className="h-3 w-3 mr-1.5" />
                  O4: Advocacy Outline
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="o1" className="p-4 m-0">
              <ForensicMarkdown content={artifacts.O1_structured_claim_ledger} />
            </TabsContent>
            <TabsContent value="o2" className="p-4 m-0">
              <ForensicMarkdown content={artifacts.O2_policy_denial_comparison_matrix} />
            </TabsContent>
            <TabsContent value="o3" className="p-4 m-0">
              <ForensicMarkdown content={artifacts.O3_evidence_gaps_contradictions} />
            </TabsContent>
            <TabsContent value="o4" className="p-4 m-0">
              <ForensicMarkdown content={artifacts.O4_advocacy_packet_outline} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          {isTerminal ? (
            <>
              <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Artifacts could not be generated for this run.
                {'error' in bundle && typeof (bundle as Record<string, unknown>).error === 'string' && (
                  <span className="block text-xs text-red-400 mt-1 font-mono">{(bundle as Record<string, unknown>).error as string}</span>
                )}
              </p>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 text-blue-400 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Pipeline is still running. Artifacts will appear when processing completes.
              </p>
            </>
          )}
        </div>
      )}

      {/* LumenSend Action Banner */}
      {isTerminal && artifacts && (
        <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Ready to take action?</p>
                <p className="text-xs text-muted-foreground">LumenSend can draft an appeal letter using this denial analysis as context.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/lumensend?type=complaint&context=cda_denial&contextId=${runId}`)}
              >
                <Send className="h-3 w-3 mr-1" /> File Complaint
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setLocation(`/lumensend?type=appeal&context=cda_denial&contextId=${runId}`)}
              >
                <Send className="h-3 w-3 mr-1" /> Draft Appeal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unmet Criteria */}
      {Array.isArray(run.unmetCriteria) && (run.unmetCriteria as string[]).length > 0 && (
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Unmet End Conditions
          </h3>
          <ul className="space-y-1">
            {(run.unmetCriteria as string[]).map((c: string, i: number) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
