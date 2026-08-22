import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, ExternalLink, Fingerprint, Loader2, RefreshCw, Scale, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCandidateDetail,
  useCandidates,
  useCorroboration,
  useDraft,
  useEvidence,
  useReadiness,
  useRefresh,
  useRouteCatalog,
  useTransition,
} from "./hooks";
import { CandidateDetail } from "./components/CandidateDetail";
import { CandidateQueue } from "./components/CandidateQueue";
import { ReadinessMetrics } from "./components/ReadinessMetrics";
import type { AttachEvidencePayload, CorroborationPayload, DraftPayload, TransitionPayload } from "./types";
import { error_message, readable } from "./utils";

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export default function IntegrityReview() {
  const [selected_id, set_selected_id] = useState("");
  const readiness = useReadiness();
  const candidates = useCandidates();
  const route_catalog = useRouteCatalog();
  const detail_query = useCandidateDetail(selected_id);
  const evidence = useEvidence();
  const corroboration = useCorroboration();
  const transition = useTransition();
  const draft = useDraft();
  const refresh = useRefresh();

  useEffect(() => {
    const selection_still_exists = candidates.data?.some(candidate => candidate.candidate_id === selected_id);
    if ((!selected_id || !selection_still_exists) && candidates.data?.[0]?.candidate_id) {
      set_selected_id(candidates.data[0].candidate_id);
    }
  }, [candidates.data, selected_id]);

  const detail = detail_query.data;
  const eligible_routes = useMemo(() => {
    if (!detail || !route_catalog.data || !detail.candidate.jurisdiction_id) return [];
    const jurisdiction = normalized(detail.candidate.jurisdiction_id);
    return route_catalog.data.filter(route =>
      route.candidate_types.includes(detail.candidate.candidate_type) &&
      route.jurisdiction_ids.some(value => normalized(value) === jurisdiction),
    );
  }, [detail, route_catalog.data]);

  const is_loading = readiness.isLoading || candidates.isLoading || refresh.isPending;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link href="/mission-control">
              <Button variant="ghost" size="icon" aria-label="Back to Mission Control">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
                <ShieldAlert className="h-5 w-5 text-amber-400" /> Integrity Review
              </h1>
              <p className="text-xs text-muted-foreground">Atlas Domain 3 candidates · Lighthouse corroboration and draft routing</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="https://atlas.columbiacitycustomllc.com" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                Open Atlas <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh.mutate({ limit: 1000 })}
              disabled={is_loading}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${is_loading ? "animate-spin" : ""}`} />
              Reconcile Atlas
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-4 text-sm">
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <div className="font-medium">System boundary</div>
              <p className="mt-1 text-muted-foreground">
                Atlas owns source streams, identity, and deterministic Domain 3 derivation. Lighthouse projects those
                evidence-bound observation candidates into a human review ledger. The Anomaly Viewfinder remains a
                separate Lighthouse lens. No candidate is a finding of corruption, illegality, intent, or wrongdoing.
              </p>
            </div>
          </CardContent>
        </Card>

        {readiness.error ? (
          <Card className="border-red-500/40"><CardContent className="p-4 text-sm text-red-300">{error_message(readiness.error)}</CardContent></Card>
        ) : null}
        {candidates.error ? (
          <Card className="border-red-500/40"><CardContent className="p-4 text-sm text-red-300">{error_message(candidates.error)}</CardContent></Card>
        ) : null}

        {readiness.data ? <ReadinessMetrics data={readiness.data} /> : null}

        {readiness.data && !readiness.data.projection_healthy ? (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-400" /> Atlas review projection needs reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {readiness.data.unprojected_review_count} current Atlas candidate(s) have not yet received a Lighthouse review receipt.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <CandidateQueue
            candidates={candidates.data}
            is_loading={candidates.isLoading}
            error={candidates.error}
            selected_id={selected_id}
            on_select={set_selected_id}
          />

          <div>
            {detail_query.isLoading ? (
              <Card><CardContent className="flex justify-center py-16"><Loader2 className="animate-spin" /></CardContent></Card>
            ) : null}
            {detail_query.error ? (
              <Card className="border-red-500/40"><CardContent className="p-4 text-sm text-red-300">{error_message(detail_query.error)}</CardContent></Card>
            ) : null}
            {detail ? (
              <CandidateDetail
                detail={detail}
                eligible_routes={eligible_routes}
                on_attach_evidence={(payload: AttachEvidencePayload) => evidence.mutate(payload)}
                is_attaching_evidence={evidence.isPending}
                on_corroborate={(payload: CorroborationPayload) => corroboration.mutate(payload)}
                is_corroborating={corroboration.isPending}
                on_transition={(payload: TransitionPayload) => transition.mutate(payload)}
                is_transitioning={transition.isPending}
                on_draft={(payload: DraftPayload) => draft.mutate(payload)}
                is_drafting={draft.isPending}
              />
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-4 w-4" /> Verified draft-routing catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {route_catalog.data?.map(route => (
              <div key={route.route_id} className="rounded-lg border p-4 text-sm">
                <div className="font-medium">{route.agency_name}</div>
                <div className="text-xs text-muted-foreground">{route.department_name}</div>
                <p className="mt-2 text-xs text-muted-foreground">{route.authority_basis.scope}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">draft only</Badge>
                  <Badge variant="outline">human review required</Badge>
                  <Badge variant="outline">source as of {new Date(route.source_as_of).toLocaleDateString()}</Badge>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {route.candidate_types.map(readable).join(" · ")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
