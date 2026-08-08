import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, ChevronDown, ChevronUp, Target, FileText, ShieldCheck, GitBranch, Clock3 } from "lucide-react";
import { CommitToCase } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { CrossClaimPanel } from "@/components/CrossClaimPanel";

function ClaimGroup({ claimType, elements }: { claimType: string; elements: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const domain = elements[0]?.domain ?? "";

  return (
    <Card className="border-white/10">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <ListChecks className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{claimType}</CardTitle>
              <Badge variant="outline" className="text-xs mt-0.5">{domain}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            <CommitToCase type="claimType" claimType={claimType} label="Set as Claim Type" size="sm" />
            <Badge variant="outline" className="text-xs">{elements.length} elements</Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {elements.map((el) => (
              <div key={el.id} className="p-3 rounded-lg bg-white/3 border border-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 text-xs flex items-center justify-center font-medium">
                      {el.elementOrder}
                    </span>
                    <h4 className="text-sm font-medium text-white">{el.elementName}</h4>
                  </div>
                  {el.strengthIndicators && (el.strengthIndicators as string[]).length > 0 && (
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                      {(el.strengthIndicators as string[])[0]}
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-white/70 mb-2 ml-8">{el.elementDescription}</p>

                <div className="ml-8 space-y-2">
                  {el.evidenceTypes && (el.evidenceTypes as string[]).length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Target className="h-3 w-3" /> Evidence Types
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(el.evidenceTypes as string[]).map((ev: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs text-white/60">{ev}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {el.commonWeaknesses && (el.commonWeaknesses as string[]).length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3" /> Common Weaknesses
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(el.commonWeaknesses as string[]).map((w: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs text-amber-400 border-amber-400/30">{w}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CaseClaimCandidateCard({ entry }: { entry: any }) {
  const candidate = entry.candidate;
  return (
    <Card className="border-cyan-500/20 bg-cyan-500/[0.025]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-white">{candidate.claim_type_name}</CardTitle>
              <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-400/30">
                Candidate — unverified
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span>{candidate.claim_domain}</span>
              <span>·</span>
              <span>{candidate.jurisdiction}</span>
              <span>·</span>
              <code>{candidate.matching_rule}</code>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {candidate.required_elements.length} governed elements
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Why this candidate appeared</p>
          <div className="space-y-1">
            {candidate.triggering_facts.map((fact: any, index: number) => (
              <div key={`${candidate.candidate_id}:fact:${index}`} className="text-xs flex items-start gap-2">
                <GitBranch className="h-3 w-3 mt-0.5 text-cyan-400 shrink-0" />
                <span>{fact.fact_description}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Required elements</p>
          <div className="space-y-2">
            {candidate.required_elements.map((element: any, index: number) => (
              <div key={`${candidate.candidate_id}:element:${element.registry_id}`} className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-[10px] text-cyan-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{element.element_name}</p>
                      {element.element_description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{element.element_description}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] text-amber-300 border-amber-400/30 shrink-0">
                    {element.evaluation_state}
                  </Badge>
                </div>
                {element.required_evidence_types.length > 0 && (
                  <div className="mt-2 ml-7 flex flex-wrap gap-1">
                    {element.required_evidence_types.map((type: string) => (
                      <Badge key={type} variant="secondary" className="text-[9px]">{type}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {candidate.deadline_candidates.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Deadline candidates — not claim-specific</p>
            <div className="space-y-1.5">
              {candidate.deadline_candidates.map((deadline: any) => (
                <div key={deadline.registry_id} className="flex items-start gap-2 rounded-md bg-muted/15 p-2 text-xs">
                  <Clock3 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p>{deadline.deadline_description || `${deadline.deadline_days ?? "Unknown"} days`}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {deadline.jurisdiction}{deadline.filing_body ? ` · ${deadline.filing_body}` : ""} · {deadline.binding_state}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="rounded-md border border-border/50 p-2.5 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Deterministic receipt</summary>
          <div className="mt-2 space-y-1 text-[10px]">
            <div><span className="text-muted-foreground">Candidate:</span> <code className="break-all">{candidate.candidate_id}</code></div>
            <div><span className="text-muted-foreground">Session:</span> <code className="break-all">{entry.intake_session_id}</code></div>
            <div><span className="text-muted-foreground">Receipt:</span> <code className="break-all">{entry.receipt_hash}</code></div>
            <div><span className="text-muted-foreground">Output:</span> <code className="break-all">{entry.output_hash}</code></div>
            <div><span className="text-muted-foreground">Registry:</span> <code className="break-all">{candidate.registry_binding.governed_registry_hash}</code></div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export default function ClaimElements() {
  const { currentCaseId } = useCase();
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const { data, isLoading } = trpc.architectureMap.listClaimElements.useQuery(
    domainFilter !== "all" ? { domain: domainFilter } : undefined
  );
  const caseProjection = trpc.analyze.getIntakeClaimCandidateProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, retry: false },
  );

  const domains = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.map((el: any) => el.domain));
    return Array.from(set).sort();
  }, [data]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, any[]>();
    data.forEach((el: any) => {
      const key = el.claimType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(el);
    });
    return Array.from(map.entries()).map(([claimType, elements]) => ({ claimType, elements }));
  }, [data]);

  const caseCandidates = useMemo(() => {
    const outputs = caseProjection.data?.outputs ?? [];
    return outputs.flatMap(output => output.candidates.map(candidate => ({
      candidate,
      intake_session_id: output.intake_session_id,
      receipt_hash: output.receipt_hash,
      output_hash: output.output_hash,
    })));
  }, [caseProjection.data]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <ListChecks className="h-6 w-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Claim Element Matrix</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Case applicability is separated from the global legal library. A case candidate is a governed structural match, not a legal conclusion, and its elements remain unresolved until the downstream claim-proof system evaluates them.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-semibold">Current case candidates</h2>
          {currentCaseId && <Badge variant="outline" className="text-[10px]">Case {currentCaseId}</Badge>}
        </div>

        {!currentCaseId ? (
          <Card className="border-dashed">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Select a case to inspect its deterministic claim-candidate projection. The library below remains global reference material.
            </CardContent>
          </Card>
        ) : caseProjection.isLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}</div>
        ) : caseProjection.error ? (
          <Card className="border-red-500/30">
            <CardContent className="p-5 text-sm text-red-300">Case claim-candidate projection is unavailable: {caseProjection.error.message}</CardContent>
          </Card>
        ) : caseProjection.data?.projection_state !== "canonical_projection" ? (
          <Card className="border-dashed">
            <CardContent className="p-5 text-sm text-muted-foreground">
              No sealed Layer 12 case projection exists yet. The global claim-element library below does not establish applicability to this case.
            </CardContent>
          </Card>
        ) : caseCandidates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-5 text-sm text-muted-foreground">
              The governed case projection completed with zero claim candidates under its declared structural routing rules. This is a completed-zero result, not a missing library.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {caseCandidates.map(entry => (
              <CaseClaimCandidateCard
                key={`${entry.intake_session_id}:${entry.output_hash}:${entry.candidate.candidate_id}`}
                entry={entry}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5 border-t border-border/60 pt-6">
        <div>
          <h2 className="text-lg font-semibold">Global Claim Element Library</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Governed reference definitions available to the platform. Presence here does not mean the claim applies to the selected case.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Badge variant="outline" className="text-xs">
            {grouped.length} claim types, {data?.length ?? 0} elements
          </Badge>
        </div>

        {grouped.length >= 2 && (
          <CrossClaimPanel activeClaimTypes={grouped.map(g => g.claimType)} />
        )}

        <div className="space-y-3">
          {grouped.length > 0 ? (
            grouped.map(g => <ClaimGroup key={g.claimType} claimType={g.claimType} elements={g.elements} />)
          ) : (
            <Card className="border-white/10">
              <CardContent className="p-8 text-center">
                <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No global claim elements found.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <NextStepBar
        context="Case candidates and global claim elements reviewed. Procedural paths remain governed separately and should preserve candidate/unresolved status until their prerequisites are satisfied."
        steps={[
          { label: "Procedural Paths", href: "/enforcement-pathway", icon: "scale", variant: "primary", description: "Inspect available enforcement routes" },
          { label: "Litigation Barriers", href: "/barriers", icon: "shield", description: "Inspect structural obstacles" },
          { label: "Provenance", href: "/provenance", icon: "gavel", description: "Trace the case projection back to sources" },
        ]}
      />
    </div>
  );
}
