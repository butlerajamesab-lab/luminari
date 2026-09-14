import { useState } from "react";
import { Link } from "wouter";
import { benefits_cascade_references, benefits_cascade_source, benefits_context_href } from "@shared/benefits-cascade-reference";
import { benefits_directory_href } from "./BenefitsResourceSections";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Benefits_case_actions({ case_id, state_code }: { case_id: number | null; state_code?: string | null }) {
  return <Card><CardHeader><CardTitle className="text-sm">Keep your work together</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm">{case_id ? `Case ${case_id} is selected. Use “Track This Program or Resource” on a program to save an application record for this case.` : "Choose or start a case to save these results."}</p>
    <div className="flex flex-wrap gap-3 text-sm">
      <Link href={case_id ? `/cases/${case_id}/control-room` : "/cases"} className="underline">{case_id ? "Open selected case" : "Choose or start a case"}</Link>
      <Link href={benefits_context_href("/resolve", case_id, state_code)} className="underline">Open Case Resolution</Link>
      <Link href={benefits_context_href("/guided-intake", case_id, state_code)} className="underline">Open Guided Intake</Link>
    </div>
  </CardContent></Card>;
}

export function Benefits_cascade_navigator({ case_id, state_code, on_benefit_search, initial_scenario_id = null }: {
  case_id: number | null;
  state_code: string | null;
  on_benefit_search: (query: string, resource_query: string) => void;
  initial_scenario_id?: string | null;
}) {
  const [scenario_id, set_scenario_id] = useState<string | null>(initial_scenario_id);
  const selected = benefits_cascade_references.find(s => s.scenario_id === scenario_id);
  return <Card><CardHeader><CardTitle className="text-sm">Help with connected problems</CardTitle>
    <p className="text-xs text-muted-foreground">Open any relevant need at the same time. These are independent starting points; completing one is not required to open another.</p>
  </CardHeader><CardContent className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{benefits_cascade_references.map(scenario =>
      <Button key={scenario.scenario_id} variant={scenario_id === scenario.scenario_id ? "default" : "outline"}
        className="h-auto py-3 whitespace-normal justify-start" aria-pressed={scenario_id === scenario.scenario_id}
        onClick={() => set_scenario_id(scenario.scenario_id)}>{scenario.title}</Button>)}</div>
    {selected && <section aria-label={selected.title} className="space-y-3">
      <p className="text-sm">Related areas: {selected.cross_stage_topics.join(" · ")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{selected.stages.map(stage => <article key={stage.stage_id} data-stage-id={stage.stage_id} className="rounded border p-3 space-y-2">
        <h3 className="text-sm font-medium">{stage.label}</h3>
        <p className="text-xs text-muted-foreground">Questions to review: {stage.review_topics.join("; ")}.</p>
        <Link href={benefits_directory_href("", state_code, stage.resource_search)} className="block text-sm underline">Find related resources{state_code ? ` in ${state_code}` : ""}</Link>
        {stage.benefit_search && <Button size="sm" variant="outline" onClick={() => on_benefit_search(stage.benefit_search!, stage.resource_search)}>Check related programs</Button>}
        {stage.claim_references?.map(reference => <Link key={reference.source_claim_id}
          href={benefits_context_href(`/resolve?claim_type=${encodeURIComponent(reference.claim_type)}`, case_id, state_code)}
          className="block text-xs underline">{reference.label} ({reference.source_claim_id})</Link>)}
        {stage.claim_references?.length ? <p className="text-xs text-muted-foreground">Related claim topics for review; applicability has not been established.</p> : null}
        <p className="text-xs text-muted-foreground">Source placement: {stage.source_paragraphs}</p>
      </article>)}</div>
      <Link href={benefits_context_href("/resolve", case_id, state_code)} className="inline-block text-sm underline">{case_id ? "Review claims, evidence and next actions for the selected case" : "Open claims, evidence and next actions"}</Link>
    </section>}
    <details className="text-xs text-muted-foreground"><summary>About this source map</summary>
      <p className="mt-2">These four scenarios were mapped from the supplied Benefits Cascade document. They do not decide eligibility, establish a legal violation, or calculate a filing deadline. Confirm the rules for your jurisdiction and circumstances.</p>
      <p>{benefits_cascade_source.note}</p>
      <p>{benefits_cascade_source.filename} · placement reviewed {benefits_cascade_source.review_date}</p>
      <code className="break-all">{benefits_cascade_source.sha256}</code>
    </details>
  </CardContent></Card>;
}
