import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Clock, Calendar, Upload, FileText, ShieldCheck } from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { useMemo } from "react";
import { formatEventForReadAloud } from "@/lib/forensicReadAloud";
import {
  humanize_chronology_value,
  project_legacy_event_to_chronology,
  sort_chronology_records,
} from "@/lib/chronologyProjection";

export default function Timeline() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();

  const { data: events, isLoading } = trpc.events.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const chronology = useMemo(() => {
    if (!events) return [];
    return sort_chronology_records(events.map(event => project_legacy_event_to_chronology(event)));
  }, [events]);

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
        <h1 className="text-2xl font-semibold tracking-tight">Chronology</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Source-aware factual reconstruction from existing case events
        </p>
      </div>

      <Card className="border-dashed bg-muted/10">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Existing timeline events are preserved unchanged and displayed here as reported facts.
            Confirmation, corroboration, dispute status, and stronger source confidence require linked evidence.
          </p>
        </CardContent>
      </Card>

      {chronology.length > 0 && (
        <PageReadAloud
          text={chronology.map(record => `${record.event_date || "Date unknown"}. ${record.observed_event}`).join(" Next event. ")}
          forensicText={chronology.map(record => formatEventForReadAloud({
            title: record.observed_event,
            dateOccurred: record.event_date || undefined,
            location: record.location || undefined,
          }, {})).join(" Next event. ")}
          label="Listen to chronology"
        />
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(index => <div key={index} className="h-24 bg-muted/50 rounded-md animate-pulse" />)}</div>
      ) : chronology.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No chronology events yet. Upload and analyze documents to populate the factual record.
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setLocation("/upload")} className="gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" />
                Upload Evidence
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="gap-1.5 text-xs">
                Back to Overview
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-4">
            {chronology.map(record => (
              <div key={record.chronology_event_id} className="relative pl-10">
                <div className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground whitespace-pre-wrap break-words">
                          {record.observed_event}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {record.event_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{record.event_date}</span>
                            </div>
                          )}
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {humanize_chronology_value(record.event_type)}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {humanize_chronology_value(record.fact_status)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Source: {humanize_chronology_value(record.source_confidence_level)}
                          </Badge>
                        </div>

                        <div className="mt-3 rounded-md border border-border/50 bg-muted/20 p-2.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            Source references
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {record.source_references.map(reference => (
                              <code key={reference} className="rounded bg-background px-1.5 py-0.5 text-[10px] break-all">
                                {reference}
                              </code>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {record.location && (
                          <span className="text-[10px] text-muted-foreground">{record.location}</span>
                        )}
                        <ReadAloud
                          text={record.observed_event}
                          forensicText={formatEventForReadAloud({
                            title: record.observed_event,
                            dateOccurred: record.event_date || undefined,
                            location: record.location || undefined,
                          }, {})}
                          label=""
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
