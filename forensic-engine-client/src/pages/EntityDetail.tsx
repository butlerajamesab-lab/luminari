import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, User, FileText, Network, Quote, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { usePlainText } from "@/hooks/usePlainText";
import { formatRelationshipForReadAloud, wrapWithCompletion } from "@/lib/forensicReadAloud";
import { deriveDocumentDisplayLabel } from "@/lib/documentLabel";
import { getFromParam, buildFromParam } from "@/lib/buildFromParam";
import { useState } from "react";

/* ─── Expandable Quote (shared pattern) ─── */
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

export default function EntityDetail() {
  const params = useParams<{ id: string }>();
  const entityId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  // Context-aware back navigation
  const fromParam = getFromParam();
  const handleBack = () => {
    if (fromParam) {
      setLocation(fromParam);
    } else {
      setLocation("/entities");
    }
  };

  const { data: entity, isLoading } = trpc.entities.get.useQuery({ id: entityId }, { enabled: !!entityId });
  const { data: roles } = trpc.entities.roles.useQuery({ entityId }, { enabled: !!entityId });
  const { data: relationships } = trpc.entities.relationships.useQuery({ entityId }, { enabled: !!entityId });
  const plainify = usePlainText();

  if (isLoading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-md animate-pulse" />)}</div>;
  }

  if (!entity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Entity not found</p>
        <Button variant="outline" onClick={handleBack}>Back to Entities</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight truncate">{entity.name}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] capitalize">{entity.type}</Badge>
            {typeof entity.aliases === 'string' && entity.aliases && (
              <span className="text-xs text-muted-foreground">Also: {entity.aliases}</span>
            )}
          </div>
        </div>
      </div>

      {/* Page-level Read Aloud */}
      {entity.description && (
        <PageReadAloud
          text={`Entity: ${entity.name}. Type: ${entity.type}. ${entity.description}`}
          forensicText={wrapWithCompletion(`Entity: ${entity.name}. Type: ${entity.type}. ${entity.description}`)}
          label={`Listen — ${entity.name}`}
        />
      )}

      {entity.description && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground leading-relaxed flex-1">{plainify(entity.description)}</p>
              <ReadAloud text={entity.description} forensicText={wrapWithCompletion(entity.description)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Appearances — EFTA labels with clickable links */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Document Appearances ({roles?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles && roles.length > 0 ? roles.map((r) => {
            const displayLabel = deriveDocumentDisplayLabel(r.documentFilename);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setLocation(`/documents/${r.documentId}?from=${encodeURIComponent(buildFromParam())}`)}
              >
                <div>
                  <p className="text-sm text-primary font-medium">{displayLabel}</p>
                  <p className="text-xs text-muted-foreground">Role: {r.role}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-6 gap-1">
                  <ExternalLink className="h-3 w-3" /> View
                </Button>
              </div>
            );
          }) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No document appearances</p>
          )}
        </CardContent>
      </Card>

      {/* Relationships — entity names + enriched evidence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Network className="h-4 w-4" />
            Relationships ({relationships?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {relationships && relationships.length > 0 ? relationships.map((rel) => {
            const isSource = rel.sourceEntityId === entityId;
            const otherEntityName = isSource
              ? (rel.sourceEntityName && rel.targetEntityName ? rel.targetEntityName : `Entity ${rel.targetEntityId}`)
              : (rel.sourceEntityName && rel.targetEntityName ? rel.sourceEntityName : `Entity ${rel.sourceEntityId}`);
            const otherEntityId = isSource ? rel.targetEntityId : rel.sourceEntityId;

            return (
              <div key={rel.id} className="p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{rel.relationshipType}</Badge>
                  <span className="text-sm">
                    {isSource ? "→ " : "← "}
                    <button
                      className="text-primary hover:underline font-medium"
                      onClick={() => setLocation(`/entities/${otherEntityId}`)}
                    >
                      {otherEntityName}
                    </button>
                  </span>
                </div>
                {rel.description && (
                  <div className="flex items-start justify-between gap-1 mt-1">
                    <p className="text-xs text-muted-foreground flex-1">{plainify(rel.description)}</p>
                    <ReadAloud text={rel.description} forensicText={formatRelationshipForReadAloud(rel.description, {}, {})} label="" />
                  </div>
                )}
                {/* Enriched evidence with provenance */}
                {rel.evidence && rel.evidence.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-primary/20">
                    {rel.evidence.slice(0, 3).map((ev: any) => {
                      const docLabel = deriveDocumentDisplayLabel(ev.documentFilename);
                      const deepLink = ev.documentId
                        ? `/documents/${ev.documentId}${ev.pageNumber ? `?page=${ev.pageNumber}` : ""}`
                        : null;
                      return (
                        <div key={ev.id} className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                            <FileText className="h-3 w-3 text-primary/60 shrink-0" />
                            {deepLink ? (
                              <button
                                className="text-primary hover:underline font-medium text-left"
                                onClick={(e) => { e.stopPropagation(); setLocation(deepLink); }}
                              >
                                {docLabel}{ev.pageNumber ? `, p.${ev.pageNumber}` : ""}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">{docLabel}</span>
                            )}
                            {ev.statementOrigin && ev.statementOrigin !== "unknown" && (
                              <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                                {ev.statementOrigin.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </div>
                          {ev.quoteText && <ExpandableQuote text={ev.quoteText} />}
                        </div>
                      );
                    })}
                    {rel.evidence.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{rel.evidence.length - 3} more source(s)</p>
                    )}
                  </div>
                )}
                {(!rel.evidence || rel.evidence.length === 0) && (
                  <p className="text-[10px] text-muted-foreground/50 mt-1">No backing evidence stored</p>
                )}
              </div>
            );
          }) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No relationships identified</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
