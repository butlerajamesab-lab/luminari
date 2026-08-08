import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  Lightbulb, Flag, Link2, FileCheck, FileWarning,
  FileText, Quote, ExternalLink, ChevronDown, ChevronUp,
  ArrowRight, BookOpen, Search, Upload, Send, ShieldCheck,
} from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { useState, useMemo } from "react";
import { usePlainText } from "@/hooks/usePlainText";
import { formatFindingForReadAloud, formatSignalForReadAloud, formatCorrelationForReadAloud } from "@/lib/forensicReadAloud";
import { buildFromParam } from "@/lib/buildFromParam";
import { deriveDocumentDisplayLabel } from "@/lib/documentLabel";
import { MissingRecordsSection } from "@/components/MissingRecords";
import { EnforcementSuggestions } from "@/components/EnforcementSuggestions";

/* ─── Evidentiary Weight Badge ─── */
function WeightBadge({ weight }: { weight: string }) {
  if (weight === "finding") {
    return (
      <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
        <FileCheck className="h-2.5 w-2.5" />
        Finding
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 gap-1">
      <FileWarning className="h-2.5 w-2.5" />
      Note / Signal
    </Badge>
  );
}

/* ─── Statement Origin Badge ─── */
function OriginBadge({ origin }: { origin: string }) {
  const colors: Record<string, string> = {
    sworn_testimony: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    court_filing: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    discovery_disclosure: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    media_report: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    internal_memo: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    informal_communication: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return (
    <Badge className={`text-[9px] ${colors[origin] || "bg-muted text-muted-foreground"}`}>
      {origin.replace(/_/g, " ")}
    </Badge>
  );
}

/* ─── Expandable Quote (matches EntityDetail pattern) ─── */
function ExpandableQuote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 180;

  return (
    <div className="flex items-start gap-1 pl-4">
      <Quote className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] text-muted-foreground italic leading-snug ${!expanded && isLong ? "line-clamp-3" : ""}`}>
          &ldquo;{text}&rdquo;
        </p>
        {isLong && (
          <button
            className="text-[9px] text-primary hover:underline mt-0.5 flex items-center gap-0.5"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? <><ChevronUp className="h-2.5 w-2.5" /> Less</> : <><ChevronDown className="h-2.5 w-2.5" /> More</>}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Inline Provenance Block (matches EntityDetail evidence rendering) ─── */
function ProvenanceBlock({ evidence, onNavigate }: {
  evidence: Array<{
    documentDisplayLabel: string;
    documentId: number | null;
    pageNumber: number | null;
    verbatimQuote: string | null;
    statementOrigin: string;
    claimText: string;
  }>;
  onNavigate: (path: string) => void;
}) {
  if (!evidence || evidence.length === 0) {
    return <p className="text-[10px] text-muted-foreground/50 mt-1 italic">Provenance unsupported — finding generated without claim-level references</p>;
  }

  return (
    <div className="space-y-1.5 mt-2 pl-2 border-l-2 border-primary/20">
      {evidence.map((ev, idx) => {
        const fromVal = encodeURIComponent(buildFromParam());
        const deepLink = ev.documentId
          ? `/documents/${ev.documentId}?from=${fromVal}${ev.pageNumber ? `&page=${ev.pageNumber}` : ""}`
          : null;
        return (
          <div key={idx} className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
              <FileText className="h-3 w-3 text-primary/60 shrink-0" />
              {deepLink ? (
                <button
                  className="text-primary hover:underline font-medium text-left"
                  onClick={(e) => { e.stopPropagation(); onNavigate(deepLink); }}
                >
                  {ev.documentDisplayLabel}{ev.pageNumber ? `, p.${ev.pageNumber}` : ""}
                </button>
              ) : (
                <span className="text-muted-foreground">{ev.documentDisplayLabel}</span>
              )}
              {ev.statementOrigin && ev.statementOrigin !== "unknown" && (
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                  {ev.statementOrigin.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            {ev.verbatimQuote && <ExpandableQuote text={ev.verbatimQuote} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Enriched Findings Tab ── */
function FindingsTab({ caseId }: { caseId: number }) {
  const { data: findings, isLoading } = trpc.findings.listEnriched.useQuery({ caseId });
  const { data: lifecycle } = trpc.snapshots.lifecycle.useQuery({ caseId });
  const [visible, setVisible] = useState(15);
  const [filter, setFilter] = useState<"all" | "finding" | "note_signal">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const plainify = usePlainText();
  const [, setLocation] = useLocation();

  if (isLoading) return <Skeleton />;
  if (!findings || findings.length === 0) {
    const isOpen = lifecycle?.hasSnapshot && lifecycle.status === 'open';
    const extractionRunning = isOpen && lifecycle.stages?.extraction?.status === 'running';
    const claimBuildRunning = isOpen && lifecycle.stages?.claimBuild?.status === 'running';
    const correlationPending = isOpen && lifecycle.stages?.correlation?.status !== 'complete';
    const reanalysisRunning = extractionRunning || claimBuildRunning;
    let message: string;
    if (reanalysisRunning) {
      message = "Legacy snapshot reanalysis is in progress. Canonical Intake verification remains a separate record.";
    } else if (correlationPending) {
      message = "Legacy findings are pending correlation build for this snapshot.";
    } else if (!lifecycle?.hasSnapshot) {
      message = "No legacy findings snapshot exists. Use Verification for the canonical Intake Spine evidence posture.";
    } else {
      message = "No legacy findings are projected for this case. This does not imply that canonical verification is empty.";
    }
    return <Empty icon={<Lightbulb className="h-10 w-10 text-muted-foreground" />} text={message} />;
  }

  const searched = findings.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return f.title.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.findingType.toLowerCase().includes(q) ||
      (f.significance && f.significance.toLowerCase().includes(q));
  });
  const filtered = filter === "all" ? searched : searched.filter(f => f.evidentiaryWeight === filter);
  const shown = filtered.slice(0, visible);

  const findingCount = findings.filter(f => f.evidentiaryWeight === "finding").length;
  const noteCount = findings.filter(f => f.evidentiaryWeight === "note_signal").length;

  return (
    <div className="space-y-3">
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search findings by title, description, type..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setVisible(15); }}
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setFilter("all")}>
          All ({findings.length})
        </Button>
        <Button variant={filter === "finding" ? "default" : "outline"} size="sm" className="text-xs h-7 gap-1" onClick={() => setFilter("finding")}>
          <FileCheck className="h-3 w-3" /> Findings ({findingCount})
        </Button>
        <Button variant={filter === "note_signal" ? "default" : "outline"} size="sm" className="text-xs h-7 gap-1" onClick={() => setFilter("note_signal")}>
          <FileWarning className="h-3 w-3" /> Notes / Signals ({noteCount})
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Legacy findings gate: only claims from <span className="text-primary">sworn testimony</span>, <span className="text-primary">court filings</span>, and <span className="text-primary">discovery disclosures</span> become legacy Findings. Universal Intake verification is shown separately and is not silently recast as a finding.
      </p>

      {shown.map((f) => (
        <Card key={f.id} className={f.evidentiaryWeight === "finding" ? "border-emerald-500/20" : "border-amber-500/10"}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground">{plainify(f.title)}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{plainify(f.description)}</p>
                {f.significance && <p className="text-xs text-primary/80 mt-1">{plainify(f.significance)}</p>}
              </div>
              <WeightBadge weight={f.evidentiaryWeight} />
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] capitalize">{f.confidence}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize">{f.findingType.replace(/_/g, " ")}</Badge>
                {f.provenanceStatus === "unsupported" && (
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">Unlinked</Badge>
                )}
                <button
                  className="inline-flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
                  onClick={() => setLocation(`/lumensend?type=demand&context=finding`)}
                  title="Draft a letter based on this finding"
                >
                  <Send className="w-3 h-3" />
                  LumenSend
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <CommitToCase type="finding" itemId={f.id} />
                <FlagArea location="findings" targetId={f.id} targetType="finding" message={`Review finding: ${f.title}`} />
                <ReadAloud
                  text={`${f.evidentiaryWeight === "finding" ? "Finding" : "Note"}. ${f.title}. ${f.description}`}
                  forensicText={formatFindingForReadAloud({ title: f.title, description: f.description, significance: f.significance || undefined, evidentiaryWeight: f.evidentiaryWeight, findingType: f.findingType, confidence: f.confidence }, {})}
                />
              </div>
            </div>

            <ProvenanceBlock evidence={f.backingEvidence} onNavigate={setLocation} />
          </CardContent>
        </Card>
      ))}
      {visible < filtered.length && (
        <Button variant="outline" className="w-full" onClick={() => setVisible(v => v + 15)}>
          Show more ({filtered.length - visible} remaining)
        </Button>
      )}
    </div>
  );
}

/* ─── Enriched Signal Flags Tab ─── */
function FlagsTab({ caseId }: { caseId: number }) {
  const { data: flags, isLoading } = trpc.flags.listEnriched.useQuery({ caseId });
  const [visible, setVisible] = useState(20);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const plainify = usePlainText();
  const [, setLocation] = useLocation();

  if (isLoading) return <Skeleton />;
  if (!flags || flags.length === 0) return <Empty icon={<Flag className="h-10 w-10 text-muted-foreground" />} text="No signal flags raised yet." />;

  const shown = flags.slice(0, visible);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {shown.map((f) => {
        const isExpanded = expandedIds.has(f.id);
        const hasQuote = !!f.quote;
        const hasDocument = !!f.document;

        return (
          <Card key={f.id}>
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium capitalize">{f.flagType.replace(/_/g, " ")}</p>
                    {hasDocument && (
                      <button
                        onClick={() => setLocation(`/documents/${f.document!.id}?from=${encodeURIComponent(buildFromParam())}`)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <FileText className="h-2.5 w-2.5" />
                        {deriveDocumentDisplayLabel(f.document!.filename)}
                      </button>
                    )}
                  </div>
                  {f.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{plainify(f.description)}</p>
                  )}

                  {hasQuote && !isExpanded && (
                    <button
                      onClick={() => toggleExpand(f.id)}
                      className="text-[10px] text-primary/60 hover:text-primary mt-1 flex items-center gap-1"
                    >
                      <Quote className="h-2.5 w-2.5" />
                      View backing quote
                      {f.quote?.pageNumber && <span className="text-muted-foreground">· p.{f.quote.pageNumber}</span>}
                    </button>
                  )}

                  {isExpanded && hasQuote && (
                    <div className="mt-2 bg-muted/30 border border-border/50 rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Quote className="h-3 w-3 text-amber-400 shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed italic">"{f.quote!.text}"</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasDocument && (
                          <button
                            onClick={() => { const fromVal = encodeURIComponent(buildFromParam()); const pageParam = f.quote?.pageNumber ? `&page=${f.quote.pageNumber}` : ''; setLocation(`/documents/${f.document!.id}?from=${fromVal}${pageParam}`); }}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            View in document{f.quote?.pageNumber ? ` (p.${f.quote.pageNumber})` : ""}
                          </button>
                        )}
                        <OriginBadge origin={f.quote!.statementOrigin} />
                      </div>
                      <button
                        onClick={() => toggleExpand(f.id)}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        <ChevronUp className="h-2.5 w-2.5" /> Hide
                      </button>
                    </div>
                  )}
                </div>
                <ReadAloud
                  text={`${f.flagType.replace(/_/g, " ")}. ${f.description || ""}`}
                  forensicText={formatSignalForReadAloud({ flagType: f.flagType, description: f.description || "" }, {})}
                  label=""
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
      {visible < flags.length && (
        <Button variant="outline" className="w-full" onClick={() => setVisible(v => v + 20)}>
          Show more ({flags.length - visible} remaining)
        </Button>
      )}
    </div>
  );
}

/* ─── Enriched Correlations Tab ─── */
type EnrichedCorrelation = {
  id: number;
  caseId: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  correlationType: string;
  description: string | null;
  sharedIdentifiers: unknown;
  sourceDocument: { id: number; filename: string; documentType: string | null } | null;
  targetDocument: { id: number; filename: string; documentType: string | null } | null;
};

function CorrelationsTab({ caseId }: { caseId: number }) {
  const { data: correlations, isLoading } = trpc.correlations.listEnriched.useQuery({ caseId }) as { data: EnrichedCorrelation[] | undefined; isLoading: boolean };
  const [visible, setVisible] = useState(20);
  const plainify = usePlainText();
  const [, setLocation] = useLocation();

  if (isLoading) return <Skeleton />;
  if (!correlations || correlations.length === 0) return <Empty icon={<Link2 className="h-10 w-10 text-muted-foreground" />} text="No cross-document correlations found yet." />;

  const shown = correlations.slice(0, visible);

  return (
    <div className="space-y-2">
      {shown.map((c) => {
        const srcDoc = c.sourceDocument;
        const tgtDoc = c.targetDocument;
        const shared = c.sharedIdentifiers as string[] | null;
        return (
          <Card key={c.id}>
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Link2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-medium capitalize">{c.correlationType.replace(/_/g, " ")}</p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{plainify(c.description)}</p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {srcDoc && (
                      <button
                        onClick={() => setLocation(`/documents/${srcDoc.id}?from=${encodeURIComponent(buildFromParam())}`)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 bg-primary/5 rounded px-2 py-0.5"
                      >
                        <FileText className="h-3 w-3" />
                        {deriveDocumentDisplayLabel(srcDoc.filename)}
                      </button>
                    )}
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    {tgtDoc && (
                      <button
                        onClick={() => setLocation(`/documents/${tgtDoc.id}?from=${encodeURIComponent(buildFromParam())}`)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 bg-primary/5 rounded px-2 py-0.5"
                      >
                        <FileText className="h-3 w-3" />
                        {deriveDocumentDisplayLabel(tgtDoc.filename)}
                      </button>
                    )}
                  </div>

                  {shared && shared.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">Shared:</span>
                      {shared.slice(0, 5).map((sid, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[9px]">{sid}</Badge>
                      ))}
                      {shared.length > 5 && (
                        <span className="text-[9px] text-muted-foreground">+{shared.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
                <ReadAloud
                  text={`${c.correlationType}. ${c.description || ""}`}
                  forensicText={formatCorrelationForReadAloud({ correlationType: c.correlationType, description: c.description || undefined }, {})}
                  label=""
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
      {visible < correlations.length && (
        <Button variant="outline" className="w-full" onClick={() => setVisible(v => v + 20)}>
          Show more ({correlations.length - visible} remaining)
        </Button>
      )}
    </div>
  );
}

/* ─── Shared helpers ─── */
function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  const [, nav] = useLocation();
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
        {icon}
        <p className="text-sm text-muted-foreground">{text}</p>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => nav("/upload")} className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload Evidence
          </Button>
          <Button variant="ghost" size="sm" onClick={() => nav("/")} className="gap-1.5 text-xs">
            Back to Overview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationTab({ caseId }: { caseId: number }) {
  const projection = trpc.analyze.getIntakeVerificationProjection.useQuery(
    { caseId },
    { retry: false },
  );

  if (projection.isLoading) return <Skeleton />;
  if (projection.error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="p-5 text-sm text-red-300">
          Canonical verification projection is unavailable: {projection.error.message}
        </CardContent>
      </Card>
    );
  }
  if (projection.data?.projection_state !== "canonical_projection") {
    return (
      <Empty
        icon={<ShieldCheck className="h-10 w-10 text-muted-foreground" />}
        text="No sealed Layer 5 verification projection exists yet. Preserve evidence and run the Universal Intake Spine to create a source-bound verification record."
      />
    );
  }

  const records = projection.data.outputs.flatMap(output =>
    output.records.map(record => ({
      ...record,
      intake_session_id: output.intake_session_id,
      receipt_hash: output.receipt_hash,
      output_hash: output.output_hash,
      layer_version: output.layer_version,
      rule_version: output.rule_version,
    })),
  );
  const unresolved = projection.data.outputs.flatMap(output => output.unresolved_dependencies);

  if (records.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 space-y-3 text-center">
          <ShieldCheck className="h-9 w-9 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-medium">Verification completed with zero fact records</p>
            <p className="text-xs text-muted-foreground mt-1">
              Zero is preserved as a completed result; it is not presented as proof that no facts exist.
            </p>
          </div>
          {unresolved.length > 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-amber-300 mb-1">Unresolved dependencies</p>
              {unresolved.map((dependency: any, index: number) => (
                <p key={index} className="text-xs text-muted-foreground">{dependency.field}: {dependency.detail || dependency.reason}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Verification records are evidence posture, not legal conclusions and not legacy narrative findings. Each state below is reproduced from the sealed Layer 5 output and remains bound to its source artifacts and receipt.
        </CardContent>
      </Card>

      {records.map((record, index) => {
        const [entityId, attribute, applicableTime] = record.fact_key.split("|");
        const contradiction = record.verification_state === "contradicted" || record.contradiction_refs.length > 0;
        return (
          <Card key={`${record.intake_session_id}:${record.output_hash}:${record.fact_key}:${index}`} className={contradiction ? "border-red-500/25" : "border-border"}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{attribute?.replace(/_/g, " ") || "Verified fact"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <code>{entityId || record.fact_key}</code>
                    {applicableTime && applicableTime !== "TIMELESS" && <span>· {applicableTime}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={contradiction ? "text-red-300 border-red-400/30" : "text-cyan-300 border-cyan-400/30"}>
                  {record.verification_state.replace(/_/g, " ")}
                </Badge>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Source statements</p>
                <div className="space-y-1.5">
                  {record.source_refs.map((source: any, sourceIndex: number) => (
                    <div key={`${source.artifact_key}:${source.span_offset}:${sourceIndex}`} className="rounded-md bg-muted/20 border border-border/50 p-2.5">
                      <p className="text-xs break-words">{source.value_stated}</p>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        <code className="break-all">{source.artifact_key}</code> · offset {source.span_offset}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {record.contradiction_refs.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-300 mb-1.5">Contradiction records</p>
                  <div className="space-y-1.5">
                    {record.contradiction_refs.map((conflict: any, conflictIndex: number) => (
                      <div key={conflictIndex} className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 text-xs">
                        <div><code className="break-all">{conflict.artifact_key_a}</code>: {conflict.value_a}</div>
                        <div className="my-1 text-red-300">≠</div>
                        <div><code className="break-all">{conflict.artifact_key_b}</code>: {conflict.value_b}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details className="rounded-md border border-border/50 p-2.5 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Deterministic receipt</summary>
                <div className="mt-2 space-y-1 text-[10px]">
                  <div><span className="text-muted-foreground">Fact key:</span> <code className="break-all">{record.fact_key}</code></div>
                  <div><span className="text-muted-foreground">Session:</span> <code className="break-all">{record.intake_session_id}</code></div>
                  <div><span className="text-muted-foreground">Receipt:</span> <code className="break-all">{record.receipt_hash}</code></div>
                  <div><span className="text-muted-foreground">Output:</span> <code className="break-all">{record.output_hash}</code></div>
                  <div><span className="text-muted-foreground">Versions:</span> {record.layer_version} / {record.rule_version}</div>
                </div>
              </details>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ─── Main Page ─── */
export default function Findings() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("verification");

  const { data: verificationProjection } = trpc.analyze.getIntakeVerificationProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, retry: false },
  );
  const verificationCount = verificationProjection?.outputs.reduce(
    (total, output) => total + output.records.length,
    0,
  ) ?? 0;

  const { data: findingsData } = trpc.findings.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const findings = findingsData?.length;
  const { data: flags } = trpc.flags.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, select: (d) => d.length }
  );
  const { data: correlations } = trpc.correlations.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, select: (d) => d.length }
  );

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Findings & Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deterministic verification records, legacy findings, signal flags, and correlations remain separately classified and source-bound.
        </p>
      </div>

      {findingsData && findingsData.length > 0 && (
        <PageReadAloud
          text={findingsData.map(f => `${f.evidentiaryWeight === "finding" ? "Finding" : "Note"}. ${f.title}. ${f.description}`).join(" Next. ")}
          forensicText={findingsData.map(f => formatFindingForReadAloud({ title: f.title, description: f.description, significance: f.significance || undefined, evidentiaryWeight: f.evidentiaryWeight, findingType: f.findingType, confidence: f.confidence }, {})).join(" Next. ")}
          label="Listen to all findings"
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="verification" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verification ({verificationCount})
          </TabsTrigger>
          <TabsTrigger value="findings" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Legacy Findings ({findings ?? 0})
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            Signal Flags ({flags ?? 0})
          </TabsTrigger>
          <TabsTrigger value="correlations" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Correlations ({correlations ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification" className="mt-4">
          {activeTab === "verification" && <VerificationTab caseId={currentCaseId} />}
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          {activeTab === "findings" && <FindingsTab caseId={currentCaseId} />}
        </TabsContent>

        <TabsContent value="flags" className="mt-4">
          {activeTab === "flags" && <FlagsTab caseId={currentCaseId} />}
        </TabsContent>

        <TabsContent value="correlations" className="mt-4">
          {activeTab === "correlations" && <CorrelationsTab caseId={currentCaseId} />}
        </TabsContent>
      </Tabs>

      <MissingRecordsSection caseId={currentCaseId} />

      <div className="mt-4">
        <EnforcementSuggestions caseId={currentCaseId} />
      </div>
      <NextStepBar
        context="Verification and findings reviewed. Preserve their distinct states, then inspect governed claim candidates and procedural paths."
        steps={[
          { label: "Claim Elements", href: "/claim-elements", icon: "file", variant: "primary", description: "Inspect case candidates and required elements" },
          { label: "Provenance", href: "/provenance", icon: "gavel", description: "Trace receipts and source support" },
          { label: "Control Room", href: "/control-room", icon: "map", description: "Review the current case state" },
        ]}
      />
    </div>
  );
}
