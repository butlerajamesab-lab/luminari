import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Activity, AlertTriangle, CheckCircle2, Database, ExternalLink, FileText, Gauge, Loader2, Radio, Shield, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/core/hooks/useAuth";
import { useCase } from "@/contexts/CaseContext";

type DiagnosticPayload = {
  ok?: boolean;
  database?: string;
  database_url?: string;
  database_version?: string | null;
  public_tables?: number | null;
  supabase_project?: string;
  timestamp?: string;
  error?: { code?: string; message?: string };
};

type DiagnosticState = {
  data: DiagnosticPayload | null;
  error: string | null;
  isLoading: boolean;
};

function statusBadge(status: "ok" | "warning" | "blocked" | "error" | "unknown", label: string) {
  const className =
    status === "ok"
      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      : status === "warning"
        ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
        : status === "blocked"
          ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
          : status === "error"
            ? "border-red-500/30 text-red-400 bg-red-500/10"
            : "border-border text-muted-foreground";

  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function ContextCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {children}
      </CardContent>
    </Card>
  );
}

export default function MissionControlShell() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { cases, currentCase, isLoading: caseLoading } = useCase();
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>({ data: null, error: null, isLoading: true });

  const loadDiagnostic = async () => {
    setDiagnostic((current) => ({ ...current, isLoading: true }));
    try {
      const response = await fetch("/api/db-diagnostic", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      setDiagnostic({
        data: payload,
        error: response.ok ? null : payload?.error?.message ?? `db_diagnostic_http_${response.status}`,
        isLoading: false,
      });
    } catch (error) {
      setDiagnostic({ data: null, error: error instanceof Error ? error.message : String(error), isLoading: false });
    }
  };

  useEffect(() => {
    loadDiagnostic();
  }, []);

  const caseCount = Array.isArray(cases) ? cases.length : 0;
  const hasActiveCase = Boolean(currentCase);
  const databaseOk = diagnostic.data?.database === "connected" || diagnostic.data?.ok === true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
              {statusBadge("ok", "boot contained")}
              {!hasActiveCase && statusBadge("blocked", "no_active_case")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Lightweight operational shell. Heavy convergence panels are not mounted on initial load so the dashboard can open without stampeding the database pool.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={loadDiagnostic} disabled={diagnostic.isLoading}>
              {diagnostic.isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Gauge className="h-3.5 w-3.5 mr-1" />}
              Refresh context
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/mission-control/full">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open full dashboard
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ContextCard title="Auth Context" icon={<UserRound className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {authLoading ? statusBadge("unknown", "loading") : isAuthenticated ? statusBadge("ok", "authenticated") : statusBadge("error", "unauthenticated")}
            </div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? "No user email resolved"}</div>
          </ContextCard>

          <ContextCard title="Case / Intake Context" icon={<FileText className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Active case</span>
              {caseLoading ? statusBadge("unknown", "loading") : hasActiveCase ? statusBadge("ok", "present") : statusBadge("blocked", "waiting_for_case")}
            </div>
            <div className="text-xs text-muted-foreground">Known cases: {caseCount}</div>
          </ContextCard>

          <ContextCard title="Database Diagnostic" icon={<Database className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Database</span>
              {diagnostic.isLoading ? statusBadge("unknown", "loading") : databaseOk ? statusBadge("ok", "connected") : statusBadge("error", "db_error")}
            </div>
            <div className="text-xs text-muted-foreground">Public tables: {diagnostic.data?.public_tables ?? "unknown"}</div>
            {diagnostic.error && <div className="text-xs text-red-400 truncate">{diagnostic.error}</div>}
          </ContextCard>

          <ContextCard title="Live Streams" icon={<Radio className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {statusBadge("warning", "not_checked_on_boot")}
            </div>
            <div className="text-xs text-muted-foreground">Stream panels are preserved and should be opened after the shell is stable.</div>
          </ContextCard>
        </div>

        {!hasActiveCase && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-4 flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium text-blue-300">Case-dependent panels are context-blocked, not dead.</div>
                <p className="text-sm text-muted-foreground">
                  Documents, entities, findings, snapshots, viability, assembly, and campaign surfaces need an active intake/case context before they can truthfully light up.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Safe entry points
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild><Link href="/ingestion-control">Ingestion Control</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/control-room">Control Room</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/cases">Cases</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/upload">Upload</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/architecture-map">Architecture Map</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Full dashboard guardrail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>The previous `/mission-control` mounted a large convergence dashboard immediately. Render logs showed pool max 5, idle 0, and 72 waiting clients during load.</p>
              <p>Use the full dashboard only after this shell confirms auth, database, and case context.</p>
            </CardContent>
          </Card>
        </div>

        {databaseOk && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Shell loaded without mounting heavy panel trees.
          </div>
        )}
      </div>
    </div>
  );
}
