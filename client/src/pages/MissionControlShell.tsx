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
              {statusBadge("ok", "admin_monitor")}
              {statusBadge("ok", "boot_contained")}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Admin system-health shell. Heavy correlation panels are not mounted on initial load so Mission Control can open without stampeding the database pool.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={loadDiagnostic} disabled={diagnostic.isLoading}>
              {diagnostic.isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Gauge className="h-3.5 w-3.5 mr-1" />}
              Refresh health
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ContextCard title="Admin Auth" icon={<UserRound className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {authLoading ? statusBadge("unknown", "loading") : isAuthenticated ? statusBadge("ok", "authenticated") : statusBadge("error", "unauthenticated")}
            </div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? "No user email resolved"}</div>
          </ContextCard>

          <ContextCard title="Internal Case Table" icon={<FileText className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Rows visible</span>
              {caseLoading ? statusBadge("unknown", "loading") : hasActiveCase || caseCount > 0 ? statusBadge("ok", "populated") : statusBadge("warning", "empty_verified")}
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

          <ContextCard title="Live API / Streams" icon={<Radio className="h-4 w-4" />}>
            <div className="flex items-center justify-between gap-2">
              <span>Status</span>
              {statusBadge("warning", "not_checked_on_boot")}
            </div>
            <div className="text-xs text-muted-foreground">Open Live monitor for stream/API health.</div>
          </ContextCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Radio className="h-4 w-4" /> Mission Control Live</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Monitors live incoming data, APIs, stream queues, ingestion, schedulers, and runtime status.</p>
              <Button variant="outline" size="sm" asChild><Link href="/mission-control/live">Open Live Monitor</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Mission Control Infinite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Monitors internal deterministic state: cases, documents, findings, canonical tables, registry state, and backbone health.</p>
              <Button variant="outline" size="sm" asChild><Link href="/mission-control/infinite">Open Infinite Monitor</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Correlation / Legacy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Legacy heavy convergence surface. Use only after Live and Infinite health monitors open cleanly.</p>
              <Button variant="outline" size="sm" asChild><Link href="/mission-control/full"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Correlation / Legacy</Link></Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Other admin health entry points</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/ingestion-control">Ingestion Control</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/architecture-map">Architecture Map</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/admin/knowledge-population">Knowledge Population</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/diagnostics">Diagnostics</Link></Button>
          </CardContent>
        </Card>

        {databaseOk && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Shell loaded without mounting heavy panel trees.
          </div>
        )}
      </div>
    </div>
  );
}
