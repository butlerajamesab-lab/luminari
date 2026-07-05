import { Link } from "wouter";
import { Database, FileText, FolderArchive, Shield, Upload, UserRound } from "lucide-react";
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

export default function MissionControlIntake() {
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
              <h1 className="text-2xl font-bold tracking-tight">Guided Intake Mission Control</h1>
              {hasActiveCase ? stateBadge("ok", "active_case") : stateBadge("blocked", "waiting_for_case")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Intake/case surface only. Live stream panels are kept separate so no-case state is not misread as a broken live runtime.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild><Link href="/mission-control">Mission Control Home</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/live">Live Stream Control</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/mission-control/full">Full Dashboard</Link></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ContextCard title="Authenticated User" icon={<UserRound className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {authLoading ? stateBadge("loading", "loading") : isAuthenticated ? stateBadge("ok", "authenticated") : stateBadge("error", "unauthenticated")}
            </div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? "No user email resolved"}</div>
          </ContextCard>

          <ContextCard title="Case Context" icon={<FileText className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Active case</span>
              {caseLoading ? stateBadge("loading", "loading") : hasActiveCase ? stateBadge("ok", "present") : stateBadge("blocked", "waiting_for_case")}
            </div>
            <div className="text-xs text-muted-foreground">Known cases: {caseCount}</div>
          </ContextCard>

          <ContextCard title="Intake Spine" icon={<Shield className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {hasActiveCase ? stateBadge("ok", "case_ready") : stateBadge("blocked", "no_intake_case_yet")}
            </div>
            <div className="text-xs text-muted-foreground">Downstream case panels should wait here until a case exists.</div>
          </ContextCard>
        </div>

        {!hasActiveCase && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-3">
                <FolderArchive className="h-5 w-5 text-amber-400 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-300">No active intake/case context.</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    This is an expected blocked state. Documents, entities, findings, snapshots, remedies, assembly, and campaign panels should not pretend to be live until a case/intake exists.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild><Link href="/guided-intake">Start Guided Intake</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/cases">Open Cases</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/upload"><Upload className="h-3.5 w-3.5 mr-1" /> Upload</Link></Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Intake truth states</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-border p-3">
              <div className="font-medium">Case-dependent panels</div>
              <div className="text-muted-foreground text-xs mt-1">Expected state without case: <span className="font-mono text-amber-400">waiting_for_case</span></div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="font-medium">Live stream panels</div>
              <div className="text-muted-foreground text-xs mt-1">Expected state: handled separately at <span className="font-mono text-blue-400">/mission-control/live</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
