import { useMemo } from "react";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, FileText, Route, ShieldCheck } from "lucide-react";

function humanize(value: string | null | undefined): string {
  if (!value) return "Unresolved";
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

export function CaseActionPaths() {
  const { currentCaseId } = useCase();
  const projection = trpc.analyze.getIntakeActionPathProjection.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, retry: false },
  );

  const entries = useMemo(() => {
    const outputs = projection.data?.outputs ?? [];
    return outputs.flatMap(output => output.paths.map(path => ({
      path,
      intake_session_id: output.intake_session_id,
      layer_version: output.layer_version,
      rule_version: output.rule_version,
      receipt_hash: output.receipt_hash,
      output_hash: output.output_hash,
      unresolved_dependencies: output.unresolved_dependencies,
    })));
  }, [projection.data]);

  if (!currentCaseId) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Select a case to inspect its governed procedural-path projection.
        </CardContent>
      </Card>
    );
  }

  if (projection.isLoading) {
    return <div className="h-28 rounded-lg bg-muted/40 animate-pulse" />;
  }

  if (projection.error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="p-5 text-sm text-red-300">
          Case action-path projection is unavailable: {projection.error.message}
        </CardContent>
      </Card>
    );
  }

  if (projection.data?.projection_state !== "canonical_projection") {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Route className="h-4 w-4 text-muted-foreground" />
            No sealed Layer 14 case projection yet
          </div>
          <p className="text-xs text-muted-foreground">
            The global enforcement models below remain reference material. They do not establish that a pathway applies to this case.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    const unresolved = projection.data.outputs.flatMap(output => output.unresolved_dependencies);
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Action-path projection completed with zero emitted paths</p>
          </div>
          <p className="text-xs text-muted-foreground">
            A completed-zero result is preserved as such. It does not mean that no procedure exists; it means the governed Layer 14 rules did not emit a path from the current candidate inputs.
          </p>
          {unresolved.length > 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-300 mb-1.5">Unresolved dependencies</p>
              {unresolved.map((dependency: any, index: number) => (
                <p key={index} className="text-xs text-muted-foreground">
                  {dependency.field}: {dependency.detail || dependency.reason}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Current case procedural candidates</h2>
          <Badge variant="outline" className="text-[10px]">Case {currentCaseId}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Layer 14 presents all governed candidate paths deterministically. It does not rank, recommend, or mark a path complete when required footholds remain unresolved.
        </p>
      </div>

      {entries.map(entry => {
        const path = entry.path;
        const unresolved = [
          ...path.unresolved_facts,
          ...entry.unresolved_dependencies
            .filter((dependency: any) => String(dependency.field ?? "").includes(path.path_id)
              || String(dependency.field ?? "").includes(path.claim_candidate_id)
              || String(dependency.field ?? "").includes(path.workflow_key))
            .map((dependency: any) => dependency.detail || dependency.reason),
        ];

        return (
          <Card key={`${entry.intake_session_id}:${entry.output_hash}:${path.path_id}`} className={path.foothold_complete ? "border-primary/20" : "border-amber-500/25"}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{path.workflow_name}</CardTitle>
                    <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-400/30">
                      {humanize(path.status)}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${path.foothold_complete ? "text-emerald-300 border-emerald-400/30" : "text-amber-300 border-amber-400/30"}`}>
                      {path.foothold_complete ? "Foothold complete" : "Foothold incomplete"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {path.claim_type_name} · {path.workflow_key}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Confirmation: {humanize(path.confirmation_state)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Authority</p>
                  <p className="mt-1 font-medium">{path.authority || "Unresolved"}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Filing destination</p>
                  <p className="mt-1 font-medium">{path.filing_destination || "Unresolved"}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Expected burden</p>
                  <p className="mt-1 font-medium">{path.expected_burden || "Unresolved — not inferred"}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Entry forms</p>
                  <p className="mt-1 font-medium">{path.entry_forms.length > 0 ? path.entry_forms.join(", ") : "None declared"}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Governed procedural sequence</p>
                <div className="space-y-2">
                  {path.next_steps.map(step => (
                    <div key={`${path.path_id}:step:${step.step_number}`} className="flex gap-3 rounded-md border border-border/50 bg-muted/10 p-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                        {step.step_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{step.action}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          {step.owner && <span>Owner: {step.owner}</span>}
                          {step.due_rule && <span>Due: {step.due_rule}</span>}
                          {step.required_document && <span>Requires: {step.required_document}</span>}
                        </div>
                        {step.failure_route && (
                          <p className="mt-1 text-[10px] text-amber-300">Failure route: {step.failure_route}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {path.deadline_candidates.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Deadline candidates — not binding until resolved</p>
                  <div className="space-y-1.5">
                    {path.deadline_candidates.map(deadline => (
                      <div key={deadline.registry_id} className="rounded-md border border-border/50 p-2.5 text-xs">
                        <p>{deadline.deadline_description || `${deadline.deadline_days ?? "Unknown"} days`}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {deadline.jurisdiction}{deadline.filing_body ? ` · ${deadline.filing_body}` : ""} · {deadline.binding_state}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {path.required_evidence_types.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Required evidence types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {path.required_evidence_types.map(type => (
                      <Badge key={type} variant="secondary" className="text-[9px] gap-1">
                        <FileText className="h-2.5 w-2.5" /> {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {unresolved.length > 0 && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300 mb-1.5">
                    <AlertTriangle className="h-3 w-3" /> Unresolved
                  </div>
                  {unresolved.map((value: any, index: number) => (
                    <p key={index} className="text-xs text-muted-foreground">{String(value)}</p>
                  ))}
                </div>
              )}

              {(path.failure_routes.length > 0 || path.appeal_chain.length > 0 || path.remedies.length > 0) && (
                <div className="grid gap-3 md:grid-cols-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Failure routes</p>
                    {path.failure_routes.length > 0 ? path.failure_routes.map(value => <p key={value}>{value}</p>) : <p className="text-muted-foreground">None declared</p>}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Appeal chain</p>
                    {path.appeal_chain.length > 0 ? path.appeal_chain.map(value => <p key={value}>{value}</p>) : <p className="text-muted-foreground">None declared</p>}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Declared remedies</p>
                    {path.remedies.length > 0 ? path.remedies.map(value => <p key={value}>{value}</p>) : <p className="text-muted-foreground">None declared</p>}
                  </div>
                </div>
              )}

              <details className="rounded-md border border-border/50 p-2.5 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Deterministic receipt</summary>
                <div className="mt-2 space-y-1 text-[10px]">
                  <div><span className="text-muted-foreground">Path:</span> <code className="break-all">{path.path_id}</code></div>
                  <div><span className="text-muted-foreground">Candidate:</span> <code className="break-all">{path.claim_candidate_id}</code></div>
                  <div><span className="text-muted-foreground">Session:</span> <code className="break-all">{entry.intake_session_id}</code></div>
                  <div><span className="text-muted-foreground">Receipt:</span> <code className="break-all">{entry.receipt_hash}</code></div>
                  <div><span className="text-muted-foreground">Output:</span> <code className="break-all">{entry.output_hash}</code></div>
                  <div><span className="text-muted-foreground">Governed registry:</span> <code className="break-all">{path.governed_registry_hash}</code></div>
                  <div><span className="text-muted-foreground">Versions:</span> {entry.layer_version} / {entry.rule_version}</div>
                </div>
              </details>

              <div className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/[0.025] p-3 text-xs text-muted-foreground">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                This path is displayed for inspection. Lighthouse has not selected it, recommended it, filed anything, or taken an external action.
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
