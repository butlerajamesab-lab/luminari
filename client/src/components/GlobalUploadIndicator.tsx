import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";

/**
 * GlobalUploadIndicator — persists at the app shell level across all navigation.
 * Polls the server for active upload sessions and shows a compact progress bar.
 * Clicking expands to show per-session details.
 */
export default function GlobalUploadIndicator() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Poll for active sessions every 3 seconds — only when authenticated
  const { data: activeSessions } = trpc.uploadSessions.getActive.useQuery(undefined, {
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    enabled: isAuthenticated,
  });

  // Also check localStorage for session IDs to reattach after refresh
  useEffect(() => {
    const stored = localStorage.getItem("activeUploadSessionIds");
    if (stored) {
      try {
        const ids = JSON.parse(stored) as number[];
        // Clean up completed sessions from localStorage
        if (activeSessions) {
          const activeIds = activeSessions.map(s => s.id);
          const stillActive = ids.filter(id => activeIds.includes(id));
          if (stillActive.length !== ids.length) {
            localStorage.setItem("activeUploadSessionIds", JSON.stringify(stillActive));
          }
          if (stillActive.length === 0) {
            localStorage.removeItem("activeUploadSessionIds");
          }
        }
      } catch {
        localStorage.removeItem("activeUploadSessionIds");
      }
    }
  }, [activeSessions]);

  // Filter out dismissed sessions
  const visibleSessions = (activeSessions || []).filter(s => !dismissed.has(s.id));

  if (visibleSessions.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="text-sm font-medium">
            {visibleSessions.length === 1
              ? "Upload in progress"
              : `${visibleSessions.length} uploads in progress`}
          </span>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Session list */}
      {expanded && (
        <div className="border-t border-border max-h-60 overflow-y-auto">
          {visibleSessions.map(session => {
            const total = session.totalFiles;
            const processed = session.completedFiles + session.failedFiles + session.duplicateFiles;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            const isComplete = session.status === "complete";
            const isFailed = session.status === "failed";

            return (
              <div key={session.id} className="p-3 border-b border-border/50 last:border-b-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">
                    Session #{session.id} · Case #{session.caseId}
                  </span>
                  <div className="flex items-center gap-1">
                    {isComplete && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                    {isFailed && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {session.status}
                    </Badge>
                  </div>
                </div>
                <Progress value={pct} className="h-1.5 mb-1" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {session.completedFiles} uploaded
                    {session.duplicateFiles > 0 && ` · ${session.duplicateFiles} dup`}
                    {session.failedFiles > 0 && ` · ${session.failedFiles} failed`}
                  </span>
                  <span>{processed}/{total}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    className="text-[10px] text-primary hover:underline"
                    onClick={(e) => { e.stopPropagation(); setLocation("/upload"); }}
                  >
                    View uploads
                  </button>
                  {(isComplete || isFailed) && (
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(session.id)); }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
