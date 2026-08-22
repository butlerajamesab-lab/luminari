import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { CORROBORATION_STATES, MIN_RATIONALE_LENGTH } from "../config";
import type { CorroborationPayload, CorroborationState, DetailProjection } from "../types";
import { readable, short_hash } from "../utils";

type CorroborationSectionProps = {
  detail: DetailProjection;
  on_corroborate: (payload: CorroborationPayload) => void;
  is_pending: boolean;
};

function suggested_state(input: {
  independent_source_count: number;
  source_class_count: number;
  contradiction_count: number;
}): CorroborationState {
  if (input.contradiction_count > 0) return "contradicted";
  if (input.independent_source_count >= 2 && input.source_class_count >= 2) {
    return "independently_supported";
  }
  if (input.independent_source_count === 1) return "single_source";
  return "uncorroborated";
}

export function CorroborationSection({ detail, on_corroborate, is_pending }: CorroborationSectionProps) {
  const all_evidence_ids = useMemo(
    () => detail.evidence.map(item => item.evidence_link_id),
    [detail.evidence],
  );
  const evidence_identity = all_evidence_ids.join("|");
  const [selected_ids, set_selected_ids] = useState<string[]>(all_evidence_ids);
  const [assessment_state, set_assessment_state] = useState<CorroborationState>("uncorroborated");
  const [rationale, set_rationale] = useState("");

  useEffect(() => {
    set_selected_ids(all_evidence_ids);
    const sources = new Set(detail.evidence.map(item => item.source_relation)).size;
    const classes = new Set(detail.evidence.map(item => item.source_class)).size;
    const contradictions = detail.evidence.filter(item => item.supports_or_contradicts === "contradicts").length;
    set_assessment_state(suggested_state({
      independent_source_count: sources,
      source_class_count: classes,
      contradiction_count: contradictions,
    }));
    set_rationale("");
  }, [detail.candidate.candidate_id, evidence_identity]);

  const selected_evidence = useMemo(
    () => detail.evidence.filter(item => selected_ids.includes(item.evidence_link_id)),
    [detail.evidence, selected_ids],
  );
  const independent_source_count = useMemo(
    () => new Set(selected_evidence.map(item => item.source_relation)).size,
    [selected_evidence],
  );
  const source_class_count = useMemo(
    () => new Set(selected_evidence.map(item => item.source_class)).size,
    [selected_evidence],
  );
  const contradiction_count = useMemo(
    () => selected_evidence.filter(item => item.supports_or_contradicts === "contradicts").length,
    [selected_evidence],
  );

  const assessment_is_consistent =
    !(["independently_supported", "verified_for_routing"] as CorroborationState[]).includes(assessment_state) ||
    (independent_source_count >= 2 && source_class_count >= 2);
  const routing_is_clear = assessment_state !== "verified_for_routing" || contradiction_count === 0;
  const contradicted_is_supported = assessment_state !== "contradicted" || contradiction_count > 0;
  const single_source_is_consistent = assessment_state !== "single_source" || independent_source_count === 1;

  const toggle_evidence = (evidence_link_id: string, checked: boolean) => {
    set_selected_ids(current => checked
      ? [...new Set([...current, evidence_link_id])]
      : current.filter(value => value !== evidence_link_id));
  };

  const submit = () => {
    on_corroborate({
      candidate_id: detail.candidate.candidate_id,
      assessment_state,
      rationale: rationale.trim(),
      evidence_link_ids: [...selected_ids].sort(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record corroboration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded border p-2">
            <div className="font-mono text-lg">{independent_source_count}</div>
            <div className="text-muted-foreground">source origins</div>
          </div>
          <div className="rounded border p-2">
            <div className="font-mono text-lg">{source_class_count}</div>
            <div className="text-muted-foreground">source classes</div>
          </div>
          <div className="rounded border p-2">
            <div className="font-mono text-lg">{contradiction_count}</div>
            <div className="text-muted-foreground">contradictions</div>
          </div>
        </div>

        <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
          {detail.evidence.map(item => (
            <label key={item.evidence_link_id} className="flex cursor-pointer items-start gap-2 rounded p-2 hover:bg-muted/40">
              <Checkbox
                checked={selected_ids.includes(item.evidence_link_id)}
                onCheckedChange={checked => toggle_evidence(item.evidence_link_id, checked === true)}
                aria-label={`Use evidence ${item.source_record_key}`}
              />
              <span className="min-w-0 text-xs">
                <span className="block truncate font-medium">{item.source_record_key}</span>
                <span className="text-muted-foreground">
                  {readable(item.source_class)} · {short_hash(item.source_relation)}
                </span>
              </span>
            </label>
          ))}
        </div>

        <Select value={assessment_state} onValueChange={value => set_assessment_state(value as CorroborationState)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CORROBORATION_STATES.map(state => (
              <SelectItem key={state} value={state}>{readable(state)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={rationale}
          onChange={event => set_rationale(event.target.value)}
          placeholder="Reviewer rationale (required; minimum 10 characters)"
        />
        <Button
          className="w-full"
          disabled={
            selected_ids.length === 0 ||
            rationale.trim().length < MIN_RATIONALE_LENGTH ||
            !assessment_is_consistent ||
            !routing_is_clear ||
            !contradicted_is_supported ||
            !single_source_is_consistent ||
            !detail.atlas_projection.is_current ||
            is_pending
          }
          onClick={submit}
        >
          {is_pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Seal assessment
        </Button>
        {!assessment_is_consistent ? (
          <p className="text-xs text-amber-300">Independent support requires two source origins and two source classes.</p>
        ) : null}
        {!routing_is_clear ? (
          <p className="text-xs text-amber-300">Routing verification cannot ignore a selected contradiction.</p>
        ) : null}
        {!detail.atlas_projection.is_current ? (
          <p className="text-xs text-amber-300">This Atlas version is stale and cannot receive a new routing assessment.</p>
        ) : null}

        <div className="space-y-2 pt-2">
          {[...detail.assessments].reverse().map(item => (
            <div key={item.assessment_id} className="rounded border p-3 text-xs">
              <div className="flex justify-between gap-2">
                <Badge variant="outline">{readable(item.assessment_state)}</Badge>
                <span className="font-mono text-muted-foreground">#{item.assessment_order}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{item.rationale}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
