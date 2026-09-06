import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Route,
  Search,
  Server,
  TerminalSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SystemHealth = {
  status: string;
  database: string;
  database_url: string;
  database_version: string;
  supabase: string;
  public_tables: number;
  runtime: string;
  build_version: string;
  timestamp: string;
  db_diagnostic?: string;
};

type FrontendRoute = {
  path: string;
  component_slug: string;
  layer: string;
  registered: boolean;
};

type BackendMount = {
  method: string;
  path: string;
  source: string;
};

type SystemRoutes = {
  timestamp: string;
  frontend: { total: number; routes: FrontendRoute[] };
  backend: { total: number; mounts: BackendMount[] };
};

const RUNNABLE_DIAGNOSTICS = [
  {
    label: "Run System Health",
    path: "/api/system/health",
    description: "Owner-authenticated runtime and database health",
  },
  {
    label: "Run Route Inventory",
    path: "/api/system/routes",
    description: "Owner-authenticated frontend and backend route catalog",
  },
  {
    label: "Run Public Health",
    path: "/api/health",
    description: "Public deployment health contract",
  },
] as const;

type RunnableDiagnosticPath = (typeof RUNNABLE_DIAGNOSTICS)[number]["path"];

const RUNNABLE_DIAGNOSTIC_PATHS = new Set<RunnableDiagnosticPath>(
  RUNNABLE_DIAGNOSTICS.map((diagnostic) => diagnostic.path),
);

type DiagnosticRun = {
  method: "GET";
  path: RunnableDiagnosticPath;
  ok: boolean;
  status: number | null;
  status_text: string;
  duration_ms: number;
  timestamp: string;
  payload: unknown;
};

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
      if (typeof nested.code === "string") return nested.code;
    }
  }
  return `HTTP ${status}`;
}

async function fetchDiagnostic<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload as T;
}

function formatTimestamp(value?: string): string {
  if (!value) return "Not retrieved";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isConcreteFrontendRoute(path: string): boolean {
  return !path.includes(":") && !path.includes("*");
}

function isOpenableFrontendRoute(route: FrontendRoute): boolean {
  return route.registered && isConcreteFrontendRoute(route.path);
}

function isRunnableBackendMount(
  mount: BackendMount,
): mount is BackendMount & { path: RunnableDiagnosticPath } {
  return (
    mount.method === "GET" &&
    RUNNABLE_DIAGNOSTIC_PATHS.has(mount.path as RunnableDiagnosticPath)
  );
}

function printablePayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload === null || payload === undefined) return "No response body";
  return JSON.stringify(payload, null, 2);
}

