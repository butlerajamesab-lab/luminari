import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, FileText, Quote, AlertTriangle, Users, ExternalLink, Shield, RefreshCw, Loader2, Download, Ban, FileX, Link2, ChevronDown } from "lucide-react";
import ReplaceDocumentModalV2 from "@/components/ReplaceDocumentModalV2";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { toast } from "sonner";
import { useState, useCallback, useMemo } from "react";
import { useCase } from "@/contexts/CaseContext";
import { usePlainText } from "@/hooks/usePlainText";
import { getFromParam } from "@/lib/buildFromParam";
import { formatQuoteForReadAloud, formatClaimForReadAloud, formatDocumentPurposeForReadAloud } from "@/lib/forensicReadAloud";
import AnnotatedText from "@/components/AnnotatedText";
import type { AnnotationEntity, AnnotationQuote, AnnotationCorrelation } from "@/components/AnnotatedText";

function QuotesTab({ docId }: { docId: number }) {
  const { data: quotes, isLoading } = trpc.documents.quotes.useQuery({ documentId: docId });
  const [visibleCount, setVisibleCount] = useState(20);

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}</div>;

  if (!quotes || quotes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No quotes extracted yet</p>
        </CardContent>
      </Card>
    );
  }

  const visible = quotes.slice(0, visibleCount);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{quotes.length} quotes total</p>
      {visible.map((q) => (
        <Card key={q.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <blockquote className="text-sm text-foreground border-l-2 border-primary/50 pl-3 italic flex-1">
                "{q.text}"
              </blockquote>
              <ReadAloud text={q.text} forensicText={formatQuoteForReadAloud(q.text, { pageNumber: q.pageNumber || undefined })} label="" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              {q.pageNumber && <Badge variant="outline" className="text-[10px]">Page {q.pageNumber}</Badge>}
              {q.context && <span className="text-[10px] text-muted-foreground">{q.context}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
      {visibleCount < quotes.length && (
        <Button variant="outline" className="w-full" onClick={() => setVisibleCount(c => c + 20)}>
          Show more ({quotes.length - visibleCount} remaining)
        </Button>
      )}
    </div>
  );
}

function ClaimsTab({ docId }: { docId: number }) {
  const { data: claims, isLoading } = trpc.documents.claims.useQuery({ documentId: docId });

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}</div>;

  if (!claims || claims.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No claims extracted yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {claims.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground flex-1">{c.claimText}</p>
              <ReadAloud text={c.claimText} forensicText={formatClaimForReadAloud(c.claimText, {})} label="" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] capitalize">{c.claimType}</Badge>
              {c.dateReferenced && <span className="text-[10px] text-muted-foreground">{c.dateReferenced}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EntitiesTab({ docId }: { docId: number }) {
  const { data: entityRoles, isLoading } = trpc.documents.entityRoles.useQuery({ documentId: docId });
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}</div>;

  if (!entityRoles || entityRoles.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No entities identified yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {entityRoles.map((er) => (
        <Card key={er.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setLocation(`/entities/${er.entityId}`)}>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{er.entityName ?? `Entity ${er.entityId}`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{er.entityType && <span className="capitalize">{er.entityType} · </span>}Role: {er.role}</p>
            </div>
            <Button variant="ghost" size="sm">View</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DocumentDetail() {
  const params = useParams<{ id: string }>();
  const docId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("text");
  const utils = trpc.useUtils();
  const plainify = usePlainText();
  const { currentCaseId } = useCase();

  const [resolutionModal, setResolutionModal] = useState<{ type: 'corrupted' | 'excluded' | 'uploadReplace' } | null>(null);
  const [resolutionReason, setResolutionReason] = useState("");

  const fromParam = getFromParam();
  const handleBack = () => {
    if (fromParam) setLocation(fromParam);
    else setLocation("/documents");
  };

  const { data: doc, isLoading } = trpc.documents.get.useQuery({ id: docId }, { enabled: !!docId });
  const { data: annotationQuotes } = trpc.documents.quotes.useQuery({ documentId: docId }, { enabled: !!docId && activeTab === "text" });
  const { data: annotationEntityRoles } = trpc.documents.entityRoles.useQuery({ documentId: docId }, { enabled: !!docId && activeTab === "text" });
  const caseId = doc?.caseId;
  const { data: annotationEntities } = trpc.entities.list.useQuery({ caseId: caseId! }, { enabled: !!caseId && activeTab === "text" });
  const { data: annotationCorrelations } = trpc.correlations.list.useQuery({ caseId: caseId! }, { enabled: !!caseId && activeTab === "text" });

  const docEntities = useMemo<AnnotationEntity[]>(() => {
    if (!annotationEntityRoles || !annotationEntities) return [];
    const entityIds = new Set(annotationEntityRoles.map(er => er.entityId));
    return annotationEntities.filter(e => entityIds.has(e.id)).map(e => ({ id: e.id, name: e.name, type: e.type, aliases: Array.isArray(e.aliases) ? e.aliases as string[] : undefined }));
  }, [annotationEntityRoles, annotationEntities]);

  const docQuotes = useMemo<AnnotationQuote[]>(() => annotationQuotes ? annotationQuotes.map(q => ({ id: q.id, text: q.text, pageNumber: q.pageNumber, statementOrigin: (q as any).statementOrigin })) : [], [annotationQuotes]);
  const docCorrelations = useMemo<AnnotationCorrelation[]>(() => {
    if (!annotationCorrelations || !docId) return [];
    return annotationCorrelations.filter(c => c.sourceDocumentId === docId || c.targetDocumentId === docId).map(c => ({ id: c.id, sharedIdentifiers: Array.isArray(c.sharedIdentifiers) ? c.sharedIdentifiers as string[] : undefined, correlationType: c.correlationType, sourceDocumentId: c.sourceDocumentId, targetDocumentId: c.targetDocumentId }));
  }, [annotationCorrelations, docId]);

  const handleEntityClick = useCallback((entityId: number) => setLocation(`/entities/${entityId}`), [setLocation]);
  const handleQuoteClick = useCallback((quoteId: number) => { setActiveTab("quotes"); toast.info(`Navigated to Quotes tab — Quote #${quoteId}`); }, []);
  const handleCorrelationClick = useCallback(() => { setLocation("/findings"); toast.info("Navigated to Findings → Correlations tab"); }, [setLocation]);

  const { data: lifecycle } = trpc.snapshots.lifecycle.useQuery({ caseId: currentCaseId! }, { enabled: !!currentCaseId, refetchInterval: 5000 });
  const isSealed = lifecycle?.hasSnapshot && lifecycle?.status === 'sealed';
  const { data: replacementChain } = trpc.documents.replacementChain.useQuery({ documentId: docId }, { enabled: !!docId });

  const markCorruptedMutation = trpc.documents.markCorrupted.useMutation({
    onSuccess: () => {
      toast.success('Document marked as corrupted');
      setResolutionModal(null);
      setResolutionReason('');
      utils.documents.get.invalidate();
      utils.documents.list.invalidate();
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markExcludedMutation = trpc.documents.markExcluded.useMutation({
    onSuccess: () => {
      toast.success('Document marked as excluded');
      setResolutionModal(null);
      setResolutionReason('');
      utils.documents.get.invalidate();
      utils.documents.list.invalidate();
      utils.snapshots.lifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDownload = useCallback(() => {
    if (doc?.s3Url) {
      const a = document.createElement("a");
      a.href = doc.s3Url;
      a.download = doc.filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [doc]);

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-md animate-pulse" />)}</div>;
  if (!doc) return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><p className="text-muted-foreground">Document not found</p><Button variant="outline" onClick={handleBack}>Back to Documents</Button></div>;

  const statusColor = doc.status === "ready" ? "bg-emerald-400" : doc.status === "analyzing" ? "bg-amber-400" : doc.status === "extracting" ? "bg-blue-400" : doc.status === "error" ? "bg-red-400" : "bg-muted-foreground";
  const openIntakeSpine = () => setLocation(`/case/${doc.caseId}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{doc.filename}</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5"><div className={`h-2 w-2 rounded-full ${statusColor}`} /><span className="text-[10px] text-muted-foreground capitalize">{doc.status}</span></div>
            <span className="text-[10px] text-muted-foreground font-mono">{doc.sha256Hash.slice(0, 16)}...</span>
            {doc.documentType && <Badge variant="outline" className="text-[10px]">{doc.documentType}</Badge>}
            {(doc as any).documentResolution && (doc as any).documentResolution !== 'active' && (
              <Badge className={`text-[10px] ${(doc as any).documentResolution === 'superseded' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : (doc as any).documentResolution === 'corrupted' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>{(doc as any).documentResolution}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(!(doc as any).documentResolution || (doc as any).documentResolution === 'active') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5" disabled={!!isSealed}><Shield className="h-3.5 w-3.5" />Resolution<ChevronDown className="h-3 w-3 opacity-60" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => { setResolutionModal({ type: 'corrupted' }); setResolutionReason(''); }} className="gap-2"><FileX className="h-4 w-4 text-red-400" /><div><p className="font-medium text-red-300">Mark Corrupted</p><p className="text-[10px] text-muted-foreground">Remove from active corpus</p></div></DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setResolutionModal({ type: 'excluded' }); setResolutionReason(''); }} className="gap-2"><Ban className="h-4 w-4 text-amber-400" /><div><p className="font-medium text-amber-300">Mark Excluded</p><p className="text-[10px] text-muted-foreground">Exclude from analysis</p></div></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setResolutionModal({ type: 'uploadReplace' })} className="gap-2"><RefreshCw className="h-4 w-4 text-cyan-400" /><div><p className="font-medium text-cyan-300">Upload Replacement</p><p className="text-[10px] text-muted-foreground">Upload a new file to replace this document</p></div></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openIntakeSpine}><Shield className="h-3.5 w-3.5" />Run Intake Spine</Button>
          {doc.s3Url && <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}><Download className="h-3.5 w-3.5" />Download</Button>}
          {doc.s3Url && <Button variant="outline" size="sm" className="gap-1.5" asChild><a href={doc.s3Url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Source</a></Button>}
        </div>
      </div>

      {(doc as any).documentResolution && (doc as any).documentResolution !== 'active' && (
        <Card className={`${(doc as any).documentResolution === 'superseded' ? 'border-blue-500/30 bg-blue-950/20' : (doc as any).documentResolution === 'corrupted' ? 'border-red-500/30 bg-red-950/20' : 'border-amber-500/30 bg-amber-950/20'}`}>
          <CardContent className="p-3 flex items-start gap-3">
            {(doc as any).documentResolution === 'superseded' ? <Link2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" /> : (doc as any).documentResolution === 'corrupted' ? <FileX className="h-4 w-4 text-red-400 shrink-0 mt-0.5" /> : <Ban className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
            <div className="text-xs flex-1 space-y-1">
              <p className="font-medium capitalize">Document {(doc as any).documentResolution}</p>
              {(doc as any).resolutionReason && <p className="text-muted-foreground">{(doc as any).resolutionReason}</p>}
              {(doc as any).replacedByDocumentId && <button onClick={() => setLocation(`/documents/${(doc as any).replacedByDocumentId}`)} className="text-blue-300 hover:text-blue-200 underline underline-offset-2">View replacement document #{(doc as any).replacedByDocumentId}</button>}
            </div>
          </CardContent>
        </Card>
      )}

      {replacementChain && replacementChain.length > 1 && (
        <Card className="border-cyan-500/20 bg-cyan-950/10"><CardContent className="p-3"><div className="flex items-center gap-2 mb-2"><Link2 className="h-4 w-4 text-cyan-400" /><span className="text-xs font-medium text-cyan-200">Replacement Chain</span></div><div className="flex items-center gap-1 flex-wrap">{replacementChain.map((item: any, i: number) => <span key={item.id} className="flex items-center gap-1">{i > 0 && <span className="text-muted-foreground text-[10px]">&rarr;</span>}<button onClick={() => item.id !== docId && setLocation(`/documents/${item.id}`)} className={`text-[11px] px-1.5 py-0.5 rounded ${item.id === docId ? 'bg-cyan-500/20 text-cyan-200 font-medium' : 'bg-muted/30 text-muted-foreground hover:text-foreground'}`}>#{item.id} {item.filename?.slice(0, 20)}{item.filename?.length > 20 ? '...' : ''}{item.documentResolution && item.documentResolution !== 'active' && <span className="text-[9px] ml-1 opacity-70">({item.documentResolution})</span>}</button></span>)}</div></CardContent></Card>
      )}

      <Card className="bg-muted/30"><CardContent className="p-3 flex items-center gap-3"><Shield className="h-4 w-4 text-primary shrink-0" /><div className="text-xs space-y-0.5 flex-1"><p><span className="text-muted-foreground">SHA-256:</span> <span className="font-mono text-[11px]">{doc.sha256Hash}</span></p><p><span className="text-muted-foreground">Uploaded:</span> {new Date(doc.createdAt).toLocaleString()}</p><p><span className="text-muted-foreground">Size:</span> {(doc.fileSize / 1024).toFixed(1)} KB {doc.pageCount ? `· ${doc.pageCount} pages` : ""}</p></div></CardContent></Card>

      {doc.textContent && <PageReadAloud text={doc.textContent} context={{ documentName: doc.filename, documentType: doc.documentType || undefined }} label="Listen to document" />}

      {doc.documentPurpose && (
        <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium text-muted-foreground">Document Purpose</CardTitle><ReadAloud text={doc.documentPurpose} forensicText={formatDocumentPurposeForReadAloud(doc.documentPurpose, { documentName: doc.filename, documentType: doc.documentType || undefined })} /></CardHeader><CardContent><p className="text-sm text-foreground leading-relaxed">{plainify(doc.documentPurpose)}</p></CardContent></Card>
      )}

      {doc.errorMessage && (
        <Card className="border-amber-500/50 bg-amber-950/20"><CardContent className="p-4"><div className="flex items-start gap-3"><AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" /><div className="flex-1 space-y-2"><p className="text-sm text-amber-200 font-medium">Legacy extraction state</p><p className="text-sm text-amber-200/80">{doc.errorMessage}</p><Button variant="outline" size="sm" className="gap-1.5 mt-2 border-amber-500/50 text-amber-200 hover:bg-amber-500/20" onClick={openIntakeSpine}><Shield className="h-3.5 w-3.5" />Open Intake Spine</Button></div></div></CardContent></Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="text" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Text</TabsTrigger><TabsTrigger value="quotes" className="gap-1.5"><Quote className="h-3.5 w-3.5" />Quotes</TabsTrigger><TabsTrigger value="claims" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Claims</TabsTrigger><TabsTrigger value="entities" className="gap-1.5"><Users className="h-3.5 w-3.5" />Entities</TabsTrigger></TabsList>
        <TabsContent value="text" className="mt-4">
          {doc.textContent ? (
            <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium text-muted-foreground">Extracted Text</CardTitle><ReadAloud text={doc.textContent} label="Read Full Text" /></CardHeader><CardContent className="p-4 pt-0"><AnnotatedText text={doc.textContent} entities={docEntities} quotes={docQuotes} correlations={docCorrelations} onEntityClick={handleEntityClick} onQuoteClick={handleQuoteClick} onCorrelationClick={handleCorrelationClick} /></CardContent></Card>
          ) : (
            <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="text-sm text-muted-foreground">{doc.status === "extracting" ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Text extraction in progress...</span> : doc.status === "analyzing" ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Analysis in progress...</span> : "No text content extracted"}</p></CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">{activeTab === "quotes" && <QuotesTab docId={docId} />}</TabsContent>
        <TabsContent value="claims" className="mt-4">{activeTab === "claims" && <ClaimsTab docId={docId} />}</TabsContent>
        <TabsContent value="entities" className="mt-4">{activeTab === "entities" && <EntitiesTab docId={docId} />}</TabsContent>
      </Tabs>

      <Dialog open={resolutionModal?.type === 'corrupted'} onOpenChange={(open) => { if (!open) setResolutionModal(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-red-300"><FileX className="h-5 w-5" />Mark as Corrupted</DialogTitle><DialogDescription>This removes <strong>{doc.filename}</strong> from the active corpus. It will no longer block extraction integrity or gate progression.</DialogDescription></DialogHeader><div className="space-y-3 py-2"><div><label className="text-xs font-medium text-muted-foreground">Reason (minimum 10 characters)</label><Textarea value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} placeholder="Describe why this document is corrupted..." className="mt-1.5" rows={3} /><p className="text-[10px] text-muted-foreground mt-1">{resolutionReason.trim().length}/10 characters minimum</p></div></div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => setResolutionModal(null)}>Cancel</Button><Button variant="destructive" disabled={resolutionReason.trim().length < 10 || markCorruptedMutation.isPending} onClick={() => markCorruptedMutation.mutate({ documentId: docId, reason: resolutionReason.trim() })} className="gap-2">{markCorruptedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileX className="h-4 w-4" />}Mark Corrupted</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={resolutionModal?.type === 'excluded'} onOpenChange={(open) => { if (!open) setResolutionModal(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-amber-300"><Ban className="h-5 w-5" />Mark as Excluded</DialogTitle><DialogDescription>This excludes <strong>{doc.filename}</strong> from analysis. It will no longer block extraction integrity or gate progression.</DialogDescription></DialogHeader><div className="space-y-3 py-2"><div><label className="text-xs font-medium text-muted-foreground">Reason (minimum 10 characters)</label><Textarea value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} placeholder="Describe why this document should be excluded..." className="mt-1.5" rows={3} /><p className="text-[10px] text-muted-foreground mt-1">{resolutionReason.trim().length}/10 characters minimum</p></div></div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => setResolutionModal(null)}>Cancel</Button><Button className="gap-2 bg-amber-600 hover:bg-amber-700 text-white" disabled={resolutionReason.trim().length < 10 || markExcludedMutation.isPending} onClick={() => markExcludedMutation.mutate({ documentId: docId, reason: resolutionReason.trim() })}>{markExcludedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}Mark Excluded</Button></DialogFooter></DialogContent>
      </Dialog>

      <ReplaceDocumentModalV2 open={resolutionModal?.type === 'uploadReplace'} onClose={() => setResolutionModal(null)} documentId={docId} documentName={doc?.filename || ''} onSuccess={() => { utils.documents.get.invalidate(); utils.documents.list.invalidate(); utils.snapshots.lifecycle.invalidate(); }} />
    </div>
  );
}
