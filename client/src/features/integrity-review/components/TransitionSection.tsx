import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { LEGAL_TRANSITIONS, MIN_RATIONALE_LENGTH } from "../config";
import type { CandidateStatus, DetailProjection, TransitionPayload } from "../types";
import { readable } from "../utils";

type TransitionSectionProps = {
  detail: DetailProjection;
  on_transition: (payload: TransitionPayload) => void;
  is_pending: boolean;
};

export function TransitionSection({ detail, on_transition, is_pending }: TransitionSectionProps) {
  const current_status = detail.candidate.status;
  const next_statuses = LEGAL_TRANSITIONS[current_status];
  const [to_status, set_to_status] = useState<CandidateStatus | "">(next_statuses[0] ?? "");
  const [reason, set_reason] = useState("");

  useEffect(() => {
    set_to_status(next_statuses[0] ?? "");
    set_reason("");
  }, [detail.candidate.candidate_id, current_status]);

  const latest_assessment = useMemo(
    () => [...detail.assessments]
      .sort((left, right) => right.assessment_order - left.assessment_order)[0],
    [detail.assessments],
  );
  const latest_verified_assessment = latest_assessment?.assessment_state === "verified_for_routing"
    ? latest_assessment
    : undefined;

  const submit = () => {
    if (!to_status) return;
    on_transition({
      candidate_id: detail.candidate.candidate_id,
      to_status,
      reason: reason.trim(),
      assessment_id: to_status === "escalation_ready" ? latest_verified_assessment?.assessment_id : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Advance governed lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {next_statuses.length > 0 ? (
          <>
            <Select value={to_status} onValueChange={value => set_to_status(value as CandidateStatus)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select next status" /></SelectTrigger>
              <SelectContent>
                {next_statuses.map(status => (
                  <SelectItem key={status} value={status}>{readable(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={reason}
              onChange={event => set_reason(event.target.value)}
              placeholder="Reason for this transition (required; minimum 10 characters)"
            />
            <Button
              className="w-full"
              variant="outline"
              disabled={
                !to_status ||
                reason.trim().length < MIN_RATIONALE_LENGTH ||
                is_pending ||
                !detail.atlas_projection.is_current ||
                (to_status === "escalation_ready" && !latest_verified_assessment)
              }
              onClick={submit}
            >
              {is_pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Record transition
            </Button>
            {to_status === "escalation_ready" && !latest_verified_assessment ? (
              <p className="text-xs text-amber-300">A verified-for-routing assessment is required first.</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This candidate has no available local transition.</p>
        )}
        <div className="space-y-2 pt-2">
          {[...detail.transitions].reverse().map(item => (
            <div key={item.transition_id} className="rounded border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">
                  {readable(item.from_status)} → {readable(item.to_status)}
                </div>
                <Badge variant="outline">#{item.transition_order}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{item.reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
