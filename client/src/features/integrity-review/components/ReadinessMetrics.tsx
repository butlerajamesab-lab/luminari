import { Card, CardContent } from "@/components/ui/card";
import type { ProjectionReadiness } from "../types";

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="p-4">
        <div className="font-mono text-2xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        {note ? <div className="mt-1 text-[11px] text-muted-foreground/70">{note}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ReadinessMetrics({ data }: { data: ProjectionReadiness }) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Atlas integrity candidates"
        value={data.atlas_current_integrity_candidate_count}
        note="Domain 3 observations, not findings"
      />
      <Metric label="Lighthouse review objects" value={data.projected_review_count} />
      <Metric label="Awaiting projection" value={data.unprojected_review_count} />
      <Metric
        label="Projection contract"
        value={data.projection_healthy ? "Healthy" : "Attention"}
        note="Atlas derives; Lighthouse reviews"
      />
    </section>
  );
}
