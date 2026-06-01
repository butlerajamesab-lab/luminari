import { useMemo, useState } from "react";
import { Activity, Database, Loader2, Play, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAtlasCatalog,
  getAtlasHealth,
  populateAtlasStreams,
  triggerAtlasBridgeDrain,
  type AtlasCatalog,
  type AtlasHealth,
  type AtlasPopulationResult,
} from "@/lib/atlasApi";

type ActionName = "health" | "catalog" | "populate" | "drain";

function listCount(values?: string[]) {
  return values?.length ?? 0;
}

function formatRecord(record?: Record<string, number>) {
  if (!record || Object.keys(record).length === 0) {
    return "—";
  }

  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 text-sm text-destructive">{message}</CardContent>
    </Card>
  );
}

export function AtlasCommandPanel() {
  const [health, setHealth] = useState<AtlasHealth | null>(null);
  const [catalog, setCatalog] = useState<AtlasCatalog | null>(null);
  const [populationResult, setPopulationResult] = useState<AtlasPopulationResult | null>(null);
  const [bridgeResult, setBridgeResult] = useState<AtlasPopulationResult | null>(null);
  const [activeAction, setActiveAction] = useState<ActionName | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const catalogStreams = catalog?.streams ?? [];
  const lastResult = populationResult ?? bridgeResult;
  const lastResultLabel = populationResult ? "Population" : bridgeResult ? "Bridge drain" : "No result";

  const catalogPreview = useMemo(() => catalogStreams.slice(0, 8), [catalogStreams]);

  const runAction = async <T,>(action: ActionName, request: () => Promise<T>, onSuccess: (result: T) => void) => {
    setActiveAction(action);
    setErrorMessage(null);

    try {
      const result = await request();
      onSuccess(result);
      toast.success("Atlas command completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Atlas command failed";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleHealth = () => runAction("health", getAtlasHealth, setHealth);
  const handleCatalog = () => runAction("catalog", getAtlasCatalog, setCatalog);
  const handlePopulate = () => runAction("populate", () => populateAtlasStreams(), setPopulationResult);
  const handleDrain = () => runAction("drain", triggerAtlasBridgeDrain, setBridgeResult);

  const isBusy = activeAction !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Atlas Command</h3>
          </div>
          <p className="text-sm text-muted-foreground">Primary upstream population and bridge controls</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleHealth} disabled={isBusy}>
            {activeAction === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Check Atlas Health
          </Button>
          <Button variant="outline" onClick={handleCatalog} disabled={isBusy}>
            {activeAction === "catalog" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Load Catalog
          </Button>
          <Button onClick={handlePopulate} disabled={isBusy}>
            {activeAction === "populate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Populate Atlas Streams
          </Button>
          <Button variant="secondary" onClick={handleDrain} disabled={isBusy}>
            {activeAction === "drain" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Drain Bridge
          </Button>
        </div>
      </div>

      <ErrorMessage message={errorMessage} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Atlas Health</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={health ? "default" : "outline"}>{health?.status ?? "unchecked"}</Badge>
              {health?.service && <span className="text-xs text-muted-foreground">{health.service}</span>}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Catalog Streams</div>
            <div className="mt-2 text-2xl font-bold text-foreground">{catalog?.total_streams ?? catalogStreams.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Domains</div>
            <div className="mt-2 text-sm text-foreground">{formatRecord(catalog?.by_domain)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Last Population Result</div>
            <div className="mt-2 text-sm font-medium text-foreground">{lastResultLabel}</div>
            {lastResult && (
              <div className="mt-1 text-xs text-muted-foreground">
                created {listCount(lastResult.created_stream_ids)} · skipped {listCount(lastResult.skipped_stream_ids)} · failed {listCount(lastResult.failed_stream_ids)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog Preview</CardTitle>
          <CardDescription>Atlas upstream stream catalog visible to Sovereign Control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {catalogPreview.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Load the Atlas catalog to preview available streams.
            </div>
          ) : (
            catalogPreview.map((stream) => (
              <div key={stream.stream_id} className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-5">
                <div>
                  <div className="text-xs text-muted-foreground">stream_id</div>
                  <div className="font-mono text-xs text-foreground">{stream.stream_id}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">stream_name</div>
                  <div className="text-foreground">{stream.stream_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">jurisdiction</div>
                  <div className="text-foreground">{String(stream.jurisdiction ?? "—")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">domain</div>
                  <div className="text-foreground">{String(stream.domain ?? "—")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">source</div>
                  <div className="break-words text-xs text-foreground">{stream.source_url ?? stream.api_url ?? "—"}</div>
                </div>
              </div>
            ))
          )}
          {catalogStreams.length > catalogPreview.length && (
            <div className="text-xs text-muted-foreground">Showing {catalogPreview.length} of {catalogStreams.length} streams.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>Latest Atlas population or bridge-drain command response.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!lastResult ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Run Populate Atlas Streams or Drain Bridge to view results.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">created</div>
                  <div className="text-xl font-bold text-green-400">{listCount(lastResult.created_stream_ids)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">skipped</div>
                  <div className="text-xl font-bold text-amber-400">{listCount(lastResult.skipped_stream_ids)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">failed</div>
                  <div className="text-xl font-bold text-red-400">{listCount(lastResult.failed_stream_ids)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">total_selected</div>
                  <div className="text-xl font-bold text-foreground">{lastResult.total_selected ?? "—"}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <ResultList title="created_stream_ids" values={lastResult.created_stream_ids} />
                <ResultList title="skipped_stream_ids" values={lastResult.skipped_stream_ids} />
                <ResultList title="failed_stream_ids" values={lastResult.failed_stream_ids} />
              </div>
              {lastResult.errors && (
                <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(lastResult.errors, null, 2)}
                </pre>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultList({ title, values }: { title: string; values?: string[] }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {values && values.length > 0 ? (
        <div className="space-y-1">
          {values.map((value) => (
            <div key={value} className="break-all font-mono text-xs text-foreground">{value}</div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">—</div>
      )}
    </div>
  );
}

export default AtlasCommandPanel;
