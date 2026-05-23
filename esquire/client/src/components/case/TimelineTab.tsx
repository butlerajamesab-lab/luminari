import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileText } from 'lucide-react';
import type { CaseEvent, Evidence } from '@/lib/types';

interface TimelineTabProps {
  events: CaseEvent[];
  evidence: Evidence[];
}

export default function TimelineTab({ events, evidence }: TimelineTabProps) {
  if (events.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Events will appear here as they are added to the case.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {events.map((event) => {
          const linkedEvidence = evidence.filter((e) => e.event_id === event.id);
          return (
            <div key={event.id} className="relative pl-10">
              {/* Dot */}
              <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background" />

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground text-sm">{event.title}</h4>
                        <Badge variant="outline" className="text-xs capitalize">
                          {event.event_type}
                        </Badge>
                      </div>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                      )}
                      {event.source && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Source: {event.source} {event.source_type && `(${event.source_type})`}
                        </p>
                      )}
                      {/* Linked Evidence */}
                      {linkedEvidence.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-1.5">Linked Evidence:</p>
                          <div className="space-y-1">
                            {linkedEvidence.map((ev) => (
                              <div key={ev.id} className="flex items-center gap-2 text-xs">
                                <FileText className="w-3 h-3 text-primary" />
                                <span className="text-foreground">{ev.title}</span>
                                {ev.file_hash && (
                                  <span className="hash-display text-muted-foreground truncate max-w-32">
                                    #{ev.file_hash.slice(0, 8)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.event_date).toLocaleDateString()}
                      </p>
                      {event.quality_weight && event.quality_weight !== 1 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Weight: {event.quality_weight}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