function HealthValue({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 break-words font-mono text-sm text-foreground">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemApiPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [routes, setRoutes] = useState<SystemRoutes | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [runningPath, setRunningPath] = useState<RunnableDiagnosticPath | null>(
    null,
  );
  const [diagnosticRun, setDiagnosticRun] = useState<DiagnosticRun | null>(
    null,
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    const [healthResult, routesResult] = await Promise.allSettled([
      fetchDiagnostic<SystemHealth>("/api/system/health"),
      fetchDiagnostic<SystemRoutes>("/api/system/routes"),
    ]);

    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value);
      setHealthError(null);
    } else {
      setHealthError(
        healthResult.reason instanceof Error
          ? healthResult.reason.message
          : String(healthResult.reason),
      );
    }

    if (routesResult.status === "fulfilled") {
      setRoutes(routesResult.value);
      setRoutesError(null);
    } else {
      setRoutesError(
        routesResult.reason instanceof Error
          ? routesResult.reason.message
          : String(routesResult.reason),
      );
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runDiagnostic = useCallback(async (path: RunnableDiagnosticPath) => {
    setRunningPath(path);
    const startedAt = performance.now();

    try {
      const response = await fetch(path, {
        method: "GET",
        cache: "no-store",
      });
      const responseText = await response.text();
      let payload: unknown = responseText || null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          // Preserve non-JSON responses exactly as returned.
        }
      }

      const result: DiagnosticRun = {
        method: "GET",
        path,
        ok: response.ok,
        status: response.status,
        status_text: response.statusText,
        duration_ms: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString(),
        payload,
      };

      setDiagnosticRun(result);
      if (response.ok && path === "/api/system/health") {
        setHealth(payload as SystemHealth);
        setHealthError(null);
      }
      if (response.ok && path === "/api/system/routes") {
        setRoutes(payload as SystemRoutes);
        setRoutesError(null);
      }
    } catch (error) {
      setDiagnosticRun({
        method: "GET",
        path,
        ok: false,
        status: null,
        status_text: "Network error",
        duration_ms: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString(),
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setRunningPath(null);
    }
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const frontendRoutes = useMemo(() => {
    const items = routes?.frontend.routes ?? [];
    if (!normalizedSearch) return items;
    return items.filter((route) =>
      [route.path, route.component_slug, route.layer].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [normalizedSearch, routes]);

  const backendMounts = useMemo(() => {
    const items = routes?.backend.mounts ?? [];
    if (!normalizedSearch) return items;
    return items.filter((mount) =>
      [mount.method, mount.path, mount.source].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [normalizedSearch, routes]);

  const healthy =
    health?.status === "healthy" && health.database === "connected";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Server className="h-5 w-5 text-cyan-400" /> System API
          </h3>
          <p className="text-sm text-muted-foreground">
            Owner-authenticated, read-only visibility into Lighthouse health and
            route inventory.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <Card className="border-cyan-500/30 bg-cyan-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TerminalSquare className="h-4 w-4 text-cyan-400" /> Run Diagnostics
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Live, allowlisted GET requests only. Results appear here without
            changing system state.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            {RUNNABLE_DIAGNOSTICS.map((diagnostic) => (
              <Button
                key={diagnostic.path}
                variant="outline"
                className="h-auto min-h-16 justify-start whitespace-normal p-3 text-left"
                onClick={() => void runDiagnostic(diagnostic.path)}
                disabled={runningPath !== null}
              >
                {runningPath === diagnostic.path ? (
                  <Loader2 className="mr-3 h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Play className="mr-3 h-4 w-4 shrink-0 text-cyan-400" />
                )}
                <span>
                  <span className="block text-sm font-medium">
                    {diagnostic.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                    GET {diagnostic.path}
                  </span>
                </span>
              </Button>
            ))}
          </div>

          {diagnosticRun ? (
            <div className="overflow-hidden rounded border border-border bg-background/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="font-mono">
                  {diagnosticRun.method} {diagnosticRun.path}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={
                      diagnosticRun.ok ? "bg-emerald-600" : "bg-red-600"
                    }
                  >
                    {diagnosticRun.status ?? "ERR"} {diagnosticRun.status_text}
                  </Badge>
                  <span className="text-muted-foreground">
                    {diagnosticRun.duration_ms} ms ·{" "}
                    {formatTimestamp(diagnosticRun.timestamp)}
                  </span>
                </div>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {printablePayload(diagnosticRun.payload)}
              </pre>
            </div>
          ) : (
            <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Push a button to run a live diagnostic and inspect its response.
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className={
          healthy
            ? "border-emerald-500/30 bg-emerald-950/10"
            : "border-amber-500/30 bg-amber-950/10"
        }
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity
                className={
                  healthy
                    ? "h-4 w-4 text-emerald-400"
                    : "h-4 w-4 text-amber-400"
                }
              />
              Runtime Health
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">GET /api/system/health</Badge>
              <Badge className={healthy ? "bg-emerald-600" : "bg-amber-600"}>
                {health?.status ?? (isLoading ? "checking" : "unavailable")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {healthError && (
            <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
              Health retrieval failed: {healthError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <HealthValue label="Database" value={health?.database ?? "—"} />
            <HealthValue label="Runtime" value={health?.runtime ?? "—"} />
            <HealthValue
              label="Public tables"
              value={health?.public_tables ?? "—"}
            />
            <HealthValue label="Build" value={health?.build_version ?? "—"} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {health?.database_version || "Database version unavailable"}
            </span>
            <span>Retrieved {formatTimestamp(health?.timestamp)}</span>
          </div>
          {health?.db_diagnostic && (
            <div className="text-xs text-amber-300">{health.db_diagnostic}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Route className="h-4 w-4 text-cyan-400" /> Route Inventory
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">GET /api/system/routes</span> ·{" "}
                {routes?.frontend.total ?? 0} frontend ·{" "}
                {routes?.backend.total ?? 0} backend
              </p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search system routes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search path, component, or source"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {routesError && (
            <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
              Route retrieval failed: {routesError}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Frontend routes</span>
                <Badge variant="outline">{frontendRoutes.length}</Badge>
              </div>
              <div className="max-h-[430px] space-y-1 overflow-y-auto rounded border border-border p-2">
                {frontendRoutes.map((route) => (
                  <div
                    key={`${route.path}:${route.component_slug}`}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded px-2 py-2 hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-foreground">
                        {route.path}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {route.component_slug}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-center">
                      <Badge variant="secondary" className="text-[10px]">
                        {route.layer}
                      </Badge>
                      {isOpenableFrontendRoute(route) ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={route.path}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${route.path}`}
                          >
                            Open
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : route.registered ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title="This route needs a record identifier"
                        >
                          Needs ID
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title="This inventory entry is not registered by the client router"
                        >
                          Catalog only
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!isLoading && frontendRoutes.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No matching frontend routes.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Backend mounts</span>
                <Badge variant="outline">{backendMounts.length}</Badge>
              </div>
              <div className="max-h-[430px] space-y-1 overflow-y-auto rounded border border-border p-2">
                {backendMounts.map((mount) => (
                  <div
                    key={`${mount.method}:${mount.path}`}
                    className="grid grid-cols-[auto_1fr_auto] gap-3 rounded px-2 py-2 hover:bg-muted/30"
                  >
                    <Badge
                      variant="outline"
                      className="self-start font-mono text-[10px]"
                    >
                      {mount.method}
                    </Badge>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-foreground">
                        {mount.path}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {mount.source}
                      </div>
                    </div>
                    {isRunnableBackendMount(mount) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void runDiagnostic(mount.path)}
                        disabled={runningPath !== null}
                      >
                        {runningPath === mount.path ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Run
                      </Button>
                    ) : (
                      <span className="self-center text-[10px] text-muted-foreground">
                        Catalog only
                      </span>
                    )}
                  </div>
                ))}
                {!isLoading && backendMounts.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No matching backend mounts.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Database className="h-3.5 w-3.5" /> Structural metadata only; no
              records or secrets.
            </span>
            <span>Retrieved {formatTimestamp(routes?.timestamp)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
