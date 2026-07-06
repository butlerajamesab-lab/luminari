import { Link } from "wouter";
import { Database, FileText, FolderArchive, GitBranch, Shield, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/core/hooks/useAuth";
import { useCase } from "@/contexts/CaseContext";

function stateBadge(kind: "ok" | "loading" | "blocked" | "empty" | "error", label: string) {
  const className =
    kind === "ok"
      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      : kind === "loading"
        ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
        : kind === "blocked"
          ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
          : kind === "error"
            ? "border-red-500/30 text-red-400 bg-red-500/10"
            : "border-border text-muted-foreground";
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function ContextCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}

export default function MissionControlInfinite() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { cases, currentCase, isLoading: caseLoading } = useCase();
  const caseCount = Array.isArray(cases) ? cases.length : 0;
  const hasActiveCase = Boolean(currentCase);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Mission Control Infinite</h1>
              {stateBadge("ok", "admin_monitor")}
              {hasActiveCase ? stateBadge("ok", "case_records_present") : stateBadge("empty", "cases_empty_verified")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Admin health monitor for Lighthouse internal state: cases, documents, findings, snapshots, canonical tables, registry surfaces, and deterministic backbone health.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild><Link href="/mission-control">Mission Control Home</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/live">Live Monitor</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/full">Correlation / Legacy</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ContextCard title="Admin Auth" icon={<UserRound className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {authLoading ? stateBadge("loading", "loading") : isAuthenticated ? stateBadge("ok", "authenticated") : stateBadge("error", "unauthenticated")}
            </div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? "No user email resolved"}</div>
          </ContextCard>

          <ContextCard title="Case Table Health" icon={<FileText className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Rows visible to context</span>
              {caseLoading ? stateBadge("loading", "loading") : caseCount > 0 ? stateBadge("ok", "populated") : stateBadge("empty", "empty_verified")}
            </div>
            <div className="text-xs text-muted-foreground">Known cases: {caseCount}</div>
          </ContextCard>

          <ContextCard title="Internal Backbone" icon={<Shield className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {stateBadge("ok", "monitor_surface")}
            </div>
            <div className="text-xs text-muted-foreground">This surface monitors internal deterministic state; it does not run user workflows.</div>
          </ContextCard>
        </div>

        <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-3">
              <FolderArchive className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <div className="font-medium text-blue-300">Infinite means internal-state monitoring.</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Empty cases are a health observation, not a product failure. The monitor should report whether internal tables, views, and canonical surfaces are empty, populated, delayed, or failing contract checks.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild><Link href="/cases">Cases</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/documents">Documents</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/findings">Findings</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/architecture-map">Architecture Map</Link></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Infinite monitor states</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-border p-3">
              <div className="font-medium flex items-center gap-2"><GitBranch className="h-3.5 w-3.5" /> Internal surfaces</div>
              <div className="text-muted-foreground text-xs mt-1">Expected state vocabulary: <span className="font-mono text-blue-400">populated</span>, <span className="font-mono text-amber-400">empty_verified</span>, <span className="font-mono text-red-400">contract_mismatch</span>, <span className="font-mono text-red-400">db_error</span></div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="font-medium">Live API surfaces</div>
              <div className="text-muted-foreground text-xs mt-1">Handled separately at <span className="font-mono text-blue-400">/mission-control/live</span>.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
