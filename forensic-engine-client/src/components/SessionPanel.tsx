/**
 * Session Panel Component
 * 
 * Read-only dashboard showing current session state:
 * - Session ID and actor type
 * - Governance anchor (verified seq_no)
 * - Actions taken in this session
 * - Next actions
 * - Real-time updates as Sunam records actions
 */

import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface SessionPanelProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function SessionPanel({ autoRefresh = true, refreshInterval = 5000 }: SessionPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get current session
  const { data: session, isLoading: sessionLoading } = trpc.session.getCurrentSession.useQuery(
    { actorType: "manus" },
    { enabled: !!sessionId || refreshKey > 0 }
  );

  // Get session handoff (completed session details)
  const { data: handoff, isLoading: handoffLoading } = trpc.session.getSessionHandoff.useQuery(
    { sessionId: sessionId || "" },
    { enabled: !!sessionId && !session }
  );

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Extract data from either current session or handoff
  const currentSession = session || handoff;
  const isActive = !!session;

  if (sessionLoading || handoffLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Session Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!currentSession) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Session Status</CardTitle>
          <CardDescription>No active session</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Start a new session to begin recording actions.
        </CardContent>
      </Card>
    );
  }

  const actionsData = JSON.parse(currentSession.actionsTaken as string || "[]");
  const nextActionsData = JSON.parse(currentSession.nextActions as string || "[]");

  return (
    <div className="space-y-4">
      {/* Session Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Session Status</CardTitle>
              <CardDescription>
                {isActive ? "Active session" : "Completed session"}
              </CardDescription>
            </div>
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "🔴 Active" : "✓ Completed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Session ID */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Session ID</p>
              <p className="font-mono text-sm break-all">{currentSession.sessionId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actor</p>
              <p className="text-sm capitalize">{currentSession.actorType}</p>
            </div>
          </div>

          {/* Governance Anchor */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">Governance Anchor</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                seq_no: {currentSession.governanceAnchor}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Verified governance state at session start
              </span>
            </div>
          </div>

          {/* Timestamps */}
          <div className="border-t pt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="text-sm">
                {new Date(currentSession.startedAt).toLocaleString()}
              </p>
            </div>
            {currentSession.completedAt && (
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-sm">
                  {new Date(currentSession.completedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions Taken */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actions Taken</CardTitle>
          <CardDescription>{actionsData.length} action(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {actionsData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {actionsData.map((action: any, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-muted/50 rounded text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{action.action}</p>
                    {action.description && (
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    )}
                    {action.timestamp && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Actions */}
      {nextActionsData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next Actions</CardTitle>
            <CardDescription>{nextActionsData.length} action(s) planned</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nextActionsData.map((action: any, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{action.action}</p>
                    {action.description && (
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((prev) => prev + 1)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
