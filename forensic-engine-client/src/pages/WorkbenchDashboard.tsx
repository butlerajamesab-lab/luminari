// @ts-nocheck — pre-existing type drift, to be resolved in UI type alignment pass
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, ArrowRight, FileText, Users, Scale, Target,
  AlertTriangle, CheckCircle2, Circle, Clock, Wrench,
  FlaskConical, Eye, Compass, Shield, Network, BarChart3,
  BookOpen, Gavel, Search, MessageCircle, Send,
  ChevronRight, Sparkles, Loader2, MapPin, Briefcase,
  Upload, Layers, Zap, Flag, Link2, CalendarClock,
  ClipboardList, FolderOpen, XCircle, CheckSquare,
  Siren, Route, Building2, ExternalLink, Play, Pause, RotateCcw,
  Calculator, ScrollText, DollarSign, TrendingUp, Hash, Copy,
  Download, Globe, BarChart, Wand2, FileDown, Map,
  ThumbsDown, Edit3, FileOutput, Activity, Gauge, ShieldCheck,
  ArrowUpRight, Landmark, ListChecks, Brain, Workflow, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLoginUrl } from "@/const";

/* ═══════════════════════════════════════════════════════════════════════
   WORKBENCH DASHBOARD — Unified Case Workspace
   
   Five panels:
   1. Case Summary — what is known
   2. Parts Checklist — what is present / missing
   3. Evidence Panel — documents, proof links, timeline
   4. Tools Drawer — available tools for this case
   5. Next Steps — what comes next based on case state
   
   Design: "Always show what is known, what is missing, what comes next."
   ═══════════════════════════════════════════════════════════════════════ */

const wb = {
  bg: "#0c1015",
  cardBg: "rgba(255,248,235,0.025)",
  cardBorder: "rgba(212,180,80,0.10)",
  gold: "#d4a017",
  amber: "#c9952a",
  warm: "#e8c87a",
  cream: "#f5edd6",
  muted: "#8b8070",
  teal: "#0e7490",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#a855f7",
  cyan: "#06b6d4",
};
const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

// ─── Stat Card ───
function StatCard({ label, value, icon: Icon, color, href, onClick }: {
  label: string; value: number | string; icon: React.ElementType;
  color: string; href?: string; onClick?: () => void;
}) {
  const Wrapper = href || onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      style={{
        background: wb.cardBg,
        border: `1px solid ${wb.cardBorder}`,
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: href || onClick ? "pointer" : "default",
        transition: "all 0.15s",
        textAlign: "left" as const,
        width: "100%",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `${color}12`, border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600, color: wb.cream, lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginTop: 2 }}>
          {label}
        </div>
      </div>
      {(href || onClick) && <ChevronRight size={14} color={wb.muted} />}
    </Wrapper>
  );
}

