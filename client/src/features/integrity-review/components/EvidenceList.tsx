import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { EvidenceLink } from "../types";
import { readable } from "../utils";

export function EvidenceList({ evidence }: { evidence: EvidenceLink[] }) {
  if (evidence.length === 0) {
    return <p className="text-sm text-muted-foreground">No evidence is bound to this candidate.</p>;
  }

  return (
    <div className="space-y-3">
      {evidence.map(item => (
        <article
          key={item.evidence_link_id}
          className={`rounded-lg border p-4 ${
            item.supports_or_contradicts === "contradicts"
              ? "border-red-500/35 bg-red-500/5"
              : "border-emerald-500/25 bg-emerald-500/5"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{readable(item.source_class)}</Badge>
              <Badge variant="outline">{readable(item.provenance_type)}</Badge>
              <Badge variant={item.supports_or_contradicts === "contradicts" ? "destructive" : "secondary"}>
                {readable(item.supports_or_contradicts)}
              </Badge>
            </div>
            {item.source_uri ? (
              <a
                href={item.source_uri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open exact source <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {item.quote_text ? (
            <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-sm">
              “{item.quote_text}”
            </blockquote>
          ) : null}
          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Source origin</dt>
              <dd className="break-all font-mono">{item.source_relation}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pinpoint</dt>
              <dd>{item.pinpoint ?? "not recorded"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted-foreground">Source record</dt>
              <dd className="break-all font-mono">{item.source_record_key}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted-foreground">
                {item.provenance_type === "atlas_projection" ? "Atlas event SHA-256" : "Source content SHA-256"}
              </dt>
              <dd className="break-all font-mono" title={item.source_content_hash}>
                {item.source_content_hash}
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
