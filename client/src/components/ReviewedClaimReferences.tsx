import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Shared source references: they do not determine a person's legal rights. */
export function Reviewed_claim_references({ mode }: { mode: "claims" | "proof" | "barriers" }) {
  const catalog_query = trpc.dualLens.get_reference_catalog.useQuery();
  const [search, set_search] = useState("");
  if (catalog_query.isLoading) return <p>Reading source catalog references…</p>;
  if (catalog_query.error) return <p role="alert">Source references could not be read. <Button onClick={() => void catalog_query.refetch()}>Retry</Button></p>;
  const catalog = catalog_query.data;
  if (!catalog) return null;
  const term = search.trim().toLowerCase();
  const claims = catalog.claims.filter(row => `${row.source_claim_id} ${row.canonical_name} ${row.domain}`.toLowerCase().includes(term));
  const barriers = catalog.barriers.filter(row => `${row.barrier_id} ${row.name} ${row.description}`.toLowerCase().includes(term));
  return <Card className="my-6">
    <CardHeader><CardTitle>Source catalog references</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">These {mode === "barriers" ? "ten barrier definitions" : "27 claim definitions"} were individually linked to the supplied Claim Catalog. Their legal assertions require verification, and applicability to a case has not been assessed.</p>
      <p className="text-xs text-muted-foreground">{catalog.source.filename} · SHA-256 {catalog.source.sha256}</p>
      <label className="block text-sm">Find a source reference<input className="block w-full rounded border bg-background p-2 mt-1" value={search} onChange={event => set_search(event.target.value)} /></label>
      {mode === "barriers" ? barriers.map(row => <details key={row.barrier_id} className="rounded border p-3">
        <summary className="cursor-pointer font-medium">{row.barrier_id} — {row.name}</summary>
        <p className="text-sm mt-2">Source description: {row.description}</p>
        <p className="text-sm mt-2">Source impact statement (unverified): {row.impact_reference.text}</p>
        <p className="text-sm mt-2">Source mitigation statement (unverified): {row.mitigation_reference.text}</p>
        <p className="font-medium mt-2">Questions to resolve</p>
        <ul className="list-disc pl-5 text-sm">{row.applicability_questions.map(question => <li key={question}>{question}</li>)}</ul>
        <div className="flex flex-wrap gap-3 mt-2">{row.related_claims.map(claim => <a key={claim.claim_type} className="underline text-sm" href={`/resolve?claim_type=${encodeURIComponent(claim.claim_type)}`}>{claim.source_claim_id}: {claim.canonical_name}</a>)}</div>
        <p className="text-xs mt-2">Source paragraphs {row.source_spans.map(span => `${span.paragraph_start}–${span.paragraph_end}`).join(", ")} · Related topic; no case conclusion.</p>
      </details>) : claims.map(row => <details key={row.claim_type_id} className="rounded border p-3">
        <summary className="cursor-pointer font-medium">{row.source_claim_id} — {row.canonical_name}</summary>
        <p className="text-xs my-2">Existing claim catalog ID {row.existing_claim_catalog_id} · Source paragraphs {row.source_span.paragraph_start}–{row.source_span.paragraph_end}</p>
        <p className="font-medium">Source elements (unverified)</p>
        <ol className="list-decimal pl-5 text-sm">{row.elements.map(element => <li key={element.paragraph_start}>{element.text} <span className="text-muted-foreground">(P{element.paragraph_start})</span></li>)}</ol>
        <p className="text-sm mt-2">Source proof framework: {row.proof_reference.text}</p>
        <p className="text-sm mt-2">Source agency context: {row.agency_reference.text}</p>
        <p className="text-sm mt-2">Source intersections: {row.intersections_reference.text}</p>
        <a className="inline-block underline mt-3 text-sm" href={`/resolve?claim_type=${encodeURIComponent(row.claim_type_id)}`}>Follow this claim through proof and barrier references</a>
      </details>)}
      {(mode === "barriers" ? barriers : claims).length === 0 && <p>No source references match this search.</p>}
      <details><summary className="cursor-pointer">Unresolved source issues ({catalog.review_issues.length})</summary><ul className="list-disc pl-5 text-sm">{catalog.review_issues.map(issue => <li key={issue.issue_id}>{issue.reason} (P{issue.paragraphs.join(", P")})</li>)}</ul></details>
    </CardContent>
  </Card>;
}
