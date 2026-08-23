import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { ExternalLink, FileSearch, Loader2, Radio } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const domains = ["legal_pattern", "live_data", "convergence"] as const;
type Domain = typeof domains[number];

function isDomain(value: string | null): value is Domain {
  return value != null && domains.includes(value as Domain);
}

function collectUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    urls.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectUrls(item, urls),
    );
  }
  return urls;
}

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

export function SignalArtifactContext() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const domainValue = params.get("signal_domain");
  const recordId = params.get("signal_id");
  const domain = isDomain(domainValue) ? domainValue : null;
  const artifact = trpc.enforcementIntel.get_signal_artifact.useQuery(
    { domain: domain ?? "live_data", record_id: recordId ?? "" },
    { enabled: domain != null && recordId != null },
  );

  if (!domain || !recordId) return null;

  if (artifact.isLoading) {
    return (
      <Card className="mb-5 border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading canonical signal artifact…
        </CardContent>
      </Card>
    );
  }

  if (artifact.error || !artifact.data) {
    return (
      <Card className="mb-5 border-red-500/30 bg-red-500/5">
        <CardContent className="p-5 text-sm text-red-300">
          This linked artifact could not be loaded. {artifact.error?.message}
        </CardContent>
      </Card>
    );
  }

  const item = artifact.data;
  const urls = Array.from(collectUrls(item.evidence)).slice(0, 6);
  const registryParams = new URLSearchParams({
    signal_domain: item.domain_code,
    signal_id: item.record_id,
  });

  return (
    <Card className="mb-5 border-amber-500/30 bg-amber-500/5" id="canonical-signal-artifact">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize">
                {readable(item.domain_code)}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {readable(item.artifact_type)}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {readable(item.status)}
              </Badge>
            </div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="h-4 w-4 text-amber-400" /> {item.title}
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/signal-registry?${registryParams.toString()}`)}
          >
            <FileSearch className="h-3.5 w-3.5 mr-1.5" /> Full artifact
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground leading-relaxed">{item.description}</p>
        <div className="rounded-lg border border-amber-500/20 bg-background/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-300 mb-1">
            Why this matters here
          </div>
          <p className="text-muted-foreground leading-relaxed">{item.environmental_effect}</p>
        </div>
        {urls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {urls.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Source {index + 1} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
