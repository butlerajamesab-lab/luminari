import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, ChevronDown, ChevronUp, FileSearch, Users, Clock, AlertTriangle, Target } from "lucide-react";

function GuidanceCard({ guidance }: { guidance: any }) {
  const [expanded, setExpanded] = useState(false);
  const criticalEvidence = guidance.criticalEvidence ?? [];
  const secondaryEvidence = guidance.secondaryEvidence ?? [];
  const typicalQuestions = guidance.typicalQuestions ?? [];
  const commonMistakes = guidance.commonMistakes ?? [];
  const investigationStages = guidance.investigationStages ?? [];
  const recommendedPreparation = guidance.recommendedPreparation ?? [];

  return (
    <Card className="border-white/10">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
              <Compass className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{guidance.claimType}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">{guidance.agency}</Badge>
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">{guidance.pipelineCategory}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-muted-foreground">
              <div>{criticalEvidence.length} evidence items</div>
              <div>{typicalQuestions.length} questions</div>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Investigation Focus */}
          {guidance.investigationFocus && (
            <div className="p-3 rounded-lg bg-pink-500/5 border border-pink-500/20">
              <h4 className="text-xs font-medium text-pink-400 mb-1">Investigation Focus</h4>
              <p className="text-sm text-white/80">{guidance.investigationFocus}</p>
            </div>
          )}

          {/* Investigation Stages */}
          {investigationStages.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Target className="h-3 w-3" /> Investigation Stages
              </h4>
              <ol className="space-y-1.5 list-none">
                {investigationStages.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-pink-500/10 text-pink-400 text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-white/80">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Critical Evidence */}
          {criticalEvidence.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileSearch className="h-3 w-3" /> Critical Evidence
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {criticalEvidence.map((ev: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">{ev}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Secondary Evidence */}
          {secondaryEvidence.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileSearch className="h-3 w-3" /> Secondary Evidence
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {secondaryEvidence.map((ev: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs text-blue-400 border-blue-400/30">{ev}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Typical Questions */}
          {typicalQuestions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Users className="h-3 w-3" /> Typical Questions
              </h4>
              <ol className="space-y-1 list-none">
                {typicalQuestions.map((q: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-white/80">{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Recommended Preparation */}
          {recommendedPreparation.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recommended Preparation
              </h4>
              <ol className="space-y-1 list-none">
                {recommendedPreparation.map((p: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-white/80">{p}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Common Mistakes */}
          {commonMistakes.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Common Mistakes
              </h4>
              <div className="space-y-1">
                {commonMistakes.map((m: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-red-500/5 border border-red-500/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-red-200/80">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function InvestigationGuidancePage() {
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const { data, isLoading } = trpc.architectureMap.listInvestigationGuidance.useQuery(
    agencyFilter !== "all" ? { agencyShort: agencyFilter } : undefined
  );

  const agencies = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.map((g: any) => g.agencyShort));
    return Array.from(set).sort();
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Compass className="h-6 w-6 text-pink-400" />
          <h1 className="text-2xl font-bold text-white">Investigation Guidance</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Agency-specific investigation playbooks. Key records to obtain, witness targets, timeline checkpoints, red flags, and step-by-step investigation procedures.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Agencies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agencies</SelectItem>
            {agencies.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">{data?.length ?? 0} guides</Badge>
      </div>

      <div className="space-y-3">
        {data && data.length > 0 ? (
          data.map((g: any) => <GuidanceCard key={g.id} guidance={g} />)
        ) : (
          <Card className="border-white/10">
            <CardContent className="p-8 text-center">
              <Compass className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No investigation guidance found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
