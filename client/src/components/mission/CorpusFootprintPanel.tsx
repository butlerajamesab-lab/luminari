import { AlertTriangle, CheckCircle2, Database, FileStack, Fingerprint, Layers3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCorpusFootprint } from "@/hooks/mission/useCorpusFootprint";

function Count({ value }: { value: number }) {
  return <div className="font-mono text-xl font-bold">{Number(value ?? 0).toLocaleString()}</div>;
}

function Stage({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "source" | "candidate" | "canonical" }) {
  const cls = tone === "source"
    ? "border-cyan-500/25 bg-cyan-500/5"
    : tone === "candidate"
      ? "border-violet-500/25 bg-violet-500/5"
      : tone === "canonical"
        ? "border-emerald-500/25 bg-emerald-500/5"
        : "border-border/60 bg-card/50";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Count value={value} />
      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</div>
    </div>
  );
}

export function CorpusFootprintPanel({ compact = false }: { compact?: boolean }) {
  const footprint = useCorpusFootprint();
  const data = footprint.data;

  if (footprint.isLoading) {
    return (
      <Card className="bg-card/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Corpus Footprint</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">Loading governed footprint…</CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="bg-card/50 border-amber-500/20">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Corpus Footprint</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground flex items-center justify-between gap-3">
          <span>Footprint unavailable: {footprint.error ?? "unknown"}</span>
          <Button variant="outline" size="sm" onClick={() => void footprint.refetch()}><RefreshCw className="h-3 w-3 mr-1" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const atomic = data.stages.atomic_source_records;
  const typed = data.stages.fresh_typed_candidates;
  const historical = data.stages.historical_coverage_oracle;
  const publicSnapshot = data.stages.active_public_resource_snapshot;

  return (
    <Card className="bg-card/50 border-cyan-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Layers3 className="h-4 w-4 text-cyan-400" /> Corpus Footprint</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">Stage counts are intentionally non-additive. A downstream publication count is not corpus size.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={atomic.artifacts_failed > 0 ? "border-amber-500/30 text-amber-300" : "border-emerald-500/30 text-emerald-300"}>
              {atomic.artifacts_completed}/{atomic.artifacts_accounted} artifacts
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => void footprint.refetch()}><RefreshCw className="h-3 w-3" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
          <Stage
            label="Atomic source records"
            value={atomic.count}
            detail={`${atomic.source_occurrences.toLocaleString()} source occurrences · current Storage bytes`}
            tone="source"
          />
          <Stage
            label="Fresh typed candidates"
            value={typed.count}
            detail={`${typed.resource_candidates.toLocaleString()} resource-typed · ${typed.candidate_types} candidate types`}
            tone="candidate"
          />
          <Stage
            label="Source-bound resource oracle"
            value={historical.source_bound_resource_candidates}
            detail={`${historical.broad_resource_rows.toLocaleString()} broad legacy rows · coverage oracle only`}
          />
          <Stage
            label="Active public resources"
            value={publicSnapshot.count}
            detail={`${publicSnapshot.held_identity_conflicts} held conflicts · deduped publication only`}
            tone="canonical"
          />
        </div>

        {!compact && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded border border-border/50 p-2 flex items-center gap-2"><FileStack className="h-3.5 w-3.5 text-cyan-400" /><span><b>{atomic.source_occurrences.toLocaleString()}</b> provenance origins</span></div>
            <div className="rounded border border-border/50 p-2 flex items-center gap-2"><Fingerprint className="h-3.5 w-3.5 text-violet-400" /><span><b>{historical.canonical_resource_entities.toLocaleString()}</b> prior canonical resource entities</span></div>
            <div className="rounded border border-border/50 p-2 flex items-center gap-2">
              {atomic.artifacts_failed > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              <span>{atomic.artifacts_failed > 0 ? `${atomic.artifacts_failed} source artifact isolated for follow-up` : "All source artifacts completed"}</span>
            </div>
          </div>
        )}

        <div className="rounded border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono">artifact → atomic record → typed candidate → identity → publication</span>
          <span className="mx-2">·</span>
          Curated Knowledge Backbone table rows are a separate seed matrix and are not a corpus-size metric.
        </div>
      </CardContent>
    </Card>
  );
}
