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
  BookOpen, Search, Upload, Send, ShieldCheck,
} from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { useState, useMemo, useEffect } from "react";
import { usePlainText } from "@/hooks/usePlainText";
import { formatFindingForReadAloud, formatSignalForReadAloud } from "@/lib/forensicReadAloud";
import { buildFromParam } from "@/lib/buildFromParam";
import { deriveDocumentDisplayLabel } from "@/lib/documentLabel";
import { MissingRecordsSection } from "@/components/MissingRecords";
import { EnforcementSuggestions } from "@/components/EnforcementSuggestions";
import { inspect_document_pair, project_source_events, source_document_id, type source_event } from "@/lib/caseSourceInspection";
import { humanize_chronology_value, source_message_time_label } from "@/lib/chronologyProjection";
import { DocumentConnectionEvidence, type connection_basis } from "@/components/DocumentConnectionEvidence";

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
  const [visible, setVisible] = useState(15);
  const [filter, setFilter] = useState<"all" | "finding" | "note_signal">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const plainify = usePlainText();
  const [, setLocation] = useLocation();

  if (isLoading) return <Skeleton />;
  if (!findings || findings.length === 0) {
    return <Empty icon={<Lightbulb className="h-10 w-10 text-muted-foreground" />} text="No narrative findings are committed for this case. Review the receipt-bound Verification projection for the governed Intake Spine evidence posture." />;
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

/* ─── Source connections ─── */
type EnrichedCorrelation = {
  id: number;
  caseId: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  correlationType: string | null;
  description?: string | null;
  sharedIdentifiers?: unknown;
  evidenceStatus?: "source_linked" | "unverified";
  basis?: connection_basis[];
  canonicalConnectionId?: string | null;
  sourceDocument: { id: number; filename: string | null } | null;
  targetDocument: { id: number; filename: string | null } | null;
};

function SourceEventCandidates({ documentId, filename, events, onNavigate }: {
  documentId: number; filename: string; events: source_event[]; onNavigate: (path: string) => void;
}) {
  const [visible, setVisible] = useState(5);
  return <section className="min-w-0 rounded-md border border-border p-3 space-y-2">
    <h4 className="text-xs font-semibold break-words">{filename}</h4>
    <p className="text-xs text-muted-foreground">{events.length} source-bound event{events.length === 1 ? "" : "s"}</p>
    {events.length === 0 && <p className="text-xs text-muted-foreground">No chronology events are extracted from this document. Open the document to inspect its source text.</p>}
    {events.slice(0, visible).map(event => <article key={event.chronology_event_id} className="rounded border border-border/50 p-2 space-y-1">
      <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground"><span>{event.event_date ?? "Date unknown"} · {humanize_chronology_value(event.event_date_precision)}</span><Badge variant="outline" className="text-[9px]">{humanize_chronology_value(event.fact_status)}</Badge></div>
      {source_message_time_label(event) && <p className="text-[10px] text-muted-foreground">{source_message_time_label(event)}</p>}
      <p className="text-xs whitespace-pre-wrap break-words">{event.observed_event}</p>
      <details className="text-[10px] text-muted-foreground"><summary className="cursor-pointer">Exact source references</summary>{event.source_references.map(reference => <code key={reference} className="block break-all">{reference}</code>)}</details>
    </article>)}
    {visible < events.length && <Button variant="ghost" size="sm" onClick={() => setVisible(count => count + 10)}>Show more ({events.length - visible} remaining)</Button>}
    <Button variant="outline" size="sm" onClick={() => onNavigate(`/timeline?document=${documentId}`)}>View this document's chronology</Button>
  </section>;
}

export function CorrelationsTab({ caseId }: { caseId: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [documentFilter, setDocumentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const correlationsQuery = trpc.correlations.listEnriched.useInfiniteQuery({
    caseId, limit: 20,
    documentId: documentFilter ? Number(documentFilter) : undefined,
    search: appliedSearch || undefined,
  }, { getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined });
  const correlations = correlationsQuery.data?.pages.flatMap((page: { items: EnrichedCorrelation[] }) => page.items) as EnrichedCorrelation[] | undefined;
  const documentsQuery = trpc.documents.list.useQuery({ caseId });
  const eventsQuery = trpc.events.list.useQuery({ caseId }, { enabled: expanded !== null });
  const events = useMemo(() => project_source_events(eventsQuery.data ?? []), [eventsQuery.data]);
  const [, setLocation] = useLocation();
  useEffect(() => { setExpanded(null); setDocumentFilter(""); setSearch(""); setAppliedSearch(""); }, [caseId]);
  useEffect(() => { setExpanded(null); }, [documentFilter, appliedSearch]);
  const documents = useMemo(() => {
    const result = new Map<number, string>();
    for (const document of documentsQuery.data ?? []) {
      result.set(document.id, document.filename || `Document ${document.id}`);
    }
    return [...result.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [documentsQuery.data]);
  const openDocument = (id: number) => { if (source_document_id(id)) setLocation(`/documents/${id}?from=${encodeURIComponent(buildFromParam())}`); };

  const accessDenied = [correlationsQuery.error, documentsQuery.error, eventsQuery.error]
    .some(error => ["UNAUTHORIZED", "FORBIDDEN"].includes(error?.data?.code ?? ""));
  if (accessDenied) return <Card><CardContent className="p-4" role="alert">Access to these source records is unavailable. Sign in with an account that has access to this case.</CardContent></Card>;

  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Inspect the exact mentions behind a document connection. A shared identity or repeated statement does not establish that the same event occurred or was independently corroborated.</p>
    {correlationsQuery.error && <div role="alert" className="text-sm text-red-300">{correlations ? "Connection refresh failed. Showing the last successful result." : "Document connections could not be loaded."} <Button variant="ghost" size="sm" onClick={() => void correlationsQuery.refetch()}>Retry</Button></div>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs space-y-1">Source document<select aria-label="Filter document connections" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={documentFilter} onChange={event => setDocumentFilter(event.target.value)}><option value="">All documents</option>{documents.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs space-y-1">Search connections<input aria-label="Search document connections" maxLength={200} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={search} placeholder="Entity, filename, or recorded link type" onChange={event => setSearch(event.target.value)} /></label>
    </div>
    {correlationsQuery.isLoading ? <Skeleton /> : <p className="text-xs text-muted-foreground">{correlations?.length ?? 0} connections loaded{correlationsQuery.hasNextPage ? " · more available" : ""}</p>}
    {!correlationsQuery.isLoading && !correlationsQuery.error && !correlations?.length && <p className="text-sm">No document connections match these filters.</p>}
    {(correlations ?? []).map(connection => {
      const key = connection.canonicalConnectionId ?? `legacy:${connection.id}`;
      const supported = connection.evidenceStatus === "source_linked" && Boolean(connection.basis?.length);
      const sourceName = connection.sourceDocument?.filename || `Document ${connection.sourceDocumentId}`;
      const targetName = connection.targetDocument?.filename || `Document ${connection.targetDocumentId}`;
      const pair = expanded === key ? inspect_document_pair(events, connection.sourceDocumentId, connection.targetDocumentId) : null;
      return <Card key={key}><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{supported ? "Shared entity mentions" : `Recorded link: ${(connection.correlationType || "unspecified").replace(/_/g, " ")}`}</h3>
          <Badge variant="outline">{supported ? "Source-linked mentions" : "Unverified candidate"}</Badge>
        </div>
        {supported ? <p className="text-xs text-muted-foreground">These documents mention the same canonical entity. The quoted evidence below explains the connection.</p> : <p className="text-xs text-muted-foreground">This saved link contains no paired quotations, event identifiers, or verification rationale. Its label is not a verified corroboration finding. Compare the available source observations below.</p>}
        <div className="grid gap-2 sm:grid-cols-2">{[{ id: connection.sourceDocumentId, name: sourceName }, { id: connection.targetDocumentId, name: targetName }].map((document, index) => <button key={`${index}:${document.id}`} className="text-xs text-primary hover:underline text-left flex items-center gap-1.5" onClick={() => openDocument(document.id)}><FileText className="h-3.5 w-3.5 shrink-0" />{document.name}</button>)}</div>
        {supported && <DocumentConnectionEvidence basis={connection.basis!} onOpenDocument={openDocument} />}
        <Button variant="outline" size="sm" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}>{expanded === key ? "Close source event comparison" : "Compare source events"}</Button>
        {pair && <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Each column lists events extracted from that document. Rows are not matched event pairs; no corroboration judgment is inferred from this comparison.</p>
          {eventsQuery.isLoading && <p role="status" className="text-xs">Loading source-bound chronology…</p>}
          {eventsQuery.error && <div role="alert" className="text-xs">{eventsQuery.data ? "Chronology refresh failed. Showing the last successful source observations." : "Source events could not be loaded."} <Button variant="ghost" size="sm" onClick={() => void eventsQuery.refetch()}>Retry</Button></div>}
          {eventsQuery.data && <div className="grid gap-3 lg:grid-cols-2"><SourceEventCandidates key={`${key}:source`} documentId={connection.sourceDocumentId} filename={sourceName} events={pair.source_events} onNavigate={setLocation} /><SourceEventCandidates key={`${key}:target`} documentId={connection.targetDocumentId} filename={targetName} events={pair.target_events} onNavigate={setLocation} /></div>}
        </div>}
      </CardContent></Card>;
    })}
    {correlationsQuery.hasNextPage && <Button variant="outline" className="w-full" disabled={correlationsQuery.isFetchingNextPage} onClick={() => void correlationsQuery.fetchNextPage()}>{correlationsQuery.isFetchingNextPage ? "Loading connections…" : "Load more connections"}</Button>}
  </div>;
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
          Deterministic verification records, legacy findings, signal flags, and document connections retain their evidence status.
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
            Document connections
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
