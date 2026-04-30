import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Shield, Clock, Search, Filter, Upload } from "lucide-react";
import { useState, useMemo } from "react";

export default function AuditTrail() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string | null>(null);

  const { data: entries, isLoading } = trpc.audit.list.useQuery(
    { caseId: currentCaseId!, limit: 200 },
    { enabled: !!currentCaseId }
  );

  // Derive unique action types for filter chips
  const actionTypes = useMemo(() => {
    if (!entries) return [];
    const types = new Set(entries.map((e) => e.action));
    return Array.from(types).sort();
  }, [entries]);

  // Filter entries by action type and search query
  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter((entry) => {
      if (actionFilter && entry.action !== actionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchAction = entry.action.toLowerCase().includes(q);
        const matchTarget = `${entry.targetType} #${entry.targetId}`.toLowerCase().includes(q);
        const matchDetails = entry.details ? String(entry.details).toLowerCase().includes(q) : false;
        if (!matchAction && !matchTarget && !matchDetails) return false;
      }
      return true;
    });
  }, [entries, actionFilter, searchQuery]);

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
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Immutable record of all actions taken on this case
        </p>
      </div>

      {/* Gate D: Search and action-type filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, targets, details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Action type filter chips */}
      {actionTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActionFilter(null)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              !actionFilter
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Filter className="h-3 w-3" />
            All ({entries?.length ?? 0})
          </button>
          {actionTypes.map((type) => {
            const count = entries?.filter((e) => e.action === type).length ?? 0;
            return (
              <button
                key={type}
                onClick={() => setActionFilter(actionFilter === type ? null : type)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  actionFilter === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {type} ({count})
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted/50 rounded-md animate-pulse" />)}</div>
      ) : !entries || entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Shield className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No audit entries yet</p>
            <p className="text-xs text-muted-foreground/70">Upload and analyze documents to start building the audit trail.</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/upload")}>
              <Upload className="h-3.5 w-3.5" /> Upload Evidence
            </Button>
          </CardContent>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No entries match {actionFilter ? `"${actionFilter}"` : "your search"}
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setActionFilter(null); setSearchQuery(""); }}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
          {filteredEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{entry.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.targetType} #{entry.targetId}
                    </span>
                  </div>
                  {entry.details != null && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {String(entry.details)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
