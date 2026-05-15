import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Clock, Calendar, Upload } from "lucide-react";
import ReadAloud from "@/components/ReadAloud";
import PageReadAloud from "@/components/PageReadAloud";
import { useMemo } from "react";
import { formatEventForReadAloud } from "@/lib/forensicReadAloud";

export default function Timeline() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();

  const { data: events, isLoading } = trpc.events.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const sorted = useMemo(() => {
    if (!events) return [];
    return [...events].sort((a, b) => {
      if (a.dateOccurred && b.dateOccurred) return a.dateOccurred.localeCompare(b.dateOccurred);
      if (a.dateOccurred) return -1;
      if (b.dateOccurred) return 1;
      return 0;
    });
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
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chronological events extracted from documents
        </p>
      </div>

      {/* Page-level Read Aloud */}
      {sorted.length > 0 && (
        <PageReadAloud
          text={sorted.map(e => `${e.dateOccurred || "Date unknown"}. ${e.title}. ${e.description || ""}`).join(" Next event. ")}
          forensicText={sorted.map(e => formatEventForReadAloud({ title: e.title, description: e.description || undefined, dateOccurred: e.dateOccurred || undefined, location: e.location || undefined }, {})).join(" Next event. ")}
          label="Listen to timeline"
        />
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}</div>
      ) : sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No timeline events yet. Upload and analyze documents to populate the timeline.
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
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-4">
            {sorted.map((event) => (
              <div key={event.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />

                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        {event.description && <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          {event.dateOccurred && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{event.dateOccurred}</span>
                            </div>
                          )}
                          <Badge variant="outline" className="text-[10px] capitalize">{event.eventType}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {event.location && (
                          <span className="text-[10px] text-muted-foreground">{event.location}</span>
                        )}
                        <ReadAloud text={`${event.title}. ${event.description || ""}`} forensicText={formatEventForReadAloud({ title: event.title, description: event.description || undefined, dateOccurred: event.dateOccurred || undefined, location: event.location || undefined }, {})} label="" />
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