// ─── Next Step Card ───
function NextStepCard({ step, onNavigate }: {
  step: { priority: number; action: string; description: string; href: string; category: string };
  onNavigate: (href: string) => void;
}) {
  const categoryColors: Record<string, string> = {
    evidence: wb.purple,
    analysis: wb.cyan,
    records: wb.amber,
    checklist: wb.teal,
    paperwork: wb.green,
    resources: "#f59e0b",
  };
  const categoryIcons: Record<string, React.ElementType> = {
    evidence: FlaskConical,
    analysis: Eye,
    records: FolderOpen,
    checklist: ClipboardList,
    paperwork: FileText,
    resources: Shield,
  };
  const color = categoryColors[step.category] || wb.muted;
  const Icon = categoryIcons[step.category] || Target;

  return (
    <button
      onClick={() => onNavigate(step.href)}
      style={{
        background: wb.cardBg,
        border: `1px solid ${wb.cardBorder}`,
        borderRadius: 8,
        padding: "14px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        cursor: "pointer",
        textAlign: "left" as const,
        width: "100%",
        transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${color}12`, border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 2,
      }}>
        <Icon size={16} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream }}>
            {step.action}
          </span>
          <span style={{
            fontFamily: fontMono, fontSize: 8, letterSpacing: "0.1em",
            textTransform: "uppercase" as const, color, background: `${color}15`,
            padding: "1px 6px", borderRadius: 100,
          }}>
            {step.category}
          </span>
        </div>
        <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, lineHeight: 1.5 }}>
          {step.description}
        </p>
      </div>
      <ArrowRight size={14} color={wb.muted} style={{ flexShrink: 0, marginTop: 6 }} />
    </button>
  );
}

// ─── Evidence Item Row ───
function EvidenceRow({ item, onNavigate }: {
  item: { id: number; evidenceType: string; title: string; description: string | null; sourceName: string | null; sourceDate: number | null; proofLinkCount: number; eventLinkCount: number };
  onNavigate: (href: string) => void;
}) {
  const typeColors: Record<string, string> = {
    document: wb.purple,
    testimony: wb.cyan,
    physical: wb.amber,
    digital: wb.teal,
    financial: wb.green,
  };
  const color = typeColors[item.evidenceType] || wb.muted;

  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: 6,
      background: "rgba(255,255,255,0.015)",
      border: `1px solid ${wb.cardBorder}`,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream, lineHeight: 1.3 }}>
          {item.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{
            fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em",
            textTransform: "uppercase" as const, color,
          }}>
            {item.evidenceType}
          </span>
          {item.sourceName && (
            <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>
              {item.sourceName}
            </span>
          )}
          {item.sourceDate && (
            <span style={{ fontFamily: fontMono, fontSize: 9, color: `${wb.muted}80` }}>
              {new Date(item.sourceDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {item.proofLinkCount > 0 && (
          <span style={{
            fontFamily: fontMono, fontSize: 9, color: wb.purple,
            background: `${wb.purple}15`, padding: "2px 6px", borderRadius: 100,
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <Link2 size={9} /> {item.proofLinkCount}
          </span>
        )}
        {item.eventLinkCount > 0 && (
          <span style={{
            fontFamily: fontMono, fontSize: 9, color: wb.cyan,
            background: `${wb.cyan}15`, padding: "2px 6px", borderRadius: 100,
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <CalendarClock size={9} /> {item.eventLinkCount}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Checklist Item Row ───
function ChecklistRow({ item }: {
  item: { id: number; label: string; completed: boolean; category: string | null; notes: string | null };
}) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 6,
      background: item.completed ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.015)",
      border: `1px solid ${item.completed ? "rgba(34,197,94,0.15)" : wb.cardBorder}`,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      {item.completed ? (
        <CheckCircle2 size={16} color={wb.green} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : (
        <Circle size={16} color={wb.muted} style={{ flexShrink: 0, marginTop: 1 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: fontSans, fontSize: 13, color: item.completed ? wb.muted : wb.cream,
          textDecoration: item.completed ? "line-through" : "none",
        }}>
          {item.label}
        </span>
        {item.category && (
          <span style={{
            fontFamily: fontMono, fontSize: 8, letterSpacing: "0.08em",
            textTransform: "uppercase" as const, color: wb.muted,
            marginLeft: 8,
          }}>
            {item.category}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Missing Record Row ───
function MissingRecordRow({ item }: {
  item: { id: number; recordType: string; description: string; severity: string; suggestedSource: string | null };
}) {
  const sevColors: Record<string, string> = { critical: wb.red, high: "#f59e0b", medium: wb.amber, low: wb.muted };
  const color = sevColors[item.severity] || wb.muted;

  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 6,
      background: `${color}06`,
      border: `1px solid ${color}18`,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <XCircle size={14} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>
            {item.recordType}
          </span>
          <span style={{
            fontFamily: fontMono, fontSize: 8, letterSpacing: "0.08em",
            textTransform: "uppercase" as const, color,
            background: `${color}15`, padding: "1px 5px", borderRadius: 100,
          }}>
            {item.severity}
          </span>
        </div>
        <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, lineHeight: 1.4 }}>
          {item.description}
        </p>
        {item.suggestedSource && (
          <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.amber, marginTop: 3 }}>
            Suggested source: {item.suggestedSource}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tools Drawer ───
const TOOLS = [
  { label: "Case Resolution", href: "/resolve", icon: Target, color: wb.cyan, desc: "Guided claim matching and resolution" },
  { label: "Document Upload", href: "/upload", icon: Upload, color: wb.purple, desc: "Upload and process new documents" },
  { label: "Timeline Builder", href: "/timeline", icon: BarChart3, color: wb.teal, desc: "Chronological event timeline" },
  { label: "Entity Explorer", href: "/entities", icon: Network, color: wb.amber, desc: "People, organizations, and roles" },
  { label: "Proof Frameworks", href: "/proof-frameworks", icon: Search, color: wb.green, desc: "Map evidence to legal elements" },
  { label: "Filing Generator", href: "/filing-generator", icon: Gavel, color: "#f59e0b", desc: "Generate complaints and appeals" },
  { label: "LumenSend", href: "/lumensend", icon: Send, color: "#34d399", desc: "Pre-filled letters and filings" },
  { label: "FOIA Tracking", href: "/foia", icon: FolderOpen, color: wb.amber, desc: "Record requests and tracking" },
  { label: "Statement of Facts", href: "/narrative", icon: BookOpen, color: wb.purple, desc: "Generate formal narrative" },
  { label: "Findings", href: "/findings", icon: Sparkles, color: wb.red, desc: "Contradictions and anomalies" },
  { label: "Control Room", href: "/control-room", icon: Eye, color: wb.cyan, desc: "Full analysis dashboard" },
  { label: "Deadline Calculator", href: "/deadline-calculator", icon: CalendarClock, color: wb.red, desc: "SOL and filing deadlines" },
  { label: "Benefits Navigator", href: "/benefits", icon: Shield, color: wb.teal, desc: "Available programs and benefits" },
  { label: "Diagnostics", href: "/diagnostics", icon: Eye, color: wb.green, desc: "Structural pattern analysis" },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

// ─── Strategy Review Panel ───────────────────────────────────────────────────
function StrategyReviewPanel({ caseId }: { caseId: number }) {
  const dashQ = trpc.systemicStrategy.dashboard.useQuery();
  const evaluateMut = trpc.systemicStrategy.evaluateAll.useMutation();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [modifyNotes, setModifyNotes] = useState("");
  const detailQ = trpc.systemicStrategy.detail.useQuery(
    { pathId: selectedPath || "" },
    { enabled: !!selectedPath }
  );
  const updateStepMut = trpc.systemicStrategy.updateStep.useMutation();
  const updatePathMut = trpc.systemicStrategy.updatePathStatus.useMutation();
  const approveMut = trpc.operationalWorkflow.approveStrategy.useMutation();
  const rejectMut = trpc.operationalWorkflow.rejectStrategy.useMutation();
  const modifyMut = trpc.operationalWorkflow.modifyStrategy.useMutation();
  const exportMut = trpc.operationalWorkflow.exportStrategyPlan.useMutation();
  const workflowQ = trpc.operationalWorkflow.workflowState.useQuery({ caseId });
  const evidenceConfQ = trpc.operationalWorkflow.evidenceConfidence.useQuery({ caseId });
  const primaryActionQ = trpc.operationalWorkflow.primaryAction.useQuery({ caseId });
  const utils = trpc.useUtils();

  // ── Memory Overlay queries ──
  const [showHistorical, setShowHistorical] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const patternType = detailQ.data?.pattern?.patternType || "";
  const histGuidanceQ = trpc.memoryOverlay.historicalGuidance.useQuery(
    { patternType, limit: 5 },
    { enabled: !!patternType && showHistorical }
  );
  const compareQ = trpc.memoryOverlay.compareStrategy.useQuery(
    { pathId: selectedPath || "" },
    { enabled: !!selectedPath && showCompare }
  );
  const applyHistMut = trpc.memoryOverlay.applyHistoricalStrategy.useMutation({
    onSuccess: () => {
      utils.systemicStrategy.detail.invalidate();
      utils.systemicStrategy.dashboard.invalidate();
    },
  });

  const dash = dashQ.data;
  const paths = dash?.paths || [];
  const detail = detailQ.data;
  const workflow = workflowQ.data;
  const evConf = evidenceConfQ.data;
  const primaryAction = primaryActionQ.data;

  const handleEvaluate = async () => {
    await evaluateMut.mutateAsync();
    utils.systemicStrategy.dashboard.invalidate();
  };

  const handleStepUpdate = async (stepId: string, status: string) => {
    await updateStepMut.mutateAsync({ stepId, status });
    utils.systemicStrategy.detail.invalidate();
  };

  const handleApprove = async (pathId: string) => {
    await approveMut.mutateAsync({ pathId, caseId });
    utils.systemicStrategy.dashboard.invalidate();
    utils.systemicStrategy.detail.invalidate();
    utils.operationalWorkflow.workflowState.invalidate();
  };

  const handleReject = async (pathId: string) => {
    await rejectMut.mutateAsync({ pathId, reason: rejectReason });
    setShowReject(false);
    setRejectReason("");
    utils.systemicStrategy.dashboard.invalidate();
    utils.systemicStrategy.detail.invalidate();
  };

  const handleModify = async (pathId: string) => {
    await modifyMut.mutateAsync({ pathId, modifications: { notes: modifyNotes } });
    setShowModify(false);
    setModifyNotes("");
    utils.systemicStrategy.detail.invalidate();
  };

  const handleExport = async (pathId: string) => {
    const result = await exportMut.mutateAsync({ pathId, caseId });
    if (result.documentContent) {
      const blob = new Blob([result.documentContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `strategy-plan-${pathId.slice(0, 8)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (dashQ.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Loader2 size={24} color={wb.gold} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>Loading strategies...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header + Evaluate Button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Route size={16} color={wb.gold} />
          <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
            Strategy Paths ({paths.length})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleEvaluate}
          disabled={evaluateMut.isPending}
          style={{ borderColor: `${wb.gold}40`, color: wb.gold }}
        >
          {evaluateMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          Evaluate Patterns
        </Button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total", value: dash?.total || 0, color: wb.cream },
          { label: "Pending", value: paths.filter((p: any) => p.status === "pending_review").length, color: wb.amber },
          { label: "Executing", value: paths.filter((p: any) => p.status === "executing").length, color: wb.teal },
          { label: "Completed", value: paths.filter((p: any) => p.status === "completed").length, color: wb.green },
        ].map((s) => (
          <div key={s.label} style={{
            background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
            padding: "12px 14px", textAlign: "center",
          }}>
            <div style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Two-column: Path list + Detail */}
      <div style={{ display: "grid", gridTemplateColumns: selectedPath ? "1fr 1.2fr" : "1fr", gap: 16 }}>
        {/* Path List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paths.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8 }}>
              <Route size={28} color={wb.muted} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>No strategy paths generated yet. Click "Evaluate Patterns" to analyze active patterns.</p>
            </div>
          ) : (
            paths.map((p: any) => {
              const statusColor = p.status === "completed" ? wb.green : p.status === "executing" ? wb.teal : p.status === "pending_review" ? wb.amber : wb.muted;
              return (
                <button
                  key={p.path_id}
                  onClick={() => setSelectedPath(p.path_id)}
                  style={{
                    background: selectedPath === p.path_id ? `${wb.gold}08` : wb.cardBg,
                    border: `1px solid ${selectedPath === p.path_id ? `${wb.gold}40` : wb.cardBorder}`,
                    borderRadius: 8, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const,
                    display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>
                      {p.strategy_name || p.strategy_id}
                    </div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2 }}>
                      {p.status?.replace("_", " ")} · Prob: {p.success_probability || "—"}%
                    </div>
                  </div>
                  <ChevronRight size={14} color={wb.muted} />
                </button>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        {selectedPath && (
          <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 18 }}>
            {detailQ.isLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}>
                <Loader2 size={20} color={wb.gold} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
              </div>
            ) : detail ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: wb.cream, margin: 0 }}>
                      {detail.path?.strategy_name || "Strategy Path"}
                    </h3>
                    <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 4 }}>
                      ID: {detail.path?.path_id?.slice(0, 12)} · Pattern: {detail.path?.pattern_id?.slice(0, 12) || "\u2014"}
                    </p>
                  </div>
                </div>

                {/* ═══ HISTORICAL GUIDANCE OVERLAY ═══ */}
                {showHistorical && patternType && (
                  <div style={{ background: `${wb.purple}06`, border: `1px solid ${wb.purple}20`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Brain size={14} color={wb.purple} />
                        <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.purple }}>Historical Guidance</span>
                      </div>
                      <button onClick={() => setShowCompare(!showCompare)} style={{
                        fontFamily: fontMono, fontSize: 9, padding: "3px 10px", borderRadius: 4,
                        background: showCompare ? `${wb.gold}15` : "transparent",
                        border: `1px solid ${showCompare ? wb.gold + "40" : wb.muted + "30"}`,
                        color: showCompare ? wb.gold : wb.muted, cursor: "pointer",
                      }}>
                        {showCompare ? "Hide Comparison" : "Compare All"}
                      </button>
                    </div>

                    {histGuidanceQ.isLoading ? (
                      <div style={{ textAlign: "center", padding: 16 }}>
                        <Loader2 size={16} color={wb.purple} style={{ animation: "spin 1s linear infinite" }} />
                      </div>
                    ) : histGuidanceQ.data?.recommendations && histGuidanceQ.data.recommendations.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {histGuidanceQ.data.recommendations.slice(0, 3).map((rec: any, i: number) => {
                          const reliColor = rec.reliability === "high" ? wb.green : rec.reliability === "medium" ? wb.amber : wb.red;
                          const isCurrentStrategy = rec.strategyId === detail?.path?.strategy_id;
                          return (
                            <div key={rec.strategyId || i} style={{
                              display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center",
                              padding: "10px 12px", borderRadius: 6,
                              background: isCurrentStrategy ? `${wb.gold}08` : "rgba(255,255,255,0.02)",
                              border: `1px solid ${isCurrentStrategy ? wb.gold + "30" : wb.cardBorder}`,
                            }}>
                              <div style={{
                                width: 24, height: 24, borderRadius: "50%",
                                background: `${wb.purple}15`, border: `1px solid ${wb.purple}30`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: fontMono, fontSize: 11, fontWeight: 700, color: wb.purple,
                              }}>
                                {i + 1}
                              </div>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontFamily: fontSans, fontSize: 12, fontWeight: 500, color: wb.cream }}>
                                    {rec.strategyName}
                                  </span>
                                  {isCurrentStrategy && (
                                    <span style={{ fontFamily: fontMono, fontSize: 8, padding: "1px 6px", borderRadius: 3, background: `${wb.gold}20`, color: wb.gold }}>CURRENT</span>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.green }}>Success: {rec.successRate}%</span>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.teal }}>{rec.avgTimeToImpact}d avg</span>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.amber }}>${rec.avgCost?.toLocaleString()}</span>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.cyan }}>\u0394 {rec.avgSignalReduction}%</span>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>n={rec.sampleSize}</span>
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{
                                  fontFamily: fontMono, fontSize: 8, padding: "2px 6px", borderRadius: 3,
                                  background: `${reliColor}15`, border: `1px solid ${reliColor}30`, color: reliColor,
                                }}>
                                  {rec.reliabilityLabel}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, textAlign: "center", padding: 12 }}>
                        No historical data for pattern type "{patternType}" yet.
                      </p>
                    )}

                    {/* ═══ STRATEGY COMPARISON ═══ */}
                    {showCompare && compareQ.data && (
                      <div style={{ marginTop: 12, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <BarChart size={12} color={wb.teal} />
                          <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.teal }}>Strategy Comparison</span>
                        </div>

                        {compareQ.data.conflictFlag && compareQ.data.conflictMessage && (
                          <div style={{
                            display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", marginBottom: 10,
                            background: `${wb.amber}08`, border: `1px solid ${wb.amber}25`, borderRadius: 6,
                          }}>
                            <AlertTriangle size={14} color={wb.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontFamily: fontSans, fontSize: 11, color: wb.cream, lineHeight: 1.4 }}>
                              {compareQ.data.conflictMessage}
                            </span>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          <div style={{ padding: "6px 10px", borderRadius: 4, background: `${wb.gold}08`, border: `1px solid ${wb.gold}20` }}>
                            <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.gold, textTransform: "uppercase" as const }}>Engine Recommended</span>
                            <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.cream, display: "block", marginTop: 2 }}>
                              {compareQ.data.recommendedByEngine ? "Yes" : "No"}
                            </span>
                          </div>
                          <div style={{ padding: "6px 10px", borderRadius: 4, background: `${compareQ.data.supportedByMemory ? wb.green : wb.red}08`, border: `1px solid ${compareQ.data.supportedByMemory ? wb.green : wb.red}20` }}>
                            <span style={{ fontFamily: fontMono, fontSize: 8, color: compareQ.data.supportedByMemory ? wb.green : wb.red, textTransform: "uppercase" as const }}>Supported by Memory</span>
                            <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.cream, display: "block", marginTop: 2 }}>
                              {compareQ.data.supportedByMemory ? `Yes (Rank #${compareQ.data.memoryRank})` : compareQ.data.memoryRank ? `Rank #${compareQ.data.memoryRank}` : "No data"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ═══ INLINE DECISION STRIP ═══ */}
                    {detail?.path?.status === "pending_review" && histGuidanceQ.data?.recommendations && histGuidanceQ.data.recommendations.length > 0 && (
                      <div style={{
                        display: "flex", gap: 6, marginTop: 12, padding: "10px 12px",
                        background: "rgba(0,0,0,0.15)", borderRadius: 6, border: `1px solid ${wb.cardBorder}`,
                        flexWrap: "wrap",
                      }}>
                        <button
                          onClick={() => handleApprove(selectedPath!)}
                          disabled={approveMut.isPending}
                          style={{
                            fontFamily: fontMono, fontSize: 9, padding: "5px 12px", borderRadius: 4,
                            background: wb.green, border: "none", color: "#000", cursor: "pointer", fontWeight: 600,
                          }}
                        >
                          {approveMut.isPending ? "..." : "Use Current Recommendation"}
                        </button>
                        {histGuidanceQ.data.recommendations[0]?.strategyId !== detail?.path?.strategy_id && (
                          <button
                            onClick={() => {
                              const topRec = histGuidanceQ.data!.recommendations[0];
                              applyHistMut.mutate({ pathId: selectedPath!, newStrategyId: topRec.strategyId });
                            }}
                            disabled={applyHistMut.isPending}
                            style={{
                              fontFamily: fontMono, fontSize: 9, padding: "5px 12px", borderRadius: 4,
                              background: `${wb.purple}20`, border: `1px solid ${wb.purple}40`, color: wb.purple, cursor: "pointer", fontWeight: 600,
                            }}
                          >
                            {applyHistMut.isPending ? "Applying..." : "Use Top Historical Strategy"}
                          </button>
                        )}
                        <button
                          onClick={() => setShowCompare(!showCompare)}
                          style={{
                            fontFamily: fontMono, fontSize: 9, padding: "5px 12px", borderRadius: 4,
                            background: "transparent", border: `1px solid ${wb.muted}30`, color: wb.muted, cursor: "pointer",
                          }}
                        >
                          Compare All
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Strategy Detail Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Confidence", value: `${detail.path?.confidence_score || 0}%`, color: wb.teal },
                    { label: "Success Prob", value: `${detail.path?.success_probability || 0}%`, color: wb.green },
                    { label: "Est. Cost", value: detail.path?.estimated_cost ? `$${detail.path.estimated_cost}` : "\u2014", color: wb.amber },
                  ].map(m => (
                    <div key={m.label} style={{ background: `${m.color}08`, border: `1px solid ${m.color}20`, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontFamily: fontMono, fontSize: 8, color: wb.muted, textTransform: "uppercase" as const }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                {detail.path?.status === "pending_review" && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <Button size="sm" onClick={() => handleApprove(selectedPath)} disabled={approveMut.isPending}
                      style={{ background: wb.green, color: "#000", fontWeight: 600 }}>
                      {approveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                      Approve Strategy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowReject(!showReject)}
                      style={{ borderColor: `${wb.red}40`, color: wb.red }}>
                      <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowModify(!showModify)}
                      style={{ borderColor: `${wb.amber}40`, color: wb.amber }}>
                      <Edit3 className="h-3.5 w-3.5 mr-1" /> Modify
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(selectedPath)} disabled={exportMut.isPending}
                      style={{ borderColor: `${wb.teal}40`, color: wb.teal }}>
                      {exportMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileOutput className="h-3.5 w-3.5 mr-1" />}
                      Export Plan
                    </Button>
                  </div>
                )}

                {/* Reject Form */}
                {showReject && (
                  <div style={{ background: `${wb.red}08`, border: `1px solid ${wb.red}20`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection..."
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${wb.red}30`, borderRadius: 4, padding: 8, color: wb.cream, fontFamily: fontSans, fontSize: 12, minHeight: 60, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Button size="sm" onClick={() => handleReject(selectedPath)} disabled={!rejectReason || rejectMut.isPending}
                        style={{ background: wb.red, color: "#fff", fontWeight: 600 }}>
                        Confirm Rejection
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowReject(false)} style={{ borderColor: `${wb.muted}40`, color: wb.muted }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modify Form */}
                {showModify && (
                  <div style={{ background: `${wb.amber}08`, border: `1px solid ${wb.amber}20`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
                    <textarea value={modifyNotes} onChange={e => setModifyNotes(e.target.value)}
                      placeholder="Modification notes (what to change)..."
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${wb.amber}30`, borderRadius: 4, padding: 8, color: wb.cream, fontFamily: fontSans, fontSize: 12, minHeight: 60, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Button size="sm" onClick={() => handleModify(selectedPath)} disabled={!modifyNotes || modifyMut.isPending}
                        style={{ background: wb.amber, color: "#000", fontWeight: 600 }}>
                        Save Modifications
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowModify(false)} style={{ borderColor: `${wb.muted}40`, color: wb.muted }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Steps */}
                <div style={{ marginTop: 16 }}>
                  <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                    Steps ({detail.steps?.length || 0})
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {(detail.steps || []).map((step: any, i: number) => {
                      const stepColor = step.status === "completed" ? wb.green : step.status === "in_progress" ? wb.teal : step.status === "skipped" ? wb.red : wb.muted;
                      return (
                        <div key={step.step_id || i} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", borderRadius: 6,
                          background: "rgba(255,255,255,0.015)", border: `1px solid ${wb.cardBorder}`,
                        }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: `${stepColor}15`, border: `1px solid ${stepColor}40`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: fontMono, fontSize: 10, color: stepColor, fontWeight: 600,
                          }}>
                            {step.status === "completed" ? "\u2713" : i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>
                              {step.step_name || step.action_type || `Step ${i + 1}`}
                            </div>
                            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginTop: 1 }}>
                              {step.action_type} · {step.status}
                              {step.status !== "pending" && (
                                <span style={{ color: wb.teal, marginLeft: 6 }}>Paperwork auto-triggered</span>
                              )}
                            </div>
                          </div>
                          {detail.path?.status === "executing" && step.status === "pending" && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => handleStepUpdate(step.step_id, "completed")}
                                style={{ background: `${wb.green}15`, border: `1px solid ${wb.green}30`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.green }}>
                                Complete
                              </button>
                              <button onClick={() => handleStepUpdate(step.step_id, "skipped")}
                                style={{ background: `${wb.red}10`, border: `1px solid ${wb.red}25`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.red }}>
                                Skip
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>Path not found.</p>
            )}
          </div>
        )}
      </div>

      {/* Workflow Progress Bar */}
      {workflow && (
        <div style={{ marginTop: 20, background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Activity size={14} color={wb.teal} />
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>Workflow Progress</span>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["intake", "evidence", "pattern", "strategy", "remedy", "intervention", "outcome"].map(stage => {
              const isActive = workflow.currentPhase === stage;
              const isPast = ["intake", "evidence", "pattern", "strategy", "remedy", "intervention", "outcome"]
                .indexOf(stage) < ["intake", "evidence", "pattern", "strategy", "remedy", "intervention", "outcome"]
                .indexOf(workflow.currentPhase || "");
              const color = isActive ? wb.gold : isPast ? wb.green : wb.muted;
              return (
                <div key={stage} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 4, borderRadius: 2, background: isPast ? wb.green : isActive ? wb.gold : `${wb.muted}30`, marginBottom: 4 }} />
                  <span style={{ fontFamily: fontMono, fontSize: 8, color, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{stage}</span>
                </div>
              );
            })}
          </div>
          {primaryAction && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 12px", background: `${wb.gold}08`, border: `1px solid ${wb.gold}20`, borderRadius: 6 }}>
              <ArrowUpRight size={14} color={wb.gold} />
              <span style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>
                <strong style={{ color: wb.gold }}>Next:</strong> {primaryAction.action}
              </span>
              {primaryAction.confidence && (
                <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: "auto" }}>
                  {Math.round(primaryAction.confidence * 100)}% confidence
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Evidence Confidence */}
      {evConf && evConf.items && evConf.items.length > 0 && (
        <div style={{ marginTop: 16, background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Gauge size={14} color={wb.purple} />
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
              Evidence Confidence ({Math.round((evConf.overallScore || 0) * 100)}%)
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: `${wb.muted}20`, marginBottom: 10 }}>
            <div style={{ height: "100%", borderRadius: 3, background: (evConf.overallScore || 0) > 0.7 ? wb.green : (evConf.overallScore || 0) > 0.4 ? wb.amber : wb.red, width: `${(evConf.overallScore || 0) * 100}%`, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {evConf.items.slice(0, 6).map((item: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 4, background: "rgba(255,255,255,0.015)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.confidence > 0.7 ? wb.green : item.confidence > 0.4 ? wb.amber : wb.red }} />
                <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.cream, flex: 1 }}>{item.title?.slice(0, 30)}</span>
                <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>{Math.round(item.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Escalation Panel — Guided Submission Workflow ──────────────────────────
const WORKFLOW_STEPS = [
  { id: 1, label: "Select Authority", icon: Building2 },
  { id: 2, label: "Review Intervention", icon: Eye },
  { id: 3, label: "Attach Evidence", icon: Upload },
  { id: 4, label: "Generate Package", icon: FileText },
  { id: 5, label: "Confirm & Submit", icon: Send },
  { id: 6, label: "Track Status", icon: Clock },
];

function EscalationPanel({ caseId }: { caseId: number }) {
  const dashQ = trpc.interventionNetwork.dashboard.useQuery();
  const submissionsQ = trpc.submissionWorkflow.list.useQuery({ caseId });
  const summaryQ = trpc.submissionWorkflow.summary.useQuery();
  const createDraftMut = trpc.submissionWorkflow.createDraft.useMutation();
  const attachEvidenceMut = trpc.submissionWorkflow.attachEvidence.useMutation();
  const generatePackageMut = trpc.submissionWorkflow.generatePackage.useMutation();
  const confirmMut = trpc.submissionWorkflow.confirm.useMutation();
  const transitionMut = trpc.submissionWorkflow.transition.useMutation();
  const stateQ = trpc.submissionWorkflow.state.useQuery(
    { submissionId: "" },
    { enabled: false }
  );
  const utils = trpc.useUtils();

  const [wizardStep, setWizardStep] = useState(0); // 0 = not started
  const [selectedEndpoint, setSelectedEndpoint] = useState<any>(null);
  const [selectedAction, setSelectedAction] = useState("agency_complaint");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [packageGenerated, setPackageGenerated] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [notes, setNotes] = useState("");
  const [showExisting, setShowExisting] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const dash = dashQ.data;
  const submissions = submissionsQ.data || [];
  const summary = summaryQ.data;
  const endpoints = dash?.endpoints || [];

  const actionTypes = [
    { value: "agency_complaint", label: "Agency Complaint", color: wb.gold },
    { value: "enforcement_referral", label: "Enforcement Referral", color: wb.teal },
    { value: "oversight_request", label: "Oversight Request", color: wb.purple },
    { value: "investigation_request", label: "Investigation Request", color: wb.cyan },
    { value: "legislative_briefing", label: "Legislative Briefing", color: wb.amber },
    { value: "public_report", label: "Public Report", color: wb.green },
  ];

  const resetWizard = () => {
    setWizardStep(0);
    setSelectedEndpoint(null);
    setSelectedAction("agency_complaint");
    setDraftId(null);
    setPackageGenerated(false);
    setTrackingId("");
    setNotes("");
  };

  const handleCreateDraft = async () => {
    if (!selectedEndpoint) return;
    const result = await createDraftMut.mutateAsync({
      endpointId: selectedEndpoint.endpoint_id,
      caseId,
      actionType: selectedAction,
      actionDescription: `${selectedAction.replace(/_/g, " ")} to ${selectedEndpoint.agency_name}`,
    });
    setDraftId(result.submissionId);
    setWizardStep(3);
  };

  const handleAttachEvidence = async () => {
    if (!draftId) return;
    await attachEvidenceMut.mutateAsync({
      submissionId: draftId,
      caseId,
    });
    setWizardStep(4);
  };

  const handleGeneratePackage = async () => {
    if (!draftId) return;
    await generatePackageMut.mutateAsync({
      submissionId: draftId,
      caseId,
    });
    setPackageGenerated(true);
    setWizardStep(5);
  };

  const handleConfirm = async () => {
    if (!draftId) return;
    await confirmMut.mutateAsync({
      submissionId: draftId,
      trackingIdentifier: trackingId || undefined,
      notes: notes || undefined,
    });
    utils.submissionWorkflow.list.invalidate();
    utils.submissionWorkflow.summary.invalidate();
    setWizardStep(6);
  };

  const handleTransition = async (submissionId: string, newStatus: string) => {
    await transitionMut.mutateAsync({ submissionId, newStatus });
    utils.submissionWorkflow.list.invalidate();
    utils.submissionWorkflow.summary.invalidate();
  };

  if (dashQ.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Loader2 size={24} color={wb.gold} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>Loading intervention network...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Submissions", value: summary?.total || 0, color: wb.cream },
          { label: "Drafts", value: summary?.byStatus?.draft || 0, color: wb.muted },
          { label: "Submitted", value: summary?.byStatus?.submitted || 0, color: wb.amber },
          { label: "Under Review", value: summary?.byStatus?.under_review || 0, color: wb.teal },
        ].map((s) => (
          <div key={s.label} style={{
            background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
            padding: "12px 14px", textAlign: "center",
          }}>
            <div style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Wizard or Existing Submissions Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { resetWizard(); setWizardStep(1); setShowExisting(false); }}
          style={{ borderColor: `${wb.gold}40`, color: wb.gold }}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" /> New Submission
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { resetWizard(); setShowExisting(true); }}
          style={{ borderColor: `${wb.teal}40`, color: wb.teal }}
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" /> View Submissions ({submissions.length})
        </Button>
      </div>

      {/* ── GUIDED WORKFLOW WIZARD ── */}
      {wizardStep > 0 && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          {/* Progress Steps */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, overflowX: "auto" }}>
            {WORKFLOW_STEPS.map((ws) => {
              const StepIcon = ws.icon;
              const isActive = ws.id === wizardStep;
              const isComplete = ws.id < wizardStep;
              const stepC = isActive ? wb.gold : isComplete ? wb.green : wb.muted;
              return (
                <div key={ws.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 6,
                    background: isActive ? `${wb.gold}12` : "transparent",
                    border: `1px solid ${isActive ? `${wb.gold}30` : "transparent"}`,
                  }}>
                    <StepIcon size={12} color={stepC} />
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: stepC, whiteSpace: "nowrap" }}>
                      {ws.label}
                    </span>
                  </div>
                  {ws.id < 6 && <ChevronRight size={10} color={wb.muted} style={{ opacity: 0.3 }} />}
                </div>
              );
            })}
          </div>

          {/* Step 1: Select Authority */}
          {wizardStep === 1 && (
            <div>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, margin: "0 0 12px" }}>Select Authority Endpoint</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {endpoints.map((ep: any) => (
                  <button
                    key={ep.endpoint_id}
                    onClick={() => { setSelectedEndpoint(ep); setWizardStep(2); }}
                    style={{
                      background: selectedEndpoint?.endpoint_id === ep.endpoint_id ? `${wb.gold}10` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selectedEndpoint?.endpoint_id === ep.endpoint_id ? `${wb.gold}40` : wb.cardBorder}`,
                      borderRadius: 8, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>
                      {ep.agency_name}
                    </div>
                    <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 3 }}>
                      {ep.intervention_type} · Level {ep.escalation_level} · {ep.jurisdiction_scope}
                    </div>
                    {ep.contact_method && (
                      <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.teal, marginTop: 4 }}>
                        Contact: {ep.contact_method}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Review Intervention */}
          {wizardStep === 2 && selectedEndpoint && (
            <div>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, margin: "0 0 12px" }}>Review Intervention</h4>
              <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 500, color: wb.cream }}>{selectedEndpoint.agency_name}</div>
                <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 4 }}>
                  Type: {selectedEndpoint.intervention_type} · Level: {selectedEndpoint.escalation_level} · Jurisdiction: {selectedEndpoint.jurisdiction_scope}
                </div>
                {selectedEndpoint.submission_format && (
                  <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.teal, marginTop: 4 }}>
                    Format: {selectedEndpoint.submission_format}
                  </div>
                )}
                {selectedEndpoint.required_documents && (
                  <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.amber, marginTop: 4 }}>
                    Required: {typeof selectedEndpoint.required_documents === "string" ? selectedEndpoint.required_documents : JSON.stringify(selectedEndpoint.required_documents)}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, display: "block", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Action Type</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {actionTypes.map((at) => (
                    <button
                      key={at.value}
                      onClick={() => setSelectedAction(at.value)}
                      style={{
                        padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                        background: selectedAction === at.value ? `${at.color}18` : "transparent",
                        border: `1px solid ${selectedAction === at.value ? `${at.color}50` : wb.cardBorder}`,
                        fontFamily: fontMono, fontSize: 10, color: selectedAction === at.value ? at.color : wb.muted,
                      }}
                    >
                      {at.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setWizardStep(1)} style={{ borderColor: `${wb.muted}30`, color: wb.muted }}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={handleCreateDraft} disabled={createDraftMut.isPending} style={{ background: wb.gold, color: "#000", fontWeight: 600 }}>
                  {createDraftMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1" />}
                  Create Draft & Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Attach Evidence */}
          {wizardStep === 3 && (
            <div>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, margin: "0 0 12px" }}>Attach Supporting Evidence</h4>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginBottom: 16 }}>
                Evidence from the case will be automatically gathered and attached to the submission package.
              </p>
              <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <FlaskConical size={14} color={wb.teal} />
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.teal, textTransform: "uppercase" as const }}>Auto-Gathered Evidence</span>
                </div>
                <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted }}>
                  Documents, findings, signals, and pattern data from Case #{caseId} will be bundled into the submission.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setWizardStep(2)} style={{ borderColor: `${wb.muted}30`, color: wb.muted }}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={handleAttachEvidence} disabled={attachEvidenceMut.isPending} style={{ background: wb.teal, color: "#fff", fontWeight: 600 }}>
                  {attachEvidenceMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Gather & Attach Evidence
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Generate Package */}
          {wizardStep === 4 && (
            <div>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, margin: "0 0 12px" }}>Generate Submission Package</h4>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginBottom: 16 }}>
                The system will generate the formal submission documents using the Paperwork Generation Engine, including the complaint template, evidence summary, and supporting documentation.
              </p>
              <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <FileText size={14} color={wb.gold} />
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, textTransform: "uppercase" as const }}>Documents to Generate</span>
                </div>
                <div style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted }}>
                  <div>• {selectedAction.replace(/_/g, " ")} document</div>
                  <div>• Evidence summary bundle</div>
                  <div>• Cover letter / transmittal</div>
                  <div>• Supporting exhibits index</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setWizardStep(3)} style={{ borderColor: `${wb.muted}30`, color: wb.muted }}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={handleGeneratePackage} disabled={generatePackageMut.isPending} style={{ background: wb.gold, color: "#000", fontWeight: 600 }}>
                  {generatePackageMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                  Generate Package
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Confirm & Submit */}
          {wizardStep === 5 && (
            <div>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, margin: "0 0 12px" }}>Confirm & Submit</h4>
              <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Authority</div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream, marginTop: 2 }}>{selectedEndpoint?.agency_name}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Action Type</div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream, marginTop: 2 }}>{selectedAction.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Package</div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, color: wb.green, marginTop: 2 }}>Generated ✓</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Case</div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream, marginTop: 2 }}>#{caseId}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Tracking Identifier (optional)</label>
                <input
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="e.g., AG-2026-0314-001"
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 6,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${wb.cardBorder}`,
                    fontFamily: fontMono, fontSize: 12, color: wb.cream,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional notes for this submission..."
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 6,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${wb.cardBorder}`,
                    fontFamily: fontMono, fontSize: 12, color: wb.cream,
                    outline: "none", resize: "vertical" as const,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setWizardStep(4)} style={{ borderColor: `${wb.muted}30`, color: wb.muted }}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={handleConfirm} disabled={confirmMut.isPending} style={{ background: wb.green, color: "#000", fontWeight: 600 }}>
                  {confirmMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Confirm Submission
                </Button>
              </div>
            </div>
          )}

          {/* Step 6: Track Status */}
          {wizardStep === 6 && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <CheckCircle2 size={40} color={wb.green} style={{ margin: "0 auto 12px" }} />
              <h4 style={{ fontFamily: fontSerif, fontSize: 18, color: wb.cream, margin: "0 0 8px" }}>Submission Recorded</h4>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginBottom: 16 }}>
                The submission has been recorded and is now being tracked. You can monitor its status below.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <Button variant="outline" size="sm" onClick={() => { resetWizard(); setShowExisting(true); }} style={{ borderColor: `${wb.teal}40`, color: wb.teal }}>
                  <Clock className="h-3.5 w-3.5 mr-1" /> View All Submissions
                </Button>
                <Button variant="outline" size="sm" onClick={() => { resetWizard(); setWizardStep(1); }} style={{ borderColor: `${wb.gold}40`, color: wb.gold }}>
                  <Send className="h-3.5 w-3.5 mr-1" /> New Submission
                </Button>
              </div>
            </div>
          )}

          {/* Cancel */}
          {wizardStep > 0 && wizardStep < 6 && (
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={resetWizard} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: fontMono, fontSize: 10, color: wb.muted }}>
                Cancel workflow
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── EXISTING SUBMISSIONS LIST ── */}
      {showExisting && wizardStep === 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Send size={14} color={wb.teal} />
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
              Submissions ({submissions.length})
            </span>
          </div>
          {submissions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {submissions.map((sub: any) => {
                const statusColor =
                  sub.response_status === "closed" ? wb.green :
                  sub.response_status === "response_received" ? wb.cyan :
                  sub.response_status === "under_review" ? wb.teal :
                  sub.response_status === "submitted" ? wb.amber :
                  sub.response_status === "ready_to_submit" ? wb.gold :
                  wb.muted;
                const isSelected = selectedSubmission === sub.submission_id;
                return (
                  <div key={sub.submission_id}>
                    <button
                      onClick={() => setSelectedSubmission(isSelected ? null : sub.submission_id)}
                      style={{
                        width: "100%",
                        background: isSelected ? `${wb.gold}08` : wb.cardBg,
                        border: `1px solid ${isSelected ? `${wb.gold}30` : wb.cardBorder}`,
                        borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const,
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>
                          {sub.agency_name || sub.endpoint_id?.slice(0, 12)}
                        </div>
                        <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2 }}>
                          {sub.action_type?.replace(/_/g, " ")} · {sub.response_status?.replace(/_/g, " ")} · {sub.tracking_identifier || sub.submission_id?.slice(0, 8)}
                        </div>
                      </div>
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>
                        {sub.submission_date ? new Date(sub.submission_date).toLocaleDateString() : sub.created_at ? new Date(sub.created_at).toLocaleDateString() : ""}
                      </span>
                      <ChevronRight size={12} color={wb.muted} style={{ transform: isSelected ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    {isSelected && (
                      <div style={{ background: "rgba(255,255,255,0.015)", border: `1px solid ${wb.cardBorder}`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                          <div>
                            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Status</div>
                            <div style={{ fontFamily: fontSans, fontSize: 12, color: statusColor, marginTop: 2 }}>{sub.response_status?.replace(/_/g, " ")}</div>
                          </div>
                          <div>
                            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Follow-up</div>
                            <div style={{ fontFamily: fontSans, fontSize: 12, color: sub.followup_required ? wb.amber : wb.muted, marginTop: 2 }}>
                              {sub.followup_required ? "Required" : "None"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Documents</div>
                            <div style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream, marginTop: 2 }}>
                              {sub.documents_sent ? (typeof sub.documents_sent === "string" ? JSON.parse(sub.documents_sent).length : sub.documents_sent.length) : 0}
                            </div>
                          </div>
                        </div>
                        {sub.response_status !== "closed" && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {sub.response_status === "draft" && (
                              <button onClick={() => handleTransition(sub.submission_id, "ready_to_submit")} style={{ background: `${wb.gold}12`, border: `1px solid ${wb.gold}30`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.gold }}>Mark Ready</button>
                            )}
                            {sub.response_status === "ready_to_submit" && (
                              <button onClick={() => handleTransition(sub.submission_id, "submitted")} style={{ background: `${wb.amber}12`, border: `1px solid ${wb.amber}30`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.amber }}>Mark Submitted</button>
                            )}
                            {sub.response_status === "submitted" && (
                              <button onClick={() => handleTransition(sub.submission_id, "under_review")} style={{ background: `${wb.teal}12`, border: `1px solid ${wb.teal}30`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.teal }}>Under Review</button>
                            )}
                            {sub.response_status === "under_review" && (
                              <button onClick={() => handleTransition(sub.submission_id, "response_received")} style={{ background: `${wb.cyan}12`, border: `1px solid ${wb.cyan}30`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.cyan }}>Response Received</button>
                            )}
                            {(sub.response_status === "response_received" || sub.response_status === "under_review") && (
                              <button onClick={() => handleTransition(sub.submission_id, "closed")} style={{ background: `${wb.green}12`, border: `1px solid ${wb.green}30`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: fontMono, fontSize: 9, color: wb.green }}>Close</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: "center", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8 }}>
              <Siren size={24} color={wb.muted} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>No submissions for this case yet. Click "New Submission" to start the guided workflow.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Claim-specific input field definitions ───
const CLAIM_FIELDS: Record<string, { key: string; label: string; step: number; placeholder?: string }[]> = {
  wage_theft: [
    { key: "unpaid_wages", label: "Unpaid Wages ($)", step: 100, placeholder: "Total wages owed" },
    { key: "overtime_hours", label: "Overtime Hours", step: 1, placeholder: "Hours over 40/week" },
    { key: "regular_rate", label: "Regular Hourly Rate ($)", step: 0.5, placeholder: "Hourly rate" },
    { key: "days_unpaid", label: "Days Since Due", step: 1, placeholder: "Days since wages were due" },
    { key: "willful", label: "Willful Violation (0 or 1)", step: 1, placeholder: "1 if willful" },
    { key: "waiting_time_days", label: "Waiting Time (days)", step: 1, placeholder: "Days waiting for final pay" },
    { key: "daily_rate", label: "Daily Rate ($)", step: 1, placeholder: "Daily wage rate" },
  ],
  overtime_violation: [
    { key: "unpaid_wages", label: "Base Wages Owed ($)", step: 100 },
    { key: "overtime_hours", label: "Overtime Hours", step: 1 },
    { key: "regular_rate", label: "Regular Hourly Rate ($)", step: 0.5 },
    { key: "days_unpaid", label: "Days Since Due", step: 1 },
    { key: "willful", label: "Willful Violation (0 or 1)", step: 1 },
  ],
  housing_discrimination: [
    { key: "actual_damages", label: "Economic Loss ($)", step: 100, placeholder: "Out-of-pocket costs" },
    { key: "emotional_distress", label: "Emotional Distress ($)", step: 1000, placeholder: "Mild $5k, Moderate $15k, Severe $35k" },
    { key: "punitive_damages", label: "Punitive Damages ($)", step: 1000, placeholder: "Leave blank for auto-estimate" },
  ],
  consumer_fraud: [
    { key: "actual_loss", label: "Amount Paid ($)", step: 100, placeholder: "Purchase amount" },
    { key: "treble_damages", label: "Treble Damages (0 or 1)", step: 1, placeholder: "1 if willful deception" },
  ],
  debt_harassment: [
    { key: "actual_damages", label: "Actual Damages ($)", step: 100, placeholder: "Documented damages" },
    { key: "violation_count", label: "Number of Violations", step: 1, placeholder: "Count of FDCPA violations" },
    { key: "class_action", label: "Class Action (0 or 1)", step: 1, placeholder: "1 if class action" },
    { key: "class_size", label: "Class Size", step: 1, placeholder: "Number of affected parties" },
  ],
  security_deposit: [
    { key: "deposit_amount", label: "Deposit Amount ($)", step: 100, placeholder: "Original deposit" },
    { key: "bad_faith", label: "Bad Faith (0 or 1)", step: 1, placeholder: "1 if bad faith retention" },
  ],
  ssdi_denial: [
    { key: "baseDamages", label: "Monthly Benefit ($)", step: 100, placeholder: "Monthly SSDI amount" },
    { key: "violation_count", label: "Months Denied", step: 1, placeholder: "Number of months denied" },
  ],
  habitability: [
    { key: "baseDamages", label: "Monthly Rent ($)", step: 100, placeholder: "Monthly rent amount" },
    { key: "violation_count", label: "Months Affected", step: 1, placeholder: "Duration of violation" },
    { key: "days_in_violation", label: "Days in Violation", step: 1, placeholder: "Total days" },
  ],
  public_records: [
    { key: "baseDamages", label: "Base Amount ($)", step: 100, placeholder: "Estimated damages" },
    { key: "days_in_violation", label: "Days of Denial", step: 1, placeholder: "Days since request" },
  ],
};
const DEFAULT_FIELDS = [
  { key: "baseDamages", label: "Base Damages ($)", step: 100, placeholder: "Primary damages" },
  { key: "violation_count", label: "Violation Count", step: 1, placeholder: "Number of violations" },
  { key: "days_in_violation", label: "Days in Violation", step: 1, placeholder: "Duration" },
];

// ─── Remedy Generator Panel ───
function RemedyGeneratorPanel({ caseId }: { caseId: number }) {
  const [activeView, setActiveView] = useState<"templates" | "calculator" | "generated" | "compare">("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [claimType, setClaimType] = useState("wage_theft");
  const [jurisdiction, setJurisdiction] = useState("WA");
  const [calcInputs, setCalcInputs] = useState<Record<string, number>>({});
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [autoFillApplied, setAutoFillApplied] = useState(false);

  const templatesQ = trpc.remedyTemplate.findMatching.useQuery({ claimType, jurisdiction });
  const templateDetailQ = trpc.remedyTemplate.detail.useQuery(
    { templateId: selectedTemplate || "" },
    { enabled: !!selectedTemplate }
  );
  const generatedQ = trpc.remedyTemplate.generatedDocs.useQuery({ caseId, limit: 20 });
  const calcQ = trpc.settlementCalculator.calculate.useMutation();
  const generateMut = trpc.remedyTemplate.generate.useMutation();
  const queueStatusQ = trpc.remedyTemplate.queueStatus.useQuery();
  const autoFillQ = trpc.remedyTemplate.autoFill.useQuery({ caseId, claimType }, { enabled: !!caseId });
  const exportPDFMut = trpc.remedyTemplate.exportPDF.useMutation();
  const exportTXTMut = trpc.remedyTemplate.exportTXT.useMutation();
  const compareAllMut = trpc.settlementCalculator.compareAll.useMutation();

  // Memory-informed remedy context
  const remedyContextQ = trpc.memoryOverlay.remedyContext.useQuery(
    { patternType: claimType, jurisdiction, claimType },
    { enabled: !!claimType }
  );

  const claimTypes = [
    { value: "wage_theft", label: "Wage Theft" },
    { value: "overtime_violation", label: "Overtime Violation" },
    { value: "minimum_wage_violation", label: "Minimum Wage" },
    { value: "final_pay_violation", label: "Final Pay Violation" },
    { value: "meal_break_violation", label: "Meal Break Violation" },
    { value: "housing_discrimination", label: "Housing Discrimination" },
    { value: "consumer_fraud", label: "Consumer Fraud" },
    { value: "debt_harassment", label: "Debt Collection Harassment" },
    { value: "security_deposit", label: "Security Deposit" },
    { value: "habitability", label: "Habitability" },
    { value: "ssdi_denial", label: "SSDI Denial" },
    { value: "ssi_denial", label: "SSI Denial" },
    { value: "va_benefits", label: "VA Benefits" },
    { value: "public_records", label: "Public Records" },
    { value: "foia_violation", label: "FOIA Violation" },
    { value: "small_claims", label: "Small Claims" },
    { value: "illegal_eviction", label: "Illegal Eviction" },
    { value: "rent_increase", label: "Rent Increase" },
  ];
  const jurisdictions = ["WA", "CA", "NY", "TX", "federal"];

  const currentFields = CLAIM_FIELDS[claimType] || DEFAULT_FIELDS;

  const handleCalculate = () => {
    calcQ.mutate({
      claimType,
      jurisdiction,
      variables: calcInputs,
      caseId,
    });
  };

  const handleGenerate = (templateId: string) => {
    const autoValues: Record<string, string> = {
      "CASE_NUMBER": `CASE-${caseId}`,
      "CURRENT_DATE": new Date().toLocaleDateString(),
      "DATE": new Date().toLocaleDateString(),
      "JURISDICTION": jurisdiction,
      "CLAIM_TYPE": claimType.replace(/_/g, " "),
    };
    // Merge auto values with user-entered placeholders
    const merged = { ...autoValues, ...placeholderValues };
    generateMut.mutate({
      templateId,
      placeholderValues: merged,
      caseId,
    }, {
      onSuccess: () => {
        generatedQ.refetch();
        setActiveView("generated");
      },
    });
  };

  // When a template is selected, populate placeholder fields
  const templateDetail = templateDetailQ.data as any;
  const templatePlaceholders: string[] = templateDetail?.placeholderFields || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* View Switcher */}
      <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${wb.cardBorder}`, paddingBottom: 12 }}>
        {([
          { id: "templates" as const, label: "Templates", icon: ScrollText },
          { id: "calculator" as const, label: "Settlement Calculator", icon: Calculator },
          { id: "compare" as const, label: "Compare Venues", icon: Globe },
          { id: "generated" as const, label: "Generated Docs", icon: FileText, count: generatedQ.data?.length },
        ]).map((v) => (
          <button key={v.id} onClick={() => setActiveView(v.id)} style={{
            fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
            color: activeView === v.id ? wb.cream : wb.muted,
            background: activeView === v.id ? `${wb.gold}15` : "transparent",
            border: `1px solid ${activeView === v.id ? wb.gold + "30" : "transparent"}`,
            borderRadius: 6, padding: "6px 14px",
            display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          }}>
            <v.icon size={12} />
            {v.label}
            {v.count !== undefined && v.count > 0 && (
              <span style={{ background: wb.gold, color: wb.bg, borderRadius: 100, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>{v.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Memory-Informed Remedy Context */}
      {remedyContextQ.data && (remedyContextQ.data.topStrategies.length > 0 || remedyContextQ.data.jurisdictionComparison.length > 0) && (
        <div style={{ background: `${wb.purple}06`, border: `1px solid ${wb.purple}20`, borderRadius: 8, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Brain size={14} color={wb.purple} />
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.purple }}>Memory-Informed Context</span>
          </div>
          {remedyContextQ.data.topStrategies.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Best-Performing Strategies</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                {remedyContextQ.data.topStrategies.map((s: any, i: number) => {
                  const reliColor = s.reliability === "high" ? wb.green : s.reliability === "medium" ? wb.amber : wb.red;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 4, background: "rgba(255,255,255,0.02)" }}>
                      <span style={{ fontFamily: fontSans, fontSize: 11, color: wb.cream }}>{s.strategyName}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.green }}>{s.successRate}%</span>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.amber }}>${s.avgCost?.toLocaleString()}</span>
                        <span style={{ fontFamily: fontMono, fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${reliColor}15`, color: reliColor }}>n={s.sampleSize}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {remedyContextQ.data.jurisdictionComparison.length > 0 && (
            <div>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Strongest Jurisdictions</span>
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {remedyContextQ.data.jurisdictionComparison.slice(0, 4).map((j: any, i: number) => (
                  <div key={i} style={{ padding: "4px 10px", borderRadius: 4, background: `${wb.teal}10`, border: `1px solid ${wb.teal}20` }}>
                    <span style={{ fontFamily: fontMono, fontSize: 10, fontWeight: 600, color: wb.teal }}>{j.jurisdiction}</span>
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 6 }}>{Math.round(j.avgScore)}% avg · n={j.totalSamples}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Claim Type + Jurisdiction Selectors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 4, display: "block" }}>Claim Type</label>
          <select value={claimType} onChange={(e) => setClaimType(e.target.value)} style={{
            width: "100%", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`,
            borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13,
          }}>
            {claimTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 4, display: "block" }}>Jurisdiction</label>
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={{
            width: "100%", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`,
            borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13,
          }}>
            {jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
      </div>

      {/* TEMPLATES VIEW */}
      {activeView === "templates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted }}>
              Matching Templates ({templatesQ.data?.length ?? 0})
            </span>
            {queueStatusQ.data && (
              <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>
                Queue: {queueStatusQ.data.pending} pending / {queueStatusQ.data.processing} processing
              </span>
            )}
          </div>
          {templatesQ.isLoading ? (
            <div style={{ padding: 32, textAlign: "center" }}><Loader2 size={20} color={wb.gold} style={{ animation: "spin 1s linear infinite" }} /></div>
          ) : (templatesQ.data || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8 }}>
              <ScrollText size={24} color={wb.muted} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>No matching templates for this claim type and jurisdiction.</p>
            </div>
          ) : (
            (templatesQ.data || []).map((t: any) => (
              <div key={t.templateId} style={{
                background: selectedTemplate === t.templateId ? `${wb.gold}08` : wb.cardBg,
                border: `1px solid ${selectedTemplate === t.templateId ? wb.gold + "30" : wb.cardBorder}`,
                borderRadius: 8, padding: "14px 16px",
                cursor: "pointer", transition: "all 0.15s",
              }} onClick={() => { setSelectedTemplate(selectedTemplate === t.templateId ? null : t.templateId); setPlaceholderValues({}); setShowPreview(false); }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream }}>{t.templateName}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontFamily: fontMono, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      color: t.difficultyLevel === "advanced" ? wb.purple : t.difficultyLevel === "intermediate" ? wb.amber : wb.green,
                      background: `${t.difficultyLevel === "advanced" ? wb.purple : t.difficultyLevel === "intermediate" ? wb.amber : wb.green}15`,
                      padding: "2px 6px", borderRadius: 100,
                    }}>{t.difficultyLevel}</span>
                    <span style={{
                      fontFamily: fontMono, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      color: wb.teal, background: `${wb.teal}15`, padding: "2px 6px", borderRadius: 100,
                    }}>{t.templateType}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, fontFamily: fontMono, fontSize: 10, color: wb.muted, marginBottom: 4 }}>
                  <span>Uses: {t.usageCount || 0}</span>
                  {t.successRate != null && <span>Success: {(t.successRate * 100).toFixed(0)}%</span>}
                  {t.governingLaw?.length > 0 && <span>Law: {t.governingLaw[0]}</span>}
                </div>
                {selectedTemplate === t.templateId && (
                  <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                    {/* Placeholder Fields */}
                    {templatePlaceholders.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 8, display: "block" }}>Template Placeholders</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {templatePlaceholders.map((ph: string) => (
                            <div key={ph}>
                              <label style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginBottom: 2, display: "block" }}>{ph}</label>
                              <input
                                type="text"
                                value={placeholderValues[ph] || ""}
                                onChange={(e) => setPlaceholderValues((p) => ({ ...p, [ph]: e.target.value }))}
                                placeholder={ph}
                                style={{
                                  width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid ${wb.cardBorder}`,
                                  borderRadius: 4, padding: "6px 10px", color: wb.cream, fontFamily: fontSans, fontSize: 12,
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Preview toggle */}
                    {templateDetail?.templateBody && (
                      <div style={{ marginBottom: 12 }}>
                        <button onClick={() => setShowPreview(!showPreview)} style={{
                          fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                          background: "transparent", border: `1px solid ${wb.cardBorder}`, borderRadius: 4,
                          padding: "4px 10px", color: wb.muted, cursor: "pointer",
                        }}>
                          {showPreview ? "Hide Preview" : "Preview Template"}
                        </button>
                        {showPreview && (
                          <div style={{
                            marginTop: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${wb.cardBorder}`,
                            borderRadius: 6, padding: 12, maxHeight: 200, overflow: "auto",
                            fontFamily: fontSans, fontSize: 12, color: wb.cream, lineHeight: 1.6, whiteSpace: "pre-wrap",
                          }}>
                            {templateDetail.templateBody}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleGenerate(t.templateId)} style={{
                        fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                        background: `${wb.gold}20`, border: `1px solid ${wb.gold}40`, borderRadius: 6,
                        padding: "6px 14px", color: wb.gold, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        {generateMut.isPending ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={12} />}
                        Generate Document
                      </button>
                      <button onClick={() => setActiveView("calculator")} style={{
                        fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                        background: `${wb.teal}15`, border: `1px solid ${wb.teal}30`, borderRadius: 6,
                        padding: "6px 14px", color: wb.teal, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <Calculator size={12} /> Calculate Settlement
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* CALCULATOR VIEW */}
      {activeView === "calculator" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Auto-Fill from Evidence */}
          {autoFillQ.data && autoFillQ.data.totalValuesDetected > 0 && !autoFillApplied && (
            <div style={{ background: `${wb.teal}08`, border: `1px solid ${wb.teal}30`, borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Wand2 size={16} color={wb.teal} />
                  <span style={{ fontFamily: fontSerif, fontSize: 14, fontWeight: 600, color: wb.teal }}>Auto-Detected Evidence</span>
                </div>
                <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>
                  {autoFillQ.data.totalEvidenceScanned} items scanned, {autoFillQ.data.totalValuesDetected} values found
                </span>
              </div>
              {autoFillQ.data.detectedEvidence.slice(0, 5).map((ev: any) => (
                <div key={ev.evidenceId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: `1px solid ${wb.cardBorder}`,
                }}>
                  <div>
                    <span style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>{ev.title}</span>
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 8 }}>{ev.evidenceType}</span>
                  </div>
                  <span style={{
                    fontFamily: fontMono, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                    color: ev.confidence === "high" ? wb.green : ev.confidence === "medium" ? wb.amber : wb.muted,
                    background: `${ev.confidence === "high" ? wb.green : ev.confidence === "medium" ? wb.amber : wb.muted}15`,
                    padding: "2px 6px", borderRadius: 100,
                  }}>{ev.confidence}</span>
                </div>
              ))}
              <button onClick={() => {
                if (autoFillQ.data) {
                  setCalcInputs(prev => ({ ...prev, ...autoFillQ.data.suggestedCalculatorVars }));
                  setPlaceholderValues(prev => ({ ...prev, ...autoFillQ.data.suggestedPlaceholders }));
                  setAutoFillApplied(true);
                }
              }} style={{
                marginTop: 12, fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                background: `${wb.teal}20`, border: `1px solid ${wb.teal}40`, borderRadius: 6,
                padding: "8px 16px", color: wb.teal, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center",
              }}>
                <Wand2 size={12} /> Apply {autoFillQ.data.totalValuesDetected} Detected Values
              </button>
            </div>
          )}
          {autoFillApplied && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: `${wb.green}10`, border: `1px solid ${wb.green}20`, borderRadius: 6 }}>
              <CheckCircle2 size={14} color={wb.green} />
              <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.green }}>Evidence values applied. You can edit them below before calculating.</span>
            </div>
          )}
          <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
            <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, marginBottom: 6 }}>Settlement Parameters</h4>
            <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginBottom: 14 }}>
              {claimType.replace(/_/g, " ").toUpperCase()} — {jurisdiction}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {currentFields.map((field) => (
                <div key={field.key}>
                  <label style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 4, display: "block" }}>{field.label}</label>
                  <input
                    type="number"
                    step={field.step}
                    placeholder={field.placeholder}
                    value={calcInputs[field.key] || ""}
                    onChange={(e) => setCalcInputs((p) => ({ ...p, [field.key]: parseFloat(e.target.value) || 0 }))}
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid ${wb.cardBorder}`,
                      borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontMono, fontSize: 13,
                    }}
                  />
                </div>
              ))}
            </div>
            <button onClick={handleCalculate} disabled={calcQ.isPending} style={{
              marginTop: 16, fontFamily: fontMono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" as const,
              background: `${wb.gold}20`, border: `1px solid ${wb.gold}40`, borderRadius: 6,
              padding: "10px 20px", color: wb.gold, cursor: calcQ.isPending ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center",
            }}>
              {calcQ.isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Calculator size={14} />}
              Calculate Settlement Range
            </button>
          </div>

          {/* Calculation Results */}
          {calcQ.data && (
            <div style={{ background: wb.cardBg, border: `1px solid ${wb.gold}20`, borderRadius: 8, padding: 16 }}>
              <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.gold, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <DollarSign size={16} /> Settlement Analysis
              </h4>
              {/* Range Display */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Low Estimate", value: calcQ.data.damagesRange?.low, color: wb.muted },
                  { label: "Calculated", value: calcQ.data.calculatedAmount, color: wb.gold },
                  { label: "High Estimate", value: calcQ.data.damagesRange?.high, color: wb.green },
                ].map((r) => (
                  <div key={r.label} style={{ textAlign: "center", padding: 12, background: `${r.color}08`, border: `1px solid ${r.color}20`, borderRadius: 6 }}>
                    <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: r.color }}>
                      ${(r.value || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              {/* Breakdown */}
              {calcQ.data.breakdown && (
                <div>
                  <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 8, display: "block" }}>Calculation Breakdown</span>
                  {(calcQ.data.breakdown.components || []).map((item: any, i: number) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 0", borderBottom: i < (calcQ.data.breakdown.components || []).length - 1 ? `1px solid ${wb.cardBorder}` : "none",
                    }}>
                      <div>
                        <span style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream }}>{item.label}</span>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 8 }}>{item.formula}</span>
                      </div>
                      <span style={{ fontFamily: fontMono, fontSize: 14, fontWeight: 600, color: wb.gold }}>
                        ${(item.value || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {/* Summary row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", marginTop: 4, borderTop: `2px solid ${wb.gold}30` }}>
                    <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 700, color: wb.cream }}>Final Amount</span>
                    <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: wb.gold }}>${(calcQ.data.breakdown.finalAmount || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
              {/* Confidence */}
              {calcQ.data.confidenceLevel && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted }}>Confidence</span>
                  <span style={{
                    fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                    color: calcQ.data.confidenceLevel === "high" ? wb.green : calcQ.data.confidenceLevel === "medium" ? wb.amber : wb.muted,
                    background: `${calcQ.data.confidenceLevel === "high" ? wb.green : calcQ.data.confidenceLevel === "medium" ? wb.amber : wb.muted}15`,
                    padding: "3px 10px", borderRadius: 100,
                  }}>{calcQ.data.confidenceLevel}</span>
                  {calcQ.data.statutoryBasis && calcQ.data.statutoryBasis.length > 0 && (
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 8 }}>
                      Basis: {calcQ.data.statutoryBasis.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* GENERATED DOCS VIEW */}
      {activeView === "generated" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted }}>
              Generated Documents ({generatedQ.data?.length ?? 0})
            </span>
          </div>
          {generatedQ.isLoading ? (
            <div style={{ padding: 32, textAlign: "center" }}><Loader2 size={20} color={wb.gold} style={{ animation: "spin 1s linear infinite" }} /></div>
          ) : (generatedQ.data || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8 }}>
              <FileText size={24} color={wb.muted} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>No documents generated yet. Select a template and click Generate.</p>
            </div>
          ) : (
            (generatedQ.data || []).map((doc: any) => {
              const statusColors: Record<string, string> = {
                draft: wb.muted, review: wb.amber, approved: wb.green, sent: wb.teal, filed: wb.purple,
              };
              const sc = statusColors[doc.status] || wb.muted;
              return (
                <div key={doc.docId} style={{
                  background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream }}>{doc.templateName || doc.templateId}</span>
                    <span style={{
                      fontFamily: fontMono, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      color: sc, background: `${sc}15`, padding: "2px 6px", borderRadius: 100,
                    }}>{doc.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontFamily: fontMono, fontSize: 10, color: wb.muted }}>
                    <span>Type: {doc.documentType || doc.templateId}</span>
                    {doc.createdAt && <span>{new Date(doc.createdAt).toLocaleDateString()}</span>}
                  </div>
                  {/* Export Buttons */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => exportPDFMut.mutate({ docId: doc.docId }, {
                      onSuccess: (result: any) => { window.open(result.fileUrl, "_blank"); },
                    })} disabled={exportPDFMut.isPending} style={{
                      fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                      background: `${wb.gold}15`, border: `1px solid ${wb.gold}30`, borderRadius: 4,
                      padding: "5px 10px", color: wb.gold, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4, opacity: exportPDFMut.isPending ? 0.5 : 1,
                    }}>
                      {exportPDFMut.isPending ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <FileDown size={10} />}
                      PDF
                    </button>
                    <button onClick={() => exportTXTMut.mutate({ docId: doc.docId }, {
                      onSuccess: (result: any) => { window.open(result.fileUrl, "_blank"); },
                    })} disabled={exportTXTMut.isPending} style={{
                      fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                      background: `${wb.purple}15`, border: `1px solid ${wb.purple}30`, borderRadius: 4,
                      padding: "5px 10px", color: wb.purple, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4, opacity: exportTXTMut.isPending ? 0.5 : 1,
                    }}>
                      {exportTXTMut.isPending ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={10} />}
                      TXT
                    </button>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" style={{
                        fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                        background: `${wb.teal}15`, border: `1px solid ${wb.teal}30`, borderRadius: 4,
                        padding: "5px 10px", color: wb.teal, textDecoration: "none",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <ExternalLink size={10} /> View
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* COMPARE VENUES VIEW */}
      {activeView === "compare" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
            <h4 style={{ fontFamily: fontSerif, fontSize: 16, color: wb.cream, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Globe size={16} color={wb.gold} /> Jurisdiction Comparison
            </h4>
            <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Compare settlement estimates across all jurisdictions for <strong style={{ color: wb.cream }}>{claimType.replace(/_/g, " ")}</strong>.
              Enter your case variables in the Calculator tab first, then run comparison.
            </p>
            <button onClick={() => compareAllMut.mutate({ claimType, variables: calcInputs })} disabled={compareAllMut.isPending} style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" as const,
              background: `${wb.gold}20`, border: `1px solid ${wb.gold}40`, borderRadius: 6,
              padding: "10px 20px", color: wb.gold, cursor: compareAllMut.isPending ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center",
            }}>
              {compareAllMut.isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Globe size={14} />}
              Compare All Jurisdictions
            </button>
          </div>

          {compareAllMut.data && (
            <>
              {/* Best Venue Highlight */}
              <div style={{ background: `${wb.gold}08`, border: `1px solid ${wb.gold}30`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Target size={16} color={wb.gold} />
                  <span style={{ fontFamily: fontSerif, fontSize: 16, fontWeight: 600, color: wb.gold }}>Recommended Filing Venue</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: fontMono, fontSize: 28, fontWeight: 700, color: wb.gold }}>
                    {compareAllMut.data.bestVenue.jurisdiction}
                  </span>
                  <span style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600, color: wb.cream }}>
                    ${compareAllMut.data.bestVenue.totalDemand.toLocaleString()}
                  </span>
                </div>
                {compareAllMut.data.bestVenue.advantage && (
                  <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, marginTop: 6 }}>
                    {compareAllMut.data.bestVenue.advantage}
                  </p>
                )}
              </div>

              {/* Ranked Jurisdictions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted }}>
                  All Jurisdictions Ranked ({compareAllMut.data.totalJurisdictionsCompared})
                </span>
                {compareAllMut.data.jurisdictions.map((jur: any, idx: number) => {
                  const maxDemand = compareAllMut.data!.jurisdictions[0]?.totalDemand || 1;
                  const pct = maxDemand > 0 ? (jur.totalDemand / maxDemand) * 100 : 0;
                  const isTop = idx === 0;
                  return (
                    <div key={jur.jurisdiction} style={{
                      background: isTop ? `${wb.gold}08` : wb.cardBg,
                      border: `1px solid ${isTop ? wb.gold + "30" : wb.cardBorder}`,
                      borderRadius: 8, padding: "14px 16px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            fontFamily: fontMono, fontSize: 11, fontWeight: 700,
                            color: isTop ? wb.gold : wb.muted,
                            background: isTop ? `${wb.gold}20` : `${wb.muted}15`,
                            padding: "2px 8px", borderRadius: 100, minWidth: 24, textAlign: "center",
                          }}>#{idx + 1}</span>
                          <span style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 700, color: wb.cream }}>{jur.jurisdiction}</span>
                          <span style={{
                            fontFamily: fontMono, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                            color: jur.confidenceLevel === "high" ? wb.green : jur.confidenceLevel === "medium" ? wb.amber : wb.muted,
                            background: `${jur.confidenceLevel === "high" ? wb.green : jur.confidenceLevel === "medium" ? wb.amber : wb.muted}15`,
                            padding: "2px 6px", borderRadius: 100,
                          }}>{jur.confidenceLevel}</span>
                        </div>
                        <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: isTop ? wb.gold : wb.cream }}>
                          ${jur.totalDemand.toLocaleString()}
                        </span>
                      </div>
                      {/* Bar */}
                      <div style={{ height: 4, background: `${wb.muted}15`, borderRadius: 100, marginBottom: 10 }}>
                        <div style={{ height: 4, background: isTop ? wb.gold : wb.muted, borderRadius: 100, width: `${pct}%`, transition: "width 0.3s" }} />
                      </div>
                      {/* Breakdown */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                        {[
                          { label: "Base", value: jur.breakdown.baseAmount },
                          { label: "Statutory", value: jur.breakdown.statutoryDamages },
                          { label: "Penalties", value: jur.breakdown.penalties },
                          { label: "Interest", value: jur.breakdown.interest },
                          { label: "Atty Fees", value: jur.breakdown.attorneyFees },
                        ].map((b) => (
                          <div key={b.label} style={{ textAlign: "center" }}>
                            <div style={{ fontFamily: fontMono, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: wb.muted, marginBottom: 2 }}>{b.label}</div>
                            <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 600, color: b.value > 0 ? wb.cream : wb.muted }}>
                              ${(b.value || 0).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Action Buttons */}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={() => {
                          setJurisdiction(jur.jurisdiction);
                          setActiveView("calculator");
                        }} style={{
                          fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                          background: `${wb.gold}15`, border: `1px solid ${wb.gold}30`, borderRadius: 4,
                          padding: "5px 10px", color: wb.gold, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <Calculator size={10} /> Use This Jurisdiction
                        </button>
                        <button onClick={() => {
                          setJurisdiction(jur.jurisdiction);
                          setActiveView("templates");
                        }} style={{
                          fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                          background: `${wb.teal}15`, border: `1px solid ${wb.teal}30`, borderRadius: 4,
                          padding: "5px 10px", color: wb.teal, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <ScrollText size={10} /> Generate Document
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Memory Engine Panel ───
function MemoryPanel({ caseId }: { caseId: number }) {
  const dashQ = trpc.operationalWorkflow.memoryDashboard.useQuery();
  const recordsQ = trpc.operationalWorkflow.memoryRecords.useQuery({ limit: 20 });
  const aggregateMut = trpc.operationalWorkflow.aggregateMemory.useMutation({
    onSuccess: () => { dashQ.refetch(); recordsQ.refetch(); },
  });
  const d = dashQ.data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: fontSerif, fontSize: 20, color: wb.cream, margin: 0 }}>Strategy Memory</h3>
          <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2 }}>Outcome-driven learning from past interventions</p>
        </div>
        <button
          onClick={() => aggregateMut.mutate()}
          disabled={aggregateMut.isPending}
          style={{
            fontFamily: fontMono, fontSize: 10, padding: "6px 14px", borderRadius: 6,
            background: `${wb.gold}15`, border: `1px solid ${wb.gold}30`, color: wb.gold, cursor: "pointer",
          }}
        >
          {aggregateMut.isPending ? "Aggregating..." : "Refresh Summaries"}
        </button>
      </div>

      {/* Metrics */}
      {d && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="Total Memories" value={d.totalMemories} icon={Brain} color={wb.purple} />
          <StatCard label="Avg Success" value={`${d.avgSuccessScore}%`} icon={TrendingUp} color={wb.green} />
          <StatCard label="Summaries" value={d.totalSummaries} icon={Layers} color={wb.cyan} />
          <StatCard label="Jurisdictions" value={d.topJurisdictions?.length || 0} icon={Globe} color={wb.amber} />
        </div>
      )}

      {/* Top Strategies */}
      {d?.topStrategies && d.topStrategies.length > 0 && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Top Performing Strategies</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.topStrategies.map((s: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <div>
                  <span style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream }}>{s.interventionType}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 8 }}>{s.patternType} · {s.jurisdiction}</span>
                </div>
                <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600, color: wb.green }}>{s.avgScore}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Memory Records */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
        <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Recent Outcome Memories</h4>
        {recordsQ.isLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={20} color={wb.muted} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : recordsQ.data && recordsQ.data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recordsQ.data.map((m: any) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.015)", borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>{m.patternType}</span>
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>{m.claimType} · {m.jurisdiction}</span>
                  </div>
                  <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginTop: 2 }}>
                    Signals: {m.signalsBefore}→{m.signalsAfter} | Pressure: {m.pressureBefore}→{m.pressureAfter}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: fontMono, fontSize: 14, fontWeight: 600, color: m.successScore >= 70 ? wb.green : m.successScore >= 40 ? wb.amber : wb.red }}>{m.successScore}%</div>
                  <div style={{ fontFamily: fontMono, fontSize: 8, color: wb.muted }}>{m.timeToImpactDays}d</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 20 }}>No memory records yet. Outcomes will be captured as interventions complete.</p>
        )}
      </div>
    </div>
  );
}

// ─── Reform Engine Panel ───
function ReformPanel() {
  const dashQ = trpc.operationalWorkflow.reformDashboard.useQuery();
  const candidatesQ = trpc.operationalWorkflow.reformCandidates.useQuery();
  const reformsQ = trpc.operationalWorkflow.listReforms.useQuery({ limit: 20 });
  const [selectedReform, setSelectedReform] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ patternType: "", harmDomain: "", jurisdiction: "WA", reformType: "legislative_change" as const, reformTitle: "", reformDescription: "" });

  const createMut = trpc.operationalWorkflow.createReform.useMutation({
    onSuccess: () => { reformsQ.refetch(); dashQ.refetch(); setShowCreate(false); setCreateForm({ patternType: "", harmDomain: "", jurisdiction: "WA", reformType: "legislative_change", reformTitle: "", reformDescription: "" }); },
  });
  const briefMut = trpc.operationalWorkflow.reformPolicyBrief.useMutation();
  const proposalMut = trpc.operationalWorkflow.reformLegislativeProposal.useMutation();
  const memoMut = trpc.operationalWorkflow.reformAgencyMemo.useMutation();

  const d = dashQ.data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: fontSerif, fontSize: 20, color: wb.cream, margin: 0 }}>Reform Engine</h3>
          <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2 }}>Identify, draft, and track systemic reform proposals</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ fontFamily: fontMono, fontSize: 10, padding: "6px 14px", borderRadius: 6, background: `${wb.gold}15`, border: `1px solid ${wb.gold}30`, color: wb.gold, cursor: "pointer" }}>
          {showCreate ? "Cancel" : "+ New Reform"}
        </button>
      </div>

      {/* Metrics */}
      {d && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="Total Reforms" value={d.totalReforms} icon={Landmark} color={wb.purple} />
          <StatCard label="Avg Priority" value={d.avgPriority?.toFixed(1) || "0"} icon={Flag} color={wb.red} />
          <StatCard label="Published" value={d.byStatus?.published || 0} icon={CheckCircle2} color={wb.green} />
          <StatCard label="Under Review" value={d.byStatus?.under_review || 0} icon={Clock} color={wb.amber} />
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.gold}30`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 12 }}>New Reform Proposal</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {["patternType", "harmDomain", "jurisdiction", "reformTitle"].map(f => (
              <div key={f}>
                <label style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>{f.replace(/([A-Z])/g, " $1")}</label>
                <input value={(createForm as any)[f]} onChange={e => setCreateForm(p => ({ ...p, [f]: e.target.value }))} style={{ width: "100%", fontFamily: fontMono, fontSize: 11, padding: "6px 10px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${wb.cardBorder}`, color: wb.cream, marginTop: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>Description</label>
            <textarea value={createForm.reformDescription} onChange={e => setCreateForm(p => ({ ...p, reformDescription: e.target.value }))} rows={3} style={{ width: "100%", fontFamily: fontMono, fontSize: 11, padding: "6px 10px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${wb.cardBorder}`, color: wb.cream, marginTop: 4, resize: "vertical" }} />
          </div>
          <button onClick={() => createMut.mutate(createForm as any)} disabled={createMut.isPending || !createForm.reformTitle} style={{ marginTop: 10, fontFamily: fontMono, fontSize: 10, padding: "6px 16px", borderRadius: 6, background: wb.gold, border: "none", color: wb.bg, cursor: "pointer", opacity: createMut.isPending || !createForm.reformTitle ? 0.5 : 1 }}>
            {createMut.isPending ? "Creating..." : "Create Reform"}
          </button>
        </div>
      )}

      {/* Reform Candidates */}
      {candidatesQ.data && candidatesQ.data.length > 0 && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Reform Candidates (Auto-Detected)</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {candidatesQ.data.slice(0, 5).map((c: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <div>
                  <span style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>{c.patternType}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginLeft: 8 }}>{c.harmDomain} · {c.jurisdiction}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.amber }}>Score: {c.priorityScore?.toFixed(1)}</span>
                  <button onClick={() => { setCreateForm({ patternType: c.patternType, harmDomain: c.harmDomain, jurisdiction: c.jurisdiction, reformType: "legislative_change", reformTitle: `Reform: ${c.patternType}`, reformDescription: c.reason || "" }); setShowCreate(true); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "3px 8px", borderRadius: 4, background: `${wb.gold}15`, border: `1px solid ${wb.gold}30`, color: wb.gold, cursor: "pointer" }}>Draft</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Reforms */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
        <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Reform Registry</h4>
        {reformsQ.isLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={20} color={wb.muted} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : reformsQ.data && reformsQ.data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {reformsQ.data.map((r: any) => (
              <div key={r.id} style={{ padding: "10px 12px", background: selectedReform === r.id ? `${wb.gold}08` : "rgba(255,255,255,0.015)", borderRadius: 6, border: `1px solid ${selectedReform === r.id ? wb.gold + "30" : wb.cardBorder}`, cursor: "pointer" }} onClick={() => setSelectedReform(selectedReform === r.id ? null : r.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>{r.reformTitle}</span>
                    <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                      <span style={{ fontFamily: fontMono, fontSize: 9, padding: "1px 6px", borderRadius: 100, background: `${wb.purple}15`, color: wb.purple }}>{r.reformType}</span>
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted }}>{r.jurisdiction}</span>
                    </div>
                  </div>
                  <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 8px", borderRadius: 100, background: r.status === "published" ? `${wb.green}15` : r.status === "approved" ? `${wb.cyan}15` : `${wb.muted}15`, color: r.status === "published" ? wb.green : r.status === "approved" ? wb.cyan : wb.muted }}>{r.status}</span>
                </div>
                {selectedReform === r.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${wb.cardBorder}` }}>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, lineHeight: 1.5, marginBottom: 10 }}>{r.reformDescription}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => { e.stopPropagation(); briefMut.mutate({ reformId: r.id }); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "4px 10px", borderRadius: 4, background: `${wb.purple}15`, border: `1px solid ${wb.purple}30`, color: wb.purple, cursor: "pointer" }}>{briefMut.isPending ? "..." : "Policy Brief"}</button>
                      <button onClick={(e) => { e.stopPropagation(); proposalMut.mutate({ reformId: r.id }); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "4px 10px", borderRadius: 4, background: `${wb.cyan}15`, border: `1px solid ${wb.cyan}30`, color: wb.cyan, cursor: "pointer" }}>{proposalMut.isPending ? "..." : "Legislative Proposal"}</button>
                      <button onClick={(e) => { e.stopPropagation(); memoMut.mutate({ reformId: r.id }); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "4px 10px", borderRadius: 4, background: `${wb.amber}15`, border: `1px solid ${wb.amber}30`, color: wb.amber, cursor: "pointer" }}>{memoMut.isPending ? "..." : "Agency Memo"}</button>
                    </div>
                    {(briefMut.data || proposalMut.data || memoMut.data) && (
                      <div style={{ marginTop: 10, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 6, maxHeight: 200, overflow: "auto" }}>
                        <pre style={{ fontFamily: fontMono, fontSize: 10, color: wb.cream, whiteSpace: "pre-wrap", margin: 0 }}>{briefMut.data?.text || proposalMut.data?.text || memoMut.data?.text}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 20 }}>No reforms created yet. Use Reform Candidates above or create a new reform proposal.</p>
        )}
      </div>
    </div>
  );
}

// ─── Policy Change Engine Panel ───
function PolicyChangePanel() {
  const dashQ = trpc.operationalWorkflow.policyChangeDashboard.useQuery();
  const changesQ = trpc.operationalWorkflow.listPolicyChanges.useQuery({ limit: 20 });
  const orgsQ = trpc.operationalWorkflow.advocacyOrgs.useQuery({ limit: 10 });
  const [selectedChange, setSelectedChange] = useState<string | null>(null);

  const packageMut = trpc.operationalWorkflow.generateReformPackage.useMutation();
  const statusMut = trpc.operationalWorkflow.updatePolicyChangeStatus.useMutation({
    onSuccess: () => { changesQ.refetch(); dashQ.refetch(); },
  });
  const coalitionMut = trpc.operationalWorkflow.addCoalitionPartner.useMutation({
    onSuccess: () => changesQ.refetch(),
  });

  const d = dashQ.data;
  const statusColors: Record<string, string> = {
    identified: wb.muted, researching: wb.cyan, drafting: wb.purple,
    coalition_building: wb.amber, submitted: wb.gold, under_review: wb.teal,
    enacted: wb.green, rejected: wb.red, archived: wb.muted,
  };
  const nextStatus: Record<string, string> = {
    identified: "researching", researching: "drafting", drafting: "coalition_building",
    coalition_building: "submitted", submitted: "under_review",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ fontFamily: fontSerif, fontSize: 20, color: wb.cream, margin: 0 }}>Policy Change Engine</h3>
        <p style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2 }}>Track policy changes from identification through enactment</p>
      </div>

      {/* Metrics */}
      {d && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="Total Changes" value={d.totalChanges || 0} icon={Workflow} color={wb.purple} />
          <StatCard label="In Progress" value={d.inProgress || 0} icon={Activity} color={wb.cyan} />
          <StatCard label="Enacted" value={d.enacted || 0} icon={CheckCircle2} color={wb.green} />
          <StatCard label="Coalition Partners" value={d.totalCoalitionPartners || 0} icon={Users} color={wb.amber} />
        </div>
      )}

      {/* Policy Changes List */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
        <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Policy Change Registry</h4>
        {changesQ.isLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={20} color={wb.muted} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : changesQ.data && changesQ.data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {changesQ.data.map((c: any) => (
              <div key={c.id} style={{ padding: "10px 12px", background: selectedChange === c.id ? `${wb.gold}08` : "rgba(255,255,255,0.015)", borderRadius: 6, border: `1px solid ${selectedChange === c.id ? wb.gold + "30" : wb.cardBorder}`, cursor: "pointer" }} onClick={() => setSelectedChange(selectedChange === c.id ? null : c.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>{c.changeTitle}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 8px", borderRadius: 100, background: `${statusColors[c.status] || wb.muted}15`, color: statusColors[c.status] || wb.muted }}>{c.status?.replace(/_/g, " ")}</span>
                </div>
                {selectedChange === c.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${wb.cardBorder}` }}>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, lineHeight: 1.5, marginBottom: 10 }}>{c.changeDescription}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {nextStatus[c.status] && (
                        <button onClick={(e) => { e.stopPropagation(); statusMut.mutate({ changeId: c.id, status: nextStatus[c.status] as any }); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "4px 10px", borderRadius: 4, background: `${wb.green}15`, border: `1px solid ${wb.green}30`, color: wb.green, cursor: "pointer" }}>
                          Advance → {nextStatus[c.status].replace(/_/g, " ")}
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); packageMut.mutate({ changeId: c.id }); }} style={{ fontFamily: fontMono, fontSize: 9, padding: "4px 10px", borderRadius: 4, background: `${wb.purple}15`, border: `1px solid ${wb.purple}30`, color: wb.purple, cursor: "pointer" }}>{packageMut.isPending ? "..." : "Reform Package"}</button>
                    </div>
                    {packageMut.data && (
                      <div style={{ marginTop: 10, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 6, maxHeight: 200, overflow: "auto" }}>
                        <pre style={{ fontFamily: fontMono, fontSize: 10, color: wb.cream, whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(packageMut.data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 20 }}>No policy changes tracked yet. Create reforms first, then initiate policy changes.</p>
        )}
      </div>

      {/* Advocacy Organizations */}
      {orgsQ.data && orgsQ.data.length > 0 && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
          <h4 style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>Coalition Partners Available</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {orgsQ.data.map((org: any, i: number) => (
              <div key={i} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                <div style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream }}>{org.orgName}</div>
                <div style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, marginTop: 2 }}>{org.orgType} · {org.jurisdiction}</div>
                {selectedChange && (
                  <button onClick={() => coalitionMut.mutate({ changeId: selectedChange, orgId: String(org.id), actionType: "support" })} style={{ marginTop: 4, fontFamily: fontMono, fontSize: 8, padding: "2px 8px", borderRadius: 4, background: `${wb.teal}15`, border: `1px solid ${wb.teal}30`, color: wb.teal, cursor: "pointer" }}>Add to Coalition</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Case Link / Share Panel ───
function CaseLinkPanel({ caseId }: { caseId: number }) {
  const [accessLevel, setAccessLevel] = useState("summary");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [allowEvidence, setAllowEvidence] = useState(false);
  const [allowNames, setAllowNames] = useState(true);
  const [allowFinancials, setAllowFinancials] = useState(false);
  const [allowDocuments, setAllowDocuments] = useState(false);

  const links = trpc.engines.caseLink.getCaseLinks.useQuery({ caseId });
  const analytics = trpc.engines.caseLink.getAnalytics.useQuery({ caseId });
  const generateLink = trpc.engines.caseLink.generate.useMutation({
    onSuccess: () => links.refetch(),
  });
  const revokeLink = trpc.engines.caseLink.revoke.useMutation({
    onSuccess: () => links.refetch(),
  });

  const handleGenerate = () => {
    generateLink.mutate({
      caseId,
      accessLevel,
      expiresInDays,
      permissions: { allowEvidence, allowNames, allowFinancials, allowDocuments, allowPatternLinks: true },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: fontSerif, fontSize: 20, color: wb.cream, display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={20} color={wb.gold} /> Shareable Case Links
          </h3>
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginTop: 4 }}>Generate secure, tokenized links to share case data with external parties</p>
        </div>
      </div>

      {/* Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Links", value: analytics.data?.totalLinks || 0, color: wb.gold },
          { label: "Active", value: analytics.data?.activeLinks || 0, color: wb.green },
          { label: "Total Views", value: analytics.data?.totalViews || 0, color: wb.cyan },
          { label: "Recent Views", value: analytics.data?.recentViews?.length || 0, color: wb.purple },
        ].map((s, i) => (
          <div key={i} style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: fontSans, fontSize: 11, color: wb.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Generate Link Form */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 20 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, marginBottom: 16 }}>Generate New Link</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "block", marginBottom: 4 }}>Access Level</label>
            <select value={accessLevel} onChange={e => setAccessLevel(e.target.value)} style={{ width: "100%", background: wb.bg, border: `1px solid ${wb.cardBorder}`, borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13 }}>
              <option value="summary">Summary Only</option>
              <option value="detailed">Detailed</option>
              <option value="full">Full Access</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "block", marginBottom: 4 }}>Expires In (days)</label>
            <input type="number" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} style={{ width: "100%", background: wb.bg, border: `1px solid ${wb.cardBorder}`, borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[
            { label: "Evidence", checked: allowEvidence, set: setAllowEvidence },
            { label: "Names", checked: allowNames, set: setAllowNames },
            { label: "Financials", checked: allowFinancials, set: setAllowFinancials },
            { label: "Documents", checked: allowDocuments, set: setAllowDocuments },
          ].map((p, i) => (
            <label key={i} style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={p.checked} onChange={e => p.set(e.target.checked)} />
              {p.label}
            </label>
          ))}
        </div>
        <Button onClick={handleGenerate} disabled={generateLink.isPending} className="mt-4" size="sm">
          {generateLink.isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 4 }} /> : <Link2 size={14} style={{ marginRight: 4 }} />}
          Generate Link
        </Button>
      </div>

      {/* Existing Links */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 20 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, marginBottom: 12 }}>Active Links</h4>
        {(links.data || []).length === 0 ? (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 24 }}>No shareable links yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(links.data || []).map((link: any) => {
              const isExpired = link.expiresAt && link.expiresAt < Date.now();
              const shareUrl = `${window.location.origin}/shared-case/${link.token}`;
              return (
                <div key={link.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: wb.bg, borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fontMono, fontSize: 11, color: isExpired ? wb.red : wb.cream }}>
                      {shareUrl.substring(0, 60)}...
                    </div>
                    <div style={{ fontFamily: fontSans, fontSize: 11, color: wb.muted, marginTop: 2 }}>
                      {link.accessLevel} • {link.viewCount} views • {isExpired ? "Expired" : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                      <Copy size={12} />
                    </Button>
                    {!isExpired && (
                      <Button size="sm" variant="outline" onClick={() => revokeLink.mutate({ linkId: link.id })} style={{ color: wb.red }}>
                        <XCircle size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Attorney Match Panel ───
function AttorneyMatchPanel({ caseId }: { caseId: number }) {
  const [claimType, setClaimType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [estimatedDamages, setEstimatedDamages] = useState(0);
  const [needsContingency, setNeedsContingency] = useState(false);
  const [needsProBono, setNeedsProBono] = useState(false);

  const registry = trpc.engines.attorneyMatch.getRegistry.useQuery();
  const analytics = trpc.engines.attorneyMatch.getAnalytics.useQuery();
  const findMatches = trpc.engines.attorneyMatch.findMatches.useMutation();

  const handleSearch = () => {
    if (!claimType || !jurisdiction) return;
    findMatches.mutate({ caseId, claimType, jurisdiction, estimatedDamages: estimatedDamages || undefined, needsContingency, needsProBono });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ fontFamily: fontSerif, fontSize: 20, color: wb.cream, display: "flex", alignItems: "center", gap: 8 }}>
          <Briefcase size={20} color={wb.gold} /> Attorney Match Engine
        </h3>
        <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginTop: 4 }}>Find qualified attorneys matched to your case profile</p>
      </div>

      {/* Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Attorneys", value: analytics.data?.totalAttorneys || 0, color: wb.gold },
          { label: "Matches Made", value: analytics.data?.totalMatches || 0, color: wb.cyan },
          { label: "Avg Score", value: `${(analytics.data?.avgMatchScore || 0).toFixed(0)}%`, color: wb.green },
          { label: "Contact Rate", value: `${(analytics.data?.contactRate || 0).toFixed(0)}%`, color: wb.purple },
        ].map((s, i) => (
          <div key={i} style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: fontSans, fontSize: 11, color: wb.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search Form */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 20 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, marginBottom: 16 }}>Find Matching Attorneys</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "block", marginBottom: 4 }}>Claim Type</label>
            <input value={claimType} onChange={e => setClaimType(e.target.value)} placeholder="e.g., housing_discrimination" style={{ width: "100%", background: wb.bg, border: `1px solid ${wb.cardBorder}`, borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "block", marginBottom: 4 }}>Jurisdiction</label>
            <input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="e.g., Washington" style={{ width: "100%", background: wb.bg, border: `1px solid ${wb.cardBorder}`, borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "block", marginBottom: 4 }}>Est. Damages ($)</label>
            <input type="number" value={estimatedDamages} onChange={e => setEstimatedDamages(Number(e.target.value))} style={{ width: "100%", background: wb.bg, border: `1px solid ${wb.cardBorder}`, borderRadius: 6, padding: "8px 12px", color: wb.cream, fontFamily: fontSans, fontSize: 13 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={needsContingency} onChange={e => setNeedsContingency(e.target.checked)} />
            Contingency Only
          </label>
          <label style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={needsProBono} onChange={e => setNeedsProBono(e.target.checked)} />
            Pro Bono Only
          </label>
        </div>
        <Button onClick={handleSearch} disabled={findMatches.isPending || !claimType || !jurisdiction} className="mt-4" size="sm">
          {findMatches.isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 4 }} /> : <Search size={14} style={{ marginRight: 4 }} />}
          Find Matches
        </Button>
      </div>

      {/* Results */}
      {findMatches.data && (
        <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 20 }}>
          <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, marginBottom: 12 }}>
            {findMatches.data.length} Match{findMatches.data.length !== 1 ? "es" : ""} Found
          </h4>
          {findMatches.data.length === 0 ? (
            <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 24 }}>
              No matching attorneys found. Try broadening your search criteria or add attorneys to the registry.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findMatches.data.map((match: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: wb.bg, borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream }}>{match.attorney.name}</div>
                    <div style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, marginTop: 2 }}>
                      {match.attorney.firmName || "Independent"} • {match.attorney.jurisdiction || "N/A"} • {match.attorney.yearsExperience}yr exp
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {match.attorney.practiceAreas.slice(0, 3).map((pa: string, pi: number) => (
                        <span key={pi} style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold, background: `${wb.gold}15`, padding: "1px 6px", borderRadius: 100 }}>{pa}</span>
                      ))}
                      {match.attorney.acceptsContingency && <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.green, background: `${wb.green}15`, padding: "1px 6px", borderRadius: 100 }}>Contingency</span>}
                      {match.attorney.acceptsProBono && <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.purple, background: `${wb.purple}15`, padding: "1px 6px", borderRadius: 100 }}>Pro Bono</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 700, color: match.matchScore >= 70 ? wb.green : match.matchScore >= 50 ? wb.gold : wb.muted }}>
                      {match.matchScore.toFixed(0)}%
                    </div>
                    <div style={{ fontFamily: fontSans, fontSize: 10, color: wb.muted }}>match</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Registry */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 20 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, marginBottom: 12 }}>
          Attorney Registry ({registry.data?.length || 0})
        </h4>
        {(registry.data || []).length === 0 ? (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, textAlign: "center", padding: 24 }}>
            No attorneys in registry. Add attorneys from Mission Control or via the API.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(registry.data || []).slice(0, 10).map((att: any) => (
              <div key={att.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: wb.bg, borderRadius: 6, border: `1px solid ${wb.cardBorder}` }}>
                <div>
                  <span style={{ fontFamily: fontSans, fontSize: 13, color: wb.cream }}>{att.name}</span>
                  <span style={{ fontFamily: fontSans, fontSize: 11, color: wb.muted, marginLeft: 8 }}>{att.firmName || ""}</span>
                </div>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.gold }}>{att.jurisdiction || ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CasePatternBridgePanel({ caseId }: { caseId: number }) {
  const bridgeStats = trpc.casePatternBridge.bridgeStats.useQuery();
  const caseSignalsQ = trpc.casePatternBridge.getCaseSignals.useQuery({ caseId });
  const casePatternsQ = trpc.casePatternBridge.getCasePatterns.useQuery({ caseId });
  const runBridge = trpc.casePatternBridge.runBridge.useMutation({
    onSuccess: () => { bridgeStats.refetch(); caseSignalsQ.refetch(); casePatternsQ.refetch(); },
  });
  const bulkRun = trpc.casePatternBridge.bulkRunBridge.useMutation({
    onSuccess: () => { bridgeStats.refetch(); caseSignalsQ.refetch(); casePatternsQ.refetch(); },
  });

  const stats = bridgeStats.data;
  const signals = caseSignalsQ.data || [];
  const patterns = casePatternsQ.data || [];

  const severityColor = (s: string) => s === "critical" ? "#ef4444" : s === "high" ? "#f97316" : s === "medium" ? wb.gold : wb.muted;
  const statusColor = (s: string) => s === "active" ? wb.green : s === "candidate" ? wb.gold : s === "dormant" ? wb.muted : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: fontSans, fontSize: 16, fontWeight: 600, color: wb.cream, margin: 0 }}>Case → Pattern Bridge</h3>
          <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, marginTop: 2 }}>Links case activity to systemic pattern detection</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => runBridge.mutate({ caseId })}
            disabled={runBridge.isPending}
            style={{
              fontFamily: fontMono, fontSize: 11, padding: "6px 14px", borderRadius: 6,
              background: `${wb.gold}20`, border: `1px solid ${wb.gold}40`, color: wb.gold,
              cursor: runBridge.isPending ? "wait" : "pointer", opacity: runBridge.isPending ? 0.6 : 1,
            }}
          >
            {runBridge.isPending ? "Extracting..." : "Extract Signals"}
          </button>
          <button
            onClick={() => bulkRun.mutate()}
            disabled={bulkRun.isPending}
            style={{
              fontFamily: fontMono, fontSize: 11, padding: "6px 14px", borderRadius: 6,
              background: `${wb.purple}20`, border: `1px solid ${wb.purple}40`, color: wb.purple,
              cursor: bulkRun.isPending ? "wait" : "pointer", opacity: bulkRun.isPending ? 0.6 : 1,
            }}
          >
            {bulkRun.isPending ? "Processing All..." : "Run All Cases"}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {runBridge.data && (
        <div style={{ padding: "10px 14px", borderRadius: 6, background: `${wb.green}10`, border: `1px solid ${wb.green}30` }}>
          <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.green }}>
            Extracted {runBridge.data.signalsExtracted} signals • {runBridge.data.candidatesCreated} new candidates • {runBridge.data.candidatesStrengthened} strengthened • {runBridge.data.candidatesPromoted} promoted
          </span>
        </div>
      )}
      {bulkRun.data && (
        <div style={{ padding: "10px 14px", borderRadius: 6, background: `${wb.purple}10`, border: `1px solid ${wb.purple}30` }}>
          <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.purple }}>
            Bulk: {bulkRun.data.casesProcessed} cases • {bulkRun.data.totalSignals} signals • {bulkRun.data.totalCandidates} candidates • {bulkRun.data.totalPromoted} promoted {bulkRun.data.errors > 0 ? `• ${bulkRun.data.errors} errors` : ""}
          </span>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Case Signals", value: stats.signals.total, color: wb.gold },
            { label: "Active Signals", value: stats.signals.active, color: wb.green },
            { label: "Pattern Candidates", value: stats.candidates.total, color: wb.purple },
            { label: "Promoted", value: stats.candidates.promoted, color: wb.cyan },
          ].map((s, i) => (
            <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: wb.cardBg, border: `1px solid ${wb.cardBorder}` }}>
              <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Case Signals */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, margin: "0 0 12px" }}>
          Signals from This Case ({signals.length})
        </h4>
        {signals.length === 0 ? (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
            No signals extracted yet. Click "Extract Signals" to analyze this case for systemic patterns.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {signals.map((sig: any) => (
              <div key={sig.id} style={{ padding: "10px 12px", borderRadius: 6, background: `${wb.bg}80`, border: `1px solid ${wb.cardBorder}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${severityColor(sig.severity)}20`, color: severityColor(sig.severity), textTransform: "uppercase" }}>{sig.severity}</span>
                    <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${wb.cyan}15`, color: wb.cyan }}>{sig.signalType.replace(/_/g, " ")}</span>
                    {sig.entityName && <span style={{ fontFamily: fontSans, fontSize: 12, fontWeight: 600, color: wb.cream }}>{sig.entityName}</span>}
                  </div>
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold }}>{(Number(sig.confidenceScore) * 100).toFixed(0)}%</span>
                </div>
                <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.muted, margin: "6px 0 0", lineHeight: 1.4 }}>{sig.title}</p>
                {sig.patternCandidateId && (
                  <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.purple, marginTop: 4, display: "inline-block" }}>
                    → Linked to Pattern Candidate #{sig.patternCandidateId}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pattern Candidates linked to this case */}
      <div style={{ background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8, padding: 16 }}>
        <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: wb.cream, margin: "0 0 12px" }}>
          Pattern Candidates ({patterns.length})
        </h4>
        {patterns.length === 0 ? (
          <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
            No pattern candidates linked to this case yet. Patterns emerge when multiple cases share matching entities, claim types, or jurisdictions.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {patterns.map((p: any, i: number) => (
              <div key={i} style={{ padding: "10px 12px", borderRadius: 6, background: `${wb.bg}80`, border: `1px solid ${wb.cardBorder}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${statusColor(p.patternStatus)}20`, color: statusColor(p.patternStatus), textTransform: "uppercase" }}>{p.patternStatus}</span>
                    <span style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: wb.cream }}>{p.patternName}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted }}>{p.signalCount} signals</span>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted }}>{p.caseCount} cases</span>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.gold }}>{(Number(p.confidenceScore) * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {p.entityName && <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.cyan }}>{p.entityName}</span>}
                  {p.claimType && <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted }}>• {p.claimType}</span>}
                  {p.jurisdiction && <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted }}>• {p.jurisdiction}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${wb.gold}10`, color: wb.gold }}>{p.contributionType}</span>
                  {p.promotedPatternId && <span style={{ fontFamily: fontMono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${wb.green}15`, color: wb.green }}>→ Promoted to Pattern Registry</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline diagram */}
      <div style={{ padding: 16, borderRadius: 8, background: `${wb.bg}60`, border: `1px dashed ${wb.cardBorder}` }}>
        <div style={{ fontFamily: fontMono, fontSize: 10, color: wb.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pipeline Flow</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {["Case Data", "→", "Signal Extractor", "→", "Pattern Evaluator", "→", "Candidate", "→", "Pattern Registry"].map((step, i) => (
            step === "→" ? (
              <ArrowRight key={i} size={14} color={wb.gold} />
            ) : (
              <span key={i} style={{ fontFamily: fontMono, fontSize: 10, padding: "4px 10px", borderRadius: 4, background: `${wb.gold}10`, border: `1px solid ${wb.gold}25`, color: wb.cream }}>{step}</span>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkbenchDashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ caseId: string }>();
  const { cases: userCases, activeCase, setActiveCase } = useCase();

  const caseId = params.caseId ? parseInt(params.caseId, 10) : activeCase?.id;

  // If no caseId, show case selector
  if (!caseId) {
    return (
      <div className="min-h-screen" style={{ background: wb.bg, fontFamily: fontSans }}>
        <header style={{
          padding: "16px 24px",
          borderBottom: `1px solid ${wb.cardBorder}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <button onClick={() => navigate("/workshop")} style={{
            background: "none", border: "none", cursor: "pointer",
            color: wb.muted, display: "flex", alignItems: "center", gap: 6,
            fontFamily: fontMono, fontSize: 12,
          }}>
            <ArrowLeft size={14} /> Workshop
          </button>
        </header>
        <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <Wrench size={48} color={wb.gold} style={{ margin: "0 auto 20px" }} />
          <h1 style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 600, color: wb.cream, marginBottom: 12 }}>
            Workbench
          </h1>
          <p style={{ fontFamily: fontSans, fontSize: 14, color: wb.muted, lineHeight: 1.6, marginBottom: 32 }}>
            Select a case to open its workbench — or start a new one.
          </p>
          {!isAuthenticated ? (
            <Button onClick={() => { window.location.href = getLoginUrl(); }}>
              Sign In to Continue
            </Button>
          ) : userCases && userCases.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {userCases.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/workbench/${c.id}`)}
                  style={{
                    background: wb.cardBg,
                    border: `1px solid ${wb.cardBorder}`,
                    borderRadius: 8,
                    padding: "14px 18px",
                    cursor: "pointer",
                    textAlign: "left" as const,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "all 0.15s",
                  }}
                >
                  <Briefcase size={18} color={wb.gold} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 500, color: wb.cream }}>
                      {c.name}
                    </div>
                    {c.pipelineType && (
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: wb.muted, textTransform: "uppercase" as const }}>
                        {c.pipelineType}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} color={wb.muted} />
                </button>
              ))}
              <Button variant="outline" onClick={() => navigate("/welcome")} className="mt-4">
                Start New Case
              </Button>
            </div>
          ) : (
            <div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted, marginBottom: 16 }}>
                No cases yet. Start your first case to open the workbench.
              </p>
              <Button onClick={() => navigate("/welcome")}>
                Start a Case
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <WorkbenchContent caseId={caseId} />;
}

// ─── Workbench Content (with data) ───
function WorkbenchContent({ caseId }: { caseId: number }) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("summary");

  const overviewQuery = trpc.workbench.overview.useQuery({ caseId });
  const checklistQuery = trpc.workbench.checklist.useQuery({ caseId });
  const evidenceQuery = trpc.workbench.evidenceSummary.useQuery({ caseId });
  const activityQuery = trpc.workbench.recentActivity.useQuery({ caseId });
  const nextStepsQuery = trpc.workbench.nextSteps.useQuery({ caseId });
  const claimsQuery = trpc.workbench.claimsBreakdown.useQuery({ caseId });

  const overview = overviewQuery.data;
  const counts = overview?.counts;
  const caseData = overview?.case;

  const isLoading = overviewQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: wb.bg }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} color={wb.gold} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ fontFamily: fontSans, fontSize: 14, color: wb.muted }}>Loading workbench...</p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: wb.bg }}>
        <div style={{ textAlign: "center" }}>
          <AlertTriangle size={32} color={wb.red} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontFamily: fontSans, fontSize: 14, color: wb.muted }}>Case not found or access denied.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/workshop")}>
            Back to Workshop
          </Button>
        </div>
      </div>
    );
  }

  const checklistProgress = counts && counts.checklistTotal > 0
    ? Math.round((counts.checklistDone / counts.checklistTotal) * 100)
    : 0;

  const nextSteps = nextStepsQuery.data || [];
  const checklist = checklistQuery.data;
  const evidence = evidenceQuery.data || [];
  const activity = activityQuery.data;
  const claimsData = claimsQuery.data || [];

  return (
    <div className="min-h-screen" style={{ background: wb.bg, fontFamily: fontSans }}>
      {/* ── Header ── */}
      <header style={{
        padding: "12px 24px",
        borderBottom: `1px solid ${wb.cardBorder}`,
        background: "rgba(15,10,5,0.85)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => navigate("/workshop")} style={{
            background: "none", border: "none", cursor: "pointer",
            color: wb.muted, display: "flex", alignItems: "center", gap: 4,
            fontFamily: fontMono, fontSize: 11,
          }}>
            <ArrowLeft size={14} /> Workshop
          </button>
          <div style={{ width: 1, height: 20, background: wb.cardBorder }} />
          <Wrench size={16} color={wb.gold} />
          <span style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: wb.cream }}>
            Workbench
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: fontSans, fontSize: 13, color: wb.warm, fontWeight: 500 }}>
            {caseData.name}
          </span>
          {caseData.pipelineType && (
            <span style={{
              fontFamily: fontMono, fontSize: 9, letterSpacing: "0.08em",
              textTransform: "uppercase" as const, color: wb.gold,
              background: `${wb.gold}12`, border: `1px solid ${wb.gold}25`,
              padding: "2px 8px", borderRadius: 100,
            }}>
              {caseData.pipelineType}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${caseId}/control-room`)}>
            <Eye className="h-3.5 w-3.5 mr-1.5" /> Control Room
          </Button>
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 80px" }}>

        {/* ── Stats Row ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}>
          <StatCard label="Documents" value={counts?.documents || 0} icon={FileText} color={wb.purple} onClick={() => navigate("/documents")} />
          <StatCard label="Entities" value={counts?.entities || 0} icon={Users} color={wb.cyan} onClick={() => navigate("/entities")} />
          <StatCard label="Claims" value={counts?.claims || 0} icon={Scale} color={wb.gold} onClick={() => navigate("/findings")} />
          <StatCard label="Events" value={counts?.events || 0} icon={CalendarClock} color={wb.teal} onClick={() => navigate("/timeline")} />
          <StatCard label="Signals" value={counts?.signals || 0} icon={Flag} color={wb.red} />
          <StatCard label="Evidence" value={counts?.evidence || 0} icon={FlaskConical} color={wb.green} />
        </div>

        {/* ── Checklist Progress Bar ── */}
        {counts && counts.checklistTotal > 0 && (
          <div style={{
            background: wb.cardBg,
            border: `1px solid ${wb.cardBorder}`,
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            <CheckSquare size={18} color={checklistProgress === 100 ? wb.green : wb.gold} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Case Checklist
                </span>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.cream }}>
                  {counts.checklistDone}/{counts.checklistTotal}
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  background: checklistProgress === 100
                    ? `linear-gradient(90deg, ${wb.green}, #4ade80)`
                    : `linear-gradient(90deg, ${wb.gold}, ${wb.amber})`,
                  width: `${checklistProgress}%`,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
            {counts.missingRecords > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={14} color={wb.red} />
                <span style={{ fontFamily: fontMono, fontSize: 10, color: wb.red }}>
                  {counts.missingRecords} missing
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{
          display: "flex",
          gap: 2,
          marginBottom: 24,
          borderBottom: `1px solid ${wb.cardBorder}`,
          paddingBottom: 0,
        }}>
          {[
            { id: "summary", label: "Summary", icon: Layers },
            { id: "checklist", label: "Checklist", icon: ClipboardList },
            { id: "evidence", label: "Evidence", icon: FlaskConical },
            { id: "tools", label: "Tools", icon: Wrench },
            { id: "strategy", label: "Strategy", icon: Route },
            { id: "escalation", label: "Escalation", icon: Siren },
            { id: "remedy", label: "Remedy", icon: Calculator },
            { id: "memory", label: "Memory", icon: Brain },
            { id: "reform", label: "Reform", icon: Landmark },
            { id: "policy", label: "Policy", icon: Workflow },
            { id: "case-link", label: "Share", icon: Link2 },
            { id: "attorney", label: "Attorney", icon: Briefcase },
            { id: "pattern-bridge", label: "Patterns", icon: GitBranch },
            { id: "next", label: "Next Steps", icon: Compass, count: nextSteps.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: fontMono,
                fontSize: 11,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                color: activeTab === tab.id ? wb.cream : wb.muted,
                background: activeTab === tab.id ? `${wb.gold}12` : "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${wb.gold}` : "2px solid transparent",
                padding: "10px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{
                  fontFamily: fontMono, fontSize: 9, color: wb.gold,
                  background: `${wb.gold}15`, padding: "1px 5px", borderRadius: 100,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}

        {/* SUMMARY TAB */}
        {activeTab === "summary" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Left: Recent Activity */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Zap size={14} color={wb.gold} />
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Recent Activity
                </span>
              </div>

              {activity?.events && activity.events.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activity.events.slice(0, 8).map((evt) => (
                    <div key={evt.id} style={{
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.015)",
                      border: `1px solid ${wb.cardBorder}`,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}>
                      <CalendarClock size={14} color={wb.teal} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream, lineHeight: 1.4 }}>
                          {evt.description?.slice(0, 120) || "Event"}
                        </p>
                        <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                          {evt.eventType && (
                            <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.teal, textTransform: "uppercase" as const }}>
                              {evt.eventType}
                            </span>
                          )}
                          {evt.eventDate && (
                            <span style={{ fontFamily: fontMono, fontSize: 8, color: `${wb.muted}80` }}>
                              {new Date(evt.eventDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 32, textAlign: "center",
                  background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
                }}>
                  <CalendarClock size={24} color={wb.muted} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
                    No events yet. Upload documents to start building your timeline.
                  </p>
                </div>
              )}

              {/* Findings */}
              {activity?.findings && activity.findings.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Sparkles size={14} color={wb.red} />
                    <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                      Findings ({activity.findings.length})
                    </span>
                  </div>
                  {activity.findings.slice(0, 5).map((f) => (
                    <div key={f.id} style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: `${wb.red}06`,
                      border: `1px solid ${wb.red}15`,
                      marginBottom: 6,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.red, textTransform: "uppercase" as const }}>
                          {f.findingType}
                        </span>
                        {f.severity && (
                          <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.muted }}>
                            {f.severity}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream, lineHeight: 1.4 }}>
                        {f.summary?.slice(0, 100) || "Finding detected"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Claims + Signals */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Scale size={14} color={wb.gold} />
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Claims ({claimsData.length})
                </span>
              </div>

              {claimsData.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {claimsData.slice(0, 8).map((claim) => (
                    <div key={claim.id} style={{
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.015)",
                      border: `1px solid ${wb.cardBorder}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontFamily: fontMono, fontSize: 8, letterSpacing: "0.06em",
                          textTransform: "uppercase" as const, color: wb.gold,
                          background: `${wb.gold}12`, padding: "1px 6px", borderRadius: 100,
                        }}>
                          {claim.claimType}
                        </span>
                        {claim.severity && (
                          <span style={{
                            fontFamily: fontMono, fontSize: 8, color:
                              claim.severity === "critical" ? wb.red :
                              claim.severity === "high" ? "#f59e0b" : wb.muted,
                          }}>
                            {claim.severity}
                          </span>
                        )}
                        {claim.confidence && (
                          <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.muted }}>
                            {Math.round(Number(claim.confidence) * 100)}%
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream, lineHeight: 1.4 }}>
                        {claim.description?.slice(0, 120) || "Claim identified"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 32, textAlign: "center",
                  background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
                }}>
                  <Scale size={24} color={wb.muted} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
                    No claims detected yet. Run analysis to identify potential claims.
                  </p>
                </div>
              )}

              {/* Signals */}
              {activity?.signals && activity.signals.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Flag size={14} color={wb.red} />
                    <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                      Signals ({activity.signals.length})
                    </span>
                  </div>
                  {activity.signals.slice(0, 5).map((s) => (
                    <div key={s.id} style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: `${wb.red}06`,
                      border: `1px solid ${wb.red}15`,
                      marginBottom: 6,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.red, textTransform: "uppercase" as const }}>
                          {s.signalType}
                        </span>
                        <span style={{ fontFamily: fontMono, fontSize: 8, color: wb.muted }}>
                          {s.severity}
                        </span>
                      </div>
                      <p style={{ fontFamily: fontSans, fontSize: 12, color: wb.cream, lineHeight: 1.4, marginTop: 2 }}>
                        {s.description?.slice(0, 100) || "Signal flagged"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHECKLIST TAB */}
        {activeTab === "checklist" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Checklist Items */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <CheckSquare size={14} color={wb.green} />
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Parts Present ({checklist?.items?.filter((i: any) => i.completed).length || 0}/{checklist?.items?.length || 0})
                </span>
              </div>
              {checklist?.items && checklist.items.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {checklist.items.map((item: any) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 32, textAlign: "center",
                  background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
                }}>
                  <ClipboardList size={24} color={wb.muted} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
                    No checklist items yet. Run case analysis to generate a checklist.
                  </p>
                </div>
              )}
            </div>

            {/* Missing Records */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <XCircle size={14} color={wb.red} />
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Missing Records ({checklist?.missing?.length || 0})
                </span>
              </div>
              {checklist?.missing && checklist.missing.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {checklist.missing.map((item: any) => (
                    <MissingRecordRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 32, textAlign: "center",
                  background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
                }}>
                  <CheckCircle2 size={24} color={wb.green} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: wb.muted }}>
                    No missing records identified. The engine will flag gaps as analysis progresses.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EVIDENCE TAB */}
        {activeTab === "evidence" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FlaskConical size={14} color={wb.purple} />
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: wb.muted }}>
                  Evidence Items ({evidence.length})
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/upload")}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload More
              </Button>
            </div>
            {evidence.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {evidence.map((item: any) => (
                  <EvidenceRow key={item.id} item={item} onNavigate={navigate} />
                ))}
              </div>
            ) : (
              <div style={{
                padding: 48, textAlign: "center",
                background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
              }}>
                <FlaskConical size={32} color={wb.muted} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                <p style={{ fontFamily: fontSans, fontSize: 14, color: wb.muted, marginBottom: 16 }}>
                  No evidence items yet. Upload documents to start building your evidence base.
                </p>
                <Button onClick={() => navigate("/upload")}>
                  <Upload className="h-4 w-4 mr-2" /> Upload Documents
                </Button>
              </div>
            )}

            {/* Proof/Event link summary */}
            {counts && (counts.proofLinks > 0 || counts.eventLinks > 0) && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: wb.cardBg,
                border: `1px solid ${wb.cardBorder}`,
                borderRadius: 8,
                display: "flex",
                gap: 24,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link2 size={14} color={wb.purple} />
                  <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.cream }}>
                    {counts.proofLinks} proof links
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CalendarClock size={14} color={wb.cyan} />
                  <span style={{ fontFamily: fontMono, fontSize: 11, color: wb.cream }}>
                    {counts.eventLinks} event links
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TOOLS TAB */}
        {activeTab === "tools" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}>
            {TOOLS.map((tool) => (
              <button
                key={tool.href}
                onClick={() => navigate(tool.href)}
                style={{
                  background: wb.cardBg,
                  border: `1px solid ${wb.cardBorder}`,
                  borderRadius: 8,
                  padding: "14px 18px",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${tool.color}12`, border: `1px solid ${tool.color}25`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <tool.icon size={18} color={tool.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: wb.cream }}>
                    {tool.label}
                  </div>
                  <div style={{ fontFamily: fontSans, fontSize: 11, color: wb.muted, lineHeight: 1.4 }}>
                    {tool.desc}
                  </div>
                </div>
                <ChevronRight size={14} color={wb.muted} />
              </button>
            ))}
          </div>
        )}

        {/* STRATEGY REVIEW TAB */}
        {activeTab === "strategy" && <StrategyReviewPanel caseId={caseId} />}

        {/* ESCALATION TAB */}
        {activeTab === "escalation" && <EscalationPanel caseId={caseId} />}

        {/* REMEDY GENERATOR TAB */}
        {activeTab === "remedy" && <RemedyGeneratorPanel caseId={caseId} />}

        {/* MEMORY ENGINE TAB */}
        {activeTab === "memory" && <MemoryPanel caseId={caseId} />}

        {/* REFORM ENGINE TAB */}
        {activeTab === "reform" && <ReformPanel />}

        {/* POLICY CHANGE ENGINE TAB */}
        {activeTab === "policy" && <PolicyChangePanel />}

        {/* CASE LINK / SHARE TAB */}
        {activeTab === "case-link" && <CaseLinkPanel caseId={caseId} />}

        {/* ATTORNEY MATCH TAB */}
        {activeTab === "attorney" && <AttorneyMatchPanel caseId={caseId} />}

        {/* CASE → PATTERN BRIDGE TAB */}
        {activeTab === "pattern-bridge" && <CasePatternBridgePanel caseId={caseId} />}

        {/* NEXT STEPS TAB */}
        {activeTab === "next" && (
          <div>
            {nextSteps.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {nextSteps.map((step, i) => (
                  <NextStepCard key={i} step={step} onNavigate={navigate} />
                ))}
              </div>
            ) : (
              <div style={{
                padding: 48, textAlign: "center",
                background: wb.cardBg, border: `1px solid ${wb.cardBorder}`, borderRadius: 8,
              }}>
                <CheckCircle2 size={32} color={wb.green} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                <p style={{ fontFamily: fontSans, fontSize: 14, color: wb.muted }}>
                  All current steps are complete. Continue building your case or explore the Workshop tools.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
