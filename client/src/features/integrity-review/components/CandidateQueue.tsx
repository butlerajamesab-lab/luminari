import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck2, Loader2 } from "lucide-react";
import type { CandidateListItem } from "../types";
import { error_message, readable, short_hash } from "../utils";

type CandidateQueueProps = {
  candidates: CandidateListItem[] | undefined;
  is_loading: boolean;
  error: unknown;
  selected_id: string;
  on_select: (candidate_id: string) => void;
};

export function CandidateQueue({
  candidates,
  is_loading,
  error,
  selected_id,
  on_select,
}: CandidateQueueProps) {
  return (
    <Card className="lg:sticky lg:top-24">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Integrity candidate queue</span>
          <Badge variant="outline">{candidates?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
        {is_loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin" />
          </div>
        ) : null}
        {error ? <div className="text-sm text-red-300">{error_message(error)}</div> : null}
        {candidates?.map(candidate => (
          <button
            type="button"
            key={candidate.candidate_id}
            onClick={() => on_select(candidate.candidate_id)}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${
              selected_id === candidate.candidate_id
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <Badge variant="outline" className="capitalize">
                  {readable(candidate.status)}
                </Badge>
                {!candidate.atlas_is_current ? <Badge variant="destructive">stale</Badge> : null}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {short_hash(candidate.atlas_candidate_id ?? candidate.candidate_id)}
              </span>
            </div>
            <div className="mt-2 line-clamp-2 text-sm font-medium">{candidate.summary}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{readable(candidate.candidate_type)}</span>
              <span>{candidate.evidence_count} evidence</span>
              <span>{candidate.contradiction_count} contradictions</span>
            </div>
          </button>
        ))}
        {!is_loading && candidates?.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <FileCheck2 className="mx-auto mb-3 h-8 w-8 opacity-50" />
            No Atlas integrity candidates have been projected. The queue stays empty instead of
            converting ordinary observations into accusations.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
