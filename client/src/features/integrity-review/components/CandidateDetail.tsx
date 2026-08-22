import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Database, Fingerprint } from "lucide-react";
import type {
  AttachEvidencePayload,
  CorroborationPayload,
  DetailProjection,
  DraftPayload,
  RouteCatalogItem,
  TransitionPayload,
} from "../types";
import { format_confidence, readable, short_hash } from "../utils";
import { CorroborationSection } from "./CorroborationSection";
import { DraftSection } from "./DraftSection";
import { EvidenceForm } from "./EvidenceForm";
import { EvidenceList } from "./EvidenceList";
import { TransitionSection } from "./TransitionSection";

type CandidateDetailProps = {
  detail: DetailProjection;
  eligible_routes: RouteCatalogItem[];
  on_attach_evidence: (payload: AttachEvidencePayload) => void;
  is_attaching_evidence: boolean;
  on_corroborate: (payload: CorroborationPayload) => void;
  is_corroborating: boolean;
  on_transition: (payload: TransitionPayload) => void;
  is_transitioning: boolean;
  on_draft: (payload: DraftPayload) => void;
  is_drafting: boolean;
};

export function CandidateDetail({
  detail,
  eligible_routes,
  on_attach_evidence,
  is_attaching_evidence,
  on_corroborate,
  is_corroborating,
  on_transition,
  is_transitioning,
  on_draft,
  is_drafting,
}: CandidateDetailProps) {
  return (
    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg">{detail.candidate.summary}</CardTitle>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{readable(detail.candidate.status)}</Badge>
                <Badge variant="outline">{readable(detail.candidate.candidate_type)}</Badge>
                <Badge variant="outline">{detail.candidate.jurisdiction_id ?? "jurisdiction unknown"}</Badge>
                <Badge variant="outline">Atlas {readable(detail.atlas_projection.verification_state)}</Badge>
                <Badge variant="outline">confidence {format_confidence(detail.atlas_projection.confidence_score)}</Badge>
              </div>
            </div>
            <div className="text-right font-mono text-xs text-muted-foreground">
              <div>Atlas rule {detail.candidate.rule_id}@{detail.candidate.rule_version}</div>
              <div title={detail.atlas_projection.atlas_candidate_hash ?? detail.candidate.candidate_hash}>
                {short_hash(detail.atlas_projection.atlas_candidate_id ?? detail.candidate.candidate_id)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!detail.atlas_projection.is_current ? (
            <div className="flex gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This is a historical Atlas candidate version. Its receipts remain visible, but it cannot be newly verified or routed.
            </div>
          ) : null}
          <p>{detail.atlas_projection.description}</p>
          <p className="text-muted-foreground">{detail.disclaimer}</p>
          <dl className="grid grid-cols-1 gap-2 rounded border p-3 text-xs md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Atlas stream</dt>
              <dd className="font-mono">{detail.atlas_projection.primary_stream_id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entity resolution</dt>
              <dd>{readable(detail.atlas_projection.entity_resolution_status)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Governance state</dt>
              <dd>{readable(detail.atlas_projection.governance_status)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source freshness</dt>
              <dd>{new Date(detail.atlas_projection.source_freshness_at).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Database className="h-4 w-4" /> Sources, quotations, and hashes</span>
            <Badge variant="outline">{detail.evidence.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceList evidence={detail.evidence} />
          <EvidenceForm
            candidate_id={detail.candidate.candidate_id}
            evidence_count={detail.evidence.length}
            on_attach={on_attach_evidence}
            is_pending={is_attaching_evidence}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CorroborationSection detail={detail} on_corroborate={on_corroborate} is_pending={is_corroborating} />
        <TransitionSection detail={detail} on_transition={on_transition} is_pending={is_transitioning} />
      </div>

      <DraftSection detail={detail} eligible_routes={eligible_routes} on_draft={on_draft} is_pending={is_drafting} />

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
          <Fingerprint className="mt-0.5 h-4 w-4 shrink-0" />
          Atlas event hashes identify the exact normalized inputs used by the detector. Reviewer-bound external evidence retains its own content SHA-256 and immutable Lighthouse receipt.
        </CardContent>
      </Card>
    </div>
  );
}
