import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Clock, Calendar, Upload, FileText, ShieldCheck } from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { useMemo, useState } from "react";
import { formatEventForReadAloud } from "@/lib/forensicReadAloud";
import { humanize_chronology_value, source_message_time_label } from "@/lib/chronologyProjection";
import { filter_source_events, project_source_events, source_document_id, source_document_options } from "@/lib/caseSourceInspection";
import { buildFromParam } from "@/lib/buildFromParam";

export default function Timeline() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  if (!currentCaseId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-muted-foreground">Select a case first</p>
      <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
    </div>
  );
  return <CaseChronology key={currentCaseId} caseId={currentCaseId} />;
}

function CaseChronology({ caseId }: { caseId: number }) {
  const [, setLocation] = useLocation();
  const eventsQuery = trpc.events.list.useQuery({ caseId });
  const documentsQuery = trpc.documents.list.useQuery({ caseId });
  const [documentId, setDocumentId] = useState(() => typeof window === "undefined" ? "" : source_document_id(new URLSearchParams(window.location.search).get("document")) ?? "");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(50);
  const chronology = useMemo(() => project_source_events(eventsQuery.data ?? []), [eventsQuery.data]);
  const documents = useMemo(() => source_document_options(chronology, documentsQuery.data ?? []), [chronology, documentsQuery.data]);
  const statuses = useMemo(() => [...new Set(chronology.map(event => event.fact_status))].sort(), [chronology]);
  const filtered = useMemo(() => filter_source_events(chronology, { document_id: documentId, query: search, scope, status }), [chronology, documentId, search, scope, status]);
  const hasFilters = Boolean(documentId || search || scope || status);
  const clearFilters = () => { setDocumentId(""); setSearch(""); setScope(""); setStatus(""); setVisible(50); };
  const openDocument = (id: string) => setLocation(`/documents/${id}?from=${encodeURIComponent(buildFromParam())}`);
  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const accessDenied = [eventsQuery.error, documentsQuery.error]
    .some(error => ["UNAUTHORIZED", "FORBIDDEN"].includes(error?.data?.code ?? ""));
  if (accessDenied) return <Card><CardContent className="p-4" role="alert">Access to this chronology is unavailable. Sign in with an account that has access to this case.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chronology</h1>
        <p className="text-sm text-muted-foreground mt-1">Inspect events by source document, scope, and recorded evidence status.</p>
      </div>
      <Card className="border-dashed bg-muted/10">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Each event retains what its source states. Events from different documents are separate observations; a shared date or name does not establish independent corroboration. Facility-wide observations are labeled separately from case-specific events.</p>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs">Source document
          <select aria-label="Source document" className={selectClass} value={documentId} onChange={event => { setDocumentId(event.target.value); setVisible(50); }}>
            <option value="">All documents ({chronology.length} events)</option>
            {documentId && !documents.some(document => document.id === documentId) && <option value={documentId}>Document {documentId}</option>}
            {documents.map(document => <option key={document.id} value={document.id}>{document.filename} ({document.event_count})</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs">Search events
          <Input aria-label="Search chronology" value={search} placeholder="Text, actor, date, or filename" onChange={event => { setSearch(event.target.value); setVisible(50); }} />
        </label>
        <label className="space-y-1 text-xs">Event scope
          <select aria-label="Event scope" className={selectClass} value={scope} onChange={event => { setScope(event.target.value); setVisible(50); }}>
            <option value="">All scopes</option><option value="case_specific">Case specific</option><option value="facility_wide">Facility wide</option><option value="unknown">Scope not recorded</option>
          </select>
        </label>
        <label className="space-y-1 text-xs">Evidence status
          <select aria-label="Evidence status" className={selectClass} value={status} onChange={event => { setStatus(event.target.value); setVisible(50); }}>
            <option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{humanize_chronology_value(value)}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span>{filtered.length} of {chronology.length} events · {documents.length} documents</span>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        {documentId && <Button variant="outline" size="sm" onClick={() => openDocument(documentId)}><FileText className="h-3.5 w-3.5 mr-1" /> Open selected document</Button>}
      </div>
      {eventsQuery.error && <div role="alert" className="rounded-md border border-red-500/30 p-3 text-sm">{eventsQuery.data ? "Chronology refresh failed. Showing the last successful result." : "Chronology could not be loaded."} <Button variant="ghost" size="sm" onClick={() => void eventsQuery.refetch()}>Retry</Button></div>}
      {documentsQuery.error && <p role="status" className="text-xs text-muted-foreground">The document list could not be refreshed. Documents linked to loaded events remain available.</p>}
      {filtered.length > 0 && <PageReadAloud text={filtered.map(record => `${record.event_date || "Date unknown"}. ${source_message_time_label(record) ? `${source_message_time_label(record)}. ` : ""}${record.observed_event}`).join(" Next event. ")} label="Listen to filtered chronology" />}
      {eventsQuery.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(index => <div key={index} className="h-24 bg-muted/50 rounded-md animate-pulse" />)}</div>
      ) : filtered.length === 0 && !eventsQuery.error ? (
        <Card className="border-dashed"><CardContent className="p-8 flex flex-col items-center gap-4 text-center">
          <Clock className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{hasFilters ? "No chronology events match these filters. Open the source document to inspect evidence that has no extracted event." : "No source-bound chronology events are available yet."}</p>
          {hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Show all events</Button> : <Button variant="outline" size="sm" onClick={() => setLocation("/upload")}><Upload className="h-3.5 w-3.5 mr-1" /> Upload Evidence</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filtered.slice(0, visible).map(record => <Card key={record.chronology_event_id}><CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium whitespace-pre-wrap break-words">{record.observed_event}</p>
              <ReadAloud text={record.observed_event} forensicText={[formatEventForReadAloud({ title: record.observed_event, dateOccurred: record.event_date || undefined, location: record.location || undefined }, {}), source_message_time_label(record)].filter(Boolean).join(" ")} label="" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /><span>{record.event_date ?? "Date unknown"} · {humanize_chronology_value(record.event_date_precision)}</span>
              <Badge variant="secondary">{humanize_chronology_value(record.fact_status)}</Badge>
              <Badge variant="outline">{record.event_scope === "unknown" ? "Scope not recorded" : humanize_chronology_value(record.event_scope)}</Badge>
              {record.actor && <span>Actor stated: {record.actor}</span>}
            </div>
            {source_message_time_label(record) && <p className="text-xs text-muted-foreground">{source_message_time_label(record)}</p>}
            {record.document_id && <button className="text-xs text-primary hover:underline text-left flex items-center gap-1.5" onClick={() => openDocument(record.document_id!)}><FileText className="h-3.5 w-3.5 shrink-0" />{record.document_filename || `Document ${record.document_id}`}</button>}
            <details className="rounded-md border border-border/50 bg-muted/20 p-2.5 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Source references · {humanize_chronology_value(record.source_confidence_level)}</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">{record.source_references.map(reference => <code key={reference} className="rounded bg-background px-1.5 py-0.5 text-[10px] break-all">{reference}</code>)}</div>
            </details>
          </CardContent></Card>)}
          {visible < filtered.length && <Button variant="outline" className="w-full" onClick={() => setVisible(count => count + 50)}>Show more ({filtered.length - visible} remaining)</Button>}
        </div>
      )}
    </div>
  );
}
