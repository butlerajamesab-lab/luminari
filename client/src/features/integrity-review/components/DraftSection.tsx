import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ExternalLink, Loader2, Route } from "lucide-react";
import { MIN_REVIEWER_NOTES_LENGTH } from "../config";
import type { DetailProjection, DraftPayload, RouteCatalogItem } from "../types";
import { readable, short_hash } from "../utils";

type DraftSectionProps = {
  detail: DetailProjection;
  eligible_routes: RouteCatalogItem[];
  on_draft: (payload: DraftPayload) => void;
  is_pending: boolean;
};

export function DraftSection({ detail, eligible_routes, on_draft, is_pending }: DraftSectionProps) {
  const [route_id, set_route_id] = useState("");
  const [reviewer_notes, set_reviewer_notes] = useState("");

  useEffect(() => {
    set_route_id(eligible_routes.length === 1 ? eligible_routes[0].route_id : "");
    set_reviewer_notes("");
  }, [detail.candidate.candidate_id, eligible_routes.length]);

  const latest_assessment = useMemo(
    () => [...detail.assessments]
      .sort((left, right) => right.assessment_order - left.assessment_order)[0],
    [detail.assessments],
  );
  const latest_verified_assessment = latest_assessment?.assessment_state === "verified_for_routing"
    ? latest_assessment
    : undefined;
  const evidence_link_ids = useMemo(
    () => detail.evidence.map(item => item.evidence_link_id).sort(),
    [detail.evidence],
  );
  const selected_route = eligible_routes.find(route => route.route_id === route_id);

  const submit = () => {
    if (!latest_verified_assessment || !route_id) return;
    on_draft({
      candidate_id: detail.candidate.candidate_id,
      assessment_id: latest_verified_assessment.assessment_id,
      evidence_link_ids,
      route_id,
      reviewer_notes: reviewer_notes.trim(),
    });
  };

  return (
    <Card className="border-cyan-500/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4 text-cyan-400" /> Create escalation draft
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm">
          This creates an immutable review packet only. It does not email, file, submit, accuse, or transmit anything.
        </div>
        <Select value={route_id} onValueChange={set_route_id}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={eligible_routes.length ? "Choose eligible department" : "No eligible verified route"} />
          </SelectTrigger>
          <SelectContent>
            {eligible_routes.map(route => (
              <SelectItem key={route.route_id} value={route.route_id}>
                {route.agency_name} — {route.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected_route ? (
          <div className="space-y-2 rounded border p-3 text-xs">
            <div className="font-medium">{selected_route.authority_basis.authority_name}</div>
            <p className="text-muted-foreground">{selected_route.authority_basis.scope}</p>
            <a
              href={selected_route.destination_uri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Review official destination <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}
        <Textarea
          value={reviewer_notes}
          onChange={event => set_reviewer_notes(event.target.value)}
          placeholder="Reviewer notes for the draft packet (required; minimum 10 characters)"
        />
        <Button
          className="w-full"
          disabled={
            detail.candidate.status !== "escalation_ready" ||
            !detail.atlas_projection.is_current ||
            !latest_verified_assessment ||
            !route_id ||
            reviewer_notes.trim().length < MIN_REVIEWER_NOTES_LENGTH ||
            is_pending
          }
          onClick={submit}
        >
          {is_pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create draft — do not transmit
        </Button>
        {detail.packets.map(packet => (
          <div key={packet.packet_id} className="rounded border border-emerald-500/25 p-3 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="font-medium">{readable(packet.packet_state)}</span>
              <span className="font-mono text-muted-foreground">{short_hash(packet.packet_id)}</span>
            </div>
            <p className="mt-2 text-muted-foreground">{packet.allegation_disclaimer}</p>
            <div className="mt-2">Transmitted: {packet.transmitted_at ? new Date(packet.transmitted_at).toLocaleString() : "No"}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
